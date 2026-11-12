// Read-only authenticated browser smoke test. Requires a dedicated staff
// test account supplied through environment variables (never checked in).
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {tabs} from '../lib/navigation.js';

const email=process.env.PADEL_ON_SMOKE_EMAIL;
const password=process.env.PADEL_ON_SMOKE_PASSWORD;
const site='https://padelon.publicvm.com';
if(!email||!password)throw Error('Set PADEL_ON_SMOKE_EMAIL and PADEL_ON_SMOKE_PASSWORD as repository Actions secrets.');
if(!/^https:\/\//.test(site))throw Error('The smoke-test site must use HTTPS.');

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1366,height:860}});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',msg=>{
 if(msg.type()==='error'&&/content security policy|refused to (?:execute|load)/i.test(msg.text()))
  errors.push('CSP: '+msg.text().slice(0,250));
});
try{
 await page.goto(site,{waitUntil:'domcontentloaded',timeout:30_000});
 assert.equal(new URL(page.url()).origin,new URL(site).origin,
  'Unexpected login origin; refusing to enter test credentials');
 await page.locator('#login-form').waitFor({state:'visible',timeout:30_000});
 await page.locator('#login-form [name=email]').fill(email);
 await page.locator('#login-form [name=password]').fill(password);
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('.app-layout').waitFor({state:'visible',timeout:30_000});
 // Check every authorized desktop screen without changing any records.
 const visibleTabs=await page.locator('.sidebar [data-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab));
 for(const [key,title] of tabs.filter(([key])=>visibleTabs.includes(key))){
  await page.locator('.sidebar [data-tab="'+key+'"]').click();
  await page.waitForFunction(expected=>document.querySelector('.topbar-main')?.textContent?.trim()===expected,title);
  assert.equal((await page.locator('.topbar-main').textContent()).trim(),title);
 }
 // The mobile navigation is a drawer. Validate accessible routing at phone and tablet widths.
 for(const width of [320,390,768]){
  await page.setViewportSize({width,height:844});
  const menu=page.locator('[data-action="mobile-menu-toggle"]');
  await menu.waitFor({state:'visible'});
  assert.equal(await menu.getAttribute('aria-expanded'),'false');
  await menu.click();
  const drawer=page.locator('#mobile-drawer');
  await drawer.waitFor({state:'visible'});
  assert.equal(await drawer.getAttribute('aria-hidden'),'false');
  assert.equal(await drawer.locator('[data-tab="cafeteria-finances"]').count(),1);
  assert.equal(await drawer.locator('[data-tab="debts"]').count(),1);
  await drawer.locator('[data-action="mobile-menu-close"]').click();
  assert.equal(await drawer.getAttribute('aria-hidden'),'true');
  const metrics=await page.evaluate(()=>({
   viewport:document.documentElement.clientWidth,
   document:document.documentElement.scrollWidth
  }));
  assert.ok(metrics.document<=metrics.viewport+2,'Horizontal page overflow at '+width+'px: '+JSON.stringify(metrics));
 }
 await page.setViewportSize({width:390,height:844});
 for(const [key,title] of [
  ['cafeteria-finances','Cafeteria Finances'],
  ['debts','Cafeteria Debts'],
  ['private-clients','Private Sessions'],
  ['tournament','Tournament Management'],
  ['settings','Settings']
 ]){
  await page.locator('[data-action="mobile-menu-toggle"]').click();
  const button=page.locator('#mobile-drawer [data-tab="'+key+'"]');
  await button.click();
  await page.waitForFunction(expected=>document.querySelector('.topbar-main')?.textContent?.trim()===expected,title);
  assert.equal(await page.locator('#mobile-drawer').getAttribute('aria-hidden'),'true');
 }
 // The read-only timetable and its editable source list must coexist.
 await page.locator('[data-action="mobile-menu-toggle"]').click();
 await page.locator('#mobile-drawer [data-tab="cafeteria-finances"]').click();
 const timetable=page.locator('[data-action="cafe-court-view"][data-view="timetable"]');
 await timetable.waitFor({state:'visible',timeout:30_000});
 await timetable.click();
 assert.equal(await page.locator('.cafe-timetable-grid').count(),1);
 assert.ok(await page.locator('.cafe-court-grid').count()>0);
 assert.deepEqual(errors,[], 'Browser JavaScript errors or CSP violations');
 // No financial mutations are performed during this test.
 console.log('Authenticated browser smoke passed: desktop permissions, mobile drawer, layouts and read-only court timetable.');
} finally {
 await browser.close();
}
