import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_CATEGORIES, CAFE_RENTAL_PRICE_CENTS, cafeMoneyCents,
  cafeQuantity, cafeEntryFromForm, cafeTotals, cafeReconciliation,
  cafePlayerCount, cafeNonnegativeCents, cafePrivatePayments, cafePrivateSessions,
  whishSummary, whishFormEntry, WHISH_DESCRIPTION_PRESETS, groupWhishTransactions,
  cafePrivatePaymentsTotal, createCafeteriaFinances
} from '../lib/cafeteria-finances.js';

test('all cashbook categories exist and fixed rental price is $2',()=>{
 assert.equal(CAFE_CATEGORIES.length,20);
 const rental=CAFE_CATEGORIES.findIndex(c=>c.id==='racket_rental');
 assert.deepEqual(CAFE_CATEGORIES.slice(rental+1,rental+3).map(c=>c.id),['clothes','racket_sold']);
 assert.equal(CAFE_RENTAL_PRICE_CENTS,200);
 assert.deepEqual(CAFE_CATEGORIES.filter(x=>x.kind==='court').map(x=>x.label),['Padel Courts','Pickleball Courts','Basketball Courts']);
});

test('variable prices, quantity and court checkboxes calculate independently',()=>{
 assert.deepEqual(cafeEntryFromForm('grips',{quantity:'3',unit_price:'2.50'}),{
  category:'grips',name:'',amount_cents:750,quantity:3,unit_price_cents:250,
  checkmarks:[false,false,false,false]
 });
 const ball=cafeEntryFromForm('balls',{quantity:'2',unit_price:'5'});
 assert.equal(ball.amount_cents,1000);
 const rental=cafeEntryFromForm('racket_rental',{quantity:'4'});
 assert.equal(rental.amount_cents,800);
 assert.equal(rental.unit_price_cents,200);
 const court=cafeEntryFromForm('padel_courts',{name:'Court A – John',amount:'40.50',check0:'on',check2:'on'});
 assert.equal(court.amount_cents,4050);
 assert.deepEqual(court.checkmarks,[true,false,true,false]);
 assert.equal(cafeEntryFromForm('coaches',{amount:'15.25'}).amount_cents,1525);
 const basketball=cafeEntryFromForm('basketball_courts',{
  name:'Six players',amount:'50',check0:'on',check4:'on',check5:'on'
 });
 assert.equal(cafePlayerCount('basketball_courts'),6);
 assert.equal(cafePlayerCount('pickleball_courts'),4);
 assert.deepEqual(basketball.checkmarks,[true,false,false,false,true,true]);
});

test('money and input validation prevent invalid totals',()=>{
 assert.equal(cafeMoneyCents('2.99'),299);
 assert.equal(cafeQuantity('9999'),9999);
 for(const x of ['','0','-2','1.234','Infinity','5e2'])assert.throws(()=>cafeMoneyCents(x));
 for(const x of ['0','1.5','-1','10000'])assert.throws(()=>cafeQuantity(x));
 assert.throws(()=>cafeEntryFromForm('other_income',{name:'',amount:'30'}));
 assert.throws(()=>cafeEntryFromForm('padel_courts',{name:'',amount:'30'}));
 assert.throws(()=>cafeEntryFromForm('racket_rental',{quantity:'0'}));
 assert.equal(cafeNonnegativeCents('0'),0);
 assert.equal(cafeNonnegativeCents('0.00'),0);
 assert.equal(cafeNonnegativeCents('123.45'),12345);
 assert.throws(()=>cafeNonnegativeCents('-10'));
 assert.throws(()=>cafeNonnegativeCents(''));
});

test('totals exclude voids and keep expenses separate',()=>{
 const totals=cafeTotals([
  {category:'padel_courts',amount_cents:4000},
  {category:'racket_rental',amount_cents:400},
  {category:'general_payment',amount_cents:1500},
  {category:'coaches',amount_cents:1800},
  {category:'cafeteria_stock',amount_cents:900,voided_at:'2026-10-21T09:00:00Z'}
 ]);
 assert.deepEqual(totals,{income:4400,expenses:3300,net:1100,count:4});
});

test('closing cash reconciles Goods Sold in integer cents and flags negatives',()=>{
 const entries=[
  {category:'padel_courts',amount_cents:6000},
  {category:'grips',amount_cents:500},
  {category:'general_payment',amount_cents:1200},
  {category:'coaches',amount_cents:300}
 ];
 assert.deepEqual(cafeReconciliation(entries),{
  income:6500,expenses:1500,net:5000,count:4,
  closingCash:null,totalGenerated:null,goodsSold:null
 });
 const balanced=cafeReconciliation(entries,9000);
 assert.equal(balanced.totalGenerated,10500);
 assert.equal(balanced.goodsSold,4000);
 assert.equal(cafeReconciliation(entries,0).goodsSold,-5000);
});

