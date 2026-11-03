// Consignment Inventory — a standalone stock ledger. Never updates cafeteria cash, Whish, or sales.
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uuid=()=>crypto.randomUUID();
const CATEGORIES=['Shoes','Rackets','Grips','Balls','Clothing','Accessories','Other'];
function required(value,max,label){
 const text=String(value??'').trim();
 if(!text||text.length>max)throw Error(label+' must be between 1 and '+max+' characters.');
 return text;
}
function optional(value,max,label){
 const text=String(value??'').trim();
 if(text.length>max)throw Error(label+' is too long ('+max+' characters maximum).');
 return text;
}
export function consignmentMoneyCents(value){
 const raw=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a valid USD selling price (two decimals maximum).');
 const [whole,fraction='']=raw.split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>100000000000)throw Error('Selling price must be above zero.');
 return cents;
}
export function consignmentQuantity(value,allowZero=false){
 const raw=String(value??'').trim();
 if(!/^\d+$/.test(raw))throw Error('Quantity must be a whole number.');
 const qty=Number(raw);
 if(!Number.isSafeInteger(qty)||qty>1000000||(!allowZero&&qty===0))
  throw Error('Quantity must be '+(allowZero?'between 0 and':'between 1 and')+' 1,000,000.');
 return qty;
}
export function consignmentFormValues(data){
 const category=required(data.category,80,'Category');
 if(!CATEGORIES.includes(category))throw Error('Select a valid category.');
 return {
  category,
  product_name:required(data.product_name,160,'Product name'),
  brand:optional(data.brand,100,'Brand'),
  model:optional(data.model,120,'Model'),
  size_label:optional(data.size_label,40,'Size'),
  supplier:required(data.supplier,160,'Consigned by'),
  selling_price_cents:consignmentMoneyCents(data.selling_price),
  notes:optional(data.notes,800,'Notes')
 };
}
export function filterConsignment(items,search='',filter='all'){
 const tokens=String(search||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return items.filter(item=>{
  if(item.removed_at)return false;
  if(filter==='in-stock'&&Number(item.quantity)<=0)return false;
  if(filter==='out-of-stock'&&Number(item.quantity)>0)return false;
  const hay=[item.category,item.product_name,item.brand,item.model,item.size_label,item.supplier,item.notes]
   .map(x=>String(x??'').toLocaleLowerCase()).join(' ');
  return tokens.every(token=>hay.includes(token));
 }).sort((a,b)=>{
  const ka=[a.category,a.product_name,a.brand,a.model,a.size_label,a.supplier].map(x=>String(x??'')).join('\u0000');
  const kb=[b.category,b.product_name,b.brand,b.model,b.size_label,b.supplier].map(x=>String(x??'')).join('\u0000');
  return ka.localeCompare(kb)||String(a.id).localeCompare(String(b.id));
 });
}
const formatCents=cents=>'$'+(Number(cents||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
export function createConsignmentInventory({api,heading,icon,toast,isAdmin,rerender}){
 const state={items:[],movements:[],loaded:false,loading:false,error:'',search:'',filter:'all',form:null,historyId:null,busy:false};
 function reset(){
  Object.assign(state,{items:[],movements:[],loaded:false,loading:false,error:'',search:'',filter:'all',form:null,historyId:null,busy:false});
 }
 async function load(background=false){
  if(!api.getSession()?.access_token)return;
  if(state.loading)return;
  state.loading=true;
  try{
   const admin=isAdmin();
   const [items,movements]=await Promise.all([
    api.listAll('consignment_items'),
    admin?api.listAll('consignment_movements'):Promise.resolve([])
   ]);
   if(!api.getSession()?.access_token)return;
   state.items=items;state.movements=isAdmin()?movements:[];state.error='';state.loaded=true;
  }catch(err){
   state.error=err?.message||'Unable to load consignment inventory.';
   if(!background)state.loaded=false;
  }finally{
   state.loading=false;
   if(!background&&api.getSession()?.access_token)rerender();
  }
 }
 const activeItem=id=>{
  const found=state.items.find(item=>item.id===id&&!item.removed_at);
  if(!found)throw Error('Item not found. Refresh the inventory.');
  return found;
 };
 function field(name,label,value='',attrs=''){
  return '<label>'+esc(label)+'<input class="form-input" name="'+esc(name)+'" value="'+esc(value)+'" '+attrs+'></label>';
 }
 function itemEditor(){
  const current=state.form;
  if(!current||!['create','edit'].includes(current.kind))return '';
  const edit=current.kind==='edit';
  const item=edit?activeItem(current.id):null;
  const selected=item?.category||'Shoes';
  const categorySelect='<label>Category<select class="form-input" name="category" required>'+
   CATEGORIES.map(cat=>'<option value="'+esc(cat)+'"'+(cat===selected?' selected':'')+'>'+esc(cat)+'</option>').join('')+'</select></label>';
  return '<form class="panel inv-editor" data-consign-save="'+(edit?'edit':'create')+'" data-id="'+esc(current.id)+'">'+
   '<h3>'+(edit?'Edit consignment item':'Add consignment item')+'</h3><div class="inv-fields">'+
   categorySelect+
   field('product_name','Product name',item?.product_name||'','required maxlength="160" placeholder="e.g. Padel shoes"')+
   field('brand','Brand',item?.brand||'','maxlength="100" placeholder="e.g. NOX"')+
   field('model','Model',item?.model||'','maxlength="120" placeholder="e.g. Luxury"')+
   field('size_label','Size (optional)',item?.size_label||'','maxlength="40" placeholder="e.g. 42"')+
   field('supplier','Consigned by',item?.supplier||'','required maxlength="160" placeholder="Supplier / person"')+
   field('selling_price','Selling price (USD)',item?(Number(item.selling_price_cents)/100).toFixed(2):'','required type="number" step="0.01" min="0.01" max="1000000000"')+
   (edit?'':field('opening_quantity','Initial quantity','0','required type="number" step="1" min="0" max="1000000"'))+
   '<label class="inv-notes">Notes (optional)<textarea class="form-input" name="notes" maxlength="800" rows="2">'+esc(item?.notes||'')+'</textarea></label>'+
   '</div><p class="inv-hint">'+(edit?'Use Adjust Stock to change quantities, so changes remain in the history.':'Create a separate record for each size or variant.')+'</p>'+
   '<div class="inv-form-actions"><button class="btn btn-primary" type="submit">'+(edit?'Save changes':'Add item')+'</button>'+
   '<button type="button" class="btn btn-light" data-action="consign-cancel">Cancel</button></div></form>';
 }
 function adjustmentEditor(){
  const current=state.form;
  if(!current||current.kind!=='adjust')return '';
  const item=activeItem(current.id);
  return '<form class="panel inv-editor" data-consign-save="adjust" data-id="'+esc(item.id)+'">'+
   '<h3>Adjust stock — '+esc(item.product_name)+(item.size_label?' · '+esc(item.size_label):'')+'</h3>'+
   '<p>Available now: <strong>'+esc(item.quantity)+'</strong>. Every adjustment requires a reason and is logged.</p>'+
   '<div class="inv-fields"><label>Adjustment<select name="direction" class="form-input"><option value="add">Add stock</option><option value="remove">Remove stock (sold / returned)</option></select></label>'+
   field('quantity','Quantity','1','type="number" min="1" max="1000000" step="1" required')+
   field('reason','Reason','','maxlength="500" minlength="3" required placeholder="e.g. Received 3 pairs / Sold 1 pair"')+
   '</div><div class="inv-form-actions"><button class="btn btn-primary" type="submit">Save adjustment</button>'+
   '<button type="button" class="btn btn-light" data-action="consign-cancel">Cancel</button></div></form>';
 }
 function removalEditor(){
  const current=state.form;
  if(!current||current.kind!=='remove')return '';
  const item=activeItem(current.id);
  return '<form class="panel inv-editor inv-removal" data-consign-save="remove" data-id="'+esc(item.id)+'">'+
   '<h3>Remove '+esc(item.product_name)+'?</h3><p>The item will disappear from the active inventory. Its previous stock history will be preserved.</p>'+
   field('reason','Reason for removal','Incorrect entry','required minlength="3" maxlength="500"')+
   '<div class="inv-form-actions"><button class="btn btn-danger" type="submit">Confirm remove</button>'+
   '<button class="btn btn-light" type="button" data-action="consign-cancel">Cancel</button></div></form>';
 }
 function movementHistory(item){
  if(!isAdmin()||state.historyId!==item.id)return '';
  const rows=state.movements.filter(m=>m.item_id===item.id)
   .sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
  return '<tr class="inv-history-row"><td colspan="'+(isAdmin()?7:6)+'">'+
   '<div class="inv-history"><strong>Stock history</strong>'+
   (rows.length?'<div class="data-table-wrap"><table class="data-table"><thead><tr><th>Recorded</th><th>Change</th><th>After</th><th>Reason</th></tr></thead><tbody>'+
    rows.map(m=>'<tr><td>'+esc(String(m.created_at||'').replace('T',' ').slice(0,16))+'</td>'+
     '<td>'+esc(m.delta>0?'+'+m.delta:String(m.delta))+'</td><td>'+esc(m.quantity_after)+'</td><td>'+esc(m.reason)+'</td></tr>').join('')+
    '</tbody></table></div>':'<p>No stock movements yet.</p>')+'</div></td></tr>';
 }
 function row(item){
  const admin=isAdmin();
  const name=esc(item.product_name)+(item.brand?' <small>'+esc(item.brand)+'</small>':'')+
   (item.model?' <small>'+esc(item.model)+'</small>':'')+
   (item.notes?'<p class="inv-notes-display">'+esc(item.notes)+'</p>':'');
  return '<tr><td><strong>'+name+'</strong></td><td>'+esc(item.category)+'</td>'+
   '<td>'+esc(item.size_label||'—')+'</td><td>'+esc(item.supplier)+'</td>'+
   '<td><span class="inv-quantity '+(Number(item.quantity)>0?'in-stock':'out-of-stock')+'">'+esc(item.quantity)+'</span></td>'+
   '<td><strong>'+esc(formatCents(item.selling_price_cents))+'</strong></td>'+
   (admin?'<td><div class="inv-actions">'+
    '<button class="btn btn-soft btn-xs" type="button" data-action="consign-adjust" data-id="'+esc(item.id)+'">Adjust</button>'+
    '<button class="btn btn-light btn-xs" type="button" data-action="consign-edit" data-id="'+esc(item.id)+'">Edit</button>'+
    '<button class="btn btn-light btn-xs" type="button" data-action="consign-history" data-id="'+esc(item.id)+'">'+(state.historyId===item.id?'Hide':'History')+'</button>'+
    '<button class="btn btn-danger btn-xs" type="button" data-action="consign-remove" data-id="'+esc(item.id)+'">Remove</button>'+
    '</div></td>':'')+'</tr>'+movementHistory(item);
 }
 function page(){
  const admin=isAdmin();
  const active=state.items.filter(x=>!x.removed_at);
  const units=active.reduce((n,x)=>n+Number(x.quantity||0),0);
  const out=active.filter(x=>Number(x.quantity)===0).length;
  const filtered=filterConsignment(state.items,state.search,state.filter);
  return heading('Club stock','Consignment Inventory','Search products, sizes, stock quantities, and selling prices.',
    admin?'<button class="btn btn-primary" type="button" data-action="consign-new">'+icon('plus')+' Add product</button>':'')+
   '<section class="inv-summary">'+
    '<article class="summary-card"><span class="label">Products / variants</span><div class="metric num">'+active.length+'</div></article>'+
    '<article class="summary-card"><span class="label">Total units</span><div class="metric num">'+units+'</div></article>'+
    '<article class="summary-card"><span class="label">Out of stock</span><div class="metric num">'+out+'</div></article>'+
   '</section>'+
   (admin?itemEditor()+adjustmentEditor()+removalEditor():'')+
   '<div class="inv-toolbar"><label>Search all item details<input class="form-input" id="consign-search" type="search" maxlength="180" value="'+esc(state.search)+'" placeholder="Shoes, NOX, Luxury, 42…"></label>'+
   '<label>Stock<select class="form-input" id="consign-filter">'+
    [['all','All products'],['in-stock','In stock'],['out-of-stock','Out of stock']].map(([key,value])=>
     '<option value="'+key+'"'+(state.filter===key?' selected':'')+'>'+value+'</option>').join('')+
   '</select></label></div>'+
   (state.error?'<div class="inv-error" role="alert">'+esc(state.error)+'</div>':'')+
   (!state.loaded?'<article class="panel inv-empty">'+(state.loading?'Loading inventory…':'Inventory could not be loaded. Please refresh.')+'</article>':
    '<article class="panel inv-table-panel"><div class="data-table-wrap"><table class="data-table inv-table">'+
    '<thead><tr><th>Product / brand / model</th><th>Category</th><th>Size</th><th>Consigned by</th><th>Quantity</th><th>Selling price</th>'+
    (admin?'<th>Manage</th>':'')+'</tr></thead><tbody>'+
    (filtered.length?filtered.map(row).join(''):'<tr><td colspan="'+(admin?7:6)+'" class="inv-empty">No products match your search.</td></tr>')+
    '</tbody></table></div></article>');
 }
 function setSearch(value){state.search=String(value??'').slice(0,180);}
 function setFilter(value){if(['all','in-stock','out-of-stock'].includes(value)){state.filter=value;rerender();}}
 async function action(target){
  if(!isAdmin())throw Error('Only administrators can change consignment inventory.');
  if(state.busy)throw Error('A stock change is already being saved.');
  const act=target.dataset.consignAction,ident=target.dataset.id;
  if(!act)return false;
  if(act==='cancel'){state.form=null;}
  else if(act==='new'){state.form={kind:'create',id:uuid()};state.historyId=null;}
  else if(['edit','adjust','remove'].includes(act)){
   activeItem(ident);
   state.form={kind:act,id:ident};state.historyId=null;
  }else if(act==='history'){
   activeItem(ident);state.form=null;
   state.historyId=state.historyId===ident?null:ident;
  }else return false;
  rerender();return true;
 }
 async function submit(form){
  if(!isAdmin())throw Error('Only administrators can change consignment inventory.');
  if(state.busy)throw Error('A stock change is already being saved.');
  const kind=form.dataset.consignSave,ident=form.dataset.id;
  if(!state.form||state.form.kind!==kind||state.form.id!==ident)throw Error('Reopen the inventory form.');
  state.busy=true;
  try{
   const data=Object.fromEntries(new FormData(form));
   if(kind==='create'||kind==='edit'){
    const values=consignmentFormValues(data);
    const payload={p_id:ident,p_category:values.category,p_product_name:values.product_name,
     p_brand:values.brand,p_model:values.model,p_size_label:values.size_label,p_supplier:values.supplier,
     p_selling_price_cents:values.selling_price_cents,p_notes:values.notes};
    if(kind==='create'){
     payload.p_initial_quantity=consignmentQuantity(data.opening_quantity,true);
     await api.rpc('consignment_create_item',payload);
    }else{
     activeItem(ident);
     await api.rpc('consignment_edit_item',payload);
    }
    toast(kind==='create'?'Consignment product added.':'Product details updated.');
   }else if(kind==='adjust'){
    activeItem(ident);
    const magnitude=consignmentQuantity(data.quantity);
    if(!['add','remove'].includes(data.direction))throw Error('Choose an adjustment direction.');
    const reason=required(data.reason,500,'Adjustment reason');
    if(reason.length<3)throw Error('Reason must be at least 3 characters.');
    await api.rpc('consignment_adjust_stock',{p_id:ident,p_delta:data.direction==='add'?magnitude:-magnitude,p_reason:reason});
    toast('Stock quantity updated.');
   }else if(kind==='remove'){
    activeItem(ident);
    const reason=required(data.reason,500,'Removal reason');
    if(reason.length<3)throw Error('Reason must be at least 3 characters.');
    await api.rpc('consignment_remove_item',{p_id:ident,p_reason:reason});
    toast('Consignment item removed.');
   }else throw Error('Unknown inventory form.');
   state.form=null;
   await load();
  }finally{state.busy=false;}
 }
 return {page,load,action,submit,reset,setSearch,setFilter,getState:()=>state};
}
