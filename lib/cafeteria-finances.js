import {COURT_LABELS,COURT_DURATION_OPTIONS,bookingMinutes,bookingEndTime,bookingCrossesMidnight,parseCourtBooking,courtPriceCents,sortCourtBookingsByTime} from './court-bookings.js';
import {padelCourtTimeGrid,courtBookingStartHours} from './court-timetable.js';
import {createCourtScheduler} from './court-scheduler-ui.js';
import {courtCashAdjustment,courtAllocation,courtSplitDisplay,courtSplitFormFields,isCourtCategory} from './court-payment-splits.js';
import {todayBeirut} from './date.js';
import {arabicClientName} from './arabic-client-names.js';
// Cafeteria daily cashbook. Kept separate from debts, coaching, and matchmaking.
export const CAFE_CATEGORIES=[
 {id:'padel_courts',label:'Padel Courts',kind:'court',direction:'income'},
 {id:'pickleball_courts',label:'Pickleball Courts',kind:'court',direction:'income'},
 {id:'basketball_courts',label:'Basketball Courts',kind:'court',direction:'income'},
 {id:'grips',label:'Grips',kind:'goods',direction:'income'},
 {id:'balls',label:'Balls',kind:'goods',direction:'income'},
 {id:'racket_rental',label:'Racket Rental',kind:'rental',direction:'income'},
 {id:'clothes',label:'Clothes',kind:'amount',direction:'income'},
 {id:'racket_sold',label:'Racket Sold',kind:'amount',direction:'income'},
 {id:'gymnastics',label:'Gymnastics',kind:'amount',direction:'income'},
 {id:'classes',label:'Classes',kind:'amount',direction:'income'},
 {id:'pt_gym',label:'PT Gym',kind:'amount',direction:'income'},
 {id:'summer_camp',label:'Summer Camp',kind:'amount',direction:'income'},
 {id:'shoes',label:'Shoes',kind:'amount',direction:'income'},
 {id:'padel_academy',label:'Padel Academy',kind:'amount',direction:'income'},
 {id:'other_income',label:'Other Income',kind:'named',direction:'income'},
 {id:'general_payment',label:'General Payment',kind:'amount',direction:'expense'},
 {id:'coaches',label:'Coaches',kind:'amount',direction:'expense'},
 {id:'cafeteria_stock',label:'Cafeteria Stock',kind:'amount',direction:'expense'},
 {id:'family_debt',label:'Family Debt',kind:'amount',direction:'expense'},
 {id:'other_expense',label:'Other Payments',kind:'named',direction:'expense'}
];
export const CAFE_RENTAL_PRICE_CENTS=200;
export const cafePlayerCount=(categoryId,pickleballPlayers=4)=>categoryId==='basketball_courts'?6:categoryId==='pickleball_courts'&&Number(pickleballPlayers)===2?2:4;
const categoryMap=new Map(CAFE_CATEGORIES.map(c=>[c.id,c]));
// Retired categories remain in historical ledgers. Display their saved entries
// under an active category without changing their stored IDs or amounts.
const legacyIncomeTargets=Object.freeze({gym_membership:'pt_gym',basketball_academy:'other_income'});
const recordedCategory=id=>legacyIncomeTargets[id]||id;
const durationLabel=minutes=>minutes%60?`${Math.floor(minutes/60)?Math.floor(minutes/60)+' hr ':''}${minutes%60} min`:`${minutes/60} hr`;
const durationOptions=selected=>{
 const value=Number(selected),choices=Number.isInteger(value)&&!COURT_DURATION_OPTIONS.includes(value)?[...COURT_DURATION_OPTIONS,value].sort((a,b)=>a-b):COURT_DURATION_OPTIONS;
 return (selected===''?'<option value="" selected>Choose duration</option>':'')+choices.map(minutes=>'<option value="'+minutes+'" '+(value===minutes?'selected':'')+'>'+durationLabel(minutes)+'</option>').join('');
};
const entryDuration=entry=>{try{return bookingMinutes((entry.booking_start_time||'').slice(0,5),(entry.booking_end_time||'').slice(0,5))}catch{return ''}};
const timeLabel=value=>{const [hour,minute]=String(value||'').slice(0,5).split(':').map(Number);if(!Number.isInteger(hour)||!Number.isInteger(minute))return '';return `${hour%12||12}:${String(minute).padStart(2,'0')} ${hour<12?'AM':'PM'}`};

export function cafeMoneyCents(value){
 const raw=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a valid USD amount with up to two decimals.');
 const [whole,decimal='']=raw.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>100000000000)throw Error('Amount must be greater than zero and within the allowed limit.');
 return cents;
}
// Closing cash can be zero, unlike an individual sale or payment.
export function cafeNonnegativeCents(value){
 const raw=String(value??'').trim();
 if(/^0+(?:\.0{1,2})?$/.test(raw))return 0;
 return cafeMoneyCents(raw);
}
export function cafeQuantity(value){
 const raw=String(value??'').trim();
 if(!/^[1-9]\d*$/.test(raw))throw Error('Enter a whole quantity greater than zero.');
 const quantity=Number(raw);
 if(!Number.isSafeInteger(quantity)||quantity>9999)throw Error('Quantity must be between 1 and 9999.');
 return quantity;
}
export function cafeCourtNotes(raw){
 const notes=String(raw??'').trim();
 if(notes.length>1000)throw Error('Court notes cannot exceed 1000 characters.');
 return notes;
}
export function cafeEntryFromForm(categoryId, data){
 const category=categoryMap.get(categoryId);
 if(!category)throw Error('Unknown cafeteria category.');
 const name=String(data.name||'').trim();
 if(name.length>120)throw Error('Name is too long (120 characters max).');
 if((category.kind==='court'||category.kind==='named')&&!name)throw Error('Enter a name or description.');
 const pickleballPlayers=categoryId==='pickleball_courts'?Number(data.pickleball_player_count??4):null;
 if(categoryId==='pickleball_courts'&&![2,4].includes(pickleballPlayers))throw Error('Choose 2 or 4 pickleball players.');
 const visibleCount=cafePlayerCount(categoryId,pickleballPlayers);
 // The existing database stores four payment markers for pickleball; for
 // singles P3/P4 are always false and cannot be toggled.
 const checks=Array.from({length:cafePlayerCount(categoryId)},(_,i)=>i<visibleCount&&data['check'+i]==='on');
 let quantity=1, unitPriceCents=0, amountCents=0;
 if(category.kind==='goods'){
  quantity=cafeQuantity(data.quantity);
  unitPriceCents=cafeMoneyCents(data.unit_price);
  amountCents=quantity*unitPriceCents;
 }else if(category.kind==='rental'){
  quantity=cafeQuantity(data.quantity);
  unitPriceCents=CAFE_RENTAL_PRICE_CENTS;
  amountCents=quantity*unitPriceCents;
 }else amountCents=cafeMoneyCents(data.amount);
 if(!Number.isSafeInteger(amountCents)||amountCents>100000000000)throw Error('Total is above the maximum allowed.');
 return {
  category:categoryId,name,
  amount_cents:amountCents,quantity,unit_price_cents:unitPriceCents,
  checkmarks:category.kind==='court'?checks:[false,false,false,false],
  ...(categoryId==='pickleball_courts'?{pickleball_player_count:pickleballPlayers}:{}),
  ...(category.kind==='court'?{court_notes:cafeCourtNotes(data.court_notes),...(parseCourtBooking(categoryId,data)||{})}:{})
 };
}
// Read-only receipts from the existing Private Sessions history.
 // Session charges are not receipts; only the money paid at a session and new deposits count.
