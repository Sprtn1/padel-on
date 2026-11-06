// Staff-only Advanced Tournament workspace panels, CSV exports and Americano cards.
// No public routes or direct financial modifications.
import {tournamentTotals,tournamentTeamName} from './tournament-engine.js';
import {americanoStandings,isAmericano} from './tournament-advanced-engine.js';
import {DEFAULT_TOURNAMENT_RULES,formatLabel,tournamentRuleTitle} from './tournament-advanced-wizard.js';
import {prizeEditor} from './tournament-prizes-ui.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money=n=>'$'+(Number(n||0)/100).toFixed(2);
export const REGISTRATION_STATUSES=Object.freeze(['active','pending','waitlisted','cancelled','disqualified']);
export function statusForEntry(statuses,id){
 return statuses.find(s=>s.entrant_id===id)?.status||'active';
}
const getNote=(statuses,id)=>statuses.find(s=>s.entrant_id===id)?.note||'';
const nameFor=(state,id)=>{
 const team=state.teams.find(t=>t.id===id);
 return team?tournamentTeamName(team):'Unknown player';
};
const option=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
const formatTime=t=>t?String(t).slice(0,5):'Not scheduled';
export function renderTournamentParticipantControls(t,statuses=[],{search='',filter='all',admin=false}={}){
 const q=String(search||'').toLocaleLowerCase().trim();
 const shown=t.state.teams.filter(team=>{
  const status=statusForEntry(statuses,team.id);
  const notes=[...team.members.map(m=>m.note||''),getNote(statuses,team.id)];
  const matches=!q||[team.label,...team.members.map(m=>m.name),...notes].some(s=>
   String(s||'').toLocaleLowerCase().includes(q));
  return matches&&(filter==='all'||filter==='with-notes'&&notes.some(Boolean)||status===filter);
 });
 const searchUI='<div class="tm-v2-filterbar"><label>Find participant<input id="tm-participant-search" type="search" autocomplete="off" value="'+esc(search)+'" placeholder="Search names, notes or teams"></label>'+
  '<label>Registration status<select id="tm-participant-filter">'+[
   ['all','All participants'],...REGISTRATION_STATUSES.map(s=>[s,s.charAt(0).toUpperCase()+s.slice(1)]),
   ['with-notes','With notes']
  ].map(([value,label])=>option(value,label,filter)).join('')+'</select></label></div>';
 const cards=shown.map(team=>{
  const status=statusForEntry(statuses,team.id),note=getNote(statuses,team.id);
  const due=team.members.reduce((n,p)=>n+Number(p.due||0),0);
  const paid=team.members.reduce((n,p)=>n+Number(p.paid||0),0);
  return '<article class="tm-v2-participant"><div class="tm-v2-participant-head"><div><small>'+
   esc(t.format==='americano_individual'?'PLAYER':'PAIR')+' · '+esc(team.id)+'</small>'+
   '<strong>'+esc(tournamentTeamName(team))+'</strong></div>'+
   '<span class="tm-v2-status tm-v2-status-'+status+'">'+esc(status)+'</span></div>'+
   '<p>'+team.members.map(person=>esc(person.name)+(person.teamPlayer?' (Team Player)':'')).join(' · ')+'</p>'+
   '<div class="tm-v2-paid-row"><span>Paid '+money(paid)+'</span><span>Remaining '+money(Math.max(0,due-paid))+'</span></div>'+
   (note?'<p class="tm-v2-participant-note">Staff note: '+esc(note)+'</p>':'')+
   '<form data-tm-submit="registration-status" data-entrant="'+esc(team.id)+'" class="tm-v2-participant-status-form">'+
    '<label>Registration<select name="status">'+REGISTRATION_STATUSES.filter(s=>s!=='disqualified'||admin||status==='disqualified').map(s=>option(s,s.charAt(0).toUpperCase()+s.slice(1),status)).join('')+'</select></label>'+
    '<label>Note (optional)<input name="note" maxlength="500" value="'+esc(note)+'" placeholder="Reason or attendance note"></label>'+
    '<button type="submit" class="btn btn-light btn-xs">Save status</button></form>'+
   '</article>';
 }).join('');
 const totals=REGISTRATION_STATUSES.map(status=>[status,t.state.teams.filter(team=>statusForEntry(statuses,team.id)===status).length]);
 return '<section class="tm-v2-participants"><div class="tm-v2-summary-row">'+totals.map(([status,count])=>
  '<span>'+esc(status)+': <b>'+count+'</b></span>').join('')+'</div>'+
  searchUI+'<p class="tm-muted">Showing '+shown.length+' of '+t.state.teams.length+' entries. Status changes never alter saved fees or match scores.</p>'+
  '<div class="tm-v2-participant-grid">'+(cards||'<p>No participants match these filters.</p>')+'</div></section>';
}
export function renderTournamentPaymentCharts(t){
 const totals=tournamentTotals(t.state);
 const target=totals.due,paid=totals.paid,remaining=totals.remaining;
 const percent=target>0?Math.min(100,Math.round(paid/target*100)):100;
 const rows=t.state.teams.map(team=>{
  const due=team.members.reduce((v,m)=>v+Number(m.due||0),0);
  const collected=team.members.reduce((v,m)=>v+Number(m.paid||0),0);
  return {name:tournamentTeamName(team),due,collected};
 }).sort((a,b)=>b.collected-a.collected);
 return '<section class="panel tm-v2-paychart"><div class="tm-head"><h2>Payment Overview</h2>'+
  '<span class="tm-v2-small-label">Current recorded balances</span></div>'+
  '<div class="tm-v2-payment-figures"><div><small>Collected</small><strong>'+money(paid)+'</strong></div>'+
  '<div><small>Remaining</small><strong>'+money(remaining)+'</strong></div>'+
  '<div><small>Collection rate</small><strong>'+percent+'%</strong></div></div>'+
  '<div class="tm-v2-progress" role="progressbar" aria-label="Payment collection" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+percent+'"><span style="width:'+percent+'%"></span></div>'+
  '<div class="tm-v2-chart-summary"><span>Team payment progress</span><strong>'+rows.filter(x=>x.collected>=x.due).length+' / '+rows.length+' fully paid</strong></div>'+ 
  '<div class="tm-v2-chart-list">'+rows.map(x=>
   '<div class="tm-v2-chart-row"><span>'+esc(x.name)+'</span>'+ 
   '<div class="tm-v2-chart-track" role="progressbar" aria-label="Paid for '+esc(x.name)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(x.due>0?Math.min(100,Math.round(100*x.collected/x.due)):100)+'"><span style="width:'+(x.due>0?Math.min(100,100*x.collected/x.due):100)+'%"></span></div>'+ 
   '<strong>'+money(x.collected)+' <small>/ '+money(x.due)+'</small></strong></div>').join('')+'</div>'+ 
  '</section>';
}
export function renderAmericanoStandings(t){
 const table=americanoStandings(t.state,t.format);
 const rows=table.map(row=>'<tr><td><b>'+row.rank+'</b></td><td>'+esc(tournamentTeamName(row.team))+
  '</td><td>'+row.played+'</td><td><strong>'+row.points+'</strong></td>'+
  '<td>'+row.average.toFixed(2)+'</td><td>'+(row.difference>0?'+':'')+row.difference+
  '</td><td>'+row.wins+'</td></tr>').join('');
 const completed=t.state.matches.filter(m=>m.phase==='americano'&&m.played).length;
 const total=t.state.matches.filter(m=>m.phase==='americano').length;
 return '<section class="panel tm-v2-ranking"><div class="tm-head"><div><h2>'+
  (t.format==='americano_individual'?'Individual':'Team')+' Americano Rankings</h2>'+
  '<p class="tm-muted">'+completed+'/'+total+' rounds fixtures scored · '+(t.settings?.points_per_match||24)+' points per match</p></div>'+
  '<span class="tm-v2-small-label">Average points ranks entries when byes differ</span></div>'+
  '<div class="tm-table-scroll"><table><thead><tr><th>#</th><th>'+ (t.format==='americano_individual'?'Player':'Team')+
  '</th><th>Played</th><th>Points</th><th>Avg</th><th>Difference</th><th>Wins</th></tr></thead><tbody>'+
  rows+'</tbody></table></div>'+
  '<p class="tm-hint">Tie-breaks: average points per match, then total point difference, wins, and registration ID.</p></section>';
}
function amerSide(t,m,which){
 const ids=t.format==='americano_individual'?m['players'+which]:[m[which==='A'?'a':'b']];
 return ids?.map(id=>nameFor(t.state,id)).join(' + ')||'TBD';
}
export function renderAmericanoFixtures(t,{editingScore=null,editingSchedule=null,busy=false,phase='americano'}={}){
 const matches=t.state.matches.filter(m=>m.phase===phase);
 const groups=[...new Set(matches.map(m=>m.round))].sort((a,b)=>a-b);
 const locked=t.state.matches.some(m=>['knockout','americano_final'].includes(m.phase));
 const sections=groups.map(round=>{
  const cards=matches.filter(m=>m.round===round).map(m=>{
   const a=amerSide(t,m,'A'),b=amerSide(t,m,'B');
   const score=m.played?String(m.scoreA)+' – '+String(m.scoreB):'Upcoming';
   const editor=editingScore===m.id?'<form data-tm-submit="americano-score" data-match="'+esc(m.id)+'" class="tm-v2-score-form">'+
    '<label>Side A points<input type="number" name="score_a" required min="0" max="'+Number(t.settings?.points_per_match||24)+
    '" value="'+(m.scoreA??'')+'"></label><label>Side B points<input type="number" name="score_b" required min="0" max="'+
    Number(t.settings?.points_per_match||24)+'" value="'+(m.scoreB??'')+'"></label>'+
    '<button class="btn btn-primary btn-xs" type="submit"'+(busy?' disabled':'')+'>Save Result</button>'+
    '<button type="button" data-action="tm-am-cancel" class="btn btn-light btn-xs">Cancel</button></form>':'';
   const courts=t.settings?.courts||['C1'];
   const scheduler=editingSchedule===m.id?'<form data-tm-submit="americano-schedule" data-match="'+esc(m.id)+'" class="tm-v2-score-form">'+
    '<label>Time<input type="time" name="time" value="'+esc(m.scheduledTime||'')+'"></label>'+
    '<label>Court<select name="court">'+option('','Unassigned',m.scheduledCourt||'')+
    courts.map(c=>option(c,c,m.scheduledCourt||'')).join('')+'</select></label>'+
    '<button class="btn btn-primary btn-xs" type="submit"'+(busy?' disabled':'')+'>Save Schedule</button></form>':'';
   const editable=!locked||phase==='americano_final';
   return '<article class="tm-v2-fixture"><div class="tm-v2-fixture-header"><small>Match '+esc(m.id)+
    '</small><span>'+esc(formatTime(m.scheduledTime))+' · '+esc(m.scheduledCourt||'Court TBA')+'</span></div>'+
    '<div class="tm-v2-match-sides"><strong>'+esc(a)+'</strong><b>'+esc(score)+'</b><strong>'+esc(b)+'</strong></div>'+
    '<div class="tm-v2-fixture-actions">'+
    (editable?'<button type="button" class="btn btn-light btn-xs" data-action="tm-am-edit" data-id="'+esc(m.id)+'">'+(m.played?'Edit points':'Record points')+'</button>':'')+
    (!m.played?'<button type="button" class="btn btn-light btn-xs" data-action="tm-am-schedule" data-id="'+esc(m.id)+'">Schedule</button>':'')+'</div>'+
    editor+scheduler+'</article>';
  }).join('');
  return '<section class="tm-v2-round"><h3>'+ (phase==='americano_final'?'Championship Round':'Round '+round)+
   '</h3><div class="tm-v2-fixtures">'+cards+'</div></section>';
 }).join('');
 return '<div class="tm-v2-competition"><div class="tm-head"><h2>'+
  (phase==='americano_final'?'Americano Championship':'Americano Fixtures')+'</h2><span class="tm-muted">'+
  (matches.filter(m=>m.played).length)+'/'+matches.length+' recorded</span></div>'+
  (sections||'<p>No fixtures available yet.</p>')+'</div>';
}
export function renderAmericanoFinalControls(t){
 if(!t.settings?.playoffs)return '<section class="panel"><h2>Final Stage</h2><p>Ranking-only tournament. The leading team or player on the Rankings tab wins.</p></section>';
 const base=t.state.matches.filter(m=>m.phase==='americano');
 const final=t.state.matches.some(m=>['knockout','americano_final'].includes(m.phase));
 if(final)return '';
 const ready=base.length>0&&base.every(m=>m.played);
 return '<section class="panel tm-v2-final-gate"><h2>Optional Championship</h2>'+
  '<p>'+ (t.format==='americano_team'?'Top four teams enter semifinals and a final.':
  'Top four individuals play a championship points round, which counts toward individual standings.')+'</p>'+
  '<button type="button" class="btn btn-primary" data-action="tm-am-finalize"'+(ready?'':' disabled')+'>Generate Championship Stage</button>'+
  (!ready?'<p class="tm-muted">Finish all Americano rounds to unlock the championship.</p>':'')+'</section>';
}
export function renderTournamentActivity(t,events=[]){
 const list=events.filter(e=>e.tournament_id===t.id).slice(0,100);
 const types={tournament_created:'Tournament created',tournament_archived:'Tournament archived',
  settings_updated:'Settings changed',fixtures_or_scores_updated:'Fixtures / scores updated',
  roster_or_payment_updated:'Participants / payments updated',
  tournament_updated:'Tournament updated',registration_status_changed:'Registration status changed'};
 return '<section class="panel tm-v2-activity"><div class="tm-head"><div><h2>Activity History</h2>'+
  '<p class="tm-muted">Staff-only event history. Tracking starts with this update; older actions are not reconstructed.</p></div></div>'+
  '<div class="tm-v2-timeline">'+(list.length?list.map(e=>
   '<article><time>'+esc(new Date(e.at_time).toLocaleString('en-GB',{timeZone:'Asia/Beirut'}))+
   '</time><strong>'+esc(types[e.event_type]||e.event_type)+'</strong>'+
   '<small>Version '+esc(e.details?.new_version??'—')+'</small></article>').join(''):
   '<p>No recorded activity in the new tracking system yet.</p>')+'</div></section>';
}
export function renderTournamentRuleSettings(t,{admin=false}={}){
 const cfg=t.settings||{},rules=Array.isArray(cfg.rules)&&cfg.rules.length?cfg.rules:DEFAULT_TOURNAMENT_RULES;
 const courts=cfg.courts||['C1','C2','C3'];
 const status=cfg.publication_status||'draft';
 const prize=cfg.prize_mode||'tba';
 const isOld=(!cfg.engine_version);
 const intro='<section class="panel tm-v2-settings"><div class="tm-head"><h2>Prizes, Rules & Publication</h2>'+
  '<span class="tm-v2-status">'+esc(status==='published_internal'?'Published to staff':'Draft')+'</span></div>'+
  '<p class="tm-muted">Publication is internal to staff accounts only. There is no public tournament page or player sign-up form.</p>';
 if(!admin){
  return intro+'<h3>Prizes</h3><p>'+esc(prize==='announced'?cfg.prize_text||'Details to follow':'To Be Announced')+'</p>'+
   '<h3>Published rules</h3><ul>'+rules.filter(r=>r.enabled).map(r=>'<li>'+esc(r.text)+'</li>').join('')+'</ul></section>';
 }
 const editable=rules.map(r=>
  '<div class="tm-v2-rule"><label class="tm-v2-check"><input type="checkbox" name="rule_enabled_'+esc(r.key)+'"'+
   (r.enabled?' checked':'')+'><span>'+esc(tournamentRuleTitle(r.key))+'</span></label>'+
   '<textarea rows="2" maxlength="500" name="rule_text_'+esc(r.key)+'">'+esc(r.text)+'</textarea></div>').join('');
 return intro+'<form data-tm-submit="advanced-settings">'+
  '<div class="tm-create-grid">'+
  '<label>Internal publication<select name="publication_status">'+option('draft','Draft',status)+
   option('published_internal','Published to staff',status)+'</select></label>'+
  
  '<label>Registration limit<input name="entry_limit" type="number" min="'+t.state.teams.length+'" max="32" step="1" value="'+esc(cfg.entry_limit??32)+'"></label>'+
  '<label>Registration deadline (Beirut)<input name="registration_deadline" type="datetime-local" value="'+
   esc(cfg.registration_deadline?new Date(cfg.registration_deadline).toLocaleString('sv-SE',{timeZone:'Asia/Beirut'}).slice(0,16).replace(' ','T'):'')+'"></label>'+
  (t.format==='groups'?'<label>Teams per group'+(cfg.engine_version===2?' (fixed at creation)':'')+
   '<input name="group_size" type="number" min="2" max="8" value="'+esc(cfg.group_size??4)+'"'+
   (cfg.engine_version===2?' readonly title="Group size is fixed once the draw is created"':'')+'></label>'+
   '<label>Qualify per group<input name="qualifiers_per_group" type="number" min="1" max="8" value="'+esc(cfg.qualifiers_per_group??2)+'"></label>':'')+
  '</div>'+
  '<h3>Prizes</h3>'+prizeEditor(prize,cfg.prize_text||'')+
  '<h3>Courts in play</h3><div class="tm-v2-courts"><div>'+['C1','C2','C3'].map(c=>
   '<label class="tm-v2-check"><input type="checkbox" name="court_'+c.toLowerCase()+'"'+(courts.includes(c)?' checked':'')+'><span>'+c+'</span></label>').join('')+'</div></div>'+
  '<h3>Published rules</h3><p class="tm-muted">Switch rules on or off; descriptions can be customized.</p><div class="tm-v2-rules tm-v2-rules-compact">'+editable+'</div><button type="button" class="btn btn-light btn-xs" data-action="tm-rules-reset">Reset to default rules</button>'+
  '<button type="submit" class="btn btn-primary">Save Tournament Settings</button>'+
  (isOld?'<p class="tm-hint">This legacy event retains its original scoring and draw. Settings changes never convert its format.</p>':'')+
  '</form></section>';
}
const csvCell=value=>{
 let s=String(value??'');
 // Prevent spreadsheet formula injection from participant-controlled names.
 if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;
 return '"'+s.replaceAll('"','""')+'"';
};
const csv=rows=>rows.map(row=>row.map(csvCell).join(',')).join('\r\n')+'\r\n';
export function tournamentCsv(t,kind,statuses=[]){
 const teams=t.state.teams,entries=teams.flatMap(team=>team.members.map(member=>({team,member})));
 if(kind==='participants')return csv([['Team ID','Team','Participant ID','Player','Team Player','Status','Registration note'],
  ...entries.map(({team,member})=>[team.id,tournamentTeamName(team),member.id,member.name,
   member.teamPlayer?'Yes':'No',statusForEntry(statuses,team.id),getNote(statuses,team.id)])]);
 if(kind==='payments')return csv([['Team ID','Team','Player','Amount due (USD)','Amount paid (USD)','Remaining (USD)'],
  ...entries.map(({team,member})=>[team.id,tournamentTeamName(team),member.name,
   (Number(member.due||0)/100).toFixed(2),(Number(member.paid||0)/100).toFixed(2),
   (Math.max(0,Number(member.due||0)-Number(member.paid||0))/100).toFixed(2)])]);
 if(kind==='fixtures')return csv([['ID','Phase','Round','Court','Time','Side A','Side B','Score','Completed'],
  ...t.state.matches.map(m=>[m.id,m.phase,m.round,m.scheduledCourt,m.scheduledTime,
   isAmericano(t.format)&&m.phase!=='knockout'?
    (t.format==='americano_individual'?(m.playersA||[]).map(id=>nameFor(t.state,id)).join(' + '):nameFor(t.state,m.a)):
    nameFor(t.state,m.a),
   isAmericano(t.format)&&m.phase!=='knockout'?
    (t.format==='americano_individual'?(m.playersB||[]).map(id=>nameFor(t.state,id)).join(' + '):nameFor(t.state,m.b)):
    nameFor(t.state,m.b),
   m.played?m.scoreA+'-'+m.scoreB:Array.isArray(m.sets)&&m.sets.length?m.sets.map(s=>s.a+'-'+s.b).join(' / '):'',
   m.played||Boolean(m.winner)?'Yes':'No'])]);
 if(kind==='standings'&&isAmericano(t.format))return csv([['Rank','Player/Team','Played','Total points','Average points','Difference','Wins'],
  ...americanoStandings(t.state,t.format).map(s=>[s.rank,tournamentTeamName(s.team),s.played,s.points,s.average.toFixed(2),s.difference,s.wins])]);
 throw Error('Unknown tournament export format.');
}
export function downloadTournamentCsv(t,kind,statuses=[]){
 if(typeof document==='undefined'||!globalThis.URL?.createObjectURL||typeof Blob==='undefined')
  throw Error('CSV downloads require a browser.');
 const blob=new Blob(['\uFEFF',tournamentCsv(t,kind,statuses)],{type:'text/csv;charset=utf-8'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 const basename=String(t.name||'tournament').replace(/[^a-z0-9_-]/gi,'_').slice(0,55);
 link.href=url;link.download=basename+'_'+kind+'.csv';link.style.display='none';
 document.body.appendChild(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
 return link.download;
}
export function renderTournamentExports(t){
 return '<section class="panel tm-v2-exports"><h2>Staff Exports</h2>'+
  '<p class="tm-muted">Download CSV data for internal reporting. Player payment data is never published publicly.</p>'+
  '<div class="tm-v2-export-actions">'+[
   ['participants','Participants CSV'],['payments','Payments CSV'],['fixtures','Fixtures CSV'],
   ...(isAmericano(t.format)?[['standings','Rankings CSV']]:[])
  ].map(([type,label])=>'<button type="button" class="btn btn-light" data-action="tm-export-csv" data-kind="'+type+'">'+esc(label)+'</button>').join('')+
  '<button type="button" class="btn btn-light" data-action="tm-print-summary">Print / Save as PDF</button></div></section>';
}
