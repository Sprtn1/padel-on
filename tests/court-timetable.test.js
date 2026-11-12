import test from 'node:test';
import assert from 'node:assert/strict';
import {padelCourtLanes,courtBookingStartHours,courtClock} from '../lib/court-timetable.js';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
test('Court timetable groups existing padel bookings, including unassigned legacy rows',()=>{
 const rows=[
  {id:'late',category:'padel_courts',name:'Late',court_number:'C2',booking_start_time:'22:30:00',booking_end_time:'00:00:00',checkmarks:[true,false,true,false],amount_cents:3200},
  {id:'early',category:'padel_courts',name:'Early',court_number:'C2',booking_start_time:'17:00:00',booking_end_time:'18:00:00',amount_cents:2500},
  {id:'unassigned',category:'padel_courts',court_number:null},
  {id:'pickle',category:'pickleball_courts',booking_start_time:'17:00:00'},
  {id:'void',category:'padel_courts',voided_at:'x',court_number:'C1'}
 ];
 const snapshot=JSON.stringify(rows),lanes=padelCourtLanes(rows);
 assert.deepEqual(lanes.map(x=>x.court),['C1','C2','C3','Unassigned']);
 assert.deepEqual(lanes[1].bookings.map(x=>x.id),['early','late']);
 assert.equal(lanes[1].bookings[1].overnight,true);
 assert.equal(lanes[1].bookings[1].paidCount,2);
 assert.deepEqual(lanes[3].bookings.map(x=>x.id),['unassigned']);
 assert.equal(JSON.stringify(rows),snapshot);
});
test('Hourly breakdown counts booking starts across recorded court types, not occupied hours',()=>{
 const rows=[
  {category:'padel_courts',booking_start_time:'19:30:00',booking_end_time:'21:30:00'},
  {category:'pickleball_courts',booking_start_time:'19:00:00'},
  {category:'basketball_courts',booking_start_time:'20:00:00'},
  {category:'basketball_courts',booking_start_time:null},
  {category:'padel_courts',booking_start_time:'21:00:00',voided_at:'x'}
 ];
 assert.deepEqual(courtBookingStartHours(rows),[{hour:'19:00',count:2},{hour:'20:00',count:1}]);
 assert.equal(courtClock('00:00:00'),'00:00');
 assert.equal(courtClock('99:00:00'),null);
});
test('Original court entry and payment checkmark forms remain available in either view',()=>{
 const src=read('../lib/cafeteria-finances.js');
 assert.match(src,/cafe-court-grid/);
 assert.match(src,/courtView==='timetable'\?timetable\(\)/);
 assert.match(src,/const courtCards=/);
 assert.match(src,/data-action="cafe-court-view"/);
});
