const BEIRUT = 'Asia/Beirut';
export function todayBeirut(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: BEIRUT, year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(d);
  const fields = Object.fromEntries(parts.map(p => [p.type,p.value]));
  return `${fields.year}-${fields.month}-${fields.day}`;
}
export function addDays(ymd, n) {
  const t = new Date(`${ymd}T12:00:00Z`); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10);
}
export function weekStart(ymd) {
  const weekday = new Date(`${ymd}T12:00:00Z`).getUTCDay();
  return addDays(ymd, -(weekday===0?6:weekday-1));
}
export function weekEnd(ymd) { return addDays(weekStart(ymd),6); }
export function niceDay(ymd, options={month:'short',day:'numeric'}) {
  return new Intl.DateTimeFormat('en-US', {...options,timeZone:'UTC'}).format(new Date(`${ymd}T12:00:00Z`));
}
export function weekLabel(today) {
  const s=weekStart(today),e=weekEnd(today);
  return `${niceDay(s)} – ${niceDay(e,{month:'short',day:'numeric',year:'numeric'})}`;
}
export function monthKey(ymd) { return ymd.slice(0,7); }
export function monthLabel(ym) {return new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${ym}-01T12:00:00Z`));}
export function shiftMonth(ym, diff) {const t=new Date(`${ym}-01T12:00:00Z`);t.setUTCMonth(t.getUTCMonth()+diff);return t.toISOString().slice(0,7);}
export function amount(cents) {return '$'+(Number(cents||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});}
export function parseUSD(value) {
 const str=String(value).trim(); if(!/^\d+(?:\.\d{1,2})?$/.test(str))throw Error('Enter a valid USD amount (up to two decimals).');
 const [a,b='']=str.split('.');const cents=Number(a)*100+Number((b+'00').slice(0,2));
 if(!Number.isSafeInteger(cents)||cents>100000000000)throw Error('Amount is too large.');return cents;
}
export const commission = cents => Math.round(Number(cents||0)*0.15);
