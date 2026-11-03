// Admin-only outgoing cafeteria obligations; intentionally separate from the daily cashbook.
export function paymentCents(value){
 const raw=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a valid USD amount (up to two decimals).');
 const parts=raw.split('.');
 const cents=Number(parts[0])*100+Number((parts[1]||'').padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>100000000000)throw Error('Amount must be positive and within the allowed limit.');
 return cents;
}
export function payableBalances(payables,payments){
 const sums=new Map(),history=new Map();
 for(const payment of payments){
  if(payment.voided_at)continue;
  const id=payment.payable_id;
  sums.set(id,(sums.get(id)||0)+Number(payment.amount_cents||0));
  if(!history.has(id))history.set(id,[]);
  history.get(id).push(payment);
 }
 return payables.filter(payable=>!payable.voided_at).map(payable=>{
  const total=Number(payable.total_cents),paid=sums.get(payable.id)||0;
  const remaining=Math.max(0,total-paid);
  const status=remaining===0?'paid':paid>0?'partial':'unpaid';
  return {...payable,paid,remaining,status,history:(history.get(payable.id)||[]).slice().sort((a,b)=>b.paid_on.localeCompare(a.paid_on)||b.created_at.localeCompare(a.created_at))};
 });
}
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const clean=(value,max,label)=>{
 const s=String(value??'').trim();
 if(!s||s.length>max)throw Error(label+' must be between 1 and '+max+' characters.');
 return s;
};
const usd=cents=>(Number(cents)/100).toFixed(2);
const id=()=>crypto.randomUUID();
export function createCafeteriaPayments({api,heading,icon,amount,today,toast,rerender,isAdmin}){
 const state={payables:[],payments:[],loaded:false,loading:false,error:'',filter:'outstanding',search:'',showCreate:false,createId:null,paymentFor:null,paymentId:null,payFull:false,historyFor:null,removeTarget:null,busy:false};
 function reset(){
  Object.assign(state,{payables:[],payments:[],loaded:false,loading:false,error:'',filter:'outstanding',search:'',showCreate:false,createId:null,paymentFor:null,paymentId:null,payFull:false,historyFor:null,removeTarget:null,busy:false});
 }
 async function load(background=false){
  if(!isAdmin()){reset();return;}
  if(state.loading)return;
  state.loading=true;
  try{
   const [payables,payments]=await Promise.all([
    api.listAll('cafeteria_payables'),
    api.listAll('cafeteria_payable_payments')
   ]);
   if(!isAdmin()||!api.getSession()?.access_token){reset();return;}
   state.payables=payables;state.payments=payments;state.loaded=true;state.error='';
  }catch(error){
   state.error=error?.message||'Unable to load payments.';
   if(!background)state.loaded=false;
  }finally{
   state.loading=false;
   if(!background&&isAdmin())rerender();
  }
 }
 function newPayableForm(){
  return '<form class="cpay-form" data-cpay-save="create">'+
   '<h3>New payment obligation</h3>'+
   '<div class="cpay-fields">'+
    '<label>Payment name<input class="form-input" name="title" maxlength="150" placeholder="e.g. Cafeteria stock invoice" required></label>'+
    '<label>Owed to<input class="form-input" name="payee" maxlength="150" placeholder="Supplier or person" required></label>'+
    '<label>Total amount owed (USD)<input class="form-input" name="total" type="number" min="0.01" max="1000000000" step="0.01" placeholder="0.00" required></label>'+
   '</div>'+
   '<div class="cpay-form-actions"><button class="btn btn-primary" type="submit">Save obligation</button><button class="btn btn-light" data-action="cpay-cancel-create" type="button">Cancel</button></div>'+
   '</form>';
 }
 function paymentForm(payable){
  const value=state.payFull?usd(payable.remaining):'';
  return '<form class="cpay-form cpay-payment-form" data-cpay-save="payment" data-id="'+esc(payable.id)+'">'+
   '<h3>Record payment to '+esc(payable.payee)+'</h3>'+
   '<p>Remaining: <strong>'+esc(amount(payable.remaining))+'</strong>. The payment is recorded only when you save.</p>'+
   '<div class="cpay-fields">'+
    '<label>Amount paid (USD)<input class="form-input" name="paid_amount" type="number" min="0.01" max="'+esc(usd(payable.remaining))+'" step="0.01" value="'+esc(value)+'" required></label>'+
    '<label>Payment date<input class="form-input" name="paid_on" type="date" max="'+esc(today())+'" value="'+esc(today())+'" required></label>'+
    '<label>Notes (optional)<input class="form-input" name="notes" maxlength="500" placeholder="Receipt / transfer reference"></label>'+
   '</div>'+
   '<div class="cpay-form-actions"><button class="btn btn-primary" type="submit">Record payment</button><button class="btn btn-light" data-action="cpay-cancel-payment" type="button">Cancel</button></div>'+
   '</form>';
 }
 function history(payable){
  if(!payable.history.length)return '<p class="cpay-empty">No payments recorded yet.</p>';
  return '<div class="data-table-wrap cpay-history"><table class="data-table"><thead><tr><th>Date</th><th>Amount</th><th>Notes</th><th>Correction</th></tr></thead><tbody>'+
   payable.history.map(item=>'<tr><td>'+esc(item.paid_on)+'</td><td>'+esc(amount(item.amount_cents))+'</td><td>'+esc(item.notes||'—')+'</td><td><button type="button" class="btn btn-danger btn-xs" data-action="cpay-remove-payment" data-id="'+esc(item.id)+'" aria-label="Remove payment of '+esc(amount(item.amount_cents))+'">Remove</button></td></tr>').join('')+
   '</tbody></table></div>';
 }
 function removalForm(payable){
  const selected=state.removeTarget;
  if(!selected||selected.payableId!==payable.id)return '';
  const payment=selected.kind==='payment'?payable.history.find(item=>item.id===selected.id):null;
  if(selected.kind==='payment'&&!payment)return '';
  const isPayment=selected.kind==='payment';
  const label=isPayment?'Remove this '+amount(payment.amount_cents)+' payment?':'Remove the entire '+payable.title+' obligation?';
  const detail=isPayment?'The remaining balance will increase by the removed amount.':'The obligation and all its recorded installments will disappear from active totals.';
  return '<form class="cpay-form cpay-removal-form" data-cpay-save="remove" data-kind="'+esc(selected.kind)+'" data-id="'+esc(selected.id)+'">'+
    '<h3>'+esc(label)+'</h3><p>'+esc(detail)+' The correction is saved for audit.</p>'+
    '<label>Reason for removal<input class="form-input" name="reason" type="text" required minlength="3" maxlength="500" value="Incorrect entry" aria-label="Reason for removing entry"></label>'+
    '<div class="cpay-form-actions"><button class="btn btn-danger" type="submit">'+(isPayment?'Confirm remove payment':'Confirm remove entire entry')+'</button>'+
    '<button class="btn btn-light" data-action="cpay-cancel-remove" type="button">Cancel</button></div></form>';
 }
 function card(payable){
  const badge=payable.status==='paid'?'Paid in full':payable.status==='partial'?'Partially paid':'Unpaid';
  return '<article class="panel cpay-card">'+
   '<div class="cpay-card-head"><div><h3>'+esc(payable.title)+'</h3><p>Owed to <strong>'+esc(payable.payee)+'</strong></p></div>'+
    '<span class="cpay-status cpay-'+payable.status+'">'+badge+'</span></div>'+
   '<div class="cpay-amounts"><div><small>Original amount</small><strong>'+esc(amount(payable.total_cents))+'</strong></div>'+
    '<div><small>Paid</small><strong>'+esc(amount(payable.paid))+'</strong></div>'+
    '<div><small>Remaining</small><strong>'+esc(amount(payable.remaining))+'</strong></div></div>'+
   '<div class="cpay-card-actions">'+
    (payable.remaining?'<button class="btn btn-primary btn-xs" type="button" data-action="cpay-pay" data-id="'+esc(payable.id)+'">Record partial payment</button>'+
     '<button class="btn btn-soft btn-xs" type="button" data-action="cpay-full" data-id="'+esc(payable.id)+'">Pay remaining</button>':'')+
    '<button class="btn btn-light btn-xs" type="button" data-action="cpay-history" data-id="'+esc(payable.id)+'">'+(state.historyFor===payable.id?'Hide':'View')+' history ('+payable.history.length+')</button>'+
    '<button class="btn btn-danger btn-xs" type="button" data-action="cpay-remove-payable" data-id="'+esc(payable.id)+'">Remove entire entry</button>'+
   '</div>'+
   (state.paymentFor===payable.id&&payable.remaining?paymentForm(payable):'')+
   (state.historyFor===payable.id?history(payable):'')+removalForm(payable)+'</article>';
 }
 function page(){
  if(!isAdmin())return heading('Restricted','Cafeteria Payments','Administrator access required.');
  const rows=payableBalances(state.payables,state.payments);
  const original=rows.reduce((n,p)=>n+p.total_cents,0);
  const paid=rows.reduce((n,p)=>n+p.paid,0);
  const remaining=rows.reduce((n,p)=>n+p.remaining,0);
  const q=state.search.toLocaleLowerCase();
  const shown=rows.filter(p=>(state.filter==='all'||(state.filter==='outstanding'&&p.remaining>0)||(state.filter==='paid'&&p.remaining===0))&&(!q||(p.title+' '+p.payee).toLocaleLowerCase().includes(q)))
   .sort((a,b)=>Number(b.remaining>0)-Number(a.remaining>0)||b.created_at.localeCompare(a.created_at));
  return heading('Administration','Cafeteria Payments','Track obligations to suppliers and other payees, including partial and full settlements.',
    '<button type="button" class="btn btn-primary" data-action="cpay-toggle-create">'+icon('plus')+' New Payment</button>')+
   '<div class="cpay-summary"><div class="summary-card"><span class="label">Total owed</span><div class="metric num">'+esc(amount(original))+'</div></div>'+
   '<div class="summary-card"><span class="label">Total paid</span><div class="metric num">'+esc(amount(paid))+'</div></div>'+
   '<div class="summary-card"><span class="label">Outstanding</span><div class="metric num">'+esc(amount(remaining))+'</div></div></div>'+

   (state.showCreate?newPayableForm():'')+
   '<div class="cpay-toolbar"><label>Search<input id="cpay-search" class="form-input" type="search" placeholder="Payment or payee" value="'+esc(state.search)+'"></label>'+
   '<label>Show<select id="cpay-filter" class="form-input"><option value="outstanding"'+(state.filter==='outstanding'?' selected':'')+'>Outstanding</option><option value="all"'+(state.filter==='all'?' selected':'')+'>All payments</option><option value="paid"'+(state.filter==='paid'?' selected':'')+'>Paid in full</option></select></label></div>'+
   (state.error?'<p class="cpay-error" role="alert">'+esc(state.error)+'</p>':'')+
   (!state.loaded?'<div class="panel cpay-empty">'+(state.loading?'Loading payments…':'Unable to load payments. Use Refresh to try again.')+'</div>':
    shown.length?'<div class="cpay-list">'+shown.map(card).join('')+'</div>':'<div class="panel cpay-empty">No matching payment obligations.</div>');
 }
 function action(target){
  if(!isAdmin())throw Error('Only administrators can access Cafeteria Payments.');
  const kind=target.dataset.cpayAction,payableId=target.dataset.id;
  if(!kind)return false;
  if(kind==='toggle-create'){state.showCreate=!state.showCreate;if(state.showCreate)state.createId=id();}
  else if(kind==='cancel-create'){state.showCreate=false;}
  else if(kind==='cancel-payment'){state.paymentFor=null;state.paymentId=null;}
  else if(kind==='cancel-remove'){state.removeTarget=null;}
  else if(kind==='remove-payable'||kind==='remove-payment'){
   const isPayment=kind==='remove-payment';
   const payment=isPayment?state.payments.find(row=>row.id===payableId&&!row.voided_at):null;
   const payable=state.payables.find(row=>row.id===(isPayment?payment?.payable_id:payableId)&&!row.voided_at);
   if(!payable||(isPayment&&!payment))throw Error('Payment entry was already removed or is missing.');
   state.removeTarget={kind:isPayment?'payment':'payable',id:payableId,payableId:payable.id};
   state.paymentFor=null;state.paymentId=null;
   if(isPayment)state.historyFor=payable.id;
  }
  else if(kind==='history'){
   if(!state.payables.some(p=>p.id===payableId))throw Error('Payment not found.');
   state.historyFor=state.historyFor===payableId?null:payableId;
  }else if(kind==='pay'||kind==='full'){
   const payable=payableBalances(state.payables,state.payments).find(p=>p.id===payableId);
   if(!payable||!payable.remaining)throw Error('This payment has no remaining balance.');
   state.paymentFor=payableId;state.paymentId=id();state.payFull=kind==='full';
  }else return false;
  rerender();return true;
 }
 function setFilter(value){if(['all','outstanding','paid'].includes(value)){state.filter=value;rerender();}}
 function setSearch(value){state.search=String(value??'').slice(0,150);}
 async function submit(form){
  if(!isAdmin())throw Error('Only administrators can record Cafeteria Payments.');
  if(state.busy)throw Error('A payment is already being saved.');
  state.busy=true;
  try{
   const data=Object.fromEntries(new FormData(form));
   if(form.dataset.cpaySave==='create'){
    if(!state.showCreate||!state.createId)throw Error('Reopen the new payment form.');
    const title=clean(data.title,150,'Payment name'),payee=clean(data.payee,150,'Recipient');
    const total_cents=paymentCents(data.total);
    await api.insert('cafeteria_payables',{id:state.createId,title,payee,total_cents});
    state.showCreate=false;state.createId=null;state.filter='all';
    toast('Payment obligation saved.');
   }else if(form.dataset.cpaySave==='payment'){
    const payable=payableBalances(state.payables,state.payments).find(p=>p.id===form.dataset.id);
    if(!payable||state.paymentFor!==payable.id||!state.paymentId)throw Error('Reopen this payment.');
    const cents=paymentCents(data.paid_amount);
    if(cents>payable.remaining)throw Error('Payment exceeds the remaining balance.');
    const paidOn=String(data.paid_on||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(paidOn)||paidOn>today())throw Error('Enter a valid payment date (today or earlier).');
    const notes=String(data.notes??'').trim();
    if(notes.length>500)throw Error('Notes are too long.');
    await api.rpc('cafeteria_record_payable_payment',{p_id:state.paymentId,p_payable_id:payable.id,p_amount_cents:cents,p_paid_on:paidOn,p_notes:notes});
    state.paymentFor=null;state.paymentId=null;
    state.historyFor=payable.id;
    toast('Payment recorded.');
   }else if(form.dataset.cpaySave==='remove'){
    const kind=form.dataset.kind,entryId=form.dataset.id;
    const selected=state.removeTarget;
    if(!selected||selected.id!==entryId||selected.kind!==kind)throw Error('Reopen the removal confirmation.');
    const reason=clean(data.reason,500,'Reason');
    if(reason.length<3)throw Error('Enter a reason with at least 3 characters.');
    await api.rpc('cafeteria_void_payable_entry',{p_kind:kind,p_id:entryId,p_reason:reason});
    state.removeTarget=null;
    if(kind==='payable'){
     if(state.paymentFor===entryId){state.paymentFor=null;state.paymentId=null;}
     if(state.historyFor===entryId)state.historyFor=null;
    }
    toast(kind==='payment'?'Payment removed; balance updated.':'Obligation removed.');
   }else throw Error('Invalid payment form.');
   await load();
  }finally{state.busy=false;}
 }
 return {page,load,action,submit,setFilter,setSearch,reset,getState:()=>state};
}
