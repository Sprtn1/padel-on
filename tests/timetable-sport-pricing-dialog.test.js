import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourtScheduler,timetableCourtPriceCents} from '../lib/court-scheduler-ui.js';

const day='2026-11-13';
const date=(value,n)=>{const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const api=rpc=>({
 getSession:()=>({access_token:'staff'}),
 listAll:async()=>[],
 rpc:rpc|| (async()=>null)
});
const makeUi=({calls=[],onReservationChanged=async()=>{},onRender=()=>{}}={})=>
 createCourtScheduler({api:api(async(name,args)=>{calls.push({name,args});return 'test-id';}),
  today:()=>day,addDays:date,rerender:onRender,toast:()=>{},
  onLedgerChanged:async()=>{},onReservationChanged});

const formMock=values=>{
 const fields=Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value:String(value)}]));
 const summary={textContent:''},priceHint={textContent:''},paymentHint={textContent:''},markersHeading={textContent:''};
 const labels=Array.from({length:4},()=>({hidden:false,checkbox:{checked:true},querySelector(){return this.checkbox;}}));
 return {
  values,dataset:{},
  get fields(){return fields;},
  get summary(){return summary;},
  get priceHint(){return priceHint;},
  get paymentHint(){return paymentHint;},
  get labels(){return labels;},
  get markersHeading(){return markersHeading;},
  querySelector(selector){
   const name=selector.match(/^\[name="([^"]+)"\]$/)?.[1];
   if(name)return fields[name]||null;
   if(selector==='.cafe-scheduler-end-note')return summary;
   if(selector==='[data-court-price-hint]')return priceHint;
   if(selector==='[data-court-payment-preview]')return paymentHint;
   if(selector==='.cafe-scheduler-player-marks > span')return markersHeading;
   return null;
  },
  querySelectorAll(selector){
   return selector==='.cafe-scheduler-player-marks .cafe-marks label'?labels:[];
  }
 };
};

test('New timetable bookings use existing 2/4 Pickleball and 6-player Basketball tariffs',()=>{
 for(const [players,amounts] of [
  [2,[[60,1800],[90,2400],[120,3000]]],
  [4,[[60,2400],[90,3000],[120,3600]]]
 ])for(const [duration,expected] of amounts){
  assert.equal(timetableCourtPriceCents('pickleball','18:00',duration,players),expected);
 }
 for(const [duration,expected] of [[60,2000],[90,3000],[120,4000]]){
  assert.equal(timetableCourtPriceCents('basketball','18:00',duration,6),expected);
 }
 assert.equal(timetableCourtPriceCents('pickleball','18:00',30,4),null);
 assert.equal(timetableCourtPriceCents('basketball','18:00',30,6),null);
 assert.equal(timetableCourtPriceCents('pickleball','23:30',90,2),2400);
});

test('Pickleball and Basketball popups hide Private Training, Padel retains it',async()=>{
 const ui=makeUi();await ui.load();
 for(const [sport,rate,markers] of [['pickleball','24.00','4'],['basketball','20.00','6'],['padel','25.00','4']]){
  await ui.action({dataset:{action:'cafe-schedule-sport',sport}});
  await ui.action({dataset:{action:'cafe-schedule-create'}});
  const html=ui.page(),dialog=html.slice(html.indexOf('<section class="cafe-scheduler-dialog"'));
  assert.match(dialog,new RegExp('name="total_amount"[^>]*value="'+rate.replace('.','\\.')+'"'),sport);
  assert.match(dialog,new RegExp('Players paid \\('+markers+'\\)'),sport);
  if(sport==='pickleball'){
   assert.match(dialog,/name="pickleball_player_count"/);
   assert.match(dialog,/2 players \(singles\)/);
   assert.match(dialog,/4 players \(doubles\)/);
   assert.match(dialog,/rackets included/);
  }else assert.doesNotMatch(dialog,/name="pickleball_player_count"/);
  if(sport==='padel'){
   assert.match(dialog,/option value="private_training"/);
   assert.match(dialog,/name="private_client_id"/);
  }else{
   assert.doesNotMatch(dialog,/private_training/);
   assert.doesNotMatch(dialog,/name="private_client_id"/);
  }
  await ui.action({dataset:{action:'cafe-schedule-close'}});
 }
});

