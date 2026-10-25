import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {getDebtDayEntries,summarizeDebtDay} from '../lib/cafeteria-debt-daily.js';

const entries=[
 {id:'one',person_id:'alice',entry_date:'2026-10-24',entry_type:'charge',amount_cents:1250,created_at:'2026-10-24T09:00:00Z'},
 {id:'two',person_id:'bob',entry_date:'2026-10-25',entry_type:'payment',amount_cents:400,created_at:'2026-10-25T12:00:00Z'},
 {id:'three',person_id:'alice',entry_date:'2026-10-25',entry_type:'charge',amount_cents:950,created_at:'2026-10-25T10:00:00Z'},
 {id:'four',person_id:'bob',entry_date:'2026-10-25',entry_type:'charge',amount_cents:10000,created_at:'2026-10-25T13:00:00Z',voided_at:'2026-10-25T14:00:00Z'},
 {id:'five',person_id:'alice',entry_date:'2026-10-25',entry_type:'payment',amount_cents:500,created_at:'2026-10-25T11:00:00Z'}
];

test('Daily debt view combines customers, filters dates, ignores voids and sorts newest first',()=>{
 const original=entries.map(e=>e.id),today=getDebtDayEntries(entries,'2026-10-25');
 assert.deepEqual(today.map(e=>e.id),['two','five','three']);
 assert.deepEqual(today.map(e=>e.person_id),['bob','alice','alice']);
 assert.deepEqual(entries.map(e=>e.id),original,'Original ledger must remain unchanged');
 assert.deepEqual(getDebtDayEntries(entries,'2026-10-24').map(e=>e.id),['one']);
 assert.deepEqual(getDebtDayEntries(entries,'2026-10-20'),[]);
});
test('Daily totals separate charges and payments in cents without counting voids',()=>{
 assert.deepEqual(summarizeDebtDay(getDebtDayEntries(entries,'2026-10-25')),{
  count:3,charges:950,payments:900,net:50
 });
 assert.deepEqual(summarizeDebtDay(getDebtDayEntries(entries,'2026-10-24')),{
  count:1,charges:1250,payments:0,net:1250
 });
 assert.deepEqual(summarizeDebtDay([]),{count:0,charges:0,payments:0,net:0});
});
test('Cafeteria daily panel has date controls, table and retained account history',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(app,/debtDay:todayBeirut\(\)/);
 assert.match(app,/function debtDailyPanel\(\)/);
 assert.match(app,/id="debt-day-date"/);
 for(const action of ['debt-day-prev','debt-day-next','debt-day-today','debt-day-open-account'])assert.ok(app.includes(action));
 assert.match(app,/No cafeteria debt entries recorded for this date/);
 assert.match(app,/const daily=debtDailyPanel\(\)/);
 assert.match(app,/Purchases & payments/);
 assert.match(app,/function debtExport\(\)/);
});
