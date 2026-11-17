import {loadCourtMap,normalizeMatchPointRecord,pickNonDuplicate,uniqueCourtSlot,overlapsCourtSlot,minutesForClock,previousDate} from '../lib/matchpoint-normalize.js';
import {parseMatchPointPage} from '../lib/matchpoint-response.js';

function beirutToday(now=new Date()){
 return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function addDays(day,count){
 const date=new Date(day+'T12:00:00Z'); date.setUTCDate(date.getUTCDate()+count);
 return date.toISOString().slice(0,10);
}
export function matchpointLebanonSlot(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Beirut',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(now);
 const hour=Number(parts.find(p=>p.type==='hour')?.value);
 const minute=Number(parts.find(p=>p.type==='minute')?.value);
 // 25 half-hour slots, 09:00 through 21:00 inclusive (Beirut local time).
 if(hour<9||hour>21||(hour===21&&minute>=30))return null;
 return {day:beirutToday(now),hour,minute:minute<30?0:30};
}
const keyOf=item=>[item.external_kind,item.external_id].join(':');
// Only venue/schedule fields belong in the remote snapshot. Never import
// provider prices, payments, phones, access codes or contact details.
export function matchpointBookingSnapshot(item){
 return {
  business_date:item.business_date,sport:item.sport,court_number:item.court_number,
  booking_start_time:String(item.booking_start_time||'').slice(0,5),
  booking_end_time:String(item.booking_end_time||'').slice(0,5),
  duration_minutes:Number(item.duration_minutes),
  customer_name:item.customer_name,status:item.status
 };
}
export function matchpointRemoteChanged(before,after){
 if(!before||typeof before!=='object')return false;
 return Object.keys(after).some(key=>String(before[key]??'')!==String(after[key]??''));
}
// Keep every local edit intact, including private-client links and cancelled
// status. An API refresh updates only remote metadata and review alerts.
export function matchpointReviewAcknowledged(existing,metadata){
 const ack=existing.external_review_ack;
 return !!ack&&ack.status===metadata.external_status&&
   JSON.stringify(Object.entries(ack.snapshot||{}).sort())===JSON.stringify(Object.entries(metadata.external_remote_snapshot||{}).sort());
}
export function matchpointNeedsManualCancellation(row,hasMoney=false){
 return !!(hasMoney||row.external_local_override||row.booking_type==='block'||
  row.private_client_id||row.private_session_entry_id||row.private_coach_id||
  (row.checkmarks||[]).some(Boolean)||String(row.notes||'').trim());
}
// MatchPoint queries calendar dates, while local business dates use a 1 AM rollover.
// Check only dates certainly inside the requested range and do not infer a deletion
// for sessions already started. The upper boundary is deliberately excluded.
export function matchpointCanCheckMissing(row,from,to,now){
 const saved=row.external_remote_snapshot||matchpointBookingSnapshot(row);
 const minutes=minutesForClock(saved.booking_start_time);
 if(minutes===null||!/^\d{4}-\d{2}-\d{2}$/.test(saved.business_date||''))return false;
 const providerDate=minutes<=60?addDays(saved.business_date,1):saved.business_date;
 if(providerDate<from||providerDate>=to)return false;
 const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Beirut',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now);
 return providerDate>from||(providerDate===from&&minutes>minutesForClock(hm));
}
export function matchpointProtectedPatch(existing,item,now){
 const snapshot=matchpointBookingSnapshot(item);
 const previouslySeen=existing.external_remote_snapshot||matchpointBookingSnapshot(existing);
 const remoteChanged=matchpointRemoteChanged(previouslySeen,snapshot);
 const providerCancelled=item.status==='cancelled';
 const localCancelled=existing.status==='cancelled'&&item.status!=='cancelled';
 const existingAlert=existing.external_status==='MISSING'?'':String(existing.external_alert||'');
 let alert=existingAlert;
 if(remoteChanged)alert='MatchPoint changed this booking after a local edit. Padel On kept your settings; review both schedules.';
 if(providerCancelled)alert=existing.status==='cancelled'?'':'MatchPoint cancelled this booking. Local Padel On changes were retained; review it before collecting payments.';
 if(localCancelled)alert='Cancelled locally in Padel On, but still active in MatchPoint. Cancel it there too if needed.';
 return {
  external_status:item.external_status,external_seen_at:now.toISOString(),
  external_remote_snapshot:snapshot,external_missing_count:0,
  external_review_ack:matchpointReviewAcknowledged(existing,{external_status:item.external_status,external_remote_snapshot:snapshot})?existing.external_review_ack:null,
  external_alert:matchpointReviewAcknowledged(existing,{external_status:item.external_status,external_remote_snapshot:snapshot})?null:alert||null,
  providerChangeDetected:!!alert&&!matchpointReviewAcknowledged(existing,{external_status:item.external_status,external_remote_snapshot:snapshot})
 };
}
const errorText=x=>typeof x==='string'?x:JSON.stringify(x);
export async function runMatchPointSync({env=process.env,fetcher=fetch,now=new Date(),logger=console}={}){
 const required=['MATCHPOINT_HOST','MATCHPOINT_API_TOKEN','MATCHPOINT_COURT_MAP_JSON','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'];
 for(const name of required)if(!env[name])throw Error(name+' is required before MatchPoint synchronization can run');
 const map=loadCourtMap(env.MATCHPOINT_COURT_MAP_JSON);
 const host=new URL(env.MATCHPOINT_HOST);
 if(host.protocol!=='https:')throw Error('MatchPoint host must use HTTPS');
 const supabase=new URL(env.SUPABASE_URL);
 if(supabase.protocol!=='https:'||!supabase.hostname.endsWith('.supabase.co'))throw Error('Invalid Supabase project URL');
 const slot=matchpointLebanonSlot(now);
 if(!slot){
  logger.log('MatchPoint sync skipped: outside the 09:00–21:29 Beirut allowed slots.');
  return {skipped:true,reason:'outside_venue_hours'};
 }
 const from=slot.day;
 // Wider scan every six hours locally, at 09:00, 15:00 and 21:00.
 const isExtended=[9,15,21].includes(slot.hour)&&env.MATCHPOINT_EXTENDED_SCAN!=='false';
 const to=addDays(from,isExtended?89:Number(env.MATCHPOINT_LOOKAHEAD_DAYS||7));
 const backend=supabase.origin+'/rest/v1';
 const serviceHeaders={apikey:env.SUPABASE_SERVICE_ROLE_KEY,Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,'Content-Type':'application/json'};
 const api=async(method,table,params={},data)=>{
  const url=new URL(backend+'/'+table);
  for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  const response=await fetcher(url.toString(),{method,headers:{...serviceHeaders,Prefer:'return=representation'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const text=await response.text();
  let body;try{body=text?JSON.parse(text):null}catch{body=text}
  if(!response.ok)throw Error('Supabase '+method+' '+table+' '+response.status+': '+errorText(body).slice(0,300));
  return body;
 };
 const readAll=async(table,filters)=>{
  let result=[],offset=0;
  for(let page=0;page<30;page++){
   const response=await fetcher((()=>{const u=new URL(backend+'/'+table);
    for(const [k,v] of Object.entries({...filters,select:'*',offset:String(offset),limit:'1000'}))u.searchParams.set(k,v);
    return u.toString()})(),{headers:{...serviceHeaders,Prefer:'return=representation'}});
   if(!response.ok)throw Error('Supabase read '+table+': '+response.status);
   const rows=await response.json();
   if(!Array.isArray(rows))throw Error('Invalid Supabase '+table+' feed');
   result.push(...rows);
   if(rows.length<1000)return result;
   offset+=1000;
  }
  throw Error('Supabase pagination limit exceeded');
 };
 const query=async(kind)=>{
  // Reserve this one HTTP request atomically in Supabase *before* touching MatchPoint.
  // A failed request still consumes the quota; retries/manual actions cannot bypass it.
  const claimed=await api('POST','rpc/matchpoint_claim_query_request',{}, {p_feed:kind});
  if(claimed!==true)throw Error('MatchPoint '+kind+' skipped: daily quota or local time-slot already used.');
  const url=new URL('/api/query/'+kind,host);
  url.searchParams.set('dateFrom',from);url.searchParams.set('dateTo',to);
  url.searchParams.set('canceled','yes');url.searchParams.set('offset','0');url.searchParams.set('limit','1000');
  if(kind==='bookings'&&env.MATCHPOINT_CENTER_CODE)url.searchParams.set('center',env.MATCHPOINT_CENTER_CODE);
  // Do not follow authentication redirects with a privileged token. Returning
  // the status makes unexpected 30x responses diagnosable without leaking it.
  const response=await fetcher(url.toString(),{
   headers:{'X-Api-Token':env.MATCHPOINT_API_TOKEN,Accept:'application/json'},
   redirect:'manual'
  });
  if(response.status>=300&&response.status<400)
   throw Error('MatchPoint '+kind+' HTTP '+response.status+' redirect; API host or Query API routing is not verified.');
  if(!response.ok)throw Error('MatchPoint '+kind+' HTTP '+response.status);
  const pageData=await response.json();
  // Accept provider's real PascalCase wrapper only with verified success,
  // safe pagination termination and no response error.
  const parsed=parseMatchPointPage(pageData,{feed:kind,limit:1000});
  return parsed.rows;
 };
 const state=await api('GET','matchpoint_sync_status',{id:'eq.1',select:'*'});
 const last=state?.[0]||{};
 // Suppress a repeat in the same local half-hour, not the next slot after a delayed run.
 // The database independently claims each feed once per slot, including failed attempts.
 const previousRun=Date.parse(last.last_run_at||'');
 const previousSlot=Number.isFinite(previousRun)?matchpointLebanonSlot(new Date(previousRun)):null;
 if(previousSlot?.day===slot.day&&previousSlot?.hour===slot.hour&&previousSlot?.minute===slot.minute&&previousRun<=now.getTime()){
  logger.log('MatchPoint sync skipped: this local half-hour slot already completed.');
  return {skipped:true,reason:'hourly_cooldown',last_run_at:last.last_run_at};
 }
 // Production bookings-only: 25 half-hour passes/day; hard ceiling is 25.
 // The database claim RPC enforces the hard ceiling even after manual runs,
 // failed requests, overlapping jobs, or webhook retries.
 const allowed=['bookings','matches','activities'];
 const kinds=env.MATCHPOINT_FEEDS
  ?[...new Set(String(env.MATCHPOINT_FEEDS).split(',').map(k=>k.trim()).filter(Boolean))]
  :allowed;
 if(!kinds.length||kinds.some(k=>!allowed.includes(k)))throw Error('Invalid MATCHPOINT_FEEDS configuration');
 const fetched={},items=[],warnings=[];
 for(const kind of kinds){
  fetched[kind]=await query(kind);
  for(const record of fetched[kind]){
   try{
    const row=normalizeMatchPointRecord(kind,record,map);
    if(!row){warnings.push('Unmapped '+kind+':'+record?.id+' court '+String(record?.resourceName||''));continue;}
    items.push(row);
   }catch(e){warnings.push(String(e.message||e))}
  }
 }
 // Only a strictly parsed, fully normalized page with unique IDs supports
 // missing-record reconciliation. A failed/incomplete page never cancels anything.
 const bookingRows=items.filter(x=>x.external_kind==='bookings');
 const seenBookings=new Set(bookingRows.map(x=>x.external_id));
 const completeBookings=Array.isArray(fetched.bookings)&&
  fetched.bookings.length===bookingRows.length&&seenBookings.size===bookingRows.length;
 const unique=pickNonDuplicate(items);
 if(unique.length<items.length)warnings.push('Overlapping source court bookings skipped: '+(items.length-unique.length));
 const existing=await readAll('padel_court_reservations',{and:'(business_date.gte.'+previousDate(from)+',business_date.lte.'+to+')'});
 const splitRows=await readAll('court_payment_splits',{source_kind:'eq.reservation',voided_at:'is.null'});
 const withMoney=new Set(splitRows.map(x=>x.source_id));
 const byId=new Map(existing.filter(x=>x.external_source==='matchpoint').map(x=>[keyOf(x),x]));
 const occupancy=existing.filter(x=>x.status!=='cancelled');
 const findConflict=(item,ignoreId)=>occupancy.find(x=>x.id!==ignoreId&&overlapsCourtSlot(x,item));
 const sameValue=(field,value,previous)=>['booking_start_time','booking_end_time'].includes(field)
  ?minutesForClock(value)===minutesForClock(previous):field==='external_remote_snapshot'
   ?JSON.stringify(Object.entries(value||{}).sort())===JSON.stringify(Object.entries(previous||{}).sort())
   :value===previous;
 let inserted=0,updated=0,cancelled=0,ignored=0,conflicts=0,writeFailures=0;
 const blockingConflicts=[];
 const replaceOccupancy=(old,patch)=>{
  const idx=occupancy.findIndex(x=>x.id===old.id);if(idx>=0)occupancy.splice(idx,1);
  if((patch.status||old.status)!=='cancelled')occupancy.push({...old,...patch});
 };
 const writeExisting=async(old,patch,{metadata=false}={})=>{
  const filters={id:'eq.'+old.id,...(Number.isInteger(old.revision)?{revision:'eq.'+old.revision}:{})};
  const changes=metadata?patch:{...patch,updated_at:now.toISOString(),revision:Number(old.revision||1)+1};
  const result=await api('PATCH','padel_court_reservations',filters,changes);
  if(!Array.isArray(result)||!result.length)throw Error('Reservation changed during synchronization; retry on next sync');
  if(!metadata)replaceOccupancy(old,changes);
  return result[0];
 };
 const review=async(old,metadata,message)=>{
  const alert=matchpointReviewAcknowledged(old,metadata)?null:message;
  await writeExisting(old,{...metadata,external_alert:alert,external_review_ack:alert?null:old.external_review_ack},{metadata:true});
  if(alert)conflicts++;
 };
 const cancelOrReview=async(old,metadata,{confirmed=true,reason})=>{
  if(old.status==='cancelled'){
   await writeExisting(old,{...metadata,external_alert:null,external_review_ack:null},{metadata:true});return;
  }
  if(!confirmed||matchpointNeedsManualCancellation(old,withMoney.has(old.id))){
   await review(old,metadata,reason);return;
  }
  try{
   await writeExisting(old,{...metadata,status:'cancelled',external_alert:null,external_review_ack:null});
   cancelled++;updated++;
  }catch(e){
   // The DB independently blocks service cancellation if a payment, edit or
   // private training appeared after our read. Do not overwrite the new state.
   warnings.push('Cancellation requires review: '+keyOf(old));
   logger.warn('MatchPoint cancellation write rejected '+keyOf(old)+': '+e.message);
   writeFailures++;conflicts++;
  }
 };
 if(completeBookings){
  // Reconcile omissions before adding new bookings, but require two successful
  // observations. Never infer absence for out-of-range, old or started sessions.
  for(const old of byId.values()){
   if(old.external_kind!=='bookings'||seenBookings.has(String(old.external_id))||
      !matchpointCanCheckMissing(old,from,to,now))continue;
   const missing=Math.min(2,Number(old.external_missing_count||0)+1);
   const metadata={external_status:'MISSING',external_missing_count:missing,
     external_remote_snapshot:old.external_remote_snapshot||matchpointBookingSnapshot(old)};
   try{
    await cancelOrReview(old,metadata,{confirmed:missing>=2,
      reason:missing<2?'Not returned by MatchPoint. Awaiting another complete sync before releasing the court.':
       'Booking missing from two complete MatchPoint responses. Local edits, training or payment details require review.'});
   }catch(e){warnings.push('Missing-booking review failed: '+keyOf(old));writeFailures++;conflicts++;}
  }
 }else if(fetched.bookings)warnings.push('Missing booking detection skipped: booking data was not fully valid.');
 // Explicit cancellations are applied first to release eligible court slots.
 for(const item of [...unique].sort((a,b)=>Number(b.status==='cancelled')-Number(a.status==='cancelled'))){
  const old=byId.get(keyOf(item));
  if(!old&&item.status==='cancelled')continue;
  const delta={...item,external_remote_snapshot:matchpointBookingSnapshot(item),external_seen_at:now.toISOString(),external_missing_count:0,external_review_ack:null};
  const metadata={external_status:item.external_status,external_remote_snapshot:delta.external_remote_snapshot,
   external_seen_at:delta.external_seen_at,external_missing_count:0};
  try{
   if(old&&item.status==='cancelled'){
    await cancelOrReview(old,metadata,{reason:'Cancelled in MatchPoint. Review local booking changes, training or payments before cancellation.'});
    continue;
   }
   if(old?.external_local_override===true){
    const {providerChangeDetected,...patch}=matchpointProtectedPatch(old,item,now);
    await writeExisting(old,patch,{metadata:true});
    if(providerChangeDetected)conflicts++;
    continue;
   }
   if(old){
    const changes={};
    for(const [field,value] of Object.entries(delta)){
     if(field==='notes'||field==='external_seen_at')continue;
     if(!sameValue(field,value,old[field]))changes[field]=value;
    }
    if(!Object.keys(changes).length)continue;
    const occupant=findConflict(item,old.id);
    if(occupant){
     await review(old,metadata,'MatchPoint changed the booking, but its new time overlaps another Padel On reservation.');
     continue;
    }
    changes.external_seen_at=now.toISOString();
    await writeExisting(old,changes);updated++;
   }else{
    const occupant=findConflict(item,null);
    if(occupant){
     blockingConflicts.push({external_id:item.external_id,business_date:item.business_date,sport:item.sport,court_number:item.court_number,booking_start_time:item.booking_start_time,booking_end_time:item.booking_end_time,blocking_id:occupant.id,blocking_date:occupant.business_date,blocking_sport:occupant.sport,blocking_court:occupant.court_number,blocking_start:occupant.booking_start_time,blocking_end:occupant.booking_end_time});
     warnings.push('New MatchPoint booking '+item.external_id+' overlaps local court '+uniqueCourtSlot(item)+'; open Sync Issues to review.');
     ignored++;conflicts++;continue;
    }
    const added=await api('POST','padel_court_reservations',{},[delta]);
    if(!added?.[0]?.id)throw Error('Missing inserted reservation ID');
    occupancy.push(added[0]);inserted++;
   }
  }catch(e){logger.warn('MatchPoint booking update skipped '+keyOf(item)+': '+e.message);writeFailures++;conflicts++;}
 }
 if(writeFailures)warnings.unshift(writeFailures+' reservation write(s) failed; synchronization incomplete.');
 const stamps={last_run_at:now.toISOString(),last_error:warnings.length?warnings.slice(0,12).join('; ').slice(0,1000):null,last_conflict_count:conflicts,last_booking_conflicts:blockingConflicts};
 // Do not mark a failed import as a successful bookings refresh. The attempted
 // slot is still recorded; the next slot can retry without duplicate API calls.
 if(!writeFailures)for(const kind of kinds)stamps['last_'+kind+'_at']=now.toISOString();
 await api('PATCH','matchpoint_sync_status',{id:'eq.1'},stamps);
 const summary={from,to,extended:isExtended,feeds:Object.fromEntries(kinds.map(k=>[k,fetched[k].length])),inserted,updated,cancelled,ignored,conflicts,writeFailures,warnings:warnings.length};
 logger.log('MatchPoint sync result',JSON.stringify(summary));
 if(warnings.length)logger.warn('MatchPoint mapping/validation warnings:',warnings.slice(0,20).join(' | '));
 return summary;
}
if(typeof process!=='undefined'&&process.argv?.[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
 if(process.env.MATCHPOINT_ENABLED!=='true')console.log('MatchPoint integration is disabled.');
 else if(process.env.MATCHPOINT_PAUSED==='true')console.log('MatchPoint integration paused using the GitHub Actions variable MATCHPOINT_PAUSED.');
 else runMatchPointSync().then(result=>{if(result?.writeFailures)process.exitCode=1}).catch(error=>{console.error('MatchPoint sync failed:',error.message);process.exitCode=1});
}
