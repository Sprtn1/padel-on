import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,
 getQualifiers,padelMatchWinner,groupStandings,tournamentTotals,tournamentChampion,
 knockoutSeedEntrants,reseedTournamentKnockout,tournamentTeamName} from './tournament-engine.js';
import {tournamentArchivePdf,downloadTournamentPdf} from './tournament-pdf.js';
import {knockoutBracketLayout} from './tournament-bracket-layout.js';
const escape=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dollars=n=>'$'+(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const titleCase=s=>String(s).replace(/^./,c=>c.toUpperCase());
const moneyInput=n=>(Number(n||0)/100).toFixed(2);
export function createTournamentManagement({api,heading,icon,today,toast,rerender,isAdmin}){
 let rows=[],loaded=false,loading=false,busy=false,selectedId=null,showCreate=false,teamCount=8,setup={},
  editMatchId=null,editPayment=null,closeArmed=null,notice='',loadRequest=0,
  seedStage='semifinal',seedSlot='auto',seedSide='auto',seedTeam='';
 const current=()=>rows.find(r=>r.id===selectedId)||null;
 const refreshUI=()=>{if(typeof rerender==='function')rerender()};
 async function load(force=false){
  if(loading||loaded&&!force)return;
  if(!api.getSession()?.access_token)return;
  const seq=++loadRequest;loading=true;refreshUI();
  try{
   const list=await api.listAll('tournaments','order=event_date.desc,created_at.desc');
   if(seq!==loadRequest||!api.getSession()?.access_token)return;
   rows=list;loaded=true;
   if(!rows.some(t=>t.id===selectedId)){selectedId=rows[0]?.id||null;editMatchId=null;editPayment=null;closeArmed=null;}
   notice='';
  }catch(err){if(seq===loadRequest){notice=err.message||'Unable to load tournaments';loaded=false;}}
  finally{if(seq===loadRequest){loading=false;refreshUI();}}
 }
 const teamShort=(s,id)=>{const t=s.teams.find(t=>t.id===id);return t?tournamentTeamName(t):'TBD'};
 const nameDetail=teamShort;
 function setupPage(){
  const defaults=[...Array(teamCount)].map((_,i)=>{
   const p=i+1;
   return '<div class="tm-team-input"><strong>Pair '+p+'</strong>'+
    '<input name="player_'+p+'_1" required maxlength="100" placeholder="Player 1 full name" value="'+escape(setup['player_'+p+'_1']||'')+'">'+
    '<input name="player_'+p+'_2" required maxlength="100" placeholder="Player 2 full name" value="'+escape(setup['player_'+p+'_2']||'')+'"></div>';
  }).join('');
  return '<section class="panel tm-setup"><div class="tm-head"><h2>New tournament</h2><button class="btn btn-light btn-xs" data-action="tm-cancel-create">Cancel</button></div>'+
   '<form data-tm-submit="create" id="tm-create-form"><div class="tm-create-grid">'+
   '<label>Name<input name="name" required maxlength="100" placeholder="PADEL ON Friday Open" value="'+escape(setup.name||'')+'"></label>'+
   '<label>Date<input name="date" type="date" required value="'+escape(setup.date||today())+'"></label>'+
   '<label>Start time<input name="time" type="time" required value="'+escape(setup.time||'18:00')+'"></label>'+
   '<label>Fee per participant ($)<input name="fee" type="number" min="0" max="1000000" step="0.01" required value="'+escape(setup.fee??'20')+'"></label>'+
   '<label>Competition format<select name="format">'+
    '<option value="groups" '+(setup.format!=='knockout'?'selected':'')+'>Groups + Knockout</option>'+
    '<option value="knockout" '+(setup.format==='knockout'?'selected':'')+'>Knockout Only</option></select></label>'+
   '<label>Number of teams (2–32)<input id="tm-team-count" type="number" min="2" max="32" step="1" name="team_count" value="'+teamCount+'" required></label></div>'+
   '<p class="tm-hint">Add two players per team. Fees are per player and can be changed later.</p>'+
   '<div class="tm-team-inputs">'+defaults+'</div>'+
   '<button type="submit" class="btn btn-primary" '+(busy?'disabled':'')+'>'+icon('plus')+' Create & Shuffle Tournament</button></form></section>';
 }
 function paymentTable(t){
  const s=t.state,totals=tournamentTotals(s);
  const people=s.teams.flatMap(team=>team.members.map(member=>({team,member})));
  const stats='<div class="tm-stats">'+[
   ['Total paid',dollars(totals.paid)],['Amount remaining',dollars(totals.remaining)],
   ['Expected participation fees',dollars(totals.due)],['Participants',people.length]
  ].map(([name,value])=>'<article><small>'+name+'</small><strong>'+value+'</strong></article>').join('')+'</div>';
  const credit=totals.overpaid>0?'<p class="tm-credit-note">Some participants paid '+dollars(totals.overpaid)+' more than their adjusted fees. Remaining balances below are calculated per person.</p>':'';
  const members=people.map(({team,member})=>{
   const remaining=Math.max(0,Number(member.due)-Number(member.paid)),editor=editPayment&&
    editPayment.team===team.id&&editPayment.member===member.id;
   const controls='<div class="tm-payment-actions">'+
      '<button type="button" class="tm-mini-btn" data-action="tm-edit-due" data-team="'+escape(team.id)+'" data-member="'+escape(member.id)+'">Edit Amount</button>'+
      '<button type="button" class="tm-mini-btn tm-pay-btn" data-action="tm-pay" data-team="'+escape(team.id)+'" data-member="'+escape(member.id)+'" '+(!remaining?'disabled':'')+'>Pay</button></div>';
   const edit=editor?'<form class="tm-inline-editor" data-tm-submit="finance" data-team="'+escape(team.id)+'" data-member="'+escape(member.id)+'" data-kind="'+escape(editPayment.kind)+'">'+
      '<label>'+(editPayment.kind==='due'?'New required amount ($)':'Payment amount ($)')+
      '<input name="amount" type="number" inputmode="decimal" step="0.01" min="'+(editPayment.kind==='pay'?'0.01':'0')+'" max="'+(editPayment.kind==='pay'?moneyInput(remaining):'1000000')+'" value="'+moneyInput(editPayment.kind==='pay'?remaining:member.due)+'" required></label>'+
      '<button class="btn btn-primary btn-xs" type="submit">Save</button>'+
      '<button class="btn btn-light btn-xs" type="button" data-action="tm-cancel-edit">Cancel</button></form>':'';
   return '<tr><td><strong>'+escape(member.name)+'</strong></td><td>'+escape(tournamentTeamName(team))+'</td><td>'+dollars(member.due)+'</td><td>'+dollars(member.paid)+'</td><td><strong>'+dollars(remaining)+'</strong>'+(member.paid>member.due?'<small class="tm-credit-note">Overpaid '+dollars(member.paid-member.due)+'</small>':'')+'</td><td>'+controls+edit+'</td></tr>';
  }).join('');
  return stats+credit+'<section class="panel tm-payments"><div class="tm-head"><h2>Participant Payments</h2><span class="tm-muted">Each team has two participants</span></div>'+
   '<div class="tm-table-scroll"><table><thead><tr><th>Participant</th><th>Team</th><th>Amount due</th><th>Paid</th><th>Remaining</th><th>Actions</th></tr></thead><tbody>'+members+'</tbody></table></div></section>';
 }
 function matchEditor(m){
  const setFields=[0,1,2].map((i)=>{
   const s=m.sets?.[i]||{};
   const field=(name,val,extra='')=>'<input type="number" inputmode="numeric" min="0" max="'+(name==='a'||name==='b'?'7':'999')+'" step="1" name="s'+(i+1)+name+'" value="'+(val??'')+'" placeholder="'+extra+'">';
   return '<div class="tm-set-fields"><strong>Set '+(i+1)+'</strong>'+
    field('a',s.a,'A')+'<span>–</span>'+field('b',s.b,'B')+
    '<small>Tie-break</small>'+field('ta',s.ta,'A pts')+field('tb',s.tb,'B pts')+'</div>';
  }).join('');
  return '<form class="tm-score-editor" data-tm-submit="score" data-match="'+escape(m.id)+'">'+
   '<p>Enter 2 or 3 completed sets. For a 7–6 set, also enter the tie-break points (at least 7, win by 2).</p>'+
   setFields+'<div class="tm-score-controls"><button class="btn btn-primary btn-xs" type="submit" '+(busy?'disabled':'')+'>Save Match Result</button>'+
   '<button type="button" data-action="tm-cancel-edit" class="btn btn-light btn-xs">Cancel</button></div></form>';
 }
 function matchCard(t,m){
  const s=t.state,a=teamShort(s,m.a),b=teamShort(s,m.b);
  const detail=(m.sets||[]).map(x=>x.a+'–'+x.b+(x.ta!==undefined?' (TB '+x.ta+'–'+x.tb+')':'')).join(' / ');
  const bye=!!m.winner&&!m.sets?.length;
  return '<div class="tm-match '+(m.winner?'tm-match-complete':'')+'"><div class="tm-match-top"><small>'+escape(m.id)+
    (m.phase==='group'?' · Group '+escape(m.group):' · Round '+m.round)+'</small>'+
    (m.winner?'<span class="tm-winner">Won: '+escape(teamShort(s,m.winner))+'</span>':'<span class="tm-muted">Upcoming</span>')+'</div>'+
    '<div class="tm-match-teams"><strong>'+escape(a)+'</strong><span>vs</span><strong>'+escape(b)+'</strong></div>'+
    (detail?'<div class="tm-set-line">'+escape(detail)+'</div>':bye?'<div class="tm-muted">Advanced by bye</div>':'')+
    (m.a&&m.b?'<button type="button" class="tm-mini-btn" data-action="tm-edit-score" data-id="'+escape(m.id)+'" '+
      (m.phase==='group'&&s.knockoutSeeded?'disabled title="Group results are locked after knockout seeding"':'')+'>'+
      (m.winner?'Edit Score':'Record Score')+'</button>':'')+
    (editMatchId===m.id?matchEditor(m):'')+'</div>';
 }
 function groupStage(t){
  const s=t.state,groups=[...new Set(s.teams.map(team=>team.group))].filter(Boolean).sort();
  const groupHTML=groups.map(g=>{
   const teams=groupStandings(s,g);
   const table='<div class="tm-table-scroll"><table><thead><tr><th>Team</th><th>Played</th><th>Wins</th><th>Sets +/-</th><th>Games +/-</th></tr></thead><tbody>'+
    teams.map(x=>'<tr><td>'+escape(tournamentTeamName(x.team))+'</td><td>'+x.played+'</td><td>'+x.wins+'</td><td>'+
     (x.setsWon-x.setsLost)+'</td><td>'+(x.gamesWon-x.gamesLost)+'</td></tr>').join('')+'</tbody></table></div>';
   const fixtures=s.matches.filter(m=>m.phase==='group'&&m.group===g).sort((a,b)=>a.round-b.round||a.slot-b.slot)
    .map(m=>matchCard(t,m)).join('');
   return '<div class="tm-group panel"><h3>Group '+escape(g)+'</h3>'+table+'<div class="tm-fixtures">'+fixtures+'</div></div>';
  }).join('');
  const finished=s.matches.filter(m=>m.phase==='group').every(m=>!!m.winner);
  return '<section class="tm-section"><div class="tm-head"><h2>Shuffled Group Stage</h2><span>'+(
   finished?'All group fixtures completed':'Round robin · each team plays every team in its group')+'</span></div>'+
   '<div class="tm-groups">'+groupHTML+'</div></section>';
 }
 function pyramidMatchCard(t,m){
  const state=t.state,possible=Number(m.possibleA||0)+Number(m.possibleB||0);
  const empty=(m.possibleA!==undefined&&possible===0);
  const bye=!!m.winner&&!m.sets?.length;
  const sets=(m.sets||[]).map(x=>x.a+'-'+x.b+(x.ta!==undefined?' (TB '+x.ta+'-'+x.tb+')':'')).join(' / ');
  const label=id=>{
   const team=state.teams.find(t=>t.id===id);
   return team?'<span class="tm-bracket-team-name" title="'+escape(tournamentTeamName(team))+'">'+escape(tournamentTeamName(team))+'</span>':'To be decided';
  };
  const teamRow=(id,side)=>{
   const isWinner=!!id&&m.winner===id;
   const preset=m['seed'+side.toUpperCase()]===id&&!!id;
   return '<div class="tm-pyramid-side '+(isWinner?'winner':'')+'"><span class="tm-pyramid-player">'+
    (id?label(id):'<span class="tm-pyramid-placeholder">TBD</span>')+
    (preset?'<em class="tm-pyramid-seed">Seeded</em>':'')+
    '</span><strong>'+(m.sets?.length?m.sets.map(x=>x[side]).join(' '):isWinner&&!m.sets?.length?'BYE':'–')+'</strong></div>';
  };
  return '<div class="tm-pyramid-cell">'+
    (!empty?'<div class="tm-pyramid-card '+(m.winner?'tm-pyramid-complete':'')+'">'+
      '<small>'+escape(m.id)+'</small>'+
      teamRow(m.a,'a')+teamRow(m.b,'b')+
      (sets?'<div class="tm-pyramid-set-line">'+escape(sets)+'</div>':'')+
      (m.a&&m.b?'<button type="button" class="tm-pyramid-score-link" data-action="tm-edit-score" data-id="'+escape(m.id)+'">'+
        (m.winner?'Edit score':'Record score')+'</button>':'')+
    '</div>':'<div class="tm-pyramid-empty" aria-hidden="true"></div>')+
  '</div>';
 }
 function seedingPanel(t,ko,rounds){
  if(ko.some(m=>m.sets?.length))return '<aside class="tm-seeding-sidebar"><section class="panel tm-seeding-panel"><h3>Seeding locked</h3><p>Seeding cannot be changed after knockout scores have been recorded.</p></section></aside>';
  const state=t.state,seeded=state.seedPlacements||[],seeds=new Set(seeded.map(p=>p.team));
  const remaining=knockoutSeedEntrants(state).filter(team=>!seeds.has(team.id));
  const labels={final:'Final',semifinal:'Semifinals',quarterfinal:'Quarterfinals'};
  const stages=['semifinal','quarterfinal','final'];
  const maxSlots=seedStage==='semifinal'?2:seedStage==='quarterfinal'?4:1;
  const selectTeam='<select name="team" id="tm-seed-team" required><option value="">Choose a team…</option>'+
    remaining.map(team=>'<option value="'+escape(team.id)+'" '+(seedTeam===team.id?'selected':'')+'>'+
      escape(tournamentTeamName(team))+'</option>').join('')+'</select>';
  const selectStage='<select name="stage" id="tm-seed-stage">'+stages.map(st=>
    '<option value="'+st+'" '+(seedStage===st?'selected':'')+'>'+labels[st]+'</option>').join('')+'</select>';
  const selectSlot='<select name="slot" id="tm-seed-slot"><option value="auto">Auto-assign</option>'+
    Array.from({length:maxSlots},(_,i)=>'<option value="'+(i+1)+'" '+(seedSlot===String(i+1)?'selected':'')+'>'+
      'Match '+(i+1)+'</option>').join('')+'</select>';
  const selectSide='<select name="side" id="tm-seed-side">'+
    [['auto','Auto-assign'],['a','First team'],['b','Second team']].map(([value,label])=>
      '<option value="'+value+'" '+(seedSide===value?'selected':'')+'>'+label+'</option>').join('')+'</select>';
  const form='<form data-tm-submit="seed-placement" class="tm-seeding-form">'+
    '<label>Selected team'+selectTeam+'</label><label>Enter directly in'+selectStage+'</label>'+
    '<label>Bracket match'+selectSlot+'</label><label>Position'+selectSide+'</label>'+
    '<button type="submit" class="btn btn-primary" '+(!remaining.length||busy?'disabled':'')+'>+ Add Seed</button>'+
    '</form>';
  const list=seeded.map((p,i)=>{
    const team=state.teams.find(t=>t.id===p.team);
    return '<tr><td>'+(i+1)+'</td><td>'+escape(team?tournamentTeamName(team):p.team)+'</td>'+
      '<td>'+escape(labels[p.stage]||p.stage)+'</td><td>'+p.slot+' '+p.side.toUpperCase()+'</td>'+
      '<td><button type="button" class="tm-mini-btn" data-action="tm-remove-seed" data-id="'+escape(p.team)+'" title="Remove seed and rebalance bracket">Remove</button></td></tr>';
  }).join('');
  return '<aside class="tm-seeding-sidebar">'+
   '<section class="panel tm-seeding-panel"><h3>Seeding Controls</h3>'+
   '<p>Reserve a place for a strong doubles team in the semifinals, quarterfinals, or final. The other teams are redistributed fairly and no team is duplicated.</p>'+
   form+'</section>'+
   '<section class="panel tm-seeding-panel"><h3>Seeded Teams ('+seeded.length+')</h3>'+
   (seeded.length?'<div class="tm-table-scroll"><table><thead><tr><th>#</th><th>Team</th><th>Entry</th><th>Position</th><th></th></tr></thead><tbody>'+list+'</tbody></table></div>':
     '<p>No priority seeds yet. All teams enter through the standard draw.</p>')+
   '</section></aside>';
 }
 function knockoutStage(t){
  const state=t.state,ko=state.matches.filter(m=>m.phase==='knockout');
  if(!ko.length){
   const ready=state.mode==='groups'&&state.matches.filter(m=>m.phase==='group').every(m=>!!m.winner);
   return '<section class="panel tm-knockout-wait"><h2>Knockout Bracket</h2><p>'+
    (ready?'The group stage is finished. Generate the knockout draw using group standings.':'Complete all group matches to unlock the knockout draw.')+'</p>'+
    (ready?'<button type="button" data-action="tm-seed" class="btn btn-primary" '+(busy?'disabled':'')+'>Generate Knockout Bracket</button>':'')+'</section>';
  }
  const layout=knockoutBracketLayout(ko);
  const rounds=layout.rounds;
  const champion=tournamentChampion(state);
  const roundNames=round=>{
   const fromFinal=rounds.length-round;
   return fromFinal===0?'Final':fromFinal===1?'Semifinals':
    fromFinal===2?'Quarterfinals':'Round '+round;
  };
  const headings=rounds.map(round=>
   '<h3 class="tm-bracket-round-heading" style="left:'+((round-1)*(layout.cardWidth+layout.columnGap))+
    'px;width:'+layout.cardWidth+'px">'+roundNames(round)+'</h3>').join('');
  // Paths and match cards use the same coordinates, including after staff
  // reseeding. Every pair of feeder matches converges on its actual parent.
  const connectors='<svg class="tm-bracket-edges" xmlns="http://www.w3.org/2000/svg" '+
    'width="'+layout.width+'" height="'+layout.height+'" viewBox="0 0 '+layout.width+' '+layout.height+'" '+
    'aria-hidden="true" focusable="false">'+
    layout.links.map(link=>'<path d="'+link.d+'" />').join('')+'</svg>';
  const cards=layout.nodes.map(node=>
   '<div class="tm-bracket-node" style="left:'+node.x+'px;top:'+node.y+
    'px;width:'+layout.cardWidth+'px" data-match="'+escape(node.match.id)+'">'+
    pyramidMatchCard(t,node.match)+'</div>').join('');
  const bracket='<div class="tm-bracket-scroll" role="region" tabindex="0" '+
    'aria-label="Knockout bracket: earlier rounds on the left, final on the right">'+
    '<div class="tm-bracket-board" style="width:'+layout.width+'px;height:'+layout.height+'px">'+
     connectors+headings+cards+'</div></div>';
  const editing=ko.find(m=>m.id===editMatchId&&m.a&&m.b);
  const editor=editing?'<section class="tm-pyramid-edit panel"><div class="tm-head"><h3>Match '+escape(editing.id)+' · '+
    escape(teamShort(state,editing.a))+' vs '+escape(teamShort(state,editing.b))+'</h3></div>'+
    matchEditor(editing)+'</section>':'';
  return '<section class="panel tm-knockout"><div class="tm-head"><div><h2>Knockout Bracket</h2>'+
    '<span class="tm-muted">Best of 3 sets · Winners advance toward the final</span></div>'+
    (champion?'<strong class="tm-champion">🏆 '+escape(nameDetail(state,champion))+'</strong>':'')+'</div>'+
    '<div class="tm-knockout-layout"><div class="tm-pyramid-content">'+bracket+editor+'</div>'+
    seedingPanel(t,ko,rounds)+'</div></section>';
 }
 function selectedPage(t){
  const s=t.state,complete=s.matches.filter(m=>m.phase==='knockout').length>0&&!!tournamentChampion(s);
  const participants=s.teams.length*2;
  const details='<section class="panel tm-tournament-info"><div><h2>'+escape(t.name)+'</h2><p>'+
   escape(t.event_date)+' at '+escape(String(t.start_time).slice(0,5))+' · '+(t.format==='groups'?'Groups + Knockout':'Knockout Only')+
   ' · '+s.teams.length+' teams / '+participants+' players · Fee '+dollars(t.fee_cents)+' per player</p></div>'+
   '<div class="tm-tournament-actions"><button class="btn btn-light btn-xs" data-action="tm-download">'+icon('download')+
   ' Download Full PDF</button>'+
   (isAdmin()?'<button class="btn btn-light btn-xs tm-danger" data-action="tm-close-start">Close Tournament</button>':'')+'</div></section>';
  const archive=closeArmed?.id===t.id?'<section class="panel tm-close-confirm"><h3>Delete this tournament after saving the PDF</h3>'+
    '<p>The archive download was started. Verify that the PDF is saved on your device and contains the full draw, match scores and payments. Closing permanently removes its teams, payments, and match results.</p>'+
    '<label><input type="checkbox" id="tm-archive-saved" '+(closeArmed.confirmed?'checked':'')+'> I have saved the complete tournament PDF and understand the data will be deleted.</label>'+
    '<div><button class="btn btn-light btn-xs" data-action="tm-close-cancel">Cancel</button> '+
    '<button class="btn btn-primary btn-xs tm-danger" data-action="tm-close-final" '+(!closeArmed.confirmed?'disabled':'')+'>Confirm PDF Saved & Delete Tournament</button></div></section>':'';
  return details+archive+paymentTable(t)+(s.mode==='groups'?groupStage(t):'')+knockoutStage(t);
 }
 function page(){
  const head=heading('Matchmaking / tournaments','Tournament Management',
   'Create shuffled padel tournaments, track group and knockout scores, and record participant payments.',
   '<button type="button" class="btn btn-primary" data-action="tm-create-show" '+(showCreate?'disabled':'')+'>'+icon('plus')+' Create Tournament</button>');
  if(!loaded)return head+'<div class="notice '+(notice?'warn':'')+'">'+escape(notice||'Loading tournaments…')+'</div>';
  const selector=rows.length?'<div class="tm-selector">'+rows.map(t=>'<button type="button" data-action="tm-select" data-id="'+escape(t.id)+
   '" class="tm-tournament-tab '+(selectedId===t.id?'active':'')+'">'+escape(t.name)+
   '<small>'+escape(t.event_date)+'</small></button>').join('')+'</div>':'';
  const empty=!rows.length&&!showCreate?'<section class="panel tm-empty"><h2>No active tournaments</h2>'+
   '<p>Create a tournament to shuffle the teams and begin tracking matches and participant fees. </p>'+
   '<button type="button" class="btn btn-primary" data-action="tm-create-show">Create Tournament</button></section>':'';
  return head+selector+(showCreate?setupPage():'')+empty+(current()&&!showCreate?selectedPage(current()):'');
 }
 async function mutate(t,action,data){
  if(busy)throw Error('A tournament update is already in progress.');
  busy=true;refreshUI();
  try{
   await api.rpc('tournament_change',{p_id:t.id,p_expected_version:t.version,p_action:action,p_data:data});
   await load(true);
  }catch(e){if(/changed|not found/i.test(e.message))await load(true);throw e;}
  finally{busy=false;refreshUI();}
 }
 async function saveSeedPlacement(t,placements){
  if(busy)throw Error('Another tournament update is already in progress.');
  const proposed=reseedTournamentKnockout(t.state,placements);
  const matches=proposed.matches.filter(m=>m.phase==='knockout');
  busy=true;refreshUI();
  try{
   await api.rpc('tournament_reseed',{
    p_id:t.id,p_expected_version:t.version,p_placements:placements,p_matches:matches
   });
   editMatchId=null;await load(true);
  }catch(e){if(/changed|not found/i.test(e.message))await load(true);throw e;}
  finally{busy=false;refreshUI()}
 }
 async function action(target){
  const name=target.dataset.action;if(!name?.startsWith('tm-'))return false;
  if(!api.getSession()?.access_token)throw Error('Staff access required.');
  const t=current();
  if(name==='tm-create-show'){showCreate=true;setup={};teamCount=8;refreshUI();return true}
  if(name==='tm-cancel-create'){showCreate=false;setup={};refreshUI();return true}
  if(name==='tm-select'){selectedId=target.dataset.id;editMatchId=null;editPayment=null;closeArmed=null;refreshUI();return true}
  if(name==='tm-cancel-edit'){editMatchId=null;editPayment=null;refreshUI();return true}
  if(!t)throw Error('Select a tournament first.');
  if(name==='tm-edit-due'||name==='tm-pay'){
   editMatchId=null;
   editPayment={team:target.dataset.team,member:target.dataset.member,kind:name==='tm-pay'?'pay':'due'};
   refreshUI();return true;
  }
  if(name==='tm-edit-score'){
   const m=t.state.matches.find(m=>m.id===target.dataset.id);
   if(!m||!m.a||!m.b)throw Error('Match is not ready.');
   if(m.phase==='group'&&t.state.knockoutSeeded)
    throw Error('Group results are locked after the knockout draw is generated.');
   editPayment=null;editMatchId=m.id;refreshUI();return true;
  }
  if(name==='tm-remove-seed'){
   const currentSeeds=t.state.seedPlacements||[];
   if(!currentSeeds.some(p=>p.team===target.dataset.id))throw Error('Seeded team not found.');
   await saveSeedPlacement(t,currentSeeds.filter(p=>p.team!==target.dataset.id));
   toast('Seed removed. The bracket has been safely rebalanced.');return true;
  }
  if(name==='tm-seed'){
   const seeds=getQualifiers(t.state);
   const bracket=makeKnockoutMatches(seeds);
   await mutate(t,'seed',{seeds:seeds.map(x=>x.id),matches:bracket});
   toast('Knockout bracket generated from the group standings.');return true;
  }
  if(name==='tm-download'){
   const archive=tournamentArchivePdf(t);const file=downloadTournamentPdf(archive.pdf,t);
   toast('Tournament PDF downloaded: '+file+' ('+archive.pages+' pages).');return true;
  }
  if(name==='tm-close-start'){
   if(!isAdmin())throw Error('Only admins may close tournaments.');
   const archive=tournamentArchivePdf(t);
   downloadTournamentPdf(archive.pdf,t);
   closeArmed={id:t.id,version:t.version,confirmed:false};
   refreshUI();toast('Tournament PDF download started. Confirm the file is saved before closing.');return true;
  }
  if(name==='tm-close-cancel'){closeArmed=null;refreshUI();return true}
  if(name==='tm-close-final'){
   if(!isAdmin())throw Error('Only admins may close tournaments.');
   if(!closeArmed||closeArmed.id!==t.id||closeArmed.version!==t.version||!closeArmed.confirmed)
    throw Error('Download and confirm saving the PDF before closing.');
   if(!window.confirm('Permanently delete '+t.name+' and all its scores and payments? Make sure your PDF has been saved.'))return true;
   if(busy)throw Error('Another save is in progress.');
   busy=true;
   try{
    await api.rpc('tournament_close',{p_id:t.id,p_expected_version:t.version});
    closeArmed=null;selectedId=null;await load(true);
    toast('Tournament closed. Keep the downloaded PDF for future reference.');
   }finally{busy=false;refreshUI()}
   return true;
  }
  return false;
 }
 function change(target){
  if(['tm-seed-stage','tm-seed-slot','tm-seed-side','tm-seed-team'].includes(target.id)){
   if(target.id==='tm-seed-stage'){seedStage=target.value;seedSlot='auto';}
   if(target.id==='tm-seed-slot')seedSlot=target.value;
   if(target.id==='tm-seed-side')seedSide=target.value;
   if(target.id==='tm-seed-team')seedTeam=target.value;
   refreshUI();return true;
  }
  if(target.id==='tm-team-count'){
   const form=target.closest('form');
   if(form)setup=Object.fromEntries(new FormData(form).entries());
   const value=Number(target.value);
   if(!Number.isInteger(value)||value<2||value>32){toast('Choose 2–32 teams.',true);return true;}
   teamCount=value;refreshUI();return true;
  }
  if(target.id==='tm-archive-saved'){
   if(closeArmed){closeArmed.confirmed=target.checked;refreshUI();}
   return true;
  }
  return false;
 }
 async function submit(form){
  const kind=form.dataset.tmSubmit;
  if(!kind)return false;
  if(busy)throw Error('Please finish the current update first.');
  const data=Object.fromEntries(new FormData(form).entries());
  if(kind==='create'){
   const fee=parseTournamentMoney(data.fee);
   const name=String(data.name||'').trim();
   if(name.length<2||name.length>100)throw Error('Tournament name must be 2–100 characters.');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(String(data.date))||!/^\d{2}:\d{2}$/.test(String(data.time)))
    throw Error('Enter valid tournament date and time.');
   if(Number(data.team_count)!==teamCount)throw Error('Confirm your number of teams.');
   const teamRows=Array.from({length:teamCount},(_,i)=>({
    p1:data['player_'+(i+1)+'_1'],p2:data['player_'+(i+1)+'_2']
   }));
   const initial=makeInitialTournament(teamRows,fee,data.format);
   busy=true;refreshUI();
   try{
    const id=await api.rpc('tournament_create',{
     p_name:name,p_date:data.date,p_time:data.time,p_fee_cents:fee,p_format:data.format,p_state:initial
    });
    selectedId=id;showCreate=false;setup={};await load(true);
    toast('Tournament created and teams shuffled.');
   }finally{busy=false;refreshUI()}
   return true;
  }
  const t=current();if(!t)throw Error('Tournament not found.');
  if(kind==='seed-placement'){
   const state=t.state,participants=knockoutSeedEntrants(state);
   if(!participants.some(team=>team.id===data.team))throw Error('Choose a qualifying team.');
   const prior=state.seedPlacements||[];
   if(prior.some(p=>p.team===data.team))throw Error('This team is already seeded. Remove its old seed to change it.');
   const selectedStages=['final','semifinal','quarterfinal'];
   if(!selectedStages.includes(data.stage))throw Error('Choose a valid entry round.');
   const stages={final:1,semifinal:2,quarterfinal:4};
   const slots=data.slot==='auto'?Array.from({length:stages[data.stage]},(_,i)=>i+1):[Number(data.slot)];
   const sides=data.side==='auto'?['a','b']:[data.side];
   let placements=null,lastError=null;
   outer:for(const slot of slots)for(const side of sides){
    const candidate=[...prior,{team:data.team,stage:data.stage,slot,side}];
    try{reseedTournamentKnockout(state,candidate);placements=candidate;break outer;}
    catch(err){lastError=err;}
   }
   if(!placements)throw lastError||Error('No suitable seed position available.');
   await saveSeedPlacement(t,placements);
   seedTeam='';toast('Seed saved. The pyramid draw has been updated.');return true;
  }
  if(kind==='finance'){
   if(!editPayment||form.dataset.team!==editPayment.team||form.dataset.member!==editPayment.member)
    throw Error('Select the participant again.');
   const amount=parseTournamentMoney(data.amount);
   await mutate(t,editPayment.kind,{team:editPayment.team,member:editPayment.member,amount});
   editPayment=null;refreshUI();toast('Participant payment details saved.');return true;
  }
  if(kind==='score'){
   const match=t.state.matches.find(m=>m.id===form.dataset.match);
   if(!match||!match.a||!match.b)throw Error('Match is not ready.');
   const sets=[];
   for(let i=1;i<=3;i++){
    const a=String(data['s'+i+'a']||'').trim(),b=String(data['s'+i+'b']||'').trim();
    const ta=String(data['s'+i+'ta']||'').trim(),tb=String(data['s'+i+'tb']||'').trim();
    if(!a&&!b&&!ta&&!tb)continue;
    if(!/^\d+$/.test(a)||!/^\d+$/.test(b))throw Error('Each played set must have both scores.');
    const set={a:Number(a),b:Number(b)};
    if(ta||tb){
     if(!/^\d+$/.test(ta)||!/^\d+$/.test(tb))throw Error('Both tie-break scores are required.');
     set.ta=Number(ta);set.tb=Number(tb);
    }
    sets.push(set);
   }
   padelMatchWinner(sets);
   await mutate(t,'score',{match:match.id,sets});
   editMatchId=null;refreshUI();toast('Match result saved and bracket updated.');return true;
  }
  throw Error('Unknown tournament form.');
 }
 function reset(){rows=[];loaded=false;loading=false;busy=false;selectedId=null;showCreate=false;setup={};teamCount=8;
  editMatchId=null;editPayment=null;closeArmed=null;notice='';seedStage='semifinal';seedSlot='auto';seedSide='auto';seedTeam='';loadRequest++}
 return {page,load,action,change,submit,reset};
}
