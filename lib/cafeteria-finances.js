// Cafeteria daily cashbook. Kept separate from debts, coaching, and matchmaking.
export const CAFE_CATEGORIES=[
 {id:'padel_courts',label:'Padel Courts',kind:'court',direction:'income'},
 {id:'pickleball_courts',label:'Pickleball Courts',kind:'court',direction:'income'},
 {id:'basketball_courts',label:'Basketball Courts',kind:'court',direction:'income'},
 {id:'grips',label:'Grips',kind:'goods',direction:'income'},
 {id:'balls',label:'Balls',kind:'goods',direction:'income'},
 {id:'racket_rental',label:'Racket Rental',kind:'rental',direction:'income'},
 {id:'gymnastics',label:'Gymnastics',kind:'amount',direction:'income'},
 {id:'classes',label:'Classes',kind:'amount',direction:'income'},
 {id:'pt_gym',label:'PT Gym',kind:'amount',direction:'income'},
 {id:'other_income',label:'Other Income',kind:'named',direction:'income'},
 {id:'general_payment',label:'General Payment',kind:'amount',direction:'expense'},
 {id:'coaches',label:'Coaches',kind:'amount',direction:'expense'},
 {id:'cafeteria_stock',label:'Cafeteria Stock',kind:'amount',direction:'expense'},
 {id:'other_expense',label:'Other Payments',kind:'named',direction:'expense'}
];
export const CAFE_RENTAL_PRICE_CENTS=200;
const categoryMap=new Map(CAFE_CATEGORIES.map(c=>[c.id,c]));

