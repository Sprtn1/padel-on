import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const bootstrap=fs.readFileSync(new URL('../bootstrap.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const scheduler=fs.readFileSync(new URL('../lib/court-scheduler-ui.js',import.meta.url),'utf8');
const tournament=fs.readFileSync(new URL('../lib/tournament-management.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../styles/page-proposals.css',import.meta.url),'utf8');

test('loads the page proposal layer after theme contrast fixes',()=>{
  assert.ok(bootstrap.indexOf('theme-contrast-fixes.css')<bootstrap.indexOf('page-proposals.css'));
  assert.ok(bootstrap.indexOf('page-proposals.css')<bootstrap.indexOf('stitch-timetable.css'));
});

test('provides pointer and touch timetable instructions',()=>{
  assert.match(scheduler,/scheduler-pointer-help/);
  assert.match(scheduler,/scheduler-touch-help/);
  assert.match(css,/@media \(pointer:coarse\)/);
});

test('explains empty team filters and first-use special benefits',()=>{
  assert.match(app,/No members match the current filters/);
  assert.match(app,/No special benefit players yet/);
});

test('keeps the active tournament tab visible on narrow screens',()=>{
  assert.match(tournament,/revealActiveWorkspaceTab/);
  assert.match(tournament,/scrollIntoView/);
  assert.match(css,/\.tm-workspace-tabs/);
});

test('covers every audited workspace page in the proposal layer',()=>{
  for(const page of ['dashboard','court-timetable','cafeteria-finances','cafeteria-payments','debts','consignment','private-clients','team','other','finance','tournament','activity','reports','settings','order-counter','reem-items']){
    assert.ok(css.includes(`data-page="${page}"`),`missing ${page}`);
  }
});
