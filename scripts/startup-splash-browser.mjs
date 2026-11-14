// Validate real CSS animation timing in a browser using only public startup markup.
// This is intentionally unauthenticated and never reads private data.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const html=readFileSync(join(root,'index.html'),'utf8');
const css=readFileSync(join(root,'styles/startup-splash.css'),'utf8');
const start=html.indexOf('<div id="app">');
const end=html.indexOf('<div id="toast-host"',start);
assert.ok(start>=0&&end>start,'Missing startup markup');
const fragment=html.slice(start,end);

const browser=await chromium.launch({headless:true});
async function fixture({warm=false,reducedMotion='no-preference'}={}){
 const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion});
 await page.setContent('<!doctype html><html><body>'+fragment+'</body></html>',{waitUntil:'domcontentloaded'});
 if(warm)await page.evaluate(()=>document.documentElement.classList.add('po-startup-warm'));
 await page.addStyleTag({content:css});
 return page;
}
async function isVisible(page){return page.locator('#app>.startup').evaluate(el=>{
 const s=getComputedStyle(el);
 return s.visibility!=='hidden'&&Number(s.opacity)>.95;
});}
try{
 const cold=await fixture();
 assert.equal(await isVisible(cold),false,'Cold splash should not flash on immediate paint');
 await cold.waitForTimeout(1020);
 assert.equal(await isVisible(cold),true,'Slow cold start should show splash');
 await cold.close();

 const warm=await fixture({warm:true});
 assert.equal(await isVisible(warm),false);
 await warm.waitForTimeout(1120);
 assert.equal(await isVisible(warm),false,'Returning tab should not show unnecessary splash');
 await warm.waitForTimeout(800);
 assert.equal(await isVisible(warm),true,'Long warm start should eventually reveal loading state');
 await warm.close();

 const quick=await fixture({warm:true});
 await quick.waitForTimeout(220);
 await quick.evaluate(()=>{document.getElementById('app').innerHTML='<main data-test="loaded">Dashboard ready</main>'});
 await quick.waitForTimeout(1730);
 assert.equal(await quick.locator('#app>.startup').count(),0,'Ready app must never reveal splash later');
 assert.equal(await quick.locator('[data-test="loaded"]').count(),1);
 await quick.evaluate(()=>{document.getElementById('app').innerHTML='<main data-test="next-tab">Cafeteria Finances</main>'});
 assert.equal(await quick.locator('#app>.startup').count(),0,'SPA navigation must never return splash');
 await quick.close();

 const reduced=await fixture({reducedMotion:'reduce'});
 await reduced.waitForTimeout(850);
 assert.equal(await isVisible(reduced),true,'Reduced-motion loading remains visible when needed');
 await reduced.close();

 console.log('PASS: cold starts, returning tabs, instant dashboard render, SPA navigation, and reduced motion.');
}finally{await browser.close();}
