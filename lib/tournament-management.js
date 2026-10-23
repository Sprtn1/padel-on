import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,
 getQualifiers,padelMatchWinner,groupStandings,tournamentTotals,tournamentChampion,
 knockoutSeedEntrants,reseedTournamentKnockout,tournamentTeamName,tournamentCanResize,resizeTournamentDraw} from './tournament-engine.js';
import {tournamentArchivePdf,downloadTournamentPdf} from './tournament-pdf.js';
import {knockoutBracketLayout} from './tournament-bracket-layout.js';
const escape=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dollars=n=>'$'+(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const titleCase=s=>String(s).replace(/^./,c=>c.toUpperCase());
const moneyInput=n=>(Number(n||0)/100).toFixed(2);
export function createTournamentManagement({api,heading,icon,today,toast,rerender,isAdmin}){
 let rows=[],loaded=false,loading=false,busy=false,selectedId=null,showCreate=false,teamCount=8,setup={},
  editMatchId=null,editTimeId=null,editPayment=null,paymentSearch='',closeArmed=null,notice='',loadRequest=0,
  seedStage='semifinal',seedSlot='auto',seedSide='auto',seedTeam='',editingTeamCount=false,teamDraft=[],shufflePrompt=null;
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
   if(!rows.some(t=>t.id===selectedId)){selectedId=rows[0]?.id||null;paymentSearch='';editMatchId=null;editTimeId=null;editPayment=null;closeArmed=null;editingTeamCount=false;teamDraft=[];shufflePrompt=null;}
   notice='';
  }catch(err){if(seq===loadRequest){notice=err.message||'Unable to load tournaments';loaded=false;}}
  finally{if(seq===loadRequest){loading=false;refreshUI();}}
 }
 const teamShort=(s,id)=>{const t=s.teams.find(t=>t.id===id);return t?tournamentTeamName(t):'TBD'};
 const nameDetail=teamShort;
 const normalizePaymentSearch=value=>String(value??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase().trim();
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
  const query=normalizePaymentSearch(paymentSearch);
  const visibleCount=people.filter(({member})=>normalizePaymentSearch(member.name).includes(query)).length;
  const searchBox='<label class="tm-payment-search"><span>Find player</span><input id="tm-payment-search" type="search" autocomplete="off" placeholder="Search player name..." aria-label="Search participant payments by player name" value="'+escape(paymentSearch)+'"></label>';
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
   return '<tr data-payment-player="'+escape(normalizePaymentSearch(member.name))+'" '+(query&&!normalizePaymentSearch(member.name).includes(query)?'hidden':'')+'><td><strong>'+escape(member.name)+'</strong></td><td>'+escape(tournamentTeamName(team))+'</td><td>'+dollars(member.due)+'</td><td>'+dollars(member.paid)+'</td><td><strong>'+dollars(remaining)+'</strong>'+(member.paid>member.due?'<small class="tm-credit-note">Overpaid '+dollars(member.paid-member.due)+'</small>':'')+'</td><td>'+controls+edit+'</td></tr>';
  }).join('');
  return stats+credit+'<section class="panel tm-payments"><div class="tm-head tm-payment-head"><div><h2>Participant Payments</h2><span class="tm-muted">Each team has two participants</span></div>'+searchBox+'</div>'+
   '<p class="tm-payment-count" aria-live="polite">Showing '+visibleCount+' of '+people.length+' players</p>'+
   '<div class="tm-table-scroll"><table><thead><tr><th>Participant</th><th>Team</th><th>Amount due</th><th>Paid</th><th>Remaining</th><th>Actions</th></tr></thead><tbody>'+members+'</tbody></table></div>'+
   '<p class="tm-payment-empty" '+(visibleCount?'hidden':'')+'>No players match that search.</p></section>';
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

 function timeLabel(m,compact=false){
  const time=typeof m.scheduledTime==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(m.scheduledTime)?
   m.scheduledTime:'';
  const editable=m.phase==='group'||
   (m.possibleA!==undefined?Number(m.possibleA)>0&&Number(m.possibleB)>0:
    m.round>1||Boolean(m.a&&m.b));
  if(!editable)return '';
  return '<div class="tm-match-time'+(compact?' tm-match-time-compact':'')+'">'+
   (time?'<strong>'+escape(time)+'</strong>':'')+
   '<button type="button" class="tm-time-link" data-action="tm-edit-time" data-id="'+escape(m.id)+'" '+
   (busy?'disabled':'')+'>'+icon('clock')+' '+(time?'Edit time':'Set time')+'</button></div>';
 }
 function matchTimeEditor(m){
  const time=typeof m.scheduledTime==='string'?m.scheduledTime:'';
  return '<form class="tm-time-editor" data-tm-submit="time" data-match="'+escape(m.id)+'">'+
   '<label>Match start time (Beirut)<input type="time" name="time" required value="'+escape(time)+'"></label>'+
   '<div class="tm-time-editor-actions"><button type="submit" class="btn btn-primary btn-xs" '+(busy?'disabled':'')+'>Save Time</button>'+
   (time?'<button type="button" class="btn btn-light btn-xs" data-action="tm-clear-time" data-id="'+escape(m.id)+'" '+(busy?'disabled':'')+'>Clear Time</button>':'')+
   '<button type="button" class="btn btn-light btn-xs" data-action="tm-cancel-time">Cancel</button></div></form>';
 }
 function matchCard(t,m){
  const s=t.state,a=teamShort(s,m.a),b=teamShort(s,m.b);
  const detail=(m.sets||[]).map(x=>x.a+'–'+x.b+(x.ta!==undefined?' (TB '+x.ta+'–'+x.tb+')':'')).join(' / ');
  const bye=!!m.winner&&!m.sets?.length;
  return '<div class="tm-match '+(m.winner?'tm-match-complete':'')+'"><div class="tm-match-top"><small>'+escape(m.id)+
    (m.phase==='group'?' · Group '+escape(m.group):' · Round '+m.round)+'</small>'+
    '<div class="tm-match-status">'+(m.winner?'<span class="tm-winner">Won: '+escape(teamShort(s,m.winner))+'</span>':'<span class="tm-muted">Upcoming</span>')+
    timeLabel(m)+'</div></div>'+
    '<div class="tm-match-teams"><strong>'+escape(a)+'</strong><span>vs</span><strong>'+escape(b)+'</strong></div>'+
    (detail?'<div class="tm-set-line">'+escape(detail)+'</div>':bye?'<div class="tm-muted">Advanced by bye</div>':'')+
    (m.a&&m.b?'<button type="button" class="tm-mini-btn" data-action="tm-edit-score" data-id="'+escape(m.id)+'" '+
      (m.phase==='group'&&s.knockoutSeeded?'disabled title="Group results are locked after knockout seeding"':'')+'>'+
      (m.winner?'Edit Score':'Record Score')+'</button>':'')+
    (editMatchId===m.id?matchEditor(m):'')+
    (editTimeId===m.id?matchTimeEditor(m):'')+'</div>';
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
  const groupMatches=s.matches.filter(m=>m.phase==='group');
  const canShuffle=!s.knockoutSeeded&&!s.matches.some(m=>m.phase==='knockout')&&
   !groupMatches.some(m=>m.winner||m.sets?.length);
  const locked=Boolean(t.shuffle_locked);
  const shuffle='<button type="button" class="btn btn-light btn-xs" data-action="tm-shuffle-groups" '+
   (!canShuffle||busy?'disabled title="Group shuffling is available before scores are recorded"':'')+'>'+icon('refresh')+' Shuffle Groups</button>';
  const lockButton='<button type="button" class="btn btn-light btn-xs tm-shuffle-lock-button" data-action="'+
   (locked?'tm-unlock-shuffle':'tm-lock-shuffle')+'" '+
   (busy||(!locked&&!canShuffle)?'disabled':'')+' title="'+
   (locked?'Unlock shuffling with this tournament’s PIN':'Require a PIN to reshuffle this tournament')+'">'+
   icon(locked?'lock':'unlock')+' '+(locked?'Unlock Shuffle':'Lock Shuffle')+'</button>';
  const resetButton=locked&&isAdmin()?'<button type="button" class="btn btn-light btn-xs" data-action="tm-shuffle-reset-pin" '+
   (busy?'disabled':'')+'>Reset PIN</button>':'';
  const promptMode=shufflePrompt?.id===t.id?shufflePrompt.mode:null;
  const pinLabel=promptMode==='lock'?'Create tournament PIN':promptMode==='unlock'?'Enter PIN to unlock':'Enter PIN to shuffle';
  const pinPrompt=promptMode?'<form class="tm-shuffle-pin-form" data-tm-submit="shuffle-protection" data-mode="'+promptMode+'">'+
   '<label><span>'+pinLabel+' (4–8 digits)</span><input type="password" name="pin" inputmode="numeric" '+
   'pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" required></label>'+
   (promptMode==='lock'?'<label><span>Confirm PIN</span><input type="password" name="confirm_pin" inputmode="numeric" '+
   'pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="off" required></label>':'')+
   '<button type="submit" class="btn btn-primary btn-xs" '+(busy?'disabled':'')+'>'+
   (promptMode==='lock'?'Set Lock':promptMode==='unlock'?'Unlock':'Shuffle Now')+'</button>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="tm-shuffle-pin-cancel">Cancel</button></form>':'';
  const fiveNote=s.teams.length===5?'<p class="tm-five-rule"><strong>5-team group:</strong> Everybody plays everybody once (10 matches). Top 4 go to semifinals: 1st vs 4th, 2nd vs 3rd.</p>':'';
  return '<section class="tm-section"><div class="tm-head"><h2>Shuffled Group Stage</h2><div class="tm-group-head-actions">'+shuffle+lockButton+resetButton+'</div></div>'+
   (locked?'<p class="tm-shuffle-locked-note">'+icon('lock')+' Shuffle is PIN-protected for this tournament.</p>':'')+
   pinPrompt+fiveNote+'<div class="tm-groups">'+groupHTML+'</div></section>';
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
      '<div class="tm-pyramid-match-top"><small>'+escape(m.id)+'</small><span class="tm-muted">'+
       (m.sets?.length?'Completed':m.winner?'Bye':'Upcoming')+'</span></div>'+
      teamRow(m.a,'a')+teamRow(m.b,'b')+
      timeLabel(m,true)+
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
  const editingTime=ko.find(m=>m.id===editTimeId);
  const timeEditor=editingTime?'<section class="tm-pyramid-edit panel"><div class="tm-head"><h3>Schedule Match '+
    escape(editingTime.id)+'</h3></div>'+matchTimeEditor(editingTime)+'</section>':'';
  return '<section class="panel tm-knockout"><div class="tm-head"><div><h2>Knockout Bracket</h2>'+
    '<span class="tm-muted">Best of 3 sets · Winners advance toward the final</span></div>'+
    (champion?'<strong class="tm-champion">🏆 '+escape(nameDetail(state,champion))+'</strong>':'')+'</div>'+
    '<div class="tm-knockout-layout"><div class="tm-pyramid-content">'+bracket+editor+timeEditor+'</div>'+
    seedingPanel(t,ko,rounds)+'</div></section>';
 }
 function tournamentPaidTeam(row,teams){
  const t=teams.find(x=>x.id===row.id);
  return !!t&&t.members.some(p=>Number(p.paid||0)>0);
 }
 function captureTeamDraft(form){
  if(!form)return;
  const data=Object.fromEntries(new FormData(form).entries());
  teamDraft=teamDraft.map((t,i)=>t.id?t:{...t,
   p1:String(data['new_p1_'+i]??t.p1??''),
   p2:String(data['new_p2_'+i]??t.p2??'')});
 }
 function teamCountEditor(t){
  if(!editingTeamCount)return '';
  const old=new Map(t.state.teams.map(team=>[team.id,team]));
  const list=teamDraft.map((row,i)=>{
   const original=row.id?old.get(row.id):null;
   const paid=original?.members.reduce((n,p)=>n+Number(p.paid||0),0)||0;
   const label=original?tournamentTeamName(original):'New Team '+(i+1);
   const players=original?
    '<span class="tm-roster-names">'+escape(original.members.map(p=>p.name).join(' / '))+
      (paid?'<small> · Paid '+dollars(paid)+'</small>':'')+'</span>':
    '<span class="tm-roster-inputs"><input name="new_p1_'+i+'" maxlength="100" required placeholder="Player 1 name" value="'+escape(row.p1||'')+'">'+
    '<input name="new_p2_'+i+'" maxlength="100" required placeholder="Player 2 name" value="'+escape(row.p2||'')+'"></span>';
   return '<div class="tm-roster-team"><div><strong>'+escape(label)+'</strong>'+players+'</div>'+
    '<button type="button" class="tm-mini-btn tm-danger" data-action="tm-team-remove" data-index="'+i+'" '+
    (paid?'disabled title="This team has recorded payments"':'')+'>Remove</button></div>';
  }).join('');
  return '<section class="panel tm-roster-editor"><div class="tm-head"><div><h2>Manage Tournament Teams</h2>'+
   '<p class="tm-muted">Add new player pairs or remove unpaid teams before any match result. Existing payments stay with their players.</p></div>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="tm-team-cancel">Cancel</button></div>'+
   '<form id="tm-edit-team-form" data-tm-submit="resize-teams">'+
   '<div class="tm-roster-tools"><label>Number of teams (2–32)<input type="number" min="2" max="32" step="1" id="tm-existing-team-count" value="'+teamDraft.length+'"></label>'+
   '<button type="button" class="btn btn-light btn-xs" data-action="tm-team-add">+ Add Team</button></div>'+
   '<p class="tm-hint">Enter both names for every new team. Removing a team is allowed only if neither player has paid. Saving reshuffles the unplayed draw and clears scheduled match times.</p>'+
   (t.format==='groups'&&teamDraft.length===5?'<p class="tm-five-rule">Five teams: one group, ten matches, then 1st vs 4th and 2nd vs 3rd in the semifinals.</p>':'')+
   '<div class="tm-roster-list">'+list+'</div>'+
   '<button class="btn btn-primary" type="submit" '+(busy?'disabled':'')+'>Save Teams & Rebuild Draw</button></form></section>';
 }
 function selectedPage(t){
  const s=t.state,complete=s.matches.filter(m=>m.phase==='knockout').length>0&&!!tournamentChampion(s);
  const participants=s.teams.length*2;
  const details='<section class="panel tm-tournament-info"><div><h2>'+escape(t.name)+'</h2><p>'+
   escape(t.event_date)+' at '+escape(String(t.start_time).slice(0,5))+' · '+(t.format==='groups'?'Groups + Knockout':'Knockout Only')+
   ' · '+s.teams.length+' teams / '+participants+' players · Fee '+dollars(t.fee_cents)+' per player</p></div>'+
   '<div class="tm-tournament-actions">'+
   '<button class="btn btn-light btn-xs" data-action="tm-team-add-quick" '+
    (!tournamentCanResize(s)||busy||s.teams.length>=32?'disabled title="Teams can be added before play and knockout seeding, up to 32 total."':'')+
    '>'+icon('plus')+' Add Team</button>'+
   '<button class="btn btn-light btn-xs" data-action="tm-team-start" '+
    (!tournamentCanResize(s)||busy?'disabled title="Available before scores or knockout seeding"':'')+
    '>Manage Teams</button><button class="btn btn-light btn-xs" data-action="tm-download">'+icon('download')+
   ' Download Full PDF</button>'+
   (isAdmin()?'<button class="btn btn-light btn-xs tm-danger" data-action="tm-close-start">Close Tournament</button>':'')+'</div></section>';
  const archive=closeArmed?.id===t.id?'<section class="panel tm-close-confirm"><h3>Delete this tournament after saving the PDF</h3>'+
    '<p>The archive download was started. Verify that the PDF is saved on your device and contains the full draw, match scores and payments. Closing permanently removes its teams, payments, and match results.</p>'+
    '<label><input type="checkbox" id="tm-archive-saved" '+(closeArmed.confirmed?'checked':'')+'> I have saved the complete tournament PDF and understand the data will be deleted.</label>'+
    '<div><button class="btn btn-light btn-xs" data-action="tm-close-cancel">Cancel</button> '+
    '<button class="btn btn-primary btn-xs tm-danger" data-action="tm-close-final" '+(!closeArmed.confirmed?'disabled':'')+'>Confirm PDF Saved & Delete Tournament</button></div></section>':'';
  return details+teamCountEditor(t)+archive+paymentTable(t)+(s.mode==='groups'?groupStage(t):'')+knockoutStage(t);
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

 async function saveMatchTime(t,m,time){
  if(busy)throw Error('Another tournament update is already in progress.');
  busy=true;refreshUI();
  try{
   await api.rpc('tournament_set_match_time',{
    p_id:t.id,p_expected_version:t.version,p_match_id:m.id,p_time:time
   });
   editTimeId=null;
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
 function canReshuffle(t){
  return t.format==='groups'&&!t.state.knockoutSeeded&&
   !t.state.matches.some(m=>m.phase!=='group'||m.winner||m.sets?.length);
 }
 function shufflePINError(result){
  if(result===-1||result==='invalid_pin')throw Error('Incorrect tournament PIN.');
  if(result===-2||result==='cooldown')throw Error('Too many incorrect PIN attempts. Try again in 15 minutes.');
 }
 async function reshuffleGroups(t,pin){
  if(!canReshuffle(t))throw Error('Group shuffling is no longer available.');
  if(t.state.matches.some(m=>m.phase==='group'&&m.scheduledTime)&&
    !window.confirm('Reshuffling the groups will clear their scheduled match times. Continue?'))return;
  busy=true;refreshUI();
  try{
   const result=await api.rpc('tournament_shuffle_groups',{p_id:t.id,p_expected_version:t.version,p_pin:pin});
   shufflePINError(result);
   shufflePrompt=null;editMatchId=null;editTimeId=null;
   await load(true);
   toast('Groups reshuffled. You can shuffle again until matches begin.');
  }catch(e){if(/changed|not found/i.test(e.message))await load(true);throw e;}
  finally{busy=false;refreshUI();}
 }
 async function saveShuffleLock(t,action,pin){
  busy=true;refreshUI();
  try{
   const result=await api.rpc('tournament_set_shuffle_lock',{
    p_id:t.id,p_expected_version:t.version,p_action:action,p_pin:pin
   });
   shufflePINError(result);
   if(result!=='locked'&&result!=='unlocked')throw Error('Unable to update the shuffle lock.');
   shufflePrompt=null;
   await load(true);
  }catch(e){if(/changed|not found/i.test(e.message))await load(true);throw e;}
  finally{busy=false;refreshUI();}
 }
 async function action(target){
  const name=target.dataset.action;if(!name?.startsWith('tm-'))return false;
  if(!api.getSession()?.access_token)throw Error('Staff access required.');
  const t=current();
  if(name==='tm-create-show'){showCreate=true;setup={};teamCount=8;refreshUI();return true}
  if(name==='tm-cancel-create'){showCreate=false;setup={};refreshUI();return true}
  if(name==='tm-select'){selectedId=target.dataset.id;paymentSearch='';editMatchId=null;editTimeId=null;editPayment=null;closeArmed=null;editingTeamCount=false;teamDraft=[];shufflePrompt=null;refreshUI();return true}
  if(name==='tm-cancel-edit'){editMatchId=null;editPayment=null;refreshUI();return true}
  if(!t)throw Error('Select a tournament first.');
  if(name==='tm-team-start'||name==='tm-team-add-quick'){
   if(!tournamentCanResize(t.state))throw Error('Team changes are locked after play begins.');
   if(name==='tm-team-add-quick'&&t.state.teams.length>=32)throw Error('Maximum 32 teams.');
   editingTeamCount=true;
   teamDraft=t.state.teams.map(team=>({id:team.id,p1:team.members[0].name,p2:team.members[1].name}));
   if(name==='tm-team-add-quick')teamDraft.push({id:null,p1:'',p2:''});
   refreshUI();return true;
  }
  if(name==='tm-team-cancel'){editingTeamCount=false;teamDraft=[];refreshUI();return true;}
  if(name==='tm-team-add'||name==='tm-team-remove'){
   if(!editingTeamCount||!tournamentCanResize(t.state))throw Error('Open Edit Team Count first.');
   captureTeamDraft(target.closest?.('form'));
   if(name==='tm-team-add'){
    if(teamDraft.length>=32)throw Error('Maximum 32 teams.');
    teamDraft.push({id:null,p1:'',p2:''});
   }else{
    if(teamDraft.length<=2)throw Error('Tournament requires at least 2 teams.');
    const idx=Number(target.dataset.index),row=teamDraft[idx];
    if(!row)throw Error('Team not found.');
    if(tournamentPaidTeam(row,t.state.teams))
     throw Error('Cannot remove a team with payments. Correct or refund those payments first.');
    teamDraft.splice(idx,1);
   }
   refreshUI();return true;
  }
  if(name==='tm-edit-due'||name==='tm-pay'){
   editMatchId=null;
   editPayment={team:target.dataset.team,member:target.dataset.member,kind:name==='tm-pay'?'pay':'due'};
   refreshUI();return true;
  }
  if(name==='tm-edit-time'){
   const m=t.state.matches.find(m=>m.id===target.dataset.id);
   if(!m||!timeLabel(m))throw Error('Match is not available for scheduling.');
   editMatchId=null;editPayment=null;editTimeId=m.id;refreshUI();return true;
  }
  if(name==='tm-cancel-time'){editTimeId=null;refreshUI();return true;}
  if(name==='tm-clear-time'){
   const m=t.state.matches.find(m=>m.id===target.dataset.id);
   if(!m||!timeLabel(m))throw Error('Match is not available for scheduling.');
   await saveMatchTime(t,m,null);
   toast('Match time cleared.');return true;
  }
  if(name==='tm-edit-score'){
   const m=t.state.matches.find(m=>m.id===target.dataset.id);
   if(!m||!m.a||!m.b)throw Error('Match is not ready.');
   if(m.phase==='group'&&t.state.knockoutSeeded)
    throw Error('Group results are locked after the knockout draw is generated.');
   editPayment=null;editTimeId=null;editMatchId=m.id;refreshUI();return true;
  }
  if(name==='tm-shuffle-pin-cancel'){shufflePrompt=null;refreshUI();return true;}
  if(name==='tm-lock-shuffle'||name==='tm-unlock-shuffle'){
   if(t.format!=='groups')throw Error('Only group tournaments have a shuffle lock.');
   if(name==='tm-lock-shuffle'&&(!canReshuffle(t)||t.shuffle_locked))
    throw Error('Shuffling is no longer available or is already locked.');
   if(name==='tm-unlock-shuffle'&&!t.shuffle_locked)throw Error('Shuffle is not locked.');
   shufflePrompt={id:t.id,mode:name==='tm-lock-shuffle'?'lock':'unlock'};
   refreshUI();return true;
  }
  if(name==='tm-shuffle-reset-pin'){
   if(!isAdmin())throw Error('Only administrators can reset a PIN.');
   if(!t.shuffle_locked)throw Error('Shuffle is not locked.');
   if(!window.confirm('Reset the shuffle PIN for this tournament? Staff will be able to shuffle without a PIN until it is locked again.'))return true;
   await saveShuffleLock(t,'admin_reset',null);
   toast('Tournament shuffle PIN reset.');return true;
  }
  if(name==='tm-shuffle-groups'){
   if(!canReshuffle(t))throw Error('You can only reshuffle groups before match scores or knockout seeding.');
   if(busy)throw Error('Another tournament update is already in progress.');
   if(t.shuffle_locked){shufflePrompt={id:t.id,mode:'shuffle'};refreshUI();return true;}
   await reshuffleGroups(t,null);
   return true;
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
 function searchPayments(input){
  if(input.id!=='tm-payment-search')return false;
  paymentSearch=String(input.value??'');
  const panel=input.closest('.tm-payments');
  if(!panel)return true;
  const query=normalizePaymentSearch(paymentSearch);
  const rows=panel.querySelectorAll('tbody tr[data-payment-player]');
  let visibleCount=0;
  for(const row of rows){
   const visible=(row.dataset.paymentPlayer||'').includes(query);
   row.hidden=!visible;
   if(visible)visibleCount++;
  }
  const count=panel.querySelector('.tm-payment-count');
  if(count)count.textContent='Showing '+visibleCount+' of '+rows.length+' players';
  const empty=panel.querySelector('.tm-payment-empty');
  if(empty)empty.hidden=visibleCount!==0;
  return true;
 }
 function change(target){
  if(['tm-seed-stage','tm-seed-slot','tm-seed-side','tm-seed-team'].includes(target.id)){
   if(target.id==='tm-seed-stage'){seedStage=target.value;seedSlot='auto';}
   if(target.id==='tm-seed-slot')seedSlot=target.value;
   if(target.id==='tm-seed-side')seedSide=target.value;
   if(target.id==='tm-seed-team')seedTeam=target.value;
   refreshUI();return true;
  }
  if(target.id==='tm-existing-team-count'){
   if(!editingTeamCount)throw Error('Open Edit Team Count first.');
   captureTeamDraft(target.closest('form'));
   const desired=Number(target.value);
   if(!Number.isInteger(desired)||desired<2||desired>32){
    toast('Choose between 2 and 32 teams.',true);refreshUI();return true;
   }
   if(desired<teamDraft.length){
    if(teamDraft.slice(desired).some(row=>tournamentPaidTeam(row,current()?.state.teams||[]))){
     toast('A team being removed has payments. Remove a different unpaid team.',true);
     refreshUI();return true;
    }
    teamDraft=teamDraft.slice(0,desired);
   }else while(teamDraft.length<desired)teamDraft.push({id:null,p1:'',p2:''});
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
  if(kind==='shuffle-protection'){
   const t=current();
   if(!t||shufflePrompt?.id!==t.id||form.dataset.mode!==shufflePrompt.mode)
    throw Error('Select the tournament shuffle action again.');
   const mode=shufflePrompt.mode,pin=String(data.pin||'');
   if(!/^[0-9]{4,8}$/.test(pin))throw Error('Enter a 4–8 digit PIN.');
   if(mode==='lock'){
    if(pin!==String(data.confirm_pin||''))throw Error('PINs do not match.');
    await saveShuffleLock(t,'lock',pin);
    toast('Shuffling locked for this tournament.');
   }else if(mode==='unlock'){
    await saveShuffleLock(t,'unlock',pin);
    toast('Shuffling unlocked for this tournament.');
   }else if(mode==='shuffle'){
    await reshuffleGroups(t,pin);
   }else throw Error('Invalid PIN action.');
   return true;
  }
  if(kind==='resize-teams'){
   const t=current();
   if(!t||!editingTeamCount||!tournamentCanResize(t.state))
    throw Error('Teams can only be changed before play begins.');
   captureTeamDraft(form);
   const next=resizeTournamentDraw(t.state,t.fee_cents,teamDraft);
   if(t.state.matches.some(m=>m.scheduledTime)&&
     !window.confirm('Changing the teams rebuilds matches and clears their scheduled times. Continue?'))return true;
   busy=true;refreshUI();
   try{
    await api.rpc('tournament_resize_teams',{p_id:t.id,p_expected_version:t.version,p_state:next});
    editingTeamCount=false;teamDraft=[];editMatchId=null;editTimeId=null;
    await load(true);
    toast('Team count updated. New groups and knockout fixtures created.');
   }catch(e){if(/changed|not found/i.test(e.message))await load(true);throw e}
   finally{busy=false;refreshUI()}
   return true;
  }
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
  if(kind==='time'){
   const m=t.state.matches.find(match=>match.id===form.dataset.match);
   if(!m||!timeLabel(m))throw Error('Match is not available for scheduling.');
   const time=String(data.time||'').trim();
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('Choose a valid 24-hour match time.');
   await saveMatchTime(t,m,time);
   toast('Match time saved.');return true;
  }
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
  editMatchId=null;editTimeId=null;editPayment=null;paymentSearch='';closeArmed=null;editingTeamCount=false;teamDraft=[];shufflePrompt=null;notice='';seedStage='semifinal';seedSlot='auto';seedSide='auto';seedTeam='';loadRequest++}
 return {page,load,action,change,searchPayments,submit,reset};
}
