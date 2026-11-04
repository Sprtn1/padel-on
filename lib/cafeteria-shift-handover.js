// Shift Handover Cash Verification — audit-only snapshots, never day-closing cash.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function shiftCashCents(value){
 const raw=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a non-negative cash amount (up to two decimals).');
 const [whole,fraction='']=raw.split('.');
 const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<0||cents>100000000000)throw Error('Cash amount is out of range.');
 return cents;
}
export function shiftCashDifference(snapshot,counted){
 if(snapshot?.expected_cents===null||snapshot?.expected_cents===undefined)throw Error('Enter the opening cash to calculate the expected amount.');
 if(!Number.isSafeInteger(snapshot.expected_cents)||!Number.isSafeInteger(counted))throw Error('Cash counts are invalid.');
 return counted-snapshot.expected_cents;
}
const timeLabel=stamp=>{
 if(!stamp)return '—';
 const t=new Date(stamp);
 return Number.isFinite(t.getTime())?new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Beirut',hour:'2-digit',minute:'2-digit',hour12:true
 }).format(t):'—';
};
export function createCafeteriaShiftHandover({api,amount,today,staff,toast,rerender,isAdmin}){
 const blankDraft=()=>({incoming:'',opening:'',counted:'',notes:''});
 const state={date:null,history:[],staffDirectory:[],loaded:false,loading:false,error:'',
  formOpen:false,draft:blankDraft(),preview:null,recordId:null,voidId:null,busy:false};
 const active=()=>state.history.filter(x=>!x.voided_at).sort((a,b)=>
  String(b.created_at).localeCompare(String(a.created_at))||String(b.id).localeCompare(String(a.id)));
 const latest=()=>active()[0]||null;
 const currentId=()=>staff()?.id||null;
 const dateIsToday=day=>day===today();
 const userLabel=id=>id===currentId()?(staff()?.email||'Current employee'):
  (state.staffDirectory.find(u=>u.id===id)?.email||'Staff account');
 function reset(){
  Object.assign(state,{date:null,history:[],staffDirectory:[],loaded:false,loading:false,error:'',
   formOpen:false,draft:blankDraft(),preview:null,recordId:null,voidId:null,busy:false});
 }
 async function load(day,silent=false){
  if(!api.getSession()?.access_token)return;
  if(day!==state.date){
   state.date=day;state.loaded=false;state.preview=null;state.formOpen=false;
   state.voidId=null;state.draft=blankDraft();state.recordId=null;
  }
  if(state.loading)return;
  state.loading=true;
  try{
   const [checks,directory]=await Promise.all([
    api.listAll('cafeteria_shift_handovers','day_date=eq.'+day+'&order=created_at.desc'),
    api.rpc('cafeteria_handover_staff_directory')
   ]);
   if(day!==state.date||!api.getSession()?.access_token)return;
   state.history=checks;state.staffDirectory=directory;state.error='';state.loaded=true;
   if(state.draft.incoming&&!directory.some(user=>user.id===state.draft.incoming))state.draft.incoming='';
  }catch(error){
   if(day===state.date){state.error=error?.message||'Unable to load shift handovers.';if(!silent)state.loaded=false;}
  }finally{state.loading=false;if(!silent&&day===state.date&&api.getSession()?.access_token)rerender();}
 }
 const renderDifference=(snapshot,counted)=>{
  const expected=Number(snapshot.expected_cents),difference=shiftCashDifference(snapshot,counted);
  const tone=difference===0?'balanced':difference<0?'short':'extra';
  const status=difference===0?'Matches recorded cash movements':
   difference<0?'Cash below the recorded expectation':'Cash above the recorded expectation';
  return '<div class="shift-check-result shift-'+tone+'">'+
    '<h4>Cash check based on entered transactions</h4>'+
    '<div class="shift-breakdown"><div><span>Starting cash</span><strong>'+esc(amount(snapshot.opening_cash_cents))+'</strong></div>'+
    '<div><span>+ Recorded cash receipts</span><strong>'+esc(amount(snapshot.income_cents))+'</strong></div>'+
    '<div><span>− Recorded cash payments</span><strong>'+esc(amount(snapshot.expenses_cents))+'</strong></div>'+
    '<div><span>Expected cash from ledger</span><strong>'+esc(amount(expected))+'</strong></div>'+
    '<div><span>Cash physically counted</span><strong>'+esc(amount(counted))+'</strong></div>'+
    '<div class="shift-difference"><span>Difference</span><strong>'+(difference>0?'+':'')+esc(amount(difference))+'</strong></div></div>'+
    '<p>'+status+'. A difference can mean a missing transaction, unentered product sales, or a counting error.</p>'+
    '<small>Snapshot uses '+esc(snapshot.finance_count)+' cafeteria entries and '+esc(snapshot.private_count)+' cash Private Sessions entries.</small>'+
   '</div>';
 };
 function form(){
  if(!state.formOpen)return '';
  const prior=latest();
  const options=state.staffDirectory.map(entry=>'<option value="'+esc(entry.id)+'"'+(state.draft.incoming===entry.id?' selected':'')+'>'+esc(entry.email)+'</option>').join('');
  if(!options)return '<p class="shift-message">An additional active staff account is needed to receive a shift.</p>';
  const showOpening=!prior;
  const opening=showOpening?
   '<label>Cash at start of day ($)<input class="form-input" type="number" min="0" max="1000000000" step="0.01" name="opening_cash" value="'+esc(state.draft.opening)+'" placeholder="0.00" required></label>':
   '<div class="shift-prior">Starting from previous handover: <strong>'+esc(amount(prior.counted_cash_cents))+'</strong></div>';
  const checked=state.preview;
  const counted=checked?shiftCashCents(state.draft.counted):null;
  return '<form class="panel shift-handover-form" data-shift-save="record">'+
   '<h3>New shift handover</h3>'+
   '<p>Count the cash drawer and compare it with transactions entered since the day started or the previous handover.</p>'+
   '<div class="shift-form-grid">'+
    '<label>Outgoing employee<input class="form-input" type="text" value="'+esc(staff()?.email||'Current staff')+'" disabled></label>'+
    '<label>Incoming employee<select class="form-input" name="incoming" required><option value="">Select employee</option>'+options+'</select></label>'+
    opening+
    '<label>Actual cash counted ($)<input class="form-input" type="number" min="0" max="1000000000" step="0.01" name="counted_cash" value="'+esc(state.draft.counted)+'" placeholder="0.00" required></label>'+
    '<label class="shift-wide">Handover notes (optional)<textarea class="form-input" name="notes" maxlength="500" rows="2" placeholder="e.g. Review court booking entered late">'+esc(state.draft.notes)+'</textarea></label>'+
   '</div>'+
   (checked?renderDifference(checked,counted):'<p class="shift-message">Press <strong>Check cash</strong> to compare the physical count with recorded transactions.</p>')+
   '<div class="shift-actions"><button class="btn btn-soft" type="button" data-action="shift-check">Check cash</button>'+
    (checked?'<button class="btn btn-primary" type="submit">Save handover</button>':'')+
    '<button class="btn btn-light" type="button" data-action="shift-cancel">Cancel</button></div>'+
   '</form>';
 }
 function voidForm(record){
  return '<form class="shift-void-form" data-shift-save="void" data-id="'+esc(record.id)+'">'+
   '<label>Removal reason<input class="form-input" name="reason" maxlength="500" minlength="4" value="Incorrect cash check" required></label>'+
   '<button class="btn btn-danger btn-xs" type="submit">Confirm remove</button>'+
   '<button class="btn btn-light btn-xs" type="button" data-action="shift-cancel-void">Cancel</button></form>';
 }
 function history(){
  const entries=active(),current=currentId();
  const cards=entries.map((item,i)=>{
   const diff=Number(item.difference_cents),status=diff===0?'Matched':diff<0?'Below ledger':'Above ledger';
   const confirmed=item.accepted_at?'Confirmed':'Awaiting confirmation';
   const confirmButton=!item.accepted_at&&item.incoming_staff_id===current?
    '<button class="btn btn-soft btn-xs" type="button" data-action="shift-accept" data-id="'+esc(item.id)+'">Confirm received</button>':'';
   const voidButton=isAdmin()&&i===0?'<button class="btn btn-danger btn-xs" type="button" data-action="shift-void" data-id="'+esc(item.id)+'">Remove incorrect check</button>':'';
   return '<article class="shift-record"><div class="shift-record-heading"><strong>'+esc(timeLabel(item.created_at))+'</strong>'+
    '<span class="shift-status '+(item.accepted_at?'shift-confirmed':'shift-pending')+'">'+confirmed+'</span></div>'+
    '<p>'+esc(userLabel(item.outgoing_staff_id))+' → '+esc(userLabel(item.incoming_staff_id))+'</p>'+
    '<div class="shift-record-values"><span>Expected <b>'+esc(amount(item.expected_cash_cents))+'</b></span>'+
    '<span>Counted <b>'+esc(amount(item.counted_cash_cents))+'</b></span>'+
    '<span>'+status+' <b>'+(diff>0?'+':'')+esc(amount(diff))+'</b></span></div>'+
    (item.notes?'<small>'+esc(item.notes)+'</small>':'')+
    '<div class="shift-actions">'+confirmButton+voidButton+'</div>'+
    (state.voidId===item.id?voidForm(item):'')+'</article>';
  }).join('');
  const removed=isAdmin()?state.history.filter(x=>x.voided_at):[];
  return '<div class="shift-history"><h4>Today’s handover history ('+entries.length+')</h4>'+
   (cards||'<p class="shift-message">No handovers recorded for this date.</p>')+
   (removed.length?'<details class="shift-removed"><summary>Removed handovers ('+removed.length+')</summary>'+
    removed.map(row=>'<p>'+esc(timeLabel(row.created_at))+' · '+esc(amount(row.counted_cash_cents))+' · '+esc(row.void_reason||'Removed')+'</p>').join('')+'</details>':'')+
   '</div>';
 }
 function page(day,editable){
  if(!state.loaded||state.date!==day)return '<section class="panel shift-section"><h3>Shift Handover & Cash Check</h3>'+
   '<p class="shift-message">'+(state.error?esc(state.error):'Loading handover records…')+'</p></section>';
  const canStart=editable&&dateIsToday(day);
  return '<section class="panel shift-section"><div class="shift-head"><div><h3>Shift Handover & Cash Check</h3>'+
   '<p>Compare physical cash with the money recorded in the system, without closing the day.</p></div>'+
   (canStart?'<button type="button" class="btn btn-primary btn-xs" data-action="shift-new">New handover</button>':'')+
   '</div>'+
   '<p class="shift-disclaimer">This is a check against recorded cash activity, not an exact Goods Sold total. Nothing here changes end-of-day closing or Whish.</p>'+
   (state.error?'<div class="shift-error" role="alert">'+esc(state.error)+'</div>':'')+
   (canStart?form():'')+
   history()+
   '</section>';
 }
 function collect(form){
  const fields=Object.fromEntries(new FormData(form));
  return {
   incoming:String(fields.incoming||''),
   opening:String(fields.opening_cash??''),
   counted:String(fields.counted_cash??''),
   notes:String(fields.notes??'').trim().slice(0,500)
  };
 }
 function validate(draft){
  if(!state.staffDirectory.some(u=>u.id===draft.incoming))throw Error('Select an incoming employee.');
  if(!latest()&&draft.opening==='')throw Error('Enter the cash at the start of the day.');
  if(!latest())shiftCashCents(draft.opening);
  return shiftCashCents(draft.counted);
 }
 async function check(form){
  if(!state.formOpen||state.busy)throw Error('Open a new handover first.');
  const draft=collect(form),counted=validate(draft);
  state.busy=true;state.preview=null;
  try{
   const snapshot=await api.rpc('cafeteria_handover_snapshot',{
    p_day_date:state.date,p_opening_cash_cents:latest()?null:shiftCashCents(draft.opening)
   });
   if(snapshot.expected_cents===null)throw Error('Enter the starting cash for this shift.');
   state.draft=draft;state.preview=snapshot;state.previewCheckedCounted=counted;
   rerender();
  }finally{state.busy=false;}
 }
 async function action(target){
  const act=target.dataset.shiftAction,id=target.dataset.id;
  if(!act)return false;
  if(state.busy)throw Error('A handover operation is already in progress.');
  if(act==='new'){
   if(!dateIsToday(state.date))throw Error('Only today can receive new checks.');
   state.formOpen=true;state.preview=null;state.previewCheckedCounted=null;
   state.draft=blankDraft();state.recordId=crypto.randomUUID();state.voidId=null;
  }else if(act==='cancel'){
   state.formOpen=false;state.preview=null;state.recordId=null;state.draft=blankDraft();
  }else if(act==='check'){
   const form=target.closest?.('form[data-shift-save="record"]');
   if(!form)throw Error('Handover form not found.');
   await check(form);return true;
  }else if(act==='accept'){
   const row=active().find(x=>x.id===id);
   if(!row||row.incoming_staff_id!==currentId())throw Error('Only the receiving employee may confirm.');
   state.busy=true;
   try{await api.rpc('cafeteria_handover_accept',{p_id:id});await load(state.date);toast('Handover received and confirmed.');}
   finally{state.busy=false;}
   return true;
  }else if(act==='void'){
   if(!isAdmin()||latest()?.id!==id)throw Error('Only administrators can remove the latest check.');
   state.voidId=id;state.formOpen=false;
  }else if(act==='cancel-void'){state.voidId=null;}
  else return false;
  rerender();return true;
 }
 async function submit(form){
  if(state.busy)throw Error('A handover is already being saved.');
  const kind=form.dataset.shiftSave,id=form.dataset.id;
  if(kind==='record'){
   if(!state.formOpen||!state.preview||!state.recordId)throw Error('Check cash before saving.');
   const draft=collect(form),counted=validate(draft),preview=state.preview;
   const opening=latest()?null:shiftCashCents(draft.opening);
   if(counted!==state.previewCheckedCounted||draft.incoming!==state.draft.incoming||
    opening!==((preview.previous_id)?null:preview.opening_cash_cents))
    throw Error('Values changed. Press Check cash again before saving.');
   if(!dateIsToday(state.date))throw Error('Handover date expired. Refresh the page.');
   if(draft.notes.length>500)throw Error('Notes cannot exceed 500 characters.');
   state.busy=true;
   try{
    await api.rpc('cafeteria_handover_record',{
     p_id:state.recordId,p_day_date:state.date,p_incoming_staff_id:draft.incoming,
     p_opening_cash_cents:opening,p_counted_cash_cents:counted,
     p_checked_expected_cents:preview.expected_cents,
     p_checked_finance_count:preview.finance_count,
     p_checked_private_count:preview.private_count,
     p_checked_previous_id:preview.previous_id,p_notes:draft.notes
    });
    state.formOpen=false;state.preview=null;state.recordId=null;state.draft=blankDraft();
    await load(state.date);toast('Shift cash check saved; the day remains open.');
   }finally{state.busy=false;}
   return true;
  }
  if(kind==='void'){
   if(!isAdmin()||state.voidId!==id||latest()?.id!==id)throw Error('Only the latest check can be removed by an administrator.');
   const reason=String(new FormData(form).get('reason')||'').trim();
   if(reason.length<4||reason.length>500)throw Error('Enter a correction reason (4–500 characters).');
   state.busy=true;
   try{await api.rpc('cafeteria_handover_void',{p_id:id,p_reason:reason});state.voidId=null;await load(state.date);toast('Incorrect handover removed from active history.');}
   finally{state.busy=false;}
   return true;
  }
  throw Error('Unknown handover action.');
 }
 return {page,load,action,submit,reset,getState:()=>state};
}
