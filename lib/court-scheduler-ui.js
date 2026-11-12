// Staff-only Padel court planner. Future reservations are NOT cashbook receipts.
// Existing financial bookings keep their original IDs, prices and paid-player markers.
import {courtPriceCents} from './court-bookings.js';
import {courtAllocation,courtSplitAmountText} from './court-payment-splits.js';
import {sportInfo,COURT_SPORTS,normalizedCourt,calendarOccupancy} from './club-court-sports.js';
import {padelCourtTimeGrid,COURT_GRID_COURTS,COURT_GRID_HOURS,COURT_GRID_HOUR_HEIGHT,
 COURT_GRID_START_MINUTES,COURT_GRID_END_MINUTES} from './court-timetable.js';

const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
const timeMinute=value=>{
 const s=String(value??'').slice(0,5);
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))return null;
 const minute=Number(s.slice(0,2))*60+Number(s.slice(3));
 return minute<=60?minute+1440:minute;
};
const clock=minute=>String(Math.floor(minute/60)%24).padStart(2,'0')+':'+String(minute%60).padStart(2,'0');
const snap=(minute,duration=60)=>Math.min(COURT_GRID_END_MINUTES-duration,
 Math.max(COURT_GRID_START_MINUTES,Math.round(minute/30)*30));
const durationOf=row=>{
 if(row.duration_minutes)return Number(row.duration_minutes);
 const a=timeMinute(row.booking_start_time),b=timeMinute(row.booking_end_time);
 if(a===null||b===null)return 60;
 let result=b-a;
 if(result<=0)result+=1440;
 return result;
};
const durationChoices=[30,60,90,120,150,180,240,300,360,480,600,720];
export function courtSchedulerMove(start,duration,deltaPixels){
 const value=timeMinute(start);
 if(value===null)return null;
 return clock(snap(value+deltaPixels*60/COURT_GRID_HOUR_HEIGHT,duration));
}

