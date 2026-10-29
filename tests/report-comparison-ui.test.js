import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('Reports page exposes a responsive comparison selector for every report mode',()=>{
 assert.match(app,/data-action="report-compare-toggle"/);
 assert.match(app,/id="report-compare-period"/);
 for(const action of ['report-compare-prev','report-compare-next'])assert.match(app,new RegExp("case '"+action+"'"));
 assert.match(app,/reportMode==='day'.*reportCompareDay/);
 assert.match(app,/reportMode==='week'.*reportCompareWeek/);
 assert.match(app,/reportCompareMonth/);
 assert.match(css,/\.report-compare-control/);
 assert.match(css,/@media\(max-width:560px\)[\s\S]*\.report-compare-picker/);
});

test('Report comparison is included in CSV and remains read-only',()=>{
 assert.match(app,/\['PERIOD COMPARISON'\]/);
 assert.match(app,/Difference \(selected - comparison\)/);
 assert.match(app,/compareClubInsights\.reportTotals/);
 assert.doesNotMatch(app,/report-compare[^\n]{0,100}api\.(?:insert|update|rpc)/);
});
