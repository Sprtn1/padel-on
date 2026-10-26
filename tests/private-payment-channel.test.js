import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCafeteriaFinances,cafePrivatePayments,cafePrivatePaymentsTotal,cafeReconciliation} from '../lib/cafeteria-finances.js';
import {prepareArabicDailySheet} from '../lib/arabic-daily-pdf.js';

test('Private receipts can be assigned to Whish without inflating the physical cashbook',()=>{
 const day='2026-10-25',clients=[{id:'c1',name:'Test',client_code:'91'}];
 const entries=[
  {id:'a',client_id:'c1',entry_type:'session',entry_date:day,paid_cents:2000,payment_channel:'cash'},
  {id:'b',client_id:'c1',entry_type:'deposit',entry_date:day,deposit_cents:3000,payment_channel:'whish'},
  {id:'c',client_id:'c1',entry_type:'deposit',entry_date:day,deposit_cents:9999,payment_channel:'whish',voided_at:'x'}
 ];
 const payments=cafePrivatePayments(entries,clients,day);
 assert.deepEqual(payments.map(p=>p.payment_channel),['cash','whish']);
 assert.equal(cafePrivatePaymentsTotal(payments),2000);
 assert.equal(cafeReconciliation([],4000,payments).goodsSold,2000);
});
test('Arabic end-of-day cash sheet excludes Whish private receipts; wallet shows them once',()=>{
 const date='2026-10-25';
 const sheet=prepareArabicDailySheet({date,rows:[],closingCash:12000,whishOpening:60,
  privatePayments:[
   {entry_date:date,clientName:'Cash Client',clientCode:'12',amount_cents:2000,payment_channel:'cash'},
   {entry_date:date,clientName:'Whish Client',clientCode:'91',amount_cents:5000,payment_channel:'whish'}
  ],
  whishRows:[{entry_date:date,entry_type:'deposit',name:'مشترك: ليلى (91)',amount_cents:5000}]
 });
 assert.equal(sheet.receipts,2000);
 assert.equal(sheet.goodsSold,10000);
 assert.ok(sheet.amountRows.some(r=>r[0].includes('Cash Client')));
 assert.ok(!sheet.amountRows.some(r=>r[0].includes('Whish Client')));
 assert.equal(sheet.whishDepositsToday,5000);
 assert.equal(sheet.walletBalance,5060);
});
test('Finance UI retains private cash checkbox without redundant Whish client picker',()=>{
 const code=readFileSync(new URL('../lib/cafeteria-finances.js',import.meta.url),'utf8');
 for(const value of ['data-cafe-private-cash','private_set_payment_channel','source_private_entry_id'])
  assert.ok(code.includes(value),value);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.ok(app.includes('cafePrivateCash'));
 assert.doesNotMatch(code,/data-cafe-whish-client-search|whishClientLabel|whish-private-client-options/);
 assert.match(code,/WHISH_DESCRIPTION_PRESETS/);
 assert.match(code,/whish_record_entry/);
});

test('Closing verifies the newest private Cash/Whish route before submitting',async()=>{
 const date='2026-10-25',rpcCalls=[];
 let paymentChannel='cash',reads=0;
 const api={
  getSession:()=>({access_token:'test'}),
  listAll:async table=>{
   if(table==='cafeteria_finance_entries')return [
    {entry_date:date,category:'padel_courts',amount_cents:40698},
    {entry_date:date,category:'general_payment',amount_cents:10450}
   ];
   if(table==='cafeteria_finance_days')return [{day_date:date,closing_cash_cents:45500}];
   if(table==='private_clients')return [{id:'c',name:'Test Client'}];
   if(table==='private_ledger_entries'){
    reads++;return [{id:'payment',client_id:'c',entry_type:'session',entry_date:date,paid_cents:20000,payment_channel:paymentChannel}];
   }
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  },
  rpc:async(name,params)=>{rpcCalls.push({name,params});}
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>date,addDays:()=>date,rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 assert.match(widget.page(),/Negative difference/);
 paymentChannel='whish'; // staff updates it on another device while page remains open
 await widget.action({dataset:{action:'cafe-day-close'}});
 assert.equal(reads,3,'Closing reads private payments before validation and reloads after saving');
 assert.match(widget.page(),/\$152\.52/);
 assert.equal(rpcCalls.filter(c=>c.name==='cafeteria_change_day_status'&&c.params.p_action==='close').length,1);
});
test('Closing blocks a truly negative cash amount after fresh recheck',async()=>{
 const date='2026-10-25',rpcCalls=[];
 let paymentChannel='whish';
 const api={
  getSession:()=>({access_token:'test'}),
  listAll:async table=>{
   if(table==='cafeteria_finance_entries')return [
    {entry_date:date,category:'padel_courts',amount_cents:40698},
    {entry_date:date,category:'general_payment',amount_cents:10450}
   ];
   if(table==='cafeteria_finance_days')return [{day_date:date,closing_cash_cents:45500}];
   if(table==='private_clients')return [{id:'c',name:'Test Client'}];
   if(table==='private_ledger_entries')return [{id:'p',client_id:'c',entry_type:'session',entry_date:date,paid_cents:20000,payment_channel:paymentChannel}];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  },
  rpc:async(name)=>{rpcCalls.push(name);}
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>date,addDays:()=>date,rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 assert.match(widget.page(),/\$152\.52/);
 paymentChannel='cash';
 await assert.rejects(()=>widget.action({dataset:{action:'cafe-day-close'}}),/Negative Goods Sold/);
 assert.match(widget.page(),/Negative difference/);
 assert.ok(!rpcCalls.includes('cafeteria_change_day_status'));
});

test('Supabase closing RPC counts only cash-routed private payments, mirroring daily Goods Sold',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261026_close_day_exclude_private_whish.sql',import.meta.url),'utf8');
 assert.match(sql,/create or replace function public\.cafeteria_change_day_status/i);
 assert.match(sql,/perform pg_advisory_xact_lock/i);
 assert.match(sql,/private_ledger_entries[\s\S]{0,180}payment_channel='cash'/);
 assert.match(sql,/v_difference<0/);
 assert.match(sql,/grant execute on function public\.cafeteria_change_day_status\(date,text,text\) to authenticated/i);
 const rows=[
  {entry_type:'session',paid_cents:20000,payment_channel:'whish'},
  {entry_type:'deposit',deposit_cents:1000,payment_channel:'cash'}
 ];
 const cashReceipts=rows.filter(x=>x.payment_channel==='cash').reduce((sum,e)=>
  sum+Number(e.entry_type==='session'?e.paid_cents:e.deposit_cents),0);
 const dashboard=cafeReconciliation([{category:'padel_courts',amount_cents:40698},
  {category:'general_payment',amount_cents:10450}],45500,rows.map(e=>({
   payment_channel:e.payment_channel,
   amount_cents:Number(e.entry_type==='session'?e.paid_cents:e.deposit_cents)
  })));
 const serverDifference=45500+10450-40698-cashReceipts;
 assert.equal(serverDifference,dashboard.goodsSold);
 assert.equal(serverDifference,14252);
 const oldBrokenDifference=45500+10450-40698-21000;
 assert.ok(oldBrokenDifference<0,'The old RPC produced a false negative by counting Whish as cash');
});
