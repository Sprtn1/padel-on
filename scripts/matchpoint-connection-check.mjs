// Standalone read-only MatchPoint connectivity check. Never prints access tokens,
// customer/participant information or raw API response bodies.
// It does not import, modify or delete any Padel On booking/financial record.
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadCourtMap,mappedCourt,matchPointField,normalizeMatchPointRecord} from '../lib/matchpoint-normalize.js';
import {parseMatchPointPage,matchPointEnvelopeDiagnostics} from '../lib/matchpoint-response.js';
import {matchpointLebanonSlot} from './matchpoint-sync.mjs';

const nextDay=(date,count)=>{
 const d=new Date(date+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+count);
 return d.toISOString().slice(0,10);
};
const required=[
 'MATCHPOINT_HOST','MATCHPOINT_API_TOKEN','MATCHPOINT_COURT_MAP_JSON',
 'SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY'
];

// Only aggregate data SHAPES, never customer-provided keys or values.
// This can reveal whether an unknown provider JSON response is empty, contains
// booking-shaped records under another wrapper, or is an HTML/auth error object.
// Work is bounded; no payload content leaves the GitHub Actions runner.
export function summarizeMatchpointJsonShape(root){
 const kind=v=>v===null?'null':Array.isArray(v)?'array':typeof v;
 const count={object:0,array:0,string:0,number:0,boolean:0,null:0,other:0};
 const state={visited:0,bookingLikeObjects:0,nonemptyArrays:0,
  authOrPermissionText:false,htmlText:false,truncated:false,
  arraysByDepth:{},objectsByDepth:{},arrayElementTypes:{},bookingFieldMatches:{},objectsWithTimingFields:0,
  topLevelValueTypes:{}};
 const bookingFields=new Set([
  'date','fecha','bookingdate','starttime','endtime','horainicio','horafin',
  'resource','resourcename','court','courtname','pista','nombrepista',
  'status','estado','id','bookingid','reservationid','reserva','reservas',
  'participants','participantes','payment','payments','pagos','venue','venuecode'
 ]);
 const increment=(target,key)=>{target[key]=(target[key]||0)+1;};
 if(root&&kind(root)==='object'){
  for(const value of Object.values(root))increment(state.topLevelValueTypes,kind(value));
 }
 const visit=(value,depth)=>{
  if(state.visited>=1800){state.truncated=true;return;}
  state.visited++;
  const k=kind(value);
  increment(count,k in count?k:'other');
  if(k==='string'){
   // Classify, never store or log private values, identifiers, email, names, access codes.
   state.authOrPermissionText||=/(?:unauthori[sz]ed|forbidden|permission denied|invalid token|expired token|access denied|not enabled|api key)/i.test(value.slice(0,1000));
   state.htmlText||=/(?:<!doctype html|<html|<body|<form)/i.test(value.slice(0,1000));
   return;
  }
  if(k==='object'){
   increment(state.objectsByDepth,String(depth));
   const keys=Object.keys(value);
   const matches=keys.filter(key=>bookingFields.has(key.toLowerCase().replace(/[^a-z]/g,'')));
   for(const key of matches)increment(state.bookingFieldMatches,key.toLowerCase().replace(/[^a-z]/g,''));
   if(matches.some(key=>/^(starttime|horainicio)$/i.test(key))&&
      matches.some(key=>/^(endtime|horafin)$/i.test(key)))state.objectsWithTimingFields++;
   if(['date','startTime','endTime','resourceName'].every(key=>
     Object.prototype.hasOwnProperty.call(value,key)))state.bookingLikeObjects++;
   if(depth>=7)return;
   for(const key of keys.slice(0,40))visit(value[key],depth+1);
  }else if(k==='array'){
   increment(state.arraysByDepth,String(depth));
   if(value.length)state.nonemptyArrays++;
   for(const element of value.slice(0,8)){
    increment(state.arrayElementTypes,kind(element));
    if(depth<7)visit(element,depth+1);
   }
  }
 };
 visit(root,0);
 return {
  rootKind:kind(root),
  topLevelFieldCount:root!==null&&kind(root)==='object'?Object.keys(root).length:0,
  topLevelValueTypes:state.topLevelValueTypes,
  valueKinds:count,
  arraysByDepth:state.arraysByDepth,
  objectsByDepth:state.objectsByDepth,
  arrayElementTypes:state.arrayElementTypes,
  nonemptyArrays:state.nonemptyArrays,
  bookingLikeObjects:state.bookingLikeObjects,
  objectsWithTimingFields:state.objectsWithTimingFields,
  bookingFieldMatches:state.bookingFieldMatches,
  hasAuthOrPermissionText:state.authOrPermissionText,
  hasHtmlText:state.htmlText,
  truncated:state.truncated
 };
}

