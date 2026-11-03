// Read-only authenticated browser smoke test. Requires a dedicated staff
// test account supplied through environment variables (never checked in).
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {tabs} from '../lib/navigation.js';

const email=process.env.PADEL_ON_SMOKE_EMAIL;
const password=process.env.PADEL_ON_SMOKE_PASSWORD;
const site=(process.env.PADEL_ON_BASE_URL||'https://padelon.publicvm.com').replace(/\/$/,'');
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
 await page.locator('#login-form').waitFor({state:'visible',timeout:30_000});
 await page.locator('#login-form [name=email]').fill(email);
 await page.locator('#login-form [name=password]').fill(password);
 await page.locator('#login-form button[type=submit]').click();
 await page.locator('.app-layout').waitFor({state:'visible',timeout:30_000});
 // Check every main screen without making payments or changing client records.
 for(const [key,title] of tabs){
  const button=page.locator('.sidebar [data-tab="'+key+'"]');
  await button.click();
  await page.waitForFunction(expected=>document.querySelector('.topbar-main')?.textContent?.trim()===expected,title);
  assert.equal((await page.locator('.topbar-main').textContent()).trim(),title);
 }
 // Mobile mode must have distinct controls for cafeteria finances/debts.
 await page.setViewportSize({width:390,height:844});
 const nav=page.locator('.mobile-bar');
 await nav.waitFor({state:'visible'});
 for(const [key,label,title] of [
  ['cafeteria-finances','Finances','Cafeteria Finances'],
  ['debts','Debts','Cafeteria Debts'],
  ['private-clients','Sessions','Private Sessions'],
  ['tournament','Tournaments','Tournament Management'],
  ['settings','Settings','Settings']
 ]){
  const button=nav.locator('[data-tab="'+key+'"]');
  assert.equal((await button.locator('span').textContent()).trim(),label);
  await button.click();
  await page.waitForFunction(expected=>document.querySelector('.topbar-main')?.textContent?.trim()===expected,title);
 }
 assert.deepEqual(errors,[], 'Browser JavaScript errors or CSP violations');
 // No financial mutations are performed during this test.
 console.log('Authenticated browser smoke passed: all desktop pages and key mobile tabs.');
} finally {
 await browser.close();
}
