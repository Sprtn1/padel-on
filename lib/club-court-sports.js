// Single source of truth for court calendars. Existing Padel records remain Padel.
export const COURT_SPORTS=Object.freeze({
 padel:Object.freeze({key:'padel',label:'Padel',category:'padel_courts',courts:Object.freeze(['C1','C2','C3']),courtLabel:'Padel Court'}),
 pickleball:Object.freeze({key:'pickleball',label:'Pickleball',category:'pickleball_courts',courts:Object.freeze(['P1']),courtLabel:'Pickleball Court'}),
 basketball:Object.freeze({key:'basketball',label:'Basketball',category:'basketball_courts',courts:Object.freeze(['B1']),courtLabel:'Basketball Court'})
});
export function sportInfo(key='padel'){
 const info=COURT_SPORTS[key];
 if(!info)throw Error('Unsupported court sport');
 return info;
}
export const bookingSportForCategory=category=>
 Object.values(COURT_SPORTS).find(info=>info.category===category)?.key||null;
export function normalizedCourt(row,sport='padel'){
 const info=sportInfo(sport);
 if(info.courts.length===1)return info.courts[0];
 return row.court_number||null;
}
// Count the union of occupied intervals, not the sum of possibly overlapping
// legacy bookings. A blocked court occupies time but never records revenue.
export function calendarOccupancy(grid){
 let occupied=0,blocks=0;
 for(const lane of grid.columns){
  const intervals=[...lane.bookings].sort((a,b)=>a.startMinute-b.startMinute||a.endMinute-b.endMinute);
  let latestEnd=Number.NEGATIVE_INFINITY;
  for(const item of intervals){
   occupied+=Math.max(0,item.endMinute-Math.max(item.startMinute,latestEnd));
   latestEnd=Math.max(latestEnd,item.endMinute);
   if(['block','blocked'].includes(item.bookingType))blocks++;
  }
 }
 const capacity=grid.columns.length*16*60;
 return {bookings:grid.allCount,blocks,courtHours:occupied/60,occupiedMinutes:occupied,
  occupancy:capacity?Math.min(100,Math.round(100*occupied/capacity)):0};
}
