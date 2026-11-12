// Read-only presentation helpers for club charts and daily court records.
// Never infer booking availability, cash receipts, or outstanding payments.
import {sortCourtBookingsByTime,COURT_LABELS} from './court-bookings.js';

const active=row=>row&&!row.voided_at&&!row.deleted_at;
const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(String(value||'').slice(0,5));
export function sevenDayClubActivity({endDate,addDays,matches=[],specialGames=[],privateEntries=[],privateReady=false}){
 const dates=Array.from({length:7},(_,i)=>addDays(endDate,i-6));
 const counts=new Map(dates.map(date=>[date,{date,games:0,sessions:0,total:0}]));
 for(const match of matches){
  if(!active(match))continue;
  const entry=counts.get(match.played_on);
  if(entry)entry.games++;
 }
 for(const game of specialGames){
  if(!active(game))continue;
  const entry=counts.get(game.played_on);
  if(entry)entry.games++;
 }
 if(privateReady)for(const item of privateEntries){
  if(!active(item)||item.entry_type!=='session')continue;
  const entry=counts.get(item.entry_date);
  if(entry)entry.sessions++;
 }
 const days=dates.map(date=>{
  const day=counts.get(date);
  return {...day,total:day.games+day.sessions};
 });
 return {days,total:days.reduce((n,d)=>n+d.total,0),
  games:days.reduce((n,d)=>n+d.games,0),
  sessions:days.reduce((n,d)=>n+d.sessions,0),includesSessions:Boolean(privateReady)};
}

export function dailyCourtTimeline(entries=[]){
 const categories=new Set(['padel_courts','pickleball_courts','basketball_courts']);
 const all=sortCourtBookingsByTime(entries.filter(row=>active(row)&&categories.has(row.category)));
 const padel=all.filter(row=>row.category==='padel_courts');
 const other=all.filter(row=>row.category!=='padel_courts');
 const scheduled=padel.filter(row=>COURT_LABELS.includes(row.court_number)&&validTime(row.booking_start_time));
 const unscheduled=padel.filter(row=>!scheduled.includes(row));
 const starts=[...new Set(scheduled.map(row=>String(row.booking_start_time).slice(0,5)))].sort();
 const slots=starts.map(time=>({
  time,courts:Object.fromEntries(COURT_LABELS.map(court=>
    [court,scheduled.filter(row=>row.court_number===court&&String(row.booking_start_time).slice(0,5)===time)]))
 }));
 return {all,padel,other,unscheduled,slots,total:all.length,
  counts:Object.fromEntries(COURT_LABELS.map(court=>[court,padel.filter(row=>row.court_number===court).length]))};
}
