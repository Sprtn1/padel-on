import test from 'node:test';
import assert from 'node:assert/strict';
import {checkMatchpointConnection,summarizeMatchpointJsonShape} from '../scripts/matchpoint-connection-check.mjs';

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
test('API connection workflow is manual-only after the one-time test',async()=>{
 const {readFile}=await import('node:fs/promises');
 const yaml=await readFile(new URL('../.github/workflows/matchpoint-connection-check.yml',import.meta.url),'utf8');
 assert.match(yaml,/node scripts\/matchpoint-connection-check\.mjs/);
 assert.match(yaml,/workflow_dispatch:/);
 assert.doesNotMatch(yaml,/\n\s+(push|pull_request|schedule):/);
});

test('redirect diagnostic classifies same-host login without revealing Location query',async()=>{
 const messages=[];
 const response=(value,status=200)=>({ok:status>=200&&status<300,status,json:async()=>value});
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:msg=>messages.push(msg)},
  fetcher:async(url,opts)=>{
   if(String(url).includes('.supabase.co'))return response(true);
   assert.equal(opts.redirect,'manual');
   return {ok:false,status:302,headers:{get:key=>key==='location'?'/Login.aspx?token=DO_NOT_LEAK':null}};
  }
 }),err=>{
  assert.match(err.message,/302 redirect to same-host login page/);
  assert.doesNotMatch(err.message,/DO_NOT_LEAK|Login.aspx/);
  return true;
 });
 assert.doesNotMatch(messages.join(' '),/DO_NOT_LEAK/);
});
test('redirect to a different host is reported only as different host, without forwarding token',async()=>{
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:()=>{}},
  fetcher:async url=>String(url).includes('.supabase.co')?response(true):
   {ok:false,status:302,headers:{get:key=>key==='location'?'https://somewhere.example/Login.aspx?access=secret-code':null}}
 }),err=>{
  assert.match(err.message,/302 redirect to different host/);
  assert.doesNotMatch(err.message,/somewhere.example|secret-code/);
  return true;
 });
});

test('workflow pins the explicitly provided API host, not the app login site',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const path of ['matchpoint-connection-check.yml','matchpoint-reservations-sync.yml']){
  const yaml=await readFile(new URL('../.github/workflows/'+path,import.meta.url),'utf8');
  assert.match(yaml,/MATCHPOINT_HOST: (?:https:\/\/padelon-lb\.matchpoint\.com\.es|\$\{\{ secrets\.MATCHPOINT_HOST \}\})/);
  assert.doesNotMatch(yaml,/MATCHPOINT_HOST:.*app-padelon-lb/);
 }
});

test('HTTP 200 JSON that is not the documented envelope is diagnosed without exposing secrets or customer data',async()=>{
 const logs=[];
 let claimed=0,requested=0;
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:msg=>logs.push(msg)},
  fetcher:async(url)=>{
   if(String(url).includes('.supabase.co')){claimed++;return response(true);}
   requested++;
   return response({ok:false,error:'DO_NOT_LEAK_PERSONAL_DATA',data:{customer:'Private Person'},hasMore:false});
  }
 }),/HTTP 200 but JSON does not match documented/);
 assert.equal(claimed,1);assert.equal(requested,1);
 assert(logs.some(msg=>msg.includes('root=object; ok=boolean (false); data=object; error=string')));
 assert.doesNotMatch(logs.join(' '),/DO_NOT_LEAK_PERSONAL_DATA|Private Person|never-print-me/);
});

test('manual diagnostic does not retain the one-day bypass or auto-trigger',async()=>{
 const {readFile}=await import('node:fs/promises');
 const script=await readFile(new URL('../scripts/matchpoint-connection-check.mjs',import.meta.url),'utf8');
 const workflow=await readFile(new URL('../.github/workflows/matchpoint-connection-check.yml',import.meta.url),'utf8');
 assert.doesNotMatch(script,/MATCHPOINT_ONE_TIME_DIAGNOSTIC|matchpoint_claim_checknow_20261116/);
 assert.doesNotMatch(workflow,/MATCHPOINT_ONE_TIME_DIAGNOSTIC/);
 assert.match(workflow,/workflow_dispatch:/);
 assert.doesNotMatch(workflow,/\n\s+(push|pull_request|schedule):/);
});

