import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,
 getQualifiers,padelMatchWinner,groupStandings,tournamentTotals,tournamentChampion} from './tournament-engine.js';
import {tournamentArchivePdf,downloadTournamentPdf} from './tournament-pdf.js';
const escape=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const dollars=n=>'$'+(Number(n||0)/100).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const titleCase=s=>String(s).replace(/^./,c=>c.toUpperCase());
const moneyInput=n=>(Number(n||0)/100).toFixed(2);
export function createTournamentManagement({api,heading,icon,today,toast,rerender,isAdmin}){
 let rows=[],loaded=false,loading=false,busy=false,selectedId=null,showCreate=false,teamCount=8,setup={},
  editMatchId=null,editPayment=null,closeArmed=null,notice='',loadRequest=0;
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
 const teamName=(s,id)=>s.teams.find(t=>t.id===id)?.label||(id?'Team '+id:'TBD');
 const teamShort=(s,id)=>{const t=s.teams.find(t=>t.id===id);return t?t.label:'TBD'};
 const nameDetail=(s,id)=>{const t=s.teams.find(t=>t.id===id);return t?t.label+' · '+t.members.map(x=>x.name).join(' & '):'TBD'};
 function setupPage(){
  const defaults=[...Array(teamCount)].map((_,i)=>{
   const p=i+1;
   return '<div class="tm-team-input"><strong>Team '+p+'</strong>'+
    '<input name="team_'+p+'" maxlength="100" placeholder="Optional team name" value="'+escape(setup['team_'+p]||'')+'">'+
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
   '<p class="tm-hint">Every team has two players. The fee applies to each player; amounts and payments can be adjusted after creation. Teams are shuffled on creation.</p>'+
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
   return '<tr><td><strong>'+escape(member.name)+'</strong></td><td>'+escape(team.label)+'</td><td>'+dollars(member.due)+'</td><td>'+dollars(member.paid)+'</td><td><strong>'+dollars(remaining)+'</strong>'+(member.paid>member.due?'<small class="tm-credit-note">Overpaid '+dollars(member.paid-member.due)+'</small>':'')+'</td><td>'+controls+edit+'</td></tr>';
  }).join('');
  return stats+credit+'<section class="panel tm-payments"><div class="tm-head"><h2>Participant Payments</h2><span class="tm-muted">Each team has two participants</span></div>'+
   '<div class="tm-table-scroll"><table><thead><tr><th>Participant</th><th>Team</th><th>Amount due</th><th>Paid</th><th>Remaining</th><th>Actions</th></tr></thead><tbody>'+members+'</tbody></table></div></section>';
 }
 function matchEditor(m){
  const setFields=[0,1,2].map((i)=>{
   const s=m.sets?.[i]||{};
   const field=(name,val,extra='')=>'<input type="number" inputmode="numeric" min="0" max="'+(name.endsWith('a')||name.endsWith('b')?'7':'999')+'" step="1" name="s'+(i+1)+name+'" value="'+(val??'')+'" placeholder="'+extra+'">';
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
    teams.map(x=>'<tr><td>'+escape(x.team.label)+'</td><td>'+x.played+'</td><td>'+x.wins+'</td><td>'+
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
 function knockoutStage(t){
  const s=t.state,ko=s.matches.filter(m=>m.phase==='knockout');
  if(!ko.length){
   const canSeed=s.mode==='groups'&&s.matches.filter(m=>m.phase==='group').every(m=>!!m.winner);
   return '<section class="panel tm-knockout-wait"><h2>Knockout Bracket</h2><p>'+
    (canSeed?'The group stage is finished. Generate the knockout draw using group standings.':'Complete all group matches to unlock the knockout draw.')+'</p>'+
    (canSeed?'<button type="button" data-action="tm-seed" class="btn btn-primary" '+(busy?'disabled':'')+'>Generate Knockout Bracket</button>':'')+'</section>';
  }
  const rounds=[...new Set(ko.map(m=>m.round))].sort((a,b)=>a-b);
  const champion=tournamentChampion(s);
  return '<section class="panel tm-knockout"><div class="tm-head"><h2>Knockout Bracket</h2>'+
   (champion?'<strong class="tm-champion">🏆 '+escape(nameDetail(s,champion))+'</strong>':'<span class="tm-muted">Winners automatically advance</span>')+
   '</div><div class="tm-bracket">'+rounds.map((round,i)=>'<div class="tm-bracket-round"><h3>'+
    (i===rounds.length-1?'Final':i===rounds.length-2?'Semifinals':'Round '+round)+'</h3>'+
    ko.filter(m=>m.round===round).sort((a,b)=>a.slot-b.slot).map(m=>matchCard(t,m)).join('')+'</div>').join('')+
   '</div></section>';
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
    '<p>The archive download was started. Verify that the PDF is saved on your device and contains the full draw, match scores and payments. Closing will permanently delete this tournament from Supabase.</p>'+
    '<label><input type="checkbox" id="tm-archive-saved"> I have saved the complete tournament PDF and understand the data will be deleted.</label>'+
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
   '<p>Create a tournament to shuffle the teams and begin tracking matches and participant fees. Closed tournaments do not stay in Supabase.</p>'+
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
   refreshUI();toast('Local tournament PDF download started. Confirm it is saved before deleting.');return true;
  }
  if(name==='tm-close-cancel'){closeArmed=null;refreshUI();return true}
  if(name==='tm-close-final'){
   if(!isAdmin())throw Error('Only admins may close tournaments.');
   if(!closeArmed||closeArmed.id!==t.id||closeArmed.version!==t.version||!closeArmed.confirmed)
    throw Error('Download and confirm saving the PDF before closing.');
   if(!window.confirm('Permanently delete '+t.name+' and all its scores and payments from Supabase? The PDF must already be saved.'))return true;
   if(busy)throw Error('Another save is in progress.');
   busy=true;
   try{
    await api.rpc('tournament_close',{p_id:t.id,p_expected_version:t.version});
    closeArmed=null;selectedId=null;await load(true);
    toast('Tournament deleted from Supabase. Keep your downloaded PDF.');
   }finally{busy=false;refreshUI()}
   return true;
  }
  return false;
 }
 function change(target){
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
    label:data['team_'+(i+1)],p1:data['player_'+(i+1)+'_1'],p2:data['player_'+(i+1)+'_2']
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
  editMatchId=null;editPayment=null;closeArmed=null;notice='';loadRequest++}
 return {page,load,action,change,submit,reset};
}
