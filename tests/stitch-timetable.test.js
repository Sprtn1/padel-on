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
