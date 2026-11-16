import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMatchpointConnection} from '../scripts/matchpoint-connection-check.mjs';

const valid={
 MATCHPOINT_HOST:'https://example.matchpoint.com.es',
 MATCHPOINT_API_TOKEN:'never-print-me',
 MATCHPOINT_COURT_MAP_JSON:JSON.stringify({
  'Court 1':{sport:'padel',court:'C1'},
  'Court 2 (Indoor)':{sport:'padel',court:'C2'},
  'Court 3':{sport:'padel',court:'C3'},
  'Pickleball & Touch Tennis':{sport:'pickleball',court:'P1'},
  'Basketball Court':{sport:'basketball',court:'B1'}
 }),
 SUPABASE_URL:'https://example.supabase.co',
 SUPABASE_SERVICE_ROLE_KEY:'never-print-me-either'
};
const allowed=new Date('2026-11-16T17:20:00+02:00');
const offHours=new Date('2026-11-16T16:20:00+02:00');
const response=(body,status=200)=>({ok:status>=200&&status<300,status,json:async()=>body});
test('preflight reports missing secret names only, without making requests',async()=>{
 let calls=0;
 const env={...valid,MATCHPOINT_API_TOKEN:''};
 await assert.rejects(()=>checkMatchpointConnection({
  env,now:allowed,fetcher:async()=>{calls++;throw Error('No network expected');}
 }),/Missing GitHub Actions secrets: MATCHPOINT_API_TOKEN/);
 assert.equal(calls,0);
});
test('outside the Lebanon schedule no quota claim or MatchPoint call is attempted',async()=>{
 let calls=0;
 const result=await checkMatchpointConnection({env:valid,now:offHours,
  fetcher:async()=>{calls++;throw Error('Unexpected network');},
  logger:{log:()=>{}}});
 assert.equal(result.apiChecked,false);
 assert.equal(calls,0);
});
test('daily cap rejection prevents MatchPoint HTTP traffic',async()=>{
 let claims=0,matchpoint=0;
 const r=await checkMatchpointConnection({env:valid,now:allowed,
  fetcher:async url=>{
   if(String(url).includes('.supabase.co')){claims++;return response(false);}
   matchpoint++;throw Error('Must not issue a MatchPoint request');
  },logger:{log:()=>{}}});
 assert.equal(r.apiChecked,false);
 assert.equal(claims,1);
 assert.equal(matchpoint,0);
});
test('one atomic claim means exactly one MatchPoint call, no customer info in log',async()=>{
 let claims=0,matchpoint=0;
 const logs=[];
 const r=await checkMatchpointConnection({env:valid,now:allowed,
  fetcher:async (url,options)=>{
   if(String(url).includes('.supabase.co')){claims++;assert.equal(options.method,'POST');return response(true);}
   matchpoint++;
   assert.equal(options.headers['X-Api-Token'],valid.MATCHPOINT_API_TOKEN);
   assert.match(String(url),/\/api\/query\/bookings/);
   return response({ok:true,data:[
    {id:1,resourceName:'Court 1',customer:'Private Person',venueCode:'ABC'},
    {id:2,resourceName:'Court 2 (Indoor)',participants:[{name:'Private Person'}]}
   ],hasMore:false});
  },logger:{log:txt=>logs.push(txt)}});
 assert.equal(r.apiChecked,true);
 assert.equal(claims,1);assert.equal(matchpoint,1);
 assert.equal(r.unmapped,0);
 assert(logs.some(x=>x.includes('Court 1 => padel C1')));
 assert(!logs.join(' ').includes('Private Person'));
 assert(!logs.join(' ').includes('never-print-me'));
});

