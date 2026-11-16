import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCourtMap,normalizeMatchPointRecord,pickNonDuplicate,overlapsCourtSlot,minutesForClock} from '../lib/matchpoint-normalize.js';
import {runMatchPointSync,matchpointLebanonSlot,matchpointBookingSnapshot,matchpointProtectedPatch} from '../scripts/matchpoint-sync.mjs';

const mapping=loadCourtMap({'MAIN|Court 1':{sport:'padel',court:'C1'},'MAIN|Pickle 1':{sport:'pickleball',court:'P1'},'MAIN|Basketball':{sport:'basketball',court:'B1'}});
const booking=(id,date='2026-11-16',start='18:00',end='19:30')=>({
 id,venueCode:'MAIN',venue:'Main Club',resourceName:'Court 1',date,startTime:start,endTime:end,status:'ACTIVE',
 participants:[{name:'Nadine Ahmad',totalAmount:500,paid:true,email:'secret@example.com'}],
 payments:[{amount:500,payMethod:'card'}],lighting:{amount:9},accessCode:'secret'
});
test('MatchPoint mapping is explicit and amount-free',()=>{
 const row=normalizeMatchPointRecord('bookings',booking(9),mapping);
 assert.equal(row.customer_name,'Nadine Ahmad');
 assert.equal(row.sport,'padel');assert.equal(row.court_number,'C1');
 assert.equal(row.duration_minutes,90);
 for(const forbidden of ['amount_cents','cash_cents','payments','lighting','accessCode','email','phone','paid'])assert.equal(forbidden in row,false);
 assert.equal(normalizeMatchPointRecord('bookings',{...booking(9),resourceName:'Other Court'},mapping),null);
});
test('after midnight is assigned to previous business date and source cancellations are preserved',()=>{
 const row=normalizeMatchPointRecord('bookings',booking(13,'2026-11-16','00:30','01:00'),mapping);
 assert.equal(row.business_date,'2026-11-15');
 assert.equal(row.duration_minutes,30);
 assert.equal(normalizeMatchPointRecord('bookings',{...booking(13),status:'CANCELED'},mapping).status,'cancelled');
});
test('matches and activities dedupe against booking feed by exact court slot',()=>{
 const b=normalizeMatchPointRecord('bookings',booking(2),mapping);
 const m=normalizeMatchPointRecord('matches',{...booking(3),sport:'Padel'},mapping);
 const a=normalizeMatchPointRecord('activities',{...booking(4),name:'Class'},mapping);
 const picked=pickNonDuplicate([a,m,b]);
 assert.deepEqual(picked.map(r=>r.external_kind),['bookings']);
});
test('worker inserts one amount-free record even if another feed repeats the court slot',async()=>{
 const inserted=[],requests=[],env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 let created=0;
 const response=(data,ok=true)=>({ok,status:ok?200:400,text:async()=>JSON.stringify(data),json:async()=>data});
 const fetcher=async(url,options={})=>{
  const u=new URL(url);requests.push({url:u,options});
  if(u.pathname.startsWith('/api/query/')){
   const kind=u.pathname.split('/').pop();
   const rows=kind==='bookings'?[booking(12)]:kind==='matches'?[booking(99)]:[];
   return response({ok:true,data:rows,hasMore:false});
  }
  const name=u.pathname.split('/').pop();
  if(name==='matchpoint_sync_status')return response(options.method==='PATCH'?[{id:1}]:[{id:1}]);
  if(name==='matchpoint_claim_query_request')return response(true);
  if(name==='court_payment_splits')return response([]);
  if(name==='padel_court_reservations'){
   if(options.method==='POST'){
    const data=JSON.parse(options.body);
    inserted.push(data[0]);return response([{...data[0],id:'reservation-uuid-'+(++created)}]);
   }
   return response([]);
  }
  throw Error('Unexpected URL '+url);
 };
 const output=await runMatchPointSync({env,fetcher,now:new Date('2026-11-15T17:30:00+02:00'),logger:{log:()=>{},warn:()=>{}}});
 assert.equal(output.inserted,1);
 assert.equal(output.conflicts,0);
 assert.equal(inserted.length,1);
 assert.equal(inserted[0].customer_name,'Nadine Ahmad');
 assert.equal(inserted[0].amount_cents,undefined);
 assert.equal(requests.filter(r=>r.url.pathname.includes('/api/query/')).length,3);
 assert(requests.filter(r=>r.url.pathname.includes('/api/query/')).every(r=>r.options.headers['X-Api-Token']==='secret'));
 assert(requests.filter(r=>r.url.pathname.includes('/rest/v1/')).every(r=>r.options.headers['X-Api-Token']===undefined));
});

