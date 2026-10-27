import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInFlightCoalescer} from '../lib/inflight-reads.js';

test('Concurrent requests for the same dataset share a single network operation',async()=>{
 const join=createInFlightCoalescer();
 let calls=0,release;
 const gate=new Promise(resolve=>{release=resolve});
 const request=async()=>{calls++;await gate;return [1,2]};
 const first=join('staffA:private-clients',request);
 const second=join('staffA:private-clients',request);
 assert.strictEqual(second,first);
 await Promise.resolve();
 assert.equal(calls,1);
 release();
 assert.deepEqual(await Promise.all([first,second]),[[1,2],[1,2]]);
 await join('staffA:private-clients',request);
 assert.equal(calls,2,'Completed reads must never be cached');
});

test('Distinct account, table and filter keys do not share their results',async()=>{
 const join=createInFlightCoalescer();
 const keys=['account-a|staff_profiles|id=1','account-b|staff_profiles|id=1',
  'account-a|team_members|','account-a|team_members|active=eq.true'];
 const results=await Promise.all(keys.map(key=>join(key,async()=>key)));
 assert.deepEqual(results,keys);
});

test('Rejected reads are removed so a later polling cycle can retry',async()=>{
 const join=createInFlightCoalescer();
 let calls=0;
 const bad=()=>{calls++;throw Error('offline')};
 await assert.rejects(join('cashbook',bad),/offline/);
 await assert.rejects(join('cashbook',bad),/offline/);
 assert.equal(calls,2);
 assert.equal(await join('cashbook',async()=>42),42);
});

test('Supabase client uses session-isolated in-flight deduplication, not persistent data caching',()=>{
 const src=readFileSync(new URL('../lib/api.js',import.meta.url),'utf8');
 assert.match(src,/coalesceListAll\(key,async\(\)=>/);
 assert.match(src,/session\?\.access_token/);
 assert.match(src,/Range:/);
 assert.match(src,/page>100/);
 assert.doesNotMatch(src,/setInterval|setTimeout/);
});
