import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {courtSchedulerMove,createCourtScheduler} from '../lib/court-scheduler-ui.js';
import {padelCourtTimeGrid} from '../lib/court-timetable.js';
const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');

test('Thick hour lines and lighter half-hour lines are defined in the scheduler stylesheet',()=>{
 const css=read('../styles/court-scheduler.css');
 assert.match(css,/transparent 27px,#dce1e5 27px,#dce1e5 28px/);
 assert.match(css,/#929fa6 53px,#929fa6 56px/);
 assert.match(css,/touch-action:none/);
 assert.match(css,/cafe-scheduler-dragging/);
 assert.match(read('../bootstrap.js'),/styles\/court-scheduler\.css/);
});

test('Drag start times snap to half-hour and stay inside 9 AM–1 AM business window',()=>{
 assert.equal(courtSchedulerMove('09:00',60,28),'09:30');
 assert.equal(courtSchedulerMove('22:30',90,56),'23:30');
 assert.equal(courtSchedulerMove('00:00',60,56),'00:00');
 assert.equal(courtSchedulerMove('18:30',90,-28),'18:00');
 assert.equal(courtSchedulerMove('09:00',60,-200),'09:00');
 assert.equal(courtSchedulerMove('not-time',60,28),null);
});

test('Planning entries share the grid with recorded financial bookings without affecting markers',()=>{
 const existing={id:'money',category:'padel_courts',court_number:'C1',
  booking_start_time:'18:00',booking_end_time:'19:00',checkmarks:[true,true,false,true],
  amount_cents:3200,source:'ledger',name:'Paid session'};
 const planned={id:'pending',category:'padel_courts',court_number:'C2',
  booking_start_time:'19:00',booking_end_time:'20:00',source:'reservation',
  reservationStatus:'confirmed',duration_minutes:60,name:'Reserved session'};
 const saved=JSON.stringify([existing,planned]);
 const grid=padelCourtTimeGrid([existing,planned]);
 assert.equal(grid.allCount,2);
 assert.equal(grid.columns[0].bookings[0].source,'ledger');
 assert.equal(grid.columns[0].bookings[0].paymentState,'some');
 assert.equal(grid.columns[1].bookings[0].source,'reservation');
 assert.equal(grid.columns[1].bookings[0].reservationStatus,'confirmed');
 assert.equal(JSON.stringify([existing,planned]),saved);
});

test('Planner loads authorized schedule and saved financial rows for a selected date',async()=>{
 const called=[],api={getSession:()=>({access_token:'token'}),listAll:async(table,filter)=>{
  called.push([table,filter]);return [];
 }};
 let renders=0;
 const ui=createCourtScheduler({api,today:()=> '2026-11-12',
  addDays:(d,days)=>{const date=new Date(d+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);},
  rerender:()=>{renders++},toast:()=>{},onLedgerChanged:async()=>{}});
 await ui.load();
 assert.ok(called.some(([name])=>name==='padel_court_reservations'));
 assert.ok(called.some(([name])=>name==='cafeteria_finance_entries'));
 assert.match(ui.page(),/Reservations calendar/);
 assert.match(ui.page(),/cafe-schedule-new-at/);
 assert.match(ui.page(),/cafe-scheduler-lane/);
 assert.ok(renders>0);
});

test('Future reservations never create future financial ledger entries',async()=>{
 const called=[],api={getSession:()=>({access_token:'token'}),listAll:async(table,filter)=>{
  called.push([table,filter]);return [];
 }};
 const date=(d,offset)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+offset);return x.toISOString().slice(0,10)};
 const ui=createCourtScheduler({api,today:()=> '2026-11-12',addDays:date,
  rerender:()=>{},toast:()=>{},onLedgerChanged:async()=>{}});
 ui.setDate('2026-11-16');await ui.load();
 assert.ok(called.some(([name])=>name==='padel_court_reservations'));
 assert.equal(called.some(([name])=>name==='cafeteria_finance_entries'),false);
 assert.match(ui.page(),/2026-11-16/);
});

test('Code dispatch keeps reservations within existing finance permissions',()=>{
 const app=read('../app.js'),cash=read('../lib/cafeteria-finances.js');
 assert.match(app,/state\.tab!=='cafeteria-finances'\|\|!state\.staff/);
 assert.match(app,/cafeteriaFinances\.schedulerPointerDown/);
 assert.match(app,/cafeteriaFinances\.schedulerPointerUp/);
 assert.match(cash,/schedule-reservation/);
 assert.match(cash,/onLedgerChanged/);
 assert.match(cash,/scheduler\.load/);
});

test('Migration enforces staff authorization, row security, slot conflicts and closed-day guards',()=>{
 const sql=read('../supabase/migrations/20261112192000_interactive_padel_court_reservations.sql');
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/i);
 assert.match(sql,/CREATE POLICY padel_court_reservation_staff_read/i);
 assert.match(sql,/NOT public\.is_staff\(\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/Court already reserved at that time/);
 assert.match(sql,/UPDATE public\.cafeteria_finance_entries SET\s+court_number=p_court,booking_start_time=p_start::time,booking_end_time=v_new_end/);
 assert.doesNotMatch(sql,/UPDATE public\.cafeteria_finance_entries SET\s+amount_cents=/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.padel_reservation_save/);
});

test('Changed JS modules pass Node parser validation',()=>{
 for(const file of ['app.js','bootstrap.js','lib/court-timetable.js','lib/cafeteria-finances.js','lib/court-scheduler-ui.js']){
  const result=spawnSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,file+' syntax failed: '+result.stderr);
 }
});
