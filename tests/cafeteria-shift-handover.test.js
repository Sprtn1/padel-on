import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {shiftCashCents,shiftCashDifference,createCafeteriaShiftHandover} from '../lib/cafeteria-shift-handover.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const DAY='2026-11-04';

test('Cash parsing accepts zero, exact cents and rejects malformed input',()=>{
 assert.equal(shiftCashCents('0'),0);
 assert.equal(shiftCashCents('120.5'),12050);
 assert.equal(shiftCashCents('0.01'),1);
 assert.equal(shiftCashDifference({expected_cents:14500},14000),-500);
 assert.equal(shiftCashDifference({expected_cents:14500},14500),0);
 assert.equal(shiftCashDifference({expected_cents:14500},15000),500);
 for(const invalid of ['', '-1','2.222','3e2','NaN','1000000001'])
  assert.throws(()=>shiftCashCents(invalid),Error,invalid);
 assert.throws(()=>shiftCashDifference({expected_cents:null},0),Error);
});

function setup(){
 let current=A,role='admin',expectedIncome=12000,expectedExpenses=3000,now=0;
 const records=[],calls=[],messages=[];
 const people=[{id:A,email:'outgoing@example.com'},{id:B,email:'incoming@example.com'}];
 const api={
  getSession:()=>({access_token:'mock'}),
  async listAll(table,filter){
   calls.push(['list',table,filter]);
   assert.equal(table,'cafeteria_shift_handovers');
   return records.filter(r=>r.day_date===DAY).map(x=>({...x}));
  },
  async rpc(name,args={}){
   calls.push(['rpc',name,args]);
   if(name==='cafeteria_handover_staff_directory')
    return people.filter(p=>p.id!==current);
   if(name==='cafeteria_handover_snapshot'){
    const previous=records.filter(r=>!r.voided_at).at(-1);
    const opening=previous?previous.counted_cash_cents:args.p_opening_cash_cents;
    return {previous_id:previous?.id||null,opening_cash_cents:opening,
     income_cents:expectedIncome,expenses_cents:expectedExpenses,
     expected_cents:opening===null?null:opening+expectedIncome-expectedExpenses,
     finance_count:2,private_count:1,
     window_start_at:previous?.created_at||DAY+'T00:00:00+02:00',
     checked_at:DAY+'T12:30:00+02:00'};
   }
   if(name==='cafeteria_handover_record'){
    assert.equal(current,A);
    const prev=records.filter(r=>!r.voided_at).at(-1);
    const opening=prev?prev.counted_cash_cents:args.p_opening_cash_cents;
    const expected=opening+expectedIncome-expectedExpenses;
    if(expected!==args.p_checked_expected_cents||args.p_checked_finance_count!==2||
      args.p_checked_private_count!==1||(prev?.id||null)!==args.p_checked_previous_id)
     throw Error('Ledger entries or an earlier handover changed; calculate the cash again');
    records.push({id:args.p_id,day_date:args.p_day_date,
     outgoing_staff_id:current,incoming_staff_id:args.p_incoming_staff_id,
     opening_cash_cents:opening,expected_cash_cents:expected,
     counted_cash_cents:args.p_counted_cash_cents,
     difference_cents:args.p_counted_cash_cents-expected,
     recorded_income_cents:expectedIncome,recorded_expenses_cents:expectedExpenses,
     finance_entry_count:2,private_entry_count:1,created_at:DAY+'T12:3'+(++now)+':00+02:00',
     notes:args.p_notes,accepted_at:null,voided_at:null});
    return args.p_id;
   }
   if(name==='cafeteria_handover_accept'){
    const record=records.find(r=>r.id===args.p_id);
    if(record.incoming_staff_id!==current)throw Error('Only incoming staff can confirm');
    record.accepted_at=DAY+'T12:40:00+02:00';record.accepted_by=current;return args.p_id;
   }
   if(name==='cafeteria_handover_void'){
    if(role!=='admin')throw Error('Administrator access required');
    const record=records.find(r=>r.id===args.p_id);
    record.voided_at=DAY+'T13:00:00+02:00';record.void_reason=args.p_reason;return args.p_id;
   }
   throw Error('Unexpected RPC '+name);
  }
 };
 const ui=createCafeteriaShiftHandover({api,amount:n=>'$'+(n/100).toFixed(2),
  today:()=>DAY,staff:()=>({id:current,email:people.find(p=>p.id===current).email}),
  isAdmin:()=>role==='admin',
  toast:m=>messages.push(m),rerender:()=>calls.push(['render'])});
 const action=(name,id,form=null)=>ui.action({dataset:{shiftAction:name,id},closest:()=>form});
 return {api,ui,records,calls,messages,action,setActor:(id,nextRole)=>{current=id;role=nextRole;},
  setIncome:x=>{expectedIncome=x},setExpenses:x=>{expectedExpenses=x}};
}
class MockFormData{
 constructor(form){this.values=form.fields;}
 [Symbol.iterator](){return Object.entries(this.values)[Symbol.iterator]();}
 get(key){return this.values[key];}
}
const withFormData=async fn=>{
 const original=globalThis.FormData;globalThis.FormData=MockFormData;
 try{return await fn();}finally{globalThis.FormData=original;}
};