test('Pickleball players/duration changes update price and cash, while manual overrides stay',async()=>{
 const ui=makeUi();await ui.load();
 await ui.action({dataset:{action:'cafe-schedule-sport',sport:'pickleball'}});
 await ui.action({dataset:{action:'cafe-schedule-create'}});
 const form=formMock({
  start_time:'18:00',duration_minutes:60,pickleball_player_count:2,
  total_amount:'24.00',cash_amount:'24.00',whish_amount:'0.00'
 });
 const event=name=>({name,closest:()=>form});
 assert.equal(ui.previewEnd(event('pickleball_player_count')),true);
 assert.equal(form.fields.total_amount.value,'18.00');
 assert.equal(form.fields.cash_amount.value,'18.00');
 assert.equal(form.markersHeading.textContent,'Players paid (2)');
 assert.equal(form.labels[2].hidden,true);
 assert.equal(form.labels[2].checkbox.checked,false);
 form.fields.duration_minutes.value='90';
 ui.previewEnd(event('duration_minutes'));
 assert.equal(form.fields.total_amount.value,'24.00');
 assert.equal(form.fields.cash_amount.value,'24.00');
 assert.match(form.priceHint.textContent,/2 players.*12.00/);
 form.fields.total_amount.value='22.00';
 ui.previewEnd(event('total_amount'));
 assert.equal(form.dataset.priceManuallyEdited,'true');
 form.fields.duration_minutes.value='120';
 ui.previewEnd(event('duration_minutes'));
 assert.equal(form.fields.total_amount.value,'22.00');
 assert.equal(form.fields.cash_amount.value,'22.00');
 assert.match(form.priceHint.textContent,/manual\/saved price unchanged/);
});

test('Successful Pickleball save persists player count and closes overlay before refresh completes',async()=>{
 const calls=[],renders=[];
 let releaseRefresh;
 const refreshHold=new Promise(resolve=>{releaseRefresh=resolve;});
 const ui=makeUi({calls,onRender:()=>renders.push(1),onReservationChanged:()=>refreshHold});
 await ui.load();await ui.action({dataset:{action:'cafe-schedule-sport',sport:'pickleball'}});
 await ui.action({dataset:{action:'cafe-schedule-create'}});
 const form={values:{
  court_number:'P1',start_time:'18:00',duration_minutes:'90',booking_type:'reservation',
  status:'confirmed',customer_name:'Singles booking',notes:'',
  total_amount:'24.00',cash_amount:'24.00',whish_amount:'0.00',
  pickleball_player_count:'2',check0:'on',check1:'on',check2:'on'
 }};
 const original=globalThis.FormData;
 globalThis.FormData=class { constructor(source){this.data=source.values;} entries(){return Object.entries(this.data)[Symbol.iterator]();} };
 try{
  const started=ui.submit(form);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(ui.isEditorOpen(),false,'modal closes before list synchronization completes');
  const saved=calls.find(c=>c.name==='club_court_reservation_priced_save');
  assert.ok(saved);
  assert.equal(saved.args.p_pickleball_player_count,2);
  assert.equal(saved.args.p_payment_total_cents,2400);
  assert.equal(saved.args.p_cash_cents,2400);
  assert.equal(saved.args.p_whish_cents,0);
  assert.deepEqual(saved.args.p_checkmarks,[true,true,false,false,false,false]);
  assert.ok(renders.length>2,'screen is rerendered on save');
  releaseRefresh();
  await started;
 }finally{globalThis.FormData=original;releaseRefresh();}
});

test('Migration persists Pickleball counts and restricts private training to Padel',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261113132000_timetable_pickleball_pricing.sql',import.meta.url),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS pickleball_player_count/);
 assert.match(sql,/timetable_pickleball_singles_marks/);
 assert.match(sql,/timetable_training_only_for_padel/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.club_court_reservation_priced_save/);
 assert.match(sql,/club_court_reservation_finance_save\(/);
 assert.match(sql,/v_old\.revision IS DISTINCT FROM p_expected_revision/);
 assert.match(sql,/v_old\.pickleball_player_count=2/);
 assert.match(sql,/v_count:=CASE WHEN v_old\.sport='basketball' THEN 6/);
 assert.match(sql,/public\.is_staff\(\)/);
 assert.doesNotMatch(sql,/TRUNCATE|DROP TABLE|DELETE FROM public\.padel_court_reservations/);
});