export function createCourtScheduler({api,today,addDays,rerender,toast,onLedgerChanged,onLedgerPaymentEdit=async()=>{}}){
 let businessDate=today(),sport='padel',reservations=[],ledgerRows=[],paymentSplits=[],closingStatus='open',
  loadedDate='',loading=false,error='',requestNumber=0,editor=null,writing=false,drag=null,skipClickUntil=0;
 const maxDate=()=>addDays(today(),365);
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2025-01-01'&&s<=maxDate();
 const active=()=>api.getSession()?.access_token;
 const storeEmptySplits=()=>[];
 const find=id=>reservations.find(row=>row.id===id&&row.status!=='cancelled');
 const findLedger=id=>ledgerRows.find(row=>row.id===id&&row.category===sportInfo(sport).category&&!row.voided_at);
 const findSplit=(kind,id)=>paymentSplits.find(p=>p.source_kind===kind&&p.source_id===id)||null;
 const getSuggestedPrice=(start,duration)=>{
  try{return courtPriceCents(sportInfo(sport).category,start,clock(timeMinute(start)+duration))||0;}
  catch{return 0;}
 };
 const paymentText=cents=>courtSplitAmountText(cents);
 const moneyCents=raw=>{
  const value=String(raw??'').trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))throw Error('Enter valid USD amounts with up to two decimal places.');
  const cents=Math.round(Number(value)*100);
  if(!Number.isSafeInteger(cents)||cents>100000000000)throw Error('Payment amount is out of range');
  return cents;
 };
 function reset(){
  requestNumber++;businessDate=today();sport='padel';reservations=[];ledgerRows=[];paymentSplits=[];closingStatus='open';
  loadedDate='';loading=false;error='';editor=null;writing=false;drag=null;
 }
 function setDate(value,{loadNow=false}={}){
  if(!validDate(value))throw Error('Select a valid reservation date within the next year.');
  if(value!==businessDate){
   businessDate=value;loadedDate='';error='';editor=null;requestNumber++;
   rerender();
  }
  if(loadNow)void load(true);
 }
 async function load(force=false){
  if(!active())return;
  if(loadedDate===businessDate&&!force)return;
  const day=businessDate,seq=++requestNumber;
  const soft=force&&loadedDate===day;
  loading=true;error='';if(!soft)rerender();
  try{
   const historical=day<=today();
   const [planned,finance,closings]=await Promise.all([
    api.listAll('padel_court_reservations','business_date=eq.'+day+'&order=booking_start_time.asc'),
    historical?api.listAll('cafeteria_finance_entries','entry_date=eq.'+day):Promise.resolve([]),
    historical?api.listAll('cafeteria_day_closings','day_date=eq.'+day):Promise.resolve([])
   ]);
   if(seq!==requestNumber||day!==businessDate||!active())return;
   const ids=[...planned.map(p=>p.id),...finance.filter(f=>Object.values(COURT_SPORTS).some(info=>info.category===f.category)&&!f.voided_at).map(p=>p.id)];
   const paymentRows=ids.length?await api.listAll('court_payment_splits','source_id=in.('+ids.join(',')+')'):storeEmptySplits();
   if(seq!==requestNumber||day!==businessDate||!active())return;
   reservations=planned;ledgerRows=finance;paymentSplits=paymentRows.filter(split=>!split.voided_at);
   closingStatus=closings[0]?.status||'open';
   loadedDate=day;
  }catch(e){
   if(seq===requestNumber){error=e.message||'Could not read reservations';loadedDate='';}
  }finally{
   if(seq===requestNumber){loading=false;if(!soft||!patchMountedBookings())rerender();}
  }
 }
 const ledgerEditable=()=>businessDate<=today()&&!['closed','approved'].includes(closingStatus);
 function projectedGrid(){
  const info=sportInfo(sport);
  const financial=ledgerRows.filter(row=>row.category===info.category&&!row.voided_at)
   .map(row=>({...row,source:'ledger',court_number:normalizedCourt(row,sport)}));
  const upcoming=reservations.filter(row=>row.status!=='cancelled'&&(row.sport||'padel')===sport).map(row=>({
   id:row.id,category:info.category,court_number:row.court_number,booking_type:row.booking_type||'reservation',
   booking_start_time:row.booking_start_time,booking_end_time:row.booking_end_time,
   name:row.customer_name,notes:row.notes,source:'reservation',
   reservationStatus:row.status,revision:row.revision,duration_minutes:row.duration_minutes
  }));
  return padelCourtTimeGrid([...financial,...upcoming],sport);
 }
 function openEditor(kind,id=null,court=null,start='18:00'){
  court=court||sportInfo(sport).courts[0];
  if(!loadedDate||loading)throw Error('Load the schedule first.');
  if(kind==='reservation'){
   const row=id?find(id):null;
   if(id&&!row)throw Error('Reservation not found. Reload the date.');
   const duration=row?.duration_minutes||60,initialStart=row?.booking_start_time?.slice(0,5)||start;
   const split=row?findSplit('reservation',row.id):null;
   const bookingType=row?.booking_type||'reservation';
   const fee=bookingType==='block'?0:Number(split?.amount_cents??getSuggestedPrice(initialStart,duration));
   editor={kind,id:id||null,sport,court:row?.court_number||court,bookingType,start:initialStart,
    duration,name:row?.customer_name||'',status:row?.status||'confirmed',
    notes:row?.notes||'',revision:row?.revision||null,splitRevision:split?.revision||null,
    fee,cash:Number(split?.cash_cents||0),whish:Number(split?.whish_cents||0),
    unpaid:Number(split?.unpaid_cents??fee)};
  }else if(kind==='ledger'){
   const row=findLedger(id);
   if(!row)throw Error('Recorded booking is no longer available.');
   editor={kind,id,sport,court:normalizedCourt(row,sport),bookingType:'ledger',start:row.booking_start_time?.slice(0,5)||'',
    duration:durationOf(row),name:row.name,status:'recorded',notes:row.court_notes||'',revision:null};
  }else throw Error('Unknown booking type.');
  rerender();
 }
 function editorHTML(){
  if(!editor)return '';
  const isLedger=editor.kind==='ledger';
  const readOnly=isLedger&&!ledgerEditable();
  const options=(items,current)=>items.map(x=>'<option value="'+escapeHtml(x)+'"'+(String(current)===String(x)?' selected':'')+'>'+escapeHtml(x)+'</option>').join('');
  const durationOptions=durationChoices.includes(editor.duration)?durationChoices:
   [...durationChoices,editor.duration].sort((a,b)=>a-b);
  const times=Array.from({length:32},(_,i)=>clock(COURT_GRID_START_MINUTES+i*30));
  const start=times.includes(editor.start)?times:[editor.start,...times];
  const dur=timeMinute(editor.start)===null?60:editor.duration;
  const end=timeMinute(editor.start)===null?'—':clock(timeMinute(editor.start)+dur);
  return '<div class="cafe-scheduler-overlay" role="presentation">'+
   '<div class="cafe-scheduler-backdrop" data-action="cafe-schedule-close"></div>'+
   '<section class="cafe-scheduler-dialog" role="dialog" aria-modal="true" aria-label="'+
    (isLedger?'Change recorded booking':'Court reservation')+'">'+
    '<div class="cafe-scheduler-dialog-head"><div><h3>'+
    (isLedger?'Move recorded booking':editor.id?'Edit reservation':'New reservation')+
    '</h3><p>'+escapeHtml(businessDate)+' · '+(isLedger?'Cashbook entry':'Scheduling plus Cash/Whish receipts')+
    '</p></div><button type="button" class="btn btn-light btn-icon" data-action="cafe-schedule-close" aria-label="Close">×</button></div>'+
    (readOnly?'<p class="cafe-scheduler-warning">This financial day is closed or approved. An administrator must reopen it before editing the recorded booking.</p>':'')+
    (isLedger?'<button type="button" class="btn btn-light cafe-scheduler-payment-link" data-action="cafe-schedule-payment-editor"'+
      (readOnly?' disabled':'')+'>Edit Cash / Whish payment breakdown</button>':'')+
    '<form data-cafe-save="schedule-reservation" class="cafe-scheduler-form">'+
     '<label>Customer / booking name<input name="customer_name" maxlength="120" minlength="2" required value="'+escapeHtml(editor.name)+'"'+(isLedger?' readonly':'')+'></label>'+
     '<div class="cafe-scheduler-two"><label>Court<select name="court_number"'+(readOnly?' disabled':'')+'>'+
      options(COURT_GRID_COURTS,editor.court)+'</select></label>'+
     '<label>Start time<select name="start_time"'+(readOnly?' disabled':'')+'>'+
      options(start,editor.start)+'</select></label></div>'+
     '<label>Duration<select name="duration_minutes"'+(isLedger?' disabled':'')+'>'+
      durationOptions.map(n=>'<option value="'+n+'"'+(n===editor.duration?' selected':'')+'>'+n+' min</option>').join('')+
     '</select></label><p class="cafe-scheduler-end-note">End time: '+escapeHtml(end)+(timeMinute(editor.start)+dur>1440?' (next day)':'')+'</p>'+
     (isLedger?'<p class="cafe-scheduler-warning">Moving this recorded booking updates its court and time only. Payments, price and date will not change.</p>':
       '<label>Reservation status<select name="status">'+
       '<option value="confirmed"'+(editor.status==='confirmed'?' selected':'')+'>Confirmed</option>'+
       '<option value="tentative"'+(editor.status==='tentative'?' selected':'')+'>Tentative</option>'+
       (editor.id?'<option value="cancelled">Cancelled</option>':'')+
       '</select></label>'+
       '<label>Notes<textarea name="notes" rows="2" maxlength="500">'+escapeHtml(editor.notes)+'</textarea></label>'+
       '<fieldset class="cafe-scheduler-payment-fieldset"><legend>Payment breakdown</legend>'+
       '<p>Price = Cash + Whish + Unpaid. Actual collections are posted on the day payment is recorded.</p>'+
       '<div class="cafe-scheduler-payment-grid">'+
       [
        ['total_amount','Court price ($)',editor.fee],
        ['cash_amount','Cash received ($)',editor.cash],
        ['whish_amount','Whish received ($)',editor.whish],
        ['unpaid_amount','Still unpaid ($)',editor.unpaid]
       ].map(([key,label,value])=>'<label>'+label+'<input type="number" name="'+key+'" step="0.01" min="0" max="1000000000" required value="'+paymentText(value)+'"></label>').join('')+
       '</div><small data-court-payment-preview>Whish payments automatically go into Whish → Padel Courts.</small>'+
       '</fieldset>')+
     '<div class="cafe-scheduler-actions"><button type="button" class="btn btn-light" data-action="cafe-schedule-close">Cancel</button>'+
     (readOnly?'':'<button class="btn btn-primary" type="submit"'+(writing?' disabled':'')+'>'+
      (writing?'Saving…':isLedger?'Save new position':'Save reservation')+'</button>')+
     '</div></form></section></div>';
 }
 function page(){
  const selected=businessDate;
  const header='<div class="cafe-scheduler-toolbar"><div><strong>Reservations calendar</strong>'+
   '<small>Choose a date to plan ahead. This does not change the cashbook date.</small></div>'+
   '<div class="cafe-scheduler-date-controls">'+
    '<button type="button" data-action="cafe-schedule-prev" aria-label="Previous reservation day">‹</button>'+
    '<input id="cafe-schedule-date" aria-label="Reservation calendar date" type="date" value="'+escapeHtml(selected)+
    '" min="2025-01-01" max="'+maxDate()+'">'+
    '<button type="button" data-action="cafe-schedule-next" aria-label="Next reservation day"'+(selected>=maxDate()?' disabled':'')+'>›</button>'+
    '<button type="button" data-action="cafe-schedule-today">Today</button>'+
    '<button type="button" data-action="cafe-schedule-reload">Refresh</button>'+
    '<button type="button" class="btn btn-primary" data-action="cafe-schedule-create">+ Reservation</button>'+
   '</div></div>';
  if(loading||loadedDate!==selected||error)return header+
   '<p class="cafe-scheduler-notice">'+escapeHtml(error?'Could not load reservations: '+error:
    'Loading court reservations for '+selected+'…')+'</p>'+editorHTML();
  const grid=projectedGrid();
  const axis='<div class="cafe-timeboard-axis" aria-label="Hour labels">'+
   COURT_GRID_HOURS.map(hour=>'<span class="cafe-timeboard-hour" style="top:'+hour.topPx+'px">'+
     escapeHtml(hour.label)+'</span>').join('')+'</div>';
  const courtHeaders=grid.columns.map(lane=>'<div class="cafe-timeboard-court-head"><strong>'+lane.court+
   '</strong><small>'+lane.bookings.length+' booking'+(lane.bookings.length===1?'':'s')+'</small></div>').join('');
  const lanes=grid.columns.map(lane=>'<div class="cafe-timeboard-court cafe-scheduler-lane" data-action="cafe-schedule-new-at" data-court="'+lane.court+
   '" role="group" aria-label="Court '+lane.court+', click empty space to make reservation">'+
    lane.bookings.map(item=>{
     const planned=item.source==='reservation';
     const row=planned?find(item.id):findLedger(item.id);
     if(!row)return '';
     const label=planned?(item.reservationStatus==='tentative'?'Tentative reservation':'Confirmed reservation'):
       item.paymentState==='all'?'All players marked paid':item.paymentState==='some'?'Partially marked paid':item.paymentState==='none'?'None marked paid':'Payment markers unavailable';
     const split=findSplit(item.source,item.id);
    const moneyLabel=split?' · Cash '+paymentText(split.cash_cents)+' / Whish '+paymentText(split.whish_cents)+' / Unpaid '+paymentText(split.unpaid_cents):'';
    const color=planned?'schedule-'+item.reservationStatus:'status-'+item.paymentState;
     const size='top:'+item.topPx+'px;height:'+item.heightPx+'px;left:calc('+(item.track/item.tracks*100).toFixed(5)+
      '% + 3px);width:calc('+(100/item.tracks).toFixed(5)+'% - 6px)';
     return '<button type="button" class="cafe-timeboard-booking cafe-scheduler-event '+color+
      '" data-action="cafe-schedule-open" data-cafe-schedule-source="'+item.source+
      '" data-cafe-schedule-id="'+escapeHtml(item.id)+'" style="'+size+'"'+
      (item.source==='ledger'&&!ledgerEditable()?' data-schedule-locked="true"':'')+
      ' title="'+escapeHtml('Court '+lane.court+' · '+item.start+'–'+item.end+' · '+item.name+' · '+label+moneyLabel)+
      '"><span class="cafe-timeboard-booking-time">'+escapeHtml(item.start+'–'+item.end)+'</span>'+
      '<strong>'+escapeHtml(item.name)+'</strong><small>'+escapeHtml(planned?'RESERVATION · '+label:label)+'</small></button>';
    }).join('')+'</div>').join('');
  const unplaced=grid.unplaced.length?
   '<details class="cafe-scheduler-unplaced"><summary>Other saved entries ('+grid.unplaced.length+')</summary>'+
    grid.unplaced.map(item=>'<div>'+escapeHtml(item.court+' · '+item.name)+
     ' — '+escapeHtml(item.reason||'Time not available')+'</div>').join('')+'</details>':'';
  const legend='<div class="cafe-scheduler-legend"><span class="schedule-confirmed">Confirmed reservation</span>'+
    '<span class="schedule-tentative">Tentative reservation</span>'+
    '<span class="status-all">Finance booking — all marked paid</span>'+
    '<span class="status-some">Partially marked</span>'+
    '<span class="status-none">None marked</span></div>';
  return header+'<section class="cafe-timetable cafe-timetable-hours cafe-scheduler">'+
    '<div class="cafe-timetable-summary"><div><h3>Padel court schedule · 09:00–01:00</h3>'+
    '<p>'+grid.allCount+' saved booking'+(grid.allCount===1?'':'s')+' · '+escapeHtml(selected)+
    ' · after-midnight slots belong to this business date</p></div></div>'+
    '<p class="cafe-scheduler-hint">Click an empty slot to reserve it. Drag a booking to another court or time, or tap it to edit precisely. Movement snaps to 30 minutes.</p>'+
    '<div class="cafe-timeboard-scroll" data-preserve-scroll="court-reservation-scroll" tabindex="0" aria-label="Scroll the three court schedules sideways">'+
     '<div class="cafe-timeboard"><div class="cafe-timeboard-corner">TIME</div>'+courtHeaders+axis+lanes+'</div></div>'+
    legend+unplaced+'<p class="cafe-timeboard-disclaimer">Reservations are kept separate from court finance charges. Cash/Whish prepayments count on the collection date; do not enter the same receipt twice. Closed financial days cannot be moved.</p>'+
    '</section>'+editorHTML();
 }
 async function action(target,event){
  const act=target.dataset.action;
  if(act==='cafe-schedule-close'){editor=null;rerender();return true;}
  if(act==='cafe-schedule-payment-editor'){
   if(!editor||editor.kind!=='ledger'||!ledgerEditable())throw Error('Open an editable financial booking first.');
   const id=editor.id;editor=null;await onLedgerPaymentEdit(id);return true;
  }
  if(act==='cafe-schedule-today'){setDate(today(),{loadNow:true});return true;}
  if(act==='cafe-schedule-prev'){setDate(addDays(businessDate,-1),{loadNow:true});return true;}
  if(act==='cafe-schedule-next'){setDate(addDays(businessDate,1),{loadNow:true});return true;}
  if(act==='cafe-schedule-reload'){await load(true);return true;}
  if(act==='cafe-schedule-create'){openEditor('reservation');return true;}
  if(act==='cafe-schedule-open'){
   if(Date.now()<skipClickUntil)return true;
   const kind=target.dataset.cafeScheduleSource==='reservation'?'reservation':'ledger';
   openEditor(kind,target.dataset.cafeScheduleId);return true;
  }
  if(act==='cafe-schedule-new-at'){
   if(!event||!target.getBoundingClientRect)return true;
   const rect=target.getBoundingClientRect();
   const time=snap(COURT_GRID_START_MINUTES+(event.clientY-rect.top)*60/COURT_GRID_HOUR_HEIGHT,30);
   openEditor('reservation',null,target.dataset.court,clock(time));
   if(editor){editor.duration=time>=1470?30:60;editor.fee=getSuggestedPrice(clock(time),editor.duration);editor.unpaid=editor.fee;}
   rerender();return true;
  }
  return false;
 }
 async function change(target){
  if(target.id!=='cafe-schedule-date')return false;
  setDate(target.value,{loadNow:true});return true;
 }
 async function submit(form){
  if(!editor||writing)throw Error('No booking is being edited');
  const data=Object.fromEntries(new FormData(form).entries());
  const start=String(data.start_time||'').slice(0,5),duration=editor.kind==='ledger'?editor.duration:Number(data.duration_minutes);
  if(timeMinute(start)===null||timeMinute(start)+duration>COURT_GRID_END_MINUTES)throw Error('Booking extends beyond 1 AM');
  if(!COURT_GRID_COURTS.includes(data.court_number))throw Error('Select a valid court');
  writing=true;
  try{
   if(editor.kind==='ledger'){
    if(!ledgerEditable())throw Error('This financial day is closed. Ask an administrator to reopen it');
    const row=findLedger(editor.id);
    if(!row)throw Error('Financial booking no longer exists');
    await api.rpc('padel_ledger_reposition',{
     p_entry_id:row.id,p_court:data.court_number,p_start:start,
     p_expected_court:row.court_number,p_expected_start:row.booking_start_time?.slice(0,5)||null,
     p_expected_end:row.booking_end_time?.slice(0,5)||null,
     p_expected_amount_cents:Number(row.amount_cents)
    });
    editor=null;
    await Promise.all([load(true),onLedgerChanged()]);
    toast('Financial booking moved; amount and payment markers preserved.');
   }else{
    const row=editor.id?find(editor.id):null;
    if(editor.id&&!row)throw Error('Reservation changed elsewhere. Refresh first.');
    const total=moneyCents(data.total_amount);
    const cash=moneyCents(data.cash_amount);
    const whish=moneyCents(data.whish_amount);
    const unpaid=moneyCents(data.unpaid_amount);
    if(total>0)courtAllocation(total,cash,whish,unpaid);
    else if(cash!==0||whish!==0||unpaid!==0)throw Error('Cash + Whish + Unpaid must equal the court price.');
    const existing=editor.id?findSplit('reservation',editor.id):null;
    const updatePayments=!existing?total>0:
     total!==Number(existing.amount_cents)||cash!==Number(existing.cash_cents)||
     whish!==Number(existing.whish_cents)||unpaid!==Number(existing.unpaid_cents);
    if(existing&&total===0)throw Error('Cannot clear an allocated court price. Adjust the payment breakdown instead.');
    await api.rpc('padel_reservation_save_with_split',{
     p_id:editor.id||null,p_business_date:businessDate,
     p_court:data.court_number,p_start:start,p_duration:duration,
     p_customer:data.customer_name,p_notes:data.notes||'',p_status:data.status||'confirmed',
     p_expected_revision:row?.revision||null,
     p_payment_total_cents:total,p_cash_cents:cash,p_whish_cents:whish,p_unpaid_cents:unpaid,
     p_split_revision:existing?.revision||null,p_update_payments:updatePayments
    });
    editor=null;await load(true);
    toast('Reservation saved. Cash/Whish amounts stay in their separate accounts.');
   }
  }finally{writing=false;rerender();}
 }
 async function move(source,id,court,start){
  if(!COURT_GRID_COURTS.includes(court)||timeMinute(start)===null)throw Error('Invalid destination');
  if(source==='reservation'){
   const row=find(id);
   if(!row)throw Error('Reservation no longer exists');
   await api.rpc('padel_reservation_save',{
    p_id:row.id,p_business_date:businessDate,p_court:court,p_start:start,
    p_duration:Number(row.duration_minutes),p_customer:row.customer_name,
    p_notes:row.notes||'',p_status:row.status,p_expected_revision:Number(row.revision)
   });
   await load(true);
  }else{
   if(!ledgerEditable())throw Error('This financial day is closed');
   const row=findLedger(id);
   if(!row)throw Error('Recorded booking no longer exists');
   await api.rpc('padel_ledger_reposition',{
    p_entry_id:id,p_court:court,p_start:start,p_expected_court:row.court_number,
    p_expected_start:row.booking_start_time?.slice(0,5)||null,
    p_expected_end:row.booking_end_time?.slice(0,5)||null,
    p_expected_amount_cents:Number(row.amount_cents)
   });
   await Promise.all([load(true),onLedgerChanged()]);
  }
  toast('Booking moved to '+court+' at '+start+'.');
 }
 function previewEnd(target){
  const form=target.closest?.('form[data-cafe-save="schedule-reservation"]');
  if(!form)return false;
  if(['total_amount','cash_amount','whish_amount','unpaid_amount'].includes(target.name)){
   const form=target.closest?.('form[data-cafe-save="schedule-reservation"]');
   if(!form)return false;
   const field=name=>form.querySelector('[name="'+name+'"]');
   const note=form.querySelector('[data-court-payment-preview]');
   if(!field('total_amount'))return false;
   try{
    const total=moneyCents(field('total_amount').value);
    const cash=moneyCents(field('cash_amount').value);
    const whish=moneyCents(field('whish_amount').value);
    if(target.name!=='unpaid_amount')field('unpaid_amount').value=paymentText(Math.max(0,total-cash-whish));
    const unpaid=moneyCents(field('unpaid_amount').value);
    if(note)note.textContent=total===cash+whish+unpaid?
      'Balanced: Cash '+paymentText(cash)+' + Whish '+paymentText(whish)+' + Unpaid '+paymentText(unpaid)+' = '+paymentText(total)+'. Whish goes to Padel Courts.':
      'Cash + Whish + Unpaid must equal '+paymentText(total)+'.';
   }catch(e){if(note)note.textContent=e.message;}
   return true;
  }
  if(!['start_time','duration_minutes'].includes(target.name))return false;
  const start=form.querySelector('[name="start_time"]')?.value||'';
  const duration=editor?.kind==='ledger'?editor.duration:Number(form.querySelector('[name="duration_minutes"]')?.value||60);
  const minutes=timeMinute(start),label=form.querySelector('.cafe-scheduler-end-note');
  if(label)label.textContent=minutes===null||minutes+duration>COURT_GRID_END_MINUTES?
   'This booking does not fit before 1:00 AM. Choose an earlier time or shorter duration.':
   'End time: '+clock(minutes+duration)+(minutes+duration>1440?' (next day)':'');
  return true;
 }
 function closeEditor(){
  if(!editor)return false;
  editor=null;rerender();return true;
 }
 function pointerDown(e){
  if(!e.isPrimary||e.button!==0||editor||writing||loadedDate!==businessDate)return false;
  const target=e.target.closest?.('[data-cafe-schedule-id]');
  if(!target||!target.closest('.cafe-scheduler'))return false;
  const source=target.dataset.cafeScheduleSource,id=target.dataset.cafeScheduleId;
  const row=source==='reservation'?find(id):findLedger(id);
  if(!row||(source==='ledger'&&!ledgerEditable()))return false;
  drag={pointerId:e.pointerId,target,x:e.clientX,y:e.clientY,source,id,
   start:row.booking_start_time?.slice(0,5),court:row.court_number,
   duration:durationOf(row),moved:false};
  target.setPointerCapture?.(e.pointerId);
  return true;
 }
 function pointerMove(e){
  if(!drag||e.pointerId!==drag.pointerId)return false;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<9)return false;
  drag.moved=true;drag.target.classList.add('cafe-scheduler-dragging');
  drag.target.style.transform='translate('+dx+'px,'+dy+'px)';
  e.preventDefault();
  return true;
 }
 async function pointerUp(e){
  if(!drag||e.pointerId!==drag.pointerId)return false;
  const state=drag;drag=null;
  state.target.style.transform='';state.target.classList.remove('cafe-scheduler-dragging');
  if(!state.moved)return false;
  skipClickUntil=Date.now()+700;
  const lanes=Array.from(document.querySelectorAll('.cafe-scheduler .cafe-scheduler-lane'));
  const dest=lanes.find(node=>{const b=node.getBoundingClientRect();return e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;});
  if(!dest)return true;
  const court=dest.dataset.court;
  const start=courtSchedulerMove(state.start,state.duration,e.clientY-state.y);
  if(!start||(court===state.court&&start===state.start))return true;
  const approved=globalThis.confirm?.('Move '+state.court+' '+state.start+' to '+court+' '+start+'? The saved reservation will update.');
  if(!approved)return true;
  try{await move(state.source,state.id,court,start)}
  catch(error){toast(error.message||'Could not move booking',true);await load(true)}
  return true;
 }
 function cancelDrag(){if(drag){drag.target.style.transform='';drag.target.classList.remove('cafe-scheduler-dragging');drag=null;}}
 return {page,load,action,change,submit,reset,setDate,pointerDown,pointerMove,pointerUp,cancelDrag,
  getDate:()=>businessDate,isEditorOpen:()=>Boolean(editor),previewEnd,closeEditor};
}
