import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareArabicDailySheet} from '../lib/arabic-daily-pdf.js';
import {createCafeteriaFinances,WHISH_DESCRIPTION_PRESETS,whishSummary} from '../lib/cafeteria-finances.js';

const day='2026-11-13';
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const whish=(id,name,amount_cents,entry_date=day)=>({
 id,entry_date,entry_type:'deposit',name,amount_cents
});

test('Sport-specific Whish labels translate in the Arabic PDF without altering stored amounts',()=>{
 const entries=[
  whish('b1','Basketball Courts',2300),
  whish('b2','basketball courts',700),
  whish('p1','Pickleball Courts',900),
  whish('p2','pickleball courts',1200),
  whish('pad','Padel Courts',2500),
  whish('goods','Goods Sold',1500),
  whish('manual','Other client',350),
  whish('old','Pickleball Courts',600,'2026-11-12'),
  {...whish('void','Basketball Courts',9999),voided_at:day+'T22:00:00Z'}
 ];
 const opening=60,expected=2300+700+900+1200+2500+1500+350+600;
 const sheet=prepareArabicDailySheet({
  date:day,rows:[],privatePayments:[],privateSessions:[],courtMovements:[],
  whishRows:entries,whishOpening:opening,closingCash:null
 });
 assert.equal(sheet.whishIn.find(r=>r.name==='ملعب Basketball')?.amount_cents,3000);
 assert.equal(sheet.whishIn.find(r=>r.name==='ملعب Pickle')?.amount_cents,2100);
 assert.equal(sheet.whishIn.find(r=>r.name==='Padel Courts')?.amount_cents,2500);
 assert.equal(sheet.whishIn.find(r=>r.name==='مبيع متفرقات')?.amount_cents,1500);
 assert.equal(sheet.whishIn.find(r=>r.name==='Other client')?.amount_cents,350);
 assert.equal(sheet.whishDetails.filter(r=>r.name==='ملعب Basketball').length,2);
 assert.equal(sheet.whishDetails.filter(r=>r.name==='ملعب Pickle').length,2);
 assert.equal(sheet.whishDepositsToday,3000+2100+2500+1500+350);
 assert.equal(sheet.walletBalance,opening+expected);
 assert.equal(whishSummary(entries,opening).balance,opening+expected);
 assert.equal(entries[0].name,'Basketball Courts','PDF translation never changes the original transaction');
});

test('Whish wallet contains separate Padel, Basketball and Pickleball deposit presets',()=>{
 assert.deepEqual(WHISH_DESCRIPTION_PRESETS.deposit,
  ['Goods Sold','Padel Courts','Basketball Courts','Pickleball Courts']);
 assert.equal(new Set(WHISH_DESCRIPTION_PRESETS.deposit).size,4);
 assert.deepEqual(WHISH_DESCRIPTION_PRESETS.withdrawal,['Transfer from Whish to Miscellaneous Cash Box']);
});

test('Court payment editor references the correct sport name for timetable and normal entries',async()=>{
 const booked=[
  {id:'res-b',business_date:day,sport:'basketball',booking_type:'reservation',status:'confirmed',
   court_number:'B1',customer_name:'Basketball booking',booking_start_time:'18:00',booking_end_time:'19:00',
   duration_minutes:60,pickleball_player_count:4,checkmarks:Array(6).fill(false)},
  {id:'res-p',business_date:day,sport:'pickleball',booking_type:'reservation',status:'confirmed',
   court_number:'P1',customer_name:'Pickleball booking',booking_start_time:'19:00',booking_end_time:'20:00',
   duration_minutes:60,pickleball_player_count:2,checkmarks:Array(6).fill(false)}
 ];
 const splits=[
  {id:'s-b',source_kind:'reservation',source_id:'res-b',payment_date:day,
   amount_cents:2000,cash_cents:1000,whish_cents:1000,unpaid_cents:0},
  {id:'s-p',source_kind:'reservation',source_id:'res-p',payment_date:day,
   amount_cents:1800,cash_cents:800,whish_cents:1000,unpaid_cents:0}
 ];
 const ledger=[{id:'entry',category:'padel_courts',entry_date:day,name:'Padel booking',amount_cents:2500,
  booking_start_time:'18:00',booking_end_time:'19:00',checkmarks:[false,false,false,false]}];
 const api={
  getSession:()=>({access_token:'staff'}),
  listAll:async table=>({
   padel_court_reservations:booked,
   cafeteria_finance_entries:ledger,
   court_payment_splits:splits,
   whish_wallet_settings:[{opening_balance_cents:60}]
  })[table]||[]
 };
 const fin=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>day,addDays:()=>day,rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await fin.load();
 for(const [id,kind,description] of [
  ['res-b','reservation','Basketball Courts'],
  ['res-p','reservation','Pickleball Courts'],
  ['entry','ledger','Padel Courts']
 ]){
  await fin.action({dataset:{action:'cafe-court-payment-edit',id,sourceKind:kind}});
  assert.match(fin.page(),new RegExp('Whish goes automatically to Whish → '+description+'\\.'));
  await fin.action({dataset:{action:'cafe-court-payment-cancel'}});
 }
});

test('Database court split posting uses source sport, reuses linked row, protects manual entries',()=>{
 const sql=read('../supabase/migrations/20261113140500_whish_court_sport_names.sql');
 assert.match(sql,/v_whish_name:=CASE v_ledger\.category[\s\S]*WHEN 'basketball_courts' THEN 'Basketball Courts'/);
 assert.match(sql,/v_whish_name:=CASE v_res\.sport[\s\S]*WHEN 'pickleball' THEN 'Pickleball Courts'/);
 assert.match(sql,/VALUES\(gen_random_uuid\(\),v_date,'deposit',v_whish_name,p_whish_cents,auth\.uid\(\),v_id\)/);
 assert.match(sql,/UPDATE public\.whish_ledger_entries SET name=v_whish_name,amount_cents=p_whish_cents/);
 assert.match(sql,/WHERE source_court_split_id=v_id LIMIT 1 FOR UPDATE/);
 assert.match(sql,/WHERE w\.entry_type='deposit'/);
 assert.match(sql,/JOIN public\.court_payment_splits s ON s\.id=w\.source_court_split_id/);
 assert.match(sql,/INSERT INTO public\.audit_logs\(actor,action,entity,entity_id,before_data,after_data\)/);
 assert.match(sql,/auth\.uid\(\) IS NULL OR NOT public\.is_staff\(\)/);
 assert.match(sql,/Edit this court payment using its booking payment split/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.whish_protect_court_split\(\)/);
 assert.doesNotMatch(sql,/TRUNCATE|DROP TABLE|DELETE FROM public\.whish_ledger_entries/i);
});
