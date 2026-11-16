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
 // Eight allowed local slots: 09,11,13,15,17,19,21,23.
 if(![9,11,13,15,17,19,21,23].includes(hour)||minute>=45)return null;
 return {day:beirutToday(now),hour};
}
const keyOf=item=>[item.external_kind,item.external_id].join(':');
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
  logger.log('MatchPoint sync skipped: outside the 09:00–23:44 Beirut allowed slots.');
  return {skipped:true,reason:'outside_venue_hours'};
 }
 const from=slot.day;
 // Wider scan every six hours locally, at 09:17, 15:17 and 21:17.
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
 // An additional manual/early run should not create another API pass within an hour.
 // This checks the last completed sync; failed runs still need manual investigation.
 const previousRun=Date.parse(last.last_run_at||'');
 const elapsed=now.getTime()-previousRun;
 if(Number.isFinite(previousRun)&&elapsed>=0&&elapsed<60*60*1000){
  logger.log('MatchPoint sync skipped: previous completed pass was less than one hour ago.');
  return {skipped:true,reason:'hourly_cooldown',last_run_at:last.last_run_at};
 }
 // Eight two-hourly passes x three feeds = at most 24 HTTP requests/day.
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
 const unique=pickNonDuplicate(items);
 if(unique.length<items.length)warnings.push('Overlapping source court bookings skipped: '+(items.length-unique.length));
 const existing=await readAll('padel_court_reservations',{and:'(business_date.gte.'+previousDate(from)+',business_date.lte.'+to+')'});
 const splitRows=await readAll('court_payment_splits',{source_kind:'eq.reservation',voided_at:'is.null'});
 const withMoney=new Set(splitRows.map(x=>x.source_id));
 const byId=new Map(existing.filter(x=>x.external_source==='matchpoint').map(x=>[keyOf(x),x]));
 const occupancy=existing.filter(x=>x.status!=='cancelled');
 const findConflict=(item,ignoreId)=>occupancy.find(x=>x.id!==ignoreId&&overlapsCourtSlot(x,item));
 const sameValue=(field,value,previous)=>['booking_start_time','booking_end_time'].includes(field)
  ?minutesForClock(value)===minutesForClock(previous):value===previous;
 let inserted=0,updated=0,cancelled=0,ignored=0,conflicts=0;
 for(const item of unique){
  const old=byId.get(keyOf(item));
  if(!old&&item.status==='cancelled')continue;
  const paid=old?withMoney.has(old.id):false;
  const delta={...item,external_seen_at:now.toISOString()};
  if(old){
   // Do not modify any cash/Whish allocations, checkmarks, private accounts or historical receipts.
   if(item.status==='cancelled'&&paid){
    delta.status=old.status;
    delta.external_alert='Canceled in MatchPoint; financial correction requires staff review';
    conflicts++;
   }
   const changes={};
   for(const [field,value] of Object.entries(delta)){
    if(field==='notes'||field==='external_seen_at')continue;
    if(!sameValue(field,value,old[field]))changes[field]=value;
   }
   if(!Object.keys(changes).length)continue;
   // Never silently move a paid booking into a conflicting local booking.
   if(delta.status!=='cancelled'){
    const occupant=findConflict(item,old.id);
    if(occupant){
     logger.warn('MatchPoint move conflicts with booking '+occupant.id+' at '+uniqueCourtSlot(item));
     conflicts++;continue;
    }
   }
   try{
    changes.external_seen_at=now.toISOString();
    changes.updated_at=now.toISOString();changes.revision=Number(old.revision||1)+1;
    await api('PATCH','padel_court_reservations',{id:'eq.'+old.id},changes);
    updated++;if(item.status==='cancelled'&&!paid)cancelled++;
    const previousIndex=occupancy.findIndex(x=>x.id===old.id);
    if(previousIndex>=0)occupancy.splice(previousIndex,1);
    if(delta.status!=='cancelled')occupancy.push({...old,...delta});
   }catch(e){logger.warn('MatchPoint update skipped '+keyOf(item)+': '+e.message);conflicts++}
  }else{
   const occupant=findConflict(item,null);
   if(occupant){logger.warn('MatchPoint overlaps existing booking at '+uniqueCourtSlot(item));ignored++;continue;}
   try{
    const added=await api('POST','padel_court_reservations',{},[delta]);
    if(!added?.[0]?.id)throw Error('Missing inserted reservation ID');
    occupancy.push(added[0]);inserted++;
   }catch(e){logger.warn('MatchPoint insert skipped '+keyOf(item)+': '+e.message);conflicts++}
  }
 }
 const stamps={last_run_at:now.toISOString(),last_error:warnings.length?warnings.slice(0,12).join('; ').slice(0,1000):null,last_conflict_count:conflicts};
 for(const kind of kinds)stamps['last_'+kind+'_at']=now.toISOString();
 await api('PATCH','matchpoint_sync_status',{id:'eq.1'},stamps);
 const summary={from,to,extended:isExtended,feeds:Object.fromEntries(kinds.map(k=>[k,fetched[k].length])),inserted,updated,cancelled,ignored,conflicts,warnings:warnings.length};
 logger.log('MatchPoint sync result',JSON.stringify(summary));
 if(warnings.length)logger.warn('MatchPoint mapping/validation warnings:',warnings.slice(0,20).join(' | '));
 return summary;
}
if(process.argv[1]&&new URL('file://'+process.argv[1]).href===import.meta.url){
 if(process.env.MATCHPOINT_ENABLED!=='true')console.log('MatchPoint integration disabled until server/token/court mapping are configured.');
 else runMatchPointSync().catch(error=>{console.error('MatchPoint sync failed:',error.message);process.exitCode=1});
}
