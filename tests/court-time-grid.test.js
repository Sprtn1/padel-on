import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {
 COURT_GRID_HOURS,COURT_GRID_HEIGHT,COURT_GRID_HOUR_HEIGHT,
 COURT_GRID_START_MINUTES,COURT_GRID_END_MINUTES,
 padelCourtTimeGrid
} from '../lib/court-timetable.js';

const entry=(id,court,start,end,checkmarks=[false,false,false,false])=>({
 id,category:'padel_courts',court_number:court,name:id,
 booking_start_time:start,booking_end_time:end,checkmarks,amount_cents:3200
});
const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Court grid runs continuously from 09:00 to 01:00 next day with 17 exact hour lines',()=>{
 assert.equal(COURT_GRID_START_MINUTES,540);
 assert.equal(COURT_GRID_END_MINUTES,1500);
 assert.equal(COURT_GRID_HEIGHT,16*COURT_GRID_HOUR_HEIGHT);
 assert.equal(COURT_GRID_HOURS.length,17);
 assert.equal(COURT_GRID_HOURS[0].label,'09:00');
 assert.equal(COURT_GRID_HOURS.at(-1).label,'01:00 +1');
 assert.equal(COURT_GRID_HOURS.at(-1).topPx,COURT_GRID_HEIGHT);
 assert.deepEqual(COURT_GRID_HOURS.slice(-3).map(row=>row.label),['23:00','00:00 +1','01:00 +1']);
});

test('Booking positions follow exact start/end minutes and preserve midnight durations',()=>{
 const grid=padelCourtTimeGrid([
  entry('morning','C1','09:00:00','10:00:00',[true,true,true,true]),
  entry('evening','C2','22:30:00','00:00:00',[true,false,true,false]),
  entry('midnight','C3','00:30:00','01:00:00',[false,false,false,false]),
  entry('clip','C1','00:30:00','01:30:00')
 ]);
 const find=id=>grid.columns.flatMap(l=>l.bookings).find(e=>e.id===id);
 assert.equal(find('morning').topPx,0);
 assert.equal(find('morning').heightPx,COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('morning').paymentState,'all');
 assert.equal(find('evening').topPx,13.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('evening').heightPx,1.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('evening').paymentState,'some');
 assert.equal(find('midnight').topPx,15.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('midnight').heightPx,.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('midnight').paymentState,'none');
 assert.equal(find('clip').topPx,15.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('clip').heightPx,.5*COURT_GRID_HOUR_HEIGHT);
 assert.equal(find('clip').clipped,true);
 assert.equal(grid.heightPx,COURT_GRID_HEIGHT);
});

test('Simultaneous bookings share court width, consecutive bookings do not',()=>{
 const grid=padelCourtTimeGrid([
  entry('a','C1','18:00','19:00'),
  entry('b','C1','18:30','19:30'),
  entry('c','C1','19:30','20:30'),
  entry('d','C2','18:00','19:00')
 ]);
 const a=grid.columns[0].bookings.find(x=>x.id==='a');
 const b=grid.columns[0].bookings.find(x=>x.id==='b');
 const c=grid.columns[0].bookings.find(x=>x.id==='c');
 assert.equal(a.tracks,2);assert.equal(b.tracks,2);
 assert.notEqual(a.track,b.track);
 assert.equal(c.tracks,1);
 assert.equal(grid.columns[1].bookings[0].tracks,1);
});

test('Unassigned/outside-hour/legacy times remain visible separately and never mutate source',()=>{
 const input=[
  entry('outside','C1','02:00','03:00'),
  entry('unset','C2',null,null),
  entry('no-markers','C2','10:00','11:00',undefined),
  entry('unassigned',null,'18:00','19:00'),
  {...entry('void','C3','11:00','12:00'),voided_at:'2026-11-12'}
 ];
 delete input[2].checkmarks;
 const frozen=structuredClone(input);
 const grid=padelCourtTimeGrid(input);
 assert.equal(grid.allCount,4);
 assert.deepEqual(input,frozen);
 assert.deepEqual(grid.unplaced.map(x=>x.id).sort(),['outside','unassigned','unset']);
 const unknown=grid.columns[1].bookings.find(x=>x.id==='no-markers');
 assert.equal(unknown.paymentState,'unknown');
 assert.equal(grid.columns[2].bookings.length,0);
});

test('Timetable uses a preserved horizontal scroller and leaves financial cards functional',()=>{
 const html=read('../lib/cafeteria-finances.js');
 const css=read('../styles/court-timeboard.css');
 const bootstrap=read('../bootstrap.js');
 assert.match(html,/padelCourtTimeGrid\(rows\)/);
 assert.match(html,/data-preserve-scroll="daily-court-timetable"/);
 assert.match(html,/cafe-timeboard-booking/);
 assert.match(html,/courtView==='timetable'\?timetable\(\)/);
 assert.match(html,/const courtCards=/);
 assert.match(html,/cafeteria_finance_set_player_paid/);
 assert.match(css,/grid-template-rows:48px 896px/);
 assert.match(css,/grid-template-columns:72px repeat\(3,minmax\(215px,1fr\)\)/);
 assert.match(css,/overflow-x:auto/);
 assert.match(css,/@media\(max-width:830px\)/);
 assert.match(bootstrap,/styles\/court-timeboard\.css/);
});

test('Application modules still pass JavaScript syntax validation',()=>{
 for(const path of ['lib/court-timetable.js','lib/cafeteria-finances.js','bootstrap.js']){
  const p=new URL('../'+path,import.meta.url).pathname;
  const result=spawnSync(process.execPath,['--check',p],{encoding:'utf8'});
  assert.equal(result.status,0,path+' syntax failed: '+result.stderr);
 }
});
