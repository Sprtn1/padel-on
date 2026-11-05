import test from 'node:test';
import assert from 'node:assert/strict';
import {courtPriceCents,pickleballPricePerPersonCents,bookingMinutes,bookingEndTime,bookingCrossesMidnight,parseCourtBooking} from '../lib/court-bookings.js';
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
test('Pickleball totals are player count × per-person rates; rackets included',()=>{
 for(const [players,perPerson] of [
  [2,{60:900,90:1200,120:1500}],
  [4,{60:600,90:750,120:900}]
 ]){
  for(const [duration,each] of Object.entries(perPerson)){
   const end=bookingEndTime('18:00',Number(duration));
   assert.equal(pickleballPricePerPersonCents(Number(duration),players),each);
   assert.equal(courtPriceCents('pickleball_courts','18:00',end,players),each*players);
  }
 }
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:00',2),1800);
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:30',2),2400);
 assert.equal(courtPriceCents('pickleball_courts','18:00','20:00',2),3000);
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:00',4),2400);
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:30',4),3000);
 assert.equal(courtPriceCents('pickleball_courts','18:00','20:00',4),3600);
});
test('Unsupported pickleball durations remain manually priced',()=>{
 assert.equal(courtPriceCents('pickleball_courts','18:00','18:45',2),null);
 assert.equal(courtPriceCents('pickleball_courts','18:00','18:45',4),null);
 assert.equal(courtPriceCents('pickleball_courts','18:00','19:00',3),null);
 assert.equal(courtPriceCents('padel_courts','18:00','18:45'),null);
});
test('Overnight bookings use the next-day boundary and remain limited to 12 hours',()=>{
 assert.equal(bookingMinutes('22:00','23:00'),60);
 assert.equal(bookingMinutes('22:30','00:00'),90);
 assert.equal(bookingEndTime('22:30',90),'00:00');
 assert.equal(bookingCrossesMidnight('22:30','00:00'),true);
 assert.equal(courtPriceCents('padel_courts','22:30','00:00'),3200);
 assert.throws(()=>bookingMinutes('12:00','11:59'),/12 hours/);
});
test('Reject invalid courts and incomplete booking data',()=>{
 for(const sample of [
  {court_number:'C4',booking_start_time:'18:00',booking_end_time:'19:00'},
  {court_number:'C1',booking_start_time:'18:00',booking_end_time:'18:00'},
  {court_number:'C3',booking_start_time:'18:00'}
 ])assert.throws(()=>parseCourtBooking('padel_courts',sample));
 assert.equal(parseCourtBooking('padel_courts',{}),null);
});
test('Duration-based forms calculate and store their end clock time',()=>{
 assert.deepEqual(parseCourtBooking('padel_courts',{court_number:'C1',booking_start_time:'22:30',booking_duration_minutes:'90'}),{
  court_number:'C1',booking_start_time:'22:30',booking_end_time:'00:00'
 });
 assert.throws(()=>parseCourtBooking('padel_courts',{court_number:'C1',booking_start_time:'22:30',booking_duration_minutes:'91'}),/15-minute/);
});
test('Basketball and pickleball use times without a court selection',()=>{
 for(const category of ['basketball_courts','pickleball_courts']){
  assert.deepEqual(parseCourtBooking(category,{booking_start_time:'18:00',booking_end_time:'19:30'}),{
   court_number:null,booking_start_time:'18:00',booking_end_time:'19:30'
  });
  assert.throws(()=>parseCourtBooking(category,{court_number:'C1',booking_start_time:'18:00',booking_end_time:'19:30'}));
 }
});
