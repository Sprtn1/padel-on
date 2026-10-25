import test from 'node:test';
import assert from 'node:assert/strict';
import {AUTO_REFRESH_INTERVAL_MS,PAGE_REFRESH_INTERVALS_MS,
 pageRefreshIntervalMs,isPageRefreshDue} from '../lib/refresh-policy.js';

const everyPage=['dashboard','cafeteria-finances','debts','private-clients',
 'team','training','other','finance','tournament','activity','reports',
 'settings','order-counter','reem-items'];

test('All real navigation pages have exactly the same 30-second auto refresh cadence',()=>{
 assert.equal(AUTO_REFRESH_INTERVAL_MS,30_000);
 assert.deepEqual(Object.keys(PAGE_REFRESH_INTERVALS_MS).sort(),everyPage.slice().sort());
 for(const tab of everyPage){
  assert.equal(pageRefreshIntervalMs(tab),30_000,tab);
  assert.equal(isPageRefreshDue(tab,1000,30_999),false,tab);
  assert.equal(isPageRefreshDue(tab,1000,31_000),true,tab);
 }
});

test('Unknown or additional pages use the same 30-second interval, not a slower fallback',()=>{
 assert.equal(pageRefreshIntervalMs('new-feature'),30_000);
 assert.equal(isPageRefreshDue('new-feature',100,30_100),true);
});

test('Invalid clock or backwards time does not accidentally cause a refresh',()=>{
 assert.equal(isPageRefreshDue('dashboard',1000,900),false);
 assert.equal(isPageRefreshDue('dashboard',NaN,9000),false);
 assert.equal(isPageRefreshDue('dashboard',1000,Infinity),false);
 assert.equal(Object.isFrozen(PAGE_REFRESH_INTERVALS_MS),true);
});
