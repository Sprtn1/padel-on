import test from 'node:test';
import assert from 'node:assert/strict';
import {weekStart,weekEnd,shiftMonth,commission,parseUSD,addDays} from '../lib/date.js';
import {getWeeklyStatus,getMonthFinance,getWeeklyFreeGameStatus} from '../lib/logic.js';

test('Beirut business week starts Monday and ends Sunday',()=>{
 assert.equal(weekStart('2026-10-15'),'2026-10-12');
 assert.equal(weekEnd('2026-10-15'),'2026-10-18');
 assert.equal(weekStart('2027-01-01'),'2026-12-28');
 assert.equal(weekStart('2026-10-18'),'2026-10-12');
 assert.equal(weekStart('2026-10-19'),'2026-10-19');
});
test('initial balances apply to the seeded week only',()=>{
 const m={id:'m1',weekly_allowance:3};
 const balances=[{member_id:'m1',week_start:'2026-10-12',used:1}];
 assert.deepEqual(getWeeklyStatus(m,'2026-10-15',balances,[],[]),{used:1,remain:2,allowance:3});
 assert.deepEqual(getWeeklyStatus(m,'2026-10-19',balances,[],[]),{used:0,remain:3,allowance:3});
});
test('void entries and protected manual reset exclude old counting entries',()=>{
 const m={id:'m1',weekly_allowance:2};
 const b=[{member_id:'m1',week_start:'2026-10-12',used:1}];
 const g=[
  {member_id:'m1',played_on:'2026-10-14',created_at:'2026-10-14T09:00:00Z',voided_at:null},
  {member_id:'m1',played_on:'2026-10-15',created_at:'2026-10-15T12:00:00Z',voided_at:null},
  {member_id:'m1',played_on:'2026-10-16',created_at:'2026-10-16T11:00:00Z',voided_at:'2026-10-16T12:00:00Z'}
 ];
 const r=[{member_id:'m1',week_start:'2026-10-12',effective_at:'2026-10-15T10:00:00Z'}];
 assert.deepEqual(getWeeklyStatus(m,'2026-10-16',b,g,r),{used:1,remain:1,allowance:2});
});
test('commission rounds monthly total only and months remain separate',()=>{
 const data=[{played_on:'2026-10-04',amount_cents:4000},{played_on:'2026-10-08',amount_cents:6000},{played_on:'2026-10-15',amount_cents:5000},{played_on:'2026-09-22',amount_cents:5000},{played_on:'2026-10-11',amount_cents:1200,deleted_at:'2026-10-12'}];
 const oct=getMonthFinance(data,'2026-10');assert.equal(oct.total,15000);assert.equal(oct.fee,2250);assert.equal(oct.games,3);
 assert.equal(getMonthFinance(data,'2026-09').fee,750);
 assert.equal(commission(101),15);
});
test('exact cent parsing and month shift',()=>{
 assert.equal(parseUSD('45.30'),4530);assert.equal(parseUSD('0.01'),1);assert.throws(()=>parseUSD('12.345'));
 assert.equal(shiftMonth('2026-12',1),'2027-01');assert.equal(addDays('2026-12-31',1),'2027-01-01');
});

test('Other Benefits weekly free game is limited to one free game per Monday-Sunday week',()=>{
 const player={id:'p1'};
 const games=[{player_id:'p1',played_on:'2026-10-13',game_type:'free'},{player_id:'p1',played_on:'2026-10-14',game_type:'paid'}];
 assert.deepEqual(getWeeklyFreeGameStatus(player,'2026-10-18',games),{weekStart:'2026-10-12',weekEnd:'2026-10-18',used:1,available:false});
 assert.deepEqual(getWeeklyFreeGameStatus(player,'2026-10-19',games),{weekStart:'2026-10-19',weekEnd:'2026-10-25',used:0,available:true});
 assert.deepEqual(getWeeklyFreeGameStatus(player,'2026-10-15',[{player_id:'p2',played_on:'2026-10-14',game_type:'free'}]).available,true);
});
