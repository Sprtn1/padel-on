import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderNavigation,MOBILE_NAV_LABELS,tabs} from '../lib/navigation.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('CSP disallows inline scripts and permits only the specific Supabase API',()=>{
 const html=read('../index.html');
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/script-src 'self';/);
 assert.match(html,/connect-src 'self' https:\/\/qonscbdbawmvhcdfcvlo\.supabase\.co;/);
 assert.doesNotMatch(html,/script-src[^;]*unsafe-inline/);
 assert.doesNotMatch(html,/<script\s+type="module">/);
 assert.match(html,/src="\.\/bootstrap\.js"/);
});
test('Bootstrap version-loads both stylesheets and the app from same origin',()=>{
 const boot=read('../bootstrap.js');
 assert.match(boot,/\.\/styles\.css/);
 assert.match(boot,/\.\/styles\/tournament\.css/);
 assert.match(boot,/\.\/app\.js\?v=/);
 assert.match(read('../styles/tournament.css'),/\.tm-bracket/);
 assert.doesNotMatch(read('../styles.css'),/Tournament Management — responsive fixture cards/);
});
test('Mobile labels distinguish cafeteria finances and debts',()=>{
 assert.equal(MOBILE_NAV_LABELS['cafeteria-finances'],'Finances');
 assert.equal(MOBILE_NAV_LABELS.debts,'Debts');
 assert.equal(tabs.length,14);
 const html=renderNavigation('debts',()=>'<svg></svg>',true);
 assert.match(html,/aria-label="Cafeteria Finances"[^>]*><svg><\/svg><span>Finances<\/span>/);
 assert.match(html,/aria-label="Cafeteria Debts"[^>]*><svg><\/svg><span>Debts<\/span>/);
 assert.match(html,/data-tab="debts"[^>]*aria-current="page"/);
 assert.doesNotMatch(html,/data-tab="settings"/);
});

test('Authenticated browser test never submits credentials to a user-selected website',()=>{
 const smoke=read('../scripts/authenticated-browser-smoke.mjs');
 assert.match(smoke,/const site='https:\/\/padelon\.publicvm\.com';/);
 assert.match(smoke,/Unexpected login origin; refusing to enter test credentials/);
 assert.doesNotMatch(smoke,/PADEL_ON_BASE_URL/);
});

test('Admin-only Cafeteria Payments nav appears in both layouts and never in staff navigation',()=>{
 const markup=(mobile,admin)=>renderNavigation('cafeteria-payments',()=>'<svg></svg>',mobile,admin);
 assert.doesNotMatch(markup(false,false),/Cafeteria Payments/);
 assert.doesNotMatch(markup(true,false),/Cafeteria Payments/);
 for(const mobile of [false,true]){
  const html=markup(mobile,true);
  assert.match(html,/aria-label="Cafeteria Payments & To Do List"/);
  const finances=html.indexOf('data-tab="cafeteria-finances"'),payments=html.indexOf('data-tab="cafeteria-payments"'),debts=html.indexOf('data-tab="debts"');
  assert.ok(finances>=0&&payments>finances&&debts>payments);
 }
 assert.equal(MOBILE_NAV_LABELS['cafeteria-payments'],'Payments & To Do');
});

test('Renamed admin destination retains its original tab id and ordering',()=>{
 const entry=tabs.find(([id])=>id==='cafeteria-payments');
 assert.equal(entry?.[1],'Cafeteria Payments & To Do List');
 assert.equal(tabs.filter(([id])=>id==='cafeteria-payments').length,1);
});

test('Consignment Inventory is immediately below Cafeteria Debts for staff and admins',()=>{
 const order=tabs.map(([key])=>key);
 assert.equal(order[order.indexOf('debts')+1],'consignment');
 assert.equal(MOBILE_NAV_LABELS.consignment,'Consignment');
 for(const mobile of [true,false]){
  for(const admin of [true,false]){
   const html=renderNavigation('consignment',()=>'<svg></svg>',mobile,admin);
   assert.match(html,/data-tab="consignment"[^>]*aria-label="Consignment Inventory"/);
   assert.ok(html.indexOf('data-tab="consignment"')>html.indexOf('data-tab="debts"'));
  }
 }
});
