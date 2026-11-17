import test from 'node:test';
import assert from 'node:assert/strict';
import {courtCurrentTimeBeirut} from '../lib/court-scheduler-ui.js';
import {addDays} from '../lib/date.js';
test('current-time line follows Asia/Beirut and matches the selected business date',()=>{
 const line=courtCurrentTimeBeirut('2026-11-14',addDays,new Date('2026-11-14T13:25:00Z'));
 assert.equal(line?.label,'15:25');
 assert.equal(line?.topPx,Math.round((15*60+25-9*60)*56/60));
 assert.equal(courtCurrentTimeBeirut('2026-11-13',addDays,new Date('2026-11-14T13:25:00Z')),null);
});
test('after midnight through 00:59 belongs to the prior court business day',()=>{
 const line=courtCurrentTimeBeirut('2026-11-14',addDays,new Date('2026-11-14T22:30:00Z'));
 assert.equal(line?.label,'00:30');
 assert.equal(line?.topPx,Math.round((24*60+30-9*60)*56/60));
 assert.equal(courtCurrentTimeBeirut('2026-11-15',addDays,new Date('2026-11-14T22:30:00Z')),null);
 assert.equal(courtCurrentTimeBeirut('2026-11-14',addDays,new Date('2026-11-14T23:30:00Z')),null);
});

test('slot brush snaps both edges to half hours',async()=>{
 const {courtSchedulerSelection}=await import('../lib/court-scheduler-ui.js');
 assert.deepEqual(courtSchedulerSelection(9*60+17,11*60+16,true),
  {startMinute:540,endMinute:690,durationMinutes:150,topPx:0,heightPx:140});
 const backwards=courtSchedulerSelection(13*60+10,11*60+40,true);
 assert.equal(backwards.startMinute,690);
 assert.equal(backwards.endMinute,810);
 assert.equal(backwards.durationMinutes,120);
});
test('slot brush keeps 09:00–01:00 business boundary and supports a full sixteen-hour range',async()=>{
 const {courtSchedulerSelection}=await import('../lib/court-scheduler-ui.js');
 const last=courtSchedulerSelection(1499,1499);
 assert.equal(last.startMinute,1470);
 assert.equal(last.endMinute,1500);
 const long=courtSchedulerSelection(540,1470,true);
 assert.equal(long.durationMinutes,960);
 assert.equal(long.startMinute,540);
 assert.equal(long.endMinute,1500);
});
test('mobile bookings align with the hour grid, including overlapping reservations',async()=>{
 const {padelCourtTimeGrid}=await import('../lib/court-timetable.js');
 const rows=[
  ['C1','16:30','18:00'],
  ['C3','18:30','19:30'],
  ['C3','19:30','21:00'],
  ['C3','20:00','21:30']
 ].map(([court,start,end],index)=>({id:'mobile-'+index,category:'padel_courts',court_number:court,
  name:'Booking '+index,booking_start_time:start+':00',booking_end_time:end+':00',amount_cents:3200}));
 const grid=padelCourtTimeGrid(rows,'padel');
 const court1=grid.columns.find(column=>column.court==='C1').bookings;
 const court3=grid.columns.find(column=>column.court==='C3').bookings;
 assert.deepEqual(court1.map(x=>[x.topPx,x.heightPx]),[[420,84]]); // 16:30–18:00
 assert.deepEqual(court3.map(x=>[x.topPx,x.heightPx,x.tracks]),[
  [532,56,1], // 18:30–19:30
  [588,84,2], // 19:30–21:00
  [616,84,2]  // 20:00–21:30
 ]);
 assert.equal(court3[0].topPx+court3[0].heightPx,court3[1].topPx);
 assert.equal(court1[0].topPx+court1[0].heightPx,9*56); // 18:00 axis
});

test('current-time indicator is an overlay and cannot create an extra grid row',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../styles/stitch-timetable.css',import.meta.url),'utf8');
 assert.match(css,/\.cafe-scheduler \.cafe-timeboard\{position:relative\}/);
 assert.match(css,/\.ck-schedule-now\{position:absolute;left:0;right:0;/);
 assert.doesNotMatch(css,/\.ck-schedule-now\{[^}]*grid-row:/);
});


test('all visible player ticks are required across sports, regardless of cash allocation',async()=>{
 const {courtBookingAllPlayersMarked:paid}=await import('../lib/court-scheduler-ui.js');
 const t=true,f=false;
 assert.equal(paid({checkmarks:[t,t,t,t,f,f]},'padel'),true);
 assert.equal(paid({checkmarks:[t,t,t,f,f,f]},'padel'),false);
 assert.equal(paid({checkmarks:[t,t]},'padel'),false);
 assert.equal(paid({checkmarks:[]},'padel'),false);
 assert.equal(paid({checkmarks:null,amount_cents:3200},'padel'),false);
 assert.equal(paid({checkmarks:[t,t,f,f,f,f],pickleball_player_count:2},'pickleball'),true);
 assert.equal(paid({checkmarks:[t,f,f,f,f,f],pickleball_player_count:2},'pickleball'),false);
 assert.equal(paid({checkmarks:[t,t,f,f,f,f],pickleball_player_count:4},'pickleball'),false);
 assert.equal(paid({checkmarks:[t,t,t,t,f,f],pickleball_player_count:4},'pickleball'),true);
 assert.equal(paid({checkmarks:[t,t,t,t,t,t]},'basketball'),true);
 assert.equal(paid({checkmarks:[t,t,t,t,t,f]},'basketball'),false);
 assert.equal(paid({checkmarks:[t,t]},'pickleball',{ledger:true}),true);
 assert.equal(paid({checkmarks:[t,t]},'pickleball'),false);
 assert.equal(paid({checkmarks:['true',t,t,t]},'padel'),false);
});
test('fully marked bookings use distinct color with a matching legend and dark theme',async()=>{
 const {readFileSync}=await import('node:fs');
 const js=readFileSync(new URL('../lib/court-scheduler-ui.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles/stitch-timetable.css',import.meta.url),'utf8');
 assert.match(js,/const allMarked=!isTraining&&!isBlock&&courtBookingAllPlayersMarked\(row,sport/);
 assert.match(js,/isTraining\?'schedule-training':isBlock\?'schedule-block':allMarked\?'schedule-paid':planned/);
 assert.match(js,/class="schedule-paid">All players marked paid/);
 assert.match(css,/\.cafe-timeboard-booking\.schedule-paid\{background:#176847/);
 assert.match(css,/html\[data-theme="dark"\] \.cafe-scheduler \.cafe-timeboard-booking\.schedule-paid\{background:#087447/);
});
