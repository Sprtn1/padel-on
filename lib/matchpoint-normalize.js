// Pure, deliberately conservative MatchPoint Query API -> Padel On reservation conversion.
// No amounts, payment methods, contact information or access codes are imported.
const SPORTS={padel:['C1','C2','C3'],pickleball:['P1'],basketball:['B1']};
// MatchPoint Query API does not impose the /availability 600-minute cap on
// /bookings, /matches or /activities. Match the local 16-hour court limit.
export const MAX_MATCHPOINT_IMPORT_DURATION_MINUTES=960;
const clean=v=>String(v??'').trim();
// Provider field capitalization can vary by API deployment. Read only
// unambiguous own properties; never guess aliases or inspect a prototype.
export function matchPointField(record,name){
 if(!record||typeof record!=='object'||Array.isArray(record))return undefined;
 if(Object.prototype.hasOwnProperty.call(record,name))return record[name];
 const keys=Object.keys(record).filter(key=>key.toLowerCase()===name.toLowerCase());
 return keys.length===1?record[keys[0]]:undefined;
}
const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const clockPattern=/^([01]\d|2[0-3]):([0-5]\d)(?::00)?$/;
export const previousDate=date=>{
 if(!datePattern.test(date))throw Error('Invalid MatchPoint date');
 const d=new Date(date+'T12:00:00Z');
 if(Number.isNaN(d.valueOf())||d.toISOString().slice(0,10)!==date)throw Error('Invalid MatchPoint date');
 d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
};
export function minutesForClock(value){
 const match=clockPattern.exec(clean(value));
 return match?Number(match[1])*60+Number(match[2]):null;
}
export function loadCourtMap(value){
 let parsed=typeof value==='string'?JSON.parse(value):value;
 if(!parsed||Array.isArray(parsed)||typeof parsed!=='object')throw Error('Court map must be an object');
 const map=new Map();
 for(const [key,target] of Object.entries(parsed)){
  const sport=clean(target?.sport).toLowerCase(),court=clean(target?.court).toUpperCase();
  if(!clean(key)||!SPORTS[sport]?.includes(court))throw Error('Invalid MatchPoint court mapping: '+key);
  map.set(clean(key).toLowerCase(),{sport,court});
 }
 if(!map.size)throw Error('At least one explicit court mapping is required');
 return map;
}
export function mappedCourt(record,map){
 const resource=clean(matchPointField(record,'resourceName'));
 const keys=[clean(matchPointField(record,'venueCode'))+'|'+resource,clean(matchPointField(record,'venue'))+'|'+resource,resource].map(x=>x.toLowerCase());
 for(const key of keys)if(map.has(key))return map.get(key);
 return null;
}
const displayName=(names,fallback)=>{
 const list=names.map(clean).filter(Boolean);
 return (list.length?list.slice(0,2).join(' / ')+(list.length>2?' +'+(list.length-2):''):fallback).slice(0,120);
};
export function normalizeMatchPointRecord(kind,record,map){
 if(!['bookings','matches','activities'].includes(kind))throw Error('Unsupported MatchPoint feed');
 const id=clean(matchPointField(record,'id'));
 const court=mappedCourt(record,map);
 if(!id||!court)return null; // unmapped courts are logged by caller, never guessed.
 const start=minutesForClock(matchPointField(record,'startTime')),end=minutesForClock(matchPointField(record,'endTime'));
 if(start===null||end===null||start===end||!datePattern.test(clean(matchPointField(record,'date'))))throw Error('Invalid MatchPoint booking date/time for '+kind+':'+id);
 let duration=(end-start+1440)%1440;
 if(duration<1||duration>MAX_MATCHPOINT_IMPORT_DURATION_MINUTES)throw Error('Unsupported MatchPoint booking duration for '+kind+':'+id);
 const day=clean(matchPointField(record,'date'));
 previousDate(day); // verify calendar date
 const businessDate=start<=60?previousDate(day):day;
 const participants=matchPointField(record,'participants');
 const names=Array.isArray(participants)?participants.map(p=>matchPointField(p,'name')):[];
 const name=kind==='activities'?clean(matchPointField(record,'name')||matchPointField(record,'group')||matchPointField(record,'description')).slice(0,120):
   displayName(names,clean(matchPointField(record,'description')||matchPointField(record,'locator')||'MatchPoint '+kind+' '+id).slice(0,120));
 const status=clean(matchPointField(record,'status')).toUpperCase();
 const cancelled=status==='CANCELED';
 return {
  external_source:'matchpoint',external_kind:kind,external_id:id,external_status:status.slice(0,48),
  business_date:businessDate,sport:court.sport,court_number:court.court,
  booking_start_time:clean(matchPointField(record,'startTime')).slice(0,5),
  booking_end_time:clean(matchPointField(record,'endTime')).slice(0,5),duration_minutes:duration,
  customer_name:(name||'MatchPoint '+id).slice(0,120),booking_type:kind==='activities'?'block':'reservation',
  status:cancelled?'cancelled':'confirmed',notes:'',external_alert:null
 };
}
export function uniqueCourtSlot(item){
 const from=minutesForClock(item.booking_start_time);
 const to=minutesForClock(item.booking_end_time);
 return [item.business_date,item.sport,item.court_number,from,to].join('|');
}
// Half-open intervals; adjacent bookings are allowed, partial overlaps are not.
// Business dates in Padel On run 9 AM through 1 AM the following calendar day.
export function courtInterval(item){
 const start0=minutesForClock(item.booking_start_time);
 const end0=minutesForClock(item.booking_end_time);
 if(start0===null||end0===null||start0===end0)return null;
 const start=start0<540?start0+1440:start0;
 let end=end0<540?end0+1440:end0;
 if(end<=start)end+=1440;
 if(end-start>MAX_MATCHPOINT_IMPORT_DURATION_MINUTES)return null;
 return {start,end};
}
export function overlapsCourtSlot(a,b){
 if(!a||!b||a.status==='cancelled'||b.status==='cancelled')return false;
 if(a.business_date!==b.business_date||a.sport!==b.sport||a.court_number!==b.court_number)return false;
 const x=courtInterval(a),y=courtInterval(b);
 // An existing malformed booking is never a justification to write a
 // possibly conflicting external one. Treat unknown interval as a conflict.
 if(!x||!y)return true;
 return x.start<y.end&&y.start<x.end;
}
export function pickNonDuplicate(items){
 const result=[];
 // A booking is preferred to a separately listed match and then an activity.
 const rank={bookings:0,matches:1,activities:2};
 for(const item of [...items].sort((a,b)=>
  (rank[a.external_kind]-rank[b.external_kind])||
  String(a.business_date).localeCompare(String(b.business_date))||
  String(a.sport).localeCompare(String(b.sport))||
  String(a.court_number).localeCompare(String(b.court_number))||
  ((minutesForClock(a.booking_start_time)??0)-(minutesForClock(b.booking_start_time)??0))||
  String(a.external_id).localeCompare(String(b.external_id)))){
  if(item.status!=='cancelled'&&result.some(x=>overlapsCourtSlot(x,item)))continue;
  result.push(item);
 }
 return result;
}
