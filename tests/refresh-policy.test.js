import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AUTO_REFRESH_INTERVAL_MS,PAGE_REFRESH_INTERVALS_MS,
 pageRefreshIntervalMs,isPageRefreshDue} from '../lib/refresh-policy.js';

const everyPage=['dashboard','cafeteria-finances','debts','private-clients',
 'team','training','other','finance','tournament','activity','reports',
 'settings','order-counter','reem-items'];

test('All real navigation pages have exactly the same 30-second auto refresh cadence',()=>{
 assert.equal(AUTO_REFRESH_INTERVAL_MS,30_000);
 assert.deepEqual(Object.keys(PAGE_REFRESH_INTERVALS_MS).sort(),everyPage.slice().sort());
 for(const tab of everyPage){
  assert.equal(pageRefreshIntervalMs(tab),30_000,tab);
  assert.equal(isPageRefreshDue(tab,1000,30_999),false,tab);
  assert.equal(isPageRefreshDue(tab,1000,31_000),true,tab);
 }
});

test('Unknown or additional pages use the same 30-second interval, not a slower fallback',()=>{
 assert.equal(pageRefreshIntervalMs('new-feature'),30_000);
 assert.equal(isPageRefreshDue('new-feature',100,30_100),true);
});

test('Invalid clock or backwards time does not accidentally cause a refresh',()=>{
 assert.equal(isPageRefreshDue('dashboard',1000,900),false);
 assert.equal(isPageRefreshDue('dashboard',NaN,9000),false);
 assert.equal(isPageRefreshDue('dashboard',1000,Infinity),false);
 assert.equal(Object.isFrozen(PAGE_REFRESH_INTERVALS_MS),true);
});

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
function mockAllPageClock(){
 const from=source.indexOf('// All authenticated page datasets share one 30-second sync interval.');
 const to=source.indexOf('setInterval(()=>{',from);
 assert.ok(from>=0&&to>from,'Find live all-page refresh implementation');
 const snippet=source.slice(from,to);
 const seen=[],warnings=[],clock={value:0};
 const state={staff:{id:'test-staff'},tab:'team',modal:null,loading:false,historyWeek:'2026-10-06'};
 const document={hidden:false};
 let canPaint=true,token=true,editing=false,slowLoad=null;
 const record=(name)=>async(...args)=>{seen.push([name,...args]);if(name==='shared'&&slowLoad)await slowLoad;};
 const args={
  api:{configured:true,getSession:()=>token?{access_token:'staff-session'}:null},
  state,document,Date:{now:()=>clock.value},
  refreshPolicy:{isPageRefreshDue:(tab,from,to)=>to-from>=30_000},
  idleExpired:()=>false,
  canAutoRender:()=>canPaint&&!editing,
  loadData:record('shared'),
  cafeteriaFinances:{load:record('cafeteria')},
  tournamentManagement:{load:record('tournament')},
  loadPrivateClients:record('private'),
  loadDebtData:record('debts'),
  loadTrainingMonth:record('training'),
  loadOverviewTraining:record('attendance'),
  clubInsights:{loadOverview:record('financial-overview')},
  loadReport:record('reports'),
  fetchPeriod:async(...a)=>{seen.push(['historical-week',...a]);return {matches:[]}},
  weekStart:()=> '2026-10-19',
  today:()=> '2026-10-25',
  addDays:(d,n)=>d+':'+n,
  render:()=>seen.push(['render']),
  console:{warn:(...a)=>warnings.push(a)},
  orderCounter:{refreshOrderCounterFromStorage:owner=>seen.push(['order-counter',owner])},
  reemItems:{refreshReemItemsFromStorage:owner=>seen.push(['reem-items',owner])}
 };
 const names=Object.keys(args);
 const build=new Function(...names,`
  let idleLogoutStarted=false,working=false,historySeq=0,autoRefreshRunning=false;
  ${snippet}
  return {run:refreshAllPagesWhenDue,busy:()=>allDataRefreshBusy};
 `);
 const controller=build(...names.map(name=>args[name]));
 return {clock,state,document,seen,warnings,controller,
  setToken:value=>{token=value},
  setEditing:value=>{editing=value},
  setPaint:value=>{canPaint=value},
  setSlowLoad:value=>{slowLoad=value}
 };
}

test('Every 30-second sync fetches ALL independent page data, not only the open tab',async()=>{
 const m=mockAllPageClock();
 m.clock.value=29_999;
 assert.equal(await m.controller.run(),false);
 assert.equal(m.seen.length,0);
 m.clock.value=30_000;
 assert.equal(await m.controller.run(),true);
 const names=m.seen.map(x=>x[0]);
 for(const category of ['shared','cafeteria','tournament','private','debts',
  'training','attendance','financial-overview','reports','historical-week',
  'order-counter','reem-items','render'])
  assert.ok(names.includes(category),'Missing background sync: '+category);
 assert.deepEqual(m.seen.find(x=>x[0]==='shared').slice(1),
  [false,{background:true}]);
 assert.deepEqual(m.seen.find(x=>x[0]==='cafeteria').slice(1),[true,true]);
 assert.deepEqual(m.seen.find(x=>x[0]==='tournament').slice(1),[true,true]);
 assert.deepEqual(m.seen.find(x=>x[0]==='reports').slice(1),[{background:true}]);
 assert.equal(names.filter(x=>x==='render').length,1,'Exactly one final page repaint');
 assert.equal(m.controller.busy(),false);
 assert.equal(await m.controller.run(),false,'No duplicate poll in same window');
 m.clock.value=60_000;
 assert.equal(await m.controller.run(),true,'Next 30-second window starts another full sync');
 assert.equal(m.seen.filter(x=>x[0]==='shared').length,2);
 assert.equal(m.warnings.length,0);
});

test('All-page sync preserves focused forms, skips hidden tabs, and respects authentication',async()=>{
 const m=mockAllPageClock();
 m.setEditing(true);
 m.clock.value=30_000;
 assert.equal(await m.controller.run(),true);
 assert.equal(m.seen.filter(x=>x[0]==='render').length,0,
  'Data should be updated, but do not replace an unsaved form');
 m.document.hidden=true;
 m.clock.value=60_000;
 assert.equal(await m.controller.run(),false);
 assert.equal(m.seen.filter(x=>x[0]==='shared').length,1);
 m.document.hidden=false;
 m.setEditing(false);
 assert.equal(await m.controller.run(),true,'Refresh promptly upon tab becoming visible');
 assert.equal(m.seen.filter(x=>x[0]==='render').length,1);
 m.setToken(false);
 m.clock.value=90_000;
 assert.equal(await m.controller.run(),false);
 assert.equal(m.seen.filter(x=>x[0]==='shared').length,2);
});

test('The 30-second timer does not start overlapping network refreshes',async()=>{
 const m=mockAllPageClock();
 let release;
 m.setSlowLoad(new Promise(resolve=>{release=resolve}));
 m.clock.value=30_000;
 const first=m.controller.run();
 assert.equal(m.controller.busy(),true);
 m.clock.value=60_000;
 assert.equal(await m.controller.run(),false,'Skip overlapping polling while one sync is running');
 release();
 assert.equal(await first,true);
 assert.equal(m.controller.busy(),false);
 assert.equal(m.seen.filter(x=>x[0]==='shared').length,1);
});
