import test from 'node:test';
import assert from 'node:assert/strict';
import {courtPriceCents,bookingMinutes,parseCourtBooking} from '../lib/court-bookings.js';
test('Padel tariffs: 1h $25, 1.5h $32, 2h $40',()=>{
 assert.equal(courtPriceCents('padel_courts','18:00','19:00'),2500);
 assert.equal(courtPriceCents('padel_courts','18:00','19:30'),3200);
 assert.equal(courtPriceCents('padel_courts','18:00','20:00'),4000);
});
test('Basketball tariffs: 1h $20, 1.5h $30, 2h $40',()=>{
 assert.equal(courtPriceCents('basketball_courts','18:00','19:00'),2000);
 assert.equal(courtPriceCents('basketball_courts','18:00','19:30'),3000);
 assert.equal(courtPriceCents('basketball_courts','18:00','20:00'),4000);
});
test('Pickleball and unlisted durations keep manual pricing',()=>{
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:30'),null);
 assert.equal(courtPriceCents('padel_courts','18:00','18:45'),null);
});
test('Reject invalid courts, backwards times, and incomplete booking data',()=>{
 assert.equal(bookingMinutes('22:00','23:00'),60);
 for(const sample of [
  {court_number:'C4',booking_start_time:'18:00',booking_end_time:'19:00'},
  {court_number:'C1',booking_start_time:'19:00',booking_end_time:'18:00'},
  {court_number:'C1',booking_start_time:'18:00',booking_end_time:'18:00'},
  {court_number:'C3',booking_start_time:'18:00'}
 ])assert.throws(()=>parseCourtBooking('padel_courts',sample));
 assert.equal(parseCourtBooking('padel_courts',{}),null);
});
test('Basketball and pickleball use times without a court selection',()=>{
 for(const category of ['basketball_courts','pickleball_courts']){
  assert.deepEqual(parseCourtBooking(category,{booking_start_time:'18:00',booking_end_time:'19:30'}),{
   court_number:null,booking_start_time:'18:00',booking_end_time:'19:30'
  });
  assert.throws(()=>parseCourtBooking(category,{court_number:'C1',booking_start_time:'18:00',booking_end_time:'19:30'}));
 }
});
