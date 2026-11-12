import test from 'node:test';
import assert from 'node:assert/strict';
import {sevenDayActivity} from '../lib/activity-visualizations.js';
const addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
test('Seven-day chart counts existing ledgers separately without mutating transactions',()=>{
 const source={
  teamMatches:[{played_on:'2026-11-10',id:'a'},{played_on:'2026-11-11',voided_at:'x'},{played_on:'2026-11-01'}],
  specialGames:[{played_on:'2026-11-10'}],
  matchmaking:[{played_on:'2026-11-10'},{played_on:'2026-11-10',deleted_at:'x'}],
  privateEntries:[{entry_date:'2026-11-10',entry_type:'session'}, {entry_date:'2026-11-10',entry_type:'deposit'}]
 };
 const snapshot=JSON.stringify(source);
 const rows=sevenDayActivity('2026-11-12',source,addDays);
 assert.equal(rows.length,7);
 assert.equal(rows[0].date,'2026-11-06');
 assert.deepEqual(rows.find(x=>x.date==='2026-11-10'),{
  date:'2026-11-10',team:1,special:1,matchmaking:1,sessions:1,total:4
 });
 assert.equal(rows.reduce((n,r)=>n+r.total,0),4);
 assert.equal(JSON.stringify(source),snapshot);
});
test('No activity returns safe seven-day zero series',()=>{
 const rows=sevenDayActivity('2026-11-12',{},addDays);
 assert.equal(rows.length,7);assert.ok(rows.every(r=>r.total===0));
});
