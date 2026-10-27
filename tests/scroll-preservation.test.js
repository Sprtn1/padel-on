import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {captureScrollPosition,restoreScrollPosition,SCROLL_CONTAINER_SELECTOR}
 from '../lib/scroll-preservation.js';

const node=(className,{id='',key=null,scrollTop=0,scrollLeft=0}={})=>({
 tagName:'DIV',className,id,scrollTop,scrollLeft,
 getAttribute:name=>name==='data-preserve-scroll'?key:null
});
const root=nodes=>({querySelectorAll:selector=>{
 assert.equal(selector,SCROLL_CONTAINER_SELECTOR);return nodes;
}});
const viewport=(x=0,y=0)=>({scrollX:x,scrollY:y,calls:[],
 scrollTo(values){this.calls.push(values);this.scrollX=values.left;this.scrollY=values.top}
});

test('Keeps both page and nested table scroll positions through a redraw',()=>{
 const before=root([
  node('data-table-wrap',{scrollLeft:215}),
  node('tm-bracket-scroll',{scrollLeft:850,scrollTop:330}),
  node('private-client-list',{scrollTop:440})
 ]);
 const snapshot=captureScrollPosition(before,viewport(0,960));
 const after=root([node('data-table-wrap'),node('tm-bracket-scroll'),node('private-client-list')]);
 const win=viewport();
 restoreScrollPosition(after,win,snapshot);
 assert.deepEqual(win.calls,[{left:0,top:960,behavior:'instant'}]);
 assert.deepEqual(after.querySelectorAll(SCROLL_CONTAINER_SELECTOR).map(x=>[x.scrollLeft,x.scrollTop]),
  [[215,0],[850,330],[0,440]]);
});
test('Repeated table wrappers match by class position, even after other widgets move',()=>{
 const original=root([
  node('data-table-wrap',{scrollLeft:45}),node('tm-selector',{scrollLeft:12}),
  node('data-table-wrap',{scrollLeft:130})
 ]);
 const saved=captureScrollPosition(original,viewport());
 const next=root([node('data-table-wrap'),node('cafe-auto-payments-wrap'),node('data-table-wrap')]);
 restoreScrollPosition(next,viewport(),saved);
 assert.deepEqual(next.querySelectorAll(SCROLL_CONTAINER_SELECTOR).map(x=>x.scrollLeft),[45,0,130]);
});
test('Explicit scroll keys survive reorder; zero position does not jump the viewport',()=>{
 const saved=captureScrollPosition(root([
  node('scroll-card',{key:'right',scrollTop:123}),node('scroll-card',{key:'left',scrollTop:321})
 ]),viewport());
 const next=root([node('scroll-card',{key:'left'}),node('scroll-card',{key:'right'})]);
 const win=viewport();
 restoreScrollPosition(next,win,saved);
 assert.deepEqual(next.querySelectorAll(SCROLL_CONTAINER_SELECTOR).map(x=>x.scrollTop),[321,123]);
 assert.equal(win.calls.length,0);
 assert.doesNotThrow(()=>restoreScrollPosition(next,win,null));
});
test('Auto refresh skips redundant paints and respects ongoing user scroll gestures',()=>{
 const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(source,/html===lastRenderedMarkup\)return/);
 assert.match(source,/captureScrollPosition\(app,window\)/);
 assert.match(source,/restoreScrollPosition\(app,window,scroll\)/);
 assert.match(source,/lastRenderedTab===state\.tab/);
 assert.match(source,/lastScrollAt=Date\.now\(\)/);
 assert.match(source,/Date\.now\(\)-lastScrollAt>1400/);
 assert.match(source,/!autoRefreshRunning&&canAutoRender\(\)\)render\(\)/);
 assert.match(source,/lastRenderedMarkup=null;lastRenderedTab=null/);
});
