import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('Known transaction tables get adaptive card labels without altering the ledger',()=>{
 const app=src('../app.js');
 assert.match(app,/function enhanceResponsiveTables\(root\)/);
 assert.match(app,/\.private-daily-table,\.debt-daily-table/);
 assert.match(app,/\.po-mobile-cell-value/);
 assert.match(app,/while\(cell\.firstChild\)value\.appendChild\(cell\.firstChild\)/);
 assert.match(app,/enhanceResponsiveTables\(app\)/);
 assert.match(app,/data-table po-overview-sessions/);
});
test('Desktop tables and tournament payment scroll retain their borders and native operations',()=>{
 const css=src('../styles/mobile-experience.css');
 assert.match(css,/\.tm-payment-table-scroll\{display:block/);
 assert.match(css,/\.po-mobile-card-table tbody tr/);
 assert.match(css,/@media print/);
 assert.match(css,/overflow-x:auto/);
 assert.doesNotMatch(css,/display:\s*none[^}]*\.tm-payment-table-scroll/);
});
