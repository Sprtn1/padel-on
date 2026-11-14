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
test('slot brush keeps 09:00–01:00 business boundary and a max twelve-hour range',async()=>{
 const {courtSchedulerSelection}=await import('../lib/court-scheduler-ui.js');
 const last=courtSchedulerSelection(1499,1499);
 assert.equal(last.startMinute,1470);
 assert.equal(last.endMinute,1500);
 const long=courtSchedulerSelection(540,1470,true);
 assert.equal(long.durationMinutes,720);
 assert.equal(long.startMinute,540);
 assert.equal(long.endMinute,1260);
});
test('current-time indicator is an overlay and cannot create an extra grid row',async()=>{
 const {readFileSync}=await import('node:fs');
 const css=readFileSync(new URL('../styles/stitch-timetable.css',import.meta.url),'utf8');
 assert.match(css,/\.cafe-scheduler \.cafe-timeboard\{position:relative\}/);
 assert.match(css,/\.ck-schedule-now\{position:absolute;left:0;right:0;/);
 assert.doesNotMatch(css,/\.ck-schedule-now\{[^}]*grid-row:/);
});