test('page shows saved cash, auto Goods Sold and six basketball player-paid ticks',async()=>{
 const entries=[
  {id:'court-1',category:'basketball_courts',name:'Six players',amount_cents:2000,
    checkmarks:[true,false,false,false,true,true]},
  {id:'court-2',category:'padel_courts',name:'Padel',amount_cents:3000,
    checkmarks:[true,false,true,false]},
  {id:'cost-1',category:'general_payment',name:'Paid',amount_cents:500}
 ];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>table==='cafeteria_finance_days'?[{closing_cash_cents:5000}]:
     table==='whish_wallet_settings'?[{opening_balance_cents:60}]:
     table==='whish_ledger_entries'?[]:entries
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'<h1>Cafeteria Finances</h1>',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',
  addDays:(date,increment)=>new Date(Date.parse(date+'T12:00:00Z')+increment*86400000).toISOString().slice(0,10),
  rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 for(const category of CAFE_CATEGORIES)assert.ok(html.includes(category.label),'Missing category '+category.label);
 assert.match(html,/Goods Sold \(automatic\)/);
 assert.match(html,/Total generated today/);
 assert.match(html,/\$55\.00/);
 assert.match(html,/\$5\.00/);
 assert.match(html,/Save closing cash/);
 assert.match(html,/Players paid \(6\)/);
 assert.match(html,/Players paid \(4\)/);
 assert.match(html,/aria-label="Player 6 paid"/);
 assert.doesNotMatch(html,/data-action="cafe-void"/);
});

test('saving closing cash updates the daily reconciliation without a manual goods entry',async()=>{
 let cash=null,called=[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>table==='cafeteria_finance_days'?(cash===null?[]:[{closing_cash_cents:cash}]):[],
  rpc:async(name,args)=>{called.push([name,args]);cash=args.p_closing_cash_cents;}
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 assert.match(widget.page(),/Enter closing cash first/);
 const priorFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{entries(){return [['closing_cash','80.00']][Symbol.iterator]();}};
  const button={disabled:false,isConnected:false};
  await widget.submit({dataset:{cafeSave:'closing'},querySelector:()=>button});
 }finally{globalThis.FormData=priorFormData;}
 assert.equal(called.length,1);
 assert.equal(called[0][0],'cafeteria_finance_set_closing_cash');
 assert.equal(called[0][1].p_closing_cash_cents,8000);
 assert.equal(called[0][1].p_day_date,'2026-10-21');
 assert.match(widget.page(),/\$80\.00/);
 assert.doesNotMatch(widget.page(),/Enter closing cash first/);
});

