import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {THEME_KEY,normalizeTheme,nextTheme,readTheme,writeTheme,themeActionLabel} from '../lib/theme-preference.js';

const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
test('Light is the safe default; only dark and light values are accepted',()=>{
 assert.equal(normalizeTheme(undefined),'light');
 assert.equal(normalizeTheme('invalid'),'light');
 assert.equal(normalizeTheme('dark'),'dark');
 assert.equal(normalizeTheme('light'),'light');
 assert.equal(nextTheme('light'),'dark');
 assert.equal(nextTheme('dark'),'light');
 assert.equal(nextTheme('invalid'),'dark');
 assert.match(THEME_KEY,/padelon-theme/);
});
test('Preference survives browser reload via local storage, without any backend access',()=>{
 const values=new Map(),storage={
  getItem:key=>values.has(key)?values.get(key):null,
  setItem:(key,value)=>values.set(key,value)
 };
 assert.equal(readTheme(storage),'light');
 assert.equal(writeTheme(storage,'dark'),'dark');
 assert.equal(values.get(THEME_KEY),'dark');
 assert.equal(readTheme(storage),'dark');
 assert.equal(writeTheme(storage,'light'),'light');
 assert.equal(readTheme(storage),'light');
 assert.equal(writeTheme(storage,'unexpected'),'light');
 assert.equal(readTheme(storage),'light');
});
test('Blocked or unavailable storage never blocks the app or toggle',()=>{
 assert.equal(readTheme(null),'light');
 assert.equal(readTheme({getItem:()=>{throw Error('storage blocked')}}),'light');
 assert.doesNotThrow(()=>writeTheme({setItem:()=>{throw Error('storage blocked')}},'dark'));
 assert.equal(writeTheme(null,'dark'),'dark');
});
test('Accessible toggle label and icon change with state',()=>{
 assert.equal(themeActionLabel('dark'),'Switch to light mode');
 assert.equal(themeActionLabel('light'),'Switch to dark mode');
 const app=source('app.js'),icons=source('lib/icons.js');
 assert.match(icons,/sun:/);
 assert.match(icons,/moon:/);
 assert.match(app,/data-action="theme-toggle"/);
 assert.match(app,/case 'theme-toggle':applyTheme\(nextTheme\(currentTheme\)\);break;/);
 assert.match(app,/aria-pressed/);
 assert.match(app,/themeButton\(\)/);
 assert.match(app,/function renderAuth\(/);
 assert.match(app,/auth-top-actions/);
 assert.match(app,/document\.documentElement\.dataset\.theme=currentTheme/);
 assert.match(app,/document\.documentElement\.style\.colorScheme=currentTheme/);
});
test('Theme is applied before dynamic app CSS; dark overrides load last',()=>{
 const boot=source('bootstrap.js'),style=source('styles/theme-dark.css');
 assert.ok(boot.indexOf('const initialTheme=readTheme(startupStorage)')<
  boot.indexOf('for (const path of'));
 assert.ok(boot.indexOf('styles/theme-dark.css')>boot.indexOf('styles/court-kinetic-sitewide.css'));
 assert.match(boot,/document\.documentElement\.dataset\.theme=initialTheme/);
 assert.match(style,/html\[data-theme="dark"\]/);
 assert.match(style,/\.auth-top-actions/);
 assert.match(style,/color-scheme:dark/);
 assert.match(style,/@media print/);
});
test('Dark coverage includes every feature area, mobile and the editor overlays',()=>{
 const css=source('styles/theme-dark.css');
 const groups=['.sidebar-panel','.mobile-drawer-panel','.topbar','.summary-card',
 '.data-table td','.cafe-scheduler-dialog','.cafe-timeboard-court',
 '.ck-detail-drawer','.cafe-fold','.whish-section','.shift-section',
 '.private-directory','.debt-directory','.training-member','.other-card',
 '.matchmaker-tabs','.tm-v2-participant','.tm-bracket',
 '.cpay-card','.inv-table-panel','.settings-box','.report-comparison-panel',
 '.modal','.auth-card'];
 for(const selector of groups)assert.ok(css.includes(selector),'Missing '+selector);
 assert.ok(css.length>18000,'An accent-only dark mode is not enough');
});
test('Changing theme only updates DOM attributes and toggle content, not app state',()=>{
 const app=source('app.js');
 const start=app.indexOf('function applyTheme(theme){');
 const end=app.indexOf('\nfunction esc(x)',start);
 assert.ok(start>=0&&end>start);
 const action=app.slice(start,end);
 assert.doesNotMatch(action,/render\(|rerender\(|location\.reload|window\.scroll|api\.|\.rpc\(/);
 assert.match(action,/document\.querySelectorAll\('\[data-action="theme-toggle"\]'\)/);
 assert.match(action,/writeTheme\(themeStorage,theme\)/);
});
