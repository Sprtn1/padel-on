import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,readdirSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareNativeWeb} from '../scripts/prepare-native-web.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const file=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');

test('Native web bundle includes application assets but not SQL, tests or private files',async()=>{
 const temp=mkdtempSync(join(tmpdir(),'padelon-mobile-test-'));
 try{
  const out=join(temp,'www');
  await prepareNativeWeb(out);
  for(const name of ['index.html','app.js','styles.css','config.js','assets/favicon.svg',
   'lib/api.js','lib/arabic-daily-pdf.js','lib/cafeteria-finances.js'])
   assert.ok(existsSync(join(out,name)),name);
  assert.deepEqual(readdirSync(out).sort(),['app.js','assets','config.js','index.html','lib','styles.css']);
  assert.ok(!existsSync(join(out,'supabase')));
  assert.ok(!existsSync(join(out,'tests')));
 }finally{rmSync(temp,{recursive:true,force:true})}
});

test('Mobile and desktop wrappers preserve trusted origins and safe browser boundaries',()=>{
 const config=JSON.parse(file('packaging/mobile/capacitor.config.json'));
 assert.equal(config.appId,'com.padelon.management');
 assert.equal(config.webDir,'www');
 assert.ok(!config.server?.url,'Mobile ships local files, not a development-only remote URL');
 const windows=file('packaging/windows/main.cjs');
 assert.match(windows,/https:\/\/padelon\.publicvm\.com\//);
 assert.match(windows,/nodeIntegration:false/);
 assert.match(windows,/contextIsolation:true/);
 assert.match(windows,/sandbox:true/);
 assert.match(windows,/webSecurity:true/);
 assert.match(windows,/setWindowOpenHandler/);
 assert.match(windows,/will-navigate/);
 assert.doesNotMatch(windows,/ignore-certificate-errors|disable-web-security|nodeIntegration:true/);
 const workflow=file('.github/workflows/direct-download-apps.yml');
 for(const artifact of ['PadelOn-Android-APK','PadelOn-Windows-EXE','PadelOn-iOS-Xcode-Project'])
  assert.ok(workflow.includes(artifact),artifact);
 assert.match(workflow,/assembleDebug/);
 assert.match(workflow,/CODE_SIGNING_ALLOWED=NO/);
});
