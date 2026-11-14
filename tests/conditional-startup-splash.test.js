import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STARTUP_READY_KEY,wasAppReadyInThisTab,noteAppReadyInThisTab} from '../lib/startup-readiness.js';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Startup state remembers a successful initial render without saving private account data',()=>{
 const data=new Map(),storage={
  getItem:key=>data.get(key)||null,
  setItem:(key,value)=>data.set(key,value)
 };
 assert.equal(wasAppReadyInThisTab(storage),false);
 noteAppReadyInThisTab(storage);
 assert.equal(wasAppReadyInThisTab(storage),true);
 assert.equal(data.size,1);
 assert.equal(data.get(STARTUP_READY_KEY),'1');
 assert.match(STARTUP_READY_KEY,/startup_ready/);
});
test('Blocked session storage never prevents the app from opening',()=>{
 assert.equal(wasAppReadyInThisTab(null),false);
 assert.equal(wasAppReadyInThisTab({getItem(){throw Error('storage blocked')}}),false);
 assert.doesNotThrow(()=>noteAppReadyInThisTab({setItem(){throw Error('storage blocked')}}));
 assert.doesNotThrow(()=>noteAppReadyInThisTab(null));
});
test('Returning tab applies warm-start policy before dynamic styles and the application start',()=>{
 const boot=read('bootstrap.js');
 const parallel=boot.indexOf('Promise.all([');
 const warm=boot.indexOf("classList.add('po-startup-warm')");
 const cssStart=boot.indexOf('for (const path of [');
 const app=boot.indexOf("await import(`./app.js?v=");
 assert.ok(parallel>=0&&warm>parallel&&cssStart>warm&&app>cssStart);
 assert.match(boot,/import\(`\.\/lib\/theme-preference\.js\?v=/);
 const css=read('styles/startup-splash.css');
 assert.match(css,/#app > \.startup\{/);
 assert.match(css,/visibility:hidden/);
 assert.match(css,/animation:po-splash-reveal \.18s ease 650ms both/);
 assert.match(css,/html\.po-startup-warm #app > \.startup/);
 assert.match(css,/html\.po-startup-warm #app > \.startup\{[\s\S]*?min-height:3px/);
 assert.match(css,/html\.po-startup-warm #app > \.startup > \*\{display:none!important\}/);
 assert.match(css,/@keyframes po-splash-reveal/);
 assert.match(css,/body:has\(#app > \.startup\)/);
});
test('Dashboard and login mark themselves ready only after replacing the splash markup',()=>{
 const app=read('app.js');
 const main=app.slice(app.indexOf('function render(){'),app.indexOf('function field(name,'));
 assert.match(main,/app\.innerHTML=html;\s*noteInitialViewRendered\(\);/);
 const auth=app.slice(app.indexOf('function renderAuth(message='),app.indexOf('async function loadDebtData('));
 assert.match(auth,/app\.innerHTML=`<main class="auth-wrap">/);
 assert.match(auth,/noteInitialViewRendered\(\);/);
 const first=app.slice(app.indexOf('function noteInitialViewRendered(){'),app.indexOf('let sidebarCollapsed='));
 assert.match(first,/if\(initialViewRendered\)return/);
 assert.match(first,/noteAppReadyInThisTab\(window\.sessionStorage\)/);
 assert.doesNotMatch(first,/\.innerHTML=|render\(|api\./);
});
test('Neither periodic refresh nor navigation remount the startup splash',()=>{
 const app=read('app.js');
 const html=read('index.html');
 assert.equal((app.match(/class="startup"/g)||[]).length,0);
 assert.equal((html.match(/class="startup"/g)||[]).length,1);
 assert.match(app,/setInterval\(\(\)=>\{/);
 assert.match(html,/src="\.\/bootstrap\.js"/);
});
