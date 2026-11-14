import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {tabs,NAV_SECTIONS,navSectionForTab,renderNavigation} from '../lib/navigation.js';
const source=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const icon=()=>'<svg></svg>';

test('Each existing PADEL ON page appears in exactly one Stitch-inspired navigation section',()=>{
 const ids=NAV_SECTIONS.flatMap(section=>section.tabs);
 assert.deepEqual(ids,tabs.map(([id])=>id),'section grouping must keep old tab order');
 assert.equal(new Set(ids).size,tabs.length);
 assert.deepEqual(NAV_SECTIONS.map(section=>section.label),[
  'Core Operations','Facility & Services','People & Training',
  'Competition & Activity','Management & System'
 ]);
 for(const section of NAV_SECTIONS){
  assert.ok(section.tabs.length>0);
  for(const tab of section.tabs)assert.equal(navSectionForTab(tab)?.id,section.id);
 }
 assert.equal(navSectionForTab('unknown'),null);
});

test('Group headings are accessible and correctly identify the active section in desktop and mobile menus',()=>{
 for(const mobile of [false,true]){
  const html=renderNavigation('private-clients',icon,mobile,true);
  assert.match(html,/aria-labelledby="po-nav-facility-(mobile|desktop)"/);
  assert.match(html,/class="po-nav-section po-nav-section-active"/);
  assert.match(html,/aria-label="Private Sessions" aria-current="page"/);
  assert.match(html,/Core Operations/);
  assert.match(html,/Management &amp; System|Management & System/);
  const labels=[...html.matchAll(/data-tab="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(labels,tabs.map(([key])=>key).filter(id=>!(mobile&&id==='settings')));
 }
});

test('Permission gates remain in place after grouping: staff cannot see admin payments',()=>{
 for(const mobile of [false,true]){
  const staff=renderNavigation('dashboard',icon,mobile,false);
  const admin=renderNavigation('dashboard',icon,mobile,true);
  assert.doesNotMatch(staff,/data-tab="cafeteria-payments"/);
  assert.match(admin,/data-tab="cafeteria-payments"/);
  assert.match(staff,/data-tab="debts"/);
  assert.match(staff,/data-tab="private-clients"/);
 }
});

test('Sitewide theme is loaded after module CSS, with mobile drawer and per-page design hooks',()=>{
 const boot=source('bootstrap.js'),style=source('styles/court-kinetic-sitewide.css'),app=source('app.js');
 assert.ok(boot.indexOf('styles/court-kinetic-sitewide.css')>boot.indexOf('styles/court-kinetic-v2.css'));
 assert.match(style,/\.mobile-drawer-panel/);
 assert.match(style,/\.mobile-drawer-links \.po-nav-heading/);
 assert.match(style,/\.sidebar-collapsed \.po-nav-heading/);
 for(const key of ['dashboard','debts','private-clients','team','training','other',
  'finance','tournament','reports','settings','consignment','cafeteria-payments']){
  assert.match(style,new RegExp('data-page="'+key+'"'));
 }
 assert.match(app,/data-page="\$\{esc\(state\.tab\)\}"/);
 assert.match(app,/navSectionForTab\(state\.tab\)/);
 assert.doesNotMatch(style,/<script|@tailwind/i);
});

test('Desktop sidebar and mobile drawer section labels have independent IDs',()=>{
 const desktop=renderNavigation('dashboard',icon,false,true);
 const drawer=renderNavigation('dashboard',icon,false,true,'drawer');
 const collect=html=>[...html.matchAll(/id="(po-nav-[^"]+)"/g)].map(m=>m[1]);
 const desktopIds=collect(desktop),drawerIds=collect(drawer);
 assert.equal(desktopIds.length,NAV_SECTIONS.length);
 assert.equal(drawerIds.length,NAV_SECTIONS.length);
 assert.equal(new Set([...desktopIds,...drawerIds]).size,2*NAV_SECTIONS.length);
 assert.match(drawer,/aria-labelledby="po-nav-core-drawer"/);
 assert.match(source('app.js'),/navMarkup\(false,'drawer'\)/);
});
