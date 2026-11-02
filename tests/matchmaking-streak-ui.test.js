import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const styles=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Matchmaking page shows independent current streak, rate and per-entry commission details',()=>{
 assert.match(app,/getMatchmakingCurrentStreak/);
 assert.match(app,/Current streak/);
 assert.match(app,/Current commission/);
 assert.match(app,/<th>Streak day<\/th><th>Rate<\/th><th>Commission<\/th>/);
 assert.match(app,/Rolling seven-day schedule: 15%, 15%, 20%, 20%, 25%, 25%, 30%/);
 assert.match(styles,/\.matchmaking-streak-grid/);
});

test('Old editable fixed commission control is replaced by the automatic daily schedule',()=>{
 assert.doesNotMatch(app,/data-save="save-matchmaker-rate"/);
 assert.match(app,/Commission is automatic and tracked separately for every matchmaker/);
 assert.match(app,/Multiple matches on the same day do not advance the streak/);
 assert.match(app,/15 \/ 15 \/ 20 \/ 20 \/ 25 \/ 25 \/ 30 rolling seven-day streak/);
 assert.match(app,/cycle restarts after Day 7/);
 assert.doesNotMatch(app,/new Monday resets/);
});