test('hourly cooldown avoids a second API pass within 60 minutes',async()=>{
 const now=new Date('2026-11-15T17:30:00+02:00');
 const env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 let matchpointRequests=0;
 const response=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async url=>{
  if(new URL(url).pathname.includes('/api/query/'))matchpointRequests++;
  return response([{id:1,last_run_at:new Date(now.getTime()-30*60*1000).toISOString()}]);
 };
 const result=await runMatchPointSync({env,fetcher,now,logger:{log:()=>{},warn:()=>{}}});
 assert.equal(result.skipped,true);
 assert.equal(result.reason,'hourly_cooldown');
 assert.equal(matchpointRequests,0);
});
test('MatchPoint scheduled workflow covers Lebanon DST hours but only allows eight local slots',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/matchpoint-reservations-sync.yml',import.meta.url),'utf8');
 assert.equal(yaml.includes("cron: '17 6-21 * * *'"),true);
 assert.equal(yaml.includes("*/5 * * * *"),false);
});

test('eight Lebanese odd-hour windows accept winter and summer clocks and exclude midnight',()=>{
 for(const offset of ['+02:00','+03:00']){
  for(const hour of [9,11,13,15,17,19,21,23]){
   const dt=new Date('2026-'+(offset==='+02:00'?'11-15':'06-15')+'T'+String(hour).padStart(2,'0')+':17:00'+offset);
   assert.equal(matchpointLebanonSlot(dt)?.hour,hour,'valid local slot '+hour);
  }
 }
 for(const local of ['08:17','10:17','12:17','22:17','23:55','00:17']){
  assert.equal(matchpointLebanonSlot(new Date('2026-11-15T'+local+':00+02:00')),null,local);
 }
});
test('off-hours and manually retriggered sync produce zero MatchPoint HTTP requests',async()=>{
 const now=new Date('2026-11-15T20:17:00+02:00');
 let calls=0;
 const env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'test',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 const result=await runMatchPointSync({env,now,fetcher:async()=>{calls++;throw Error('should not fetch')},logger:{log:()=>{}}});
 assert.equal(result.skipped,true);
 assert.equal(result.reason,'outside_venue_hours');
 assert.equal(calls,0);
});
test('rejected database claim forbids API requests without any network request to MatchPoint',async()=>{
 let requests=0,claims=0;
 const env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'test',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 const mock=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async (url)=>{
  const u=new URL(url);
  if(u.pathname.startsWith('/api/query/'))requests++;
  if(u.pathname.endsWith('/matchpoint_claim_query_request')){claims++;return mock(false);}
  if(u.pathname.endsWith('/matchpoint_sync_status'))return mock([{id:1,last_run_at:null}]);
  throw Error('Unexpected endpoint '+u.pathname);
 };
 await assert.rejects(()=>runMatchPointSync({
  env,now:new Date('2026-11-15T09:17:00+02:00'),fetcher,logger:{log:()=>{}}
 }),/daily quota or local time-slot already used/);
 assert.equal(claims,1);
 assert.equal(requests,0);
});
test('pagination fails closed instead of issuing a 25th API HTTP request',async()=>{
 let requests=0,claims=0;
 const env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'test',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 const mock=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async(url)=>{
  const u=new URL(url);
  if(u.pathname.startsWith('/api/query/')){requests++;return mock({ok:true,data:[booking(1)],hasMore:true});}
  if(u.pathname.endsWith('/matchpoint_claim_query_request')){claims++;return mock(true);}
  if(u.pathname.endsWith('/matchpoint_sync_status'))return mock([{id:1,last_run_at:null}]);
  throw Error('Unexpected endpoint '+u.pathname);
 };
 await assert.rejects(()=>runMatchPointSync({
  env,now:new Date('2026-11-15T09:17:00+02:00'),fetcher,logger:{log:()=>{}}
 }),/requires pagination/);
 assert.equal(claims,1);
 assert.equal(requests,1);
});

