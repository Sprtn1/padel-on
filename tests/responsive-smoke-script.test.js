import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const script=readFileSync(new URL('../scripts/authenticated-browser-smoke.mjs',import.meta.url),'utf8');
test('Authenticated browser check covers mobile drawer, 320px width and recorded timetable without mutation',()=>{
 assert.match(script,/for\(const width of \[320,390,768\]\)/);
 assert.match(script,/\[data-action="mobile-menu-toggle"\]/);
 assert.match(script,/\.cafe-timetable-grid/);
 assert.match(script,/\.cafe-court-grid/);
 assert.doesNotMatch(script,/\.mobile-bar/);
 assert.match(script,/const site='https:\/\/padelon\.publicvm\.com'/);
});
