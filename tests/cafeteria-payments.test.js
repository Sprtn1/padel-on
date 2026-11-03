import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paymentCents,payableBalances,createCafeteriaPayments} from '../lib/cafeteria-payments.js';

test('Money accepts exact cents and rejects zero, negatives, third decimal and overflow',()=>{
 assert.equal(paymentCents('10'),1000);
 assert.equal(paymentCents('2.50'),250);
 assert.equal(paymentCents('0.01'),1);
 for(const invalid of ['0','-1','1.005','abc','','1e3','1000000001']){
  assert.throws(()=>paymentCents(invalid),Error,invalid);
 }
});
test('Balances accumulate partial payments and automatically become fully paid',()=>{
 const rows=[{id:'a',title:'Supplier stock',payee:'Supplier',total_cents:10000}];
 const record=(n)=>({id:'p'+n,payable_id:'a',amount_cents:n,paid_on:'2026-11-03',created_at:'2026-11-03'});
 assert.deepEqual(payableBalances(rows,[]).map(x=>[x.paid,x.remaining,x.status]),[[0,10000,'unpaid']]);
 assert.deepEqual(payableBalances(rows,[record(3000)]).map(x=>[x.paid,x.remaining,x.status]),[[3000,7000,'partial']]);
 assert.deepEqual(payableBalances(rows,[record(3000),record(7000)]).map(x=>[x.paid,x.remaining,x.status]),[[10000,0,'paid']]);
});

function setup(){
 let role='admin';
 const payables=[],payments=[],calls=[],messages=[];
 const api={
  getSession:()=>({access_token:'mock'}),
  async listAll(table){calls.push(['load',table]);return table==='cafeteria_payables'?payables.slice():payments.slice();},
  async insert(table,data){calls.push(['insert',table,data]);payables.push({...data,created_at:'2026-11-03T08:00:00Z',created_by:'admin'});return [data]},
  async rpc(name,data){calls.push(['rpc',name,data]);if(name!=='cafeteria_record_payable_payment')throw Error('Unexpected RPC');
   payments.push({id:data.p_id,payable_id:data.p_payable_id,amount_cents:data.p_amount_cents,paid_on:data.p_paid_on,
    notes:data.p_notes,created_at:'2026-11-03T08:00:00Z'});return data.p_id;}
 };
 const ui=createCafeteriaPayments({api,
  heading:(a,b,c,actions='')=>'<header>'+b+actions+'</header>',
  icon:()=>'<svg></svg>',amount:n=>'$'+(n/100).toFixed(2),
  today:()=> '2026-11-03',toast:m=>messages.push(m),
  rerender:()=>calls.push(['render']),isAdmin:()=>role==='admin'});
 const act=(name,id)=>ui.action({dataset:{cpayAction:name,id}});
 return {ui,payables,payments,calls,messages,act,role:value=>{role=value}};
}
test('Page shows admin-only actions, escapes untrusted names, and records payment history',async()=>{
 const {ui,payables,act}=setup();
 payables.push({id:'a',title:'Stock <script>alert(1)</script>',payee:'Supplier <X>',total_cents:10000,created_at:'2026-11-03'});
 await ui.load();
 assert.match(ui.page(),/Stock &lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(ui.page(),/Stock <script>/);
 assert.match(ui.page(),/data-action="cpay-toggle-create"/);
 assert.match(ui.page(),/data-action="cpay-pay"/);
 assert.match(ui.page(),/data-action="cpay-full"/);
 act('full','a');
 assert.match(ui.page(),/data-cpay-save="payment"/);
 assert.match(ui.page(),/value="100.00"/);
 act('cancel-payment');
 assert.doesNotMatch(ui.page(),/data-cpay-save="payment"/);
 act('toggle-create');
 assert.match(ui.page(),/data-cpay-save="create"/);
});
test('Staff cannot load, render financial entries or submit actions',async()=>{
 const {ui,calls,act,role}=setup();
 role('staff');
 await ui.load();
 assert.equal(calls.filter(x=>x[0]==='load').length,0);
 assert.doesNotMatch(ui.page(),/data-cpay-save/);
 assert.throws(()=>act('toggle-create'),/Only administrators/);
 await assert.rejects(()=>ui.submit({dataset:{cpaySave:'create'}}),/Only administrators/);
});
test('Create, partial, full and overpayment checks use admin storage and atomic RPC',async()=>{
 const h=setup(),{ui,calls,act,messages,payables,payments}=h;
 const native=globalThis.FormData;
 class MockFormData {
  constructor(form){this.fields=form.fields;}
  [Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]();}
 }
 globalThis.FormData=MockFormData;
 try{
  await ui.load();
  act('toggle-create');
  await ui.submit({dataset:{cpaySave:'create'},fields:{title:'Stock',payee:'Vendor',total:'100.00'}});
  assert.equal(payables.length,1);
  const id=payables[0].id;
  assert.equal(payables[0].total_cents,10000);
  act('pay',id);
  await ui.submit({dataset:{cpaySave:'payment',id},fields:{paid_amount:'30',paid_on:'2026-11-03',notes:'Cash installment'}});
  assert.equal(payments[0].amount_cents,3000);
  let view=ui.page();
  assert.match(view,/Partially paid/);
  assert.match(view,/\$70\.00/);
  act('pay',id);
  await assert.rejects(()=>ui.submit({dataset:{cpaySave:'payment',id},fields:{paid_amount:'80',paid_on:'2026-11-03'}}),/exceeds the remaining balance/);
  assert.equal(payments.length,1);
  act('full',id);
  await ui.submit({dataset:{cpaySave:'payment',id},fields:{paid_amount:'70',paid_on:'2026-11-03',notes:'Final payment'}});
  assert.equal(payments.length,2);
  ui.setFilter('all');
  view=ui.page();
  assert.match(view,/Paid in full/);
  assert.match(view,/\$0\.00/);
  assert.match(view,/Cash installment/);
  assert.ok(calls.some(x=>x[0]==='rpc'&&x[1]==='cafeteria_record_payable_payment'));
  assert.ok(messages.includes('Payment obligation saved.'));
  assert.ok(messages.includes('Payment recorded.'));
 } finally {
  globalThis.FormData=native;
 }
});
test('Payment schema protects direct table access and guards concurrent overpayments',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261103152931_add_admin_cafeteria_payables.sql',import.meta.url),'utf8');
 for(const table of ['cafeteria_payables','cafeteria_payable_payments']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
 }
 assert.match(sql,/create policy "admin_view_cafeteria_payables"/);
 assert.match(sql,/create policy "admin_view_cafeteria_payable_payments"/);
 assert.match(sql,/revoke all on public\.cafeteria_payable_payments from public, anon, authenticated/);
 assert.match(sql,/for update/);
 assert.match(sql,/Payment exceeds the remaining balance/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_admin\(\)/);
 assert.match(sql,/revoke all on function public\.cafeteria_record_payable_payment/);
});