test('separate paid-player updates can save concurrently without overwriting each other',async()=>{
 const entry={
  id:'basketball-1',category:'basketball_courts',name:'Match',
  amount_cents:3600,checkmarks:[false,false,false,false,false,false]
 };
 const calls=[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>table==='cafeteria_finance_entries'?[entry]:[],
  rpc:async(name,args)=>{calls.push({name,...args});await Promise.resolve();}
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:n=>'$'+n/100,today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const player1={dataset:{cafeMarker:'basketball-1',markerIndex:'0'},checked:true};
 const player6={dataset:{cafeMarker:'basketball-1',markerIndex:'5'},checked:true};
 await Promise.all([widget.change(player1),widget.change(player6)]);
 assert.deepEqual(calls.map(c=>[c.name,c.p_player_no,c.p_paid]),[
  ['cafeteria_finance_set_player_paid',1,true],
  ['cafeteria_finance_set_player_paid',6,true]
 ]);
 assert.deepEqual(entry.checkmarks,[true,false,false,false,false,true]);
});


test('private session receipts include paid sessions and deposits, not fees or voids',()=>{
 const source=[
  {id:'s1',entry_date:'2026-10-21',entry_type:'session',client_id:'a',session_fee_cents:10000,paid_cents:2500,created_at:'2026-10-21T08:00:00Z'},
  {id:'d1',entry_date:'2026-10-21',entry_type:'deposit',client_id:'b',deposit_cents:3000,created_at:'2026-10-21T09:00:00Z'},
  {id:'s2',entry_date:'2026-10-21',entry_type:'session',client_id:'a',session_fee_cents:5000,paid_cents:0},
  {id:'void',entry_date:'2026-10-21',entry_type:'deposit',client_id:'a',deposit_cents:9999,voided_at:'2026-10-21T12:00:00Z'},
  {id:'older',entry_date:'2026-10-20',entry_type:'session',client_id:'a',paid_cents:1500},
 ];
 const clients=[{id:'a',name:'Alex',client_code:'P-1001'}, {id:'b',name:'Sam',client_code:'P-1002'}];
 const receipts=cafePrivatePayments(source,clients,'2026-10-21');
 assert.deepEqual(receipts.map(r=>[r.id,r.clientName,r.clientCode,r.type,r.amount_cents]),[
  ['s1','Alex','P-1001','Session payment',2500],
  ['d1','Sam','P-1002','Deposit / top-up',3000]
 ]);
 assert.equal(cafePrivatePaymentsTotal(receipts),5500);
 const cashbook=[
  {category:'padel_courts',amount_cents:6000},
  {category:'general_payment',amount_cents:1200}
 ];
 const totals=cafeReconciliation(cashbook,18000,receipts);
 assert.equal(totals.income,11500);
 assert.equal(totals.totalGenerated,19200);
 assert.equal(totals.goodsSold,7700);
});

test('private payments render as a read-only daily table and update on refresh',async()=>{
 let extraPayment=0;
 const queries=[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table,filter)=>{
   queries.push([table,filter]);
   if(table==='cafeteria_finance_entries')return [
    {category:'padel_courts',name:'Court',amount_cents:6000,checkmarks:[false,false,false,false]}
   ];
   if(table==='cafeteria_finance_days')return [{closing_cash_cents:12000}];
   if(table==='whish_ledger_entries')return [];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   if(table==='cafeteria_day_closings')return [];
   if(table==='private_clients')return [{id:'client1',name:'Jamie & Co',client_code:'PS-0042'}];
   if(table==='private_ledger_entries')return [
    {id:'pay-1',entry_type:'session',entry_date:'2026-10-21',client_id:'client1',paid_cents:2500,session_fee_cents:8000},
    ...(extraPayment?[{id:'pay-2',entry_type:'deposit',entry_date:'2026-10-21',client_id:'client1',deposit_cents:extraPayment}]:[])
   ];
   throw Error('Unexpected source '+table);
  }
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 let html=widget.page();
 assert.match(html,/Client Private Sessions Payments/);
 assert.match(html,/Jamie &amp; Co/);
 assert.match(html,/<th>Client name<\/th><th>Client ID<\/th><th>Payment type<\/th><th>Amount paid<\/th>/);
 assert.match(html,/<td>Jamie &amp; Co<\/td><td>PS-0042<\/td><td>Session payment<\/td><td>\$25\.00<\/td>/);
 assert.match(html,/\$25\.00/);
 // Closing 120, other income 60+25, Goods Sold 35.
 assert.match(html,/\$35\.00/);
 assert.ok(queries.some(([table,filter])=>table==='private_ledger_entries'&&filter.startsWith('entry_date=eq.2026-10-21')));
 const card=html.split('cafe-private-payments-card')[1].split('</section>')[0];
 assert.doesNotMatch(card,/data-cafe-save/);
 assert.doesNotMatch(card,/data-action="cafe-void"/);
 extraPayment=1500;
 await widget.load(true);
 html=widget.page();
 assert.match(html,/Deposit \/ top-up/);
 assert.match(html,/<td>Jamie &amp; Co<\/td><td>PS-0042<\/td><td>Deposit \/ top-up<\/td><td>\$15\.00<\/td>/);
 assert.match(html,/\$40\.00/);
 assert.match(html,/\$20\.00/);
});

test('private-payment feed errors prevent incomplete reconciliation',async()=>{
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>{
   if(table==='private_ledger_entries')throw Error('Private Sessions temporarily unavailable');
   if(table==='cafeteria_finance_days')return [{closing_cash_cents:12000}];
   return [];
  }
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 assert.match(html,/Private Sessions temporarily unavailable/);
 assert.doesNotMatch(html,/Goods Sold \(automatic\)/);
});

test('private payments show unassigned client IDs clearly and escape client fields',async()=>{
 const source=[
  {id:'a1',entry_date:'2026-10-21',entry_type:'deposit',client_id:'a',deposit_cents:1000},
  {id:'b1',entry_date:'2026-10-21',entry_type:'session',client_id:'b',paid_cents:2300}
 ];
 const clients=[
  {id:'a',name:'<Client A>',client_code:null},
  {id:'b',name:'Client B',client_code:'B&007'}
 ];
 const receipts=cafePrivatePayments(source,clients,'2026-10-21');
 assert.deepEqual(receipts.map(p=>p.clientCode),[null,'B&007']);
 const widget=createCafeteriaFinances({
  api:{
   getSession:()=>({access_token:'token'}),
   listAll:async(table)=>table==='private_ledger_entries'?source:table==='private_clients'?clients:[]
  },
  heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',addDays:()=> '2026-10-20',
  rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const paymentsTable=widget.page().match(/<table class="cafe-auto-payments">([\s\S]*?)<\/table>/)?.[1]||'';
 assert.match(paymentsTable,/<td>&lt;Client A&gt;<\/td><td>Not assigned<\/td>/);
 assert.match(paymentsTable,/<td>Client B<\/td><td>B&amp;007<\/td>/);
 assert.equal((paymentsTable.match(/<tr>/g)||[]).length,3);
});

test('Clothes and Racket Sold support repeated independently priced transactions',()=>{
 const clothes1=cafeEntryFromForm('clothes',{amount:'12.50'});
 const clothes2=cafeEntryFromForm('clothes',{amount:'19.00'});
 const racket1=cafeEntryFromForm('racket_sold',{amount:'80.00',name:'Blue model'});
 const racket2=cafeEntryFromForm('racket_sold',{amount:'125.99'});
 assert.deepEqual([clothes1.amount_cents,clothes2.amount_cents,racket1.amount_cents,racket2.amount_cents],[1250,1900,8000,12599]);
 assert.deepEqual([clothes1.quantity,racket1.quantity],[1,1]);
 assert.deepEqual([clothes1.unit_price_cents,racket1.unit_price_cents],[0,0]);
 assert.equal(racket1.name,'Blue model');
 const totals=cafeReconciliation([clothes1,clothes2,racket1,racket2],30000);
 assert.equal(totals.income,23749);
 assert.equal(totals.goodsSold,6251);
 assert.equal(totals.count,4);
 assert.throws(()=>cafeEntryFromForm('clothes',{amount:'0'}));
 assert.throws(()=>cafeEntryFromForm('racket_sold',{amount:'not a number'}));
});
test('Clothes and Racket Sold appear below Racket Rental and can add multiple entries',async()=>{
 const saved=[
  {id:'c1',category:'clothes',amount_cents:1500,name:'Shirt'},
  {id:'c2',category:'clothes',amount_cents:2900,name:'Shorts'},
  {id:'r1',category:'racket_sold',amount_cents:8500,name:'Racket model A'},
  {id:'r2',category:'racket_sold',amount_cents:9000,name:'Racket model B'}
 ];
 const widget=createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async(table)=>
   table==='cafeteria_finance_entries'?saved:table==='cafeteria_finance_days'?[{closing_cash_cents:30000}]:[]},
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=> '2026-10-21',addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 assert.ok(html.indexOf('<h3>Racket Rental</h3>')<html.indexOf('<h3>Clothes</h3>'));
 assert.ok(html.indexOf('<h3>Clothes</h3>')<html.indexOf('<h3>Racket Sold</h3>'));
 assert.match(html,/data-category="clothes"/);
 assert.match(html,/data-category="racket_sold"/);
 assert.match(html,/Shirt/);
 assert.match(html,/Shorts/);
 assert.match(html,/Racket model A/);
 assert.match(html,/Racket model B/);
 assert.match(html,/\$44\.00/);
 assert.match(html,/\$175\.00/);
});

test('Whish balance starts at 60 cents and tracks separate deposit and withdrawal rows',()=>{
 const entries=[
  {id:'a',entry_type:'deposit',entry_date:'2026-10-20',amount_cents:5000},
  {id:'b',entry_type:'deposit',entry_date:'2026-10-21',amount_cents:425},
  {id:'c',entry_type:'withdrawal',entry_date:'2026-10-21',amount_cents:2100},
  {id:'d',entry_type:'withdrawal',entry_date:'2026-10-21',amount_cents:9999,voided_at:'2026-10-21T12:00:00Z'}
 ];
 assert.deepEqual(whishSummary(entries,60),{opening:60,deposits:5425,withdrawals:2100,balance:3385,count:3});
 assert.deepEqual(whishSummary(entries,60,'2026-10-20'),{opening:60,deposits:5000,withdrawals:0,balance:5060,count:1});
 assert.deepEqual(whishSummary([]),{opening:60,deposits:0,withdrawals:0,balance:60,count:0});
 assert.deepEqual(whishFormEntry('deposit',{name:'  Alex ',amount:'15.25'}),{
  entry_type:'deposit',name:'Alex',amount_cents:1525
 });
 assert.deepEqual(whishFormEntry('withdrawal',{name:'Shop',amount:'8.99'}),{
  entry_type:'withdrawal',name:'Shop',amount_cents:899
 });
 assert.throws(()=>whishFormEntry('cash',{name:'Alex',amount:'15'}));
 assert.throws(()=>whishFormEntry('deposit',{name:'  ',amount:'15'}));
 assert.throws(()=>whishFormEntry('withdrawal',{name:'Alex',amount:'-1'}));
});

test('Whish is excluded from all physical cash and Goods Sold calculations',()=>{
 const cashbook=[
  {category:'padel_courts',amount_cents:5000},
  {category:'coaches',amount_cents:1000}
 ];
 const previous=cafeReconciliation(cashbook,9000);
 const whish=[
  {entry_date:'2026-10-21',entry_type:'deposit',amount_cents:25000},
  {entry_date:'2026-10-21',entry_type:'withdrawal',amount_cents:6000}
 ];
 assert.deepEqual(cafeReconciliation(cashbook,9000),previous);
 assert.equal(previous.income,5000);
 assert.equal(previous.expenses,1000);
 assert.equal(previous.totalGenerated,10000);
 assert.equal(previous.goodsSold,5000);
 assert.equal(whishSummary(whish,60).balance,19060);
});

test('Whish cards show independent daily history and current balance across dates',async()=>{
 const requests=[];
 const whish=[
  {id:'x1',entry_date:'2026-10-20',entry_type:'deposit',name:'Prior day',amount_cents:2000},
  {id:'x2',entry_date:'2026-10-21',entry_type:'deposit',name:'Alice',amount_cents:1200},
  {id:'x3',entry_date:'2026-10-21',entry_type:'deposit',name:'Clothes <sale>',amount_cents:2500},
  {id:'x4',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Bank & Fees',amount_cents:800},
  {id:'x5',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Correction',amount_cents:10000,voided_at:'x'}
 ];
 const widget=createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async(table,filter)=>{
   requests.push([table,filter]);
   if(table==='whish_ledger_entries')return whish;
   if(table==='whish_wallet_settings')return [{id:1,opening_balance_cents:60}];
   if(table==='cafeteria_finance_days')return [{closing_cash_cents:10000}];
   return [];
  }},
  heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',addDays:()=> '2026-10-20',
  rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 assert.match(html,/Whish Deposits/);
 assert.match(html,/Whish Withdrawals/);
 assert.match(html,/data-whish-type="deposit"/);
 assert.match(html,/data-whish-type="withdrawal"/);
 assert.match(html,/Current Whish balance/);
 assert.match(html,/\$49\.60/);
 assert.match(html,/\$37\.00/);
 assert.match(html,/\$8\.00/);
 assert.match(html,/Clothes &lt;sale&gt;/);
 assert.match(html,/Bank &amp; Fees/);
 assert.doesNotMatch(html,/<td>Prior day<\/td>/);
 assert.doesNotMatch(html,/<td>Correction<\/td>/);
 assert.doesNotMatch(html,/data-action="cafe-whish-void"/);
 assert.ok(requests.some(([table])=>table==='whish_ledger_entries'));
 assert.match(html,/Goods Sold \(automatic\)/);
 // No physical sales or payments: Goods Sold must remain $100.00, not changed by Whish.
 assert.match(html,/\$100\.00/);
});

test('Whish payments can be added repeatedly and update balance with ledger date',async()=>{
 const whish=[];
 const recorded=[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(table)=>{
   if(table==='whish_ledger_entries')return whish.slice();
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  },
  rpc:async(name,args)=>{
   recorded.push({name,args});
   if(name==='whish_record_entry')whish.push({
    id:args.p_entry_id,entry_date:args.p_entry_date,entry_type:args.p_entry_type,
    name:args.p_name,amount_cents:args.p_amount_cents
   });
  }
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const oldFormData=globalThis.FormData;
 const oldCrypto=globalThis.crypto;
 try{
  let data={name:'Alice',amount:'10.00'};
  globalThis.FormData=class{entries(){return Object.entries(data)[Symbol.iterator]();}};
  if(!globalThis.crypto?.randomUUID)globalThis.crypto={randomUUID:()=> 'test-uuid'};
  const form=type=>({dataset:{cafeSave:'whish',whishType:type},
   querySelector:()=>({disabled:false,isConnected:false})});
  await widget.submit(form('deposit'));
  data={name:'Bob',amount:'2.50'};
  await widget.submit(form('deposit'));
  data={name:'Supplies',amount:'5.00'};
  await widget.submit(form('withdrawal'));
 }finally{
  globalThis.FormData=oldFormData;
  if(oldCrypto===undefined)delete globalThis.crypto;else globalThis.crypto=oldCrypto;
 }
 assert.equal(recorded.length,3);
 assert.deepEqual(recorded.map(r=>[r.name,r.args.p_entry_type,r.args.p_amount_cents]),[
  ['whish_record_entry','deposit',1000],
  ['whish_record_entry','deposit',250],
  ['whish_record_entry','withdrawal',500]
 ]);
 assert.ok(recorded.every(r=>r.args.p_entry_date==='2026-10-21'));
 const html=widget.page();
 assert.match(html,/\$8\.10/);
 assert.match(html,/Alice/);
 assert.match(html,/Bob/);
 assert.match(html,/Supplies/);
});

test('Whish preset names are correct and offered only in their own sections',async()=>{
 assert.deepEqual(WHISH_DESCRIPTION_PRESETS.deposit,['Goods Sold','Padel Courts']);
 assert.deepEqual(WHISH_DESCRIPTION_PRESETS.withdrawal,['Transfer from Whish to Miscellaneous Cash Box']);
 const widget=createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async(table)=>table==='whish_wallet_settings'?[{opening_balance_cents:60}]:[]},
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const page=widget.page();
 const deposit=page.split('<h3>Whish Deposits</h3>')[1].split('</section>')[0];
 const withdrawal=page.split('<h3>Whish Withdrawals</h3>')[1].split('</section>')[0];
 assert.match(deposit,/Goods Sold/);
 assert.match(deposit,/Padel Courts/);
 assert.doesNotMatch(deposit,/Miscellaneous Cash Box/);
 assert.match(withdrawal,/Transfer from Whish to Miscellaneous Cash Box/);
 assert.doesNotMatch(withdrawal,/Goods Sold/);
 assert.match(deposit,/name="name" required maxlength="120"/);
 assert.match(withdrawal,/name="amount" required type="number"/);
 assert.match(page,/data-action="cafe-whish-preset"/);
});

test('Whish preset fills name but allows custom editing and never saves on click',async()=>{
 const calls=[];
 const widget=createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async()=>[],rpc:async(...args)=>calls.push(args)},
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),today:()=> '2026-10-21',
  addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const input={value:'',focus(){this.focused=true}};
 const form={dataset:{whishType:'deposit'},querySelector:()=>input};
 const button=(type,index)=>({
  dataset:{action:'cafe-whish-preset',whishType:type,presetIndex:String(index)},closest:()=>form
 });
 await widget.action(button('deposit',0));
 assert.equal(input.value,'Goods Sold');
 await widget.action(button('deposit',1));
 assert.equal(input.value,'Padel Courts');
 input.value='Custom client transfer';
 assert.equal(input.value,'Custom client transfer');
 form.dataset.whishType='withdrawal';
 await widget.action(button('withdrawal',0));
 assert.equal(input.value,'Transfer from Whish to Miscellaneous Cash Box');
 assert.ok(input.focused);
 assert.equal(calls.length,0);
 let rejected=false;try{await widget.action(button('withdrawal',22))}catch{rejected=true}
 assert.ok(rejected);
});

test('identical Whish names automatically sum, but different case, dates, types and voids stay separate',()=>{
 const entries=[
  {id:'d1',entry_date:'2026-10-21',entry_type:'deposit',name:'Goods Sold',amount_cents:30},
  {id:'d2',entry_date:'2026-10-21',entry_type:'deposit',name:'Padel Courts',amount_cents:500},
  {id:'d3',entry_date:'2026-10-21',entry_type:'deposit',name:'Goods Sold',amount_cents:10},
  {id:'d4',entry_date:'2026-10-21',entry_type:'deposit',name:'goods sold',amount_cents:90},
  {id:'d5',entry_date:'2026-10-20',entry_type:'deposit',name:'Goods Sold',amount_cents:80},
  {id:'w1',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Goods Sold',amount_cents:20},
  {id:'w2',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Goods Sold',amount_cents:50},
  {id:'void',entry_date:'2026-10-21',entry_type:'deposit',name:'Goods Sold',amount_cents:999,voided_at:'2026-10-21T13:00:00Z'}
 ];
 const deposits=groupWhishTransactions(entries,'2026-10-21','deposit');
 assert.deepEqual(deposits.map(x=>[x.name,x.amount_cents,x.count]),[
  ['Goods Sold',40,2],['Padel Courts',500,1],['goods sold',90,1]
 ]);
 assert.deepEqual(deposits[0].entries.map(x=>x.id),['d1','d3']);
 const withdrawals=groupWhishTransactions(entries,'2026-10-21','withdrawal');
 assert.deepEqual(withdrawals.map(x=>[x.name,x.amount_cents,x.count]),[['Goods Sold',70,2]]);
 const originalWallet=whishSummary(entries,60);
 assert.equal(originalWallet.balance,60+30+500+10+90+80-20-50);
 assert.deepEqual(entries[0].amount_cents,30); // Original entries are not replaced.
 assert.throws(()=>groupWhishTransactions(entries,'2026-10-21','invalid'));
});

test('Whish table displays one summed row per name with expandable individual transactions and correction actions',async()=>{
 const items=[
  {id:'d1',entry_date:'2026-10-21',entry_type:'deposit',name:'Goods Sold',amount_cents:30},
  {id:'d2',entry_date:'2026-10-21',entry_type:'deposit',name:'Goods Sold',amount_cents:10},
  {id:'d3',entry_date:'2026-10-21',entry_type:'deposit',name:'Padel Courts',amount_cents:500},
  {id:'w1',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Misc Cash',amount_cents:200},
  {id:'w2',entry_date:'2026-10-21',entry_type:'withdrawal',name:'Misc Cash',amount_cents:100}
 ];
 const build=isAdmin=>createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async table=>
   table==='whish_ledger_entries'?items:table==='whish_wallet_settings'?[{opening_balance_cents:60}]:[]},
  heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-21',addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},isAdmin:()=>isAdmin
 });
 const staff=build(false);await staff.load();
 const html=staff.page();
 const deposits=html.split('<h3>Whish Deposits</h3>')[1].split('</section>')[0];
 const withdrawals=html.split('<h3>Whish Withdrawals</h3>')[1].split('</section>')[0];
 assert.equal((deposits.match(/<tr><td><span class="whish-group-label">Goods Sold<\/span>/g)||[]).length,1);
 assert.match(deposits,/<td>\$0\.40<\/td>/);
 assert.match(deposits,/<summary>2 transactions · View details<\/summary>/);
 assert.match(deposits,/<span>Entry 1<\/span><strong>\$0\.30<\/strong>/);
 assert.match(deposits,/<span>Entry 2<\/span><strong>\$0\.10<\/strong>/);
 assert.match(withdrawals,/<span class="whish-group-label">Misc Cash<\/span>/);
 assert.match(withdrawals,/<td>\$3\.00<\/td>/);
 assert.doesNotMatch(deposits,/data-action="cafe-whish-void"/);
 const admin=build(true);await admin.load();
 const adminHtml=admin.page();
 for(const id of ['d1','d2','d3','w1','w2'])assert.match(adminHtml,new RegExp('data-id="'+id+'"'));
 assert.equal((adminHtml.match(/data-action="cafe-whish-void"/g)||[]).length,5);
 const opening=whishSummary(items,60).balance;
 assert.equal(opening,60+30+10+500-200-100);
 assert.match(adminHtml,/Goods Sold \(automatic\)/);
});

test('Arabic PDF export action downloads the selected daily data without writing documents to Supabase',async()=>{
 const seen=[],writes=[];
 const day='2026-10-21';
 const cash=[{id:'c1',entry_date:day,category:'padel_courts',amount_cents:4000,name:'Game A'}];
 const receipts=[{id:'p1',entry_date:day,entry_type:'session',client_id:'id1',paid_cents:1500,session_fee_cents:3000}];
 const wallet=[{id:'w1',entry_date:day,entry_type:'deposit',name:'Goods Sold',amount_cents:700}];
 const widget=createCafeteriaFinances({
  api:{
   getSession:()=>({access_token:'token'}),
   listAll:async(table)=>{
    if(table==='cafeteria_finance_entries')return cash;
    if(table==='cafeteria_finance_days')return [{closing_cash_cents:5000}];
    if(table==='private_ledger_entries')return receipts;
    if(table==='private_clients')return [{id:'id1',name:'Ali',client_code:'CL-1'}];
    if(table==='whish_ledger_entries')return wallet;
    if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   if(table==='cafeteria_day_closings')return [];
    throw Error('Unexpected source '+table);
   },
   rpc:async(...args)=>writes.push(args)
  },
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>day,addDays:()=> '2026-10-20',rerender:()=>{},toast:()=>{},
  isAdmin:()=>false,exportArabicPdf:payload=>{seen.push(payload);return 2}
 });
 await widget.load();
 // Restore the PDF button after the precise accounting mappings are implemented.
 assert.match(widget.page(),/data-action="cafe-export-arabic-pdf"/);
 await widget.action({dataset:{action:'cafe-export-arabic-pdf'}});
 assert.equal(seen.length,1);
 assert.equal(seen[0].date,day);
 assert.equal(seen[0].closingCash,5000);
 assert.equal(seen[0].whishOpening,60);
 assert.equal(seen[0].rows[0].name,'Game A');
 assert.equal(seen[0].privatePayments[0].clientCode,'CL-1');
 assert.equal(seen[0].whishRows[0].name,'Goods Sold');
 assert.equal(seen[0].privateSessions[0].clientName,'Ali');
 assert.equal(writes.length,0);
});

test('unpaid Private Sessions are included in PDF coaching grid but not as cash received',()=>{
 const entries=[
  {id:'one',entry_date:'2026-10-21',entry_type:'session',client_id:'jana',session_fee_cents:3000,paid_cents:0},
  {id:'two',entry_date:'2026-10-21',entry_type:'session',client_id:'ali',session_fee_cents:2500,paid_cents:0},
  {id:'deposit',entry_date:'2026-10-21',entry_type:'deposit',client_id:'jana',deposit_cents:1000},
  {id:'voided',entry_date:'2026-10-21',entry_type:'session',client_id:'jana',session_fee_cents:4000,voided_at:'x'}
 ];
 const clients=[
  {id:'jana',name:'Jana Bleibel',client_code:'2'},
  {id:'ali',name:'Ali Akhdar',client_code:'49'}
 ];
 const sessions=cafePrivateSessions(entries,clients,'2026-10-21');
 const payments=cafePrivatePayments(entries,clients,'2026-10-21');
 assert.deepEqual(sessions.map(s=>[s.clientName,s.clientCode,s.sessionFeeCents,s.paidAtSessionCents]),[
  ['Jana Bleibel','2',3000,0],['Ali Akhdar','49',2500,0]
 ]);
 assert.equal(payments.length,1);
 assert.equal(payments[0].amount_cents,1000);
});

test('dedicated summer camp shoes academy and family debt accept repeated entries and calculate separately',()=>{
 const entries=[
  cafeEntryFromForm('summer_camp',{amount:'10.25'}),
  cafeEntryFromForm('summer_camp',{amount:'7.75',name:'Morning'}),
  cafeEntryFromForm('shoes',{amount:'24.50'}),
  cafeEntryFromForm('basketball_academy',{amount:'35.00'}),
  cafeEntryFromForm('family_debt',{amount:'6.99'}),
  cafeEntryFromForm('family_debt',{amount:'1.01',name:'Family'})
 ];
 assert.deepEqual(entries.map(e=>e.amount_cents),[1025,775,2450,3500,699,101]);
 assert.ok(entries.every(e=>e.unit_price_cents===0&&e.quantity===1));
 const totals=cafeTotals(entries);
 assert.equal(totals.income,7750);assert.equal(totals.expenses,800);
 assert.equal(totals.net,6950);assert.equal(totals.count,6);
 assert.throws(()=>cafeEntryFromForm('shoes',{amount:'0'}));
 assert.throws(()=>cafeEntryFromForm('family_debt',{amount:'-2'}));
});
test('new income and expense cards render individual records without modifying cash formula',async()=>{
 const day='2026-10-22';
 const rows=[
  {entry_date:day,category:'summer_camp',name:'First',amount_cents:1100},
  {entry_date:day,category:'summer_camp',name:'Second',amount_cents:1900},
  {entry_date:day,category:'shoes',name:'Pair',amount_cents:2300},
  {entry_date:day,category:'basketball_academy',name:'Academy',amount_cents:8000},
  {entry_date:day,category:'family_debt',name:'Family',amount_cents:1000}
 ];
 const widget=createCafeteriaFinances({
  api:{getSession:()=>({access_token:'token'}),listAll:async table=>
   table==='cafeteria_finance_entries'?rows:
   table==='cafeteria_finance_days'?[{closing_cash_cents:20000}]:
   table==='whish_wallet_settings'?[{opening_balance_cents:60}]:[]},
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>day,addDays:()=> '2026-10-21',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 for(const id of ['summer_camp','shoes','basketball_academy','family_debt'])
  assert.match(html,new RegExp('data-category="'+id+'"'));
 for(const name of ['Summer Camp','Shoes','Basketball Academy','Family Debt','First','Second'])
  assert.match(html,new RegExp(name));
 assert.match(html,/\$77\.00/); // ($200 + $10) - $133 = $77 Goods Sold.
});

test('Private Sessions exports preferred Arabic name independently of the English name and financial values',()=>{
 const day='2026-10-21';
 const entries=[{id:'s1',entry_date:day,entry_type:'session',client_id:'jana',session_fee_cents:3000,paid_cents:0}];
 const clients=[{id:'jana',client_code:'2',name:'Jana Bleibel',arabic_name:'جنى بليبل'}];
 const sessions=cafePrivateSessions(entries,clients,day);
 assert.equal(sessions.length,1);
 assert.equal(sessions[0].clientName,'Jana Bleibel');
 assert.equal(sessions[0].clientArabicName,'جنى بليبل');
 assert.equal(sessions[0].clientCode,'2');
 assert.equal(sessions[0].sessionFeeCents,3000);
 assert.equal(sessions[0].paidAtSessionCents,0);
 assert.equal(cafePrivatePayments(entries,clients,day).length,0);
});

test('Day closing locks forms, requires saved cash count, and admin can approve or reopen',async()=>{
 const day='2026-10-22',rpcCalls=[];
 let currentStatus=null,admin=false,closingCash=10000;
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async table=>{
   if(table==='cafeteria_finance_entries')return [{id:'one',entry_date:day,category:'padel_courts',name:'Players',amount_cents:5000,checkmarks:[true,false,true,true]}];
   if(table==='cafeteria_finance_days')return [{day_date:day,closing_cash_cents:closingCash}];
   if(table==='cafeteria_day_closings')return currentStatus?[{day_date:day,status:currentStatus}]:[];
   if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
   return [];
  },
  rpc:async(name,args)=>{
   rpcCalls.push({name,args});
   if(name==='cafeteria_change_day_status'){
    if(args.p_action==='close')currentStatus='closed';
    if(args.p_action==='approve')currentStatus='approved';
    if(args.p_action==='reopen')currentStatus='reopened';
   }
  }
 };
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=>day,addDays:()=> '2026-10-21',rerender:()=>{},toast:()=>{},isAdmin:()=>admin
 });
 await widget.load();
 assert.match(widget.page(),/Close day for review/);
 assert.match(widget.page(),/data-cafe-save="entry"/);
 await widget.action({dataset:{action:'cafe-day-close'}});
 assert.equal(currentStatus,'closed');
 assert.match(widget.page(),/Submitted — awaiting approval/);
 assert.doesNotMatch(widget.page(),/data-cafe-save="entry"/);
 assert.doesNotMatch(widget.page(),/data-cafe-save="whish"/);
 const simpleForm={dataset:{cafeSave:'entry',category:'padel_courts'},querySelector:()=>null};
 let denied=false;try{await widget.submit(simpleForm)}catch(e){denied=String(e).includes('closed')}
 assert.ok(denied);
 admin=true;
 assert.match(widget.page(),/Approve day/);
 await widget.action({dataset:{action:'cafe-day-approve'}});
 assert.equal(currentStatus,'approved');
 assert.match(widget.page(),/Approved/);
 const oldPrompt=globalThis.prompt;
 try{
  globalThis.prompt=()=> 'Correcting yesterday cash amount';
  await widget.action({dataset:{action:'cafe-day-reopen'}});
 }finally{globalThis.prompt=oldPrompt}
 assert.equal(currentStatus,'reopened');
 assert.match(widget.page(),/Close day for review/);
 assert.match(widget.page(),/data-cafe-save="entry"/);
 assert.deepEqual(rpcCalls.filter(r=>r.name==='cafeteria_change_day_status').map(r=>r.args.p_action),['close','approve','reopen']);
 assert.equal(rpcCalls.at(-1).args.p_reason,'Correcting yesterday cash amount');
});
test('Compact section stays open on rerender and mobile quick transaction uses category form',async()=>{
 const api={getSession:()=>({access_token:'token'}),listAll:async table=>
   table==='whish_wallet_settings'?[{opening_balance_cents:60}]:[]};
 const widget=createCafeteriaFinances({
  api,heading:()=>'',icon:()=>'',amount:cents=>'$'+(cents/100).toFixed(2),
  today:()=> '2026-10-22',addDays:()=> '2026-10-21',rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 assert.match(widget.page(),/data-cafe-fold="Products & rentals"/);
 widget.rememberFold('Products & rentals',true);
 assert.match(widget.page(),/data-cafe-fold="Products & rentals" open/);
 await widget.action({dataset:{action:'cafe-quick-toggle'}});
 assert.match(widget.page(),/Quick transaction/);
 await widget.change({id:'cafe-quick-category',value:'shoes',dataset:{}});
 const page=widget.page();
 assert.match(page,/id="cafe-quick-category"/);
 const quick=page.split('cafe-quick-sheet')[1];
 assert.match(quick,/data-category="shoes"/);
 assert.match(quick,/name="amount"/);
 assert.match(quick,/Add entry/);
 await widget.action({dataset:{action:'cafe-quick-toggle'}});
 assert.doesNotMatch(widget.page(),/cafe-quick-sheet/);
});

test('Negative cash reconciliation prevents submitting a day for approval',async()=>{
 const day='2026-10-22',writes=[];
 const widget=createCafeteriaFinances({
  api:{
   getSession:()=>({access_token:'token'}),
   listAll:async table=>{
    if(table==='cafeteria_finance_entries')return [{entry_date:day,category:'padel_courts',amount_cents:9000,checkmarks:[true,true,true,true]}];
    if(table==='cafeteria_finance_days')return [{day_date:day,closing_cash_cents:1000}];
    if(table==='whish_wallet_settings')return [{opening_balance_cents:60}];
    return [];
   },
   rpc:async(...args)=>writes.push(args)
  },
  heading:()=>'',icon:()=>'',amount:n=>'$'+(n/100).toFixed(2),
  today:()=>day,addDays:()=> '2026-10-21',
  rerender:()=>{},toast:()=>{},isAdmin:()=>false
 });
 await widget.load();
 const html=widget.page();
 assert.match(html,/data-action="cafe-day-close" disabled/);
 let blocked=false;
 try{await widget.action({dataset:{action:'cafe-day-close'}})}
 catch(e){blocked=String(e).includes('Negative Goods Sold')}
 assert.ok(blocked);
 assert.equal(writes.length,0);
});