test('MatchPoint Query bookings may span the full 16-hour local operating day',()=>{
 const fullDay=normalizeMatchPointRecord('bookings',booking(100,'2026-11-16','09:00','01:00'),mapping);
 assert.equal(fullDay.booking_start_time,'09:00');
 assert.equal(fullDay.booking_end_time,'01:00');
 assert.equal(fullDay.duration_minutes,960);
 assert.equal(fullDay.business_date,'2026-11-16');
 assert.throws(
  ()=>normalizeMatchPointRecord('bookings',booking(101,'2026-11-16','08:59','01:00'),mapping),
  /Unsupported MatchPoint booking duration/
 );
});
test('production MatchPoint sync does not follow unexpected HTTP 302 redirects with API token',async()=>{
 const env={
  MATCHPOINT_HOST:'https://matchpoint.example.com',MATCHPOINT_API_TOKEN:'secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-key'
 };
 let apiRequests=0,quotaClaims=0,imports=0;
 const response=data=>({ok:true,status:200,text:async()=>JSON.stringify(data),json:async()=>data});
 const fetcher=async(url,options={})=>{
  const u=new URL(url);
  if(u.pathname.endsWith('/matchpoint_sync_status'))return response([{id:1,last_run_at:null}]);
  if(u.pathname.endsWith('/matchpoint_claim_query_request')){quotaClaims++;return response(true);}
  if(u.pathname.startsWith('/api/query/')){
   apiRequests++;
   assert.equal(options.redirect,'manual','API token must not follow an undocumented redirect');
   assert.equal(options.headers['X-Api-Token'],'secret');
   return {ok:false,status:302};
  }
  if(u.pathname.endsWith('/padel_court_reservations')){imports++;return response([]);}
  throw Error('Unexpected network path '+u.pathname);
 };
 await assert.rejects(()=>runMatchPointSync({
  env,now:new Date('2026-11-16T19:17:00+02:00'),fetcher,logger:{log:()=>{},warn:()=>{}}
 }),/MatchPoint bookings HTTP 302 redirect/);
 assert.equal(apiRequests,1);
 assert.equal(quotaClaims,1);
 assert.equal(imports,0,'No bookings may be imported from an undocumented redirect');
});

test('capitalized MatchPoint booking fields normalize into existing court and name schema without financial imports',()=>{
 const upper={
  ID:784,VenueCode:'MAIN',Venue:'Padel On',ResourceName:'Court 1',
  Date:'2026-11-16',StartTime:'18:00',EndTime:'19:30',Status:'ACTIVE',
  Participants:[{Name:'PRIVATE TEST CUSTOMER',Email:'hidden@example.test',Paid:true}],
  Payments:[{Amount:3200,Method:'Whish'}]
 };
 const row=normalizeMatchPointRecord('bookings',upper,mapping);
 assert.equal(row.external_id,'784');
 assert.equal(row.business_date,'2026-11-16');
 assert.equal(row.court_number,'C1');
 assert.equal(row.duration_minutes,90);
 assert.equal(row.customer_name,'PRIVATE TEST CUSTOMER');
 assert.equal(row.status,'confirmed');
 assert.equal(row.amount_cents,undefined);
 assert.equal(row.payments,undefined);
 assert.equal(row.email,undefined);
});