test('First check shows opening cash input, expected cash breakdown, and independent history',async()=>{
 await withFormData(async()=>{
  const x=setup();await x.ui.load(DAY);
  assert.match(x.ui.page(DAY,true),/Shift Handover &amp; Cash Check|Shift Handover & Cash Check/);
  await x.action('new');
  let html=x.ui.page(DAY,true);
  assert.match(html,/Cash at start of day/);
  assert.match(html,/Incoming employee/);
  const form={fields:{incoming:B,opening_cash:'100.00',counted_cash:'195.00',notes:'Potential missing transaction'}};
  await x.action('check',null,form);
  html=x.ui.page(DAY,true);
  assert.match(html,/Expected cash from ledger/);
  assert.match(html,/\$190\.00/);
  assert.match(html,/\+\$5\.00/);
  assert.match(html,/Save handover/);
  assert.match(html,/not an exact Goods Sold total/);
  assert.doesNotMatch(html,/data-cafe-save="closing"/);
  assert.equal(x.records.length,0,'Preview never creates financial data');
  await x.ui.submit({dataset:{shiftSave:'record'},fields:form.fields});
  assert.equal(x.records.length,1);
  assert.equal(x.records[0].expected_cash_cents,19000);
  assert.equal(x.records[0].counted_cash_cents,19500);
  assert.equal(x.records[0].difference_cents,500);
  assert.match(x.ui.page(DAY,true),/Awaiting confirmation/);
  assert.equal(x.calls.some(([what,table])=>what==='list'&&table!=='cafeteria_shift_handovers'),false);
  assert.equal(x.calls.some(([what,name])=>what==='rpc'&&/closing|whish|finance_set_closing_cash/.test(name)),false);
 });
});

test('Subsequent check uses prior physical count; source changes require checking again',async()=>{
 await withFormData(async()=>{
  const x=setup();await x.ui.load(DAY);await x.action('new');
  const first={fields:{incoming:B,opening_cash:'100',counted_cash:'195',notes:''}};
  await x.action('check',null,first);
  await x.ui.submit({dataset:{shiftSave:'record'},fields:first.fields});
  await x.action('new');
  assert.doesNotMatch(x.ui.page(DAY,true),/Cash at start of day/);
  assert.match(x.ui.page(DAY,true),/Starting from previous handover/);
  const form={fields:{incoming:B,counted_cash:'280',notes:'Second handover'}};
  await x.action('check',null,form);
  assert.equal(x.ui.getState().preview.opening_cash_cents,19500);
  assert.equal(x.ui.getState().preview.expected_cents,28500);
  await assert.rejects(()=>x.ui.submit({dataset:{shiftSave:'record'},fields:{...form.fields,counted_cash:'279'}}),
   /Values changed/);
  x.setIncome(12500);
  await assert.rejects(()=>x.ui.submit({dataset:{shiftSave:'record'},fields:form.fields}),/Ledger entries or an earlier handover changed/);
  assert.equal(x.records.length,1);
  await x.action('check',null,form);
  await x.ui.submit({dataset:{shiftSave:'record'},fields:form.fields});
  assert.equal(x.records.length,2);
  assert.equal(x.records[1].opening_cash_cents,19500);
 });
});

