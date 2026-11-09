/**
 * Padel On logical database snapshots for a private Google Drive folder.
 * Each dated folder contains encrypted independent database and audit-log dumps.
 * Runs only on a protected GitHub Actions runner with credentials in Secrets.
 */
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,chmodSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const REMOTE='padelon:';
const MAIN='database.dump.gpg';
const AUDIT='audit_logs.dump.gpg';
const SET_RE=/^padelon-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z$/;
export const shouldPruneAudit=(date,enabled)=>String(enabled).toLowerCase()==='true' &&
 new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Beirut',weekday:'short'}).format(date)==='Mon';
const SQL_OLD_AUDIT="happened_at < (date_trunc('week', now() AT TIME ZONE 'Asia/Beirut') AT TIME ZONE 'Asia/Beirut')";

/** Only exact Padel On snapshot folders are eligible for automatic rotation. */
export function planBackupRetention(folders, keep=3){
 if(!Number.isInteger(keep)||keep<1)throw new Error('Invalid backup retention count.');
 const valid=folders.filter(x=>SET_RE.test(x.name));
 const completed=valid.filter(x=>x.files.includes(MAIN)&&x.files.includes(AUDIT))
   .sort((a,b)=>b.name.localeCompare(a.name));
 const incomplete=valid.filter(x=>!x.files.includes(MAIN)||!x.files.includes(AUDIT));
 return {keep:completed.slice(0,keep).map(x=>x.name),remove:[...completed.slice(keep),...incomplete].map(x=>x.name)};
}

function run(command,args,options={}){
 const r=spawnSync(command,args,{encoding:'utf8',maxBuffer:8*1024*1024,...options});
 if(r.error)throw new Error(`${command} could not start: ${r.error.message}`);
 if(r.status!==0){
  const error=(r.stderr||r.stdout||'').slice(-3000);
  throw new Error(`${command} exited ${r.status}: ${error}`);
 }
 return (r.stdout||'').trim();
}
function hashFile(file,algorithm='md5'){
 return createHash(algorithm).update(readFileSync(file)).digest('hex');
}
function dockerPostgres(workDir,script,sql=null){
 const env={...process.env};
 if(sql!==null)env.BACKUP_SQL=sql;
 const args=['run','--rm','--volume',`${workDir}:/backup`,'-e','SUPABASE_DB_URL'];
 if(sql!==null)args.push('-e','BACKUP_SQL');
 args.push('postgres:17','sh','-ec',script);
 return run('docker',args,{env});
}
function dumpDatabase(workDir){
 dockerPostgres(workDir,
  'pg_dump --dbname="$SUPABASE_DB_URL" --no-owner --no-acl --format=custom --compress=6 --exclude-table-data=public.audit_logs --file=/backup/database.dump');
 dockerPostgres(workDir,
  'pg_dump --dbname="$SUPABASE_DB_URL" --no-owner --no-acl --format=custom --compress=6 --data-only --table=public.audit_logs --file=/backup/audit_logs.dump');
 const mainList=dockerPostgres(workDir,'pg_restore --list /backup/database.dump');
 const auditList=dockerPostgres(workDir,'pg_restore --list /backup/audit_logs.dump');
 if(!/\bTABLE\s+public\s+audit_logs\b/.test(mainList))
  throw Error('Main dump does not contain the audit_logs table schema.');
 if(/\bTABLE DATA\s+public\s+audit_logs\b/.test(mainList))
  throw Error('Main dump incorrectly contains audit_logs records.');
 if(!/\bTABLE DATA\s+public\s+audit_logs\b/.test(auditList))
  throw Error('Separate audit dump does not contain audit_logs records.');
 if(statSync(join(workDir,'database.dump')).size<512 || statSync(join(workDir,'audit_logs.dump')).size<128)
  throw Error('One of the database dumps is unexpectedly empty.');
}
function queryAudit(workDir,query){
 return dockerPostgres(workDir,
  'psql --dbname="$SUPABASE_DB_URL" --no-psqlrc -X -A -t -v ON_ERROR_STOP=1 -c "$BACKUP_SQL"',query);
}
function oldAuditSignature(workDir){
 const q=`SELECT count(*)::text || ':' || coalesce(md5(string_agg(id::text, ',' ORDER BY id)),md5('')) FROM public.audit_logs WHERE ${SQL_OLD_AUDIT}`;
 const result=queryAudit(workDir,q);
 if(!/^\d+:[a-f0-9]{32}$/.test(result))throw Error('Could not verify old audit-log record signature.');
 return result;
}
function cleanOldAuditRows(workDir,expected){
 if(!/^\d+:[a-f0-9]{32}$/.test(expected))throw Error('Invalid audit-log signature.');
 if(Number(expected.split(':')[0])===0){console.log('Weekly audit cleanup: no prior-week entries to remove.');return;}
 const q=`BEGIN;
 SET LOCAL lock_timeout='6s';
 SET LOCAL statement_timeout='90s';
 LOCK TABLE public.audit_logs IN SHARE ROW EXCLUSIVE MODE;
 DO $plpgsql$ BEGIN
   IF (SELECT count(*)::text || ':' || coalesce(md5(string_agg(id::text, ',' ORDER BY id)),md5('')) FROM public.audit_logs WHERE ${SQL_OLD_AUDIT}) <> '${expected}' THEN
    RAISE EXCEPTION 'Audit rows changed since verified backup; cleanup aborted';
   END IF;
 END $plpgsql$;
 DELETE FROM public.audit_logs WHERE ${SQL_OLD_AUDIT};
 COMMIT;`;
 queryAudit(workDir,q);
 console.log(`Weekly audit cleanup: removed ${expected.split(':')[0]} archived prior-week records.`);
 // VACUUM reuses freed space in Postgres. It is not a physical DB shrink guarantee.
 queryAudit(workDir,'VACUUM (ANALYZE) public.audit_logs;');
}
function encrypt(workDir,passFile,src,dest){
 const source=join(workDir,src),output=join(workDir,dest);
 run('gpg',['--batch','--yes','--pinentry-mode','loopback','--no-tty','--passphrase-file',passFile,
   '--cipher-algo','AES256','--symmetric','--output',output,source]);
 const roundTrip=join(workDir,src+'.verified');
 run('gpg',['--batch','--yes','--pinentry-mode','loopback','--no-tty','--passphrase-file',passFile,
   '--decrypt','--output',roundTrip,output]);
 if(hashFile(source,'sha256')!==hashFile(roundTrip,'sha256'))
  throw Error('Encrypted backup could not be decrypted exactly.');
 rmSync(roundTrip);
 return output;
}
function rclone(config,folderId,args){
 return run('rclone',['--config',config,'--drive-root-folder-id',folderId,...args]);
}
function verifyRemoteFile(config,folderId,local,remote){
 const localHash=hashFile(local,'md5');
 const remoteMd5=rclone(config,folderId,['md5sum',remote]).split(/\s+/)[0];
 if(!/^[a-f0-9]{32}$/.test(remoteMd5)||remoteMd5!==localHash)
  throw Error('Google Drive MD5 integrity check failed for '+remote.split('/').at(-1));
}
function rotate(config,folderId){
 const names=rclone(config,folderId,['lsf','--dirs-only',REMOTE]).split('\n').filter(Boolean)
  .map(x=>x.replace(/\/$/,''));
 const sets=names.filter(x=>SET_RE.test(x)).map(name=>({
  name,files:rclone(config,folderId,['lsf','--files-only',REMOTE+name]).split('\n').filter(Boolean)
 }));
 const plan=planBackupRetention(sets,3);
 if(!plan.keep.length)throw Error('Refusing rotation: no complete Drive backup sets found.');
 for(const name of plan.remove){
  // Strictly restrict destructive Drive operations to this tool's own dated folders.
  if(!SET_RE.test(name)||plan.keep.includes(name))throw Error('Unsafe backup cleanup target.');
  rclone(config,folderId,['purge',REMOTE+name]);
 }
 console.log(`Drive retention: ${plan.keep.length} complete set(s) retained, ${plan.remove.length} older/incomplete set(s) removed.`);
}

