// Court planner: reservation payments use source-linked Cash/Whish receipts, while
// financial ledger entries retain their IDs and accounting. Never count both.
import {courtPriceCents,COURT_MAX_DURATION_MINUTES} from './court-bookings.js';
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
const durationChoices=[30,60,90,120,150,180,240,300,360,480,600,720,750,780,810,840,870,900,930,960];
// Read the existing court tariff table; no duplicated prices in the scheduler.
export function timetableCourtPriceCents(sport,start,duration,players=4,local=false){
 try{
  const minutes=timeMinute(start),span=Number(duration);
  if(minutes===null||!Number.isInteger(span)||span<1||span>COURT_MAX_DURATION_MINUTES||(!local&&minutes+span>COURT_GRID_END_MINUTES))return null;
  return courtPriceCents(sportInfo(sport).category,start,clock(minutes+span),players);
 }catch{return null;}
}
export function courtSchedulerMove(start,duration,deltaPixels){
 const value=timeMinute(start);
 if(value===null)return null;
 return clock(snap(value+deltaPixels*60/COURT_GRID_HOUR_HEIGHT,duration));
}


/* Presentation-only indicator. The schedule is a Beirut business day (09:00–01:00).
   00:00–00:59 belongs to the preceding date; past/future dates show no live line. */