// Preview only: never return raw booking data and never import anything.
// The live API had six top-level fields, exactly one array, and booking-like
// objects. We can validate whether its array represents bookings without
// knowing the provider's private wrapper key or logging customer data.
export function previewAlternateMatchPointBookings(payload,map){
 const obj=payload&&typeof payload==='object'&&!Array.isArray(payload)?payload:null;
 const arrays=obj?Object.values(obj).filter(Array.isArray):[];
 const matches=arrays.filter(rows=>rows.length>0&&rows.length<=1000&&rows.every(row=>
  row&&typeof row==='object'&&!Array.isArray(row)&&
  ['id','date','startTime','endTime','resourceName'].every(k=>
   matchPointField(row,k)!==undefined&&matchPointField(row,k)!==null)));
 const selected=matches.length===1?matches[0]:null;
 let valid=0,mapped=0,unmapped=0,invalid=0;
 if(selected)for(const row of selected){
  try{
   const normalized=normalizeMatchPointRecord('bookings',row,map);
   if(normalized){valid++;mapped++;}
   else{valid++;unmapped++;}
  }catch{invalid++;}
 }
 return {
  topLevelArrays:arrays.length,
  matchingBookingArrays:matches.length,
  candidateRows:selected?.length??0,
  validBookingRows:valid,
  mappedRows:mapped,
  unmappedRows:unmapped,
  invalidRows:invalid,
  importEnabled:false,
  metadataAndPaginationUnverified:true
 };
}