test('court intervals block partial overlaps, normalize DB :00 seconds and preserve adjacent slots',()=>{
 const make=(st,end,court='C1',date='2026-11-16')=>({
  business_date:date,sport:'padel',court_number:court,
  booking_start_time:st,booking_end_time:end,status:'confirmed'
 });
 assert.equal(minutesForClock('18:30:00'),1110);
 assert.equal(overlapsCourtSlot(make('18:00','19:30'),make('19:00:00','20:00:00')),true);
 assert.equal(overlapsCourtSlot(make('18:00','19:30'),make('19:30:00','20:00:00')),false);
 assert.equal(overlapsCourtSlot(make('23:30','00:30'),make('00:15:00','01:00:00')),true);
 assert.equal(overlapsCourtSlot(make('23:30','00:30'),make('00:30:00','01:00:00')),false);
 assert.equal(overlapsCourtSlot(make('18:00','19:30'),make('18:30','19:00','C2')),false);
 assert.equal(overlapsCourtSlot(make('18:00','19:30'),make('18:30','19:00','C1','2026-11-17')),false);
});
test('MatchPoint source records deduplicate by partial overlap, preferring booking to match',()=>{
 const a=normalizeMatchPointRecord('bookings',booking(2,'2026-11-16','18:00','19:00'),mapping);
 const m=normalizeMatchPointRecord('matches',booking(3,'2026-11-16','18:30','20:00'),mapping);
 const other=normalizeMatchPointRecord('bookings',booking(4,'2026-11-16','19:00','20:00'),mapping);
 assert.deepEqual(pickNonDuplicate([m,other,a]).map(x=>x.external_id),['2','4']);
});
test('bookings-only production rollout preserves existing local overlapping bookings and finance',async()=>{
 const req=[],written=[];
 const env={MATCHPOINT_HOST:'https://padelon-lb.matchpoint.com.es',MATCHPOINT_API_TOKEN:'test-secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'service',
  MATCHPOINT_FEEDS:'bookings'};
 const local={id:'local-1',business_date:'2026-11-16',sport:'padel',court_number:'C1',
  booking_start_time:'18:00:00',booking_end_time:'19:00:00',duration_minutes:60,
  status:'confirmed',customer_name:'Existing Local Client'};
 const b1=booking(101,'2026-11-16','17:30','18:30');
 const b2=booking(102,'2026-11-16','19:00','20:00');
 const respond=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fakeFetch=async(url,options={})=>{
  const p=new URL(url).pathname;req.push(p);
  if(p==='/api/query/bookings')return respond({Ok:true,HasMore:false,Error:null,Offset:0,Limit:1000,Data:[b1,b2]});
  if(p.endsWith('/matchpoint_claim_query_request'))return respond(true);
  if(p.endsWith('/matchpoint_sync_status'))return respond([{id:1,last_run_at:null}]);
  if(p.endsWith('/court_payment_splits'))return respond([{id:'payment-local',source_id:'local-1'}]);
  if(p.endsWith('/padel_court_reservations')){
   if(!options.method||options.method==='GET')return respond([local]);
   written.push({method:options.method,record:JSON.parse(options.body)});
   return respond([{...JSON.parse(options.body)[0],id:'external-2'}]);
  }
  throw Error('Unexpected path '+p);
 };
 const summary=await runMatchPointSync({env,now:new Date('2026-11-16T23:17:00+02:00'),fetcher:fakeFetch,logger:{log:()=>{},warn:()=>{}}});
 assert.equal(summary.inserted,1);
 assert.equal(summary.ignored,1);
 assert.equal(summary.feeds.bookings,2);
 assert.equal(req.filter(path=>path.startsWith('/api/query/')).length,1);
 assert.equal(written.length,1);
 assert.equal(written[0].method,'POST');
 assert.equal(written[0].record[0].booking_start_time,'19:00');
 assert.equal(written[0].record[0].external_source,'matchpoint');
 for(const forbidden of ['amount_cents','cash_cents','whish_cents','paid','payments','accessCode'])
  assert.equal(written[0].record[0][forbidden],undefined);
});

