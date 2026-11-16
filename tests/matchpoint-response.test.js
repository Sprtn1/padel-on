import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMatchPointPage,matchPointEnvelopeDiagnostics,MatchPointPageError} from '../lib/matchpoint-response.js';
const one={Id:1,Date:'2026-11-16',StartTime:'18:00',EndTime:'19:30',ResourceName:'Court 1',Status:'ACTIVE',Participants:[{Name:'Private person',Email:'private@example.com'}],Payments:[{Amount:100}]};
const envelope={
 Success:true,HasMore:false,Error:null,Data:[one],Total:1,Limit:1000
};
test('PascalCase response is parsed only with success and complete-page evidence',()=>{
 const page=parseMatchPointPage(envelope,{feed:'bookings'});
 assert.equal(page.rows.length,1);
 assert.equal(page.paginationConfirmed,true);
 assert.equal(page.format,'alternate');
 const safe=matchPointEnvelopeDiagnostics(envelope);
 assert.equal(safe.controlValues.success,true);
 assert.equal(safe.controlValues.hasMore,false);
 assert.equal(safe.controlValues.total,1);
 assert.equal(safe.controlValues.data,'array');
 const text=JSON.stringify(safe);
 assert.doesNotMatch(text,/Private person|private@example.com|Amount|Court 1/);
});
test('documented response is backwards-compatible',()=>{
 assert.equal(parseMatchPointPage({ok:true,data:[one],hasMore:false}).count,1);
});
test('rejects implicit success, API errors, partial pages, ambiguous arrays and invalid records',()=>{
 for(const bad of [
  {Data:[one],HasMore:false},
  {...envelope,Success:false},
  {...envelope,Error:'invalid token'},
  {...envelope,HasMore:true},
  {...envelope,HasMore:undefined,Total:5},
  {...envelope,Total:2},
  {...envelope,Data:[{Date:'2026-11-16'}]},
  {Success:true,HasMore:false,First:[one],Second:[one]}
 ])assert.throws(()=>parseMatchPointPage(bad),MatchPointPageError);
});
test('accepts exact total evidence when no hasMore exists only for under-limit pages',()=>{
 const page=parseMatchPointPage({Success:true,Data:[one],Total:1,Error:null},{limit:1000});
 assert.equal(page.count,1);
 assert.throws(()=>parseMatchPointPage({Success:true,Data:[one],Total:2}),MatchPointPageError);
});
test('API errors and any first page that needs pagination stop before imports',()=>{
 assert.throws(()=>parseMatchPointPage({...envelope,HasMore:true}),/requires pagination/);
 assert.throws(()=>parseMatchPointPage({...envelope,Error:{Code:401}}),/indicated an error/);
});
