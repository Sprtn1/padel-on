import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {courtAllocation,courtCashAdjustment,courtSplitDisplay,courtSplitFormFields,courtCashWhishRemainder} from '../lib/court-payment-splits.js';
import {cafeTotals,cafeReconciliation} from '../lib/cafeteria-finances.js';
import {prepareArabicDailySheet} from '../lib/arabic-daily-pdf.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const court=(amount_cents=3200)=>({id:'s1',category:'padel_courts',name:'Test court',
 entry_date:'2026-11-12',amount_cents,checkmarks:[true,true,false,false]});

test('The exact-cent invariant requires Cash + Whish equal price and rejects court debt',()=>{
 assert.deepEqual(courtAllocation(3200,1200,2000),{
  amount_cents:3200,cash_cents:1200,whish_cents:2000,unpaid_cents:0
 });
 for(const [a,b,c,d] of [[3200,1000,1000,1200],[3200,3200,2000,0],[3200,1200,1000,0],[3200,-1,0,3201],[0,0,0,0]]){
  assert.throws(()=>courtAllocation(a,b,c,d),/Cash \+ Whish/);
 }
});
test('Court forms default the full price to Cash and have no Unpaid field',()=>{
 const fields=courtSplitFormFields({total:3200,split:null,legacy:true});
 assert.deepEqual(fields.map(f=>f.name),['total_amount','cash_amount','whish_amount']);
 assert.deepEqual(fields.map(f=>f.value),['32.00','32.00','0.00']);
 assert.deepEqual(courtCashWhishRemainder(3200,1200),{cash_cents:2000,whish_cents:1200});
 assert.deepEqual(courtCashWhishRemainder(3200,2000,'cash'),{cash_cents:2000,whish_cents:1200});
 assert.throws(()=>courtCashWhishRemainder(3200,4500),/price/);
 const olderUnpaid=courtSplitDisplay(2500,{amount_cents:2500,cash_cents:0,
  whish_cents:0,unpaid_cents:2500});
 assert.equal(olderUnpaid.cash_cents,2500);
 assert.equal(olderUnpaid.unpaid_cents,0);
});
test('UI exposes only Cash and Whish, with default Cash on new reservations',()=>{
 const scheduler=read('../lib/court-scheduler-ui.js');
 const finance=read('../lib/cafeteria-finances.js');
 assert.doesNotMatch(scheduler,/\['unpaid_amount','Still unpaid/);
 assert.doesNotMatch(finance,/Unpaid <b>/);
 assert.doesNotMatch(finance,/Remaining unpaid \(\$\)/);
 assert.match(scheduler,/editor\.cash=editor\.fee;editor\.whish=0/);
 assert.match(scheduler,/field\('cash_amount'\)\.value=paymentText\(total-whish\)/);
 assert.match(finance,/field\('cash_amount'\)\.value=\(\(total-whish\)\/100\)\.toFixed\(2\)/);
 assert.match(finance,/p_unpaid_cents:allocation\.unpaid_cents/);
});
test('Current cash-default migration preserves history and enforces no active Unpaid',()=>{
 const sql=read('../supabase/migrations/20261113061500_court_cash_default_without_debt.sql');
 assert.match(sql,/court_split_no_unpaid_active/);
 assert.match(sql,/p_unpaid_cents<>0/);
 assert.match(sql,/court_payment_cash_movements/);
 assert.match(sql,/MIGRATE/);
 assert.match(sql,/d.status IN \('closed','approved'\)/);
 assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.court_payment_split_save/);
});
test('Same-day cancellations reverse the assumed Cash and linked Whish deposit',()=>{
 const sql=read('../supabase/migrations/20261113061500_court_cash_default_without_debt.sql');
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.court_split_guard_reservation\(\)/);
 assert.match(sql,/cash_delta_cents,created_by/);
 assert.match(sql,/VALUES\(v_split\.id,v_today,-v_split\.cash_cents,auth\.uid\(\)\)/);
 assert.match(sql,/source_court_split_id=v_split\.id AND voided_at IS NULL/);
 assert.match(sql,/CANCEL_REVERSE/);
 assert.match(sql,/v_split\.payment_date<>v_today/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.court_split_guard_reservation\(\)/);
});
test('Legacy amounts remain cash-classified until explicitly split',()=>{
 assert.deepEqual(courtSplitDisplay(3200,null,true),{
  amount_cents:3200,cash_cents:3200,whish_cents:0,unpaid_cents:0,legacy:true
 });
 assert.equal(cafeTotals([court()]).income,3200);
 assert.equal(cafeReconciliation([court()],3200).goodsSold,0);
});
test('Cash corrections exclude Whish without changing court fee or player markers',()=>{
 const entry=court(),markers=structuredClone(entry.checkmarks);
 const movement=[{cash_delta_cents:-2000,entry_date:'2026-11-12'}];
 assert.equal(courtCashAdjustment(movement),-2000);
 assert.equal(cafeTotals([entry],[],movement).income,1200);
 assert.equal(cafeReconciliation([entry],1200,[],movement).goodsSold,0);
 assert.equal(entry.amount_cents,3200);
 assert.deepEqual(entry.checkmarks,markers);
});
test('Future reservation prepayments appear on collection day without adding a future finance booking',()=>{
 const money=[{cash_delta_cents:1200,entry_date:'2026-11-12',court_category:'padel_courts'}];
 assert.equal(cafeTotals([],[],money).income,1200);
 assert.equal(cafeReconciliation([],1200,[],money).goodsSold,0);
});
test('Arabic daily sheet reports the cash share under courts, Whish under its own ledger',()=>{
 const sheet=prepareArabicDailySheet({
  date:'2026-11-12',rows:[court()],privatePayments:[],privateSessions:[],
  whishRows:[{entry_date:'2026-11-12',entry_type:'deposit',name:'Padel Courts',amount_cents:2000}],
  whishOpening:60,
  courtMovements:[{entry_date:'2026-11-12',cash_delta_cents:-2000,court_category:'padel_courts'}],
  closingCash:1200
 });
 const padel=sheet.amountRows.find(row=>row[0]==='ملعب بادل');
 assert.equal(padel[1],1200);
 assert.equal(sheet.receipts,1200);
 assert.equal(sheet.whishDepositsToday,2000);
 assert.equal(sheet.goodsSold,0);
 assert.ok(sheet.whishIn.some(row=>row.name==='Padel Courts'&&row.amount_cents===2000));
});
test('Database migration guards staff-only writes, balancing, linked Whish and void corrections',()=>{
 const sql=read('../supabase/migrations/20261112213000_court_payment_channel_splits.sql');
 assert.match(sql,/CHECK \(cash_cents\+whish_cents\+unpaid_cents=amount_cents\)/);
 assert.match(sql,/CREATE POLICY court_payment_splits_staff_read/);
 assert.match(sql,/public\.is_staff\(\)/);
 assert.match(sql,/source_court_split_id uuid UNIQUE/);
 assert.match(sql,/VALUES\(gen_random_uuid\(\),v_date,'deposit','Padel Courts'/);
 assert.match(sql,/CREATE TRIGGER court_split_finance_void_sync/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.cafeteria_handover_snapshot/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.padel_reservation_save_with_split/);
 assert.match(sql,/REVOKE EXECUTE ON FUNCTION public\.court_payment_split_save/);
});
test('UI exposes separate Cash and Whish tables and linked reservation editor',()=>{
 const finance=read('../lib/cafeteria-finances.js');
 const scheduler=read('../lib/court-scheduler-ui.js');
 assert.match(finance,/Cash Court Payments/);
 assert.match(finance,/Whish Court Payments/);
 assert.match(finance,/data-cafe-save="court-payment"/);
 assert.match(finance,/cafeReconciliation\(rows,closingCash,privatePayments,courtMovements\)/);
 assert.match(scheduler,/club_court_reservation_save/);
 assert.match(scheduler,/cafe-schedule-payment-editor/);
 assert.match(scheduler,/Payment breakdown/);
 assert.match(finance,/courtSplits=paymentSplits\.filter\(split=>!split\.voided_at\)/);
});
test('All changed JavaScript modules parse',()=>{
 for(const file of ['bootstrap.js','lib/court-payment-splits.js','lib/cafeteria-finances.js',
  'lib/court-scheduler-ui.js','lib/arabic-daily-pdf.js']){
  const result=spawnSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,file+': '+result.stderr);
 }
});
