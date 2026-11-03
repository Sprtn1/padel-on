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
 assert.equal(tabs.length,12);
 const html=renderNavigation('debts',()=>'<svg></svg>',true);
 assert.match(html,/aria-label="Cafeteria Finances"[^>]*><svg><\/svg><span>Finances<\/span>/);
 assert.match(html,/aria-label="Cafeteria Debts"[^>]*><svg><\/svg><span>Debts<\/span>/);
 assert.match(html,/data-tab="debts"[^>]*aria-current="page"/);
 assert.doesNotMatch(html,/data-tab="settings"/);
});
