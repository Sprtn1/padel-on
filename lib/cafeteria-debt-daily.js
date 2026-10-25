// Read-only daily view of the existing cafeteria debt ledger.
export function getDebtDayEntries(entries,day){
 return entries.filter(e=>e.entry_date===day&&!e.voided_at)
  .sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')||
   String(b.id||'').localeCompare(String(a.id||'')));
}
export function summarizeDebtDay(entries){
 const totals={count:0,charges:0,payments:0,net:0};
 for(const entry of entries){
  if(entry.voided_at||!['charge','payment'].includes(entry.entry_type))continue;
  const cents=Number(entry.amount_cents||0);
  totals.count++;
  if(entry.entry_type==='charge')totals.charges+=cents;
  else totals.payments+=cents;
 }
 totals.net=totals.charges-totals.payments;
 return totals;
}
