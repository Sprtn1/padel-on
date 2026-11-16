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
