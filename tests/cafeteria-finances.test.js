import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_CATEGORIES, CAFE_RENTAL_PRICE_CENTS, cafeMoneyCents,
  cafeQuantity, cafeEntryFromForm, cafeTotals, cafeReconciliation,
  cafePlayerCount, cafeNonnegativeCents, cafePrivatePayments,
  whishSummary, whishFormEntry,
  cafePrivatePaymentsTotal, createCafeteriaFinances
} from '../lib/cafeteria-finances.js';

test('all cashbook categories exist and fixed rental price is $2',()=>{
 assert.equal(CAFE_CATEGORIES.length,16);
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
