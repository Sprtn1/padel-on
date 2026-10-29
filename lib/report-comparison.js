import {addDays,weekLabel,monthLabel,shiftMonth} from './date.js';

const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
const validMonth=value=>/^\d{4}-\d{2}$/.test(String(value||''));

export function reportPeriodRange(mode,value){
 if(mode==='month'){
  if(!validMonth(value))throw Error('Invalid report month.');
  const start=value+'-01';
  return [start,addDays(shiftMonth(value,1)+'-01',-1)];
 }
 if(!validDay(value))throw Error('Invalid report date.');
 return mode==='week'?[value,addDays(value,6)]:[value,value];
}

export function shiftReportPeriod(mode,value,steps){
 if(mode==='month')return shiftMonth(value,steps);
 return addDays(value,steps*(mode==='week'?7:1));
}

export function previousReportPeriod(mode,value){return shiftReportPeriod(mode,value,-1)}

export function reportPeriodTitle(mode,value){
 return mode==='month'?monthLabel(value):mode==='week'?weekLabel(value):value;
}

export function reportComparisonMetrics(mode,primary,comparison,primaryCash=null,comparisonCash=null){
 if(!primary||!comparison)return [];
 const benefit=m=>mode==='week'?Number(m.weekUsed||0):Number(m.games?.length||0);
 const rows=[
  {key:'matches',label:'Team matches',kind:'count',primary:primary.validMatches.length,comparison:comparison.validMatches.length},
  {key:'benefits',label:'Benefit uses',kind:'count',primary:benefit(primary),comparison:benefit(comparison)},
  {key:'free',label:'Free entries',kind:'count',primary:primary.free,comparison:comparison.free},
  {key:'half',label:'Half-price entries',kind:'count',primary:primary.half,comparison:comparison.half},
  {key:'special',label:'Other benefit games',kind:'count',primary:primary.special,comparison:comparison.special}
 ];
 if(primaryCash&&comparisonCash){
  for(const [key,label] of [
   ['recordedIncome','Recorded cashbook income'],['expenses','Cashbook expenses'],
   ['generated','Generated on counted days'],['goodsSold','Goods Sold on counted days'],
   ['courtRevenue','Court booking amounts'],['privatePayments','Private Sessions receipts'],
   ['whishNet','Whish net movement']
  ])rows.push({key,label,kind:'money',primary:Number(primaryCash[key]||0),comparison:Number(comparisonCash[key]||0)});
 }
 if(mode==='month'){
  rows.push(
   {key:'matchmakingRevenue',label:'Matchmaking revenue',kind:'money',primary:primary.monthFinance.total,comparison:comparison.monthFinance.total},
   {key:'commissions',label:'Matchmaking commissions',kind:'money',primary:primary.monthFinance.fee,comparison:comparison.monthFinance.fee}
  );
 }
 return rows;
}
