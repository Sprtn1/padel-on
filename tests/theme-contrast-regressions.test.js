import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Theme contrast corrections load after all site and dark-module CSS',()=>{
 const bootstrap=read('bootstrap.js');
 assert.ok(bootstrap.includes('styles/theme-dark.css'));
 assert.ok(bootstrap.indexOf('styles/theme-contrast-fixes.css')>bootstrap.indexOf('styles/theme-dark.css'));
});
test('Hour labels never inherit the light-mode background in the dark scheduler',()=>{
 const source=read('styles/court-scheduler.css'),fixes=read('styles/theme-contrast-fixes.css');
 assert.match(source,/\.cafe-scheduler \.cafe-timeboard-hour\{background:#f5f7f8/);
 assert.match(fixes,/html\[data-theme="dark"\] \.cafe-scheduler \.cafe-timeboard-hour/);
 assert.match(fixes,/background-color:#1c2e37;color:#d9f0e4/);
 assert.match(fixes,/html\[data-theme="light"\] \.cafe-scheduler \.cafe-timeboard-hour/);
 assert.match(fixes,/\.cafe-scheduler \.cafe-timeboard-axis/);
 assert.match(fixes,/\.cafe-scheduler \.cafe-timeboard-court/);
});
test('Daily ledger and Padel court amount badges have distinct colors in both modes',()=>{
 const fixes=read('styles/theme-contrast-fixes.css');
 for(const selector of ['.cafe-datebar','.cafe-datebar strong','.cafe-date-actions input',
  '.cafe-category-top>strong','.cafe-entry-form','.cafe-input-label input','.cafe-summary article']){
  assert.ok(fixes.includes(selector),'Missing '+selector);
 }
 assert.match(fixes,/html\[data-theme="light"\] \.workspace\[data-page="cafeteria-finances"\] \.cafe-category-top>strong/);
 assert.match(fixes,/background:#164735;color:#aff9c6/);
 assert.match(fixes,/background:#e7f7ed;color:#07583e/);
});
test('Extra dark contrast coverage spans all business areas without changing backend logic',()=>{
 const fixes=read('styles/theme-contrast-fixes.css');
 const modules=['.whish-balance-card','.shift-pending','.private-balance-box.negative',
  '.debt-total.cleared','.management-alert','.order-result','.cafe-datebar',
  '.tm-winner','.tm-v2-fixture','.tm-payment-table-scroll thead th',
  '.ctodo-completed','.inv-history-row td','.cafe-editor-context span',
  '.cafe-scheduler-warning'];
 for(const name of modules)assert.ok(fixes.includes(name),'Missing '+name);
 assert.doesNotMatch(fixes,/^(?:\s*)(?:CREATE TABLE|ALTER TABLE|DROP TABLE)/mi);
});
test('Browser visual audit is credential-free and validates light→dark→light restoration',()=>{
 const script=read('scripts/theme-contrast-browser.mjs');
 assert.match(script,/readFileSync\(join\(root,'tests\/theme-contrast-fixture\.html'\)/);
 assert.match(script,/for\(const theme of \['light','dark','light'\]\)/);
 assert.match(script,/for\(const width of \[390,1366\]\)/);
 assert.match(script,/getComputedStyle/);
 assert.match(script,/contrast:ratio/);
 assert.doesNotMatch(script,/PADEL_ON_SMOKE_PASSWORD|\.rpc\(|supabase|http[s]?:\/\//i);
});
