import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CAFE_CATEGORIES, CAFE_RENTAL_PRICE_CENTS, cafeMoneyCents,
  cafeQuantity, cafeEntryFromForm, cafeTotals, createCafeteriaFinances
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
});

test('money and input validation prevent invalid totals',()=>{
 assert.equal(cafeMoneyCents('2.99'),299);
 assert.equal(cafeQuantity('9999'),9999);
 for(const x of ['','0','-2','1.234','Infinity','5e2'])assert.throws(()=>cafeMoneyCents(x));
 for(const x of ['0','1.5','-1','10000'])assert.throws(()=>cafeQuantity(x));
 assert.throws(()=>cafeEntryFromForm('other_income',{name:'',amount:'30'}));
 assert.throws(()=>cafeEntryFromForm('padel_courts',{name:'',amount:'30'}));
 assert.throws(()=>cafeEntryFromForm('racket_rental',{quantity:'0'}));
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

test('page includes cashbook categories and keeps Goods Sold pending',async()=>{
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async()=>[]
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
 assert.match(html,/Goods Sold/);
 assert.match(html,/Awaiting automatic calculation/);
 assert.match(html,/Four numbered boxes/);
 assert.doesNotMatch(html,/data-action="cafe-void"/);
});
