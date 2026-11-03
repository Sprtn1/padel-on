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
  async rpc(name,data){
   calls.push(['rpc',name,data]);
   if(name==='cafeteria_record_payable_payment'){
    payments.push({id:data.p_id,payable_id:data.p_payable_id,amount_cents:data.p_amount_cents,paid_on:data.p_paid_on,
     notes:data.p_notes,created_at:'2026-11-03T08:00:00Z'});return data.p_id;
   }
   if(name==='cafeteria_void_payable_entry'){
    const updated='2026-11-03T10:00:00Z';
    if(data.p_kind==='payment'){
     const payment=payments.find(p=>p.id===data.p_id&&!p.voided_at);
     if(!payment)throw Error('Payment already removed or missing');
     payment.voided_at=updated;payment.void_reason=data.p_reason;
    }else if(data.p_kind==='payable'){
     const parent=payables.find(p=>p.id===data.p_id&&!p.voided_at);
     if(!parent)throw Error('Obligation already removed');
     parent.voided_at=updated;parent.void_reason=data.p_reason;
     payments.filter(p=>p.payable_id===parent.id&&!p.voided_at).forEach(p=>{p.voided_at=updated;p.void_reason=data.p_reason;});
    }else throw Error('Unexpected correction kind');
    return data.p_id;
   }
   throw Error('Unexpected RPC');
  }
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

test('Removed entries disappear from active sums but remain in the audit source',()=>{
 const payables=[{id:'a',title:'Test',payee:'Vendor',total_cents:15000},
  {id:'b',title:'Removed test',payee:'Vendor',total_cents:8000,voided_at:'2026-11-03'}];
 const payments=[{id:'p1',payable_id:'a',amount_cents:3000,paid_on:'2026-11-03',created_at:'2026-11-03'},
  {id:'p2',payable_id:'a',amount_cents:6000,paid_on:'2026-11-03',created_at:'2026-11-03',voided_at:'2026-11-03'},
  {id:'p3',payable_id:'b',amount_cents:2000,paid_on:'2026-11-03',created_at:'2026-11-03'}];
 const result=payableBalances(payables,payments);
 assert.equal(result.length,1);
 assert.equal(result[0].paid,3000);
 assert.equal(result[0].remaining,12000);
 assert.deepEqual(result[0].history.map(x=>x.id),['p1']);
 assert.equal(payments.length,3,'Historical records remain unchanged in data source');
});

test('Remove note is gone; history has a removal button requiring confirmation',async()=>{
 const h=setup(),{ui,payables,payments,act}=h;
 payables.push({id:'a',title:'Supplier',payee:'Vendor',total_cents:10000,created_at:'2026-11-03'});
 payments.push({id:'p1',payable_id:'a',amount_cents:3500,paid_on:'2026-11-03',created_at:'2026-11-03'});
 await ui.load();
 assert.doesNotMatch(ui.page(),/This is an admin-only payment tracker/);
 assert.match(ui.page(),/data-action="cpay-remove-payable"/);
 act('history','a');
 assert.match(ui.page(),/data-action="cpay-remove-payment"/);
 act('remove-payment','p1');
 assert.match(ui.page(),/data-cpay-save="remove"/);
 assert.match(ui.page(),/Remove this \$35\.00 payment/);
 assert.match(ui.page(),/Confirm remove payment/);
 act('cancel-remove');
 assert.doesNotMatch(ui.page(),/data-cpay-save="remove"/);
 assert.equal(payments[0].voided_at,undefined,'Cancel must not modify records');
 act('remove-payable','a');
 assert.match(ui.page(),/Confirm remove entire entry/);
});

test('Admin corrections undo an installment or entire test payable without touching other data',async()=>{
 const h=setup(),{ui,payables,payments,act,calls,messages,role}=h;
 payables.push({id:'a',title:'Test payable',payee:'Vendor',total_cents:10000,created_at:'2026-11-03'});
 payments.push({id:'p1',payable_id:'a',amount_cents:3000,paid_on:'2026-11-03',created_at:'2026-11-03'});
 payments.push({id:'p2',payable_id:'a',amount_cents:7000,paid_on:'2026-11-03',created_at:'2026-11-03'});
 const native=globalThis.FormData;
 class MockFormData {
  constructor(form){this.fields=form.fields;}
  [Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]();}
 }
 globalThis.FormData=MockFormData;
 try{
  await ui.load();
  act('remove-payment','p1');
  await assert.rejects(()=>ui.submit({dataset:{cpaySave:'remove',kind:'payment',id:'p1'},fields:{reason:'X'}}),/at least 3 characters/);
  assert.equal(payments[0].voided_at,undefined);
  await ui.submit({dataset:{cpaySave:'remove',kind:'payment',id:'p1'},fields:{reason:'Duplicate payment'}});
  assert.ok(payments[0].voided_at);
  assert.equal(payableBalances(payables,payments)[0].remaining,3000);
  assert.match(ui.page(),/Partially paid/);
  assert.doesNotMatch(ui.page(),/This is an admin-only payment tracker/);
  assert.match(ui.page(),/\$30\.00/); // corrected outstanding amount
  assert.ok(messages.some(m=>/Payment removed/.test(m)));
  act('remove-payable','a');
  await ui.submit({dataset:{cpaySave:'remove',kind:'payable',id:'a'},fields:{reason:'Temporary test'}});
  assert.equal(payableBalances(payables,payments).length,0);
  assert.ok(payments.every(x=>x.voided_at));
  assert.match(ui.page(),/No matching payment obligations/);
  assert.ok(messages.includes('Obligation removed.'));
  assert.deepEqual(calls.filter(x=>x[0]==='rpc'&&x[1]==='cafeteria_void_payable_entry').map(x=>x[2].p_kind),
    ['payment','payable']);
  role('staff');
  assert.throws(()=>act('remove-payable','a'),/Only administrators/);
 } finally {globalThis.FormData=native;}
});

test('Corrections are privileged and soft-delete-only in the database migration',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261103154823_void_incorrect_cafeteria_payables_and_payments.sql',import.meta.url),'utf8');
 assert.match(sql,/add column if not exists voided_at/);
 assert.match(sql,/add column if not exists voided_by uuid/);
 assert.match(sql,/create or replace function public\.cafeteria_void_payable_entry/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_admin\(\)/);
 assert.match(sql,/from public\.cafeteria_payables where id=p_id for update/);
 assert.match(sql,/and voided_at is null/);
 assert.match(sql,/revoke all on function public\.cafeteria_void_payable_entry/);
 assert.doesNotMatch(sql,/\bdelete\s+from\b/i);
 assert.doesNotMatch(sql,/update public\.(?:cafe_finance|whish_ledger)/i);
});
