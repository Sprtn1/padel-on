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
test('imported MatchPoint name is shown without cash, Whish, or amount until recorded',async()=>{
 const {finance}=setup();await finance.load();
 const html=finance.page();
 assert.match(html,/MatchPoint Guest/);
 assert.match(html,/MatchPoint booking · court details managed in MatchPoint/);
 assert.match(html,/Amount not recorded · no financial entry yet/);
 assert.match(html,/>Record Amount<\/button>/);
 assert.match(html,/data-source-kind="reservation" data-id="mp-uuid"/);
 assert.match(html,/MatchPoint is the primary booking system/);
 assert.match(html,/cafe-matchpoint-only/);
 assert.match(html,/data-cafe-court-booking-type data-sport="padel"/);
 assert.match(html,/value="reservation" disabled>Reservation · Managed in MatchPoint/);
 assert.equal((html.match(/data-cafe-court-booking-type/g)||[]).length,3);
 assert.match(html,/Block Court \/ Maintenance/);
 assert.match(html,/Private Client Training/);
 assert.doesNotMatch(html,/data-action="cafe-void-reservation" data-id="mp-uuid"/);
 assert.equal(cafeCourtBookingTotal([], [imported], 'padel_courts','padel',[]),0);
});
test('maintenance from Cafeteria Finances reuses timetable editor and never demands a court payment',async()=>{
 const {finance}=setup();await finance.load();
 await finance.change({dataset:{cafeCourtBookingType:'',sport:'padel'},value:'block',isConnected:false});
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/value="Maintenance"/);
 assert.match(html,/Block Court · Unavailable/);
 assert.match(html,/Payment breakdown/);
 assert.match(html,/name="booking_type"/);
});
test('private training from Cafeteria Finances uses private client selection',async()=>{
 const {finance}=setup();await finance.load();
 await finance.change({dataset:{cafeCourtBookingType:'',sport:'padel'},value:'private_training',isConnected:false});
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/name="private_client_id"/);
 assert.match(html,/name="private_session_fee"/);
 assert.match(html,/Private Client Training/);
});

test('court finance form uses a reservation-type dropdown while keeping the regular reservation fields',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 const html=finance.page();
 assert.match(html,/data-cafe-court-booking-type data-sport="padel" name="booking_type"/);
 assert.match(html,/value="reservation" selected>Reservation/);
 assert.match(html,/value="block">Block Court \/ Maintenance/);
 assert.match(html,/value="private_training">Private Client Training/);
 assert.match(html,/data-cafe-save="entry" data-category="padel_courts"/);
 assert.match(html,/name="booking_start_time"/);
 assert.match(html,/name="amount"/);
 assert.equal((html.match(/data-cafe-court-booking-type/g)||[]).length,3);
 const pickle=html.split('data-sport="pickleball"')[1]?.split('</select>')[0];
 const basketball=html.split('data-sport="basketball"')[1]?.split('</select>')[0];
 assert.ok(pickle);assert.ok(basketball);
 assert.doesNotMatch(pickle,/private_training/);
 assert.doesNotMatch(basketball,/private_training/);
});
test('non-Padel training is rejected instead of creating an invalid booking',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 await assert.rejects(
  ()=>finance.change({dataset:{cafeCourtBookingType:'',sport:'pickleball'},value:'private_training'}),
  /Private client training is available for Padel only/
 );
});
test('normal reservation dropdown selection stays on the original finance form',async()=>{
 const {finance}=setup({matchpointActive:false});await finance.load();
 assert.equal(await finance.change({dataset:{cafeCourtBookingType:'',sport:'padel'},value:'reservation'}),true);
 assert.doesNotMatch(finance.page(),/data-cafe-save="schedule-reservation"/);
});

test('app delegates finance booking type select changes instead of ignoring them',async()=>{
 const {readFile}=await import('node:fs/promises');
 const app=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const handler=app.slice(app.indexOf("document.addEventListener('change'"));
 assert.match(handler,/e\.target\.dataset\?\.cafeCourtBookingType!==undefined/);
 assert.match(handler,/cafeteriaFinances\.change\(e\.target\)/);
});
test('submit fallback routes private training into its client-linked editor without recording normal court income',async()=>{
 const {finance,calls}=setup({matchpointActive:false});
 await finance.load();
 const entryForm={
  dataset:{cafeSave:'entry',courtCategory:'padel_courts',category:'padel_courts'},
  querySelector:selector=>selector==='[data-cafe-court-booking-type]'?{value:'private_training'}:null
 };
 await finance.submit(entryForm);
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/name="private_client_id"/);
 assert.match(html,/name="private_session_fee"/);
 assert.match(html,/name="booking_type"/);
 assert.equal(calls.includes('cafeteria_finance_entries'),true);
});
test('submit fallback routes maintenance into a blocked court editor, not a cashbook entry',async()=>{
 const {finance}=setup({matchpointActive:false});
 await finance.load();
 const entryForm={
  dataset:{cafeSave:'entry',courtCategory:'basketball_courts',category:'basketball_courts'},
  querySelector:selector=>selector==='[data-cafe-court-booking-type]'?{value:'block'}:null
 };
 await finance.submit(entryForm);
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/value="Maintenance"/);
 assert.match(html,/value="block" selected/);
 assert.match(html,/name="court_number"/);
});
test('submit fallback never allows non-Padel training to be recorded',async()=>{
 const {finance}=setup({matchpointActive:false});
 await finance.load();
 const entryForm={
  dataset:{cafeSave:'entry',courtCategory:'pickleball_courts',category:'pickleball_courts'},
  querySelector:selector=>selector==='[data-cafe-court-booking-type]'?{value:'private_training'}:null
 };
 await assert.rejects(()=>finance.submit(entryForm),/Private client training is available for Padel only/);
});
