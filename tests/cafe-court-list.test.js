import test from 'node:test';
import assert from 'node:assert/strict';
import {createCafeteriaFinances,cafeCourtListEntries,cafeTotals} from '../lib/cafeteria-finances.js';

const booked=(id,sport,other={})=>({
 id,business_date:'2026-11-12',sport,booking_type:'reservation',status:'confirmed',
 customer_name:'Reserved guest',court_number:'C1',booking_start_time:'10:00',
 booking_end_time:'11:00',...other
});

test('timetable bookings appear in their sport list without duplicate ledger receipts',()=>{
 const ledger=[{id:'paid',category:'padel_courts',name:'Paid booking',
  amount_cents:2500,booking_start_time:'12:00',court_number:'C1'}];
 const plans=[booked('planned','padel',{booking_start_time:'09:00'}),
  booked('pickle','pickleball'),booked('basket','basketball')];
 const shown=cafeCourtListEntries(ledger,plans,'padel_courts','padel');
 assert.deepEqual(shown.map(x=>x.id),['planned','paid']);
 assert.equal(shown[0].__plannedReservation,true);
 assert.equal(shown[0].name,'Reserved guest');
 assert.equal(shown[1].__plannedReservation,undefined);
 assert.deepEqual(cafeCourtListEntries(ledger,plans,'pickleball_courts','pickleball').map(x=>x.id),['pickle']);
 assert.deepEqual(cafeCourtListEntries(ledger,plans,'basketball_courts','basketball').map(x=>x.id),['basket']);
 assert.equal(cafeTotals(ledger).income,2500);
 assert.equal(ledger.length,1);
});

test('cancelled bookings stay hidden, while blocks and training appear',()=>{
 const plans=[booked('cancel','padel',{status:'cancelled'}),
  booked('block','padel',{booking_type:'block',customer_name:''}),
  booked('training','padel',{booking_type:'private_training',private_client_id:'client-id',customer_name:''}),
  booked('tentative','padel',{status:'tentative'})];
 const shown=cafeCourtListEntries([],plans,'padel_courts','padel');
 assert.deepEqual(shown.map(x=>x.id).sort(),['block','tentative','training']);
 assert.deepEqual(shown.map(x=>x.name).sort(),['Court blocked','Private client training','Reserved guest'].sort());
 assert.equal(plans[1].name,undefined);
});

test('voided financial entries are not restored by the merged list',()=>{
 const ledger=[{id:'void',category:'padel_courts',voided_at:'2026-11-13T00:00:00Z',amount_cents:2500},
  {id:'active',category:'padel_courts',amount_cents:2500}];
 assert.deepEqual(cafeCourtListEntries(ledger,[],'padel_courts','padel').map(r=>r.id),['active']);
});

test('finance List renders a reservation as an editable court entry without double counting',async()=>{
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>{
   if(table==='padel_court_reservations')return [
    booked('booked-from-grid','padel',{customer_name:'Guest & Friends',court_number:'C2'})];
   if(table==='cafeteria_finance_entries')return [
    {id:'cashbook',category:'padel_courts',name:'Recorded receipt',
     amount_cents:2500,booking_start_time:'11:00',checkmarks:[false,false,false,false]}];
   if(table==='cafeteria_finance_days')return [];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  }
 };
 const finance=createCafeteriaFinances({api,heading:()=>'',icon:()=>'',amount:v=>'$'+(v/100).toFixed(2),
  today:()=> '2026-11-12',addDays:()=> '2026-11-11',rerender:()=>{},toast:()=>{},isAdmin:()=>false});
 await finance.load();
 const html=finance.page();
 assert.match(html,/Guest &amp; Friends/);
 assert.match(html,/data-action="cafe-open-planned" data-id="booked-from-grid" data-sport="padel"/);
 assert.doesNotMatch(html,/Scheduled only · not a cashbook receipt/);
 assert.match(html,/data-source-kind="reservation" data-id="booked-from-grid"/);
 assert.match(html,/data-cafe-reservation-marker="booked-from-grid"/);
 assert.match(html,/Players paid/);
 assert.match(html,/Recorded income \(including private payments\)<\/span><strong>\$25\.00<\/strong>/);
 assert.doesNotMatch(html,/Guest & Friends/);
});

test('a reservation shows its Cash/Whish price without another ledger entry',()=>{
 const ledger=[{id:'existing',category:'padel_courts',name:'Normal',amount_cents:2500}];
 const bookedRow=booked('reserved','padel',{checkmarks:[true,false,true,false,false,false]});
 const split=[{id:'paid-split',source_kind:'reservation',source_id:'reserved',amount_cents:3200,
  cash_cents:1200,whish_cents:2000,payment_date:'2026-11-12'}];
 const shown=cafeCourtListEntries(ledger,[bookedRow],'padel_courts','padel',split);
 const reservation=shown.find(x=>x.id==='reserved');
 assert.equal(reservation.amount_cents,3200);
 assert.equal(reservation.__reservationSplit.id,'paid-split');
 assert.deepEqual(reservation.checkmarks,[true,false,true,false,false,false]);
 assert.equal(cafeTotals(ledger).income,2500,'no second receipt is added to the financial ledger');
});
