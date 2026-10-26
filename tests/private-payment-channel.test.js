import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {cafePrivatePayments,cafePrivatePaymentsTotal,cafeReconciliation} from '../lib/cafeteria-finances.js';
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
test('Finance UI wires the private cash checkbox and Whish client picker',()=>{
 const code=readFileSync(new URL('../lib/cafeteria-finances.js',import.meta.url),'utf8');
 for(const value of ['data-cafe-private-cash','private_set_payment_channel','data-cafe-whish-client-search','whishClientLabel','source_private_entry_id'])
  assert.ok(code.includes(value),value);
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.ok(app.includes('cafePrivateCash'));
});
