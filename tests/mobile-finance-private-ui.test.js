import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visiblePrivateClientSelection} from '../lib/private-client-selection.js';

const css=readFileSync(new URL('../styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('Mobile finance booking fields stack without overlapping native time inputs',()=>{
 assert.match(css,/@media\(max-width:560px\)[\s\S]*?\.cafe-form-fields\{display:grid;grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.cafe-input-label input,\.cafe-input-label select\{display:block;width:100%;max-width:100%;min-width:0/);
 assert.match(css,/\.cafe-input-label input\[type="time"\]\{-webkit-appearance:none;appearance:none\}/);
});

test('Selected private client exposes escaped internal notes beneath the client name',()=>{
 assert.match(app,/<h2>\$\{esc\(selected\.name\)\}<\/h2><details class="private-client-notes"/);
 assert.match(app,/selected\.notes\?esc\(selected\.notes\):'No internal notes saved\.'/);
 assert.match(app,/data-private-client-notes \$\{state\.privateNotesOpen\?'open':''\}/);
 assert.match(app,/state\.privateNotesOpen=e\.target\.open/);
});

test('New private clients start at zero without exposing an opening balance field',()=>{
 assert.doesNotMatch(app,/field\('opening_balance'/);
 assert.match(app,/p_opening_balance_cents:0/);
 assert.match(app,/client\.opening_balance_cents/,'Existing stored opening balances remain supported');
});

test('Filtering private clients synchronizes the detail and action selection',()=>{
 const clients=[{id:'aboudi',name:'Aboudi Assi'}];
 assert.equal(visiblePrivateClientSelection(clients,'previous-client'),'aboudi');
 assert.equal(visiblePrivateClientSelection(clients,'aboudi'),'aboudi');
 assert.equal(visiblePrivateClientSelection([],'previous-client'),null);
 assert.match(app,/state\.privateSelected=selectedId;state\.privateNotesOpen=false/);
});
