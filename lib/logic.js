const {weekStart,weekEnd,monthKey,commission,addDays} = await import(`./date.js?v=${new URL(import.meta.url).searchParams.get('v') || Date.now().toString(36)}`);
/** Computes non-destructive Monday–Sunday usage including initial balances and authorized resets. */
export function getWeeklyStatus(member, date, balances, games, resets){
 const monday=weekStart(date),sunday=weekEnd(date);
 const last=resets.filter(r=>r.member_id===member.id&&r.week_start===monday).sort((a,b)=>b.effective_at.localeCompare(a.effective_at))[0];
 const opening=last?0:Number(balances.find(b=>b.member_id===member.id&&b.week_start===monday)?.used||0);
 const played=games.filter(g=>g.member_id===member.id&&!g.voided_at&&g.played_on>=monday&&g.played_on<=sunday&&(!last||g.created_at>last.effective_at)).length;
 const used=opening+played;
 return {used,remain:Math.max(0,member.weekly_allowance-used),allowance:member.weekly_allowance};
}
export function getMonthFinance(games,ym){
 const rows=games.filter(g=>!g.deleted_at&&monthKey(g.played_on)===ym).sort((a,b)=>b.played_on.localeCompare(a.played_on));
 const total=rows.reduce((v,g)=>v+Number(g.amount_cents),0);
 return {rows,total,fee:commission(total),games:rows.length};
}

export const MATCHMAKING_STREAK_BPS=Object.freeze([1500,1500,2000,2000,2500,2500,3000]);
const matchmakingRateForDay=day=>MATCHMAKING_STREAK_BPS[Math.min(Math.max(1,day),MATCHMAKING_STREAK_BPS.length)-1];

/** Adds a rolling seven-day, per-person streak to every valid matchmaking record. */
export function getMatchmakingStreakLedger(games){
 const valid=(games||[]).filter(g=>!g.deleted_at&&/^\d{4}-\d{2}-\d{2}$/.test(String(g.played_on||'')));
 const groups=new Map();
 for(const game of valid){
  const key=String(game.matchmaker_id||'legacy');
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(game);
 }
 const enriched=[];
 for(const rows of groups.values()){
  const days=[...new Set(rows.map(row=>row.played_on))].sort();
  const dayInfo=new Map();
  let previous='',streak=0;
  for(const day of days){
   streak=previous&&addDays(previous,1)===day&&streak<MATCHMAKING_STREAK_BPS.length?streak+1:1;
   dayInfo.set(day,{streakDay:streak,commissionBps:matchmakingRateForDay(streak)});
   previous=day;
  }
  for(const row of rows){
   const info=dayInfo.get(row.played_on),amount=Number(row.amount_cents||0);
   enriched.push({...row,...info,commission_cents:Math.round(amount*info.commissionBps/10000)});
  }
 }
 return enriched.sort((a,b)=>b.played_on.localeCompare(a.played_on)||(b.created_at||'').localeCompare(a.created_at||''));
}

export function getMatchmakingFinance(games,ym){
 const rows=getMatchmakingStreakLedger(games).filter(g=>monthKey(g.played_on)===ym);
 return {rows,total:rows.reduce((sum,row)=>sum+Number(row.amount_cents||0),0),fee:rows.reduce((sum,row)=>sum+Number(row.commission_cents||0),0),games:rows.length};
}

/** Current streak and rate applicable on the supplied Beirut calendar date. */
export function getMatchmakingCurrentStreak(games,date){
 const rows=getMatchmakingStreakLedger(games).filter(row=>row.played_on<=date);
 const latest=rows[0];
 if(!latest)
  return {currentStreak:0,currentCommissionBps:1500,lastActiveDay:null,continuesToday:false};
 if(latest.played_on===date)
  return {currentStreak:latest.streakDay,currentCommissionBps:latest.commissionBps,lastActiveDay:latest.played_on,continuesToday:true};
 if(addDays(latest.played_on,1)===date&&latest.streakDay<MATCHMAKING_STREAK_BPS.length)
  return {currentStreak:latest.streakDay,currentCommissionBps:matchmakingRateForDay(latest.streakDay+1),lastActiveDay:latest.played_on,continuesToday:true};
 return {currentStreak:0,currentCommissionBps:1500,lastActiveDay:latest.played_on,continuesToday:false};
}

/** Returns whether a player has used the free-game allowance in the Monday-Sunday week containing date. */
export function getWeeklyFreeGameStatus(player, date, games){
 const monday=weekStart(date),sunday=weekEnd(date);
 const used=(games||[]).filter(g=>g.player_id===player?.id&&g.game_type==='free'&&g.played_on>=monday&&g.played_on<=sunday).length;
 return {weekStart:monday,weekEnd:sunday,used,available:used===0};
}
