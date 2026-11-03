import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {consignmentMoneyCents,consignmentQuantity,consignmentFormValues,filterConsignment,createConsignmentInventory} from '../lib/consignment-inventory.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');

test('Search across category, name, brand, model, supplier and size with multiple keywords',()=>{
 const items=[
  {id:'a',category:'Shoes',product_name:'Padel Shoes',brand:'NOX',model:'Luxury',size_label:'42',supplier:'Vendor One',quantity:10},
  {id:'b',category:'Shoes',product_name:'Padel Shoes',brand:'NOX',model:'Luxury',size_label:'40',supplier:'Vendor One',quantity:5},
  {id:'c',category:'Rackets',product_name:'Padel racket',brand:'HEAD',model:'Speed',size_label:'',supplier:'Vendor Two',quantity:0},
  {id:'d',category:'Shoes',product_name:'Removed',brand:'NOX',model:'Luxury',size_label:'42',supplier:'Vendor One',quantity:4,removed_at:'2026-11-03'}
 ];
 const ids=(query,filter)=>filterConsignment(items,query,filter).map(x=>x.id);
 assert.deepEqual(ids('nox luxury 42'),['a']);
 assert.deepEqual(ids('42 NOX'),['a']);
 assert.deepEqual(ids('padel shoes'),['b','a']);
 assert.deepEqual(ids('vendor two'),['c']);
 assert.deepEqual(ids('shoes','in-stock'),['b','a']);
 assert.deepEqual(ids('','out-of-stock'),['c']);
 assert.deepEqual(ids('No Such Product'),[]);
 assert.deepEqual(ids(''),['c','b','a']);
});
test('Dollar prices and stock counts must be exact and within bounds',()=>{
 assert.equal(consignmentMoneyCents('70'),7000);
 assert.equal(consignmentMoneyCents('199.99'),19999);
 assert.equal(consignmentQuantity('0',true),0);
 assert.equal(consignmentQuantity('10'),10);
 for(const bad of ['', '0','-1','5.234','1e3','10abc','1000000001'])
  assert.throws(()=>consignmentMoneyCents(bad),Error);
 for(const bad of ['-1','1.5','3e2','1000001',''])
  assert.throws(()=>consignmentQuantity(bad,true),Error);
 assert.throws(()=>consignmentQuantity('0'),Error);
});
test('Consignment form validates required supplier, category, optional size and notes',()=>{
 const data={category:'Shoes',product_name:'Padel Shoes',brand:'NOX',model:'Luxury',
  size_label:'42',supplier:'Owner A',selling_price:'100.50',notes:'Pair in display'};
 assert.deepEqual(consignmentFormValues(data),{
  category:'Shoes',product_name:'Padel Shoes',brand:'NOX',model:'Luxury',size_label:'42',
  supplier:'Owner A',selling_price_cents:10050,notes:'Pair in display'
 });
 assert.throws(()=>consignmentFormValues({...data,supplier:' '}),/Consigned by/);
 assert.throws(()=>consignmentFormValues({...data,category:'Invalid'}),/category/);
 assert.throws(()=>consignmentFormValues({...data,size_label:'x'.repeat(41)}),/Size/);
});
function mock(){
 let role='admin';
 const items=[],movements=[],calls=[],messages=[];
 let time=0;
 const api={
  getSession:()=>({access_token:'test-token'}),
  async listAll(table){
   calls.push(['read',table]);
   if(table==='consignment_items')return items.map(x=>({...x}));
   if(table==='consignment_movements'){if(role!=='admin')throw Error('Staff must not read movements');return movements.map(x=>({...x}));}
   throw Error('Unexpected inventory read: '+table);
  },
  async rpc(name,params){
   calls.push(['rpc',name,params]);
   if(role!=='admin')throw Error('Only administrators can manage consignment inventory');
   if(name==='consignment_create_item'){
    const item={id:params.p_id,category:params.p_category,product_name:params.p_product_name,brand:params.p_brand,model:params.p_model,
     size_label:params.p_size_label,supplier:params.p_supplier,selling_price_cents:params.p_selling_price_cents,
     notes:params.p_notes,quantity:params.p_initial_quantity,created_at:'2026-11-03T10:00:00Z'};
    items.push(item);
    movements.push({id:'opening',item_id:item.id,delta:params.p_initial_quantity,quantity_after:item.quantity,
     reason:'Opening consignment quantity',created_at:'2026-11-03T10:00:00Z'});
    return item.id;
   }
   const item=items.find(x=>x.id===params.p_id&&!x.removed_at);
   if(!item)throw Error('Consignment item not found');
   if(name==='consignment_edit_item'){
    Object.assign(item,{category:params.p_category,product_name:params.p_product_name,brand:params.p_brand,
     model:params.p_model,size_label:params.p_size_label,supplier:params.p_supplier,
     selling_price_cents:params.p_selling_price_cents,notes:params.p_notes});return item.id;
   }
   if(name==='consignment_adjust_stock'){
    const next=item.quantity+params.p_delta;
    if(next<0||next>1000000)throw Error('Stock cannot fall below zero or exceed the limit');
    item.quantity=next;movements.push({id:'m'+(++time),item_id:item.id,delta:params.p_delta,quantity_after:next,
     reason:params.p_reason,created_at:'2026-11-03T10:00:00Z'});return next;
   }
   if(name==='consignment_remove_item'){item.removed_at='2026-11-03T15:00:00Z';item.removed_reason=params.p_reason;return item.id;}
   throw Error('Unexpected inventory RPC: '+name);
  }
 };
 const ui=createConsignmentInventory({api,
  heading:(over,title,desc,actions='')=>'<header>'+title+actions+'</header>',
  icon:()=>'<svg></svg>',toast:m=>messages.push(m),
  rerender:()=>calls.push(['render']),isAdmin:()=>role==='admin'
 });
 const action=(name,id)=>ui.action({dataset:{consignAction:name,id}});
 return {ui,items,movements,calls,messages,action,setRole:r=>{role=r}};
}
test('Both roles see escaped products, quantities and selling price, but only admin can manage',async()=>{
 const x=mock();
 x.items.push({id:'one',category:'Shoes',product_name:'<script>alert(1)</script>',brand:'NOX',model:'Luxury',
  size_label:'42',supplier:'Owner A',quantity:4,selling_price_cents:12500,created_at:'2026-11-03'});
 await x.ui.load();
 const admin=x.ui.page();
 assert.match(admin,/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
 assert.doesNotMatch(admin,/<script>alert\(1\)/);
 assert.match(admin,/data-action="consign-new"/);
 assert.match(admin,/data-action="consign-adjust"/);
 assert.match(admin,/data-action="consign-history"/);
 assert.match(admin,/\$125\.00/);
 assert.match(admin,/NOX/);
 x.setRole('staff');
 await x.ui.load();
 const staff=x.ui.page();
 assert.match(staff,/NOX/);
 assert.match(staff,/125\.00/);
 assert.doesNotMatch(staff,/data-action="consign-(?:new|edit|adjust|remove|history)"/);
 await assert.rejects(()=>x.action('new'),/Only administrators/);
 await assert.rejects(()=>x.ui.submit({dataset:{consignSave:'create'}}),/Only administrators/);
 assert.equal(x.ui.getState().movements.length,0);
 assert.equal(x.calls.filter(y=>y[0]==='read'&&y[1]==='consignment_movements').length,1,'Movement reads only occur during administrator load');
});
test('Admin can create, edit, adjust upward/downward with audit, and remove item',async()=>{
 const x=mock();
 const native=globalThis.FormData;
 class MockFormData{
  constructor(form){this.fields=form.fields;}
  [Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]();}
 }
 globalThis.FormData=MockFormData;
 try{
  await x.ui.load();
  await x.action('new');
  const id=x.ui.getState().form.id;
  const values={category:'Shoes',product_name:'Padel Shoes',brand:'NOX',model:'Luxury',size_label:'42',
   supplier:'Supplier One',selling_price:'150.00',opening_quantity:'10',notes:'On display'};
  await x.ui.submit({dataset:{consignSave:'create',id},fields:values});
  assert.equal(x.items.length,1);
  assert.equal(x.items[0].quantity,10);
  assert.equal(x.movements[0].kind,undefined);
  await x.action('edit',id);
  await x.ui.submit({dataset:{consignSave:'edit',id},fields:{...values,model:'Luxury Pro',selling_price:'160.00'}});
  assert.equal(x.items[0].selling_price_cents,16000);
  assert.equal(x.items[0].quantity,10,'Editing product must not mutate stock.');
  await x.action('adjust',id);
  await x.ui.submit({dataset:{consignSave:'adjust',id},fields:{direction:'remove',quantity:'3',reason:'Sold 3 pairs'}});
  assert.equal(x.items[0].quantity,7);
  assert.equal(x.movements.at(-1).delta,-3);
  await x.action('adjust',id);
  await assert.rejects(()=>x.ui.submit({dataset:{consignSave:'adjust',id},fields:{direction:'remove',quantity:'8',reason:'Sold 8 pairs'}}),/below zero/);
  assert.equal(x.items[0].quantity,7);
  await x.ui.submit({dataset:{consignSave:'adjust',id},fields:{direction:'add',quantity:'5',reason:'New consignment'}});
  assert.equal(x.items[0].quantity,12);
  await x.action('history',id);
  assert.match(x.ui.page(),/Sold 3 pairs/);
  assert.match(x.ui.page(),/New consignment/);
  assert.match(x.ui.page(),/Stock history/);
  await x.action('remove',id);
  assert.match(x.ui.page(),/Confirm remove/);
  await x.action('cancel');
  assert.equal(x.items[0].removed_at,undefined);
  await x.action('remove',id);
  await x.ui.submit({dataset:{consignSave:'remove',id},fields:{reason:'Test entry'}});
  assert.equal(filterConsignment(x.items).length,0);
  assert.equal(x.movements.length,3,'Movement history remains for audit after removal');
  assert.ok(x.messages.includes('Consignment product added.'));
  assert.ok(x.messages.includes('Consignment item removed.'));
  assert.deepEqual(x.calls.filter(v=>v[0]==='rpc').map(v=>v[1]),[
   'consignment_create_item','consignment_edit_item','consignment_adjust_stock',
   'consignment_adjust_stock','consignment_adjust_stock','consignment_remove_item']);
 }finally{globalThis.FormData=native;}
});
test('Inventory code and SQL never write cafeteria daily finance, Whish or payments',()=>{
 const src=read('../lib/consignment-inventory.js');
 const sql=read('../supabase/migrations/20261103184143_add_consignment_inventory.sql');
 for(const text of [src,sql]){
  assert.doesNotMatch(text,/(?:insert into|update|delete from|api\.patch|api\.insert)\s*(?:public\.)?(?:cafeteria_finance|cafeteria_entries|whish_ledger|cafeteria_payables|private_entries)/i);
 }
 for(const table of ['consignment_items','consignment_movements']){
  assert.match(sql,new RegExp('alter table public\\.'+table+' enable row level security'));
 }
 assert.match(sql,/Staff can view consignment items/);
 assert.match(sql,/Admins can view consignment movements/);
 assert.match(sql,/if auth\.uid\(\) is null or not public\.is_admin\(\)/);
 assert.match(sql,/for update/);
 assert.match(sql,/Stock cannot fall below zero/);
 assert.match(sql,/revoke all on function public\.consignment_adjust_stock/);
 assert.match(src,/api\.rpc\('consignment_adjust_stock'/);
});
