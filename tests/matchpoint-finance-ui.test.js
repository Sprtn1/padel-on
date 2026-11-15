import test from 'node:test';
import assert from 'node:assert/strict';
import {createCafeteriaFinances,cafeCourtBookingTotal} from '../lib/cafeteria-finances.js';

const imported={
 id:'mp-uuid',business_date:'2026-11-16',sport:'padel',court_number:'C2',
 booking_start_time:'18:00',booking_end_time:'19:30',duration_minutes:90,
 booking_type:'reservation',customer_name:'MatchPoint Guest',status:'confirmed',
 external_source:'matchpoint',external_kind:'bookings',external_id:'5432',
 checkmarks:[false,false,false,false,false,false],notes:''
};
function setup({matchpointActive=true}={}){
 const calls=[];
 const api={
  getSession:()=>({access_token:'token'}),
  rpc:async(name,args)=>{calls.push({rpc:name,args});throw Error('Unexpected write to '+name)},
  listAll:async(table)=>{
   calls.push(table);
   if(table==='padel_court_reservations')return [imported];
   if(table==='matchpoint_sync_status')return matchpointActive?[{id:1,last_bookings_at:'2026-11-16T08:00:00Z'}]:[];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  }
 };
 const finance=createCafeteriaFinances({api,heading:()=>'',icon:()=>'',amount:v=>'$'+(v/100).toFixed(2),
  today:()=> '2026-11-16',addDays:(day)=>day,rerender:()=>{},toast:()=>{},isAdmin:()=>true});
 return {finance,calls};
}
const action=sport=>({dataset:{action:'cafe-court-new-reservation',sport}});
const legacyForm=category=>({dataset:{cafeSave:'entry',category,courtCategory:category}});

test('synced MatchPoint reservations still display without automatically inserting revenue',async()=>{
 const {finance}=setup();await finance.load();
 const html=finance.page();
 assert.match(html,/MatchPoint Guest/);
 assert.match(html,/MatchPoint booking · court details managed in MatchPoint/);
 assert.match(html,/Amount not recorded · no financial entry yet/);
 assert.match(html,/>Record Amount<\/button>/);
 assert.match(html,/data-source-kind="reservation" data-id="mp-uuid"/);
 assert.match(html,/MatchPoint is the primary booking system/);
 assert.doesNotMatch(html,/data-action="cafe-void-reservation" data-id="mp-uuid"/);
 assert.equal(cafeCourtBookingTotal([], [imported], 'padel_courts','padel',[]),0);
});
test('each court card has exactly one create button and no finance-only reservation form',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 const html=finance.page();
 for(const [sport,label] of [
  ['padel','Padel'],['pickleball','Pickleball'],['basketball','Basketball']
 ]){
  assert.match(html,new RegExp('data-action="cafe-court-new-reservation" data-sport="'+sport+'"'));
  assert.match(html,new RegExp('New '+label+' Court Reservation'));
 }
 assert.equal((html.match(/data-action="cafe-court-new-reservation"/g)||[]).length,3);
 assert.doesNotMatch(html,/data-cafe-court-booking-type/);
 assert.doesNotMatch(html,/data-cafe-save="entry" data-category="(?:padel|pickleball|basketball)_courts"/);
 assert.doesNotMatch(html,/name="booking_start_time"/);
 assert.doesNotMatch(html,/name="booking_duration_minutes"/);
});
test('Padel create button opens the actual timetable editor including payment fields',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 await finance.action(action('padel'));
 const html=finance.page();
 assert.match(html,/New reservation/);
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/value="reservation" selected>Reservation/);
 assert.match(html,/name="customer_name"/);
 assert.match(html,/name="booking_type"/);
 assert.match(html,/name="court_number"/);
 assert.match(html,/name="start_time"/);
 assert.match(html,/name="duration_minutes"/);
 assert.match(html,/name="total_amount"/);
 assert.match(html,/name="cash_amount"/);
 assert.match(html,/name="whish_amount"/);
 assert.match(html,/value="private_training">Private Client Training/);
});
test('Padel training selection uses the shared private-client and session-fee editor',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 await finance.action(action('padel'));
 const stub={querySelector:()=>null};
 const selected={name:'booking_type',value:'private_training',closest:()=>stub};
 assert.equal(finance.schedulerPreviewEnd(selected),true);
 const html=finance.page();
 assert.match(html,/value="private_training" selected>Private Client Training/);
 assert.match(html,/name="private_client_id"/);
 assert.match(html,/name="private_session_fee"/);
 assert.match(html,/class="cafe-private-training-fields"/);
 assert.equal((html.match(/data-cafe-save="entry" data-category="padel_courts"/g)||[]).length,0);
});
test('Pickleball and Basketball buttons use one shared editor without Padel private training',async()=>{
 for(const sport of ['pickleball','basketball']){
  const {finance}=setup({matchpointActive:false});await finance.load();
  await finance.action(action(sport));
  const html=finance.page();
  assert.match(html,/data-cafe-save="schedule-reservation"/);
  assert.match(html,/value="reservation" selected>Reservation/);
  assert.match(html,/name="court_number"/);
  assert.doesNotMatch(html,/value="private_training">Private Client Training/);
  if(sport==='pickleball')assert.match(html,/name="pickleball_player_count"/);
 }
});
test('when MatchPoint is authoritative, modal opens as local block and disables normal bookings',async()=>{
 const {finance}=setup();await finance.load();
 await finance.action(action('padel'));
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/value="block" selected>Block Court · Unavailable/);
 assert.match(html,/value="reservation" disabled>Reservation · Managed in MatchPoint/);
 assert.match(html,/local-only court block or training entry/);
 assert.match(html,/value="private_training">Private Client Training/);
});
test('MatchPoint ownership cannot be bypassed by selecting Reservation in the open editor',async()=>{
 const {finance}=setup();await finance.load();
 await finance.action(action('padel'));
 const stub={querySelector:()=>null};
 const selected={name:'booking_type',value:'reservation',closest:()=>stub};
 assert.equal(finance.schedulerPreviewEnd(selected),true);
 assert.equal(selected.value,'block');
 assert.match(finance.page(),/value="block" selected>Block Court · Unavailable/);
});
test('Quick Transaction uses exactly the same create button and editor',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 await finance.action({dataset:{action:'cafe-quick-toggle'}});
 await finance.change({id:'cafe-quick-category',value:'pickleball_courts',dataset:{}});
 const html=finance.page();
 assert.equal((html.match(/data-action="cafe-court-new-reservation" data-sport="pickleball"/g)||[]).length,2);
 assert.doesNotMatch(html,/data-cafe-save="entry" data-category="pickleball_courts"/);
 await finance.action(action('pickleball'));
 assert.match(finance.page(),/data-cafe-save="schedule-reservation"/);
});
test('stale finance-only court forms are rejected before any cashbook RPC is called',async()=>{
 const {finance,calls}=setup({matchpointActive:false});await finance.load();
 for(const category of ['padel_courts','pickleball_courts','basketball_courts']){
  await assert.rejects(()=>finance.submit(legacyForm(category)),/Use the New Court Reservation button/);
 }
 assert.equal(calls.filter(x=>typeof x==='object'&&x.rpc).length,0);
});
test('invalid court sport is rejected before opening the editor',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 await assert.rejects(()=>finance.action(action('tennis')),/Unsupported court sport/);
});
