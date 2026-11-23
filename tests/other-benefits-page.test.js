import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const migration=readFileSync(new URL('../supabase/migrations/20261123180000_other_benefits_management.sql',import.meta.url),'utf8');
test('app.js remains parseable after Other Benefits redesign',()=>{
 assert.doesNotThrow(()=>execFileSync(process.execPath,['--check','app.js'],{cwd:new URL('..',import.meta.url)}));
});
test('redesign has search, filters, history and role-scoped editing',()=>{
 const body=app.slice(app.indexOf('function otherPage(){'),app.indexOf('function debtPersonTransactions('));
 assert.match(body,/otherBenefitsView\(/);
 assert.match(body,/other-search/);
 assert.match(body,/other-filter/);
 assert.match(body,/other-sort/);
 assert.match(body,/openOtherHistory/);
 assert.match(body,/role==='admin'/);
 assert.doesNotMatch(body,/source_reservation_id|cafe-|court-timetable|cafeteria/);
});
test('database migration retains staff check, weekly and alternating behavior',()=>{
 assert.match(migration,/if not public\.is_staff\(\)/);
 assert.match(migration,/v_status='one_free_per_week'/);
 assert.match(migration,/v_status='alternating_free_paid'/);
 assert.match(migration,/v_player\.threshold/);
 assert.match(migration,/v_status:='counting'/);
 assert.match(migration,/v_counter:=0/);
 assert.doesNotMatch(migration,/slug='rami-al-rifai'/);
 assert.doesNotMatch(migration,/court_reservations|cafeteria_finances|payment_splits/);
});