export function cafeMoneyCents(value){
 const raw=String(value??'').trim();
 if(!/^\d+(?:\.\d{1,2})?$/.test(raw))throw Error('Enter a valid USD amount with up to two decimals.');
 const [whole,decimal='']=raw.split('.');
 const cents=Number(whole)*100+Number(decimal.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents<1||cents>100000000000)throw Error('Amount must be greater than zero and within the allowed limit.');
 return cents;
}
export function cafeQuantity(value){
 const raw=String(value??'').trim();
 if(!/^[1-9]\d*$/.test(raw))throw Error('Enter a whole quantity greater than zero.');
 const quantity=Number(raw);
 if(!Number.isSafeInteger(quantity)||quantity>9999)throw Error('Quantity must be between 1 and 9999.');
 return quantity;
}
export function cafeEntryFromForm(categoryId, data){
 const category=categoryMap.get(categoryId);
 if(!category)throw Error('Unknown cafeteria category.');
 const name=String(data.name||'').trim();
 if(name.length>120)throw Error('Name is too long (120 characters max).');
 if((category.kind==='court'||category.kind==='named')&&!name)throw Error('Enter a name or description.');
 const checks=[0,1,2,3].map(i=>data['check'+i]==='on');
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
  checkmarks:category.kind==='court'?checks:[false,false,false,false]
 };
}
export function cafeTotals(entries){
 const active=entries.filter(e=>!e.voided_at);
 const totalFor=direction=>active.filter(e=>categoryMap.get(e.category)?.direction===direction)
   .reduce((sum,e)=>sum+Number(e.amount_cents||0),0);
 const income=totalFor('income'),expenses=totalFor('expense');
 return {income,expenses,net:income-expenses,count:active.length};
}
export function createCafeteriaFinances({api,heading,icon,amount,today,addDays,rerender,toast,isAdmin}){
 let date=today(),rows=[],loaded=false,loading=false,writing=false,error='',requestNumber=0;
 const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=cents=>amount(cents);
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value&&value<=today();
 const categories=direction=>CAFE_CATEGORIES.filter(c=>c.direction===direction);
 function setDate(value){
  if(!validDate(value))throw Error('Choose a valid date no later than today.');
  if(value===date)return false;
  date=value;rows=[];loaded=false;error='';return true;
 }
 async function load(force=false){
  if(!api.getSession()?.access_token)return;
  if(loading)return;
  if(loaded&&!force)return;
  const requestedDate=date,seq=++requestNumber;
  loading=true;error='';rerender();
  try{
   const result=await api.listAll('cafeteria_finance_entries','entry_date=eq.'+requestedDate+'&order=created_at.asc');
   if(seq!==requestNumber||date!==requestedDate||!api.getSession()?.access_token)return;
   rows=result;loaded=true;
  }catch(e){
   if(seq===requestNumber&&date===requestedDate){
    loaded=false;error=(e.message||'Could not load records')+'. If this is the first time, apply the Cafeteria Finances migration.';
   }
  }finally{loading=false;rerender();}
 }
 const marks=(values,entryId='')=>'<div class="cafe-marks" role="group" aria-label="Four court markers">'+
  [0,1,2,3].map(i=>'<label><input type="checkbox" '+(values?.[i]?'checked ':'')+
   (entryId?'data-cafe-marker="'+escapeHtml(entryId)+'" data-marker-index="'+i+'"':'name="check'+i+'"')+
   ' aria-label="Marker '+(i+1)+'"><span>'+(i+1)+'</span></label>').join('')+'</div>';
 function formFor(category){
  const kind=category.kind;
  let fields='';
  if(kind==='court'||kind==='named'){
   fields+='<label class="cafe-input-label">'+(kind==='court'?'Booking / names':'Source / description')+
    '<input required name="name" type="text" maxlength="120" placeholder="'+(kind==='court'?'Names or booking':'What was it for?')+'"></label>';
  }else if(kind==='amount'){
   fields+='<label class="cafe-input-label">Details (optional)<input name="name" type="text" maxlength="120" placeholder="Reference / note"></label>';
  }
  if(kind==='goods'||kind==='rental'){
   fields+='<label class="cafe-input-label">Quantity<input required name="quantity" type="number" min="1" max="9999" step="1" value="1"></label>';
   fields+=kind==='goods'?'<label class="cafe-input-label">Price each ($)<input required name="unit_price" type="number" min="0.01" step="0.01" placeholder="2.00"></label>':
    '<div class="cafe-fixed-rate">Fixed price <strong>$2.00 per racket</strong></div>';
  }else fields+='<label class="cafe-input-label">Amount ($)<input required name="amount" type="number" min="0.01" step="0.01" placeholder="0.00"></label>';
  if(kind==='court')fields+='<div class="cafe-new-marks"><span>Four markers</span>'+marks([false,false,false,false])+'</div>';
  return '<form class="cafe-entry-form" data-cafe-save="entry" data-category="'+category.id+'"><div class="cafe-form-fields">'+fields+
   '</div><button class="btn btn-primary btn-xs" type="submit">'+icon('plus')+' Add entry</button></form>';
 }
 function existing(category){
  const items=rows.filter(e=>e.category===category.id&&!e.voided_at);
  if(!items.length)return '<div class="cafe-no-entries">No entries for this day yet.</div>';
  return '<div class="cafe-entry-list">'+items.map(e=>{
   const detail=category.kind==='goods'?e.quantity+' × '+money(e.unit_price_cents):
    category.kind==='rental'?e.quantity+' racket'+(e.quantity===1?'':'s')+' × $2.00':
    e.name||category.label;
   return '<div class="cafe-ledger-entry"><div class="cafe-ledger-row"><div class="cafe-entry-description"><strong>'+
    escapeHtml(detail)+'</strong>'+((category.kind==='goods'||category.kind==='rental')&&e.name?'<small>'+escapeHtml(e.name)+'</small>':'')+
    '</div><div class="cafe-entry-actions"><b>'+money(e.amount_cents)+'</b>'+
    (isAdmin()?'<button type="button" class="cafe-remove" data-action="cafe-void" data-id="'+escapeHtml(e.id)+'" title="Void entry" aria-label="Void entry">'+icon('trash')+'</button>':'')+
    '</div></div>'+(category.kind==='court'?marks(e.checkmarks,e.id):'')+'</div>';
  }).join('')+'</div>';
 }
 function card(category){
  const subTotal=rows.filter(e=>!e.voided_at&&e.category===category.id).reduce((sum,e)=>sum+Number(e.amount_cents||0),0);
  return '<section class="panel cafe-category-card"><div class="cafe-category-top"><h3>'+escapeHtml(category.label)+'</h3><strong>'+money(subTotal)+'</strong></div>'+
   formFor(category)+existing(category)+'</section>';
 }
 function page(){
  const totals=cafeTotals(rows);
  const header=heading('Daily receipts & payments','Cafeteria Finances','A digital daily cashbook for court income, sales, rentals, activities and outgoing payments.');
  const dateControls='<div class="cafe-datebar"><div><strong>'+icon('calendar')+' Daily ledger</strong><small>Entries are recorded by date in Beirut time.</small></div><div class="cafe-date-actions">'+
   '<button type="button" class="btn btn-light btn-icon" data-action="cafe-prev-date" aria-label="Previous day">'+icon('chevronLeft')+'</button>'+
   '<input id="cafe-finance-date" type="date" aria-label="Ledger date" value="'+escapeHtml(date)+'" max="'+today()+'">'+
   '<button type="button" class="btn btn-light btn-icon" data-action="cafe-next-date" aria-label="Next day" '+(date>=today()?'disabled':'')+'>'+icon('chevronRight')+'</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="cafe-today">Today</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="cafe-reload">'+icon('refresh')+' Refresh</button></div></div>';
  if(!loaded)return header+dateControls+'<div class="notice '+(error?'warn':'')+'">'+escapeHtml(error||'Loading daily financial entries…')+'</div>';
  const summary='<div class="cafe-summary"><article><span>Income recorded</span><strong>'+money(totals.income)+'</strong></article><article><span>Payments recorded</span><strong>'+money(totals.expenses)+'</strong></article><article><span>Net cashflow</span><strong>'+money(totals.net)+'</strong></article><article><span>Entries</span><strong>'+totals.count+'</strong></article></div>';
  const courts='<h2 class="cafe-section-title">Court bookings</h2><div class="cafe-court-grid">'+categories('income').filter(c=>c.kind==='court').map(card).join('')+'</div>';
  const otherIncome='<h2 class="cafe-section-title">Other income</h2><div class="cafe-category-grid">'+categories('income').filter(c=>c.kind!=='court').map(card).join('')+'</div>';
  const expenses='<h2 class="cafe-section-title">Payments & expenses</h2><div class="cafe-category-grid">'+categories('expense').map(card).join('')+'</div>';
  const goods='<section class="panel cafe-goods-pending"><div><h3>Goods Sold</h3><p>Automatic income from cafeteria goods will appear here once the calculation source is connected. No manual input needed.</p></div><span>Awaiting automatic calculation</span></section>';
  return header+dateControls+summary+ '<div class="cafe-note">'+icon('info')+' Four numbered boxes are independent booking markers. They do not change totals. Cafeteria Finances is separate from Cafeteria Debts, Private Sessions and Matchmaking.</div>'+
   courts+otherIncome+goods+expenses+'<p class="cafe-footnote">Total income and net exclude Goods Sold until its automatic source is defined. Corrections are voided by administrators, with audit history retained.</p>';
 }
 async function action(target){
  switch(target.dataset.action){
   case 'cafe-prev-date':if(setDate(addDays(date,-1)))await load();return true;
   case 'cafe-next-date':if(date<today()&&setDate(addDays(date,1)))await load();return true;
   case 'cafe-today':if(setDate(today()))await load();return true;
   case 'cafe-reload':await load(true);return true;
   case 'cafe-void':{
    if(!isAdmin())throw Error('Only administrators can void financial entries.');
    const entry=rows.find(r=>r.id===target.dataset.id&&!r.voided_at);
    if(!entry)throw Error('Entry not found.');
    const reason=globalThis.prompt?.('Why are you voiding this entry? (at least 4 characters)');
    if(reason===null||reason===undefined)return true;
    if(reason.trim().length<4||reason.trim().length>500)throw Error('Enter a reason between 4 and 500 characters.');
    if(writing)return true;writing=true;
    try{await api.rpc('cafeteria_finance_void_entry',{p_entry_id:entry.id,p_reason:reason.trim()});await load(true);toast('Entry voided. History retained.');}
    finally{writing=false;}
    return true;
   }
   default:return false;
  }
 }
 async function submit(form){
  if(writing)return;
  if(!loaded||loading)throw Error('Wait for the current day to load.');
  const data=Object.fromEntries(new FormData(form).entries());
  const entry=cafeEntryFromForm(form.dataset.category,data);
  if(!validDate(date))throw Error('Invalid ledger date.');
  const button=form.querySelector('button[type="submit"]');
  writing=true;if(button)button.disabled=true;
  try{
   await api.rpc('cafeteria_finance_record_entry',{
    p_entry_id:globalThis.crypto.randomUUID(),
    p_entry_date:date,p_category:entry.category,p_name:entry.name,
    p_amount_cents:entry.amount_cents,p_quantity:entry.quantity,
    p_unit_price_cents:entry.unit_price_cents,p_checkmarks:entry.checkmarks
   });
   await load(true);toast('Financial entry saved.');
  }finally{writing=false;if(button?.isConnected)button.disabled=false;}
 }
 async function change(target){
  if(target.id==='cafe-finance-date'){
   if(setDate(target.value))await load();return true;
  }
  if(!target.dataset.cafeMarker)return false;
  if(writing)return true;
  const entry=rows.find(e=>e.id===target.dataset.cafeMarker&&!e.voided_at);
  if(!entry||!categoryMap.has(entry.category)||categoryMap.get(entry.category).kind!=='court')throw Error('Court entry not found.');
  const index=Number(target.dataset.markerIndex);
  if(!Number.isInteger(index)||index<0||index>3)throw Error('Invalid marker.');
  const checks=[...entry.checkmarks];
  checks[index]=target.checked;
  writing=true;
  try{await api.rpc('cafeteria_finance_set_marks',{p_entry_id:entry.id,p_checkmarks:checks});entry.checkmarks=checks;toast('Court markers updated.');}
  catch(e){target.checked=!target.checked;throw e;}
  finally{writing=false;}
  return true;
 }
 function reset(){requestNumber++;date=today();rows=[];loaded=false;error='';loading=false;writing=false;}
 return {page,load,action,submit,change,reset,getDate:()=>date};
}
