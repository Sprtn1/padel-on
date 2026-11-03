import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {visibleTodoItems,todoFormData,createCafeteriaTodo} from '../lib/cafeteria-todo.js';

const read=path=>readFileSync(new URL(path,import.meta.url),'utf8');
test('To-do fields allow dates and notes but reject invalid or oversized inputs',()=>{
 assert.deepEqual(todoFormData({title:'  Repair fridge  ',notes:'  Call technician  ',due_on:'2026-11-10'}),
  {title:'Repair fridge',notes:'Call technician',due_on:'2026-11-10'});
 assert.deepEqual(todoFormData({title:'Stock check'}),{title:'Stock check',notes:'',due_on:null});
 for(const input of [{title:' '},{title:'x'.repeat(161)},{title:'Hi',notes:'x'.repeat(801)},
  {title:'Hi',due_on:'2026-02-30'},{title:'Hi',due_on:'invalid'}])
  assert.throws(()=>todoFormData(input),Error);
});
test('Pending, completed, removed and overdue tasks are filtered and sorted independently',()=>{
 const rows=[
  {id:'late',title:'Late',due_on:'2026-11-04',created_at:'2026-11-01'},
  {id:'done',title:'Done',completed_at:'2026-11-02',due_on:'2026-11-01'},
  {id:'soon',title:'Soon',due_on:'2026-11-03',created_at:'2026-11-01'},
  {id:'removed',title:'Removed',removed_at:'2026-11-02'},
  {id:'no-date',title:'No date',created_at:'2026-11-02'}
 ];
 assert.deepEqual(visibleTodoItems(rows,'pending').map(x=>x.id),['soon','late','no-date']);
 assert.deepEqual(visibleTodoItems(rows,'done').map(x=>x.id),['done']);
 assert.deepEqual(visibleTodoItems(rows,'all').map(x=>x.id),['soon','late','no-date','done']);
});
function make(){
 let role='admin';
 const rows=[],calls=[],messages=[];
 const api={
  getSession:()=>({access_token:'test-session'}),
  async listAll(table){
   calls.push(['read',table]);
   assert.equal(table,'cafeteria_todo_items','Never touch financial tables');
   return rows.map(x=>({...x}));
  },
  async insert(table,data){
   assert.equal(table,'cafeteria_todo_items');
   calls.push(['insert',table,data]);
   rows.push({...data,completed_at:null,removed_at:null,created_at:'2026-11-03T12:00:00Z'});
   return [data];
  },
  async rpc(name,data){
   assert.equal(name,'cafeteria_todo_change');
   calls.push(['rpc',name,data]);
   const row=rows.find(x=>x.id===data.p_id&&!x.removed_at);
   if(!row)throw Error('Task not found');
   if(data.p_action==='complete')row.completed_at='2026-11-03T13:00:00Z';
   else if(data.p_action==='reopen')row.completed_at=null;
   else if(data.p_action==='remove')row.removed_at='2026-11-03T14:00:00Z';
   else if(data.p_action==='edit'){
    row.title=data.p_title;row.notes=data.p_notes;row.due_on=data.p_due_on;
   }else throw Error('Unknown action');
   return row.id;
  }
 };
 const ui=createCafeteriaTodo({api,today:()=> '2026-11-03',toast:m=>messages.push(m),
  rerender:()=>calls.push(['render']),isAdmin:()=>role==='admin'});
 const act=(kind,id)=>ui.action({dataset:{ctodoAction:kind,id}});
 return {ui,rows,calls,messages,act,setRole:x=>{role=x}};
}
test('Admin sees separate to-do table beneath payment section and user text is escaped',async()=>{
 const h=make();
 h.rows.push({id:'1',title:'Fix <img src=x>',notes:'Note "hi" & <script>',due_on:'2026-11-01',
  created_at:'2026-11-03',completed_at:null});
 await h.ui.load();
 const html=h.ui.page();
 assert.match(html,/To Do List/);
 assert.match(html,/<table class="data-table ctodo-table">/);
 assert.match(html,/Fix &lt;img src=x&gt;/);
 assert.match(html,/Note &quot;hi&quot; &amp; &lt;script&gt;/);
 assert.match(html,/Overdue/);
 assert.match(html,/data-action="ctodo-complete"/);
 assert.doesNotMatch(html,/<img src=x>/);
 assert.doesNotMatch(html,/cashbook|Whish/i);
});
test('Staff cannot load or display tasks, including after a role downgrade',async()=>{
 const h=make();
 h.rows.push({id:'1',title:'Restricted',created_at:'2026-11-03'});
 await h.ui.load();
 assert.match(h.ui.page(),/Restricted/);
 h.setRole('staff');
 await h.ui.load();
 assert.equal(h.ui.page(),'');
 assert.equal(h.ui.getState().items.length,0);
 await assert.rejects(()=>h.act('toggle-create'),/Only administrators/);
 await assert.rejects(()=>h.ui.submit({dataset:{ctodoSave:'create'}}),/Only administrators/);
});
test('Add, edit, complete, reopen and soft-remove use only the protected to-do endpoints',async()=>{
 const h=make();
 const native=globalThis.FormData;
 class MockFormData{
  constructor(form){this.fields=form.fields;}
  [Symbol.iterator](){return Object.entries(this.fields)[Symbol.iterator]();}
 }
 globalThis.FormData=MockFormData;
 try{
  await h.ui.load();
  await h.act('toggle-create');
  assert.match(h.ui.page(),/data-ctodo-save="create"/);
  await h.ui.submit({dataset:{ctodoSave:'create'},fields:{title:'Order cups',notes:'',due_on:'2026-11-10'}});
  assert.equal(h.rows.length,1);
  const id=h.rows[0].id;
  assert.equal(h.rows[0].due_on,'2026-11-10');
  await h.act('edit',id);
  assert.match(h.ui.page(),/data-ctodo-save="edit"/);
  await h.ui.submit({dataset:{ctodoSave:'edit',id},fields:{title:'Order paper cups',notes:'Supplier A',due_on:''}});
  assert.equal(h.rows[0].title,'Order paper cups');
  assert.equal(h.rows[0].notes,'Supplier A');
  assert.equal(h.rows[0].due_on,null);
  await h.act('complete',id);
  assert.ok(h.rows[0].completed_at);
  assert.deepEqual(visibleTodoItems(h.rows).map(x=>x.id),[]);
  h.ui.setFilter('done');
  assert.match(h.ui.page(),/Completed/);
  await h.act('reopen',id);
  assert.equal(h.rows[0].completed_at,null);
  h.ui.setFilter('all');
  await h.act('remove',id);
  assert.match(h.ui.page(),/Confirm remove task/);
  await h.act('cancel-remove');
  assert.equal(h.rows[0].removed_at,undefined);
  await h.act('remove',id);
  await h.ui.submit({dataset:{ctodoSave:'remove',id},fields:{}});
  assert.ok(h.rows[0].removed_at,'Removal is soft-delete for audit purposes');
  assert.equal(visibleTodoItems(h.rows,'all').length,0);
  assert.deepEqual(h.calls.filter(x=>x[0]==='rpc').map(x=>x[2].p_action),
   ['edit','complete','reopen','remove']);
  assert.ok(h.calls.every(x=>!['cafeteria_payables','cafeteria_payable_payments','cafeteria_finances'].includes(x[1])));
 }finally{globalThis.FormData=native;}
});
test('To-do form has cancel buttons and no task writes occur without submission',async()=>{
 const h=make();
 await h.ui.load();
 await h.act('toggle-create');
 assert.match(h.ui.page(),/data-action="ctodo-cancel-create"/);
 await h.act('cancel-create');
 assert.equal(h.rows.length,0);
 assert.doesNotMatch(h.ui.page(),/data-ctodo-save="create"/);
});
test('To-do SQL is admin-only, records removals and does not mutate financial tables',()=>{
 const sql=read('../supabase/migrations/20261103161326_add_admin_cafeteria_todo_list.sql');
 assert.match(sql,/alter table public\.cafeteria_todo_items enable row level security/);
 assert.match(sql,/admin_read_cafeteria_todos/);
 assert.match(sql,/admin_create_cafeteria_todos/);
 assert.match(sql,/auth\.uid\(\) is null or not public\.is_admin\(\)/);
 assert.match(sql,/removed_at=now\(\),removed_by=auth\.uid\(\)/);
 assert.match(sql,/revoke all on function public\.cafeteria_todo_change/);
 assert.doesNotMatch(sql,/(?:update|delete from|insert into)\s+public\.(?:cafeteria_payables|cafeteria_payable_payments|cafeteria_finances|whish_ledger)/i);
 const app=read('../app.js');
 assert.match(app,/cafeteriaPayments\.page\(\)\+cafeteriaTodo\.page\(\)/);
 assert.match(app,/state\.staff\?\.role==='admin'\?cafeteriaPayments\.page\(\)\+cafeteriaTodo\.page\(\):dashboard\(\)/);
});
