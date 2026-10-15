const {weekStart,weekEnd,monthKey,commission} = await import(`./date.js?v=${new URL(import.meta.url).searchParams.get('v') || Date.now().toString(36)}`);
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
