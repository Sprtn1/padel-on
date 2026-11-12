import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const paths=['../app.js','../bootstrap.js','../lib/cafeteria-finances.js',
 '../lib/activity-visualizations.js','../lib/court-timetable.js',
 '../scripts/authenticated-browser-smoke.mjs'];
for(const path of paths)test('JavaScript syntax: '+path,()=>{
 const file=fileURLToPath(new URL(path,import.meta.url));
 const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout||'Syntax failed');
});
