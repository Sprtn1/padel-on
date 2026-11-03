// Administrator-only operational checklist. This module does not read or write money.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
export function visibleTodoItems(items,filter='pending'){
 return items.filter(x=>!x.removed_at&&(filter==='all'||(filter==='done'?Boolean(x.completed_at):!x.completed_at)))
  .sort((a,b)=>{
   if(Boolean(a.completed_at)!==Boolean(b.completed_at))return a.completed_at?1:-1;
   const aDue=a.due_on||'9999-12-31',bDue=b.due_on||'9999-12-31';
   return aDue.localeCompare(bDue)||String(b.created_at||'').localeCompare(String(a.created_at||''))||String(a.id).localeCompare(String(b.id));
  });
}
export function todoFormData(data){
 const title=String(data.title??'').trim(),notes=String(data.notes??'').trim(),due=String(data.due_on??'').trim();
 if(!title||title.length>160)throw Error('Task name must be between 1 and 160 characters.');
 if(notes.length>800)throw Error('Task notes cannot exceed 800 characters.');
 if(due&&(!/^\d{4}-\d{2}-\d{2}$/.test(due)||!Number.isFinite(Date.parse(due+'T12:00:00Z'))||
   new Date(due+'T12:00:00Z').toISOString().slice(0,10)!==due))
  throw Error('Enter a valid due date.');
 return {title,notes,due_on:due||null};
}
export function createCafeteriaTodo({api,today,toast,rerender,isAdmin}){
 const state={items:[],loaded:false,loading:false,error:'',filter:'pending',showCreate:false,createId:null,editId:null,removeId:null,busy:false};
 function reset(){Object.assign(state,{items:[],loaded:false,loading:false,error:'',filter:'pending',showCreate:false,createId:null,editId:null,removeId:null,busy:false});}
 async function load(background=false){
  if(!isAdmin()){reset();return;}
  if(state.loading)return;
  state.loading=true;
  try{
   const items=await api.listAll('cafeteria_todo_items');
   if(!isAdmin()||!api.getSession()?.access_token){reset();return;}
   state.items=items;state.loaded=true;state.error='';
  }catch(err){state.error=err?.message||'Could not load the to-do list.';if(!background)state.loaded=false;}
  finally{state.loading=false;if(!background&&isAdmin())rerender();}
 }
 function taskFields(task=null){
  return '<div class="ctodo-fields">'+
   '<label>Task<input class="form-input" name="title" maxlength="160" value="'+esc(task?.title||'')+'" placeholder="What needs to be done?" required></label>'+
   '<label>Due date (optional)<input class="form-input" name="due_on" type="date" value="'+esc(task?.due_on||'')+'"></label>'+
   '<label class="ctodo-notes">Notes (optional)<textarea class="form-input" name="notes" maxlength="800" rows="2" placeholder="Additional details">'+esc(task?.notes||'')+'</textarea></label>'+
   '</div>';
 }
 function form(task=null){
  const edit=Boolean(task);
  return '<form class="cpay-form ctodo-form" data-ctodo-save="'+(edit?'edit':'create')+'"'+(edit?' data-id="'+esc(task.id)+'"':'')+'>'+
   '<h3>'+(edit?'Edit task':'Add task')+'</h3>'+taskFields(task)+
   '<div class="cpay-form-actions"><button class="btn btn-primary" type="submit">'+(edit?'Save changes':'Add task')+'</button>'+
   '<button class="btn btn-light" type="button" data-action="ctodo-'+(edit?'cancel-edit':'cancel-create')+'">Cancel</button></div></form>';
 }
 function removeForm(task){
  return '<form class="cpay-form cpay-removal-form ctodo-remove-confirm" data-ctodo-save="remove" data-id="'+esc(task.id)+'">'+
   '<h3>Remove this task?</h3><p>'+esc(task.title)+' will be removed from the active list.</p>'+
   '<div class="cpay-form-actions"><button class="btn btn-danger" type="submit">Confirm remove task</button>'+
   '<button class="btn btn-light" type="button" data-action="ctodo-cancel-remove">Cancel</button></div></form>';
 }
 function row(task){
  const done=Boolean(task.completed_at);
  const overdue=!done&&task.due_on&&task.due_on<today();
  const status=done?'Completed':overdue?'Overdue':'Pending';
  return '<tr class="'+(done?'ctodo-done':'')+'"><td><strong>'+esc(task.title)+'</strong>'+
   (task.notes?'<small>'+esc(task.notes)+'</small>':'')+'</td>'+
   '<td>'+esc(task.due_on||'—')+'</td>'+
   '<td><span class="ctodo-status '+(done?'ctodo-completed':overdue?'ctodo-overdue':'ctodo-pending')+'">'+status+'</span></td>'+
   '<td><div class="ctodo-actions">'+
    '<button type="button" class="btn btn-xs '+(done?'btn-light':'btn-soft')+'" data-action="ctodo-'+(done?'reopen':'complete')+'" data-id="'+esc(task.id)+'">'+(done?'Reopen':'Mark done')+'</button>'+
    '<button type="button" class="btn btn-light btn-xs" data-action="ctodo-edit" data-id="'+esc(task.id)+'">Edit</button>'+
    '<button type="button" class="btn btn-danger btn-xs" data-action="ctodo-remove" data-id="'+esc(task.id)+'">Remove</button></div></td></tr>'+
    (state.editId===task.id?'<tr><td colspan="4">'+form(task)+'</td></tr>':'')+
    (state.removeId===task.id?'<tr><td colspan="4">'+removeForm(task)+'</td></tr>':'');
 }
 function page(){
  if(!isAdmin())return '';
  const items=visibleTodoItems(state.items,state.filter);
  const active=state.items.filter(x=>!x.removed_at),remaining=active.filter(x=>!x.completed_at).length;
  return '<section class="ctodo-section"><div class="ctodo-heading"><div><h2>To Do List</h2><p>'+remaining+' pending · '+(active.length-remaining)+' completed</p></div>'+
   '<button class="btn btn-primary" type="button" data-action="ctodo-toggle-create">Add Task</button></div>'+
   (state.showCreate?form():'')+
   '<div class="ctodo-toolbar"><label>Show <select id="ctodo-filter" class="form-input"><option value="pending"'+(state.filter==='pending'?' selected':'')+'>Pending</option>'+
   '<option value="all"'+(state.filter==='all'?' selected':'')+'>All tasks</option>'+
   '<option value="done"'+(state.filter==='done'?' selected':'')+'>Completed</option></select></label></div>'+
   (state.error?'<p class="cpay-error" role="alert">'+esc(state.error)+'</p>':'')+
   (!state.loaded?'<div class="panel cpay-empty">'+(state.loading?'Loading tasks…':'Unable to load tasks. Use Refresh to try again.')+'</div>':
   '<div class="panel ctodo-panel"><div class="data-table-wrap"><table class="data-table ctodo-table"><thead><tr>'+
   '<th>Task / Notes</th><th>Due date</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+
   (items.length?items.map(row).join(''):'<tr><td colspan="4" class="cpay-empty">No tasks in this view.</td></tr>')+
   '</tbody></table></div></div>')+'</section>';
 }
 function getActive(id){
  const task=state.items.find(t=>t.id===id&&!t.removed_at);
  if(!task)throw Error('Task not found. Refresh the page.');
  return task;
 }
 async function action(target){
  if(!isAdmin())throw Error('Only administrators can manage cafeteria tasks.');
  const kind=target.dataset.ctodoAction,taskId=target.dataset.id;
  if(!kind)return false;
  if(state.busy)throw Error('Task is being saved.');
  if(kind==='toggle-create'){state.showCreate=!state.showCreate;state.createId=state.showCreate?uuid():null;state.editId=null;state.removeId=null;}
  else if(kind==='cancel-create'){state.showCreate=false;state.createId=null;}
  else if(kind==='cancel-edit'){state.editId=null;}
  else if(kind==='cancel-remove'){state.removeId=null;}
  else if(kind==='edit'){getActive(taskId);state.editId=taskId;state.removeId=null;state.showCreate=false;}
  else if(kind==='remove'){getActive(taskId);state.removeId=taskId;state.editId=null;state.showCreate=false;}
  else if(kind==='complete'||kind==='reopen'){
   getActive(taskId);
   state.busy=true;
   try{
    await api.rpc('cafeteria_todo_change',{p_id:taskId,p_action:kind});
    await load();
    toast(kind==='complete'?'Task completed.':'Task reopened.');
   }finally{state.busy=false;}
  }else return false;
  if(!['complete','reopen'].includes(kind))rerender();
  return true;
 }
 function setFilter(value){
  if(!isAdmin())throw Error('Only administrators can view cafeteria tasks.');
  if(['pending','all','done'].includes(value)){state.filter=value;rerender();}
 }
 async function submit(form){
  if(!isAdmin())throw Error('Only administrators can manage cafeteria tasks.');
  if(state.busy)throw Error('Task is already being saved.');
  state.busy=true;
  try{
   const kind=form.dataset.ctodoSave;
   if(kind==='create'){
    if(!state.showCreate||!state.createId)throw Error('Reopen the new task form.');
    const task=todoFormData(Object.fromEntries(new FormData(form)));
    await api.insert('cafeteria_todo_items',{id:state.createId,...task});
    state.showCreate=false;state.createId=null;state.filter='pending';
    toast('Task added.');
   }else if(kind==='edit'){
    const taskId=form.dataset.id;
    if(!state.editId||state.editId!==taskId)throw Error('Reopen the task editor.');
    getActive(taskId);
    const {title,notes,due_on}=todoFormData(Object.fromEntries(new FormData(form)));
    await api.rpc('cafeteria_todo_change',{p_id:taskId,p_action:'edit',p_title:title,p_notes:notes,p_due_on:due_on});
    state.editId=null;
    toast('Task updated.');
   }else if(kind==='remove'){
    const taskId=form.dataset.id;
    if(state.removeId!==taskId)throw Error('Confirm removal again.');
    getActive(taskId);
    await api.rpc('cafeteria_todo_change',{p_id:taskId,p_action:'remove'});
    state.removeId=null;
    toast('Task removed.');
   }else throw Error('Unknown task action.');
   await load();
  }finally{state.busy=false;}
 }
 return {page,load,action,submit,reset,setFilter,getState:()=>state};
}
