// Shared court payment accounting. Amounts are always integer USD cents.
// A split is an actual allocation (Cash + Whish + Unpaid == booking price).
// Legacy unsplit financial entries retain their original cashbook treatment.
export const isCourtCategory=category=>['padel_courts','pickleball_courts','basketball_courts'].includes(category);
export const courtCashAdjustment=rows=>(rows||[]).reduce((n,row)=>{
 const cents=Number(row.cash_delta_cents);
 if(!Number.isSafeInteger(cents))throw Error('Invalid court payment cash adjustment.');
 return n+cents;
},0);

export function courtAllocation(total,cash,whish,unpaid){
 const values=[total,cash,whish,unpaid].map(Number);
 if(values.some(n=>!Number.isSafeInteger(n)||n<0)||values[0]<1||values[0]>100000000000||
 values[1]+values[2]+values[3]!==values[0])throw Error('Cash + Whish + Unpaid must equal the court price.');
 return {amount_cents:values[0],cash_cents:values[1],whish_cents:values[2],unpaid_cents:values[3]};
}
export function courtSplitDisplay(total,split,legacy=true){
 if(split)return courtAllocation(split.amount_cents,split.cash_cents,split.whish_cents,split.unpaid_cents);
 return legacy
  ?{amount_cents:Number(total)||0,cash_cents:Number(total)||0,whish_cents:0,unpaid_cents:0,legacy:true}
  :{amount_cents:Number(total)||0,cash_cents:0,whish_cents:0,unpaid_cents:Number(total)||0,legacy:true};
}
export function courtPaymentBreakdown(splits=[],lookups=new Map()){
 return splits.map(s=>{
  const title=lookups.get(s.source_kind+':'+s.source_id)||'Court booking';
  return {...courtAllocation(s.amount_cents,s.cash_cents,s.whish_cents,s.unpaid_cents),
   id:s.id,source_kind:s.source_kind,source_id:s.source_id,
   payment_date:s.payment_date,name:title};
 });
}
export const courtSplitAmountText=cents=>(Number(cents)/100).toFixed(2);
export function courtSplitFormFields({total,split,legacy=true}){
 const initial=courtSplitDisplay(total,split,legacy);
 return [
  {name:'total_amount',label:'Total court price ($)',value:courtSplitAmountText(initial.amount_cents)},
  {name:'cash_amount',label:'Cash received ($)',value:courtSplitAmountText(initial.cash_cents)},
  {name:'whish_amount',label:'Whish received ($)',value:courtSplitAmountText(initial.whish_cents)},
  {name:'unpaid_amount',label:'Remaining unpaid ($)',value:courtSplitAmountText(initial.unpaid_cents)}
 ];
}
