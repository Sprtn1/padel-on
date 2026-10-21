import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_CATEGORIES, CAFE_RENTAL_PRICE_CENTS, cafeMoneyCents,
  cafeQuantity, cafeEntryFromForm, cafeTotals, cafeReconciliation,
  cafePlayerCount, cafeNonnegativeCents, createCafeteriaFinances
} from '../lib/cafeteria-finances.js';

test('all cashbook categories exist and fixed rental price is $2',()=>{
 assert.equal(CAFE_CATEGORIES.length,14);
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
  listAll:async(table)=>table==='cafeteria_finance_days'?[{closing_cash_cents:5000}]:entries
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
