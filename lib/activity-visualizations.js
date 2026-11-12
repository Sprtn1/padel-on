// Display-only summaries from existing authorized application data.
// Never infer payments, court availability, or revenue from game records.
export function sevenDayActivity(endDate,{teamMatches=[],specialGames=[],matchmaking=[],privateEntries=[]}={},addDays){
 const dates=Array.from({length:7},(_,i)=>addDays(endDate,i-6));
 const byDate=new Map(dates.map(date=>[date,{date,team:0,special:0,matchmaking:0,sessions:0,total:0}]));
 const record=(items,field,key,valid)=>{for(const item of items){
  if(!item||item.voided_at||item.deleted_at||!valid(item))continue;
  const target=byDate.get(item[field]);if(target)target[key]++;
 }};
 record(teamMatches,'played_on','team',()=>true);
 record(specialGames,'played_on','special',()=>true);
 record(matchmaking,'played_on','matchmaking',()=>true);
 record(privateEntries,'entry_date','sessions',item=>item.entry_type==='session');
 return [...byDate.values()].map(day=>({...day,total:day.team+day.special+day.matchmaking+day.sessions}));
}
