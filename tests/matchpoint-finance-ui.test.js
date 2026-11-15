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
function setup(){
 const calls=[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>{
   calls.push(table);
   if(table==='padel_court_reservations')return [imported];
   if(table==='matchpoint_sync_status')return [{id:1,last_bookings_at:'2026-11-16T08:00:00Z'}];
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
 assert.match(html,/Block Court \/ Maintenance/);
 assert.match(html,/Private Client Training/);
 assert.doesNotMatch(html,/data-action="cafe-void-reservation" data-id="mp-uuid"/);
 assert.equal(cafeCourtBookingTotal([], [imported], 'padel_courts','padel',[]),0);
});
test('maintenance from Cafeteria Finances reuses timetable editor and never demands a court payment',async()=>{
 const {finance}=setup();await finance.load();
 await finance.action({dataset:{action:'cafe-court-special-create',type:'block',sport:'padel'}});
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/value="Maintenance"/);
 assert.match(html,/Block Court · Unavailable/);
 assert.match(html,/Payment breakdown/);
 assert.match(html,/name="booking_type"/);
});
test('private training from Cafeteria Finances uses private client selection',async()=>{
 const {finance}=setup();await finance.load();
 await finance.action({dataset:{action:'cafe-court-special-create',type:'private_training',sport:'padel'}});
 const html=finance.page();
 assert.match(html,/data-cafe-save="schedule-reservation"/);
 assert.match(html,/name="private_client_id"/);
 assert.match(html,/name="private_session_fee"/);
 assert.match(html,/Private Client Training/);
});
