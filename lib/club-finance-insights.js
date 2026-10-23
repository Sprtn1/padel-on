// Read-only reporting from existing daily cash, Private Sessions and Whish ledgers.
// Monetary amounts are integer cents. Never aggregate Whish into cash totals.
export const CASH_EXPENSE_IDS=new Set(['general_payment','coaches','cafeteria_stock','family_debt','other_expense']);
export const CASH_COURT_IDS=new Set(['padel_courts','pickleball_courts','basketball_courts']);
export function summarizeCashPeriod(start,end,rows,days,privateLedger,whish,closings){
 const byDate=new Map(),byCategory=new Map();
 const inclusive=date=>date>=start&&date<=end;
 const get=date=>{
  if(!byDate.has(date))byDate.set(date,{date,income:0,expenses:0,private:0,generated:null,goodsSold:null,
   count:0,courts:0,unpaidPlayers:0,closingCash:null,status:'open'});
  return byDate.get(date);
 };
 for(const d of days)if(inclusive(d.day_date))get(d.day_date).closingCash=Number(d.closing_cash_cents);
 for(const row of closings)if(inclusive(row.day_date))get(row.day_date).status=row.status;
 for(const entry of rows){
  if(entry.voided_at||!inclusive(entry.entry_date))continue;
  const day=get(entry.entry_date),value=Number(entry.amount_cents||0);
  const expense=CASH_EXPENSE_IDS.has(entry.category);
  if(expense)day.expenses+=value;else day.income+=value;
  byCategory.set(entry.category,(byCategory.get(entry.category)||0)+value);
  if(CASH_COURT_IDS.has(entry.category)){
   day.courts+=value;
   if(Array.isArray(entry.checkmarks))day.unpaidPlayers+=entry.checkmarks.filter(p=>p!==true).length;
  }
  day.count++;
 }
 for(const entry of privateLedger){
  if(entry.voided_at||!inclusive(entry.entry_date))continue;
  const amount=entry.entry_type==='session'?Number(entry.paid_cents||0):
   entry.entry_type==='deposit'?Number(entry.deposit_cents||0):0;
  if(amount>0){const day=get(entry.entry_date);day.private+=amount;day.income+=amount}
 }
 const whishByDate=new Map();
 for(const entry of whish){
  if(entry.voided_at||!inclusive(entry.entry_date))continue;
  if(!whishByDate.has(entry.entry_date))whishByDate.set(entry.entry_date,{deposits:0,withdrawals:0});
  const target=whishByDate.get(entry.entry_date);
  if(entry.entry_type==='deposit')target.deposits+=Number(entry.amount_cents||0);
  else if(entry.entry_type==='withdrawal')target.withdrawals+=Number(entry.amount_cents||0);
 }
 const series=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
 for(const row of series)if(row.closingCash!==null){
  row.generated=row.expenses+row.closingCash;row.goodsSold=row.generated-row.income;
 }
 const all=(key)=>series.reduce((total,row)=>total+row[key],0);
 const counted=series.filter(row=>row.generated!==null);
 const countedTotal=key=>counted.reduce((total,row)=>total+row[key],0);
 const whishDeposits=[...whishByDate.values()].reduce((s,r)=>s+r.deposits,0);
 const whishWithdrawals=[...whishByDate.values()].reduce((s,r)=>s+r.withdrawals,0);
 return {start,end,days:series,categories:[...byCategory.entries()].sort((a,b)=>b[1]-a[1]),
  recordedIncome:all('income'),expenses:all('expenses'),privatePayments:all('private'),
  courtRevenue:all('courts'),unpaidPlayers:all('unpaidPlayers'),
  generated:countedTotal('generated'),goodsSold:countedTotal('goodsSold'),
  countedDays:counted.length,missingCashDays:series.length-counted.length,
  whishDeposits,whishWithdrawals,whishNet:whishDeposits-whishWithdrawals,
  statuses:{closed:series.filter(x=>x.status==='closed').length,approved:series.filter(x=>x.status==='approved').length}
 };
}
export function createCashInsights({api,today,amount,renderIfVisible}){
 let current=null,report=null,loadingOverview=false,loadingReport=false;
 let overviewKey='',reportKey='',requestOverview=0,requestReport=0;
 const val=c=>amount(c);
 const esc=x=>String(x??'').replace(/[&<>"']/g,s=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
 async function fetchPeriod(start,end,includeWhishHistory=false){
  const dateFilter=key=>key+'=gte.'+start+'&'+key+'=lte.'+end;
  const calls=[
   api.listAll('cafeteria_finance_entries',dateFilter('entry_date')),
   api.listAll('cafeteria_finance_days',dateFilter('day_date')),
   api.listAll('private_ledger_entries',dateFilter('entry_date')),
   api.listAll('whish_ledger_entries',includeWhishHistory?'order=entry_date.asc':dateFilter('entry_date')),
   api.listAll('cafeteria_day_closings',dateFilter('day_date'))
  ];
  if(includeWhishHistory)calls.push(api.listAll('whish_wallet_settings'));
  const [rows,days,privateLedger,whish,closings,settings]=await Promise.all(calls);
  const totals=summarizeCashPeriod(start,end,rows,days,privateLedger,whish,closings);
  let currentWhish=null;
  if(includeWhishHistory){
   const opening=Number(settings?.[0]?.opening_balance_cents??60);
   currentWhish=opening+whish.filter(e=>!e.voided_at).reduce((s,r)=>s+(r.entry_type==='deposit'?Number(r.amount_cents):r.entry_type==='withdrawal'?-Number(r.amount_cents):0),0);
  }
  return {totals,currentWhish};
 }
 async function loadOverview(force=false){
  const key=today();
  if(!api.getSession()?.access_token)return;
  if((overviewKey===key&&current&&!force)||loadingOverview)return;
  loadingOverview=true;const request=++requestOverview;overviewKey=key;
  try{const result=await fetchPeriod(key,key,true);
    if(request===requestOverview&&api.getSession()?.access_token)current={...result,date:key};
  }catch(err){if(request===requestOverview)current={error:err.message,date:key}}
  finally{if(request===requestOverview){loadingOverview=false;renderIfVisible('dashboard')}}
 }
 async function loadReport(start,end,force=false){
  if(!api.getSession()?.access_token)return;
  const key=start+'|'+end;
  if((reportKey===key&&report&&!force)||loadingReport&&reportKey===key)return;
  loadingReport=true;const request=++requestReport;reportKey=key;report=null;
  try{const result=await fetchPeriod(start,end);
   if(request===requestReport&&api.getSession()?.access_token)report=result;
  }catch(err){if(request===requestReport)report={error:err.message}}
  finally{if(request===requestReport){loadingReport=false;renderIfVisible('reports')}}
 }
 function overviewHTML(){
  if(!current||current.date!==today())return '<section class="panel club-cash-overview"><h2>Cash desk today</h2><p>Loading cafeteria cash desk status…</p></section>';
  if(current.error)return '<section class="panel club-cash-overview"><h2>Cash desk today</h2><p>Cash information unavailable: '+esc(current.error)+'</p></section>';
  const d=current.totals.days.find(d=>d.date===today())||{income:0,expenses:0,private:0,generated:null,goodsSold:null,unpaidPlayers:0,status:'open'};
  const status=d.status==='approved'?'Approved':d.status==='closed'?'Awaiting approval':d.status==='reopened'?'Reopened':'Open';
  return '<section class="panel club-cash-overview"><div class="panel-head"><div><h2>Cash desk today</h2>'+
   '<p>Cash activity and daily totals</p></div>'+
   '<button class="link" data-tab="cafeteria-finances">Open cashbook →</button></div>'+
   '<div class="club-insight-metrics"><article><small>Total generated (cash desk)</small><strong>'+(
     d.generated===null?'Cash count pending':val(d.generated))+'</strong></article>'+
   '<article><small>Payments made</small><strong>'+val(d.expenses)+'</strong></article>'+
   '<article><small>Goods Sold (calculated)</small><strong>'+(
     d.goodsSold===null?'Pending':val(d.goodsSold))+'</strong></article>'+
   '<article><small>Closing status</small><strong>'+status+'</strong></article>'+
   '<article><small>Unmarked court payments</small><strong>'+d.unpaidPlayers+'</strong></article>'+
   '<article><small>Whish wallet</small><strong>'+val(current.currentWhish)+'</strong></article></div>'+
   '<p class="club-insight-note">Recorded income '+val(d.income)+' includes '+val(d.private)+' from Private Sessions. Unmarked court players do not represent outstanding debt.</p></section>';
 }
 function reportHTML(start,end){
  if(loadingReport||!report||reportKey!==start+'|'+end)return '<section class="panel club-finance-report"><h2>Cafeteria financial report</h2><p>Loading financial data for this period…</p></section>';
  if(report.error)return '<section class="panel club-finance-report"><h2>Cafeteria financial report</h2><p>Unable to load: '+esc(report.error)+'</p></section>';
  const t=report.totals;
  const groups=t.categories.map(([name,cents])=>'<tr><td>'+esc(name.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()))+
   '</td><td>'+(CASH_EXPENSE_IDS.has(name)?'Expense':'Income')+'</td><td>'+val(cents)+'</td></tr>').join('');
  const rows=t.days.map(d=>'<tr><td>'+esc(d.date)+'</td><td>'+val(d.income)+'</td><td>'+val(d.expenses)+'</td><td>'+
   (d.generated===null?'Pending':val(d.generated))+'</td><td>'+
   (d.goodsSold===null?'—':val(d.goodsSold))+'</td><td>'+esc(d.status)+'</td></tr>').join('');
  return '<section class="panel club-finance-report"><div class="panel-head"><div><h2>Cafeteria financial report</h2>'+
   '<p>'+esc(start)+' to '+esc(end)+' · recorded activity for this period</p></div></div>'+
   '<div class="club-insight-metrics"><article><small>Recorded income</small><strong>'+val(t.recordedIncome)+'</strong></article>'+
   '<article><small>Expenses</small><strong>'+val(t.expenses)+'</strong></article>'+
   '<article><small>Generated (counted days)</small><strong>'+val(t.generated)+'</strong></article>'+
   '<article><small>Goods Sold (counted days)</small><strong>'+val(t.goodsSold)+'</strong></article>'+
   '<article><small>Court booking amounts</small><strong>'+val(t.courtRevenue)+'</strong></article>'+
   '<article><small>Cash counts recorded</small><strong>'+t.countedDays+' days</strong></article></div>'+
   (t.missingCashDays?'<p class="club-insight-warn">'+t.missingCashDays+' active day(s) have no closing cash count. Their Goods Sold and generated totals are excluded.</p>':'')+
   '<div class="club-insight-tables"><div><h3>Daily breakdown</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Recorded income</th><th>Expenses</th><th>Total generated</th><th>Goods Sold</th><th>Status</th></tr></thead><tbody>'+
   (rows||'<tr><td colspan="6">No activity in this period.</td></tr>')+'</tbody></table></div></div>'+
   '<div><h3>Income / expense categories</h3><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Category</th><th>Type</th><th>Total</th></tr></thead><tbody>'+
   (groups||'<tr><td colspan="3">No transactions.</td></tr>')+'</tbody></table></div></div></div>'+
   '<div class="club-whish-summary"><strong>Whish wallet</strong><span>Deposits '+val(t.whishDeposits)+'</span><span>Withdrawals '+val(t.whishWithdrawals)+'</span><span>Net movement '+val(t.whishNet)+'</span></div>'+
   '<p class="club-insight-note">Private Sessions payments are counted as receipts, not session charges. Goods Sold is calculated only on days with a closing cash count. Whish is excluded from cash totals.</p></section>';
 }
 function csvRows(start,end){
  if(!report||report.error||reportKey!==start+'|'+end)return [];
  const t=report.totals;
  const format=v=>(v/100).toFixed(2);
  const rows=[
   [],['CAFETERIA FINANCIAL REPORT',start,end],
   ['Recorded income USD',format(t.recordedIncome)],
   ['Expenses USD',format(t.expenses)],
   ['Private Sessions receipts included USD',format(t.privatePayments)],
   ['Court booking amounts USD',format(t.courtRevenue)],
   ['Cash generated on counted days USD',format(t.generated)],
   ['Goods Sold on counted days USD',format(t.goodsSold)],
   ['Days with a closing count',t.countedDays],
   ['Active days missing a closing count',t.missingCashDays],
   [],['Date','Recorded income USD','Expenses USD','Total generated USD','Goods Sold USD','Closing status'],
   ...t.days.map(d=>[d.date,format(d.income),format(d.expenses),d.generated===null?'Missing':format(d.generated),
    d.goodsSold===null?'Missing':format(d.goodsSold),d.status]),
   [],['Category','Type','Total USD'],
   ...t.categories.map(([name,cents])=>[name,CASH_EXPENSE_IDS.has(name)?'Expense':'Income',format(cents)]),
   [],['WHISH WALLET'],
   ['Deposits USD',format(t.whishDeposits)],
   ['Withdrawals USD',format(t.whishWithdrawals)],
   ['Net Whish movement USD',format(t.whishNet)]
  ];
  return rows;
 }
 function reset(){requestOverview++;requestReport++;overviewKey='';reportKey='';current=null;report=null;loadingOverview=false;loadingReport=false}
 return {overviewHTML,reportHTML,csvRows,loadOverview,loadReport,reset};
}
