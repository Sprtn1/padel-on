import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {sevenDayClubActivity,dailyCourtTimeline} from '../lib/visual-insights.js';
import {addDays} from '../lib/date.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Seven-day activity only includes recorded active games and available session data',()=>{
 const args={endDate:'2026-11-12',addDays,
  matches:[{played_on:'2026-11-12'},{played_on:'2026-11-10'},{played_on:'2026-11-12',voided_at:'2026-11-12'}],
  specialGames:[{played_on:'2026-11-12'},{played_on:'2026-11-01'}],
  privateEntries:[{entry_type:'session',entry_date:'2026-11-11'},{entry_type:'deposit',entry_date:'2026-11-11'},{entry_type:'session',entry_date:'2026-11-09',voided_at:'2026-11-09'}]};
 const pending=sevenDayClubActivity({...args,privateReady:false});
 assert.equal(pending.days.length,7);assert.equal(pending.days[0].date,'2026-11-06');
 assert.equal(pending.total,3);assert.equal(pending.includesSessions,false);
 const complete=sevenDayClubActivity({...args,privateReady:true});
 assert.equal(complete.total,4);assert.equal(complete.games,3);assert.equal(complete.sessions,1);
 assert.equal(complete.days.at(-1).games,2);
});

test('Court timeline is read-only, sorts by start, groups court bookings and retains unscheduled entries',()=>{
 const entries=[
  {id:'b',category:'padel_courts',court_number:'C2',booking_start_time:'20:30',booking_end_time:'22:00',amount_cents:3200},
  {id:'c',category:'padel_courts',court_number:'C1',booking_start_time:'19:00',booking_end_time:'20:00',amount_cents:2500},
  {id:'d',category:'padel_courts',court_number:'C3',amount_cents:2500},
  {id:'e',category:'pickleball_courts',booking_start_time:'18:00'},
  {id:'f',category:'padel_courts',voided_at:'2026-11-12',booking_start_time:'17:00'},
  {id:'g',category:'other_income',booking_start_time:'17:00'}
 ];
 const before=structuredClone(entries);
 const day=dailyCourtTimeline(entries);
 assert.deepEqual(entries,before,'insights must never mutate ledger rows');
 assert.equal(day.total,4);assert.equal(day.padel.length,3);
 assert.deepEqual(day.slots.map(x=>x.time),['19:00','20:30']);
 assert.equal(day.slots[0].courts.C1[0].id,'c');
 assert.equal(day.slots[1].courts.C2[0].id,'b');
 assert.equal(day.unscheduled[0].id,'d');
 assert.equal(day.other[0].id,'e');
 assert.deepEqual(day.counts,{C1:1,C2:1,C3:1});
});

test('Mobile drawer retains server-side role gating and current route delegation',()=>{
 const app=read('../app.js'),nav=read('../lib/navigation.js');
 assert.match(app,/id="mobile-navigation"/);
 assert.match(app,/aria-modal="true"/);
 assert.match(app,/data-action="mobile-menu-toggle"/);
 assert.match(app,/data-action="mobile-menu-close"/);
 assert.match(app,/if\(mobileMenuOpen\)setMobileMenu\(false,false\)/);
 assert.match(app,/e\.key==='Escape'&&mobileMenuOpen/);
 assert.match(app,/function setMobileMenu\(open,restoreFocus=true\)/);
 assert.match(nav,/isAdmin\|\|key!=='cafeteria-payments'/);
 assert.doesNotMatch(app,/class="mobile-bar"/);
});

test('Responsive stylesheet is last, keeps scrollable tables and contains touch-safe drawer',()=>{
 const boot=read('../bootstrap.js'),css=read('../styles/mobile-redesign.css');
 assert.match(boot,/\.\/styles\/mobile-redesign\.css/);
 assert.ok(boot.indexOf('styles/tournament-advanced.css')<boot.indexOf('styles/mobile-redesign.css'));
 assert.match(css,/@media\(max-width:830px\)/);
 assert.match(css,/\.mobile-drawer\{position:fixed/);
 assert.match(css,/\.tm-table-scroll,\.data-table-wrap\{border:/);
 assert.match(css,/env\(safe-area-inset-bottom\)/);
 assert.match(css,/\.cafe-timetable-scroll\{max-width:100%;overflow-x:auto/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});

test('Timetable switching is display-only and retains existing cashbook entry controls',()=>{
 const cash=read('../lib/cafeteria-finances.js'),app=read('../app.js');
 assert.match(cash,/fold\('Court bookings',courtTimetable\(\)/);
 assert.match(cash,/case 'cafe-court-view'/);
 assert.match(cash,/data-view="grid"/);
 assert.match(cash,/data-view="list"/);
 assert.match(cash,/if\(courtView!==next\)\{courtView=next;rerender\(\);\}/);
 assert.match(app,/function dashboardActivity\(\)/);
 assert.match(app,/sevenDayClubActivity\(/);
 assert.match(cash,/cafeteria_finance_set_player_paid/);
});

test('All changed application modules pass Node syntax validation',()=>{
 for(const file of ['app.js','bootstrap.js','lib/cafeteria-finances.js','lib/visual-insights.js']){
  const result=spawnSync(process.execPath,['--check',new URL('../'+file,import.meta.url).pathname],{encoding:'utf8'});
  assert.equal(result.status,0,file+' syntax failed: '+result.stderr);
 }
});