test('a redirect from MatchPoint is not followed and consumes only one quota claim',async()=>{
 let claimed=0,queried=0;
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:()=>{}},
  fetcher:async(url,options)=>{
   if(String(url).includes('.supabase.co')){claimed++;return response(true);}
   queried++;
   assert.equal(options.redirect,'manual','Never forward the API token to a redirected host');
   return response(null,302);
  }
 }),/MatchPoint API returned HTTP 302 redirect/);
 assert.equal(claimed,1);assert.equal(queried,1);
});
test('network errors report safe error codes without leaking token or URL credentials',async()=>{
 let claimed=0,queried=0;
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:()=>{}},
  fetcher:async url=>{
   if(String(url).includes('.supabase.co')){claimed++;return response(true);}
   queried++;throw Object.assign(new TypeError('fetch failed'),{cause:Object.assign(new Error('broken'),{code:'ECONNRESET'})});
  }
 }),error=>{
  assert.match(error.message,/network\/TLS code: ECONNRESET/);
  assert.doesNotMatch(error.message,/never-print-me/);
  assert.doesNotMatch(error.message,/example\.matchpoint\.com/);
  return true;
 });
 assert.equal(claimed,1);assert.equal(queried,1);
});
test('MatchPoint verification workflow is manual-only or has a one-day guarded main-branch trigger',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/matchpoint-connection-check.yml',import.meta.url),'utf8');
 assert.match(yaml,/node scripts\/matchpoint-connection-check\.mjs/);
 assert.doesNotMatch(yaml,/\n\s+(pull_request|schedule):/);
 if(yaml.includes('  push:')){
  assert.match(yaml,/branches: \[main\]/);
  assert.match(yaml,/MATCHPOINT_ONE_TIME_OVERRIDE: '2026-11-16'/);
  assert.match(yaml,/\.github\/workflows\/matchpoint-connection-check\.yml/);
 }else{
  assert.match(yaml,/workflow_dispatch:/);
  assert.doesNotMatch(yaml,/MATCHPOINT_ONE_TIME_OVERRIDE/);
 }
});

test('explicit 2026-11-16 authorization permits one off-window request via dedicated quota claim',async()=>{
 let quotaCalls=0,matchpointCalls=0;
 const logs=[];
 const r=await checkMatchpointConnection({
  env:{...valid,MATCHPOINT_ONE_TIME_OVERRIDE:'2026-11-16'},
  now:new Date('2026-11-16T17:52:00+02:00'),
  logger:{log:text=>logs.push(text)},
  fetcher:async(url,options)=>{
   if(String(url).includes('.supabase.co')){
    quotaCalls++;
    assert.match(String(url),/matchpoint_claim_connection_test_20261116/);
    assert.deepEqual(JSON.parse(options.body),{});
    return response(true);
   }
   matchpointCalls++;
   assert.equal(options.redirect,'manual');
   return response({ok:true,data:[{id:1,resourceName:'Court 1'}],hasMore:false});
  }
 });
 assert.equal(r.apiChecked,true);
 assert.equal(quotaCalls,1);
 assert.equal(matchpointCalls,1);
 assert.equal(r.unmapped,0);
});
test('an override cannot authorize calls on a different calendar date',async()=>{
 let calls=0;
 const r=await checkMatchpointConnection({
  env:{...valid,MATCHPOINT_ONE_TIME_OVERRIDE:'2026-11-16'},
  now:new Date('2026-11-17T17:52:00+02:00'),
  logger:{log:()=>{}},
  fetcher:async()=>{calls++;throw Error('Forbidden');}
 });
 assert.equal(r.apiChecked,false);
 assert.equal(calls,0);
});
test('denied one-time claim results in no MatchPoint request',async()=>{
 let requests=0,claims=0;
 const r=await checkMatchpointConnection({
  env:{...valid,MATCHPOINT_ONE_TIME_OVERRIDE:'2026-11-16'},
  now:new Date('2026-11-16T18:16:00+02:00'),
  logger:{log:()=>{}},
  fetcher:async url=>{
   if(String(url).includes('.supabase.co')){claims++;return response(false);}
   requests++;throw Error('Forbidden after claim denied');
  }
 });
 assert.equal(r.apiChecked,false);
 assert.equal(requests,0);
 assert.equal(claims,1);
});
