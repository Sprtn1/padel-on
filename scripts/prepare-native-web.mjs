// Stage only public, browser-executable application assets for Capacitor.
// Never copy Supabase migrations, private exports, credentials, or test fixtures.
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
import {cp,copyFile,mkdir,rm,stat} from 'node:fs/promises';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const PUBLIC_FILES=Object.freeze(['index.html','app.js','styles.css','config.js']);
const PUBLIC_DIRECTORIES=Object.freeze(['assets','lib']);

export async function prepareNativeWeb(outDir=join(ROOT,'packaging','mobile','www')){
 const destination=resolve(outDir);
 if(destination===ROOT||ROOT.startsWith(destination+'/'))throw Error('Refusing to overwrite project directory');
 await rm(destination,{recursive:true,force:true});
 await mkdir(destination,{recursive:true});
 for(const file of PUBLIC_FILES){
  const input=join(ROOT,file);
  if(!(await stat(input)).isFile())throw Error('Required public file is missing: '+file);
  await copyFile(input,join(destination,file));
 }
 for(const directory of PUBLIC_DIRECTORIES)
  await cp(join(ROOT,directory),join(destination,directory),{recursive:true});
 return destination;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=await prepareNativeWeb();
 process.stdout.write('Packaged public Padel On frontend: '+output+'\n');
}
