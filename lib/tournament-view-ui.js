import {tournamentTotals,tournamentChampion,tournamentTeamName} from './tournament-engine.js';
import {tournamentStatus,WIZARD_STEPS} from './tournament-workspace.js';
import {formatLabel} from './tournament-advanced-wizard.js';
const escape=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dollars=n=>'$'+(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const searchText=x=>String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
export function renderTournamentBrowser(rows,{today,search='',status='all',icon=()=>''}={}){
 const shown=rows.filter(t=>(status==='all'||tournamentStatus(t,today)===status)&&searchText(t.name).includes(searchText(search).trim()));
 const counts={upcoming:0,ongoing:0,completed:0};
 rows.forEach(t=>{counts[tournamentStatus(t,today)]++;});
 const cards=shown.map(t=>{
  const s=t.state||{teams:[],matches:[]},matches=s.matches.filter(m=>m.a&&m.b),done=matches.filter(m=>m.played||m.winner).length;
  const pct=matches.length?Math.round(done/matches.length*100):0;
  const totals=tournamentTotals(s);
  return '<article class="tm-browser-card"><div class="tm-browser-top"><span class="tm-stage-badge tm-status-'+tournamentStatus(t,today)+'">'+escape(tournamentStatus(t,today))+'</span>'+
   '<small>'+escape(t.event_date)+'</small></div><h3>'+escape(t.name)+'</h3>'+
   '<p>'+escape(formatLabel(t.format))+' · '+s.teams.length+' entries / '+s.teams.reduce((n,team)=>n+team.members.length,0)+' players</p>'+
   '<div class="tm-browser-metrics"><span>Collected <b>'+dollars(totals.paid)+'</b></span><span>Matches <b>'+done+'/'+matches.length+'</b></span></div>'+
   '<div class="tm-browser-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'" aria-label="Tournament matches completed"><span style="width:'+pct+'%"></span></div>'+
   '<button type="button" class="btn btn-light tm-browser-open" data-action="tm-select" data-id="'+escape(t.id)+'">Manage Tournament '+icon('chevronRight')+'</button></article>';
 }).join('');
 return '<section class="tm-browser"><div class="tm-browser-heading"><div><h2>All tournaments</h2><p>Find and manage your competitions from one place.</p></div><span>'+rows.length+' tournaments</span></div>'+
  '<div class="tm-browser-stats">'+[['Upcoming',counts.upcoming],['Ongoing',counts.ongoing],['Completed',counts.completed]].map(([name,count])=>
  '<article><small>'+name+'</small><strong>'+count+'</strong></article>').join('')+'</div>'+
  '<div class="tm-browser-filters"><label>Search tournaments<input type="search" id="tm-list-search" autocomplete="off" value="'+escape(search)+'" placeholder="Search by name"></label>'+
  '<label>Status<select id="tm-list-status">'+[['all','All tournaments'],['upcoming','Upcoming'],['ongoing','Ongoing'],['completed','Completed']].map(([value,label])=>
   '<option value="'+value+'"'+(status===value?' selected':'')+'>'+label+'</option>').join('')+'</select></label></div>'+
  '<div class="tm-browser-cards">'+(cards||'<section class="panel tm-empty"><h2>No matching tournaments</h2><p>Try another search or status filter.</p></section>')+'</div></section>';
}
export function renderTournamentOverview(t){
 const s=t.state,totals=tournamentTotals(s),matches=s.matches.filter(m=>m.a&&m.b),done=matches.filter(m=>m.played||m.winner).length;
 const percent=matches.length?Math.round(done/matches.length*100):0,champion=tournamentChampion(s);
 const cards=[[(t.format==='americano_individual'?'Entries':'Teams'),s.teams.length,'Registered entries'],['Players',s.teams.reduce((n,team)=>n+team.members.length,0),'Tournament participants'],
 ['Matches played',done+' / '+matches.length,percent+'% complete'],['Payments collected',dollars(totals.paid),dollars(totals.remaining)+' remaining']].map(([title,value,note])=>
  '<article class="tm-overview-stat"><small>'+title+'</small><strong>'+value+'</strong><span>'+note+'</span></article>').join('');
 const upcoming=matches.filter(m=>!m.winner&&!m.played).slice(0,5).map(m=>{
  const describe=(id,list)=>list?list.map(k=>tournamentTeamName(s.teams.find(t=>t.id===k))).join(' + '):
    tournamentTeamName(s.teams.find(t=>t.id===id));
   const a=describe(m.a,m.playersA),b=describe(m.b,m.playersB);
  return '<article class="tm-upcoming-fixture"><div><strong>'+escape(a)+' <em>vs</em> '+escape(b)+'</strong>'+
  '<small>'+(m.phase==='group'?'Group '+escape(m.group):m.phase==='americano'?'Americano · Round '+m.round:'Final Stage')+' · '+escape(m.scheduledTime||'Time not set')+
  (m.scheduledCourt?' · '+escape(m.scheduledCourt):'')+'</small></div></article>';
 }).join('');
 return '<section class="tm-overview"><div class="tm-overview-stats">'+cards+'</div>'+
  '<div class="tm-overview-panels"><section class="panel tm-overview-panel"><h3>Tournament progress</h3>'+
  '<div class="tm-overview-percent">'+percent+'% <small>completed</small></div>'+
  '<div class="tm-browser-progress"><span style="width:'+percent+'%"></span></div>'+
  '<p>'+done+' out of '+matches.length+' matches have a recorded result.</p>'+
  '<div class="tm-overview-facts"><div><span>Format</span><strong>'+escape(formatLabel(t.format))+'</strong></div>'+
  '<div><span>Entry fee</span><strong>'+dollars(t.fee_cents)+' per participant</strong></div>'+
  '<div><span>Schedule</span><strong>'+escape(t.event_date)+' · '+escape(String(t.start_time).slice(0,5))+'</strong></div>'+
  (champion?'<div><span>Champion</span><strong>'+escape(tournamentTeamName(s.teams.find(x=>x.id===champion)))+'</strong></div>':'')+
  '</div></section>'+
  '<section class="panel tm-overview-panel"><h3>Upcoming matches</h3>'+
  (upcoming||'<p>All playable matches have a result, or fixtures are still being prepared.</p>')+
  '<div class="tm-overview-links"><button type="button" data-action="tm-workspace" data-section="'+(t.format==='groups'?'groups':t.format.startsWith('americano_')?'rounds':'final')+'" class="btn btn-light">Manage matches</button>'+
  '<button type="button" data-action="tm-workspace" data-section="payments" class="btn btn-light">Review payments</button></div></section></div></section>';
}
export function renderTournamentParticipants(t){
 const teams=t.state.teams;
 return '<section class="panel tm-participants-panel"><div class="tm-head"><div><h2>Registered Participants</h2><p class="tm-muted">'+teams.length+' teams · '+(teams.length*2)+' players</p></div>'+
 '<button type="button" class="btn btn-light btn-xs" data-action="tm-team-start">Manage Teams</button></div>'+
 '<div class="tm-participants-grid">'+teams.map((team,i)=>'<article class="tm-participant-team"><div><small>TEAM '+(i+1)+'</small><strong>'+escape(tournamentTeamName(team))+'</strong></div>'+
 team.members.map(member=>'<div class="tm-participant-person"><span>'+escape(member.name)+'</span>'+
  (member.teamPlayer?'<span class="tm-team-player-badge">Team Player</span>':'')+'</div>').join('')+'</article>').join('')+'</div>'+
 '<p class="tm-hint">To change participation fees or mark payments, use the Payments tab. Team additions and removal preserve existing paid participant records.</p></section>';
}
export function renderTournamentWizard({setup,teamCount,step,today,icon=()=>'',busy=false,groupScoreOptions}){
 const steps=WIZARD_STEPS.map((name,i)=>'<span class="tm-wizard-step-label'+(i===step?' current':i<step?' done':'')+'"><b>'+String(i+1).padStart(2,'0')+'</b><span>'+escape(name)+'</span></span>').join('');
 const groups=setup.format!=='knockout';
 const teams=Array.from({length:teamCount},(_,i)=>{
  const p=i+1;return '<div class="tm-team-input"><strong>Pair '+p+'</strong>'+
   [1,2].map(slot=>'<div class="tm-tournament-player"><input name="player_'+p+'_'+slot+'" maxlength="100" required placeholder="Player '+slot+' full name" value="'+escape(setup['player_'+p+'_'+slot]||'')+'">'+
    '<label class="tm-team-player-option"><input type="checkbox" name="team_player_'+p+'_'+slot+'"'+(setup['team_player_'+p+'_'+slot]?' checked':'')+'><span>Team Player</span></label></div>').join('')+'</div>';
 }).join('');
 const field=(i,title,body)=>'<section class="tm-wizard-section" data-step="'+i+'"'+(i===step?'':' hidden')+'><div class="tm-wizard-intro"><h3>'+title+'</h3></div>'+body+'</section>';
 const body=field(0,'Basics','<p>Start with the tournament name.</p><div class="tm-create-grid tm-wizard-single"><label>Name<input name="name" required maxlength="100" placeholder="PADEL ON Friday Open" value="'+escape(setup.name||'')+'"></label></div>')+
 field(1,'Format','<p>Configure groups, knockout and match scoring.</p><div class="tm-create-grid">'+
  '<label>Competition format<select name="format"><option value="groups"'+(groups?' selected':'')+'>Groups + Knockout</option><option value="knockout"'+(!groups?' selected':'')+'>Knockout Only</option></select></label>'+
  '<label>Number of teams (2–32)<input id="tm-team-count" type="number" min="2" max="32" step="1" name="team_count" required value="'+teamCount+'"></label>'+
  '<label>Group stage scoring<select name="group_scoring">'+groupScoreOptions(setup.group_scoring||'best_of_3')+'</select></label>'+
  '<label>Knockout scoring<select name="knockout_scoring">'+groupScoreOptions(setup.knockout_scoring||'best_of_3')+'</select></label></div>')+
 field(2,'Dates & Entry','<p>Set the start date, time and participation fee.</p><div class="tm-create-grid">'+
  '<label>Date<input name="date" type="date" required value="'+escape(setup.date||today)+'"></label>'+
  '<label>Start time<input name="time" type="time" required value="'+escape(setup.time||'18:00')+'"></label>'+
  '<label>Fee per participant ($)<input name="fee" type="number" min="0" max="1000000" step="0.01" required value="'+escape(setup.fee??'20')+'"></label></div>')+
 field(3,'Teams','<p>Register the pairs that will enter the draw.</p><p class="tm-hint">Team Player: If both players are checked, each pays half the fee. If one is checked, only the other player pays. With neither checked, both pay the regular fee.</p>'+
 '<div class="tm-team-inputs">'+teams+'</div>')+
 field(4,'Review','<p>Verify the tournament before generating the draw.</p><div class="tm-wizard-review">'+[
  ['Tournament',setup.name||'New tournament'],['Format',groups?'Groups + Knockout':'Knockout Only'],
  ['Teams',teamCount],['Start',String(setup.date||today)+' · '+String(setup.time||'18:00')],
  ['Fee per player','$'+String(setup.fee??'20')]
 ].map(([label,value])=>'<div><small>'+label+'</small><strong>'+escape(value)+'</strong></div>').join('')+'</div>'+
 '<p class="tm-hint">All matches and payments will be managed in the tournament workspace after creation.</p>');
 const controls='<div class="tm-wizard-actions">'+(step>0?'<button type="button" class="btn btn-light" data-action="tm-wizard-prev">Back</button>':'')+
  '<span>Step '+(step+1)+' of '+WIZARD_STEPS.length+'</span>'+
  (step<WIZARD_STEPS.length-1?'<button type="button" class="btn btn-primary" data-action="tm-wizard-next">Continue</button>':
   '<button type="submit" class="btn btn-primary"'+(busy?' disabled':'')+'>'+icon('plus')+' Create & Shuffle Tournament</button>')+'</div>';
 return '<section class="panel tm-setup tm-wizard"><div class="tm-head"><h2>New tournament</h2><button type="button" class="btn btn-light btn-xs" data-action="tm-cancel-create">Cancel</button></div>'+
  '<div class="tm-wizard-steps">'+steps+'</div><form id="tm-create-form" data-tm-submit="create" novalidate>'+
  '<div class="tm-wizard-layout"><div class="tm-wizard-body">'+body+controls+'</div><aside class="tm-wizard-preview"><h3>Live preview</h3>'+
  '<span class="tm-stage-badge">Draft</span><h4>'+escape(setup.name||'New tournament')+'</h4><p>'+escape(groups?'Groups + Knockout':'Knockout Only')+'</p>'+
  '<div><small>Teams</small><strong>'+teamCount+'</strong></div><div><small>Participants</small><strong>'+teamCount*2+'</strong></div>'+
  '<div><small>Entry fee</small><strong>$'+escape(setup.fee??'20')+'</strong></div>'+
  '<div><small>Date</small><strong>'+escape(setup.date||today)+'</strong></div></aside></div></form></section>';
}
