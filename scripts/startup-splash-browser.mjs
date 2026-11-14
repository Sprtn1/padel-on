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
 const warmDimensions=await warm.locator('#app>.startup').evaluate(node=>{
  const bar=getComputedStyle(node),mark=node.querySelector('.startup-brand-mark');
  return {height:node.getBoundingClientRect().height,visible:bar.visibility!=='hidden',
   brandVisible:mark.getClientRects().length>0};
 });
 assert.ok(warmDimensions.visible,'Returning tabs should show a compact loading indicator');
 assert.ok(warmDimensions.height<=5,'Returning tabs must never show a full-screen splash');
 assert.equal(warmDimensions.brandVisible,false,'Returning tabs should not flash the splash logo');
 await warm.waitForTimeout(1900);
 assert.ok((await warm.locator('#app>.startup').boundingBox()).height<=5,
  'Even slow warm connections keep a compact non-blocking indicator');
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

 const appSource=readFileSync(join(root,'app.js'),'utf8');
 assert.match(appSource,/const \[[\s\S]*?\] = await Promise\.all\(\[/,
  'Independent app modules must download in parallel');
 assert.ok(appSource.indexOf('if(earlyPaint){')<appSource.indexOf("api.listAll('team_members')"),
  'Authenticated page shell must render before unrelated shared queries finish');
 console.log('PASS: cold start, compact returning-tab progress, concurrent imports, early shell, navigation, reduced motion.');
}finally{await browser.close();}
