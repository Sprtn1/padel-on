import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_REFRESH_INTERVALS_MS,pageRefreshIntervalMs,isPageRefreshDue} from '../lib/refresh-policy.js';

test('Cashbook refreshes every 90 seconds, not every 30 seconds',()=>{
 assert.equal(pageRefreshIntervalMs('cafeteria-finances'),90_000);
 assert.equal(isPageRefreshDue('cafeteria-finances',1000,90000),false);
 assert.equal(isPageRefreshDue('cafeteria-finances',1000,91000),true);
});

test('Overview, Private Sessions and Debts refresh no more frequently than two minutes',()=>{
 for(const tab of ['dashboard','private-clients','debts']){
  assert.equal(pageRefreshIntervalMs(tab),120_000);
  assert.equal(isPageRefreshDue(tab,100,120_099),false);
  assert.equal(isPageRefreshDue(tab,100,120_100),true);
 }
});

test('Reports, team management, and low-activity pages use a five minute interval',()=>{
 for(const tab of ['team','training','settings','reports','matchmaking','order-counter','reem-items','unknown']){
  assert.equal(pageRefreshIntervalMs(tab),300_000);
  assert.equal(isPageRefreshDue(tab,0,299_999),false);
  assert.equal(isPageRefreshDue(tab,0,300_000),true);
 }
});

test('Invalid clock or backwards time does not accidentally cause a refresh',()=>{
 assert.equal(isPageRefreshDue('dashboard',1000,900),false);
 assert.equal(isPageRefreshDue('dashboard',NaN,9000),false);
 assert.equal(isPageRefreshDue('dashboard',1000,Infinity),false);
 assert.equal(Object.isFrozen(PAGE_REFRESH_INTERVALS_MS),true);
});
