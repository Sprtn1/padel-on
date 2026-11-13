// Shared court payment accounting. Amounts are always integer USD cents.
// A split allocates the entire court price between Cash and Whish; no court debt.
// Legacy unsplit financial entries retain their original cashbook treatment.
export const isCourtCategory=category=>['padel_courts','pickleball_courts','basketball_courts'].includes(category);
export const courtCashAdjustment=rows=>(rows||[]).reduce((n,row)=>{
 const cents=Number(row.cash_delta_cents);
 if(!Number.isSafeInteger(cents))throw Error('Invalid court payment cash adjustment.');
 return n+cents;
},0);

export function courtAllocation(total,cash,whish,unpaid=0){
 const values=[total,cash,whish,unpaid].map(Number);
 if(values.some(n=>!Number.isSafeInteger(n)||n<0)||values[0]<1||values[0]>100000000000||
  values[3]!==0||values[1]+values[2]!==values[0])
  throw Error('Cash + Whish must equal the court price. Courts have no unpaid balance.');
 return {amount_cents:values[0],cash_cents:values[1],whish_cents:values[2],unpaid_cents:0};
}
export function courtCashWhishRemainder(total,entered,changed='whish'){
 const amount=Number(total),part=Number(entered);
 if(!Number.isSafeInteger(amount)||amount<0||!Number.isSafeInteger(part)||part<0||part>amount)
  throw Error('Cash and Whish must be between zero and the court price.');
 return changed==='cash'?{cash_cents:part,whish_cents:amount-part}:
  {cash_cents:amount-part,whish_cents:part};
}
export function courtSplitDisplay(total,split,legacy=true){
 if(split)return courtAllocation(split.amount_cents,
  Number(split.cash_cents)+Number(split.unpaid_cents||0),split.whish_cents,0);
 return legacy
  ?{amount_cents:Number(total)||0,cash_cents:Number(total)||0,whish_cents:0,unpaid_cents:0,legacy:true}
  :{amount_cents:Number(total)||0,cash_cents:Number(total)||0,whish_cents:0,unpaid_cents:0,legacy:true};
}
export function courtPaymentBreakdown(splits=[],lookups=new Map()){
 return splits.map(s=>{
  const title=lookups.get(s.source_kind+':'+s.source_id)||'Court booking';
  return {...courtAllocation(s.amount_cents,
    Number(s.cash_cents)+Number(s.unpaid_cents||0),s.whish_cents,0),
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
  {name:'whish_amount',label:'Whish ($)',value:courtSplitAmountText(initial.whish_cents)}
 ];
}
