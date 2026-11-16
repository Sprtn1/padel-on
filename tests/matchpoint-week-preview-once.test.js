import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {runMatchPointSync} from '../scripts/matchpoint-sync.mjs';

test('one-time week imports only bookings for seven-day forward window and claims exactly one API request',async()=>{
 const env={
  MATCHPOINT_HOST:'https://padelon-lb.matchpoint.com.es',
  MATCHPOINT_API_TOKEN:'private-secret',
  MATCHPOINT_COURT_MAP_JSON:JSON.stringify({'Court 1':{sport:'padel',court:'C1'}}),
  SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'private-service',
  MATCHPOINT_FEEDS:'bookings',MATCHPOINT_EXTENDED_SCAN:'false',
  MATCHPOINT_ONE_TIME_WEEK:'2026-11-16',MATCHPOINT_LOOKAHEAD_DAYS:'7'
 };
 const calls=[],writes=[];
 const response=(body)=>({ok:true,status:200,text:async()=>JSON.stringify(body),json:async()=>body});
 const booking={Id:77,Date:'2026-11-17',StartTime:'18:00',EndTime:'19:30',
  ResourceName:'Court 1',Status:'ACTIVE',Participants:[{Name:'PRIVATE CLIENT',Email:'hidden@example.test'}]};
 const result=await runMatchPointSync({
  env,now:new Date('2026-11-17T00:05:00+02:00'),logger:{log:()=>{},warn:()=>{}},
  fetcher:async(url,options={})=>{
   const u=new URL(url),path=u.pathname;calls.push(path);
   if(path==='/api/query/bookings'){
    assert.equal(u.searchParams.get('dateFrom'),'2026-11-17');
    assert.equal(u.searchParams.get('dateTo'),'2026-11-24');
    return response({Ok:true,HasMore:false,Error:null,Offset:0,Limit:1000,Data:[booking]});
   }
   if(path.endsWith('/matchpoint_claim_week_preview_20261116')){
    assert.deepEqual(JSON.parse(options.body),{});
    return response(true);
   }
   if(path.endsWith('/matchpoint_sync_status')){
    if(options.method==='PATCH'){writes.push({path,body:JSON.parse(options.body)});return response([{id:1}]);}
    return response([{id:1,last_run_at:null}]);
   }
   if(path.endsWith('/court_payment_splits'))return response([]);
   if(path.endsWith('/padel_court_reservations')){
    if(options.method==='POST'){
     const rows=JSON.parse(options.body);writes.push({path,body:rows});
     return response([{...rows[0],id:'imported-id'}]);
    }
    return response([]);
   }
   throw Error('Unexpected network request '+path);
  }
 });
 assert.equal(result.inserted,1);
 assert.equal(result.from,'2026-11-17');
 assert.equal(result.to,'2026-11-24');
 assert.equal(calls.filter(x=>x==='/api/query/bookings').length,1);
 assert.equal(calls.filter(x=>x.endsWith('matchpoint_claim_week_preview_20261116')).length,1);
 assert.equal(calls.filter(x=>x.startsWith('/api/query/')).length,1);
 const imported=writes.find(x=>x.path.endsWith('/padel_court_reservations')).body[0];
 assert.equal(imported.external_source,'matchpoint');
 assert.equal(imported.customer_name,'PRIVATE CLIENT');
 for(const sensitive of ['email','payments','amount_cents','cash_cents','whish_cents'])assert.equal(imported[sensitive],undefined);
});
test('temporary one-off workflow runs only on trusted main push, not on timer or request',async()=>{
 const yaml=await readFile(new URL('../.github/workflows/matchpoint-week-preview-once.yml',import.meta.url),'utf8');
 assert.match(yaml,/branches: \[main\]/);
 assert.match(yaml,/MATCHPOINT_ONE_TIME_WEEK: '2026-11-16'/);
 assert.match(yaml,/MATCHPOINT_FEEDS: 'bookings'/);
 assert.match(yaml,/MATCHPOINT_LOOKAHEAD_DAYS: '7'/);
 assert.doesNotMatch(yaml,/\n\s+(schedule|workflow_dispatch|pull_request):/);
});
