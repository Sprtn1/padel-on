import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCourtMap,normalizeMatchPointRecord,pickNonDuplicate} from '../lib/matchpoint-normalize.js';
import {runMatchPointSync,matchpointLebanonSlot} from '../scripts/matchpoint-sync.mjs';

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
 }),/has more than 1,000 records/);
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
