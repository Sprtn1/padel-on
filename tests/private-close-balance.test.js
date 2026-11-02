import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cafePrivatePayments,cafePrivatePaymentsTotal,cafeTotals,cafeReconciliation} from '../lib/cafeteria-finances.js';
import {prepareArabicDailySheet} from '../lib/arabic-daily-pdf.js';

const DAY='2026-11-02';

test('A private balance closing is a negative daily payment, not a training session',()=>{
 const clients=[{id:'c1',name:'Layla Test',arabic_name:'ليلى تست',client_code:'PT-14'}];
 const entries=[
  {id:'receipt',client_id:'c1',entry_type:'deposit',entry_date:DAY,deposit_cents:2000,payment_channel:'cash',created_at:'1'},
  {id:'close',client_id:'c1',entry_type:'balance_close',entry_date:DAY,session_fee_cents:7500,payment_channel:'cash',created_at:'2'}
 ];
 const payments=cafePrivatePayments(entries,clients,DAY);
 assert.deepEqual(payments.map(p=>[p.id,p.type,p.amount_cents]),[
  ['receipt','Deposit / top-up',2000],['close','Balance closed',-7500]
 ]);
 assert.equal(payments[1].clientArabicName,'ليلى تست');
 assert.equal(cafePrivatePaymentsTotal(payments),-5500);
 assert.deepEqual(cafeTotals([],payments),{income:2000,expenses:7500,net:-5500,count:0});
 assert.equal(cafeReconciliation([],10000,payments).goodsSold,15500);
});

test('Cash balance closing prints under purchase from fund with Arabic name and ID',()=>{
 const sheet=prepareArabicDailySheet({
  date:DAY,rows:[],privateSessions:[],closingCash:null,whishOpening:60,whishRows:[],
  privatePayments:[{
   id:'close',entry_date:DAY,type:'Balance closed',clientName:'Layla Test',
   clientArabicName:'ليلى تست',clientCode:'PT-14',amount_cents:-7500,payment_channel:'cash'
  }]
 });
 assert.equal(sheet.receipts,0);
 assert.equal(sheet.expenses,7500);
 assert.deepEqual(sheet.expenseRows.find(r=>r[0]==='تسكير حساب ليلى تست (PT-14)'),
  ['تسكير حساب ليلى تست (PT-14)',7500,'401']);
 assert.equal(sheet.trainingRows.length,0);
 assert.ok(sheet.details.some(row=>row.section==='شراء من الصندوق'&&row.name==='تسكير حساب ليلى تست (PT-14)'));
 assert.ok(!sheet.amountRows.some(row=>String(row[0]).includes('Layla Test')));
});

test('Whish balance closing stays out of cash expenses and appears as a withdrawal',()=>{
 const sheet=prepareArabicDailySheet({
  date:DAY,rows:[],privateSessions:[],closingCash:null,whishOpening:10000,
  privatePayments:[{entry_date:DAY,clientName:'Client',clientCode:'9',amount_cents:-2500,payment_channel:'whish'}],
  whishRows:[{entry_date:DAY,entry_type:'withdrawal',name:'تسكير حساب عميل (9)',amount_cents:2500}]
 });
 assert.equal(sheet.expenses,0);
 assert.equal(sheet.whishWithdrawalsToday,2500);
 assert.equal(sheet.walletBalance,7500);
 assert.ok(!sheet.expenseRows.some(row=>String(row[0]).startsWith('تسكير حساب')));
});

test('Close Balance is admin-only and the database operation is atomic and auditable',()=>{
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 const finance=readFileSync(new URL('../lib/cafeteria-finances.js',import.meta.url),'utf8');
 const sql=readFileSync(new URL('../supabase/migrations/20261102123000_private_close_balance.sql',import.meta.url),'utf8');
 assert.match(app,/role==='admin'\?btn\('Close Balance'/);
 assert.match(app,/private_close_balance/);
 assert.match(app,/Only an administrator can close a client balance/);
 assert.match(finance,/entry_type==='balance_close'\?-Number\(e\.session_fee_cents/);
 assert.match(sql,/not public\.is_admin\(\)/i);
 assert.match(sql,/where id=p_client_id for update/i);
 assert.match(sql,/entry_type='balance_close'/i);
 assert.match(sql,/when NEW\.entry_type='balance_close' then 'withdrawal'/i);
 assert.match(sql,/grant execute on function public\.private_close_balance\(uuid,uuid,date,text\) to authenticated/i);
});
