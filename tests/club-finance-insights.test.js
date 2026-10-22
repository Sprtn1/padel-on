import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCashPeriod,createCashInsights} from '../lib/club-finance-insights.js';

const start='2026-10-21',end='2026-10-22';
function sample(){
 return {
  entries:[
   {entry_date:start,category:'padel_courts',amount_cents:2000,checkmarks:[true,false,true,false]},
   {entry_date:start,category:'coaches',amount_cents:1000},
   {entry_date:end,category:'clothes',amount_cents:900},
   {entry_date:start,category:'padel_courts',amount_cents:99999,voided_at:'now'}
  ],
  days:[{day_date:start,closing_cash_cents:5000}],
  privateLedger:[{entry_date:start,entry_type:'session',paid_cents:500,session_fee_cents:9000},
    {entry_date:end,entry_type:'session',paid_cents:0,session_fee_cents:12000}],
  whish:[{entry_date:start,entry_type:'deposit',amount_cents:700},
    {entry_date:start,entry_type:'withdrawal',amount_cents:300}],
  closings:[{day_date:start,status:'approved'}]
 };
}
test('Cash report totals separate Whish from all physical cash figures and flag uncounted dates',()=>{
 const s=sample();
 const r=summarizeCashPeriod(start,end,s.entries,s.days,s.privateLedger,s.whish,s.closings);
 assert.equal(r.recordedIncome,3400);
 assert.equal(r.expenses,1000);
 assert.equal(r.privatePayments,500);
 assert.equal(r.courtRevenue,2000);
 assert.equal(r.unpaidPlayers,2);
 assert.equal(r.generated,6000);
 assert.equal(r.goodsSold,3500);
 assert.equal(r.countedDays,1);
 assert.equal(r.missingCashDays,1);
 assert.equal(r.whishDeposits,700);
 assert.equal(r.whishWithdrawals,300);
 assert.equal(r.whishNet,400);
 assert.equal(r.days.find(x=>x.date===start).status,'approved');
 assert.equal(r.days.find(x=>x.date===end).goodsSold,null);
});
test('Daily, weekly and monthly periods filter records by date, excluding voided transactions',()=>{
 const s=sample();
 const d=summarizeCashPeriod(end,end,s.entries,s.days,s.privateLedger,s.whish,s.closings);
 assert.equal(d.recordedIncome,900);
 assert.equal(d.generated,0);
 assert.equal(d.missingCashDays,1);
 assert.equal(d.whishNet,0);
 const before=summarizeCashPeriod('2026-10-19','2026-10-20',s.entries,s.days,s.privateLedger,s.whish,s.closings);
 assert.equal(before.days.length,0);
 assert.equal(before.recordedIncome,0);
});
test('Overview uses a separate cash desk metric and labels historical status accurately',async()=>{
 const data=sample();const calls=[];
 const tool=createCashInsights({
  api:{getSession:()=>({access_token:'token'}),listAll:async(table,filter)=>{
   calls.push([table,filter]);
   if(table==='cafeteria_finance_entries')return data.entries;
   if(table==='cafeteria_finance_days')return data.days;
   if(table==='private_ledger_entries')return data.privateLedger;
   if(table==='whish_ledger_entries')return data.whish;
   if(table==='cafeteria_day_closings')return data.closings;
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   throw Error(table);
  }},
  today:()=>start,amount:cents=>'$'+(cents/100).toFixed(2),renderIfVisible:()=>{}
 });
 await tool.loadOverview();
 const html=tool.overviewHTML();
 assert.match(html,/Cash desk today/);
 assert.match(html,/Approved/);
 assert.match(html,/\$60\.00/);
 assert.match(html,/\$35\.00/);
 assert.match(html,/\$4\.60/);
 assert.match(html,/Unmarked court payments/);
 assert.match(html,/not included in cash totals/);
 assert.ok(calls.some(([t,f])=>t==='whish_ledger_entries'&&f==='order=entry_date.asc'));
});
test('Report shows accurate grouped category and daily financial breakdown',async()=>{
 const data=sample();
 const tool=createCashInsights({
  api:{getSession:()=>({access_token:'token'}),listAll:async(table,filter)=>{
   if(table==='cafeteria_finance_entries')return data.entries;
   if(table==='cafeteria_finance_days')return data.days;
   if(table==='private_ledger_entries')return data.privateLedger;
   if(table==='whish_ledger_entries')return data.whish;
   if(table==='cafeteria_day_closings')return data.closings;
   throw Error(table);
  }},
  today:()=>start,amount:cents=>'$'+(cents/100).toFixed(2),renderIfVisible:()=>{}
 });
 await tool.loadReport(start,end);
 const html=tool.reportHTML(start,end);
 assert.match(html,/Cafeteria financial report/);
 assert.match(html,/\$34\.00/);
 assert.match(html,/\$60\.00/);
 assert.match(html,/\$35\.00/);
 assert.match(html,/Padel Courts/);
 assert.match(html,/Expense/);
 assert.match(html,/2026-10-22/);
 assert.match(html,/Whish wallet · separate ledger/);
 assert.match(html,/1 active day\(s\)/);
});

test('Export rows include period finances and Whish separately, without rounding cents away',async()=>{
 const data=sample();
 const insights=createCashInsights({
  api:{getSession:()=>({access_token:'token'}),listAll:async table=>{
   if(table==='cafeteria_finance_entries')return data.entries;
   if(table==='cafeteria_finance_days')return data.days;
   if(table==='private_ledger_entries')return data.privateLedger;
   if(table==='whish_ledger_entries')return data.whish;
   if(table==='cafeteria_day_closings')return data.closings;
   throw Error(table);
  }},
  today:()=>start,amount:c=>(c/100).toFixed(2),renderIfVisible:()=>{}
 });
 await insights.loadReport(start,end);
 const csv=insights.csvRows(start,end);
 assert.ok(csv.some(row=>row[0]==='Recorded income USD'&&row[1]==='34.00'));
 assert.ok(csv.some(row=>row[0]==='Expenses USD'&&row[1]==='10.00'));
 assert.ok(csv.some(row=>row[0]==='Goods Sold on counted days USD'&&row[1]==='35.00'));
 assert.ok(csv.some(row=>row[0]==='padel_courts'&&row[1]==='Income'));
 assert.ok(csv.some(row=>row[0]==='coaches'&&row[1]==='Expense'));
 assert.ok(csv.some(row=>row[0]==='Net Whish movement USD'&&row[1]==='4.00'));
 assert.ok(!csv.some(row=>row[0]==='Recorded income USD'&&row[1]==='38.00'));
 assert.deepEqual(insights.csvRows('2026-09-01','2026-09-30'),[]);
});
