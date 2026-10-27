import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

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