async function main(){
 const required=['SUPABASE_DB_URL','GDRIVE_RCLONE_CONFIG','PADELON_BACKUP_PASSPHRASE','DRIVE_FOLDER_ID'];
 for(const key of required)if(!process.env[key])throw Error(`Required GitHub Secret/variable ${key} is missing.`);
 const now=new Date();
 const stamp='padelon-'+now.toISOString().replace(/[:.]/g,'-').replace(/-\d{3}Z$/,'Z');
 if(!SET_RE.test(stamp))throw Error('Invalid backup folder stamp.');
 const dir=mkdtempSync(join(tmpdir(),'padelon-backup-'));
 const config=join(dir,'rclone.conf'),passFile=join(dir,'passphrase');
 try{
  writeFileSync(config,process.env.GDRIVE_RCLONE_CONFIG,{mode:0o600});
  writeFileSync(passFile,process.env.PADELON_BACKUP_PASSPHRASE,{mode:0o600});
  chmodSync(config,0o600);chmodSync(passFile,0o600);
  if(!rclone(config,process.env.DRIVE_FOLDER_ID,['listremotes']).split('\n').includes('padelon:'))
   throw Error('The Drive rclone config must define a remote named [padelon].');
  const isMonday=shouldPruneAudit(now,process.env.ENABLE_AUDIT_PRUNE);
  const signature=isMonday?oldAuditSignature(dir):null;
  dumpDatabase(dir);
  const encryptedMain=encrypt(dir,passFile,'database.dump',MAIN);
  const encryptedAudit=encrypt(dir,passFile,'audit_logs.dump',AUDIT);
  const folder=REMOTE+stamp+'/';
  for(const [file,name] of [[encryptedMain,MAIN],[encryptedAudit,AUDIT]]){
   const remoteFile=folder+name;
   rclone(config,process.env.DRIVE_FOLDER_ID,['copyto',file,remoteFile,'--retries','3','--low-level-retries','5']);
   verifyRemoteFile(config,process.env.DRIVE_FOLDER_ID,file,remoteFile);
  }
  console.log('Uploaded and verified two separate encrypted Drive backup files: application database and audit logs.');
  // Only a successful, verified remote backup is allowed to trigger pruning.
  if(isMonday)cleanOldAuditRows(dir,signature);
  else console.log('Audit cleanup skipped (only runs Monday with ENABLE_AUDIT_PRUNE=true).');
  rotate(config,process.env.DRIVE_FOLDER_ID);
  console.log(`Complete snapshot folder: ${stamp}`);
 }finally{
  rmSync(dir,{recursive:true,force:true});
 }
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
 main().catch(err=>{console.error('Backup failed safely: '+err.message);process.exitCode=1;});
}
