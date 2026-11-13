import test from 'node:test';
import assert from 'node:assert/strict';
import {createCafeteriaFinances,cafeCourtListEntries,cafeCourtBookingTotal,cafeTotals} from '../lib/cafeteria-finances.js';

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

test('Padel, Pickleball and Basketball booking card totals include timetable reservation prices',async()=>{
 const reservations=[
  booked('pad','padel',{court_number:'C2'}),
  booked('pickle','pickleball',{court_number:'P1'}),
  booked('basket','basketball',{court_number:'B1'}),
  booked('blocked','padel',{booking_type:'block'}),
  booked('training','padel',{private_client_id:'client'}),
  booked('cancelled','pickleball',{status:'cancelled'}),
  booked('unsplit','basketball'),
  booked('voided','basketball')
 ];
 const splits=[
  {id:'split-pad',source_kind:'reservation',source_id:'pad',amount_cents:3200,cash_cents:1200,whish_cents:2000,payment_date:'2026-11-12'},
  {id:'split-pickle',source_kind:'reservation',source_id:'pickle',amount_cents:2400,cash_cents:2400,whish_cents:0,payment_date:'2026-11-11'},
  {id:'split-basket',source_kind:'reservation',source_id:'basket',amount_cents:2000,cash_cents:2000,whish_cents:0,payment_date:'2026-11-12'},
  {id:'split-cancel',source_kind:'reservation',source_id:'cancelled',amount_cents:9000,voided_at:'2026-11-11'},
  {id:'split-voided',source_kind:'reservation',source_id:'voided',amount_cents:9000,voided_at:'2026-11-12'}
 ];
 const ledger=[
  {id:'entry-pad',category:'padel_courts',name:'Recorded Padel',amount_cents:2500},
  {id:'entry-pickle',category:'pickleball_courts',name:'Recorded Pickleball',amount_cents:1800, pickleball_player_count:2},
  {id:'entry-basket',category:'basketball_courts',name:'Recorded Basketball',amount_cents:2000},
  {id:'entry-voided',category:'padel_courts',amount_cents:7000,voided_at:'2026-11-12'}
 ];
 const expected=[
  ['padel_courts','padel',5700],
  ['pickleball_courts','pickleball',4200],
  ['basketball_courts','basketball',4000]
 ];
 for(const [category,sport,amount] of expected){
  assert.equal(cafeCourtBookingTotal(ledger,reservations,category,sport,splits),amount,category);
 }
 assert.equal(cafeTotals(ledger).income,6300,'daily cashbook stays separate from booking-date value');

 const api={
  getSession:()=>({access_token:'test'}),
  listAll:async(table,filter)=>{
   if(table==='padel_court_reservations')return reservations;
   if(table==='cafeteria_finance_entries')return ledger;
   if(table==='court_payment_splits')return splits;
   if(table==='cafeteria_finance_days')return [];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  }
 };
 const finance=createCafeteriaFinances({api,heading:()=>'',icon:()=>'',amount:v=>'$'+(v/100).toFixed(2),
  today:()=> '2026-11-12',addDays:()=> '2026-11-11',rerender:()=>{},toast:()=>{},isAdmin:()=>false});
 await finance.load();
 const html=finance.page();
 assert.match(html,/<h3>Padel Courts<\/h3><strong>\$57\.00<\/strong>/);
 assert.match(html,/<h3>Pickleball Courts<\/h3><strong>\$42\.00<\/strong>/);
 assert.match(html,/<h3>Basketball Courts<\/h3><strong>\$40\.00<\/strong>/);
 assert.match(html,/Recorded income \(including private payments\)<\/span><strong>\$63\.00<\/strong>/);
});