test('Incoming staff can confirm; only admin can remove most recent check',async()=>{
 await withFormData(async()=>{
  const x=setup();await x.ui.load(DAY);await x.action('new');
  const form={fields:{incoming:B,opening_cash:'0',counted_cash:'90',notes:''}};
  await x.action('check',null,form);
  await x.ui.submit({dataset:{shiftSave:'record'},fields:form.fields});
  const id=x.records[0].id;
  await assert.rejects(()=>x.action('accept',id),/Only the receiving employee/);
  x.setActor(B,'staff');await x.ui.load(DAY);
  assert.match(x.ui.page(DAY,true),/Confirm received/);
  await x.action('accept',id);
  assert.ok(x.records[0].accepted_at);
  await assert.rejects(()=>x.action('void',id),/Only administrators/);
  x.setActor(A,'admin');await x.ui.load(DAY);
  await x.action('void',id);
  assert.match(x.ui.page(DAY,true),/Removal reason/);
  await x.ui.submit({dataset:{shiftSave:'void',id},fields:{reason:'Incorrect test amount'}});
  assert.equal(x.records[0].void_reason,'Incorrect test amount');
  assert.match(x.ui.page(DAY,true),/Removed handovers/);
 });
});

test('Past dates and closed days display history without starting another shift check',async()=>{
 const x=setup();
 await x.ui.load(DAY);
 assert.doesNotMatch(x.ui.page(DAY,false),/data-action="shift-new"/);
 assert.doesNotMatch(x.ui.page('2026-11-03',true),/data-action="shift-new"/);
 assert.match(x.ui.page(DAY,true),/data-action="shift-new"/);
 await x.action('new');
 await x.action('cancel');
 assert.equal(x.ui.getState().formOpen,false);
});

test('Server migration enforces RLS and avoids writes to existing daily accounting',()=>{
 const sql=read('../supabase/migrations/20261104063106_add_cafeteria_shift_handover_cash_checks.sql');
 assert.match(sql,/alter table public\.cafeteria_shift_handovers enable row level security/);
 assert.match(sql,/Staff may view handover cash checks/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_staff\(\)/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_admin\(\)/);
 assert.match(sql,/Incoming|incoming/i);
 assert.match(sql,/cafeteria_finance_entries/);
 assert.match(sql,/private_ledger_entries/);
 assert.match(sql,/payment_channel='cash'/);
 assert.match(sql,/created_at>v_from/);
 assert.match(sql,/expected_cash_cents=opening_cash_cents\+recorded_income_cents-recorded_expenses_cents/);
 for(const name of ['cafeteria_finance_entries','cafeteria_finance_days','cafeteria_day_closings','whish_ledger_entries']){
  assert.doesNotMatch(sql,new RegExp('(insert\\s+into|update|delete\\s+from)\\s+public\\.'+name+'\\b','i'),
   'Shift check should not write to '+name);
 }
 const app=read('../app.js');
 assert.match(app,/renderShiftHandover:\(day,editable\)=>shiftHandover\.page\(day,editable\)/);
 assert.match(read('../lib/cafeteria-finances.js'),/statusPanel\+renderShiftHandover\(date,canEdit\(\)\)\+cashForm/);
});