export async function checkMatchpointConnection({env=process.env,now=new Date(),fetcher=fetch,logger=console}={}){
 const missing=required.filter(name=>!String(env[name]||'').trim());
 if(missing.length)throw Error('Missing GitHub Actions secrets: '+missing.join(', '));
 let host,supabase,map;
 try{
  host=new URL(env.MATCHPOINT_HOST);
  supabase=new URL(env.SUPABASE_URL);
  map=loadCourtMap(env.MATCHPOINT_COURT_MAP_JSON);
 }catch{
  throw Error('Invalid host URL, Supabase project URL, or court map JSON. Check values without sharing credentials.');
 }
 if(host.protocol!=='https:'||host.pathname!=='/'||host.search)
  throw Error('MATCHPOINT_HOST must be an HTTPS origin without /Login.aspx, /default.aspx, or query parameters.');
 if(supabase.protocol!=='https:'||!supabase.hostname.endsWith('.supabase.co'))
  throw Error('SUPABASE_URL must be the HTTPS .supabase.co project URL.');
 const mappedCourts=new Set([...map.values()].map(v=>v.sport+':'+v.court));
 const requiredCourts=['padel:C1','padel:C2','padel:C3','pickleball:P1','basketball:B1'];
 const absent=requiredCourts.filter(v=>!mappedCourts.has(v));
 if(absent.length)throw Error('Court mapping is missing Padel On targets: '+absent.join(', '));
 logger.log('Required server secrets are present; HTTPS hosts, court map JSON and all five court targets are structurally valid.');
 const slot=matchpointLebanonSlot(now);
 if(!slot){
  logger.log('Live MatchPoint request SKIPPED: outside the fifteen permitted Beirut-time windows; quota preserved.');
  return {checkedSecrets:true,apiChecked:false,reason:'outside_allowed_slot'};
 }
 const claimUrl=new URL('/rest/v1/rpc/matchpoint_claim_query_request',supabase.origin);
 const claimResponse=await fetcher(claimUrl,{
  method:'POST',
  headers:{apikey:env.SUPABASE_SERVICE_ROLE_KEY,
   Authorization:'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY,
   'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({p_feed:'bookings'}),
  redirect:'error',signal:AbortSignal.timeout(20000)
 });
 if(!claimResponse.ok)
  throw Error('Supabase request quota RPC returned HTTP '+claimResponse.status+'. No MatchPoint request made.');
 let claimed;
 try{claimed=await claimResponse.json()}catch{throw Error('Supabase quota RPC returned invalid JSON. No MatchPoint request made.')}
 if(claimed!==true){
  logger.log('MatchPoint request SKIPPED: booking feed already claimed this slot or daily cap reached.');
  return {checkedSecrets:true,apiChecked:false,reason:'quota_claim_rejected'};
 }
 // Exactly one MatchPoint API call, counted BEFORE attempting the request.
 const url=new URL('/api/query/bookings',host.origin);
 url.searchParams.set('dateFrom',slot.day);
 url.searchParams.set('dateTo',nextDay(slot.day,7));
 url.searchParams.set('canceled','yes');
 url.searchParams.set('offset','0');
 url.searchParams.set('limit','1000');
 if(env.MATCHPOINT_CENTER_CODE)url.searchParams.set('center',env.MATCHPOINT_CENTER_CODE);
 let response;
 try{
  // Manual redirect handling preserves the token: it is NEVER sent to a
  // redirected destination. Status 302/301 is reported, not followed.
  response=await fetcher(url,{
   headers:{'X-Api-Token':env.MATCHPOINT_API_TOKEN,Accept:'application/json'},
   redirect:'manual',signal:AbortSignal.timeout(20000)
  });
 }catch(e){
  const code=String(e?.cause?.code||e?.code||e?.name||'UNKNOWN_ERROR').replace(/[^A-Z_0-9]/gi,'').slice(0,48);
  throw Error('MatchPoint API connection failed before receiving HTTP status (network/TLS code: '+code+'). One quota claim consumed.');
 }
 logger.log('MatchPoint /api/query/bookings returned HTTP '+response.status+' (one API request charged to the daily cap).');
 if(response.status>=300&&response.status<400){
  // Safely classify the Location header without exposing its URL, query,
  // login tokens or any customer data, and without following the redirect.
  let destination='unknown destination';
  const location=response.headers?.get?.('location');
  if(location){
   try{
    const target=new URL(location,host.origin);
    if(target.origin!==host.origin)destination='different host';
    else if(/(?:login|sign.?in|account)/i.test(target.pathname)||target.pathname.toLowerCase().includes('default.aspx'))
     destination='same-host login page';
    else destination='same-host non-API page';
   }catch{destination='invalid Location header'}
  }
  throw Error('MatchPoint API returned HTTP '+response.status+' redirect to '+destination+
   ' (not followed). Confirm the Query API host and query-permission token.');
 }
 if(!response.ok)throw Error('MatchPoint API authentication or endpoint check failed: HTTP '+response.status+'.');
 let data;
 try{data=await response.json()}catch{throw Error('MatchPoint returned non-JSON data.')}
 const recognized=matchPointEnvelopeDiagnostics(data);
 logger.log('MatchPoint recognized response controls: '+JSON.stringify(recognized));
 let parsedPage;
 try{parsedPage=parseMatchPointPage(data,{feed:'bookings',limit:1000});}
 catch(err){logger.log('MatchPoint strict page check: NOT READY ('+err.message+')');}
 if(parsedPage){
  const counts={validatedRows:parsedPage.count,mappedRows:0,unmappedRows:0,invalidRows:0,paginationConfirmed:parsedPage.paginationConfirmed,format:parsedPage.format};
  for(const record of parsedPage.rows){
   try{const normalized=normalizeMatchPointRecord('bookings',record,map);if(normalized)counts.mappedRows++;else counts.unmappedRows++;}
   catch{counts.invalidRows++;}
  }
  logger.log('MatchPoint strict parser dry run (no writes): '+JSON.stringify(counts));
 }
 if(data?.ok!==true||!Array.isArray(data.data)){
  // Diagnose ONLY the envelope's structural types. Never log the API body,
  // raw error string, participant names, emails, payments or access codes.
  const typeOf=value=>Array.isArray(value)?'array':value===null?'null':typeof value;
  const topLevel=typeOf(data);
  const okType=typeOf(data?.ok);
  const dataType=typeOf(data?.data);
  const errorType=typeOf(data?.error);
  const hasMoreType=typeOf(data?.hasMore);
  const knownMetadata=['Message','MessageDetail','ExceptionMessage','error_description','message',
   'success','status','statusCode','code','result','items','records','bookings','d','Response'];
  const known=knownMetadata.filter(k=>Object.prototype.hasOwnProperty.call(data||{},k));
  const contentType=String(response.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
  logger.log('MatchPoint JSON shape: root='+topLevel+
   '; ok='+okType+(okType==='boolean'?' ('+String(data.ok)+')':'')+
   '; data='+dataType+'; error='+errorType+'; hasMore='+hasMoreType+
   '; contentType='+(/^(application\/json|text\/json|application\/problem\+json)$/i.test(contentType)?contentType:'other')+
   '; known envelope keys present='+JSON.stringify(known));
  logger.log('MatchPoint safe structural summary: '+JSON.stringify(summarizeMatchpointJsonShape(data)));
  logger.log('MatchPoint privacy-safe booking preview: '+JSON.stringify(previewAlternateMatchPointBookings(data,map)));
  throw Error('MatchPoint responded HTTP 200 but JSON does not match documented {ok:true,data:[...]} structure. No bookings imported.');
 }
 const distinct=new Map();
 for(const row of data.data){
  const name=String(row?.resourceName||'').trim();
  if(!name)continue;
  const mapped=mappedCourt(row,map);
  distinct.set(name.toLowerCase(),{name,mapped});
 }
 logger.log('Read-only API authentication SUCCEEDED; '+data.data.length+
  ' booking record(s) in sample. The check did not import any bookings or customer data.');
 for(const item of [...distinct.values()].sort((a,b)=>a.name.localeCompare(b.name))){
  // Resource names are facility labels only; never print customer fields.
  logger.log('Facility: '+item.name.slice(0,80)+' => '+
   (item.mapped?item.mapped.sport+' '+item.mapped.court:'UNMAPPED (needs adjustment)'));
 }
 if(distinct.size===0)
  logger.log('No resourceName values found in the sample; API connection confirmed but mapping requires a booking sample.');
 if(data.hasMore)
  logger.log('Response hasMore=true; a full import would require a smaller date window (no extra request made).');
 return {
  checkedSecrets:true,apiChecked:true,httpStatus:response.status,
  records:data.data.length,facilities:distinct.size,
  unmapped:[...distinct.values()].filter(x=>!x.mapped).length
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 checkMatchpointConnection().catch(err=>{
  // Emit only deliberately constructed messages (never request headers or bodies).
  console.error('MatchPoint check failed: '+String(err?.message||'Unspecified error'));
  process.exitCode=1;
 });
}