test('undocumented JSON structure summary exposes shapes, not field names or private values',()=>{
 const data={
  'Customer Confidential':{
   'records':[{
    date:'2026-11-16',startTime:'19:30',endTime:'21:00',resourceName:'Court 1',
    participants:[{name:'PERSON_DO_NOT_LOG',email:'private@example.test'}],
    payments:[{amount:500,payMethod:'CARD_SECRET'}]
   }]
  },
  secret:'Example Test User'
 };
 const summary=summarizeMatchpointJsonShape(data);
 assert.equal(summary.rootKind,'object');
 assert.equal(summary.topLevelFieldCount,2);
 assert.equal(summary.bookingLikeObjects,1);
 assert(summary.nonemptyArrays>=1);
 const logged=JSON.stringify(summary);
 for(const sensitive of ['Customer Confidential','PERSON_DO_NOT_LOG','private@example.test','Example Test User','CARD_SECRET'])
  assert(!logged.includes(sensitive),sensitive+' leaked');
});
test('empty or permission-error JSON object produces informative shape-only diagnostics',()=>{
 const empty=summarizeMatchpointJsonShape({});
 assert.equal(empty.topLevelFieldCount,0);
 assert.equal(empty.valueKinds.object,1);
 const denied=summarizeMatchpointJsonShape({unknown:'Invalid token for Query API',blob:'<!doctype html><form>'});
 assert.equal(denied.topLevelFieldCount,2);
 assert.equal(denied.hasAuthOrPermissionText,true);
 assert.equal(denied.hasHtmlText,true);
 assert.doesNotMatch(JSON.stringify(denied),/Invalid token|doctype html|unknown|blob/);
});
test('the live mismatch diagnostic includes privacy-safe structural summary without another request',async()=>{
 const messages=[];let apiCalls=0;
 await assert.rejects(()=>checkMatchpointConnection({
  env:valid,now:allowed,logger:{log:s=>messages.push(s)},
  fetcher:async(url)=>{
   if(String(url).includes('.supabase.co'))return response(true);
   apiCalls++;
   return response({'undocumentedWrapper':{records:[{date:'2026-11-16',startTime:'09:00',endTime:'10:00',resourceName:'Court 2',name:'PERSON_DO_NOT_LOG'}]}});
  }
 }),/HTTP 200 but JSON does not match documented/);
 assert.equal(apiCalls,1);
 assert(messages.some(m=>m.includes('MatchPoint safe structural summary:')&&m.includes('"bookingLikeObjects":1')));
 assert(!messages.join(' ').includes('PERSON_DO_NOT_LOG'));
});

test('deeper structural metadata recognizes case-insensitive English and Spanish timing fields without leaking their values',()=>{
 const sample={
  privateCompanyName:'DO_NOT_DISCLOSE_CUSTOMER',
  calendar:{scope:{days:[{services:{times:[{
   Fecha:'2026-11-16',HoraInicio:'09:00',HoraFin:'10:00',Pista:'Court 1',
   participants:[{name:'PRIVATE CLIENT',email:'private@example.com'}]
  }]}}]}}
 };
 const summary=summarizeMatchpointJsonShape(sample);
 assert.equal(summary.rootKind,'object');
 assert.equal(summary.objectsWithTimingFields,1);
 assert.equal(summary.bookingFieldMatches.fecha,1);
 assert.equal(summary.bookingFieldMatches.horainicio,1);
 assert.equal(summary.bookingFieldMatches.horafin,1);
 assert(summary.nonemptyArrays>0);
 const logged=JSON.stringify(summary);
 for(const sensitive of ['DO_NOT_DISCLOSE_CUSTOMER','PRIVATE CLIENT','private@example.com','privateCompanyName'])
  assert(!logged.includes(sensitive));
});
test('nested metadata is bounded and reveals shapes but no user-defined root keys',()=>{
 const obj={['PRIVATE USER NAME']:[{secretValue:'very secret',Slots:[{StartTime:'10:00',EndTime:'11:00'}]}]};
 const shape=summarizeMatchpointJsonShape(obj);
 assert.equal(shape.topLevelFieldCount,1);
 assert.equal(shape.topLevelValueTypes.array,1);
 assert.equal(shape.objectsWithTimingFields,1);
 assert(!JSON.stringify(shape).includes('PRIVATE USER NAME'));
 assert(!JSON.stringify(shape).includes('very secret'));
});
