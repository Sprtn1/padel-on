import {sortCourtBookingsByTime} from './court-bookings.js';
// These lanes visualize recorded bookings, never free/busy availability.
export function courtClock(value){
 const clock=String(value??'').match(/^([01]\d|2[0-3]):[0-5]\d/);
 return clock?clock[0]:null;
}
export function padelCourtLanes(rows=[]){
 const bookings=sortCourtBookingsByTime(rows.filter(row=>row&&!row.voided_at&&row.category==='padel_courts'));
 const lanes=['C1','C2','C3'].map(court=>({court,bookings:[]}));
 const unassigned={court:'Unassigned',bookings:[]};
 for(const row of bookings){
  const lane=lanes.find(x=>x.court===row.court_number)||unassigned;
  const start=courtClock(row.booking_start_time),end=courtClock(row.booking_end_time);
  lane.bookings.push({
   id:row.id,name:row.name||'Unnamed booking',start,end,
   overnight:!!(start&&end&&end<start),
   amountCents:Number(row.amount_cents)||0,
   paidCount:Array.isArray(row.checkmarks)?row.checkmarks.filter(x=>x===true).length:0,
   players:Array.isArray(row.checkmarks)?row.checkmarks.length:4
  });
 }
 if(unassigned.bookings.length)lanes.push(unassigned);
 return lanes;
}
export function courtBookingStartHours(rows=[]){
 const counts=new Map();
 for(const row of rows){
  if(!row||row.voided_at||!['padel_courts','pickleball_courts','basketball_courts'].includes(row.category))continue;
  const time=courtClock(row.booking_start_time);
  if(!time)continue;
  const hour=time.slice(0,2)+':00';
  counts.set(hour,(counts.get(hour)||0)+1);
 }
 return [...counts.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([hour,count])=>({hour,count}));
}
