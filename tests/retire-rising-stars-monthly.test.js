import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tabs,NAV_SECTIONS,renderNavigation} from '../lib/navigation.js';
import {PAGE_HASHES,tabFromHash,canAccessTab,resolveTabFromHash} from '../lib/hash-routing.js';
import {PAGE_REFRESH_INTERVALS_MS} from '../lib/refresh-policy.js';

const source=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const icon=()=>'<svg></svg>';

test('Rising Stars monthly training is removed from navigation, roles and deep links',()=>{
 const keys=tabs.map(([key])=>key);
 assert.ok(!keys.includes('training'));
 assert.equal(Object.hasOwn(PAGE_HASHES,'training'),false);
 assert.equal(Object.hasOwn(PAGE_REFRESH_INTERVALS_MS,'training'),false);
 for(const hash of ['#monthly-training','#training']){
  assert.equal(tabFromHash(hash),null);
  assert.equal(resolveTabFromHash(hash,'admin'),'dashboard');
  assert.equal(resolveTabFromHash(hash,'staff'),'dashboard');
 }
 assert.equal(canAccessTab('training','admin'),false);
 assert.equal(canAccessTab('training','staff'),false);
 for(const admin of [false,true]){
  const desktop=renderNavigation('team',icon,false,admin);
  const mobile=renderNavigation('team',icon,true,admin);
  assert.doesNotMatch(desktop,/data-tab="training"|Monthly Training/i);
  assert.doesNotMatch(mobile,/data-tab="training"|Monthly Training/i);
  assert.match(desktop,/Private Sessions/);
  assert.match(desktop,/Team Members/);
 }
 assert.deepEqual(NAV_SECTIONS.find(section=>section.id==='people').tabs,['team','other']);
 assert.equal(NAV_SECTIONS.find(section=>section.id==='people').label,'People & Benefits');
});
test('Monthly training page, alerts, RPCs, exports and both polling feeds are removed',()=>{
 const app=source('app.js');
 for(const old of [
  'training_sessions','training_attendance','record_training_session','void_training_session',
  'trainingPage(', 'loadTrainingMonth(', 'loadOverviewTraining(', 'trainingMonthData(',
  'training-prev-month','training-next-month','save-training','void-training',
  "'Monthly Training',()=>", "'Overview attendance',()=>",'Rising Stars monthly training'
 ]) assert.ok(!app.includes(old),'Found removed feature code: '+old);
 assert.ok(app.includes('club_private_training')===false||!app.includes('record_training_session'));
 assert.match(app,/privateClientsPage|privateClientsPage\(/);
 assert.match(app,/private_ledger_entries/);
 assert.match(app,/team_category/);
 assert.match(app,/rising_stars/,'Rising Stars team classification itself must remain');
 assert.match(app,/loadPrivateClients\(\{background:true\}\)/,'Private Clients polling remains');
 assert.match(app,/clubInsights\.loadOverview\(true\)/);
 assert.doesNotMatch(source('styles.css'),/\.training-panel\{|\.training-member\{|\.training-solo-check\{/);
});
test('Database retirement migration is guarded and only drops the two unused tables/RPCs',()=>{
 const sql=source('supabase/migrations/20261114141500_retire_rising_stars_monthly_training.sql');
 assert.match(sql,/if exists\(select 1 from public\.training_attendance limit 1\)/i);
 assert.match(sql,/if exists\(select 1 from public\.training_sessions limit 1\)/i);
 assert.match(sql,/raise exception/i);
 assert.match(sql,/drop table if exists public\.training_attendance/i);
 assert.match(sql,/drop table if exists public\.training_sessions/i);
 assert.match(sql,/drop function if exists public\.record_training_session/i);
 assert.match(sql,/drop function if exists public\.void_training_session/i);
 assert.doesNotMatch(sql,/\bCASCADE\b|truncate|delete\s+from\s+public\./i);
 assert.doesNotMatch(sql,/drop\s+(table|function)\s+if\s+exists\s+public\.(private|team_members|padel_court)/i);
 assert.match(source('supabase/migrations/20261015_rising_stars_training.sql'),/create table if not exists public\.training_sessions/);
 const bookings=source('lib/court-scheduler-ui.js');
 assert.match(bookings,/private_training|privateClient/);
 assert.match(source('supabase/migrations/20261112234000_private_training_and_cash_closing_fix.sql'),/club_private_training/);
});
test('Both sidebar versions keep the same forest-green palette independent of theme',()=>{
 const css=source('styles/sidebar-forest-fixed.css'),bootstrap=source('bootstrap.js');
 assert.match(css,/--po-nav-forest:#15241d/);
 assert.match(css,/--po-nav-forest-accent:#314c3c/);
 assert.match(css,/html\[data-theme\] \.sidebar/);
 assert.match(css,/html\[data-theme\] \.mobile-drawer-panel/);
 assert.match(css,/html\[data-theme\] \.mobile-drawer-links \.nav-item\.active/);
 assert.ok(bootstrap.indexOf('styles/sidebar-forest-fixed.css')>bootstrap.indexOf('styles/theme-contrast-fixes.css'));
 assert.doesNotMatch(css,/background:#fff|background:white/i);
});
