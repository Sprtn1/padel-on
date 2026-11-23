// Presentation and eligibility helpers for Other Benefits only.
// Financial and court reservation records are intentionally not used here.
const COUNTING = 'counting';
export const OTHER_RULES = Object.freeze([
 ['one_free_per_week','1 free game per week'],
 ['alternating_free_paid','Alternating free / paid'],
 [COUNTING,'1 free game after X paid games'],
 ['next_free','Free game ready'],
 ['needs_confirmation','Needs confirmation'],
 ['rule_not_configured','Not configured']
]);
export function benefitRuleLabel(player){
 if(player?.status==='next_free' && Number(player.threshold)>0)
  return '1 free after '+Number(player.threshold)+' paid games';
 if(player?.status===COUNTING && Number(player.threshold)>0)
  return '1 free after '+Number(player.threshold)+' paid games';
 return OTHER_RULES.find(([value])=>value===player?.status)?.[1]||'Not configured';
}
export function otherBenefitStatus(player,games=[],monday,sunday){
 const status=player?.status||'rule_not_configured';
 if(player?.active===false)return {ready:false,review:false,label:'Inactive',tone:'gray',progress:'Benefit paused',weeklyUsed:false};
 const counter=Math.max(0,Number(player?.current_counter)||0);
 const threshold=Number(player?.threshold);
 const weeklyUsed=games.some(g=>g.player_id===player.id&&g.game_type==='free'&&g.played_on>=monday&&g.played_on<=sunday);
 let ready=false,review=false,label='',tone='gray',progress='';
 switch(status){
  case 'one_free_per_week':
   ready=!weeklyUsed;label=ready?'Free game available':'Used this week';
   tone=ready?'green':'amber';progress=weeklyUsed?'1 / 1 used':'0 / 1 used';break;
  case 'alternating_free_paid':
   ready=counter%2===0;label=ready?'Next game free':'Next game paid';
   tone=ready?'green':'amber';progress=counter+' games in cycle';break;
  case 'next_free':
   ready=true;label='Free game ready';tone='green';
   progress=threshold>0?Math.min(counter,threshold)+' / '+threshold+' paid games':'Manual free game';break;
  case COUNTING:
   review=!Number.isInteger(threshold)||threshold<1;
   ready=false;label=review?'Set the paid-game target':Math.max(0,threshold-counter)+' paid games to free';
   tone='amber';progress=review?counter+' paid games':Math.min(counter,threshold)+' / '+threshold+' paid games';break;
  case 'needs_confirmation':
   review=true;label='Needs confirmation';tone='amber';progress='Rule needs review';break;
  default:
   review=true;label='Rule not configured';tone='gray';progress='Set a rule to continue';
 }
 return {ready,review,label,tone,progress,weeklyUsed};
}
export function otherBenefitsView(players=[],games=[],monday,sunday,search='',filter='active',sort='name'){
 const active=players.filter(p=>p.active);
 const sortedGames=[...games].sort((a,b)=>String(b.played_on).localeCompare(String(a.played_on)) || String(b.created_at||'').localeCompare(String(a.created_at||'')));
 const last=new Map();
 for(const game of sortedGames)if(!last.has(game.player_id))last.set(game.player_id,game);
 const rows=players.map(player=>({
  player,rule:benefitRuleLabel(player),
  ...otherBenefitStatus(player,games,monday,sunday),
  lastGame:last.get(player.id)||null
 }));
 const normalized=String(search||'').trim().toLocaleLowerCase();
 const filtered=rows.filter(r=>{
  if(filter==='active'&&!r.player.active)return false;
  if(filter==='available'&&(!r.player.active||!r.ready))return false;
  if(filter==='review'&&(!r.player.active||!r.review))return false;
  if(filter==='inactive'&&r.player.active)return false;
  return !normalized||[r.player.name,r.player.slug,r.rule,r.label].some(s=>String(s||'').toLocaleLowerCase().includes(normalized));
 });
 filtered.sort((a,b)=>sort==='recent'
  ?String(b.lastGame?.played_on||'').localeCompare(String(a.lastGame?.played_on||''))||a.player.name.localeCompare(b.player.name)
  :a.player.name.localeCompare(b.player.name));
 return {
  rows:filtered,
  summary:{
   active:active.length,
   ready:rows.filter(r=>r.player.active&&r.ready).length,
   usedThisWeek:games.filter(g=>g.game_type==='free'&&g.played_on>=monday&&g.played_on<=sunday).length,
   review:rows.filter(r=>r.player.active&&r.review).length
  }
 };
}
export function normalizeOtherPlayerInput(data,existing){
 const allowed=OTHER_RULES.map(([id])=>id);
 if(!allowed.includes(data.status))throw Error('Select a valid benefit rule.');
 const name=String(data.name||'').trim();
 if(name.length<2||name.length>100)throw Error('Enter a player name (2–100 characters).');
 let counter=Number(data.current_counter);
 if(!Number.isSafeInteger(counter)||counter<0||counter>1000000)throw Error('Enter a valid game count.');
 let threshold=null;
 if(data.status===COUNTING){
  threshold=Number(data.threshold);
  if(!Number.isSafeInteger(threshold)||threshold<1||threshold>100)
   throw Error('Set a paid-game target between 1 and 100.');
 }else if(data.status==='next_free' && data.threshold!==undefined && data.threshold!==''){
  threshold=Number(data.threshold);
  if(!Number.isSafeInteger(threshold)||threshold<1||threshold>100)
   throw Error('Set a paid-game target between 1 and 100.');
 }
 // Never silently discard a free game already earned under the counting policy.
 const existingReady=existing?.status==='next_free'&&Number(existing.threshold)>0;
 if(existingReady&&data.status===COUNTING&&Number(existing.threshold)===threshold)
  throw Error('This player has an earned free game. Keep Free game ready until it is used.');
 const status=data.status===COUNTING&&counter>=threshold?'next_free':data.status;
 // The counter is not relevant to weekly or manual/unconfigured arrangements.
 if(status==='one_free_per_week'||status==='needs_confirmation'||status==='rule_not_configured')
  counter=existing?.current_counter??0;
 if(status==='next_free'&&threshold===null)counter=existing?.current_counter??counter;
 return {name,current_counter:counter,status,threshold,active:data.active==='true'};
}
