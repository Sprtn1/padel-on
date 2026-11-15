import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCourtMap,normalizeMatchPointRecord,pickNonDuplicate} from '../lib/matchpoint-normalize.js';
import {runMatchPointSync} from '../scripts/matchpoint-sync.mjs';

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
