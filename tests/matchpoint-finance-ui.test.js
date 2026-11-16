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
function setup({matchpointActive=true,allowWrites=false}={}){
 const calls=[];
 const api={
  getSession:()=>({access_token:'token'}),
  rpc:async(name,args)=>{calls.push({rpc:name,args});if(!allowWrites)throw Error('Unexpected write to '+name);return 'saved-booking-id'},
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
 assert.match(html,/Synced from MatchPoint/);
 assert.match(html,/Amount not recorded · no financial entry yet/);
 assert.match(html,/>Record Amount<\/button>/);
 assert.match(html,/data-source-kind="reservation" data-id="mp-uuid"/);
 assert.match(html,/Bookings sync from MatchPoint automatically/);
 assert.match(html,/data-action="cafe-void-reservation" data-id="mp-uuid"/);
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
 assert.match(html,/local block or training does not update MatchPoint/);
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

test('synced MatchPoint rows open the normal full editor with amount optional',async()=>{
 const {finance}=setup();
 await finance.load();
 const before=finance.page();
 assert.match(before,/data-action="cafe-open-planned" data-id="mp-uuid"/);
 assert.match(before,/>Edit booking<\/button>/);
 await finance.action({dataset:{action:'cafe-open-planned',id:'mp-uuid',sport:'padel'}});
 const editor=finance.page();
 assert.match(editor,/data-cafe-save="schedule-reservation"/);
 assert.match(editor,/Synced from MatchPoint\. All edits here stay in Padel On/);
 assert.match(editor,/name="booking_type"/);
 assert.match(editor,/option value="reservation" selected>Reservation/);
 assert.match(editor,/option value="private_training">Private Client Training/);
 assert.doesNotMatch(editor,/name="booking_type" disabled/);
 assert.match(editor,/name="court_number"/);
 assert.match(editor,/name="start_time"/);
 assert.match(editor,/name="duration_minutes"/);
 assert.match(editor,/name="private_client_id"/);
 assert.match(editor,/name="total_amount"/);
 assert.match(editor,/name="notes"/);
});
test('local edits to a synced booking do not record money unless amount is supplied',async()=>{
 const {finance,calls}=setup({allowWrites:true});
 await finance.load();
 await finance.action({dataset:{action:'cafe-open-planned',id:'mp-uuid',sport:'padel'}});
 await withScheduleData([
  ['start_time','18:00'],['duration_minutes','120'],['court_number','C2'],
  ['customer_name','Adjusted booking name'],['status','confirmed'],
  ['booking_type','reservation'],['notes','Extend court time if needed'],
  ['total_amount','0.00'],['cash_amount','0.00'],['whish_amount','0.00']
 ],()=>finance.submit({dataset:{cafeSave:'schedule-reservation'}}));
 const req=calls.find(c=>c?.rpc==='club_court_reservation_priced_save');
 assert(req);
 assert.equal(req.args.p_id,'mp-uuid');
 assert.equal(req.args.p_duration,120);
 assert.equal(req.args.p_update_payments,false);
 assert.equal(req.args.p_payment_total_cents,0);
 assert.equal(req.args.p_customer,'Adjusted booking name');
 assert.equal(calls.some(c=>c?.rpc==='court_payment_split_save'),false);
});
test('imported reservation can switch to private client training with the normal client/coach fee RPC',async()=>{
 const {finance,calls}=setup({allowWrites:true});
 await finance.load();
 await finance.action({dataset:{action:'cafe-open-planned',id:'mp-uuid',sport:'padel'}});
 const selected={name:'booking_type',value:'private_training',closest:()=>({querySelector:()=>null})};
 assert.equal(finance.schedulerPreviewEnd(selected),true);
 await withScheduleData([
  ['start_time','18:00'],['duration_minutes','90'],['court_number','C2'],
  ['booking_type','private_training'],['status','confirmed'],
  ['private_client_id','11111111-1111-1111-1111-111111111111'],
  ['private_session_fee','55.00'],['private_coach_id',''],['notes','Club training']
 ],()=>finance.submit({dataset:{cafeSave:'schedule-reservation'}}));
 const write=calls.find(c=>c?.rpc==='club_private_training_save');
 assert(write);
 assert.equal(write.args.p_id,'mp-uuid');
 assert.equal(write.args.p_client_id,'11111111-1111-1111-1111-111111111111');
 assert.equal(write.args.p_session_fee_cents,5500);
});

const withScheduleData=async (entries,fn)=>{
 const prior=globalThis.FormData;
 globalThis.FormData=class{
  constructor(){this.entriesArray=entries;}
  entries(){return this.entriesArray[Symbol.iterator]();}
 };
 try{return await fn();}finally{globalThis.FormData=prior;}
};
test('Padel training saved from Finance is linked using the private-training RPC, not court revenue',async()=>{
 const {finance,calls}=setup({matchpointActive:false,allowWrites:true});
 await finance.load();
 await finance.action(action('padel'));
 const selected={name:'booking_type',value:'private_training',closest:()=>({querySelector:()=>null})};
 assert.equal(finance.schedulerPreviewEnd(selected),true);
 await withScheduleData([
  ['start_time','18:00'],['duration_minutes','90'],['court_number','C1'],
  ['status','confirmed'],['private_client_id','11111111-1111-1111-1111-111111111111'],
  ['private_session_fee','65.00'],['private_coach_id',''],['notes','One-to-one Padel session']
 ],async()=>finance.submit({dataset:{cafeSave:'schedule-reservation'}}));
 const writes=calls.filter(item=>item&&item.rpc);
 assert.equal(writes.length,1);
 assert.equal(writes[0].rpc,'club_private_training_save');
 assert.equal(writes[0].args.p_client_id,'11111111-1111-1111-1111-111111111111');
 assert.equal(writes[0].args.p_session_fee_cents,6500);
 assert.equal(writes[0].args.p_court,'C1');
 assert.equal(writes[0].args.p_duration,90);
 assert.equal(writes.some(x=>x.rpc?.startsWith('cafeteria_finance_record')),false);
});
test('maintenance saved from Finance uses block reservation RPC with zero court payments',async()=>{
 const {finance,calls}=setup({matchpointActive:false,allowWrites:true});
 await finance.load();
 await finance.action(action('basketball'));
 const selected={name:'booking_type',value:'block',closest:()=>({querySelector:()=>null})};
 assert.equal(finance.schedulerPreviewEnd(selected),true);
 await withScheduleData([
  ['start_time','09:00'],['duration_minutes','960'],['court_number','B1'],
  ['status','confirmed'],['customer_name','Maintenance'],['notes','Floor maintenance']
 ],async()=>finance.submit({dataset:{cafeSave:'schedule-reservation'}}));
 const writes=calls.filter(item=>item&&item.rpc);
 assert.equal(writes.length,1);
 assert.equal(writes[0].rpc,'club_court_reservation_priced_save');
 assert.equal(writes[0].args.p_booking_type,'block');
 assert.equal(writes[0].args.p_payment_total_cents,0);
 assert.equal(writes[0].args.p_cash_cents,0);
 assert.equal(writes[0].args.p_whish_cents,0);
 assert.equal(writes[0].args.p_update_payments,false);
 assert.equal(writes[0].args.p_duration,960);
});
