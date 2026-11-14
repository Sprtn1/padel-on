import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {cafeReconciliation} from '../lib/cafeteria-finances.js';
import {createCourtScheduler} from '../lib/court-scheduler-ui.js';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Day close uses the same corrected court Cash/Whish movements as the displayed totals',()=>{
 const entries=[
  {category:'padel_courts',amount_cents:35500},
  {category:'classes',amount_cents:13000},
  {category:'gymnastics',amount_cents:4000},
  {category:'grips',amount_cents:2900},
  {category:'balls',amount_cents:1000},
  {category:'clothes',amount_cents:200},
  {category:'racket_rental',amount_cents:600},
  {category:'coaches',amount_cents:11500},
  {category:'family_debt',amount_cents:700},
  {category:'other_expense',amount_cents:10500}
 ];
 const privatePayments=[{amount_cents:8000,payment_channel:'cash'}];
 const movements=[{entry_date:'2026-11-12',cash_delta_cents:-4100}];
 const repaired=cafeReconciliation(entries,42000,privatePayments,movements);
 assert.equal(repaired.income,61100);
 assert.equal(repaired.expenses,22700);
 assert.equal(repaired.totalGenerated,64700);
 assert.equal(repaired.goodsSold,3600);
 assert.equal(cafeReconciliation(entries,42000,privatePayments).goodsSold,-500);
 const code=read('../lib/cafeteria-finances.js');
 assert.match(code,/const latest=cafeReconciliation\(rows,closingCash,privatePayments,courtMovements\)/);
 const migration=read('../supabase/migrations/20261112234000_private_training_and_cash_closing_fix.sql');
 assert.match(migration,/- coalesce\(\(select sum\(cash_delta_cents\) from public\.court_payment_cash_movements/);
});

test('Training selection remains separate from regular Reservations and Block Court',async()=>{
 const day='2026-11-12';
 const planned=[{
  id:'reservation-1',business_date:day,sport:'padel',court_number:'C1',
  booking_start_time:'18:00',booking_end_time:'19:00',duration_minutes:60,
  customer_name:'Sample client',notes:'',status:'confirmed',booking_type:'reservation',
  private_client_id:'client-1',private_session_fee_cents:4500,revision:1
 }];
 const api={
  getSession:()=>({access_token:'session'}),
  listAll:async(table)=>table==='padel_court_reservations'?planned:
   table==='private_clients'?[{id:'client-1',name:'Sample client',active:true}]:
   table==='private_coaches'?[{id:'coach-1',name:'Sample coach',category:'A',active:true}]:[]
 };
 const calendar=createCourtScheduler({
  api,today:()=>day,addDays:()=> '2027-11-12',rerender:()=>{},
  toast:()=>{},onLedgerChanged:async()=>{}
 });
 await calendar.load(true);
 const html=calendar.page();
 assert.match(html,/data-schedule-sport="padel"/);
 assert.match(html,/Private Client Training/);
 assert.match(html,/schedule-training/);
 await calendar.action({dataset:{
  action:'cafe-schedule-open',cafeScheduleSource:'reservation',cafeScheduleId:'reservation-1'
 }});
 const details=calendar.page();
 assert.match(details,/class="ck-detail-drawer"/);
 assert.match(details,/Private Client Training/);
 assert.match(details,/45\.00/);
 await calendar.action({dataset:{action:'cafe-schedule-details-edit'}});
 const editor=calendar.page();
 assert.match(editor,/option value="reservation"/);
 assert.match(editor,/option value="block"/);
 assert.match(editor,/option value="private_training" selected/);
 assert.match(editor,/name="private_client_id"/);
 assert.match(editor,/name="private_session_fee"/);
 assert.match(editor,/45\.00/);
 assert.match(editor,/cafe-scheduler-payment-fieldset" hidden/);
});

test('Private client page shows upcoming bookings, but only a completed session posts a fee',()=>{
 const app=read('../app.js'),calendar=read('../lib/court-scheduler-ui.js');
 assert.match(app,/private_client_id=not\.is\.null/);
 assert.match(app,/function privateScheduledTrainingPanel\(/);
 assert.match(app,/function upcomingPrivateTrainingsPanel\(/);
 assert.match(app,/club_private_training_complete/);
 assert.match(calendar,/club_private_training_save/);
 assert.match(calendar,/isWithoutCourtPayment/);
 const sql=read('../supabase/migrations/20261112234000_private_training_and_cash_closing_fix.sql');
 assert.match(sql,/public\.private_log_entry\(/);
 assert.match(sql,/v_booking\.business_date>\(now\(\) at time zone 'Asia\/Beirut'\)::date/);
 assert.match(sql,/v_booking\.private_session_fee_cents,0,0/);
 assert.match(sql,/private_session_entry_id IS NOT NULL/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.club_private_training_save/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.club_private_training_complete/);
 assert.match(sql,/source_kind='reservation'/);
});


test('Closing a day with a Whish court split no longer falsely reports negative Goods Sold',async()=>{
 const {createCafeteriaFinances}=await import('../lib/cafeteria-finances.js');
 const day='2026-11-12',calls=[];
 const entries=[
  {id:'court-booking',category:'padel_courts',amount_cents:35500,entry_date:day},
  {category:'classes',amount_cents:13000,entry_date:day},
  {category:'gymnastics',amount_cents:4000,entry_date:day},
  {category:'grips',amount_cents:2900,entry_date:day},
  {category:'balls',amount_cents:1000,entry_date:day},
  {category:'clothes',amount_cents:200,entry_date:day},
  {category:'racket_rental',amount_cents:600,entry_date:day},
  {category:'coaches',amount_cents:11500,entry_date:day},
  {category:'family_debt',amount_cents:700,entry_date:day},
  {category:'other_expense',amount_cents:10500,entry_date:day}
 ];
 const api={
  getSession:()=>({access_token:'staff'}),
  listAll:async table=>{
   if(table==='cafeteria_finance_entries')return entries;
   if(table==='cafeteria_finance_days')return [{day_date:day,closing_cash_cents:42000}];
   if(table==='private_clients')return [{id:'client',name:'Client',active:true}];
   if(table==='private_ledger_entries')return [{id:'deposit',client_id:'client',entry_date:day,entry_type:'deposit',deposit_cents:8000,payment_channel:'cash',created_at:day+'T01:00:00Z'}];
   if(table==='court_payment_splits')return [{id:'split',source_kind:'ledger',source_id:'court-booking',payment_date:day,amount_cents:35500,cash_cents:31400,whish_cents:4100,unpaid_cents:0}];
   if(table==='court_payment_cash_movements')return [{split_id:'split',entry_date:day,cash_delta_cents:-4100}];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  },
  rpc:async(name,args)=>calls.push({name,args})
 };
 const finance=createCafeteriaFinances({
  api,today:()=>day,addDays:()=>day,heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await finance.load();
 const html=finance.page();
 assert.match(html,/Close day for review/);
 assert.doesNotMatch(html,/data-action="cafe-day-close" disabled/);
 await finance.action({dataset:{action:'cafe-day-close'}});
 assert.equal(calls.filter(x=>x.name==='cafeteria_change_day_status').length,1);
 assert.equal(calls.at(-1).args.p_action,'close');
});

test('Affected JavaScript parses without changing existing financial and scheduler APIs',()=>{
 for(const path of ['app.js','lib/cafeteria-finances.js','lib/court-scheduler-ui.js']){
  const res=spawnSync(process.execPath,['--check',new URL('../'+path,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(res.status,0,path+': '+res.stderr);
 }
});