test('local MatchPoint overrides retain staff time, court, type, private training and cancellations on sync',async()=>{
 const env={
  MATCHPOINT_HOST:'https://padelon-lb.matchpoint.com.es',
  MATCHPOINT_API_TOKEN:'secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'MAIN|Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY:'server-secret',
  MATCHPOINT_FEEDS:'bookings',MATCHPOINT_EXTENDED_SCAN:'false'
 };
 const remote=booking(42,'2026-11-17','18:00','19:30');
 const normalized=normalizeMatchPointRecord('bookings',remote,mapping);
 const old={
  ...normalized,id:'saved-uuid',external_source:'matchpoint',
  external_kind:'bookings',external_id:'42',
  external_local_override:true,
  external_remote_snapshot:matchpointBookingSnapshot(normalized),
  court_number:'C2',booking_start_time:'19:00:00',booking_end_time:'21:00:00',
  duration_minutes:120,customer_name:'Local client training',
  private_client_id:'private-client-1',private_coach_id:'coach-1',
  private_session_fee_cents:5500,booking_type:'reservation',
  status:'confirmed',revision:5,notes:'Local extension',checkmarks:[true,false,false,false,false,false]
 };
 const writes=[];
 const response=body=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const fetcher=async(url,opts={})=>{
  const path=new URL(url).pathname;
  if(path==='/api/query/bookings')return response({Ok:true,Data:[remote],HasMore:false,Error:null,Total:1});
  if(path.endsWith('/matchpoint_claim_query_request'))return response(true);
  if(path.endsWith('/matchpoint_sync_status'))return response(opts.method==='PATCH'?[{id:1}]:[{id:1,last_run_at:null}]);
  if(path.endsWith('/court_payment_splits'))return response([]);
  if(path.endsWith('/padel_court_reservations')){
   if(opts.method==='PATCH'){
    writes.push(JSON.parse(opts.body));
    return response([{...old,...JSON.parse(opts.body)}]);
   }
   if(opts.method==='POST')throw Error('Must never create duplicate imported booking');
   return response([old]);
  }
  throw Error('Unexpected request '+path);
 };
 const result=await runMatchPointSync({
  env,now:new Date('2026-11-17T09:17:00+02:00'),fetcher,
  logger:{log:()=>{},warn:()=>{}}
 });
 assert.equal(result.inserted,0);
 assert.equal(writes.length,1);
 const patch=writes[0];
 for(const key of ['business_date','court_number','booking_start_time','booking_end_time',
  'duration_minutes','customer_name','booking_type','status','notes','revision',
  'private_client_id','private_coach_id','private_session_fee_cents','checkmarks'])
  assert.equal(Object.hasOwn(patch,key),false,'Sync changed staff field '+key);
 assert.equal(patch.external_status,'ACTIVE');
 assert.equal(patch.external_remote_snapshot.customer_name,'Nadine Ahmad');
 assert.equal(patch.external_local_override,undefined);
});
test('a provider change or cancellation warns staff without undoing a local override',()=>{
 const remote=normalizeMatchPointRecord('bookings',booking(4),mapping);
 const existing={
  ...remote,external_local_override:true,external_remote_snapshot:matchpointBookingSnapshot(remote),
  status:'confirmed',booking_start_time:'19:00',booking_end_time:'20:30',
  private_client_id:'client-1',private_session_fee_cents:6000
 };
 const later={...remote,booking_start_time:'20:00',booking_end_time:'21:30'};
 const changed=matchpointProtectedPatch(existing,later,new Date('2026-11-17T09:17:00+02:00'));
 assert.equal(changed.providerChangeDetected,true);
 assert.match(changed.external_alert,/MatchPoint changed/);
 assert.equal(changed.booking_start_time,undefined);
 const cancelled=matchpointProtectedPatch(existing,{...remote,status:'cancelled'},new Date('2026-11-17T09:17:00+02:00'));
 assert.match(cancelled.external_alert,/MatchPoint cancelled/);
 assert.equal(cancelled.status,undefined);
});
test('migration preserves external identity and uses authenticated staff RPCs for local edits',async()=>{
 const {readFile}=await import('node:fs/promises');
 const sql=await readFile(new URL('../supabase/migrations/20261117004000_matchpoint_local_booking_override.sql',import.meta.url),'utf8');
 assert.match(sql,/external_local_override boolean NOT NULL DEFAULT false/);
 assert.match(sql,/external_remote_snapshot jsonb/);
 assert.match(sql,/MatchPoint external identifiers are immutable/);
 assert.match(sql,/app\.matchpoint_local_edit/);
 assert.match(sql,/external_local_override=CASE WHEN external_source='matchpoint' THEN true/);
 assert.match(sql,/v_old\.external_source IS DISTINCT FROM 'matchpoint'/);
 assert.match(sql,/Reverse existing court payments before converting to private training/);
 assert.match(sql,/Completed private training cannot be converted/);
 assert.match(sql,/TO authenticated/);
});
