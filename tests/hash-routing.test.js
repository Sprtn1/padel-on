import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tabs} from '../lib/navigation.js';
import {PAGE_HASHES,hashForTab,tabFromHash,canAccessTab,resolveTabFromHash} from '../lib/hash-routing.js';

const app=()=>readFileSync(new URL('../app.js',import.meta.url),'utf8');
test('Each sidebar page has one unique canonical URL, including staff tools',()=>{
 const observed=new Set();
 for(const [tab] of tabs){
  const hash=hashForTab(tab);
  assert.equal(tabFromHash(hash),tab);
  assert.ok(!observed.has(hash),'Repeated URL '+hash);
  observed.add(hash);
 }
 for(const tab of ['order-counter','reem-items'])
  assert.equal(tabFromHash(hashForTab(tab)),tab);
 assert.equal(Object.keys(PAGE_HASHES).length,tabs.length+2);
 assert.equal(hashForTab('dashboard'),'#overview');
 assert.equal(hashForTab('cafeteria-finances'),'#cafeteria-finances');
 assert.equal(hashForTab('private-clients'),'#private-clients');
 assert.equal(hashForTab('debts'),'#debts');
 assert.equal(hashForTab('consignment'),'#consignment');
 assert.equal(hashForTab('finance'),'#matchmaking');
});
test('Internal IDs and friendly aliases resolve to supported pages',()=>{
 const aliases={
  '#dashboard':'dashboard','#cafeteria-debts':'debts','#private-sessions':'private-clients',
  '#team-members':'team','#monthly-training':'training','#other-benefits':'other',
  '#finance':'finance','#tournaments':'tournament','#tournament-management':'tournament',
  '#game-activity':'activity'
 };
 for(const [hash,tab] of Object.entries(aliases))assert.equal(tabFromHash(hash),tab);
 assert.equal(tabFromHash('#OVERVIEW'),'dashboard');
});
test('Admin-only routes remain unavailable to staff and unauthorized viewers',()=>{
 assert.equal(canAccessTab('cafeteria-payments','admin'),true);
 assert.equal(canAccessTab('cafeteria-payments','staff'),false);
 assert.equal(resolveTabFromHash('#cafeteria-payments','staff'),'dashboard');
 assert.equal(resolveTabFromHash('#cafeteria-payments','admin'),'cafeteria-payments');
 assert.equal(resolveTabFromHash('#cafeteria-payments',null),'dashboard');
 for(const tab of ['dashboard','consignment','order-counter','reem-items','settings'])
  assert.equal(canAccessTab(tab,'staff'),true);
 assert.equal(canAccessTab('unknown','admin'),false);
 assert.equal(canAccessTab('dashboard',null),false);
});
test('Unknown and crafted hash routes cannot enter arbitrary pages',()=>{
 for(const hash of ['', '#', '#not-a-tab', '#<script>', '#/admin',
   '#cafeteria-payments?token=123', '#%2Fsettings', '#__proto__',
   '#constructor', '#toString']){
  assert.equal(resolveTabFromHash(hash,'staff'),'dashboard',hash);
 }
 assert.equal(hashForTab('unknown'),'#overview');
});
test('App uses pushState for clicks and hash/popstate for browser history',()=>{
 const code=app();
 assert.match(code,/window\.history\[replace\?'replaceState':'pushState'\]\(null,'',hash\)/);
 assert.match(code,/window\.addEventListener\('popstate'/);
 assert.match(code,/window\.addEventListener\('hashchange'/);
 assert.match(code,/async function applyLocationRoute\(\)/);
 assert.match(code,/async function navigateToTab\(tab\)/);
 assert.match(code,/await navigateToTab\(tab\.dataset\.tab\)/);
 assert.match(code,/if\(tab!==state\.tab\)await navigateToTab\(tab\)/);
 assert.doesNotMatch(code,/window\.location\.reload\(/);
});
test('Deep links survive login and forbidden links normalize without business changes',()=>{
 const code=app();
 assert.match(code,/if\(resetTab\|\|!routeInitialized\)/);
 assert.match(code,/resolveTabFromHash\(window\.location\.hash,state\.staff\?\.role\)/);
 assert.match(code,/syncBrowserRoute\(state\.tab,\{replace:true\}\)/);
 assert.match(code,/if\(state\.staff&&!canAccessTab\(state\.tab,state\.staff\.role\)\)state\.tab='dashboard'/);
 assert.match(code,/if\(routeInitialized&&state\.staff\)\{syncBrowserRoute\(state\.tab\)/);
 assert.match(code,/document\.title='PADEL ON · '\+titleFor\(\)/);
 assert.match(code,/routeInitialized=false/);
 assert.match(code,/data-action="sidebar-toggle"/);
 assert.match(code,/const cafeteriaFinances=cafeteriaFinanceModule\.createCafeteriaFinances/);
 assert.match(code,/await Promise\.all\(\[cafeteriaFinances\.load\(true\),shiftHandover\.load\(cafeteriaFinances\.getDate\(\)\)\]\)/);
});
