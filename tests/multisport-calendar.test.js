import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {COURT_SPORTS,sportInfo,normalizedCourt,calendarOccupancy} from '../lib/club-court-sports.js';
import {padelCourtTimeGrid} from '../lib/court-timetable.js';
const file=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const booking=(id,category,start,end,court=null,source='ledger')=>({
 id,category,booking_start_time:start,booking_end_time:end,
 court_number:court,name:id,source
});

test('Three sport views are isolated and each single sport has one court',()=>{
 assert.deepEqual(COURT_SPORTS.padel.courts,['C1','C2','C3']);
 assert.deepEqual(COURT_SPORTS.pickleball.courts,['P1']);
 assert.deepEqual(COURT_SPORTS.basketball.courts,['B1']);
 assert.equal(normalizedCourt({court_number:null},'pickleball'),'P1');
 assert.equal(normalizedCourt({court_number:null},'basketball'),'B1');
 assert.throws(()=>sportInfo('unknown'),/Unsupported/);
 const all=[
  booking('padel','padel_courts','18:00','19:00','C1'),
  booking('pickle','pickleball_courts','18:00','19:00',null),
  booking('basket','basketball_courts','18:00','19:00',null)
 ];
 for(const [sport,id] of [['padel','padel'],['pickleball','pickle'],['basketball','basket']]){
  const grid=padelCourtTimeGrid(all,sport);
  assert.equal(grid.allCount,1);
  assert.equal(grid.columns.reduce((n,l)=>n+l.bookings.length,0),1);
  assert.equal(grid.columns[0].bookings[0].id,id);
 }
 assert.equal(padelCourtTimeGrid(all).columns.length,3);
});

test('Midnight-crossing single-court reservations occupy correct time positions',()=>{
 const grid=padelCourtTimeGrid([
  booking('b','basketball_courts','23:30','00:30','B1','reservation')
 ],'basketball');
 assert.equal(grid.columns[0].bookings.length,1);
 const row=grid.columns[0].bookings[0];
 assert.equal(row.topPx,14.5*56);
 assert.equal(row.heightPx,56);
 assert.equal(grid.heightPx,16*56);
});

test('Occupancy counts blocked time but does not double count overlaps',()=>{
 const grid=padelCourtTimeGrid([
  {...booking('block','pickleball_courts','17:00','19:00','P1','reservation'),booking_type:'block'},
  booking('overlap','pickleball_courts','18:30','20:00','P1','reservation')
 ],'pickleball');
 const result=calendarOccupancy(grid);
 assert.equal(result.bookings,2);
 assert.equal(result.blocks,1);
 assert.equal(result.courtHours,3);
 assert.equal(result.occupancy,19);
});

test('Additive SQL migration preserves old padel bookings and staff-only booking functions',()=>{
 const sql=file('../supabase/migrations/20261112230000_multisport_scheduling.sql');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'padel'/);
 assert.match(sql,/ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'reservation'/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.club_court_reservation_save/);
 assert.match(sql,/CREATE OR REPLACE FUNCTION public\.club_ledger_reposition/);
 assert.match(sql,/public\.is_staff\(\)/);
 assert.match(sql,/pg_advisory_xact_lock/);
 assert.match(sql,/source_kind='reservation'/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.club_court_reservation_save/);
 assert.match(sql,/p_sport='pickleball' AND p_court='P1'/);
 assert.match(sql,/p_sport='basketball' AND p_court='B1'/);
 assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE|DELETE FROM public\.cafeteria_finance_entries/i);
});

test('The original booking fee schedule and existing Padel payment view are retained',()=>{
 const bookings=file('../lib/court-bookings.js');
 const finance=file('../lib/cafeteria-finances.js');
 assert.match(bookings,/padel_courts:\{60:2500,90:3200,120:4000\}/);
 assert.match(finance,/courtPaymentTables\(\)/);
 assert.match(finance,/Whish Court Payments/);
});

test('The global 30-second refresh keeps a mounted timetable and only patches booking nodes',()=>{
 const app=file('../app.js'),finance=file('../lib/cafeteria-finances.js');
 const calendar=file('../lib/court-scheduler-ui.js');
 assert.match(app,/autoRefreshRunning&&state\.tab==='cafeteria-finances'/);
 assert.match(app,/cafeteriaFinances\.isTimetableMounted\(\)/);
 assert.match(finance,/isTimetableMounted/);
 assert.match(calendar,/function patchMountedBookings\(\)/);
 assert.match(calendar,/data-schedule-sport/);
 assert.match(calendar,/data-cafe-schedule-sync/);
 assert.match(calendar,/if\(editor\|\|drag\)/);
 assert.match(calendar,/Payments recorded/);
 assert.match(calendar,/data-cafe-court-count/);
 assert.doesNotMatch(calendar,/root\.innerHTML=page\(\)/);
});

test('Multisport UI modules parse in Node',()=>{
 for(const path of ['lib/club-court-sports.js','lib/court-timetable.js','lib/court-scheduler-ui.js','lib/cafeteria-finances.js','app.js']){
  const x=spawnSync(process.execPath,['--check',new URL('../'+path,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(x.status,0, path+' syntax failed: '+x.stderr);
 }
});
