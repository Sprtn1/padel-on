import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cafeEntryFromForm,cafePlayerCount,createCafeteriaFinances} from '../lib/cafeteria-finances.js';
import {courtPriceCents} from '../lib/court-bookings.js';

const DATE='2026-11-05';
const money=cents=>'$'+(cents/100).toFixed(2);
const withFormData=async fn=>{
 const old=globalThis.FormData;
 globalThis.FormData=class{
  constructor(form){this.fields=form.fields;}
  entries(){return Object.entries(this.fields)[Symbol.iterator]();}
 };
 try{await fn();}finally{globalThis.FormData=old;}
};
const fields=(players,price='24.00')=>({
 name:'Pickleball booking',amount:price,
 pickleball_player_count:String(players),
 booking_start_time:'18:00',booking_duration_minutes:'90',
 court_notes:'Rackets included',check0:'on',check1:'on',check2:'on',check3:'on'
});
test('Pickleball entry preserves manual price and masks unused singles paid markers',()=>{
 assert.equal(cafePlayerCount('pickleball_courts',2),2);
 assert.equal(cafePlayerCount('pickleball_courts',4),4);
 assert.equal(cafePlayerCount('basketball_courts'),6);
 const singles=cafeEntryFromForm('pickleball_courts',fields(2,'17.50'));
 assert.equal(singles.amount_cents,1750,'Manually overridden total must not be replaced');
 assert.equal(singles.pickleball_player_count,2);
 assert.deepEqual(singles.checkmarks,[true,true,false,false]);
 assert.equal(singles.booking_end_time,'19:30');
 assert.equal(singles.court_number,null);
 const doubles=cafeEntryFromForm('pickleball_courts',fields(4,'30.00'));
 assert.equal(doubles.pickleball_player_count,4);
 assert.deepEqual(doubles.checkmarks,[true,true,true,true]);
 for(const invalid of ['1','3','6','broken'])
  assert.throws(()=>cafeEntryFromForm('pickleball_courts',{...fields(4),pickleball_player_count:invalid}),/Choose 2 or 4/);
});
const make=(records=[])=>{
 const calls=[];
 const api={
  getSession:()=>({access_token:'mock'}),
  async listAll(name){
   if(name==='cafeteria_finance_entries')return records;
   return [];
  },
  async rpc(name,args){
   calls.push({name,args});
   if(name==='cafeteria_finance_update_pickleball_booking'){
    const row=records.find(x=>x.id===args.p_entry_id);
    row.amount_cents=args.p_amount_cents;
    row.pickleball_player_count=args.p_player_count;
    row.booking_start_time=args.p_start;
    row.booking_end_time=args.p_end;
   }
   return args.p_entry_id||null;
  }
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:money,today:()=>DATE,
  addDays:()=>DATE,rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 return {widget,calls};
};
test('Pickleball court form offers a 2-player and 4-player selector',async()=>{
 const {widget}=make();await widget.load();
 const html=widget.page();
 assert.match(html,/data-category="pickleball_courts"/);
 assert.match(html,/name="pickleball_player_count"/);
 assert.match(html,/2 players \(singles\)/);
 assert.match(html,/4 players \(doubles\)/);
 assert.match(html,/including rackets/);
});
test('Price preview reacts to player count and preserves editable amount',()=>{
 const {widget}=make();
 const input={value:'manual'},note={textContent:''};
 const players={value:'2'};
 const marks=Array.from({length:4},()=>({hidden:false,box:{checked:true},querySelector(name){return name==='input'?this.box:null}}));
 const span={textContent:''};
 const form={
  dataset:{courtCategory:'pickleball_courts'},
  querySelector(name){
   if(name==='[name="booking_start_time"]')return {value:'18:00'};
   if(name==='[name="booking_duration_minutes"]')return {value:'90'};
   if(name==='[name="pickleball_player_count"]')return players;
   if(name==='[name="amount"]')return input;
   if(name==='[data-court-price-note]')return note;
   if(name==='.cafe-new-marks > span')return span;
   return null;
  },
  querySelectorAll(name){return name==='.cafe-new-marks .cafe-marks label'?marks:[];}
 };
 assert.equal(widget.courtPricePreview({name:'pickleball_player_count',closest:()=>form}),true);
 assert.equal(input.value,'24.00');
 assert.match(note.textContent,/2 players at 12.00 USD each/);
 assert.match(note.textContent,/rackets included/);
 assert.match(note.textContent,/remains editable/);
 assert.deepEqual(marks.map(x=>x.hidden),[false,false,true,true]);
 assert.equal(marks[2].box.checked,false);
 assert.equal(span.textContent,'Players paid (2)');
 players.value='4';
 assert.equal(widget.courtPricePreview({name:'pickleball_player_count',closest:()=>form}),true);
 assert.equal(input.value,'30.00');
 assert.match(note.textContent,/4 players at 7.50 USD each/);
 assert.deepEqual(marks.map(x=>x.hidden),[false,false,false,false]);
});
test('New 2-player pickleball booking uses dedicated RPC and exact manual amount',async()=>{
 await withFormData(async()=>{
  const x=make();await x.widget.load();
  const entry={dataset:{cafeSave:'entry',category:'pickleball_courts'},
   fields:fields(2,'22.50'),querySelector:()=>({disabled:false,isConnected:false})};
  await x.widget.submit(entry);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].name,'cafeteria_finance_record_pickleball_booking');
  assert.equal(x.calls[0].args.p_player_count,2);
  assert.equal(x.calls[0].args.p_amount_cents,2250);
  assert.deepEqual(x.calls[0].args.p_checkmarks,[true,true,false,false]);
  assert.equal(x.calls[0].args.p_start,'18:00');
  assert.equal(x.calls[0].args.p_end,'19:30');
  assert.equal(x.calls[0].args.p_court,undefined);
 });
});
test('Editing existing pickleball booking changes player count without changing other categories',async()=>{
 await withFormData(async()=>{
  const booking={id:'pickle-1',entry_date:DATE,category:'pickleball_courts',
   name:'Existing pickleball booking',amount_cents:2400,quantity:1,unit_price_cents:0,
   pickleball_player_count:4,booking_start_time:'18:00:00',booking_end_time:'19:30:00',
   court_number:null,checkmarks:[false,false,false,false],created_at:DATE+'T10:00:00Z'};
  const x=make([booking]);await x.widget.load();
  await x.widget.action({dataset:{action:'cafe-court-amount-edit',id:booking.id}});
  const page=x.widget.page();
  assert.match(page,/name="pickleball_player_count"/);
  assert.match(page,/value="4" selected/);
  const form={dataset:{cafeSave:'court-amount',entryId:booking.id},
   fields:{amount:'20.00',booking_start_time:'18:00',booking_duration_minutes:'90',pickleball_player_count:'2'},
   querySelector:()=>({disabled:false,isConnected:false})};
  await x.widget.submit(form);
  assert.equal(x.calls.length,1);
  assert.equal(x.calls[0].name,'cafeteria_finance_update_pickleball_booking');
  assert.equal(x.calls[0].args.p_expected_player_count,4);
  assert.equal(x.calls[0].args.p_player_count,2);
  assert.equal(x.calls[0].args.p_amount_cents,2000);
  assert.equal(booking.pickleball_player_count,2);
  assert.match(x.widget.page(),/2 players/);
 });
});
test('Migration adds no price changes to existing records and guards writes',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261105074145_add_pickleball_two_four_player_pricing.sql',import.meta.url),'utf8');
 assert.match(sql,/add column pickleball_player_count smallint not null default 4/);
 assert.match(sql,/create function public\.cafeteria_finance_record_pickleball_booking/);
 assert.match(sql,/create function public\.cafeteria_finance_update_pickleball_booking/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_staff\(\)/);
 assert.match(sql,/revoke all on function public\.cafeteria_finance_record_pickleball_booking/);
 assert.doesNotMatch(sql,/update public\.cafeteria_finance_entries\s+set\s+amount_cents\s*=\s*\d+/i);
 assert.equal(courtPriceCents('padel_courts','18:00','19:00'),2500);
 assert.equal(courtPriceCents('basketball_courts','18:00','19:00'),2000);
});
