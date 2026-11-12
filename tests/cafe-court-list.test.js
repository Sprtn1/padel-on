import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeCourtListEntries,cafeTotals} from '../lib/cafeteria-finances.js';

const booked=(id,sport,other={})=>({
 id,business_date:'2026-11-12',sport,booking_type:'reservation',status:'confirmed',
 customer_name:'Reserved guest',court_number:'C1',booking_start_time:'10:00',
 booking_end_time:'11:00',...other
});

test('timetable bookings appear in their sport list, without being ledger receipts',()=>{
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