export function courtCurrentTimeBeirut(selectedDate,shiftDate,instant=new Date()){
 const parts=new Intl.DateTimeFormat('en-GB',{
  timeZone:'Asia/Beirut',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(instant);
 const part=type=>parts.find(value=>value.type===type)?.value;
 const day=part('year')+'-'+part('month')+'-'+part('day');
 const hour=Number(part('hour')),minute=Number(part('minute'));
 if(!Number.isFinite(hour)||!Number.isFinite(minute))return null;
 const late=hour===0;
 if(!(hour>=9||late))return null;
 const businessDate=late?shiftDate(day,-1):day;
 if(businessDate!==selectedDate)return null;
 const absolute=late?1440+minute:hour*60+minute;
 return {topPx:Math.round((absolute-COURT_GRID_START_MINUTES)*COURT_GRID_HOUR_HEIGHT/60),
  label:String(hour).padStart(2,'0')+':'+String(minute).padStart(2,'0')};
}
const sportIconPaths={
 padel:'<rect x="6.5" y="2.5" width="11" height="14" rx="5.5" transform="rotate(32 12 9.5)"/><path d="m7.5 17.5-3 4"/><path d="M9 6.5h.01M13 8h.01M10 11h.01M14 12h.01" stroke-width="2.6" stroke-linecap="round"/>',
 pickleball:'<circle cx="12" cy="12" r="9"/><circle cx="9" cy="7.5" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="11" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="6.5" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="16.5" r="1" fill="currentColor" stroke="none"/>',
 basketball:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3v18M5.5 6c6.5 4 6.5 8 0 12M18.5 6c-6.5 4-6.5 8 0 12"/>'
};
const sportTabIcon=key=>'<svg class="ck-sport-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(sportIconPaths[key]||'')+'</svg>';


/* Display-only slot selection. Both edges snap to the existing 30-minute grid. */
export function courtSchedulerSelection(anchorMinute,focusMinute,extended=false){
 const slot=raw=>Math.max(COURT_GRID_START_MINUTES,Math.min(COURT_GRID_END_MINUTES-30,
  Math.floor(Number(raw)/30)*30));
 const anchor=slot(anchorMinute),focus=slot(focusMinute);
 let startMinute=Math.min(anchor,focus),endMinute=extended?Math.max(anchor,focus)+30:
  Math.min(COURT_GRID_END_MINUTES,startMinute+60);
 // Allow dragging across the full 09:00–01:00 operating window (960 min).
 // Retain a duration guard for any future grid range changes.
 if(endMinute-startMinute>COURT_MAX_DURATION_MINUTES){
  if(focus<anchor)startMinute=endMinute-COURT_MAX_DURATION_MINUTES;
  else endMinute=startMinute+COURT_MAX_DURATION_MINUTES;
 }
 return {startMinute,endMinute,durationMinutes:endMinute-startMinute,
  topPx:Math.round((startMinute-COURT_GRID_START_MINUTES)*COURT_GRID_HOUR_HEIGHT/60),
  heightPx:Math.round((endMinute-startMinute)*COURT_GRID_HOUR_HEIGHT/60)};
}
// Match either part of a client's name or their visible Private Sessions ID.
export function filterPrivateTrainingClients(clients,query=''){
 const normalize=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f\u064b-\u065f]/g,'').toLocaleLowerCase().trim();
 const terms=normalize(query).split(/\s+/).filter(Boolean);
 if(!terms.length)return clients;
 return clients.filter(client=>{
  const searchable=normalize([client.name,client.client_code,client.id].join(' '));
  return terms.every(term=>searchable.includes(term));
 });
}
// Paid means every visible player checkbox is explicitly ticked, not an allocation total.
export function courtBookingAllPlayersMarked(row,sport='padel',{ledger=false}={}){
 const marks=row?.checkmarks;
 if(!Array.isArray(marks))return false;
 const players=sport==='basketball'?6:sport==='pickleball'?
  (Number(row.pickleball_player_count)===2||(ledger&&row.pickleball_player_count==null&&marks.length===2)?2:4):4;
 return marks.length>=players&&Array.from({length:players},(_,index)=>marks[index]===true).every(Boolean);
}
export function createCourtScheduler({api,today,addDays,rerender,toast,onLedgerChanged,onReservationChanged=async()=>{},onLedgerPaymentEdit=async()=>{}}){
 let businessDate=today(),sport='padel',reservations=[],ledgerRows=[],paymentSplits=[],closingStatus='open',
  matchpointPrimaryActive=false,
  loadedDate='',loading=false,error='',requestNumber=0,editor=null,writing=false,drag=null,skipClickUntil=0,
  trainingOptions=null,trainingOptionsPromise=null,matchmakers=null,matchmakersPromise=null,details=null,mobileCourt='C1',hoverSlot=null,slotSelection=null;
 const maxDate=()=>addDays(today(),365);
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&s>='2025-01-01'&&s<=maxDate();
 const active=()=>api.getSession()?.access_token;
 const storeEmptySplits=()=>[];
 const find=id=>reservations.find(row=>row.id===id&&row.status!=='cancelled');
 const findLedger=id=>ledgerRows.find(row=>row.id===id&&row.category===sportInfo(sport).category&&!row.voided_at);
 const findSplit=(kind,id)=>paymentSplits.find(p=>p.source_kind===kind&&p.source_id===id)||null;
 const getSuggestedPrice=(start,duration,players=4)=>timetableCourtPriceCents(sport,start,duration,players)??0;
 const paymentText=cents=>courtSplitAmountText(cents);
 async function ensureTrainingOptions(){
  if(trainingOptions)return trainingOptions;
  if(!trainingOptionsPromise)trainingOptionsPromise=Promise.all([
   api.listAll('private_clients'),api.listAll('private_coaches')
  ]).then(([clients,coaches])=>{
   trainingOptions={
    clients:clients.filter(c=>c.active&&!c.deleted_at).sort((a,b)=>a.name.localeCompare(b.name)),
    coaches:coaches.filter(c=>c.active).sort((a,b)=>a.name.localeCompare(b.name))
   };
   return trainingOptions;
  }).finally(()=>{trainingOptionsPromise=null});
  return trainingOptionsPromise;
 }
 function privateClientOptions(query=''){
  const clients=filterPrivateTrainingClients(trainingOptions?.clients||[],query);
  return '<option value="">'+(trainingOptions&&query.trim()&&!clients.length?'No matching private clients':'Select existing private client')+'</option>'+
   clients.map(c=>
    '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name+(c.client_code?' · '+c.client_code:''))+'</option>').join('');
 }
 function updatePrivateClientSearch(form,preserveSelection=false){
  const search=form?.querySelector('[name="private_client_search"]');
  const select=form?.querySelector('[name="private_client_id"]');
  if(!search||!select)return false;
  const previous=preserveSelection?(select.value||editor?.privateClientId||''):'';
  select.innerHTML=privateClientOptions(search.value);
  select.value=previous;
  const status=form.querySelector('[data-cafe-private-client-results]');
  if(status){
   const count=filterPrivateTrainingClients(trainingOptions?.clients||[],search.value).length;
   status.textContent=!trainingOptions?'Loading private clients…':
    !count?'No matching clients. Try another name or ID.':
    count+' client'+(count===1?'':'s')+' available';
  }
  return true;
 }
 function privateCoachOptions(){
  return '<option value="">Assign coach later</option>'+
   (trainingOptions?.coaches||[]).map(c=>
    '<option value="'+escapeHtml(c.id)+'">'+escapeHtml(c.name+' · '+c.category)+'</option>').join('');
 }
 function hydrateTrainingOptions(){
  if(typeof document==='undefined'||!editor||editor.kind!=='reservation')return;
  const root=document.querySelector('.cafe-scheduler-dialog');
  if(!root)return;
  updatePrivateClientSearch(root.querySelector('form'),true);
  const select=root.querySelector('[name="private_coach_id"]');
  if(select){
   const previous=select.value||editor.privateCoachId||'';
   select.innerHTML=privateCoachOptions();select.value=previous;
  }
 }
 function requestTrainingOptions(){
  void ensureTrainingOptions().then(()=>hydrateTrainingOptions()).catch(error=>toast(error.message||'Unable to load private clients',true));
 }
 async function ensureMatchmakers(){
  if(matchmakers)return matchmakers;
  if(!matchmakersPromise)matchmakersPromise=api.listAll('matchmakers').then(rows=>{
   matchmakers=rows.filter(row=>row.active).sort((a,b)=>a.name.localeCompare(b.name));
   if(editor?.kind==='reservation'&&sport==='padel')rerender();
   else if(isGridMounted())patchMountedBookings();
   return matchmakers;
  }).finally(()=>{matchmakersPromise=null});
  return matchmakersPromise;
 }
 function requestMatchmakers(){
  void ensureMatchmakers().catch(error=>toast(error.message||'Unable to load matchmakers',true));
 }
 const matchmakerName=id=>matchmakers?.find(person=>person.id===id)?.name||'Assigned matchmaker';
 function matchmakerOptions(selected){
  return '<option value="">'+(matchmakers?'Select matchmaker':'Loading matchmakers…')+'</option>'+
   (matchmakers||[]).map(person=>'<option value="'+escapeHtml(person.id)+'"'+
    (person.id===selected?' selected':'')+'>'+escapeHtml(person.name)+'</option>').join('');
 }
 const moneyCents=raw=>{
  const value=String(raw??'').trim();
  if(!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value))throw Error('Enter valid USD amounts with up to two decimal places.');
  const cents=Math.round(Number(value)*100);
  if(!Number.isSafeInteger(cents)||cents>100000000000)throw Error('Payment amount is out of range');
  return cents;
 };
 function reset(){
  cancelDrag();requestNumber++;businessDate=today();sport='padel';reservations=[];ledgerRows=[];paymentSplits=[];closingStatus='open';
  loadedDate='';loading=false;error='';editor=null;details=null;mobileCourt='C1';writing=false;drag=null;trainingOptions=null;trainingOptionsPromise=null;matchmakers=null;matchmakersPromise=null;
 }
 function setDate(value,{loadNow=false}={}){
  if(!validDate(value))throw Error('Select a valid reservation date within the next year.');
  if(value!==businessDate){
   cancelDrag();businessDate=value;loadedDate='';error='';editor=null;details=null;requestNumber++;
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
  else if(typeof document!=='undefined'){
   const status=document.querySelector('.cafe-scheduler[data-schedule-date="'+day+'"] [data-cafe-schedule-sync]');
   if(status)status.textContent='Syncing…';
  }
  try{
   const historical=day<=today();
   const [planned,finance,closings,matchpointStatus]=await Promise.all([
    api.listAll('padel_court_reservations','business_date=eq.'+day+'&order=booking_start_time.asc'),
    historical?api.listAll('cafeteria_finance_entries','entry_date=eq.'+day):Promise.resolve([]),
    historical?api.listAll('cafeteria_day_closings','day_date=eq.'+day):Promise.resolve([]),
    api.listAll('matchpoint_sync_status').catch(()=>[])
   ]);
   if(seq!==requestNumber||day!==businessDate||!active())return;
   const ids=[...planned.map(p=>p.id),...finance.filter(f=>Object.values(COURT_SPORTS).some(info=>info.category===f.category)&&!f.voided_at).map(p=>p.id)];
   const paymentRows=ids.length?await api.listAll('court_payment_splits','source_id=in.('+ids.join(',')+')'):storeEmptySplits();
   if(seq!==requestNumber||day!==businessDate||!active())return;
   reservations=planned;ledgerRows=finance;paymentSplits=paymentRows.filter(split=>!split.voided_at);
   if(sport==='padel'&&planned.some(row=>row.matchmaker_id)&&!matchmakers)requestMatchmakers();
   closingStatus=closings[0]?.status||'open';
   matchpointPrimaryActive=Boolean(matchpointStatus[0]?.last_bookings_at);
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
  const upcoming=reservations.filter(row=>row.status!=='cancelled'&&(row.sport||'padel')===sport)
   .filter(row=>{
    if(row.external_source||row.private_client_id||row.booking_type!=='reservation')return true;
    const start=timeMinute(row.booking_start_time);
    return start===null||!(start>=COURT_GRID_END_MINUTES||start+durationOf(row)<=COURT_GRID_START_MINUTES);
   }).map(row=>({
   id:row.id,category:info.category,court_number:row.court_number,booking_type:row.private_client_id?'private_training':row.booking_type||'reservation',
   booking_start_time:row.booking_start_time,booking_end_time:row.booking_end_time,
   name:row.customer_name,notes:row.notes,source:'reservation',
   reservationStatus:row.status,revision:row.revision,duration_minutes:row.duration_minutes,
   privateSessionFeeCents:Number(row.private_session_fee_cents||0)
  }));
  return padelCourtTimeGrid([...financial,...upcoming],sport);
 }
 function openEditor(kind,id=null,court=null,start='18:00',selectedDuration=null,requestedType=null){
  if(kind==='reservation'&&!id&&matchpointPrimaryActive&&requestedType!=='block'&&requestedType!=='private_training')
   throw Error('New court reservations must be created in MatchPoint. Only maintenance blocks and private training can be created here.');
  court=court||sportInfo(sport).courts[0];
  if(!loadedDate||loading)throw Error('Load the schedule first.');
  if(kind==='reservation'){
   const row=id?find(id):null;
   if(id&&!row)throw Error('Reservation not found. Reload the date.');
   // Imported bookings use this editor; the database records protected local overrides.
   const duration=row?.duration_minutes||selectedDuration||60,initialStart=row?.booking_start_time?.slice(0,5)||start;
   const split=row?findSplit('reservation',row.id):null;
   const bookingType=requestedType||(row?.private_client_id?'private_training':row?.booking_type||'reservation');
   const playerCount=sport==='pickleball'?(row?.pickleball_player_count===2?2:4):sport==='basketball'?6:4;
   const fee=bookingType!=='reservation'?0:Number(split?.amount_cents??(row?.external_source==='matchpoint'?0:(timetableCourtPriceCents(sport,initialStart,duration,playerCount,true)??0)));
   editor={kind,id:id||null,sport,court:row?.court_number||court,bookingType,start:initialStart,playerCount,
    isMatchmaking:!!row?.matchmaker_id,matchmakerId:row?.matchmaker_id||'',
    externalSource:row?.external_source||null,externalLocalOverride:!!row?.external_local_override,
    duration,name:row?.customer_name||'',status:row?.status||'confirmed',
    privateClientId:row?.private_client_id||'',privateCoachId:row?.private_coach_id||'',
    privateFee:Number(row?.private_session_fee_cents||0),privateRecorded:!!row?.private_session_entry_id,
    notes:row?.notes||'',revision:row?.revision||null,splitRevision:split?.revision||null,
    fee,cash:split?Number(split.cash_cents)+Number(split.unpaid_cents||0):fee,
    whish:Number(split?.whish_cents||0),
    markers:Array.from({length:6},(_,i)=>Boolean(row?.checkmarks?.[i]))};
  }else if(kind==='ledger'){
   const row=findLedger(id);
   if(!row)throw Error('Recorded booking is no longer available.');
   editor={kind,id,sport,court:normalizedCourt(row,sport),bookingType:'ledger',start:row.booking_start_time?.slice(0,5)||'',
    duration:durationOf(row),name:row.name,status:'recorded',notes:row.court_notes||'',revision:null};
  }else throw Error('Unknown booking type.');
  rerender();
  if(editor?.bookingType==='private_training')requestTrainingOptions();
  if(sport==='padel'&&editor?.kind==='reservation')requestMatchmakers();
 }
 function editorHTML(){
  if(!editor)return '';
  const isLedger=editor.kind==='ledger',info=sportInfo(sport),isBlocked=editor.bookingType==='block',isTraining=editor.bookingType==='private_training';
  const readOnly=isLedger&&!ledgerEditable();
  const markerCount=sport==='basketball'?6:sport==='pickleball'?editor.playerCount:4;
  const localOrdinary=!isLedger&&!editor.externalSource&&!isBlocked&&!isTraining;
  const suggested=timetableCourtPriceCents(sport,editor.start,editor.duration,editor.playerCount,localOrdinary);
  const priceHint=suggested===null?'No fixed price for this duration. Enter the court price manually.':
   'Suggested '+paymentText(suggested)+' USD'+(sport==='pickleball'? ' · '+editor.playerCount+' players × '+paymentText(suggested/editor.playerCount)+' USD each (rackets included)':sport==='basketball'?' · 6 players':'')+'. You can override the amount.';
  const options=(items,current)=>items.map(x=>'<option value="'+escapeHtml(x)+'"'+(String(current)===String(x)?' selected':'')+'>'+escapeHtml(x)+'</option>').join('');
  const extensionOptions=editor.externalSource==='matchpoint'?[editor.duration,editor.duration+15,editor.duration+30,editor.duration+60].filter(n=>n>0&&n<=960):[editor.duration];
  const durationOptions=[...new Set([...durationChoices,...extensionOptions])].sort((a,b)=>a-b);
  // The grid stays 09:00–01:00; the local booking form offers all 48 half-hour starts.
  const times=Array.from({length:!isLedger&&!editor.externalSource?48:32},(_,i)=>clock(COURT_GRID_START_MINUTES+i*30));
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
     (editor.externalSource==='matchpoint'?'<p class="cafe-scheduler-warning">Synced from MatchPoint. All edits here stay in Padel On, including court, time and type. They do not change MatchPoint; update MatchPoint separately when needed to avoid conflicting bookings.</p>':matchpointPrimaryActive?'<p class="cafe-scheduler-warning">This local block or training does not update MatchPoint. Local reservations are also recorded only in Padel On; record them in MatchPoint separately if needed to avoid double booking.</p>':'')+
     '<div class="cafe-editor-context"><span>'+escapeHtml(info.label)+'</span><span>'+escapeHtml(businessDate)+'</span></div>'+
     (isLedger?'':'<label class="cafe-booking-type-label">Booking type<select name="booking_type"'+(editor.id&&!editor.externalSource&&(isBlocked||isTraining)?' disabled':'')+'>'+
      '<option value="reservation"'+(!isBlocked&&!isTraining&&!editor.isMatchmaking&&(!matchpointPrimaryActive||editor.externalSource)?' selected':'')+
       (matchpointPrimaryActive&&!editor.externalSource?' disabled':'')+'>'+
       (matchpointPrimaryActive&&!editor.externalSource?'Reservation · Managed in MatchPoint':'Reservation')+'</option>'+
      (matchpointPrimaryActive&&!editor.externalSource?'<option value="local_reservation"'+(!isBlocked&&!isTraining&&!editor.isMatchmaking?' selected':'')+'>Local Reservation</option>':'')+
       (sport==='padel'?'<option value="matchmaking"'+(editor.isMatchmaking?' selected':'')+'>Matchmaking Match</option>':'')+
      '<option value="block"'+(isBlocked?' selected':'')+(editor.id&&!editor.externalSource&&!isBlocked?' disabled':'')+'>Block Court · Unavailable</option>'+
       (sport==='padel'?'<option value="private_training"'+(isTraining?' selected':'')+(editor.id&&!editor.externalSource&&!isTraining?' disabled':'')+'>Private Client Training</option>':'')+'</select></label>')+
     (isLedger||sport!=='padel'?'':'<label class="cafe-matchmaker-field"'+(editor.isMatchmaking?'':' hidden')+'>Matchmaker<select name="matchmaker_id"'+(editor.isMatchmaking?' required':'')+'>'+matchmakerOptions(editor.matchmakerId)+'</select><small>Pink timetable label. Cash/Whish and commissions remain separately accounted for.</small></label>')+
     '<label class="cafe-customer-field"'+(isTraining?' hidden':'')+'><span data-cafe-customer-label>'+(isBlocked?'Block reason / event':'Customer / booking name')+'</span><input name="customer_name" maxlength="120" minlength="2" '+(isTraining?'':'required ')+'value="'+escapeHtml(editor.name)+'"'+(isLedger?' readonly':'')+'></label>'+
     (isLedger||sport!=='padel'?'':'<div class="cafe-private-training-fields"'+(isTraining?'':' hidden')+'>'+
       '<p class="cafe-private-training-note">Select a client from Private Sessions. Scheduled sessions appear in their account without prematurely affecting their balance.</p>'+
       '<label>Search private clients<input type="search" name="private_client_search" placeholder="Type a name or client ID" autocomplete="off" spellcheck="false"></label>'+
       '<label>Private client<select name="private_client_id" '+(isTraining?'required ':'')+'>'+
       privateClientOptions()+'</select></label>'+
       '<small data-cafe-private-client-results aria-live="polite">Type above to filter the client list.</small>'+
       '<label>Coach (optional until completion)<select name="private_coach_id">'+privateCoachOptions()+'</select></label>'+
       '<label>Session fee ($)<input type="number" name="private_session_fee" min="0" step="0.01" max="1000000000" '+
         (isTraining?'required ':'')+'value="'+paymentText(editor.privateFee||0)+'"></label>'+
       (editor.privateRecorded?'<p class="cafe-scheduler-warning">This session has been recorded in Private Sessions. The fee and coach are locked.</p>':'')+
       '</div>')+
     '<div class="cafe-scheduler-two"><label>Court<select name="court_number"'+(readOnly?' disabled':'')+'>'+
      options(info.courts,editor.court)+'</select></label>'+
     '<label>Start time<select name="start_time"'+(readOnly?' disabled':'')+'>'+
      options(start,editor.start)+'</select></label></div>'+
     '<label>Duration<select name="duration_minutes"'+(isLedger?' disabled':'')+'>'+
      durationOptions.map(n=>'<option value="'+n+'"'+(n===editor.duration?' selected':'')+'>'+n+' min</option>').join('')+
     '</select></label>'+ 
     (isLedger||sport!=='pickleball'?'':'<label class="cafe-scheduler-pickleball-players"'+(isBlocked?' hidden':'')+'>Players<select name="pickleball_player_count">'+
      '<option value="2"'+(editor.playerCount===2?' selected':'')+'>2 players (singles)</option>'+
      '<option value="4"'+(editor.playerCount===4?' selected':'')+'>4 players (doubles)</option></select></label>')+
     '<p class="cafe-scheduler-end-note">End time: '+escapeHtml(end)+(timeMinute(editor.start)+dur>=1440?' (next day)':'')+'</p>'+
     (!isLedger&&!editor.externalSource?'<small>Local reservation times: 00:00–01:00 are the following morning of the selected business date; 01:30–08:30 use the selected calendar date. The timetable stays 09:00–01:00.</small>':'')+
     (isLedger?'<p class="cafe-scheduler-warning">Moving this recorded booking updates its court and time only. Payments, price and date will not change.</p>':
       '<label>Reservation status<select name="status">'+
       '<option value="confirmed"'+(editor.status==='confirmed'?' selected':'')+'>Confirmed</option>'+
       '<option value="tentative"'+(editor.status==='tentative'?' selected':'')+'>Tentative</option>'+
       (editor.id?'<option value="cancelled">Cancelled</option>':'')+
       '</select></label>'+
       '<label>Notes<textarea name="notes" rows="2" maxlength="500">'+escapeHtml(editor.notes)+'</textarea></label>'+
       '<fieldset class="cafe-scheduler-payment-fieldset"'+(isBlocked||isTraining?' hidden':'')+'><legend>Payment breakdown</legend>'+
       '<p>The full court price starts as Cash. Change Whish when needed; Cash adjusts automatically.</p>'+
       '<div class="cafe-scheduler-payment-grid">'+
       [
        ['total_amount','Court price ($)',editor.fee],
        ['cash_amount','Cash ($)',editor.cash],
        ['whish_amount','Whish ($)',editor.whish]
       ].map(([key,label,value])=>'<label>'+label+'<input type="number" name="'+key+'" step="0.01" min="0" max="1000000000" '+(isBlocked||isTraining?'':'required ')+'value="'+paymentText(value)+'"></label>').join('')+
       '</div><small data-court-price-hint>'+escapeHtml(priceHint)+'</small><small data-court-payment-preview>Whish payments automatically go into Whish → '+escapeHtml(info.label)+' Courts.</small>'+
       '</fieldset>')+
     (isLedger?'':'<div class="cafe-new-marks cafe-scheduler-player-marks"'+(isBlocked||isTraining?' hidden':'')+'><span>Players paid ('+markerCount+')</span><div class="cafe-marks" role="group" aria-label="Reservation players paid">'+
      Array.from({length:sport==='basketball'?6:4},(_,i)=>'<label title="Player '+(i+1)+' paid"'+(i>=markerCount?' hidden':'')+'><input type="checkbox" name="check'+i+'" '+(editor.markers?.[i]&&i<markerCount?'checked ':'')+'aria-label="Player '+(i+1)+' paid"><span>P'+(i+1)+'</span></label>').join('')+'</div></div>')+
     '<div class="cafe-scheduler-actions"><button type="button" class="btn btn-light" data-action="cafe-schedule-close">Cancel</button>'+
     (readOnly?'':'<button class="btn btn-primary" type="submit"'+(writing?' disabled':'')+'>'+
      (writing?'Saving…':isLedger?'Save new position':isBlocked?'Save blocked time':isTraining?'Save private training':editor.id?'Save changes':'Confirm reservation')+'</button>')+
     '</div></form></section></div>';
 }
 // Patch event nodes only. Leave the calendar, axes, controls, and scroll containers mounted.
 function patchMountedBookings(){
  if(typeof document==='undefined')return false;
  const root=document.querySelector('.cafe-scheduler[data-schedule-date="'+businessDate+'"][data-schedule-sport="'+sport+'"]');
  if(!root)return false;
  const sync=root.querySelector('[data-cafe-schedule-sync]');
  if(error){if(sync)sync.textContent='Sync failed · retry';return true;}
  if(editor||drag||details||slotSelection){if(sync)sync.textContent='Updates available';return true;}
  const template=document.createElement('template');template.innerHTML=page();
  const next=template.content.querySelector('.cafe-scheduler');
  if(!next)return false;
  const oldLanes=[...root.querySelectorAll('.cafe-scheduler-lane')];
  const newLanes=[...next.querySelectorAll('.cafe-scheduler-lane')];
  if(oldLanes.length!==newLanes.length||newLanes.some((node,i)=>node.dataset.court!==oldLanes[i].dataset.court))return false;
  for(let i=0;i<oldLanes.length;i++){
   const old=oldLanes[i],fresh=newLanes[i];
   const saved=new Map([...old.querySelectorAll(':scope > .cafe-scheduler-event')].map(node=>[node.dataset.cafeScheduleSource+':'+node.dataset.cafeScheduleId,node]));
   for(const incoming of [...fresh.querySelectorAll(':scope > .cafe-scheduler-event')]){
    const key=incoming.dataset.cafeScheduleSource+':'+incoming.dataset.cafeScheduleId;
    const previous=saved.get(key);
    if(!previous)old.appendChild(incoming.cloneNode(true));
    else if(previous.outerHTML!==incoming.outerHTML)previous.replaceWith(incoming.cloneNode(true));
    saved.delete(key);
   }
   for(const stale of saved.values())stale.remove();
  }
  const freshWarnings=next.querySelector('.ck-conflict-list'),oldWarnings=root.querySelector('.ck-conflict-list');
  if(freshWarnings&&oldWarnings&&freshWarnings.outerHTML!==oldWarnings.outerHTML)
   oldWarnings.replaceWith(freshWarnings.cloneNode(true));
  for(const selector of ['.cafe-scheduler-stats','.cafe-scheduler-unplaced']){
   const fresh=next.querySelector(selector),prior=root.querySelector(selector);
   if(fresh&&prior&&fresh.innerHTML!==prior.innerHTML)prior.innerHTML=fresh.innerHTML;
  }
  if(sync)sync.textContent='Updated';
  return true;
 }
 function isGridMounted(){
  return typeof document!=='undefined'&&!!document.querySelector('.cafe-scheduler[data-schedule-date="'+businessDate+'"][data-schedule-sport="'+sport+'"]');
 }
 function detailsHTML(){
  if(!details)return '';
  const kind=details.kind,row=kind==='reservation'?find(details.id):findLedger(details.id);
  if(!row)return '';
  const split=findSplit(kind,row.id);
  const type=row.private_client_id||row.booking_type==='private_training'?'Private Client Training':
    row.booking_type==='block'?'Blocked court':row.matchmaker_id?'Matchmaking Match':'Reservation';
  const blocked=type==='Blocked court',training=type==='Private Client Training';
  const total=blocked||training?0:Number(split?.amount_cents??(kind==='ledger'?row.amount_cents:0));
  const cash=split?Number(split.cash_cents)+Number(split.unpaid_cents||0):kind==='ledger'?total:0;
  const whish=Number(split?.whish_cents||0);
  const court=kind==='ledger'?normalizedCourt(row,sport):row.court_number;
  const name=row.customer_name||row.name||(training?'Private client training':blocked?'Court blocked':'Reservation');
  const start=String(row.booking_start_time||'').slice(0,5),end=String(row.booking_end_time||'').slice(0,5);
  const notes=String(row.notes||row.court_notes||'');
  const canEdit=kind==='reservation'?(businessDate>today()||ledgerEditable()):ledgerEditable();
  const status=kind==='reservation'?(row.external_alert?'MatchPoint · review required':row.external_source==='matchpoint'?(row.external_local_override?'MatchPoint · edited locally':'MatchPoint · synced'):(row.status||'confirmed')):'Recorded booking';
  const payment=blocked?'<p class="ck-detail-note">Blocked time does not generate court revenue.</p>':
   training?'<div class="ck-detail-box"><span class="ck-detail-label">Scheduled private session fee</span><strong class="ck-detail-money">$'+paymentText(Number(row.private_session_fee_cents||0))+'</strong><small>The session is not charged until the Private Sessions workflow records completion.</small></div>':
   '<div class="ck-detail-box"><span class="ck-detail-label">Total court allocation</span><strong class="ck-detail-money">$'+paymentText(total)+'</strong>'+
   '<div class="ck-detail-split"><span>Cash allocation</span><b>$'+paymentText(cash)+'</b></div>'+
   '<div class="ck-detail-split"><span>Whish allocation</span><b>$'+paymentText(whish)+'</b></div>'+
   '<small>'+(split?'Payment recorded on '+escapeHtml(split.payment_date||'the financial date'):
     kind==='reservation'?'No payment allocation found. Edit the reservation to set its amount.':'Legacy finance booking treated as Cash.')+'</small></div>';
  const count=sport==='basketball'?6:sport==='pickleball'?Number(row.pickleball_player_count||4):4;
  const marker=kind==='reservation'&&!blocked&&!training&&Array.isArray(row.checkmarks)?
    '<div class="ck-detail-box"><span class="ck-detail-label">Players marked paid</span><span class="ck-detail-value">'+
      row.checkmarks.slice(0,count).filter(Boolean).length+' of '+count+'</span></div>':'';
  return '<div class="ck-detail-overlay">'+
   '<button type="button" class="ck-detail-scrim" data-action="cafe-schedule-details-close" aria-label="Close reservation details"></button>'+
   '<aside class="ck-detail-drawer" role="dialog" aria-modal="true" aria-label="Reservation details">'+
    '<div class="ck-detail-head"><div><span class="ck-detail-pill">'+escapeHtml(status)+'</span><h3>Reservation details</h3>'+
     '<p>'+escapeHtml(businessDate)+' · '+escapeHtml(sportInfo(sport).label)+'</p></div>'+
     '<button type="button" class="ck-detail-close" data-action="cafe-schedule-details-close" aria-label="Close details">×</button></div>'+
    '<div class="ck-detail-body" data-preserve-scroll="reservation-details-body">'+
     '<div class="ck-detail-box"><span class="ck-detail-label">Name / reservation</span><h4>'+escapeHtml(name)+'</h4>'+
      '<span class="ck-detail-value">'+escapeHtml(sportInfo(sport).label)+' · '+escapeHtml(court||'Unassigned')+'</span></div>'+
     '<div class="ck-detail-grid"><div class="ck-detail-box"><span class="ck-detail-label">Time</span>'+
       '<span class="ck-detail-value">'+escapeHtml(start||'Not recorded')+' – '+escapeHtml(end||'Not recorded')+'</span></div>'+
      '<div class="ck-detail-box"><span class="ck-detail-label">Type</span><span class="ck-detail-value">'+escapeHtml(type)+'</span></div></div>'+
     (row.matchmaker_id?'<div class="ck-detail-box"><span class="ck-detail-label">Matchmaker</span><strong>'+escapeHtml(matchmakerName(row.matchmaker_id))+'</strong></div>':'')+
     (row.external_alert?'<p class="cafe-scheduler-warning">'+escapeHtml(row.external_alert)+'</p>':'')+payment+marker+
     (notes?'<div class="ck-detail-box"><span class="ck-detail-label">Notes</span><div class="ck-detail-note">'+escapeHtml(notes)+'</div></div>':'')+
    '</div><div class="ck-detail-footer">'+
     '<button type="button" class="btn btn-light" data-action="cafe-schedule-details-close">Close</button>'+
     (canEdit?'<button type="button" class="btn btn-primary" data-action="cafe-schedule-details-edit">Edit booking</button>':'')+
    '</div></aside></div>';
 }
 function page(){
  const selected=businessDate;
  const header='<div class="cafe-scheduler-toolbar"><div><strong>Reservations calendar</strong>'+
   '<div class="cafe-scheduler-sports" role="group" aria-label="Choose court sport">'+
   Object.values(COURT_SPORTS).map(info=>'<button type="button" data-action="cafe-schedule-sport" data-sport="'+info.key+
   '" aria-pressed="'+(sport===info.key)+'" class="'+(sport===info.key?'active':'')+'">'+
   sportTabIcon(info.key)+'<span class="ck-sport-label">'+escapeHtml(info.label)+'</span><span class="ck-sport-count">'+
   (info.courts.length===1?'1 Court':info.courts.join(', '))+'</span></button>').join('')+'</div>'+
   '<small>Choose a date to plan ahead. This does not change the cashbook date.</small></div>'+
   '<div class="cafe-scheduler-date-controls">'+
    '<button type="button" data-action="cafe-schedule-prev" aria-label="Previous reservation day">‹</button>'+
    '<input id="cafe-schedule-date" aria-label="Reservation calendar date" type="date" value="'+escapeHtml(selected)+
    '" min="2025-01-01" max="'+maxDate()+'">'+
    '<button type="button" data-action="cafe-schedule-next" aria-label="Next reservation day"'+(selected>=maxDate()?' disabled':'')+'>›</button>'+
    '<button type="button" data-action="cafe-schedule-today">Today</button>'+
    '<button type="button" data-action="cafe-schedule-reload">Refresh</button>'+
    '<button type="button" class="btn btn-primary" data-action="cafe-schedule-create">'+(matchpointPrimaryActive?'+ Local Reservation / Block':'+ Reservation')+'</button>'+
   '</div></div>';
  if(loadedDate!==selected)return header+
   '<p class="cafe-scheduler-notice">'+escapeHtml(error?'Could not load reservations: '+error:
    'Loading court reservations for '+selected+'…')+'</p>'+editorHTML();
  const grid=projectedGrid(),stats=calendarOccupancy(grid),info=sportInfo(sport);
  // Payment totals are attached to displayed bookings, not necessarily this calendar day.
  const paidForBookings=[...grid.columns.flatMap(lane=>lane.bookings),...grid.unplaced]
   .reduce((total,item)=>{
    const split=findSplit(item.source,item.id);
    return total+(split?Number(split.cash_cents)+Number(split.whish_cents):
     item.source==='ledger'?Number(item.amountCents)||0:0);
   },0);
  if(!info.courts.includes(mobileCourt))mobileCourt=info.courts[0];
  const courtTabs=info.courts.length>1?'<div class="ck-court-tabs" role="group" aria-label="Choose the visible court">'+
   info.courts.map(court=>'<button type="button" class="ck-court-tab" data-action="cafe-schedule-court" data-court="'+court+
    '" aria-pressed="'+(court===mobileCourt)+'">Court '+escapeHtml(court.slice(1))+'</button>').join('')+'</div>':'';
  const axis='<div class="cafe-timeboard-axis" aria-label="Hour labels">'+
   COURT_GRID_HOURS.map(hour=>'<span class="cafe-timeboard-hour" style="top:'+hour.topPx+'px">'+
     escapeHtml(hour.label)+'</span>').join('')+'</div>';
  const conflictIds=new Set(grid.conflicts.flatMap(pair=>[pair.first.id,pair.second.id]));
  const conflictAlert='<div class="ck-conflict-list" '+(grid.conflicts.length?'role="status"':'hidden')+'>'+
   (grid.conflicts.length?'<strong>Existing court double bookings ('+grid.conflicts.length+')</strong><p>These older entries overlap. Choose a different time or court to resolve them; new overlaps are blocked.</p>'+
    grid.conflicts.map(pair=>'<p>'+escapeHtml(pair.court+' · '+pair.first.name+' ('+pair.first.start+'–'+pair.first.end+') and '+pair.second.name+' ('+pair.second.start+'–'+pair.second.end+')')+'</p>').join(''):'')+'</div>';
  const courtHeaders=grid.columns.map(lane=>'<div class="cafe-timeboard-court-head" data-court="'+lane.court+'">'+
   '<span class="ck-court-token">'+escapeHtml(lane.court)+'</span><span class="ck-court-heading"><strong>'+
   escapeHtml(info.courts.length===1?info.label+' Court':'Court '+lane.court.slice(1))+
   '</strong><small><span data-cafe-court-count="'+lane.court+'">'+lane.bookings.length+
   ' booked</span></small></span></div>').join('');
  const lanes=grid.columns.map(lane=>'<div class="cafe-timeboard-court cafe-scheduler-lane" data-action="cafe-schedule-new-at" data-court="'+lane.court+
   '" role="group" aria-label="Court '+lane.court+', click empty space to make reservation">'+
    lane.bookings.map(item=>{
     const planned=item.source==='reservation';
     const row=planned?find(item.id):findLedger(item.id);
     if(!row)return '';
     const isTraining=item.bookingType==='private_training',isBlock=item.bookingType==='block';
     const isMatchmaking=planned&&!!row.matchmaker_id&&!isTraining&&!isBlock;
     const allMarked=!isTraining&&!isBlock&&courtBookingAllPlayersMarked(row,sport,{ledger:!planned});
     const label=isTraining?'Private Client Training':isBlock?'Court blocked':isMatchmaking?'Matchmaking match · '+matchmakerName(row.matchmaker_id)+(allMarked?' · All players marked paid':''):planned?(item.reservationStatus==='tentative'?'Tentative reservation':'Confirmed reservation')+(allMarked?' · All players marked paid':''):
       allMarked?'All players marked paid':item.paymentState==='some'||item.paymentState==='all'?'Partially marked paid':item.paymentState==='none'?'None marked paid':'Payment markers unavailable';
     const split=findSplit(item.source,item.id);
     const total=split?Number(split.amount_cents||0):planned?null:Number(item.amountCents||0);
     const cash=split?Number(split.cash_cents||0)+Number(split.unpaid_cents||0):planned?null:Number(item.amountCents||0);
     const whish=split?Number(split.whish_cents||0):0;
     const moneyLabel=split?' · Cash '+paymentText(cash)+' / Whish '+paymentText(whish):'';
     const color=isTraining?'schedule-training':isBlock?'schedule-block':isMatchmaking?'schedule-matchmaking':allMarked?'schedule-paid':planned?'schedule-'+item.reservationStatus:'status-'+(item.paymentState==='all'?'some':item.paymentState);
     const badge=planned&&row.external_alert?'REVIEW':isTraining?'PRIVATE TRAINING':isBlock?'BLOCK COURT':isMatchmaking?'MATCHMAKING':planned&&row.external_source==='matchpoint'?'MATCHPOINT':planned&&item.reservationStatus==='tentative'?'TENTATIVE':'STANDARD';
     const fee=isTraining?Number(row.private_session_fee_cents||0):total;
     const priceLabel=isBlock?'Unavailable':isTraining?'Session $'+paymentText(fee):fee===null?(row.external_source==='matchpoint'?'Amount not recorded':'Reservation saved'):'$'+paymentText(fee);
     const paymentLabel=!isBlock&&!isTraining?(split?
      '<span class="ck-booking-payment">Cash: $'+paymentText(cash)+' · Whish: $'+paymentText(whish)+'</span>':
      !planned?'<span class="ck-booking-payment">Cash: $'+paymentText(cash)+'</span>':''):'';
     const size='top:'+item.topPx+'px;height:'+item.heightPx+'px;left:calc('+(item.track/item.tracks*100).toFixed(5)+
      '% + 3px);width:calc('+(100/item.tracks).toFixed(5)+'% - 6px)';
     return '<button type="button" class="cafe-timeboard-booking cafe-scheduler-event '+color+
      (item.heightPx<51?' ck-short-event':'')+(conflictIds.has(item.id)?' ck-overlap':'')+
      '" data-action="cafe-schedule-open" data-cafe-schedule-source="'+item.source+
      '" data-cafe-schedule-id="'+escapeHtml(item.id)+'" style="'+size+'"'+
      (item.source==='ledger'&&!ledgerEditable()?' data-schedule-locked="true"':'')+
      ' title="'+escapeHtml('Court '+lane.court+' · '+item.start+'–'+item.end+' · '+item.name+' · '+label+moneyLabel)+
      '"><span class="ck-booking-top"><span class="cafe-timeboard-booking-time">'+escapeHtml(item.start+' – '+item.end)+
      '</span><span class="ck-booking-badge">'+badge+'</span></span>'+
      '<strong>'+escapeHtml(item.name)+'</strong>'+(isMatchmaking?'<span class="ck-booking-matchmaker">'+escapeHtml(matchmakerName(row.matchmaker_id))+'</span>':'')+
      '<small class="ck-booking-bottom"><span class="ck-booking-price">'+
      escapeHtml(priceLabel)+'</span>'+paymentLabel+'</small></button>';
    }).join('')+'</div>').join('');
  const unplaced=grid.unplaced.length?
   '<details class="cafe-scheduler-unplaced"><summary>Other saved entries ('+grid.unplaced.length+')</summary>'+
    grid.unplaced.map(item=>'<div>'+escapeHtml(item.court+' · '+item.name)+
     ' — '+escapeHtml(item.reason||'Time not available')+'</div>').join('')+'</details>':'';
  const legend='<div class="cafe-scheduler-legend"><span class="schedule-confirmed">Confirmed reservation</span>'+ 
   '<span class="schedule-block">Blocked / unavailable</span>'+
    (sport==='padel'?'<span class="schedule-training">Private client training</span><span class="schedule-matchmaking">Matchmaking match</span>':'')+
    '<span class="schedule-tentative">Tentative reservation</span>'+
    '<span class="schedule-paid">All players marked paid</span>'+
    '<span class="status-some">Partially marked</span>'+
    '<span class="status-none">None marked</span></div>';
  return header+'<section class="cafe-timetable cafe-timetable-hours cafe-scheduler '+(info.courts.length===1?'cafe-single-court':'')+
   '" data-schedule-sport="'+sport+'" data-schedule-date="'+selected+'" data-selected-court="'+mobileCourt+'">'+
    '<div class="cafe-timetable-summary"><div><h3>'+escapeHtml(info.label)+' schedule · 09:00–01:00</h3>'+
    '<p>'+grid.allCount+' saved booking'+(grid.allCount===1?'':'s')+' · '+escapeHtml(selected)+
    ' · after-midnight slots belong to this business date</p></div>'+
    '<span class="cafe-scheduler-sync" data-cafe-schedule-sync aria-live="polite">'+
    (loading?'Updating…':error?'Sync issue':'Up to date')+'</span></div>'+
    '<div class="cafe-scheduler-stats"><div><b>'+stats.bookings+'</b><span>Bookings</span></div>'+
    '<div><b>'+stats.courtHours.toFixed(1)+' h</b><span>Court-hours</span></div>'+
    '<div><b>'+stats.occupancy+'%</b><span>Occupancy</span></div>'+
    '<div title="Cash plus Whish allocated to displayed bookings; may have been received on another date"><b>$'+
     paymentText(paidForBookings)+'</b><span>Payment allocations</span></div></div>'+
    courtTabs+conflictAlert+'<p class="cafe-scheduler-hint"><span class="scheduler-pointer-help">Hover over an empty slot to see its time. Click to book 60 minutes, or drag vertically to choose a time range (30-minute steps). Drag existing bookings to move them.</span><span class="scheduler-touch-help">Tap an empty time to book 60 minutes. Open a booking to review or edit its court, time, payment and notes.</span></p>'+
    '<div class="cafe-timeboard-scroll" data-preserve-scroll="court-reservation-scroll" tabindex="0" aria-label="Scroll the three court schedules sideways">'+
     '<div class="cafe-timeboard"><div class="cafe-timeboard-corner">TIME<br>BEIRUT</div>'+courtHeaders+axis+lanes+
     '<div class="ck-schedule-now" aria-hidden="true"'+(courtCurrentTimeBeirut(selected,addDays)?'':' hidden')+
     ' style="top:'+(courtCurrentTimeBeirut(selected,addDays)?.topPx??0)+'px"><span>'+
     (courtCurrentTimeBeirut(selected,addDays)?.label||'')+'</span></div></div></div>'+
    legend+unplaced+'<p class="cafe-timeboard-disclaimer">Reservations are kept separate from court finance charges. Bookings default to Cash; staff can switch any portion to Whish. Allocations are recorded on the entry date; do not enter the same receipt twice. Closed financial days cannot be moved.</p>'+
    '</section>'+editorHTML()+detailsHTML();
 }
 function tickBeirutNowLine(){
  if(typeof document==='undefined')return;
  const root=document.querySelector('.cafe-scheduler[data-schedule-date="'+businessDate+'"][data-schedule-sport="'+sport+'"]');
  const line=root?.querySelector('.ck-schedule-now');
  if(!line)return;
  const time=courtCurrentTimeBeirut(businessDate,addDays);
  line.hidden=!time;
  if(time){line.style.top=time.topPx+'px';line.querySelector('span').textContent=time.label;}
 }
 // Update the indicator alone; do not rerender bookings, reset scroll or disrupt a drawer.
 if(typeof window!=='undefined')window.setInterval(tickBeirutNowLine,30000);
 function closeDetails(){
  const overlay=typeof document==='undefined'?null:document.querySelector('.ck-detail-overlay');
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(!overlay||reduced){details=null;rerender();return;}
  overlay.classList.add('is-closing');
  globalThis.setTimeout(()=>{details=null;rerender();},100);
 }
 async function action(target,event){
  const act=target.dataset.action;
  if(act==='cafe-schedule-close'){editor=null;rerender();return true;}
  if(act==='cafe-schedule-details-close'){closeDetails();return true;}
  if(act==='cafe-schedule-details-edit'){
   if(!details)return true;
   const selected=details;details=null;
   openEditor(selected.kind,selected.id);
   rerender();return true;
  }
  if(act==='cafe-schedule-court'){
   const next=target.dataset.court;
   if(!sportInfo(sport).courts.includes(next))throw Error('Unknown court');
   mobileCourt=next;rerender();return true;
  }
  if(act==='cafe-schedule-payment-editor'){
   if(!editor||editor.kind!=='ledger'||!ledgerEditable())throw Error('Open an editable financial booking first.');
   const id=editor.id;editor=null;await onLedgerPaymentEdit(id);return true;
  }
  if(act==='cafe-schedule-sport'){
   const next=target.dataset.sport;sportInfo(next);
   if(next!==sport){cancelDrag();sport=next;editor=null;details=null;mobileCourt=sportInfo(next).courts[0];rerender();}
   return true;
  }
  if(act==='cafe-schedule-today'){setDate(today(),{loadNow:true});return true;}
  if(act==='cafe-schedule-prev'){setDate(addDays(businessDate,-1),{loadNow:true});return true;}
  if(act==='cafe-schedule-next'){setDate(addDays(businessDate,1),{loadNow:true});return true;}
  if(act==='cafe-schedule-reload'){await load(true);return true;}
  if(act==='cafe-schedule-create'){openEditor('reservation',null,null,'18:00',null,matchpointPrimaryActive?'block':null);return true;}
  if(act==='cafe-schedule-open'){
   if(Date.now()<skipClickUntil)return true;
   const kind=target.dataset.cafeScheduleSource==='reservation'?'reservation':'ledger';
   details={kind,id:target.dataset.cafeScheduleId};rerender();return true;
  }
  if(act==='cafe-schedule-new-at'){
   if(Date.now()<skipClickUntil)return true;
   if(!event||!target.getBoundingClientRect)return true;
   const time=pointerMinute(target,event.clientY);
   openEditor('reservation',null,target.dataset.court,clock(time),null,matchpointPrimaryActive?'block':null);
   if(editor){editor.duration=time>=1470?30:60;editor.fee=getSuggestedPrice(clock(time),editor.duration,editor.playerCount);editor.cash=editor.fee;editor.whish=0;}
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
  const localOrdinary=editor.kind==='reservation'&&!editor.externalSource&&editor.bookingType==='reservation';
  if(timeMinute(start)===null||!Number.isInteger(duration)||duration<1||duration>COURT_MAX_DURATION_MINUTES||
     (!localOrdinary&&(timeMinute(start)<COURT_GRID_START_MINUTES||timeMinute(start)+duration>COURT_GRID_END_MINUTES)))throw Error('Choose a valid time; blocks, training and synced bookings must fit from 09:00 through 01:00');
  if(!sportInfo(sport).courts.includes(data.court_number))throw Error('Select a valid court');
  writing=true;
  try{
   if(editor.kind==='ledger'){
    if(!ledgerEditable())throw Error('This financial day is closed. Ask an administrator to reopen it');
    const row=findLedger(editor.id);
    if(!row)throw Error('Financial booking no longer exists');
    await api.rpc('club_ledger_reposition',{
     p_entry_id:row.id,p_sport:sport,p_court:data.court_number,p_start:start,
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
    const bookingType=editor.bookingType==='block'?'block':editor.bookingType==='private_training'?'private_training':'reservation';
    const matchmakerId=sport==='padel'&&bookingType==='reservation'&&data.booking_type==='matchmaking'?String(data.matchmaker_id||'').trim():null;
    if(data.booking_type==='matchmaking'&&!matchmakerId)throw Error('Select a matchmaker for this matchmaking match.');
   if(bookingType==='private_training'&&sport!=='padel')throw Error('Private training is available for Padel only.');
   const playerCount=sport==='pickleball'?Number(data.pickleball_player_count||editor.playerCount):4;
   if(sport==='pickleball'&&bookingType==='reservation'&&![2,4].includes(playerCount))throw Error('Choose 2 or 4 Pickleball players.');
    const isWithoutCourtPayment=bookingType!=='reservation';
    const total=isWithoutCourtPayment?0:moneyCents(data.total_amount);
    const cash=isWithoutCourtPayment?0:moneyCents(data.cash_amount);
    const whish=isWithoutCourtPayment?0:moneyCents(data.whish_amount);
    const unpaid=0;
    const existing=editor.id?findSplit('reservation',editor.id):null;
    const localSyncedWithoutPayment=row?.external_source==='matchpoint'&&!existing;
    if(bookingType==='reservation'&&total<1&&!localSyncedWithoutPayment)throw Error('Enter a valid court price; bookings without a fixed tariff need a manual amount.');
   if(total>0)courtAllocation(total,cash,whish,0);
    else if(cash!==0||whish!==0)throw Error('Cash + Whish must equal the court price.');
    if(existing&&bookingType!=='reservation')throw Error('This reservation has allocated court payments. Reverse or correct the payment before changing to a block or private training.');
    const updatePayments=!existing?total>0:
     total!==Number(existing.amount_cents)||cash!==Number(existing.cash_cents)||
     whish!==Number(existing.whish_cents)||Number(existing.unpaid_cents||0)!==0;
    if(existing&&total===0)throw Error('Cannot clear an allocated court price. Adjust the payment breakdown instead.');
    if(bookingType==='private_training'){
     const clientId=String(data.private_client_id||'').trim();
     if(!clientId)throw Error('Choose a Private Sessions client.');
     await api.rpc('club_private_training_save',{
      p_id:editor.id||null,p_business_date:businessDate,p_sport:sport,
      p_court:data.court_number,p_start:start,p_duration:duration,
      p_client_id:clientId,p_coach_id:data.private_coach_id||null,
      p_session_fee_cents:moneyCents(data.private_session_fee),
      p_notes:data.notes||'',p_status:data.status||'confirmed',
      p_expected_revision:row?.revision||null
     });
    }else {
     const savedId=await api.rpc('club_court_reservation_priced_save',{
     p_id:editor.id||null,p_business_date:businessDate,p_sport:sport,p_booking_type:bookingType,
     p_court:data.court_number,p_start:start,p_duration:duration,
     p_customer:data.customer_name,p_notes:data.notes||'',p_status:data.status||'confirmed',
     p_expected_revision:row?.revision||null,
     p_payment_total_cents:total,p_cash_cents:cash,p_whish_cents:whish,p_unpaid_cents:unpaid,
     p_split_revision:existing?.revision||null,p_update_payments:bookingType==='block'?false:updatePayments,
     p_checkmarks:Array.from({length:6},(_,i)=>bookingType==='block'||(sport==='pickleball'&&i>=playerCount)?false:data['check'+i]==='on'),
     p_expected_checkmarks:editor.id?editor.markers:null,
     p_pickleball_player_count:playerCount
    });
     if(sport==='padel'&&bookingType==='reservation'&&(row?.matchmaker_id||null)!==matchmakerId){
      try{
       await api.rpc('club_court_reservation_matchmaker_set',{p_id:savedId,p_matchmaker_id:matchmakerId});
      }catch(error){
       editor=null;await load(true);await onReservationChanged();
       throw Error('Reservation saved, but matchmaker assignment failed: '+(error.message||'Unknown error')+'. Reopen the booking to retry.');
      }
     }
    }
    // Close the modal immediately after a successful write, before any async
    // calendar/cashbook refresh can patch only the bookings and leave an old overlay.
    editor=null;
    if(typeof document!=='undefined')document.querySelector('.cafe-scheduler-overlay')?.remove();
    rerender();
    await load(true);await onReservationChanged();
    toast(data.status==='cancelled'?(row?.external_source==='matchpoint'?'Reservation cancelled locally. Cancel it in MatchPoint too if needed.':'Reservation cancelled. Same-day payments reversed.'):bookingType==='private_training'?'Private client training linked (not charged until completion).':bookingType==='block'?'Court blocked locally.':'Reservation saved.');
   }
  }finally{writing=false;rerender();}
 }
 async function move(source,id,court,start){
  if(!sportInfo(sport).courts.includes(court)||timeMinute(start)===null)throw Error('Invalid destination');
  if(source==='reservation'){
   const row=find(id);
   if(!row)throw Error('Reservation no longer exists');
   await api.rpc('club_court_reservation_save',{
    p_id:row.id,p_business_date:businessDate,p_sport:sport,p_court:court,p_start:start,
    p_duration:Number(row.duration_minutes),p_customer:row.customer_name,
    p_notes:row.notes||'',p_status:row.status,p_booking_type:row.booking_type||'reservation',
    p_expected_revision:Number(row.revision),p_payment_total_cents:null,p_cash_cents:null,
    p_whish_cents:null,p_unpaid_cents:null,p_split_revision:null,p_update_payments:false
   });
   await load(true);await onReservationChanged();
  }else{
   if(!ledgerEditable())throw Error('This financial day is closed');
   const row=findLedger(id);
   if(!row)throw Error('Recorded booking no longer exists');
   await api.rpc('club_ledger_reposition',{
    p_entry_id:id,p_sport:sport,p_court:court,p_start:start,p_expected_court:row.court_number,
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
  const field=name=>form.querySelector('[name="'+name+'"]');
  if(target.name==='private_client_search')return updatePrivateClientSearch(form);
  const paymentPreview=form.querySelector('[data-court-payment-preview]');
  if(['total_amount','cash_amount','whish_amount'].includes(target.name)){
   if(!field('total_amount')||!field('cash_amount')||!field('whish_amount'))return false;
   try{
    const total=moneyCents(field('total_amount').value);
    if(target.name==='total_amount')form.dataset.priceManuallyEdited='true';
    if(target.name==='cash_amount'){
     const cash=moneyCents(field('cash_amount').value);
     if(cash>total)throw Error('Cash cannot exceed the court price.');
     field('whish_amount').value=paymentText(total-cash);
    }else{
     const whish=moneyCents(field('whish_amount').value);
     if(whish>total)throw Error('Whish cannot exceed the court price.');
     field('cash_amount').value=paymentText(total-whish);
    }
    const cash=moneyCents(field('cash_amount').value),whish=moneyCents(field('whish_amount').value);
    if(paymentPreview)paymentPreview.textContent='Cash '+paymentText(cash)+' + Whish '+paymentText(whish)+
     ' = '+paymentText(total)+'. Whish goes to the court wallet.';
   }catch(e){if(paymentPreview)paymentPreview.textContent=e.message;}
   return true;
  }
  if(target.name==='matchmaker_id'){if(editor)editor.matchmakerId=target.value;return true;}
  if(target.name==='booking_type'){
   if((editor?.id&&!editor?.externalSource&&editor?.bookingType!=='reservation')||editor?.kind==='ledger')return false;
   // The managed option remains disabled; explicit Local Reservation maps to a local ordinary booking.
   if(matchpointPrimaryActive&&!editor?.id&&target.value==='reservation'){
    target.value='block';
    toast('Select Local Reservation for manual bookings, or create the regular booking in MatchPoint.',true);
    return true;
   }
   editor.bookingType=target.value==='block'?'block':
    target.value==='private_training'&&sport==='padel'?'private_training':'reservation';
   editor.isMatchmaking=target.value==='matchmaking'&&sport==='padel';
   const matchmakerField=form.querySelector('.cafe-matchmaker-field');
   if(matchmakerField){matchmakerField.hidden=!editor.isMatchmaking;const selector=matchmakerField.querySelector('select');if(selector)selector.required=editor.isMatchmaking;}
   if(editor.isMatchmaking)requestMatchmakers();
   const blocked=editor.bookingType==='block',training=editor.bookingType==='private_training';
   const payments=form.querySelector('.cafe-scheduler-payment-fieldset');
   if(payments){payments.hidden=blocked||training;for(const input of payments.querySelectorAll('input'))input.required=!blocked&&!training;}
   const trainingFields=form.querySelector('.cafe-private-training-fields');
   if(trainingFields){trainingFields.hidden=!training;for(const input of trainingFields.querySelectorAll('input,select'))input.required=training&&['private_client_id','private_session_fee'].includes(input.name);}
   const playerMarks=form.querySelector('.cafe-scheduler-player-marks');
   if(playerMarks)playerMarks.hidden=blocked||training;
   const pickleballPlayers=form.querySelector('.cafe-scheduler-pickleball-players');
   if(pickleballPlayers)pickleballPlayers.hidden=blocked||training;
   const customerField=form.querySelector('.cafe-customer-field');
   if(customerField){customerField.hidden=training;const input=customerField.querySelector('input');if(input)input.required=!training;}
   if(training)requestTrainingOptions();
   const label=form.querySelector('[data-cafe-customer-label]');
   if(label)label.textContent=blocked?'Block reason / event':'Customer / booking name';
   if(!blocked&&!training&&!editor.id){
    const customer=field('customer_name');if(customer?.value==='Maintenance')customer.value='';
   }
   const startField=field('start_time');if(startField)previewEnd(startField);
   return true;
  }
  if(!['start_time','duration_minutes','pickleball_player_count'].includes(target.name))return false;
  const start=field('start_time')?.value||'';
  const duration=editor?.kind==='ledger'?editor.duration:Number(field('duration_minutes')?.value||60);
  const minutes=timeMinute(start),label=form.querySelector('.cafe-scheduler-end-note');
  const localOrdinary=editor?.kind==='reservation'&&!editor.externalSource&&editor.bookingType==='reservation';
  if(label)label.textContent=minutes===null||(!localOrdinary&&(minutes<COURT_GRID_START_MINUTES||minutes+duration>COURT_GRID_END_MINUTES))?
   'Blocks, training and synced bookings must fit from 09:00 through 01:00.':
   'End time: '+clock(minutes+duration)+(minutes+duration>=1440?' (next day)':'');
  if(editor?.kind!=='reservation'||editor.bookingType!=='reservation')return true;
  const players=sport==='pickleball'?Number(field('pickleball_player_count')?.value||editor.playerCount||4):sport==='basketball'?6:4;
  if(sport==='pickleball'&&![2,4].includes(players))return true;
  if(sport==='pickleball'){
   editor.playerCount=players;
   const markers=form.querySelectorAll('.cafe-scheduler-player-marks .cafe-marks label');
   markers.forEach((node,index)=>{
    const hidden=index>=players;
    node.hidden=hidden;
    if(hidden){const checkbox=node.querySelector('input');if(checkbox)checkbox.checked=false;}
   });
   const heading=form.querySelector('.cafe-scheduler-player-marks > span');
   if(heading)heading.textContent='Players paid ('+players+')';
  }
  const suggested=timetableCourtPriceCents(sport,start,duration,players,localOrdinary);
  const hint=form.querySelector('[data-court-price-hint]');
  if(hint)hint.textContent=suggested===null?
   'No fixed rate for this duration. Enter the court price manually.':
   'Suggested '+paymentText(suggested)+' USD'+(sport==='pickleball'?
    ' · '+players+' players × '+paymentText(suggested/players)+' USD each (rackets included)':
    sport==='basketball'?' · 6 players':'')+
   (editor.id||form.dataset.priceManuallyEdited==='true'?' · Current manual/saved price unchanged.':' · Price and Cash updated automatically.');
  // Never silently overwrite an existing booked price, or a price that staff
  // explicitly typed. New unmodified reservations use the established tariff.
  if(!editor.id&&form.dataset.priceManuallyEdited!=='true'&&field('total_amount')&&field('cash_amount')&&field('whish_amount')){
   const total=suggested??0,whish=Math.min(total,moneyCents(field('whish_amount').value));
   field('total_amount').value=paymentText(total);
   field('whish_amount').value=paymentText(whish);
   field('cash_amount').value=paymentText(total-whish);
   if(paymentPreview)paymentPreview.textContent='Cash '+paymentText(total-whish)+
    ' + Whish '+paymentText(whish)+' = '+paymentText(total)+'.';
  }
  return true;
 }
 function closeEditor(){
  if(details){details=null;rerender();return true;}
  if(!editor)return false;
  editor=null;rerender();return true;
 }

 const pointerMinute=(lane,clientY)=>{
  const rect=lane.getBoundingClientRect();
  const bounded=Math.max(0,Math.min(rect.height-0.01,clientY-rect.top));
  return Math.max(COURT_GRID_START_MINUTES,Math.min(COURT_GRID_END_MINUTES-30,
   Math.floor((COURT_GRID_START_MINUTES+bounded*60/COURT_GRID_HOUR_HEIGHT)/30)*30));
 };
 const removeHover=()=>{
  hoverSlot?.node.remove();
  hoverSlot=null;
 };
 const removeSelection=()=>{
  if(slotSelection){
   const state=slotSelection;
   try{if(state.lane.hasPointerCapture?.(state.pointerId))state.lane.releasePointerCapture(state.pointerId)}catch{}
   state.node.remove();
   slotSelection=null;
  }
 };
 const previewNode=(lane,kind)=>{
  const node=document.createElement('div');
  node.className=kind==='range'?'ck-slot-range':'ck-slot-hover';
  node.setAttribute('aria-hidden','true');
  const label=document.createElement('span');
  label.className='ck-slot-time';
  node.appendChild(label);
  lane.appendChild(node);
  return node;
 };
 const drawSlot=(node,range)=>{
  node.style.top=range.topPx+'px';
  node.style.height=range.heightPx+'px';
  node.firstElementChild.textContent=clock(range.startMinute)+' – '+clock(range.endMinute)+
   ' ('+range.durationMinutes+' min)';
 };
 function showHoverSlot(e){
  if(typeof document==='undefined'||e.pointerType==='touch'||editor||details||drag||slotSelection||writing){
   removeHover();return false;
  }
  const target=e.target?.closest?.('.cafe-scheduler-lane');
  const booked=e.target?.closest?.('.cafe-timeboard-booking');
  if(!target||booked||loadedDate!==businessDate){removeHover();return false;}
  const minute=pointerMinute(target,e.clientY);
  if(hoverSlot?.lane===target&&hoverSlot.minute===minute&&hoverSlot.node.isConnected)return true;
  if(hoverSlot?.lane!==target||!hoverSlot?.node?.isConnected){
   removeHover();hoverSlot={lane:target,node:previewNode(target,'hover'),minute};
  }
  hoverSlot.minute=minute;
  drawSlot(hoverSlot.node,courtSchedulerSelection(minute,minute));
  return true;
 }
 function pointerDown(e){
  if(!e.isPrimary||e.button!==0||editor||details||writing||loadedDate!==businessDate)return false;
  const target=e.target.closest?.('[data-cafe-schedule-id]');
  if(!target){
   // Touch continues to use the existing click-to-book path; scrolling is never seized.
   if(e.pointerType==='touch')return false;
   const lane=e.target.closest?.('.cafe-scheduler-lane');
   if(!lane)return false;
   removeHover();
   const anchor=pointerMinute(lane,e.clientY);
   const node=previewNode(lane,'range');
   slotSelection={pointerId:e.pointerId,lane,node,anchor,focus:anchor,
    x:e.clientX,y:e.clientY,dragged:false};
   drawSlot(node,courtSchedulerSelection(anchor,anchor));
   return true;
  }
  if(!target.closest('.cafe-scheduler'))return false;
  removeHover();
  const source=target.dataset.cafeScheduleSource,id=target.dataset.cafeScheduleId;
  const row=source==='reservation'?find(id):findLedger(id);
  if(!row||(source==='ledger'&&!ledgerEditable()))return false;
  drag={pointerId:e.pointerId,target,lane:target.closest('.cafe-scheduler-lane'),x:e.clientX,y:e.clientY,source,id,
   start:row.booking_start_time?.slice(0,5),court:source==='ledger'?normalizedCourt(row,sport):row.court_number,
   duration:durationOf(row),moved:false};
  target.setPointerCapture?.(e.pointerId);
  return true;
 }
 function pointerMove(e){
  if(slotSelection&&e.pointerId===slotSelection.pointerId){
   const sel=slotSelection;
   if(!sel.dragged&&Math.hypot(e.clientX-sel.x,e.clientY-sel.y)>6){
    sel.dragged=true;
    sel.node.classList.add('is-dragging');
    try{sel.lane.setPointerCapture?.(e.pointerId)}catch{}
   }
   if(sel.dragged){
    sel.focus=pointerMinute(sel.lane,e.clientY);
    drawSlot(sel.node,courtSchedulerSelection(sel.anchor,sel.focus,true));
    if(e.cancelable)e.preventDefault();
   }
   return true;
  }
  if(!drag){showHoverSlot(e);return false;}
  if(e.pointerId!==drag.pointerId)return false;
  const dx=e.clientX-drag.x,dy=e.clientY-drag.y;
  if(!drag.moved&&Math.hypot(dx,dy)<9)return false;
  drag.moved=true;drag.target.classList.add('cafe-scheduler-dragging');
  drag.target.style.transform='translate('+dx+'px,'+dy+'px)';
  e.preventDefault();
  return true;
 }
 async function pointerUp(e){
  if(slotSelection&&e.pointerId===slotSelection.pointerId){
   const sel=slotSelection,selected=courtSchedulerSelection(sel.anchor,sel.focus,sel.dragged);
   removeSelection();
   if(!sel.dragged)return false; // existing click handler opens the default one-hour slot
   skipClickUntil=Date.now()+700;
   openEditor('reservation',null,sel.lane.dataset.court,clock(selected.startMinute),selected.durationMinutes,matchpointPrimaryActive?'block':null);
   return true;
  }
  if(!drag||e.pointerId!==drag.pointerId)return false;
  const state=drag;drag=null;
  if(!state.moved)return false;
  skipClickUntil=Date.now()+700;
  const lanes=Array.from(document.querySelectorAll('.cafe-scheduler .cafe-scheduler-lane'));
  const dest=lanes.find(node=>{const b=node.getBoundingClientRect();return e.clientX>=b.left&&e.clientX<=b.right&&e.clientY>=b.top&&e.clientY<=b.bottom;});
  const resetPreview=()=>{
   const target=state.target;
   target.classList.remove('cafe-scheduler-dragging','cafe-scheduler-move-preview','cafe-scheduler-move-saving');
   target.classList.add('cafe-scheduler-move-return');
   target.removeAttribute('data-move-preview');target.removeAttribute('aria-busy');
   target.style.transform='';
   globalThis.setTimeout(()=>target.classList.remove('cafe-scheduler-move-return'),130);
  };
  if(!dest){resetPreview();return true;}
  const court=dest.dataset.court;
  const start=courtSchedulerMove(state.start,state.duration,e.clientY-state.y);
  // Imported bookings may be moved locally; remote changes must be coordinated in MatchPoint.
  if(!start||(court===state.court&&start===state.start)){resetPreview();return true;}
  const sourceBounds=state.lane.getBoundingClientRect(),destBounds=dest.getBoundingClientRect();
  const deltaX=destBounds.left-sourceBounds.left;
  const deltaY=(timeMinute(start)-timeMinute(state.start))*COURT_GRID_HOUR_HEIGHT/60;
  state.target.classList.remove('cafe-scheduler-dragging');
  state.target.classList.add('cafe-scheduler-move-preview');
  state.target.dataset.movePreview=court+' · '+start;
  state.target.style.transform='translate('+deltaX+'px,'+deltaY+'px)';
  if(typeof window!=='undefined'&&window.requestAnimationFrame)
   await new Promise(resolve=>window.requestAnimationFrame(()=>window.requestAnimationFrame(resolve)));
  const approved=globalThis.confirm?.('Move '+state.court+' '+state.start+' to '+court+' '+start+'? The saved reservation will update.');
  if(!approved){resetPreview();return true;}
  state.target.classList.add('cafe-scheduler-move-saving');state.target.setAttribute('aria-busy','true');
  try{await move(state.source,state.id,court,start)}
  catch(error){toast(error.message||'Could not move booking',true);await load(true)}
  finally{if(state.target.isConnected)resetPreview()}
  return true;
 }
 function cancelDrag(){
  removeHover();removeSelection();
  if(drag){drag.target.style.transform='';drag.target.classList.remove('cafe-scheduler-dragging');drag=null;}
 }
 // Open the same saved reservation from the court List view, with the correct date and sport.
 async function openPlanned(id,requestedSport,day){
  sportInfo(requestedSport);
  if(sport!==requestedSport){sport=requestedSport;editor=null;details=null;mobileCourt=sportInfo(requestedSport).courts[0];cancelDrag();}
  setDate(day);
  await load(true);
  if(loadedDate!==day)throw Error(error||'Could not load this reservation.');
  const target=find(id);
  if(!target)throw Error('Reservation no longer exists. Refresh first.');
  openEditor('reservation',id);
 }
 async function openFromFinance(kind,requestedSport,day){
  if(!['reservation','block','private_training'].includes(kind))throw Error('Unsupported booking type');
  sportInfo(requestedSport);
  if(kind==='private_training'&&requestedSport!=='padel')throw Error('Private client training is available for Padel only');
  if(sport!==requestedSport){sport=requestedSport;editor=null;details=null;mobileCourt=sportInfo(requestedSport).courts[0];cancelDrag();}
  setDate(day);
  await load(true);
  if(loadedDate!==day)throw Error(error||'Unable to load the court schedule');
  // After reloading, use the authoritative MatchPoint status (it may have
  // changed since the finance card rendered). The timetable uses the same
  // block-first behavior when normal bookings are imported from MatchPoint.
  const effectiveKind=kind==='reservation'&&matchpointPrimaryActive?'block':kind;
  openEditor('reservation',null,null,'18:00',null,effectiveKind);
  if(effectiveKind==='block'){editor.name='Maintenance';editor.fee=0;editor.cash=0;editor.whish=0;}
  if(effectiveKind==='private_training'){editor.name='';editor.fee=0;editor.cash=0;editor.whish=0;}
  details=null;rerender();
 }
 return {page,load,action,change,submit,reset,setDate,openPlanned,openFromFinance,dialog:()=>editorHTML()+detailsHTML(),pointerDown,pointerMove,pointerUp,cancelDrag,isGridMounted,
  getDate:()=>businessDate,isEditorOpen:()=>Boolean(editor),previewEnd,closeEditor};
}
