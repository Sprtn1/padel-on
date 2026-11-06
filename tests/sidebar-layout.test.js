import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readSidebarCollapsed,storeSidebarCollapsed,sidebarToggleLabel,SIDEBAR_PREFERENCE_KEY} from '../lib/sidebar-layout.js';
import {renderNavigation,tabs} from '../lib/navigation.js';

const read=file=>readFileSync(new URL(file,import.meta.url),'utf8');
const storage=()=>{
 const map=new Map();
 return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
};
test('Collapse preference persists and gracefully handles unavailable storage',()=>{
 const s=storage();
 assert.equal(readSidebarCollapsed(s),false);
 assert.equal(storeSidebarCollapsed(s,true),true);
 assert.equal(s.getItem(SIDEBAR_PREFERENCE_KEY),'collapsed');
 assert.equal(readSidebarCollapsed(s),true);
 assert.equal(storeSidebarCollapsed(s,false),true);
 assert.equal(readSidebarCollapsed(s),false);
 assert.equal(readSidebarCollapsed({getItem(){throw Error('Blocked')}}),false);
 assert.equal(storeSidebarCollapsed({setItem(){throw Error('Blocked')}},true),false);
 assert.equal(sidebarToggleLabel(true),'Expand sidebar');
 assert.equal(sidebarToggleLabel(false),'Collapse sidebar');
});
test('Desktop icon rail keeps full accessible labels and admin-only destinations',()=>{
 const icon=name=>'<svg>'+name+'</svg>';
 const admin=renderNavigation('dashboard',icon,false,true);
 const staff=renderNavigation('dashboard',icon,false,false);
 assert.equal((admin.match(/data-tab=/g)||[]).length,tabs.length);
 assert.equal((staff.match(/data-tab=/g)||[]).length,tabs.length-1);
 assert.match(admin,/data-tab="cafeteria-payments"/);
 assert.doesNotMatch(staff,/data-tab="cafeteria-payments"/);
 assert.match(staff,/data-tab="dashboard"[^>]*aria-label="Overview"[^>]*title="Overview"/);
 assert.match(staff,/data-tab="consignment"[^>]*title="Consignment Inventory"/);
 const mobile=renderNavigation('dashboard',icon,true,true);
 assert.doesNotMatch(mobile, /title="Overview"/);
});
test('Sidebar toggle never rerenders financial forms or changes navigation state',()=>{
 const app=read('../app.js');
 const css=read('../styles/interface-polish.css');
 const boot=read('../bootstrap.js');
 assert.match(app,/data-action="sidebar-toggle"/);
 assert.match(app,/aria-controls="sidebar-menu"/);
 assert.match(app,/class="app-layout \$\{sidebarCollapsed\?'sidebar-collapsed':''\}"/);
 assert.match(app,/layout\.classList\.toggle\('sidebar-collapsed',sidebarCollapsed\)/);
 assert.match(app,/case 'sidebar-toggle':toggleDesktopSidebar\(\);break;/);
 const toggle=app.slice(app.indexOf('function toggleDesktopSidebar()'),app.indexOf('function globalSearchCandidates()'));
 assert.doesNotMatch(toggle,/\brender\(/);
 assert.match(boot,/styles\/interface-polish\.css/);
 assert.match(css,/\.sidebar-collapsed \.sidebar:is\(:hover,:has\(\.nav-item:focus-visible\)\)/);
 assert.match(css,/@media\(max-width:830px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