export function cafePrivatePayments(entries,clients,day){
 const clientsById=new Map(clients.map(client=>[client.id,client]));
 return entries.filter(e=>!e.voided_at&&(!day||e.entry_date===day)).flatMap(e=>{
  const cents=e.entry_type==='session'?Number(e.paid_cents||0):
   e.entry_type==='deposit'?Number(e.deposit_cents||0):
   e.entry_type==='balance_close'?-Number(e.session_fee_cents||0):0;
  if(!Number.isSafeInteger(cents)||cents===0)return [];
  const client=clientsById.get(e.client_id);
  return [{
   id:e.id,clientName:client?.name||'Unknown client',
   clientArabicName:String(client?.arabic_name||'').trim(),
    payment_channel:e.payment_channel==='whish'?'whish':'cash',
   clientCode:String(client?.client_code||'').trim()||null,
   type:e.entry_type==='session'?'Session payment':
    e.entry_type==='deposit'?'Deposit / top-up':'Balance closed',
   amount_cents:cents,created_at:e.created_at||''
  }];
 }).sort((a,b)=>a.created_at.localeCompare(b.created_at)||String(a.id).localeCompare(String(b.id)));
}
// All private sessions (including unpaid sessions), for the Arabic coaching-hours grid.
export function cafePrivateSessions(entries,clients,day){
 const people=new Map(clients.map(client=>[client.id,client]));
 const createdOn=client=>{
  const created=new Date(String(client?.created_at||''));
  return Number.isFinite(created.getTime())?todayBeirut(created):'';
 };
 return entries.filter(e=>!e.voided_at&&e.entry_type==='session'&&(!day||e.entry_date===day))
  .map(e=>{
   const person=people.get(e.client_id);
   return {
    id:e.id,clientName:person?.name||'Unknown client',
    clientArabicName:String(person?.arabic_name||'').trim(),
    clientCode:String(person?.client_code||'').trim()||null,
    isNewClient:Boolean(day&&createdOn(person)===day),
    sessionFeeCents:Number(e.session_fee_cents||0),
    paidAtSessionCents:Number(e.paid_cents||0),
    entry_date:e.entry_date,created_at:e.created_at||''
   };
  }).sort((a,b)=>a.created_at.localeCompare(b.created_at)||String(a.id).localeCompare(String(b.id)));
}
export function cafePrivatePaymentsTotal(payments){
 return payments.filter(p=>p.payment_channel!=='whish').reduce((total,p)=>total+Number(p.amount_cents||0),0);
}
export function cafeTotals(entries,privatePayments=[],courtMovements=[]){
 const active=entries.filter(e=>!e.voided_at);
 const totalFor=direction=>active.filter(e=>categoryMap.get(recordedCategory(e.category))?.direction===direction)
   .reduce((sum,e)=>sum+Number(e.amount_cents||0),0);
 const cashPrivate=privatePayments.filter(p=>p.payment_channel!=='whish');
 const privateReceipts=cashPrivate.reduce((sum,p)=>sum+Math.max(0,Number(p.amount_cents||0)),0);
 const balanceClosings=cashPrivate.reduce((sum,p)=>sum+Math.max(0,-Number(p.amount_cents||0)),0);
 const income=totalFor('income')+privateReceipts+courtCashAdjustment(courtMovements),expenses=totalFor('expense')+balanceClosings;
 return {income,expenses,net:income-expenses,count:active.length};
}
export function cafeReconciliation(entries,closingCashCents=null,privatePayments=[],courtMovements=[]){
 const totals=cafeTotals(entries,privatePayments,courtMovements);
 if(closingCashCents===null || closingCashCents===undefined)return {
  ...totals,closingCash:null,totalGenerated:null,goodsSold:null
 };
 if(!Number.isSafeInteger(closingCashCents)||closingCashCents<0)throw Error('Invalid closing cash amount.');
 const totalGenerated=totals.expenses+closingCashCents;
 return {...totals,closingCash:closingCashCents,totalGenerated,goodsSold:totalGenerated-totals.income};
}
// Whish is a separate electronic wallet: its activity must never enter cash-desk
// income, payments, closing cash, or Goods Sold reconciliation.
export function whishSummary(transactions,openingBalanceCents=60,throughDate=null){
 if(!Number.isSafeInteger(openingBalanceCents)||openingBalanceCents<0)throw Error('Invalid Whish opening balance.');
 const valid=transactions.filter(row=>!row.voided_at&&
  (row.entry_type==='deposit'||row.entry_type==='withdrawal')&&
  (throughDate===null||row.entry_date<=throughDate));
 const deposits=valid.filter(row=>row.entry_type==='deposit')
   .reduce((sum,row)=>sum+Number(row.amount_cents||0),0);
 const withdrawals=valid.filter(row=>row.entry_type==='withdrawal')
   .reduce((sum,row)=>sum+Number(row.amount_cents||0),0);
 if(!Number.isSafeInteger(deposits)||!Number.isSafeInteger(withdrawals))throw Error('Whish totals exceed safe range.');
 return {opening:openingBalanceCents,deposits,withdrawals,balance:openingBalanceCents+deposits-withdrawals,count:valid.length};
}
export const WHISH_DESCRIPTION_PRESETS=Object.freeze({
 deposit:Object.freeze(['Goods Sold','Padel Courts']),
 withdrawal:Object.freeze(['Transfer from Whish to Miscellaneous Cash Box'])
});
// Group by the exact, saved description only within a selected date and transaction type.
// The original ledger rows remain distinct for audit and individual corrections.
export function groupWhishTransactions(entries,day,type){
 if(type!=='deposit'&&type!=='withdrawal')throw Error('Invalid Whish transaction type.');
 const groups=new Map();
 for(const entry of entries){
  if(entry.voided_at||entry.entry_date!==day||entry.entry_type!==type)continue;
  const name=String(entry.name??'');
  const amount=Number(entry.amount_cents);
  if(!Number.isSafeInteger(amount)||amount<1)throw Error('Invalid Whish transaction amount.');
  if(!groups.has(name))groups.set(name,{name,amount_cents:0,count:0,entries:[]});
  const group=groups.get(name);
  if(!Number.isSafeInteger(group.amount_cents+amount))throw Error('Whish group amount is too large.');
  group.amount_cents+=amount;
  group.count++;
  group.entries.push(entry);
 }
 return [...groups.values()];
}
export function whishFormEntry(type,data){
 if(type!=='deposit'&&type!=='withdrawal')throw Error('Invalid Whish transaction type.');
 const name=String(data.name||'').trim();
 if(name.length<1||name.length>120)throw Error('Enter a Whish name (1 to 120 characters).');
 return {entry_type:type,name,amount_cents:cafeMoneyCents(data.amount)};
}
// Court list rows include scheduled reservations without posting them as cashbook entries.
export function cafeCourtListEntries(financeRows=[],reservations=[],categoryId,sport){
 const recorded=financeRows.filter(row=>row&&!row.voided_at&&recordedCategory(row.category)===categoryId);
 const planned=reservations.filter(row=>row&&row.status!=='cancelled'&&(row.sport||'padel')===sport)
  .map(row=>({...row,__plannedReservation:true,category:categoryId,
   name:row.customer_name||(row.private_client_id?'Private client training':row.booking_type==='block'?'Court blocked':'Reservation')}));
 return sortCourtBookingsByTime([...recorded,...planned]);
}
export function createCafeteriaFinances({api,heading,icon,amount,today,addDays,rerender,toast,isAdmin,canVoid=()=>isAdmin(),exportArabicPdf,renderShiftHandover=()=>'',onShiftDateChanged=()=>{}}){
 let date=today(),rows=[],plannedReservations=[],reservationListError='',privatePayments=[],privateSessions=[],closingCash=null,whishRows=[],whishOpening=60,courtSplits=[],courtMovements=[],splitEditId=null,
 dayClosing=null,editCourtId=null,editCourtNoteId=null,quickOpen=false,quickCategory='padel_courts',courtView='list',loaded=false,loading=false,writing=false,error='',requestNumber=0;
 const canEdit=()=>!dayClosing||!['closed','approved'].includes(dayClosing.status);
 const scheduler=createCourtScheduler({api,today,addDays,rerender,toast,
  onLedgerChanged:async()=>{await load(true,true);rerender();},
  onLedgerPaymentEdit:async id=>{
   if(date!==scheduler.getDate()){setDate(scheduler.getDate());await load();}
   if(!canEdit()||date!==today())throw Error('Payment splits can only be edited on an open current financial day.');
   if(!rows.some(e=>e.id===id&&isCourtCategory(e.category)&&!e.voided_at))throw Error('Booking not found in this financial day.');
   splitEditId=id;courtView='list';rerender();
  }});
 const pdfSource=()=>{
  const closingByEntry=new Map(privatePayments.filter(p=>Number(p.amount_cents)<0).map(p=>[p.id,p]));
  return {
   date,rows:rows.map(x=>({...x})),privatePayments:privatePayments.map(x=>({...x,entry_date:date})),
   privateSessions:privateSessions.map(x=>({...x})),closingCash,
    courtMovements:courtMovements.map(x=>({...x})),
   whishRows:whishRows.map(x=>{
    const closing=closingByEntry.get(x.source_private_entry_id);
    return closing?{...x,name:'تسكير حساب '+arabicClientName(closing.clientName,closing.clientArabicName)+' ('+(closing.clientCode||'—')+')'}:{...x};
   }),whishOpening
  };
 };
 const openGroups=new Map();
 const expandedCourtNotes=new Set();
 const pendingPlayerUpdates=new Set();
 const pendingPrivatePayments=new Set();
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=cents=>amount(cents);
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&value<=today();
 const categories=direction=>CAFE_CATEGORIES.filter(c=>c.direction===direction);
 function setDate(value){
  if(!validDate(value))throw Error('Choose a valid date no later than today.');
  if(value===date)return false;
  date=value;rows=[];plannedReservations=[];reservationListError='';privatePayments=[];privateSessions=[];closingCash=null;whishRows=[];courtSplits=[];courtMovements=[];splitEditId=null;dayClosing=null;editCourtId=null;editCourtNoteId=null;expandedCourtNotes.clear();quickOpen=false;loaded=false;loading=false;error='';requestNumber++;onShiftDateChanged(date);scheduler.setDate(date);return true;
 }
 async function load(force=false,silent=false){
  if(!api.getSession()?.access_token)return;
  if(loading)return;
  if(loaded&&!force)return;
  const requestedDate=date,seq=++requestNumber;
  loading=true;error='';if(!silent)rerender();
  try{
   const [result,day,payments,clients,whishEntries,whishSettings,closings,paymentSplits,paymentMovements,planned]=await Promise.all([
    api.listAll('cafeteria_finance_entries','entry_date=eq.'+requestedDate+'&order=created_at.asc'),
    api.listAll('cafeteria_finance_days','day_date=eq.'+requestedDate),
    api.listAll('private_ledger_entries','entry_date=eq.'+requestedDate+'&order=created_at.asc'),
    api.listAll('private_clients'),
    api.listAll('whish_ledger_entries','order=entry_date.asc,created_at.asc'),
    api.listAll('whish_wallet_settings'),
    api.listAll('cafeteria_day_closings','day_date=eq.'+requestedDate),
    api.listAll('court_payment_splits','payment_date=eq.'+requestedDate),
    api.listAll('court_payment_cash_movements','entry_date=eq.'+requestedDate),
    // Reservation visibility is optional: a timetable API outage must never blank financial records.
    Promise.resolve().then(()=>api.listAll('padel_court_reservations','business_date=eq.'+requestedDate+'&order=booking_start_time.asc'))
     .then(records=>({records,error:''}))
     .catch(e=>({records:[],error:String(e.message||'Reservations unavailable')}))
   ]);
   if(seq!==requestNumber||date!==requestedDate||!api.getSession()?.access_token)return;
   // Never reconcile with a partial private-payment feed.
   rows=result;
   plannedReservations=planned.records;
   reservationListError=planned.error;
    privatePayments=cafePrivatePayments(payments,clients,requestedDate);
   privateSessions=cafePrivateSessions(payments,clients,requestedDate);
   closingCash=day.length?Number(day[0].closing_cash_cents):null;
   whishRows=whishEntries.filter(item=>item.entry_type==='deposit'||item.entry_type==='withdrawal');
   whishOpening=whishSettings.length?Number(whishSettings[0].opening_balance_cents):60;
   dayClosing=closings[0]||null;
    courtSplits=paymentSplits.filter(split=>!split.voided_at);
   const splitById=new Map(courtSplits.map(split=>[split.id,split]));
   const ledgerById=new Map(rows.map(entry=>[entry.id,entry]));
   courtMovements=paymentMovements.map(movement=>{
    const split=splitById.get(movement.split_id);
    const category=split?.source_kind==='ledger'?ledgerById.get(split.source_id)?.category:'padel_courts';
    return {...movement,court_category:category||'padel_courts'};
   });
   if(!canEdit()||!rows.some(e=>e.id===editCourtId&&!e.voided_at&&categoryMap.get(e.category)?.kind==='court'))editCourtId=null;
   if(!canEdit()||!rows.some(e=>e.id===editCourtNoteId&&!e.voided_at&&categoryMap.get(e.category)?.kind==='court'))editCourtNoteId=null;
   if(date!==today()||!canEdit())splitEditId=null;
   // Validate the fetched wallet configuration rather than displaying a fabricated balance.
   whishSummary(whishRows,whishOpening);
   loaded=true;
  }catch(e){
   if(seq===requestNumber&&date===requestedDate){
    loaded=false;error='Could not load Cafeteria Finances, Private Sessions, or Whish: '+(e.message||'Unknown error')+'. Try refreshing, or contact an administrator if the problem continues.';
   }
  }finally{if(seq===requestNumber){loading=false;if(!silent)rerender();
    if(courtView==='timetable'&&!scheduler.isEditorOpen())void scheduler.load(true);}}
 }
 const marks=(values,entryId='',count=4)=>'<div class="cafe-marks" role="group" aria-label="Players paid">'+
  Array.from({length:count},(_,i)=>'<label title="Player '+(i+1)+' paid"><input type="checkbox" '+(values?.[i]?'checked ':'')+
   (entryId?'data-cafe-marker="'+escapeHtml(entryId)+'" data-marker-index="'+i+'"':'name="check'+i+'"')+
   ' aria-label="Player '+(i+1)+' paid"><span>P'+(i+1)+'</span></label>').join('')+'</div>';
 function formFor(category){
  const kind=category.kind;
  let fields='';
  if(kind==='court'||kind==='named'){
   fields+='<label class="cafe-input-label">'+(kind==='court'?'Booking / names':'Source / description')+
    '<input required name="name" type="text" maxlength="120" placeholder="'+(kind==='court'?'Names or booking':'What was it for?')+'"></label>';
  }else if(kind==='amount'){
   fields+='<label class="cafe-input-label">Details (optional)<input name="name" type="text" maxlength="120" placeholder="Reference / note"></label>';
  }
  if(kind==='court')fields+=(category.id==='padel_courts'?'<label class="cafe-input-label">Court<select name="court_number" required>'+
   '<option value="">Select court</option>'+COURT_LABELS.map(c=>'<option value="'+c+'">'+c+'</option>').join('')+'</select></label>':'')+
   '<label class="cafe-input-label">Start time<input name="booking_start_time" type="time" step="900" required></label>'+
   '<label class="cafe-input-label">Duration<select name="booking_duration_minutes" required>'+durationOptions(60)+'</select></label>'+
   (category.id==='pickleball_courts'?'<label class="cafe-input-label">Players<select name="pickleball_player_count" required>'+
    '<option value="2">2 players (singles)</option><option value="4" selected>4 players (doubles)</option></select></label>':'');
  if(kind==='goods'||kind==='rental'){
   fields+='<label class="cafe-input-label">Quantity<input required name="quantity" type="number" min="1" max="9999" step="1" value="1"></label>';
   fields+=kind==='goods'?'<label class="cafe-input-label">Price each ($)<input required name="unit_price" type="number" min="0.01" step="0.01" placeholder="2.00"></label>':
    '<div class="cafe-fixed-rate">Fixed price <strong>$2.00 per racket</strong></div>';
  }else fields+='<label class="cafe-input-label">Amount ($)<input required name="amount" type="number" min="0.01" step="0.01" placeholder="0.00"></label>';
  if(kind==='court'){
   fields+='<small data-court-price-note class="cafe-fixed-rate">'+(category.id==='pickleball_courts'?'Pickleball rates are per person, including rackets. Select players and times for the suggested total; you can override it.':'Set times to calculate a suggested price; you can override it.')+'</small>';
   fields+='<div class="cafe-new-marks"><span>Players paid ('+cafePlayerCount(category.id)+')</span>'+marks(Array(cafePlayerCount(category.id)).fill(false),'',cafePlayerCount(category.id))+'</div>';
   fields+='<details class="cafe-court-note-collapsible"><summary>Notes (optional)</summary>'+
    '<label class="cafe-input-label cafe-court-note-field"><span class="cafe-visually-hidden">Booking notes</span>'+
    '<textarea name="court_notes" maxlength="1000" rows="2" placeholder="Cafeteria items, drinks, or booking details"></textarea></label></details>';
  }
  return '<form class="cafe-entry-form" data-cafe-save="entry" data-category="'+category.id+'" '+(kind==='court'?'data-court-category="'+category.id+'"':'')+'><div class="cafe-form-fields">'+fields+
   '</div><button class="btn btn-primary btn-xs" type="submit">'+icon('plus')+' Add entry</button></form>';
 }
 function courtSplitFor(entry){return courtSplits.find(s=>s.source_kind==='ledger'&&s.source_id===entry.id)||null;}
 function paymentSplitForm(entry){
  const split=courtSplitFor(entry),values=courtSplitFormFields({total:entry.amount_cents,split,legacy:true});
  const fields=values.map(f=>'<label>'+escapeHtml(f.label)+'<input name="'+f.name+
   '" type="number" inputmode="decimal" min="0" max="1000000000" step="0.01" required value="'+f.value+'"></label>').join('');
  return '<form class="cafe-court-payment-form" data-cafe-save="court-payment" data-entry-id="'+escapeHtml(entry.id)+'">'+
   '<div class="cafe-court-payment-fields">'+fields+'</div>'+
   '<small data-court-payment-preview>Cash + Whish must equal the court price.</small>'+
   '<p class="cafe-court-payment-info">Whish goes automatically to Whish → Padel Courts. Do not add it again manually.</p>'+
   '<div class="cafe-court-payment-actions"><button type="submit" class="btn btn-primary btn-xs">Save payment breakdown</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="cafe-court-payment-cancel">Cancel</button></div></form>';
 }
 function courtPaymentTables(){
  const legacy=rows.filter(r=>isCourtCategory(r.category)&&!r.voided_at&&!courtSplitFor(r))
   .map(row=>({booking_name:row.name,source_kind:'legacy',amount_cents:Number(row.amount_cents),cash_cents:Number(row.amount_cents),whish_cents:0,unpaid_cents:0}));
  const all=[...courtSplits,...legacy];
  const table=(title,field,description)=>{
   const entries=all.filter(p=>Number(p[field])>0),sum=entries.reduce((n,p)=>n+Number(p[field]),0);
   const items=entries.length?'<div class="cafe-auto-payments-wrap"><table class="cafe-auto-payments"><thead><tr><th>Booking</th><th>Type</th><th>Received</th></tr></thead><tbody>'+
    entries.map(p=>'<tr><td>'+escapeHtml(p.booking_name||'Court booking')+
     (p.source_kind==='legacy'?'<small> · Legacy cash classification</small>':'')+'</td><td>'+escapeHtml(p.source_kind==='reservation'?'Reservation':'Court booking')+'</td><td>'+money(p[field])+'</td></tr>').join('')+
    '</tbody></table></div>':'<p class="cafe-no-entries">No '+title.toLowerCase()+' recorded for this date.</p>';
   return '<article class="panel cafe-court-payment-card"><div class="cafe-category-top"><h3>'+title+'</h3><strong>'+money(sum)+'</strong></div>'+
    '<p>'+description+'</p>'+items+'</article>';
  };
  
  return '<section class="cafe-payment-splits-section" aria-label="Court payments by channel"><div class="cafe-payment-splits-heading"><h3>Court Payments · Cash & Whish</h3>'+
   '<p>Full court price defaults to Cash; edit the Whish share when needed. Cash + Whish always equals the price.</p></div>'+
   '<div class="cafe-payment-split-totals"><span>Cash <b>'+money(all.reduce((s,p)=>s+Number(p.cash_cents||0),0))+'</b></span>'+
   '<span>Whish <b>'+money(all.reduce((s,p)=>s+Number(p.whish_cents||0),0))+'</b></span></div>'+
   '<div class="cafe-category-grid">'+table('Cash Court Payments','cash_cents','Money counted in the cash drawer.')+
   table('Whish Court Payments','whish_cents','Automatically reflected in Whish → Padel Courts.')+'</div></section>';
 }
 function existing(category){
  const visible=rows.filter(e=>recordedCategory(e.category)===category.id&&!e.voided_at);
  const sport={padel_courts:'padel',pickleball_courts:'pickleball',basketball_courts:'basketball'}[category.id];
  // Planned reservations are displayed alongside receipts, never included in cashbook totals.
  const items=category.kind==='court'?cafeCourtListEntries(rows,plannedReservations,category.id,sport):visible;
  if(!items.length)return '<div class="cafe-no-entries">No entries for this day yet.</div>';
  return '<div class="cafe-entry-list">'+items.map(e=>{
   if(e.__plannedReservation){
    const kind=e.private_client_id?'private_training':e.booking_type||'reservation';
    const label=kind==='block'?'Blocked court':kind==='private_training'?'Private training':'Reservation';
    const timing=[e.court_number||'Court',[timeLabel(e.booking_start_time),timeLabel(e.booking_end_time)].filter(Boolean).join(' – ')].filter(Boolean).join(' · ');
    return '<div class="cafe-ledger-entry cafe-planned-entry"><div class="cafe-ledger-row">'+
     '<div class="cafe-entry-description"><strong>'+escapeHtml(e.name)+'</strong>'+
     '<small>'+escapeHtml(timing)+'</small><small>Scheduled only · not a cashbook receipt</small></div>'+
     '<div class="cafe-entry-actions"><span class="cafe-planned-pill">'+escapeHtml(label)+' · '+escapeHtml(e.status==='tentative'?'Tentative':'Confirmed')+'</span>'+
     '<button type="button" class="btn btn-light btn-xs" data-action="cafe-open-planned" data-id="'+escapeHtml(e.id)+'" data-sport="'+escapeHtml(sport)+'">Edit in timetable</button>'+
     '</div></div></div>';
   }
   const detail=category.kind==='goods'?e.quantity+' × '+money(e.unit_price_cents):
    category.kind==='rental'?e.quantity+' racket'+(e.quantity===1?'':'s')+' × $2.00':
    e.name||category.label;
   return '<div class="cafe-ledger-entry"><div class="cafe-ledger-row"><div class="cafe-entry-description"><strong>'+
    escapeHtml(detail)+'</strong>'+
    (category.id==='pickleball_courts'?'<small>'+escapeHtml(cafePlayerCount(category.id,e.pickleball_player_count)+' players · rackets included')+'</small>':'')+
    (category.kind==='court'&&(e.court_number||e.booking_start_time)?
     '<small>'+escapeHtml([category.id==='padel_courts'?(e.court_number||'Unassigned'):null,[timeLabel(e.booking_start_time),timeLabel(e.booking_end_time)+(bookingCrossesMidnight((e.booking_start_time||'').slice(0,5),(e.booking_end_time||'').slice(0,5))?' next day':'')].filter(Boolean).join(' – ')].filter(Boolean).join(' · '))+'</small>':'')+
    ((category.kind==='goods'||category.kind==='rental')&&e.name?'<small>'+escapeHtml(e.name)+'</small>':'')+
    '</div><div class="cafe-entry-actions"><b>'+money(e.amount_cents)+'</b>'+
    (category.kind==='court'?'<button type="button" class="btn btn-light btn-xs" data-action="cafe-court-payment-edit" data-id="'+escapeHtml(e.id)+'" '+(canEdit()&&date===today()?'':'disabled ')+'title="Adjust Cash and Whish">Payments</button>':'')+
    (category.kind==='court'?'<button type="button" class="cafe-edit-amount" data-action="cafe-court-amount-edit" data-id="'+escapeHtml(e.id)+'" '+(canEdit()?'':'disabled ')+
      'aria-label="Edit court amount for '+escapeHtml(e.name||category.label)+'" title="'+(canEdit()?'Edit court booking amount':'Day is closed or approved. Ask an administrator to reopen it.')+'">Edit</button>':'')+
    (canVoid()&&canEdit()?'<button type="button" class="cafe-remove" data-action="cafe-void" data-id="'+escapeHtml(e.id)+'" title="Void entry" aria-label="Void entry">'+icon('trash')+'</button>':'')+
    '</div></div>'+
    (category.kind==='court'&&splitEditId===e.id?paymentSplitForm(e):'')+
    (category.kind==='court'&&canEdit()&&editCourtId===e.id?
     '<form class="cafe-court-amount-form" data-cafe-save="court-amount" data-court-category="'+category.id+'" data-entry-id="'+escapeHtml(e.id)+'">'+
      (category.id==='padel_courts'?'<label>Court<select name="court_number"><option value="">Unassigned</option>'+COURT_LABELS.map(c=>'<option value="'+c+'" '+(e.court_number===c?'selected':'')+'>'+c+'</option>').join('')+'</select></label>':'')+
      '<label>Start time<input name="booking_start_time" type="time" step="900" value="'+escapeHtml((e.booking_start_time||'').slice(0,5))+'"></label>'+
      '<label>Duration<select name="booking_duration_minutes">'+durationOptions(entryDuration(e))+'</select></label>'+
      (category.id==='pickleball_courts'?'<label>Players<select name="pickleball_player_count">'+
       '<option value="2"'+(Number(e.pickleball_player_count)===2?' selected':'')+'>2 players (singles)</option>'+
       '<option value="4"'+(Number(e.pickleball_player_count)!==2?' selected':'')+'>4 players (doubles)</option></select></label>':'')+
      '<small data-court-price-note class="cafe-fixed-rate">Changing time or players suggests a total; the price remains editable.</small>'+
      '<label>Booking amount ($)<input name="amount" type="number" inputmode="decimal" min="0.01" step="0.01" max="1000000000" required value="'+escapeHtml((Number(e.amount_cents)/100).toFixed(2))+'"></label>'+
      '<button type="submit" class="btn btn-primary btn-xs">Save</button>'+
      '<button type="button" class="btn btn-light btn-xs" data-action="cafe-court-amount-cancel">Cancel</button>'+
     '</form>':'')+
    (category.kind==='court'?'<div class="cafe-existing-marks"><span>Players paid</span>'+marks(e.checkmarks,e.id,cafePlayerCount(category.id,e.pickleball_player_count)).replace(/<input /g,'<input '+(canEdit()?'':'disabled '))+'</div>':'')+
    (category.kind==='court'?'<details class="cafe-booking-notes" data-cafe-note="'+escapeHtml(e.id)+'" '+
     (expandedCourtNotes.has(e.id)||editCourtNoteId===e.id?'open':'')+'>'+
     '<summary class="cafe-booking-notes-title"><span>Notes</span>'+
     (e.court_notes?'<small>Saved</small>':'')+'</summary>'+
     '<div class="cafe-booking-notes-content">'+
     (e.court_notes?'<p class="cafe-booking-note-text">'+escapeHtml(e.court_notes)+'</p>':
      '<small class="cafe-booking-note-empty">No notes yet</small>')+
     (canEdit()?'<button type="button" class="cafe-note-edit-button" data-action="cafe-court-notes-edit" data-id="'+escapeHtml(e.id)+'">'+
      (editCourtNoteId===e.id?'Close editor':e.court_notes?'Edit notes':'Add notes')+'</button>':'')+
     (canEdit()&&editCourtNoteId===e.id?
      '<form class="cafe-court-notes-form" data-cafe-save="court-notes" data-entry-id="'+escapeHtml(e.id)+'">'+
       '<label>Booking notes<textarea name="court_notes" rows="3" maxlength="1000" placeholder="Cafeteria items, drinks, or booking details">'+
       escapeHtml(e.court_notes||'')+'</textarea></label>'+
       '<div class="cafe-court-notes-actions"><button type="submit" class="btn btn-primary btn-xs">Save notes</button>'+
       '<button type="button" class="btn btn-light btn-xs" data-action="cafe-court-notes-cancel">Cancel</button></div></form>':'')+
     '</div></details>':'')+'</div>';
  }).join('')+'</div>';
 }
 function card(category){
  const subTotal=rows.filter(e=>!e.voided_at&&recordedCategory(e.category)===category.id).reduce((sum,e)=>sum+Number(e.amount_cents||0),0);
  return '<section class="panel cafe-category-card"><div class="cafe-category-top"><h3>'+escapeHtml(category.label)+'</h3><strong>'+money(subTotal)+'</strong></div>'+
   (canEdit()?formFor(category):'')+existing(category)+'</section>';
 }
 function privatePaymentsCard(){
  const cash=cafePrivatePaymentsTotal(privatePayments);
  const whish=privatePayments.filter(p=>p.payment_channel==='whish').reduce((n,p)=>n+Number(p.amount_cents||0),0);
  const table=privatePayments.length?
   '<div class="cafe-auto-payments-wrap"><table class="cafe-auto-payments"><thead><tr><th>Client name</th><th>Client ID</th><th>Payment type</th><th>Amount paid</th><th>Cash</th></tr></thead><tbody>'+
   privatePayments.map(p=>'<tr><td>'+escapeHtml(p.clientName)+'</td><td>'+escapeHtml(p.clientCode||'Not assigned')+'</td><td>'+escapeHtml(p.type)+'</td><td>'+money(p.amount_cents)+'</td>'+
    '<td class="cafe-payment-channel-cell"><label class="cafe-payment-channel-toggle" title="Checked = cash; unchecked = Whish">'+
    '<input type="checkbox" data-cafe-private-cash="'+escapeHtml(p.id)+'" aria-label="Include '+escapeHtml(p.clientName)+' payment in cash" '+
    (p.payment_channel==='whish'?'':'checked ')+(canEdit()&&!pendingPrivatePayments.has(p.id)?'':'disabled ')+
    '/><span>'+(p.payment_channel==='whish'?'Whish':'Cash')+'</span></label></td></tr>').join('')+
   '</tbody></table></div>':
   '<div class="cafe-no-entries">No Private Sessions payments received on this date.</div>';
  return '<section class="panel cafe-category-card cafe-private-payments-card"><div class="cafe-category-top"><h3>Client Private Sessions Payments</h3><strong>'+money(cash)+'</strong></div>'+
   '<div class="cafe-private-payment-totals"><span>Cash: <b>'+money(cash)+'</b></span><span>Whish: <b>'+money(whish)+'</b></span></div>'+
   '<p class="cafe-auto-payment-info">Checked = cash entry. Unchecked = Whish, included in the Whish wallet and Arabic PDF. To make corrections, open Private Sessions. If a Whish payment was also manually entered, correct the duplicate.</p>'+
   table+'<button type="button" class="btn btn-light btn-xs" data-tab="private-clients">Open Private Sessions</button></section>';
 }
 function whishTransactionCard(type){
  const isDeposit=type==='deposit';
  const title=isDeposit?'Whish Deposits':'Whish Withdrawals';
  const presetButtons=WHISH_DESCRIPTION_PRESETS[type].map((name,i)=>
   '<button type="button" class="btn btn-light whish-preset-btn" data-action="cafe-whish-preset" data-whish-type="'+type+
   '" data-preset-index="'+i+'">'+escapeHtml(name)+'</button>').join('');
  const groups=groupWhishTransactions(whishRows,date,type);
  const sum=groups.reduce((n,g)=>n+g.amount_cents,0);
  const correctionButton=e=>e.source_court_split_id?'<small class="whish-correction-hint">Edit court Payments instead</small>':e.source_private_entry_id?'<small class="whish-correction-hint">Change Cash checkbox above</small>':'<button type="button" class="cafe-remove" data-action="cafe-whish-void" data-id="'+escapeHtml(e.id)+
    '" title="Void Whish entry" aria-label="Void Whish entry">'+icon('trash')+'</button>';
  const groupRow=group=>{
   const multiple=group.count>1;
   const details=multiple?
    '<details class="whish-group-details"><summary>'+group.count+' transactions · View details</summary>'+
    '<div class="whish-group-items">'+group.entries.map((entry,i)=>
     '<div class="whish-group-item"><span>Entry '+(i+1)+'</span><strong>'+money(entry.amount_cents)+'</strong>'+
     (canVoid()&&canEdit()?correctionButton(entry):'')+'</div>').join('')+'</div></details>':'';
   return '<tr><td><span class="whish-group-label">'+escapeHtml(group.name)+'</span>'+details+'</td>'+
    '<td>'+money(group.amount_cents)+'</td>'+
    (canVoid()&&canEdit()?'<td>'+(multiple?'<small class="whish-correction-hint">See details</small>':correctionButton(group.entries[0]))+'</td>':'')+'</tr>';
  };
  const table=groups.length?
   '<div class="cafe-auto-payments-wrap"><table class="cafe-auto-payments whish-table"><thead><tr><th>Name</th><th>Total</th>'+
    (canVoid()&&canEdit()?'<th class="whish-action-col">Correction</th>':'')+'</tr></thead><tbody>'+
    groups.map(groupRow).join('')+'</tbody></table></div>':
   '<div class="cafe-no-entries">No '+(isDeposit?'deposits':'withdrawals')+' on this date.</div>';
  return '<section class="panel cafe-category-card whish-transaction-card"><div class="cafe-category-top"><h3>'+title+'</h3><strong>'+money(sum)+'</strong></div>'+
   (canEdit()?'<form class="cafe-entry-form" data-cafe-save="whish" data-whish-type="'+type+'">'+
   '<div class="whish-quick-descriptions"><span>Common descriptions</span><div class="whish-quick-options">'+presetButtons+'</div></div>'+
   '<div class="cafe-form-fields">'+
   '<label class="cafe-input-label">Name / description<input name="name" required maxlength="120" placeholder="Who / what for?"></label>'+
   '<label class="cafe-input-label">Amount ($)<input name="amount" required type="number" min="0.01" step="0.01" placeholder="0.00"></label></div>'+
   '<button type="submit" class="btn btn-primary btn-xs">'+icon('plus')+' Add '+(isDeposit?'Deposit':'Withdrawal')+'</button></form>':'')+
   table+'</section>';
 }
 function whishSection(){
  const current=whishSummary(whishRows,whishOpening);
  const day=whishSummary(whishRows,whishOpening,date);
  const selected=whishRows.filter(e=>e.entry_date===date&&!e.voided_at);
  const dayTotals=whishSummary(selected,0);
  return '<section class="whish-section" aria-label="Whish wallet transactions">'+

   '<div class="whish-balance-grid"><article class="panel whish-balance-card"><span>Current Whish balance</span>'+
    '<strong>'+money(current.balance)+'</strong>'+
    (current.balance<0?'<small class="whish-negative">Negative balance — check your Whish transactions.</small>':'')+
   '</article><article class="panel whish-day-card"><span>Selected-day activity</span>'+
    '<div><strong>+'+money(dayTotals.deposits)+'</strong><strong>−'+money(dayTotals.withdrawals)+'</strong></div>'+
    '<small>Balance through '+escapeHtml(date)+': '+money(day.balance)+'</small></article></div>'+
   '<div class="cafe-category-grid whish-tables">'+whishTransactionCard('deposit')+whishTransactionCard('withdrawal')+'</div>'+
   '</section>';
 }
 // Booking operations are owned by the staff scheduler, not financial calculations.
 function timetable(){return scheduler.page();}
 function page(){
  const totals=cafeReconciliation(rows,closingCash,privatePayments,courtMovements);
  const header=heading('Daily receipts & payments','Cafeteria Finances','Record daily court income, sales, activities, and payments.');
  const dateControls='<div class="cafe-datebar"><div><strong>'+icon('calendar')+' Daily ledger</strong><small>Daily records · Beirut time</small></div><div class="cafe-date-actions">'+
   '<button type="button" class="btn btn-light btn-icon" data-action="cafe-prev-date" aria-label="Previous day">'+icon('chevronLeft')+'</button>'+
   '<input id="cafe-finance-date" type="date" aria-label="Ledger date" value="'+escapeHtml(date)+'" max="'+today()+'">'+
   '<button type="button" class="btn btn-light btn-icon" data-action="cafe-next-date" aria-label="Next day" '+(date>=today()?'disabled':'')+'>'+icon('chevronRight')+'</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="cafe-today">Today</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="cafe-reload">'+icon('refresh')+' Refresh</button>'+
   '<button type="button" class="btn btn-primary btn-xs" data-action="cafe-export-arabic-pdf" '+(!loaded||loading?'disabled':'')+'>'+icon('download')+' View Arabic Daily Sheet (PDF)</button>'+
   '</div></div>';
  if(!loaded)return header+dateControls+'<div class="notice '+(error?'warn':'')+'">'+escapeHtml(error||'Loading daily financial entries…')+'</div>';
  const summary='<div class="cafe-summary"><article><span>Recorded income (including private payments)</span><strong>'+money(totals.income)+'</strong></article><article><span>Payments made</span><strong>'+money(totals.expenses)+'</strong></article><article><span>Closing cash</span><strong>'+(closingCash===null?'Not entered':money(closingCash))+'</strong></article><article><span>Total generated today</span><strong>'+(totals.totalGenerated===null?'Pending cash count':money(totals.totalGenerated))+'</strong></article></div>';
  const fold=(title,inner,opened=false)=>'<details class="cafe-fold" data-cafe-fold="'+title+'" '+((openGroups.has(title)?openGroups.get(title):opened)?'open':'')+'><summary>'+title+'</summary><div class="cafe-fold-body">'+inner+'</div></details>';
  const inc=categories('income');
  const courtSwitch='<div class="cafe-view-toggle" role="group" aria-label="Court booking display">'+
  '<button type="button" data-action="cafe-court-view" data-view="list" class="'+(courtView==='list'?'active':'')+'" aria-pressed="'+(courtView==='list')+'">List</button>'+
  '<button type="button" data-action="cafe-court-view" data-view="timetable" class="'+(courtView==='timetable'?'active':'')+'" aria-pressed="'+(courtView==='timetable')+'">Timetable</button></div>';
 const courtCards=(courtView==='list'&&reservationListError?
  '<p class="cafe-scheduler-notice" role="status">Reservations could not be loaded for this day. Court finance entries are still available. Use Refresh to retry.</p>':'')+
  '<div class="cafe-court-grid">'+inc.filter(c=>c.kind==='court').map(card).join('')+'</div>';
 const courts=fold('Court bookings',courtSwitch+
  (courtView==='timetable'?timetable()+'<p class="cafe-timetable-edit-hint">Full booking details and editable payment checkmarks remain below.</p>':'')+courtCards+courtPaymentTables(),true);
  const products=fold('Products & rentals','<div class="cafe-category-grid">'+inc.filter(c=>['goods','rental'].includes(c.kind)||['clothes','racket_sold'].includes(c.id)).map(card).join('')+'</div>');
  const activities=fold('Activities & other income','<div class="cafe-category-grid">'+inc.filter(c=>!['court','goods','rental'].includes(c.kind)&&!['clothes','racket_sold'].includes(c.id)).map(card).join('')+'</div>');
  const otherIncome=fold('Client Private Sessions Payments','<div class="cafe-category-grid">'+privatePaymentsCard()+'</div>');
  const expenses=fold('Payments & expenses','<div class="cafe-category-grid">'+categories('expense').map(card).join('')+'</div>',true);
  const whish=fold('Whish wallet',whishSection());
  const currentStatus=dayClosing?.status||'open';
  const titleStatus={open:'Open for entries',reopened:'Reopened for corrections',closed:'Submitted — awaiting approval',approved:'Approved'}[currentStatus];
  const controls=canEdit()?'<button class="btn btn-primary btn-xs" data-action="cafe-day-close" '+(closingCash===null||totals.goodsSold<0?'disabled':'')+'>Close day for review</button>':
    currentStatus==='closed'&&isAdmin()?'<button class="btn btn-primary btn-xs" data-action="cafe-day-approve">Approve day</button><button class="btn btn-light btn-xs" data-action="cafe-day-reopen">Reopen for corrections</button>':
    currentStatus==='approved'&&isAdmin()?'<button class="btn btn-light btn-xs" data-action="cafe-day-reopen">Reopen approved day</button>':'';
  const statusPanel='<section class="panel cafe-day-status"><div><strong>Daily closing: '+titleStatus+'</strong><p>'+
   (canEdit()?'Complete and verify the cash count, then submit this date for management approval.':
    'This day is read-only. An administrator must reopen it to allow corrections.')+
   '</p></div><div>'+controls+'</div></section>';
  const quickCard=canEdit()&&courtView==='list'?'<div class="cafe-quick-entry">'+
    (quickOpen?'<section class="panel cafe-quick-sheet"><div class="cafe-category-top"><h3>Quick transaction</h3><button type="button" class="btn btn-light btn-xs" data-action="cafe-quick-toggle">Close</button></div>'+
      '<label class="cafe-input-label">Category<select id="cafe-quick-category">'+CAFE_CATEGORIES.map(c=>'<option value="'+c.id+'" '+(c.id===quickCategory?'selected':'')+'>'+escapeHtml(c.label)+'</option>').join('')+'</select></label>'+
      '<div class="cafe-quick-form">'+formFor(categoryMap.get(quickCategory))+'</div></section>':'')+
    '<button type="button" class="btn btn-primary cafe-quick-fab" data-action="cafe-quick-toggle">'+icon('plus')+' New Transaction</button></div>':'';
  const cashForm=canEdit()?'<section class="panel cafe-closing-box"><div><h3>End-of-day cash count</h3><p>Enter the money remaining in the cash desk after today’s payments. You can update this amount if needed.</p></div>'+
   '<form class="cafe-closing-form" data-cafe-save="closing"><label class="cafe-input-label">Cash remaining ($)<input name="closing_cash" type="number" min="0" step="0.01" required value="'+(closingCash===null?'':(closingCash/100).toFixed(2))+'" placeholder="0.00"></label><button class="btn btn-primary" type="submit">'+icon('check')+' Save closing cash</button></form></section>':'';
  const negative=totals.goodsSold!==null&&totals.goodsSold<0;
  const goods='<section class="panel cafe-goods-pending '+(negative?'difference':totals.goodsSold===null?'':'reconciled')+'"><div><h3>Goods Sold (automatic)</h3><p>Based on closing cash, payments made, and other recorded income.</p>'+
   (negative?'<p class="cafe-difference-warning">Negative difference — review entries and the cash count; this is not a sale.</p>':'')+
   '</div><div class="cafe-goods-result"><strong>'+(totals.goodsSold===null?'—':money(totals.goodsSold))+'</strong><span>'+(totals.goodsSold===null?'Enter closing cash first':negative?'Discrepancy to investigate':'Calculated from today’s ledger')+'</span></div></section>';
  return header+dateControls+summary+statusPanel+renderShiftHandover(date,canEdit())+cashForm+goods+
   '<div class="cafe-note">'+icon('info')+' Private Session payments count as cash when checked; unchecked payments go to Whish. Mark the court players who paid. Cash calculations start at $0; include any carried-over cash.</div>'+
   courts+products+activities+otherIncome+expenses+whish+quickCard;
 }
 async function action(target,event){
  if(target.dataset.action?.startsWith('cafe-schedule-'))return scheduler.action(target,event);
  switch(target.dataset.action){
   case 'cafe-court-view':{
    if(target.dataset.view!=='list'&&target.dataset.view!=='timetable')throw Error('Unknown court display.');
    courtView=target.dataset.view;
    if(courtView==='timetable'){quickOpen=false;rerender();void scheduler.load(false);}
    else {await load(true,true);rerender();}
    return true;
   }
   case 'cafe-open-planned':{
    if(!plannedReservations.some(row=>row.id===target.dataset.id&&row.status!=='cancelled'))
     throw Error('This reservation is no longer on the list. Refresh and try again.');
    courtView='timetable';quickOpen=false;
    await scheduler.openPlanned(target.dataset.id,target.dataset.sport,date);
    return true;
   }
   case 'cafe-court-payment-edit':{
    if(!loaded||loading||writing||!canEdit()||date!==today())throw Error('Payment edits are available only on an open current day.');
    const entry=rows.find(e=>e.id===target.dataset.id&&!e.voided_at&&isCourtCategory(e.category));
    if(!entry)throw Error('Court entry not found.');
    splitEditId=splitEditId===entry.id?null:entry.id;
    if(splitEditId)editCourtId=null;
    rerender();return true;
   }
   case 'cafe-court-payment-cancel':splitEditId=null;rerender();return true;
   case 'cafe-court-amount-edit':{
    if(!loaded||loading||writing)throw Error('Wait for the current day to load.');
    if(!canEdit())throw Error('This day is closed.');
    const entry=rows.find(e=>e.id===target.dataset.id&&!e.voided_at&&e.entry_date===date);
    if(!entry||categoryMap.get(entry.category)?.kind!=='court')throw Error('Court entry not found.');
    editCourtId=editCourtId===entry.id?null:entry.id;
    if(editCourtId){editCourtNoteId=null;splitEditId=null;}
    rerender();return true;
   }
   case 'cafe-court-amount-cancel':
    editCourtId=null;rerender();return true;
   case 'cafe-court-notes-edit':{
    if(!loaded||loading||writing)throw Error('Wait for the current day to load.');
    if(!canEdit())throw Error('This day is closed.');
    const entry=rows.find(e=>e.id===target.dataset.id&&!e.voided_at&&e.entry_date===date);
    if(!entry||categoryMap.get(entry.category)?.kind!=='court')throw Error('Court entry not found.');
    editCourtNoteId=editCourtNoteId===entry.id?null:entry.id;
    if(editCourtNoteId){editCourtId=null;expandedCourtNotes.add(entry.id);}
    rerender();return true;
   }
   case 'cafe-court-notes-cancel':
    editCourtNoteId=null;rerender();return true;
   case 'cafe-quick-toggle':{
    if(!canEdit())throw Error('This day is closed.');
    quickOpen=!quickOpen;rerender();return true;
   }
   case 'cafe-day-close':
   case 'cafe-day-approve':
   case 'cafe-day-reopen':{
    if(!loaded||loading||writing)throw Error('Load the day first.');
    const act=target.dataset.action==='cafe-day-close'?'close':
      target.dataset.action==='cafe-day-approve'?'approve':'reopen';
    if(act==='close'){
     // Read the latest saved payment routing before accepting or rejecting
     // closing. Staff can change Cash to Whish while this page is displayed.
     if(pendingPrivatePayments.size)throw Error('A private payment is still saving. Try closing after it finishes.');
     const closingDate=date;
     await load(true,true);
     if(date!==closingDate||!loaded||loading)
       throw Error('Could not verify the latest cash figures. Refresh the date and try again.');
     // The displayed amount and the decision now use the same fresh records.
     rerender();
     if(!canEdit())throw Error('This day is already closed. Refresh to see its status.');
     if(closingCash===null)throw Error('Enter closing cash before submitting.');
     const latest=cafeReconciliation(rows,closingCash,privatePayments,courtMovements);
     if(latest.goodsSold<0)
       throw Error('Negative Goods Sold ('+money(latest.goodsSold)+') indicates a cash discrepancy. Correct the entries before closing.');
    }
    if(act!=='close'&&!isAdmin())throw Error('Administrators only.');
    let reason='';
    if(act==='reopen'){
      const prompted=globalThis.prompt?.('Reason for reopening this date (4 or more characters):');
      if(prompted===null||prompted===undefined)return true;
      reason=prompted.trim();if(reason.length<4)throw Error('Enter a reopening reason.');
    }
    writing=true;
    try{await api.rpc('cafeteria_change_day_status',{p_day_date:date,p_action:act,p_reason:reason});
      await load(true);toast(act==='close'?'Day submitted and locked.':act==='approve'?'Day approved.':'Day reopened.');}
    finally{writing=false;}
    return true;
   }
   case 'cafe-export-arabic-pdf':{
    if(!loaded||loading)throw Error('Wait for the daily records to finish loading.');
    if(typeof exportArabicPdf!=='function')throw Error('Arabic PDF export is unavailable.');
    // All source rows are read already; browser-only export must never store the PDF.
    const pages=exportArabicPdf(pdfSource());
    toast('Arabic daily sheet opened in a new tab'+(pages>1?' ('+pages+' pages)':'')+'.');
    return true;
   }
   case 'cafe-whish-preset':{
    const type=target.dataset.whishType;
    const index=Number(target.dataset.presetIndex);
    const description=Number.isInteger(index)&&WHISH_DESCRIPTION_PRESETS[type]?.[index];
    if(!description)throw Error('Invalid Whish quick description.');
    const form=target.closest('form[data-cafe-save="whish"]');
    if(!form||form.dataset.whishType!==type)throw Error('Whish form unavailable.');
    const input=form.querySelector('input[name="name"]');
    if(!input)throw Error('Whish description input unavailable.');
    input.value=description;
    input.focus();
    return true;
   }
   case 'cafe-prev-date':if(setDate(addDays(date,-1)))await load();return true;
   case 'cafe-next-date':if(date<today()&&setDate(addDays(date,1)))await load();return true;
   case 'cafe-today':if(setDate(today()))await load();return true;
   case 'cafe-reload':await load(true);return true;
   case 'cafe-whish-void':{
    if(!canEdit())throw Error('Day is closed.');
    if(!canVoid())throw Error('Only authorized staff can void Whish transactions.');
    const entry=whishRows.find(e=>e.id===target.dataset.id&&!e.voided_at);
    if(!entry)throw Error('Whish entry not found.');
     if(entry.source_private_entry_id)throw Error('Change the private payment Cash checkbox instead.');
     if(entry.source_court_split_id)throw Error('Change Whish through the court Payments breakdown instead.');
    const reason=globalThis.prompt?.('Why are you voiding this Whish transaction? (at least 4 characters)');
    if(reason===null||reason===undefined)return true;
    if(reason.trim().length<4||reason.trim().length>500)throw Error('Enter a correction reason between 4 and 500 characters.');
    if(writing)return true;writing=true;
    try{await api.rpc('whish_void_entry',{p_entry_id:entry.id,p_reason:reason.trim()});
      await load(true);toast('Whish entry voided.');}
    finally{writing=false;}
    return true;
   }
   case 'cafe-void':{
    if(!canEdit())throw Error('Day is closed.');
    if(!canVoid())throw Error('Only authorized staff can void financial entries.');
    const entry=rows.find(r=>r.id===target.dataset.id&&!r.voided_at);
    if(!entry)throw Error('Entry not found.');
    const reason=globalThis.prompt?.('Why are you voiding this entry? (at least 4 characters)');
    if(reason===null||reason===undefined)return true;
    if(reason.trim().length<4||reason.trim().length>500)throw Error('Enter a reason between 4 and 500 characters.');
    if(writing)return true;writing=true;
    try{await api.rpc('cafeteria_finance_void_entry',{p_entry_id:entry.id,p_reason:reason.trim()});await load(true);toast('Entry voided.');}
    finally{writing=false;}
    return true;
   }
   default:return false;
  }
 }
 async function submit(form){
  if(form.dataset.cafeSave==='schedule-reservation')return scheduler.submit(form);
  if(writing)return;
  if(!loaded||loading)throw Error('Wait for the current day to load.');
  if(!canEdit())throw Error('Day is closed.');
  if(form.dataset.cafeSave==='court-notes'){
   const entry=rows.find(e=>e.id===form.dataset.entryId&&!e.voided_at&&e.entry_date===date);
   if(!entry||categoryMap.get(entry.category)?.kind!=='court')throw Error('Court entry not found.');
   if(editCourtNoteId!==entry.id)throw Error('Please reopen the court notes editor.');
   const data=Object.fromEntries(new FormData(form).entries());
   const notes=cafeCourtNotes(data.court_notes);
   const expectedNotes=String(entry.court_notes||'');
   if(notes===expectedNotes){editCourtNoteId=null;rerender();toast('Booking notes unchanged.');return;}
   const button=form.querySelector('button[type="submit"]');
   writing=true;if(button)button.disabled=true;
   try{
    await api.rpc('cafeteria_finance_set_court_notes',{
     p_entry_id:entry.id,p_court_notes:notes,p_expected_notes:expectedNotes
    });
    editCourtNoteId=null;
    await load(true);
    toast('Court booking notes saved.');
   }finally{writing=false;if(button?.isConnected)button.disabled=false;}
   return;
  }
  if(form.dataset.cafeSave==='court-payment'){
   if(!canEdit()||date!==today())throw Error('Court payments can only be edited on the current open financial day.');
   const entry=rows.find(e=>e.id===form.dataset.entryId&&!e.voided_at&&isCourtCategory(e.category));
   if(!entry||splitEditId!==entry.id)throw Error('Reopen the court payment editor.');
   const data=Object.fromEntries(new FormData(form).entries());
   const value=cafeNonnegativeCents;
   const allocation=courtAllocation(value(data.total_amount),value(data.cash_amount),value(data.whish_amount),0);
   const split=courtSplitFor(entry);
   writing=true;
   try{
    await api.rpc('court_payment_split_save',{
     p_source_kind:'ledger',p_source_id:entry.id,p_total_cents:allocation.amount_cents,
     p_cash_cents:allocation.cash_cents,p_whish_cents:allocation.whish_cents,
     p_unpaid_cents:allocation.unpaid_cents,
     p_expected_revision:split?.revision||null,p_expected_total_cents:Number(entry.amount_cents)
    });
    splitEditId=null;await load(true);
    toast('Court payment split saved. Whish posted to Padel Courts and cash totals recalculated.');
   }finally{writing=false;}
   return;
  }
  if(form.dataset.cafeSave==='court-amount'){
   const entry=rows.find(e=>e.id===form.dataset.entryId&&!e.voided_at&&e.entry_date===date);
   if(!entry||categoryMap.get(entry.category)?.kind!=='court')throw Error('Court entry not found.');
   if(editCourtId!==entry.id)throw Error('Please reopen the court amount editor.');
   const data=Object.fromEntries(new FormData(form).entries());
   const newAmount=cafeMoneyCents(data.amount);
   const details=parseCourtBooking(entry.category,data);
   const oldCourt=entry.court_number||null;
   const oldStart=entry.booking_start_time?.slice(0,5)||null;
   const oldEnd=entry.booking_end_time?.slice(0,5)||null;
   const playerCount=entry.category==='pickleball_courts'?Number(data.pickleball_player_count):null;
   const existingPlayers=Number(entry.pickleball_player_count||4);
   if(entry.category==='pickleball_courts'&&![2,4].includes(playerCount))throw Error('Choose 2 or 4 pickleball players.');
   const changedPlayers=entry.category==='pickleball_courts'&&playerCount!==existingPlayers;
   const changedDetails=(details?.court_number||null)!==oldCourt||
    (details?.booking_start_time||null)!==oldStart||
    (details?.booking_end_time||null)!==oldEnd;
   if(courtSplitFor(entry)&&newAmount!==Number(entry.amount_cents))throw Error('Change the court price in the Payments breakdown to keep Cash + Whish balanced.');
   if(newAmount===Number(entry.amount_cents)&&!changedDetails&&!changedPlayers){
    editCourtId=null;rerender();toast('Court booking unchanged.');return;
   }
   const expectedAmount=Number(entry.amount_cents);
   const button=form.querySelector('button[type="submit"]');
   writing=true;if(button)button.disabled=true;
   try{
    if(entry.category==='pickleball_courts')await api.rpc('cafeteria_finance_update_pickleball_booking',{
     p_entry_id:entry.id,p_amount_cents:newAmount,p_expected_amount_cents:expectedAmount,
     p_start:details?.booking_start_time||null,p_end:details?.booking_end_time||null,
     p_expected_start:oldStart,p_expected_end:oldEnd,
     p_player_count:playerCount,p_expected_player_count:existingPlayers
    });
    else if(changedDetails)await api.rpc('cafeteria_finance_set_booking_details',{
     p_entry_id:entry.id,p_amount_cents:newAmount,p_expected_amount_cents:expectedAmount,
     p_court:details?.court_number||null,p_start:details?.booking_start_time||null,
     p_end:details?.booking_end_time||null,p_expected_court:oldCourt,
     p_expected_start:oldStart,p_expected_end:oldEnd
    });
    else await api.rpc('cafeteria_finance_set_court_amount',{
     p_entry_id:entry.id,p_amount_cents:newAmount,p_expected_amount_cents:expectedAmount
    });
    editCourtId=null;
    await load(true);
    toast('Court booking amount updated. Totals recalculated.');
   }finally{writing=false;if(button?.isConnected)button.disabled=false;}
   return;
  }
  const data=Object.fromEntries(new FormData(form).entries());
  const closing=form.dataset.cafeSave==='closing';
  const whish=form.dataset.cafeSave==='whish';
  if(!closing&&!whish&&form.dataset.cafeSave!=='entry')throw Error('Unknown finance form.');
  const cashValue=closing?cafeNonnegativeCents(data.closing_cash):null;
  const whishEntry=whish?whishFormEntry(form.dataset.whishType,data):null;
  const entry=closing||whish?null:cafeEntryFromForm(form.dataset.category,data);
  if(!validDate(date))throw Error('Invalid ledger date.');
  const savedDate=date;
  const button=form.querySelector('button[type="submit"]');
  writing=true;if(button)button.disabled=true;
  try{
   if(closing)await api.rpc('cafeteria_finance_set_closing_cash',{
     p_day_date:savedDate,p_closing_cash_cents:cashValue
   });
   else if(whish)await api.rpc('whish_record_entry',{
    p_entry_id:globalThis.crypto.randomUUID(),
    p_entry_date:savedDate,p_entry_type:whishEntry.entry_type,
    p_name:whishEntry.name,p_amount_cents:whishEntry.amount_cents
   });
   else await api.rpc(entry.category==='pickleball_courts'?'cafeteria_finance_record_pickleball_booking':categoryMap.get(entry.category)?.kind==='court'?'cafeteria_finance_record_court_booking':'cafeteria_finance_record_entry',{
    p_entry_id:globalThis.crypto.randomUUID(),
    p_entry_date:savedDate,p_category:entry.category,p_name:entry.name,
    p_amount_cents:entry.amount_cents,p_quantity:entry.quantity,
    p_unit_price_cents:entry.unit_price_cents,p_checkmarks:entry.checkmarks,
    ...(categoryMap.get(entry.category)?.kind==='court'?{p_court_notes:entry.court_notes}:{}),
    ...(entry.category==='pickleball_courts'?{p_player_count:entry.pickleball_player_count}:{}),
    ...(categoryMap.get(entry.category)?.kind==='court'&&entry.category!=='pickleball_courts'?{p_court:entry.court_number||null}:{}),
    ...(categoryMap.get(entry.category)?.kind==='court'?{p_start:entry.booking_start_time,p_end:entry.booking_end_time}:{})
   });
   await load(true);toast(closing?'Closing cash saved. Goods Sold recalculated.':whish?'Whish transaction saved; wallet balance updated.':'Financial entry saved.');
  }finally{writing=false;if(button?.isConnected)button.disabled=false;}
 }
 async function change(target){
  if(target.id==='cafe-schedule-date')return scheduler.change(target);
  if(target.id==='cafe-quick-category'){
    if(!categoryMap.has(target.value))throw Error('Unknown category.');
    quickCategory=target.value;rerender();return true;
   }
   if(target.id==='cafe-finance-date'){
   if(setDate(target.value))await load();return true;
  }
   if(target.dataset.cafePrivateCash!==undefined){
    if(!loaded||loading||writing)throw Error('Wait for the day to load.');
    const entry=privatePayments.find(p=>p.id===target.dataset.cafePrivateCash);
    if(!entry)throw Error('Private payment not found. Refresh the day.');
    if(!canEdit()){target.checked=!target.checked;throw Error('Day is closed. Ask an administrator to reopen it.');}
    if(pendingPrivatePayments.has(entry.id)){target.checked=!target.checked;return true;}
    const cash=target.checked;
    pendingPrivatePayments.add(entry.id);target.disabled=true;
    try{
     await api.rpc('private_set_payment_channel',{p_entry_id:entry.id,p_cash:cash});
     await load(true);
     toast(cash?'Payment included in cash.':'Payment included in Whish, not cash.');
    }catch(error){target.checked=!cash;throw error;}
    finally{pendingPrivatePayments.delete(entry.id);if(target.isConnected)target.disabled=false;}
    return true;
   }
   if(!target.dataset.cafeMarker)return false;
  if(!canEdit()){target.checked=!target.checked;throw Error('Day is closed.');}
  if(writing){target.checked=!target.checked;return true;}
  const entry=rows.find(e=>e.id===target.dataset.cafeMarker&&!e.voided_at);
  if(!entry||!categoryMap.has(entry.category)||categoryMap.get(entry.category).kind!=='court')throw Error('Court entry not found.');
  const index=Number(target.dataset.markerIndex);
  if(!Number.isInteger(index)||index<0||index>=cafePlayerCount(entry.category,entry.pickleball_player_count))throw Error('Invalid player number.');
  const key=entry.id+':'+index;
  if(pendingPlayerUpdates.has(key)){target.checked=!target.checked;return true;}
  const paid=target.checked;
  pendingPlayerUpdates.add(key);
  try{
   // Update only this player; another staff member's marks stay intact.
   await api.rpc('cafeteria_finance_set_player_paid',{p_entry_id:entry.id,p_player_no:index+1,p_paid:paid});
   entry.checkmarks[index]=paid;
  }catch(e){target.checked=!paid;throw e;}
  finally{pendingPlayerUpdates.delete(key);}
  return true;
 }
 function courtPricePreview(target){
  if(['total_amount','cash_amount','whish_amount'].includes(target.name)){
   const form=target.closest?.('form[data-cafe-save="court-payment"]');
   if(!form)return false;
   const field=name=>form.querySelector('[name="'+name+'"]');
   const note=form.querySelector('[data-court-payment-preview]');
   try{
    const total=cafeNonnegativeCents(field('total_amount').value);
    if(target.name==='cash_amount'){
     const cash=cafeNonnegativeCents(field('cash_amount').value);
     if(cash>total)throw Error('Cash cannot exceed court price.');
     field('whish_amount').value=((total-cash)/100).toFixed(2);
    }else{
     const whish=cafeNonnegativeCents(field('whish_amount').value);
     if(whish>total)throw Error('Whish cannot exceed court price.');
     field('cash_amount').value=((total-whish)/100).toFixed(2);
    }
    const cash=cafeNonnegativeCents(field('cash_amount').value);
    const whish=cafeNonnegativeCents(field('whish_amount').value);
    if(note)note.textContent='Cash '+money(cash)+' + Whish '+money(whish)+' = '+money(total)+'.';
   }catch(e){if(note)note.textContent=e.message;}
   return true;
  }

  if(!['booking_start_time','booking_duration_minutes','pickleball_player_count'].includes(target.name))return false;
  const form=target.closest?.('form[data-court-category]');
  if(!form)return false;
  const start=form.querySelector('[name="booking_start_time"]')?.value||'';
  const duration=form.querySelector('[name="booking_duration_minutes"]')?.value||'';
  const amountInput=form.querySelector('[name="amount"]');
  const note=form.querySelector('[data-court-price-note]');
  const players=form.dataset.courtCategory==='pickleball_courts'?
   Number(form.querySelector('[name="pickleball_player_count"]')?.value):4;
  if(form.dataset.courtCategory==='pickleball_courts'&&![2,4].includes(players)){
   if(note)note.textContent='Choose 2 or 4 players.';return true;
  }
  // Two-player bookings never display or submit player-paid markers 3 and 4.
  if(form.dataset.courtCategory==='pickleball_courts'){
   const markers=form.querySelectorAll('.cafe-new-marks .cafe-marks label');
   markers.forEach((marker,index)=>{
    const hidden=index>=players;
    marker.hidden=hidden;
    const box=marker.querySelector('input');
    if(hidden&&box)box.checked=false;
   });
   const heading=form.querySelector('.cafe-new-marks > span');
   if(heading)heading.textContent='Players paid ('+players+')';
  }
  if(!start||!duration){if(note)note.textContent='Choose a start time and duration to calculate a price.';return true;}
  try{
   const end=bookingEndTime(start,duration),overnight=bookingCrossesMidnight(start,end);
   const price=courtPriceCents(form.dataset.courtCategory,start,end,players);
   if(price!==null){
    if(amountInput)amountInput.value=(price/100).toFixed(2);
    if(note)note.textContent='Ends '+timeLabel(end)+(overnight?' next day':'')+
     (form.dataset.courtCategory==='pickleball_courts'?
      ' · '+players+' players at '+(price/players/100).toFixed(2)+' USD each (rackets included)':'')+
     ' · Suggested total '+(price/100).toFixed(2)+' USD. The amount remains editable.';
   }else if(note)note.textContent='Ends '+timeLabel(end)+(overnight?' next day':'')+' · No automatic rate for this duration/court type. Enter the price manually.';
  }catch(err){if(note)note.textContent=err.message;}
  return true;
 }
 function rememberFold(title,open){if(typeof title==='string')openGroups.set(title,Boolean(open));}
 function rememberNote(id,open){
  if(typeof id!=='string'||!rows.some(e=>e.id===id&&!e.voided_at&&categoryMap.get(e.category)?.kind==='court'))return;
  if(open)expandedCourtNotes.add(id);
  else{
   expandedCourtNotes.delete(id);
   if(editCourtNoteId===id)editCourtNoteId=null;
  }
 }
 function reset(){requestNumber++;date=today();rows=[];plannedReservations=[];reservationListError='';privatePayments=[];privateSessions=[];closingCash=null;whishRows=[];whishOpening=60;dayClosing=null;editCourtId=null;editCourtNoteId=null;expandedCourtNotes.clear();quickOpen=false;courtView='list';loaded=false;error='';loading=false;writing=false;courtSplits=[];courtMovements=[];splitEditId=null;scheduler.reset();}
 return {page,load,action,submit,change,courtPricePreview,rememberFold,rememberNote,reset,getDate:()=>date,
  isTimetableMounted:()=>courtView==='timetable'&&scheduler.isGridMounted(),
  schedulerPointerDown:e=>scheduler.pointerDown(e),schedulerPointerMove:e=>scheduler.pointerMove(e),
  schedulerPointerUp:e=>scheduler.pointerUp(e),schedulerCancelDrag:()=>scheduler.cancelDrag(),schedulerPreviewEnd:e=>scheduler.previewEnd(e),schedulerCloseEditor:()=>scheduler.closeEditor(),
   isTimetableMounted:()=>courtView==='timetable'&&scheduler.isGridMounted()};
}
