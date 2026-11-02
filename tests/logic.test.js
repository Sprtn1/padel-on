import test from 'node:test';
import assert from 'node:assert/strict';
import {weekStart,weekEnd,shiftMonth,commission,parseUSD,addDays} from '../lib/date.js';
import {getWeeklyStatus,getMonthFinance,getWeeklyFreeGameStatus,getMatchmakingStreakLedger,getMatchmakingFinance,getMatchmakingCurrentStreak} from '../lib/logic.js';

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

test('matchmaking rolling streak follows 15 15 20 20 25 25 30 from Wednesday without counting matches twice',()=>{
 const games=[
  {id:'a1',matchmaker_id:'a',played_on:'2026-11-04',amount_cents:10000,created_at:'1'},
  {id:'a2',matchmaker_id:'a',played_on:'2026-11-04',amount_cents:10000,created_at:'2'},
  {id:'a3',matchmaker_id:'a',played_on:'2026-11-05',amount_cents:10000,created_at:'3'},
  {id:'a4',matchmaker_id:'a',played_on:'2026-11-06',amount_cents:10000,created_at:'4'},
  {id:'a5',matchmaker_id:'a',played_on:'2026-11-07',amount_cents:10000,created_at:'5'},
  {id:'a6',matchmaker_id:'a',played_on:'2026-11-08',amount_cents:10000,created_at:'6'},
  {id:'a7',matchmaker_id:'a',played_on:'2026-11-09',amount_cents:10000,created_at:'7'},
  {id:'a8',matchmaker_id:'a',played_on:'2026-11-10',amount_cents:10000,created_at:'8'},
  {id:'a9',matchmaker_id:'a',played_on:'2026-11-11',amount_cents:10000,created_at:'9'},
  {id:'b1',matchmaker_id:'b',played_on:'2026-11-09',amount_cents:10000,created_at:'10'}
 ];
 const ledger=getMatchmakingStreakLedger(games);
 const a=ledger.filter(row=>row.matchmaker_id==='a').sort((x,y)=>x.created_at.localeCompare(y.created_at));
 assert.deepEqual(a.map(row=>[row.streakDay,row.commissionBps]),[[1,1500],[1,1500],[2,1500],[3,2000],[4,2000],[5,2500],[6,2500],[7,3000],[1,1500]]);
 const b=ledger.find(row=>row.id==='b1');assert.deepEqual([b.streakDay,b.commissionBps],[1,1500]);
 const finance=getMatchmakingFinance(games.filter(row=>row.matchmaker_id==='a'),'2026-11');
 assert.equal(finance.total,90000);assert.equal(finance.fee,18000);assert.equal(finance.games,9);
});

test('matchmaking streak crosses Monday, resets after a missed day, and restarts after Day 7',()=>{
 const games=[
  {matchmaker_id:'a',played_on:'2026-11-04',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-05',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-06',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-07',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-08',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-09',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-10',amount_cents:10000},
  {matchmaker_id:'a',played_on:'2026-11-11',amount_cents:10000},
  {matchmaker_id:'b',played_on:'2026-11-04',amount_cents:10000},
  {matchmaker_id:'b',played_on:'2026-11-05',amount_cents:10000},
  {matchmaker_id:'b',played_on:'2026-11-07',amount_cents:10000}
 ];
 const ledger=getMatchmakingStreakLedger(games);
 const a=ledger.filter(row=>row.matchmaker_id==='a').sort((x,y)=>x.played_on.localeCompare(y.played_on));
 const b=ledger.filter(row=>row.matchmaker_id==='b').sort((x,y)=>x.played_on.localeCompare(y.played_on));
 assert.deepEqual(a.map(row=>row.streakDay),[1,2,3,4,5,6,7,1]);
 assert.deepEqual(b.map(row=>row.streakDay),[1,2,1]);
 assert.deepEqual(getMatchmakingCurrentStreak(games.slice(0,2),'2026-11-06'),{currentStreak:2,currentCommissionBps:2000,lastActiveDay:'2026-11-05',continuesToday:true});
 assert.deepEqual(getMatchmakingCurrentStreak(games.slice(0,2),'2026-11-07'),{currentStreak:0,currentCommissionBps:1500,lastActiveDay:'2026-11-05',continuesToday:false});
 assert.deepEqual(getMatchmakingCurrentStreak(games.slice(0,7),'2026-11-11'),{currentStreak:0,currentCommissionBps:1500,lastActiveDay:'2026-11-10',continuesToday:false});
});
