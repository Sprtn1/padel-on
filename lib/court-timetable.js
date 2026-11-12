import {sortCourtBookingsByTime} from './court-bookings.js';
import {sportInfo,normalizedCourt} from './club-court-sports.js';
// These lanes visualize recorded bookings, never free/busy availability.
export function courtClock(value){
 const clock=String(value??'').match(/^([01]\d|2[0-3]):[0-5]\d/);
 return clock?clock[0]:null;
}
export function padelCourtLanes(rows=[],sport='padel'){
 const info=sportInfo(sport);
 const bookings=sortCourtBookingsByTime(rows.filter(row=>row&&!row.voided_at&&row.category===info.category));
 const lanes=info.courts.map(court=>({court,bookings:[]}));
 const unassigned={court:'Unassigned',bookings:[]};
 for(const row of bookings){
  const lane=lanes.find(x=>x.court===normalizedCourt(row,sport))||unassigned;
  const start=courtClock(row.booking_start_time),end=courtClock(row.booking_end_time);
  lane.bookings.push({
   id:row.id,name:row.name||'Unnamed booking',start,end,
   overnight:!!(start&&end&&end<start),
   amountCents:Number(row.amount_cents)||0,
   paidCount:Array.isArray(row.checkmarks)?row.checkmarks.filter(x=>x===true).length:0,
   players:Array.isArray(row.checkmarks)?row.checkmarks.length:4,
    paymentMarkersKnown:Array.isArray(row.checkmarks),
    source:row.source||'ledger',
    reservationStatus:row.reservationStatus||null,
    revision:Number(row.revision||0),
    durationMinutes:Number(row.duration_minutes||0),
    notes:String(row.notes||row.court_notes||''),
    bookingType:row.booking_type||'booking'
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


// The visible business-day window is 09:00 until 01:00 the following day.
// Positions are display-only and never imply an open/available court.
export const COURT_GRID_START_MINUTES=9*60;
export const COURT_GRID_END_MINUTES=25*60;
export const COURT_GRID_HOUR_HEIGHT=56;
export const COURT_GRID_HEIGHT=(COURT_GRID_END_MINUTES-COURT_GRID_START_MINUTES)/60*COURT_GRID_HOUR_HEIGHT;
export const COURT_GRID_COURTS=Object.freeze(['C1','C2','C3']);

export function courtGridClockLabel(minutes){
 const hours=Math.floor(minutes/60)%24;
 return String(hours).padStart(2,'0')+':00'+(minutes>=24*60?' +1':'');
}
export const COURT_GRID_HOURS=Object.freeze(
 Array.from({length:17},(_,index)=>({
  minute:COURT_GRID_START_MINUTES+index*60,
  label:courtGridClockLabel(COURT_GRID_START_MINUTES+index*60),
  topPx:index*COURT_GRID_HOUR_HEIGHT
 }))
);

const clockMinutes=value=>{
 const clock=courtClock(value);
 return clock===null?null:Number(clock.slice(0,2))*60+Number(clock.slice(3,5));
};

// Build non-overlapping visual tracks when two saved bookings share the same court.
// Consecutive appointments (one ends when the next begins) keep the full width.
function assignVisualTracks(bookings){
 const groups=[];
 let group=[],lastEnd=-Infinity;
 for(const entry of [...bookings].sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute||String(a.id).localeCompare(String(b.id)))){
  if(group.length&&entry.startMinute>=lastEnd){
   groups.push(group);
   group=[];lastEnd=-Infinity;
  }
  group.push(entry);lastEnd=Math.max(lastEnd,entry.endMinute);
 }
 if(group.length)groups.push(group);
 return groups.flatMap(entries=>{
  const ends=[];
  const allocated=entries.map(entry=>{
   let track=ends.findIndex(end=>end<=entry.startMinute);
   if(track<0){track=ends.length;ends.push(entry.endMinute)}
   else ends[track]=entry.endMinute;
   return {...entry,track};
  });
  return allocated.map(entry=>({...entry,tracks:ends.length}));
 });
}

export function padelCourtTimeGrid(rows=[],sport='padel'){
 const info=sportInfo(sport);
 const lanes=padelCourtLanes(rows,sport);
 const unplaced=[];
 const columns=info.courts.map(court=>{
  const source=lanes.find(lane=>lane.court===court)?.bookings||[];
  const placed=[];
  for(const item of source){
   const rawStart=clockMinutes(item.start),rawEnd=clockMinutes(item.end);
   if(rawStart===null||rawEnd===null){
    unplaced.push({...item,court,reason:'Booking time not recorded'});
    continue;
   }
   // 00:00–01:00 belongs to the business day's following morning.
   // Starts before 09:00 (e.g. 08:30) are clipped onto the 09:00 line
   // rather than incorrectly interpreted as tomorrow's 08:30.
   const startMinute=rawStart<=60?rawStart+1440:rawStart;
   let endMinute=rawEnd;
   if(endMinute<=startMinute)endMinute+=1440;
   const clippedStart=Math.max(COURT_GRID_START_MINUTES,startMinute);
   const clippedEnd=Math.min(COURT_GRID_END_MINUTES,endMinute);
   if(clippedEnd<=clippedStart){
    unplaced.push({...item,court,reason:'Outside 09:00–01:00 timetable'});
    continue;
   }
   const marksKnown=item.paymentMarkersKnown;
   const paymentState=!marksKnown?'unknown':item.paidCount===0?'none':item.paidCount===item.players?'all':'some';
   placed.push({
    ...item,court,startMinute:clippedStart,endMinute:clippedEnd,
    clipped:clippedStart!==startMinute||clippedEnd!==endMinute,
    paymentState,
    topPx:Math.round((clippedStart-COURT_GRID_START_MINUTES)*COURT_GRID_HOUR_HEIGHT/60),
    heightPx:Math.max(1,Math.round((clippedEnd-clippedStart)*COURT_GRID_HOUR_HEIGHT/60))
   });
  }
  return {court,bookings:assignVisualTracks(placed)};
 });
 for(const item of lanes.find(lane=>lane.court==='Unassigned')?.bookings||[]){
  unplaced.push({...item,court:'Unassigned',reason:'No assigned court'});
 }
 return {columns,unplaced,allCount:lanes.reduce((count,lane)=>count+lane.bookings.length,0),
  hours:COURT_GRID_HOURS,heightPx:COURT_GRID_HEIGHT,sport,courts:info.courts};
}
