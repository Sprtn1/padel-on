import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,padelSetWinner,
 padelMatchWinner,groupStandings,getQualifiers,tournamentTotals,tournamentChampion,proSetWinner,tournamentMatchWinner,
 knockoutSeedEntrants,reseedTournamentKnockout,makeSeededKnockoutMatches,tournamentCanResize,resizeTournamentDraw,tournamentTeamPlayerDues} from '../lib/tournament-engine.js';
import {createTournamentManagement} from '../lib/tournament-management.js';
import {knockoutBracketLayout} from '../lib/tournament-bracket-layout.js';
import {tournamentArchivePdf,downloadTournamentPdf} from '../lib/tournament-pdf.js';

const players=n=>Array.from({length:n},(_,i)=>({p1:'First '+i,p2:'Second '+i,label:'Pair '+i}));
const fixedRandom=()=>0.38;
const scoreA=[{a:6,b:4},{a:7,b:6,ta:7,tb:5}];
const scoreB=[{a:4,b:6},{a:2,b:6}];
test('Tournament validates money precisely to the cent',()=>{
 assert.equal(parseTournamentMoney('20'),2000);
 assert.equal(parseTournamentMoney('12.50'),1250);
 assert.equal(parseTournamentMoney('0'),0);
 assert.equal(parseTournamentMoney('0.01'),1);
 for(const invalid of ['12.345','-1','NaN','not money','1000001']){
  assert.throws(()=>parseTournamentMoney(invalid),undefined,invalid);
 }
});
test('Shuffle creates all group pairings once, without teams playing twice in one round',()=>{
 for(let n=2;n<=32;n++){
  const state=makeInitialTournament(players(n),1500,'groups',fixedRandom);
  assert.equal(state.teams.length,n);
  const groups=new Set(state.teams.map(x=>x.group));
  const matches=state.matches;
  const unique=new Set(matches.map(m=>[m.a,m.b].sort().join('|')));
  assert.equal(unique.size,matches.length);
  for(const g of groups){
   const members=state.teams.filter(t=>t.group===g);
   assert.ok(members.length>=2&&members.length<=(n===5?5:4));
   assert.equal(matches.filter(m=>m.group===g).length,members.length*(members.length-1)/2);
   const rounds=new Set(matches.filter(m=>m.group===g).map(m=>m.round));
   for(const r of rounds){
    const current=matches.filter(m=>m.group===g&&m.round===r);
    const all=current.flatMap(m=>[m.a,m.b]);
    assert.equal(all.length,new Set(all).size,'No same-round collisions in Group '+g);
   }
  }
 }
});
test('Knockout bracket supports all team counts with distributed automatic first-round byes',()=>{
 for(let n=2;n<=32;n++){
  const state=makeInitialTournament(players(n),1500,'knockout',fixedRandom);
  const first=state.matches.filter(x=>x.round===1);
  assert.ok(first.every(m=>!!m.a));
  assert.equal(first.filter(m=>!m.b).length,2**Math.ceil(Math.log2(n))-n);
  assert.ok(first.filter(m=>!m.b).every(m=>m.winner===m.a));
  const last=state.matches.at(-1);
  assert.equal(last.round,Math.ceil(Math.log2(n)));
  assert.equal(last.slot,1);
 }
});
test('Best-of-three scoring accepts 6-4, 7-5 and true 7-6 tie-break wins',()=>{
 assert.equal(padelSetWinner({a:6,b:4}),'a');
 assert.equal(padelSetWinner({a:5,b:7}),'b');
 assert.equal(padelSetWinner({a:7,b:6,ta:7,tb:5}),'a');
 assert.equal(padelSetWinner({a:6,b:7,ta:10,tb:12}),'b');
 assert.equal(padelMatchWinner(scoreA),'a');
 assert.equal(padelMatchWinner([{a:6,b:3},{a:2,b:6},{a:6,b:4}]),'a');
 assert.equal(padelMatchWinner([{a:6,b:7,ta:5,tb:7},{a:6,b:2},{a:3,b:6}]),'b');
});
test('Impossible scores and extra sets are rejected',()=>{
 for(const bad of [{a:6,b:5},{a:7,b:4},{a:6,b:6},{a:7,b:6},{a:7,b:6,ta:7,tb:6},
   {a:7,b:6,ta:6,tb:7},{a:6,b:4,ta:7,tb:5},{a:8,b:6}]){
  assert.throws(()=>padelSetWinner(bad),undefined,JSON.stringify(bad));
 }
 assert.throws(()=>padelMatchWinner([{a:6,b:3}]));
 assert.throws(()=>padelMatchWinner([{a:6,b:3},{a:6,b:3},{a:6,b:4}]));
});
test('Group standings and knockout qualifiers use recorded sets and wins',()=>{
 const s=makeInitialTournament(players(8),1000,'groups',fixedRandom);
 for(const m of s.matches){m.sets=scoreA;m.winner=m.a;}
 const rank=groupStandings(s,'A');
 assert.equal(rank.length,4);
 assert.equal(rank[0].played,3);
 assert.equal(rank.reduce((sum,r)=>sum+r.wins,0),6);
 const qualifiers=getQualifiers(s);
 assert.equal(qualifiers.length,4);
 assert.equal(new Set(qualifiers.map(t=>t.id)).size,4);
 const rounds=makeKnockoutMatches(qualifiers);
 assert.equal(rounds.length,3);
 assert.ok(rounds.every(m=>m.phase==='knockout'));
});
test('Mixed-size groups supply wildcard qualifiers for an eight-team bracket',()=>{
 const s=makeInitialTournament(players(10),2000,'groups',fixedRandom);
 for(const m of s.matches){m.sets=scoreB;m.winner=m.b;}
 const qualifiers=getQualifiers(s);
 assert.equal(qualifiers.length,8);
 assert.equal(new Set(qualifiers.map(t=>t.id)).size,8);
 assert.equal(makeKnockoutMatches(qualifiers).length,7);
});
test('Participant totals sum each unpaid balance, not net all overpayments',()=>{
 const s=makeInitialTournament(players(2),1000,'knockout',fixedRandom);
 s.teams[0].members[0].paid=1000;
 s.teams[0].members[0].due=500;
 s.teams[1].members[0].paid=300;
 assert.deepEqual(tournamentTotals(s),{due:3500,paid:1300,remaining:2700,overpaid:500});
 assert.equal(tournamentChampion(s),null);
});
function makeUI(isAdmin=false,backing=[]){
 const calls=[],messages=[];
 const api={
  getSession:()=>({access_token:'staff-access'}),
  listAll:async table=>table==='tournaments'?backing:[],
  rpc:async(name,args)=>{
   calls.push({name,args});
   if(name==='tournament_create')return 'new-tournament';
   if(name==='tournament_resize_teams'){
    const row=backing.find(x=>x.id===args.p_id);
    assert.equal(row.version,args.p_expected_version);
    row.state=args.p_state;
    row.version++;
    return row.version;
   }
   if(name==='tournament_set_shuffle_lock'){
    const row=backing.find(x=>x.id===args.p_id);
    assert.equal(args.p_expected_version,row.version);
    if(args.p_action==='lock'){
     assert.equal(row.shuffle_locked,false);
     assert.match(args.p_pin,/^[0-9]{4,8}$/);
     row.shuffle_locked=true;row._pin=args.p_pin;row.version++;return 'locked';
    }
    if(args.p_action==='unlock'){
     if(args.p_pin!==row._pin)return 'invalid_pin';
     row.shuffle_locked=false;delete row._pin;row.version++;return 'unlocked';
    }
    if(args.p_action==='admin_reset'){
     assert.ok(isAdmin);row.shuffle_locked=false;delete row._pin;row.version++;return 'unlocked';
    }
   }
   if(name==='tournament_shuffle_groups'){
    const row=backing.find(x=>x.id===args.p_id);
    assert.equal(args.p_expected_version,row.version);
    if(row.shuffle_locked&&args.p_pin!==row._pin)return -1;
    const oldTeams=row.state.teams;
    const next=makeInitialTournament(players(oldTeams.length),row.fee_cents,'groups',()=>0.91);
    row.state={...row.state,
     teams:next.teams.map(team=>({...oldTeams.find(x=>x.id===team.id),group:team.group})),
     matches:next.matches};
    row.version++;
    return row.version;
   }
   if(name==='tournament_set_member_note'){
    const row=backing.find(x=>x.id===args.p_id);
    if(!row)throw Error('Tournament not found');
    if(row.version!==args.p_expected_version)throw Error('Tournament changed on another device. Refresh before saving');
    const team=row.state.teams.find(x=>x.id===args.p_team);
    const member=team?.members.find(x=>x.id===args.p_member);
    if(!member)throw Error('Participant not found');
    if(String(args.p_note).trim().length>1000)throw Error('Participant notes cannot exceed 1000 characters');
    if(String(member.note??'')===args.p_note)return row.version;
    member.note=args.p_note;row.version++;return row.version;
   }
   if(name==='tournament_set_group_scoring'){
    const row=backing.find(x=>x.id===args.p_id);
    if(row.version!==args.p_expected_version)throw Error('Tournament changed on another device');
    if(row.format!=='groups'||row.state.knockoutSeeded||
       row.state.matches.some(m=>m.phase!=='group'||m.winner||m.sets?.length))
      throw Error('Group scoring cannot be changed after scores are recorded');
    row.group_scoring=args.p_group_scoring;row.version++;return row.version;
   }
   if(name==='tournament_set_match_time'){
    const row=backing.find(x=>x.id===args.p_id);
    assert.equal(args.p_expected_version,row.version);
    const m=row.state.matches.find(x=>x.id===args.p_match_id);
    assert.ok(m,'Scheduled match must exist');
    if(args.p_time===null)delete m.scheduledTime;
    else m.scheduledTime=args.p_time;
    row.version++;return row.version;
   }
   if(name==='tournament_change'){
    const row=backing.find(x=>x.id===args.p_id);
    row.version+=1;
    const p=args.p_data;
    if(args.p_action==='due'||args.p_action==='pay'){
     const member=row.state.teams.find(t=>t.id===p.team).members.find(x=>x.id===p.member);
     if(args.p_action==='due')member.due=p.amount;else member.paid+=p.amount;
    }
    if(args.p_action==='score'){
     const m=row.state.matches.find(m=>m.id===p.match);
     m.sets=p.sets;m.winner=tournamentMatchWinner(p.sets,m.phase==='group'?(row.group_scoring||'best_of_3'):'best_of_3')==='a'?m.a:m.b;
    }
    if(args.p_action==='seed'){
     row.state.matches.push(...p.matches);row.state.knockoutSeeded=true;
    }
    return row.version;
   }
   if(name==='tournament_reseed'){
    const row=backing.find(x=>x.id===args.p_id);
    row.state=reseedTournamentKnockout(row.state,args.p_placements);
    row.version++;return row.version;
   }
   if(name==='tournament_close'){
    const index=backing.findIndex(x=>x.id===args.p_id);
    backing.splice(index,1);return null;
   }
  }
 };
 const widget=createTournamentManagement({
  api,heading:(...args)=>args[3]||'',icon:()=>'',today:()=> '2026-10-23',
  rerender:()=>{},toast:m=>messages.push(m),isAdmin:()=>isAdmin
 });
 return {widget,calls,messages,backing};
}
function sampleRow(mode='groups'){
 const state=makeInitialTournament(players(4),1500,mode,fixedRandom);
 return {id:'test-id',version:0,name:'Friday Doubles',event_date:'2026-10-24',start_time:'18:00:00',
  fee_cents:1500,format:mode,state,shuffle_locked:false};
}
test('Staff see tournament creation and the participant payment table, but not Close Tournament',async()=>{
 const {widget}=makeUI(false,[sampleRow()]);
 await widget.load();
 const html=widget.page();
 assert.match(html,/Create Tournament/);
 assert.match(html,/Participant Payments/);
 assert.match(html,/Edit Amount/);
 assert.match(html,/>Pay</);
 assert.match(html,/Shuffled Group Stage/);
 assert.doesNotMatch(html,/Close Tournament/);
 assert.match(html,/Amount remaining/);
});
test('Admins can export and begin archive closure, but deletion requires confirmation',async()=>{
 const row=sampleRow('knockout'),{widget,calls,backing}=makeUI(true,[row]);
 await widget.load();
 assert.match(widget.page(),/Close Tournament/);
 const before=globalThis.document,oldURL=globalThis.URL;
 const prevWindow=globalThis.window,oldTimer=globalThis.setTimeout;
 const fakeCanvas={
  width:1200,height:1553,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',
  getContext:()=>({fillStyle:'',strokeStyle:'',lineWidth:1,font:'',fillRect(){},fillText(){},beginPath(){},
   moveTo(){},lineTo(){},stroke(){},strokeRect(){},measureText:v=>({width:String(v).length*10})})
 };
 const clicked=[];
 try{
  globalThis.document={body:{append(){}},createElement:type=>type==='canvas'?{...fakeCanvas}:{
   download:'',click(){clicked.push(this.download)},remove(){}}
  };
  globalThis.URL={createObjectURL:()=> 'blob:tournament',revokeObjectURL(){}};
  globalThis.setTimeout=()=>0;
  globalThis.window={confirm:()=>true};
  await widget.action({dataset:{action:'tm-close-start'}});
  assert.equal(clicked.length,1);
  assert.equal(backing.length,1);
  assert.match(widget.page(),/Confirm PDF Saved &amp; Delete Tournament|Confirm PDF Saved & Delete Tournament/);
  let blocked=false;
  try{await widget.action({dataset:{action:'tm-close-final'}})}catch(e){blocked=true;}
  assert.ok(blocked);
  await widget.change({id:'tm-archive-saved',checked:true});
  assert.match(widget.page(),/id="tm-archive-saved" checked/);
  await widget.action({dataset:{action:'tm-close-final'}});
  assert.equal(backing.length,0);
  assert.ok(calls.some(c=>c.name==='tournament_close'&&c.args.p_expected_version===0));
 }finally{globalThis.document=before;globalThis.URL=oldURL;globalThis.window=prevWindow;globalThis.setTimeout=oldTimer}
});
test('Score entry and participant fee edit both update the tournament via versioned RPC',async()=>{
 const row=sampleRow('groups'),{widget,calls}=makeUI(false,[row]);
 await widget.load();
 const t=row.state.teams[0],member=t.members[0],match=row.state.matches[0];
 await widget.action({dataset:{action:'tm-edit-due',team:t.id,member:member.id}});
 const oldForm=globalThis.FormData;
 try{
  globalThis.FormData=class {constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'finance',team:t.id,member:member.id},
   _values:[['amount','12.50']]});
  assert.equal(member.due,1250);
  await widget.action({dataset:{action:'tm-edit-score',id:match.id}});
  await widget.submit({dataset:{tmSubmit:'score',match:match.id},
   _values:[['s1a','6'],['s1b','4'],['s2a','7'],['s2b','6'],['s2ta','7'],['s2tb','5']]});
 }finally{globalThis.FormData=oldForm}
 assert.equal(row.version,2);
 assert.deepEqual(calls.map(c=>c.name),['tournament_change','tournament_change']);
 assert.deepEqual(calls.map(c=>c.args.p_action),['due','score']);
 assert.equal(match.winner,match.a);
});

test('Qualifiers avoid immediate repeat matches between teams from the same group',()=>{
 for(const n of [6,8,9,10,12,17,20,32]){
  const state=makeInitialTournament(players(n),1000,'groups',fixedRandom);
  for(const m of state.matches){m.sets=scoreA;m.winner=m.a;}
  const qualified=getQualifiers(state);
  const bracket=makeKnockoutMatches(qualified);
  const first=bracket.filter(x=>x.round===1&&x.a&&x.b);
  const lookup=new Map(state.teams.map(x=>[x.id,x.group]));
  const avoidable=first.filter(x=>lookup.get(x.a)===lookup.get(x.b));
  assert.ok(avoidable.length===0 || n<7,'Avoid group rematches for '+n);
 }
});
test('Tournament PDF archive contains every participant, payments, fixtures and champion',()=>{
 const tournament=sampleRow('knockout');
 tournament.state.teams[0].members[0].paid=1000;
 const final=tournament.state.matches.at(-1);
 final.winner=tournament.state.teams[0].id;
 const before=globalThis.document,prior=globalThis.atob;
 const drawn=[];
 try{
  globalThis.atob=()=>String.fromCharCode(255,216,255,217);
  globalThis.document={createElement:()=>({
   width:1200,height:1553,
   toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',
   getContext:()=>({
    fillStyle:'',strokeStyle:'',lineWidth:1,font:'',
    fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    measureText:v=>({width:String(v).length*10}),
    fillText:v=>drawn.push(String(v))
   })
  })};
  const result=tournamentArchivePdf(tournament);
  assert.equal(result.pdf.type,'application/pdf');
  assert.ok(result.pages>=1);
  const lines=drawn.join(' | ');
  assert.match(lines,/PADEL ON.*TOURNAMENT ARCHIVE/);
  assert.match(lines,/Friday Doubles/);
  assert.match(lines,/Total paid/);
  assert.match(lines,/First 0/);
  assert.match(lines,/Second 3/);
  assert.match(lines,/ALL MATCHES AND SCORES/);
  assert.match(lines,/CHAMPIONS/);
 }finally{globalThis.document=before;globalThis.atob=prior}
});

test('Create Tournament collects names, fee, mode, date, time, and shuffles the exact requested number of teams',async()=>{
 const backing=[],{widget,calls}=makeUI(false,backing);
 await widget.load();
 await widget.action({dataset:{action:'tm-create-show'}});
 assert.match(widget.page(),/New tournament/);
 assert.match(widget.page(),/Number of teams/);
 assert.match(widget.page(),/Player 1 full name/);
 const previous=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  widget.change({id:'tm-team-count',value:'3',closest:()=>({
   _values:[['name','Club Championship'],['date','2026-11-01'],['time','19:30'],['fee','22.50'],['format','knockout'],['team_count','3']]
  })});
  const values=[
   ['name','Club Championship'],['date','2026-11-01'],['time','19:30'],
   ['fee','22.50'],['format','knockout'],['team_count','3'],
   ['player_1_1','Player A'],['player_1_2','Player B'],
   ['player_2_1','Player C'],['player_2_2','Player D'],
   ['player_3_1','Player E'],['player_3_2','Player F']
  ];
  await widget.submit({dataset:{tmSubmit:'create'},_values:values});
 }finally{globalThis.FormData=previous}
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'tournament_create');
 const x=calls[0].args;
 assert.equal(x.p_name,'Club Championship');
 assert.equal(x.p_date,'2026-11-01');
 assert.equal(x.p_time,'19:30');
 assert.equal(x.p_fee_cents,2250);
 assert.equal(x.p_format,'knockout');
 assert.equal(x.p_state.teams.length,3);
 assert.equal(x.p_state.matches.length,3);
 assert.equal(x.p_state.teams.flatMap(t=>t.members).length,6);
 assert.ok(x.p_state.matches.some(m=>m.winner&&m.b===null));
});

test('Pyramid draw reserves later-round seeds and keeps each entrant in exactly one bracket position',()=>{
 for(const n of [4,6,8,12,16,24,32]){
  const state=makeInitialTournament(players(n),1500,'knockout',fixedRandom);
  for(const stage of ['semifinal','quarterfinal','final']){
   const entries=[{team:state.teams[0].id,stage,slot:1,side:'a'}];
   const seeded=reseedTournamentKnockout(state,entries);
   const list=seeded.matches.filter(m=>m.phase==='knockout');
   const maxRound=Math.max(...list.map(m=>m.round));
   const match=list.find(m=>m.round===maxRound-({final:0,semifinal:1,quarterfinal:2}[stage])&&m.slot===1);
   assert.equal(match.seedA,entries[0].team);
   const origins=list.flatMap(m=>m.round===1?[m.a,m.b]:[m.seedA,m.seedB]).filter(Boolean);
   assert.equal(origins.length,n);
   assert.equal(new Set(origins).size,n);
   assert.equal(list.length,2**maxRound-1);
   assert.ok(list.every(m=>m.possibleA>=0&&m.possibleB>=0));
   assert.equal(seeded.seedPlacements[0].stage,stage);
  }
 }
});
test('Double-booking a seeded team or reserving overlapping branches is rejected',()=>{
 const s=makeInitialTournament(players(8),2000,'knockout',fixedRandom);
 const first={team:s.teams[0].id,stage:'semifinal',slot:1,side:'a'};
 assert.throws(()=>reseedTournamentKnockout(s,[first,first]));
 assert.throws(()=>reseedTournamentKnockout(s,[first,{team:s.teams[1].id,stage:'quarterfinal',slot:1,side:'a'}]));
 const played=makeInitialTournament(players(8),2000,'knockout',fixedRandom);
 played.matches[0].sets=scoreA;played.matches[0].winner=played.matches[0].a;
 assert.throws(()=>reseedTournamentKnockout(played,[first]));
});
test('Sideways bracket shows semifinals to the left of a connected final',async()=>{
 const row=sampleRow('knockout');
 const {widget}=makeUI(false,[row]);
 await widget.load();
 const html=widget.page();
 assert.match(html,/tm-bracket-scroll/);
 assert.match(html,/tm-bracket-board/);
 assert.match(html,/tm-bracket-edges/);
 assert.match(html,/aria-label="Knockout bracket: earlier rounds on the left, final on the right"/);
 assert.ok(html.indexOf('>Semifinals</h3>')<html.indexOf('>Final</h3>'));
 assert.match(html,/data-tm-submit="seed-placement"/);
 assert.match(html,/Choose a team/);
 assert.match(html,/Add Seed/);
 assert.match(html,/id="tm-seed-slot"/);
 assert.match(html,/id="tm-seed-stage"/);
});
test('Staff can assign a strong doubles team directly to the semifinals and later remove the seed',async()=>{
 const row=sampleRow('knockout'),{widget,calls}=makeUI(false,[row]);
 await widget.load();
 const target=row.state.teams[0].id;
 const originalFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'seed-placement'},_values:[
   ['team',target],['stage','semifinal'],['slot','1'],['side','a']
  ]});
 }finally{globalThis.FormData=originalFormData}
 const saved=calls.find(c=>c.name==='tournament_reseed');
 assert.ok(saved);
 assert.equal(saved.args.p_placements[0].team,target);
 assert.equal(saved.args.p_placements[0].stage,'semifinal');
 assert.match(widget.page(),/Seeded Teams \(1\)/);
 assert.match(widget.page(),/tm-pyramid-seed/);
 const before=row.version;
 await widget.action({dataset:{action:'tm-remove-seed',id:target}});
 assert.equal(row.version,before+1);
 assert.deepEqual(row.state.seedPlacements,[]);
 assert.match(widget.page(),/Seeded Teams \(0\)/);
});
test('Tournament archive draws bordered tables and repeats headers across PDF pages',()=>{
 const state=makeInitialTournament(players(32),1500,'knockout',fixedRandom);
 const tournament={id:'archive',name:'Tournament Archive Test',event_date:'2026-11-12',
   start_time:'19:00',format:'knockout',fee_cents:1500,state};
 const before=globalThis.document,prior=globalThis.atob;
 const strokes=[],texts=[],pages=[];
 try{
  globalThis.atob=()=>String.fromCharCode(255,216,255,217);
  globalThis.document={createElement:()=>({
   width:1200,height:1553,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',
   getContext:()=>({font:'',fillStyle:'',strokeStyle:'',lineWidth:1,
    fillRect(){},strokeRect(...args){strokes.push(args)},beginPath(){},
    moveTo(){},lineTo(){},stroke(){},measureText:x=>({width:String(x).length*10}),
    fillText:x=>texts.push(String(x))})
  })};
  const result=tournamentArchivePdf(tournament);
  assert.ok(result.pages>1);
  assert.ok(strokes.length>90,'Each payment and match should be a bordered table row');
  assert.ok(texts.filter(x=>x==='Participant').length>=1);
  assert.ok(texts.filter(x=>x==='Round / match').length>=2);
  assert.ok(texts.includes('ALL MATCHES AND SCORES - KNOCKOUT BRACKET'));
  assert.ok(texts.includes('PARTICIPANTS AND PAYMENTS'));
  assert.ok(texts.includes('Team A')&&texts.includes('Team B'));
  assert.equal(result.pdf.type,'application/pdf');
 }finally{globalThis.document=before;globalThis.atob=prior}
});

test('Score editor allows extended tie-break points, not only seven',async()=>{
 const row=sampleRow('groups');
 const {widget}=makeUI(false,[row]);
 await widget.load();
 await widget.action({dataset:{action:'tm-edit-score',id:row.state.matches[0].id}});
 const markup=widget.page();
 assert.match(markup,/max="999" step="1" name="s1ta"/);
 assert.match(markup,/max="999" step="1" name="s1tb"/);
 assert.match(markup,/max="7" step="1" name="s1a"/);
});

test('Sideways bracket centers every parent between its two feeder matches from 2 to 32 teams',()=>{
 for(let n=2;n<=32;n++){
  const state=makeInitialTournament(players(n),1500,'knockout',fixedRandom);
  const layout=knockoutBracketLayout(state.matches);
  const lookup=new Map(layout.nodes.map(x=>[x.round+':'+x.slot,x]));
  const last=layout.rounds.at(-1);
  for(const node of layout.nodes){
   assert.equal(node.x,(node.round-1)*(layout.cardWidth+layout.columnGap));
   if(node.round===last)continue;
   const parent=lookup.get(node.round+1+':'+Math.ceil(node.slot/2));
   assert.ok(parent,'Parent match should exist');
   assert.ok(parent.x>node.x,'Later rounds must be further right');
   const first=lookup.get(node.round+':'+(Math.ceil(node.slot/2)*2-1));
   const second=lookup.get(node.round+':'+(Math.ceil(node.slot/2)*2));
   assert.equal(parent.y,(first.y+second.y)/2,'Parent must be vertically centered on feeders');
  }
  if(n>=3)assert.ok(layout.links.length>0);
 }
});
test('Final is directly to the right of both semifinal cards for screenshot-sized bracket',()=>{
 const state=makeInitialTournament(players(4),1000,'knockout',fixedRandom);
 const layout=knockoutBracketLayout(state.matches);
 const semis=layout.nodes.filter(x=>x.round===1).sort((a,b)=>a.slot-b.slot);
 const final=layout.nodes.find(x=>x.round===2);
 assert.equal(semis.length,2);
 assert.ok(final.x>semis[0].x);
 assert.equal(final.y,(semis[0].y+semis[1].y)/2);
 assert.equal(layout.links.length,2);
 assert.ok(layout.links.every(edge=>edge.to===final.match.id));
 assert.ok(layout.links.every(edge=>edge.d.includes('H '+final.x)));
});
test('Seeded semifinal routes do not draw phantom connections through reserved feeder branches',()=>{
 const state=makeInitialTournament(players(8),1000,'knockout',fixedRandom);
 const seeded=reseedTournamentKnockout(state,[
  {team:state.teams[0].id,stage:'semifinal',slot:1,side:'a'}
 ]);
 const layout=knockoutBracketLayout(seeded.matches);
 const semifinalRound=layout.rounds.at(-1)-1;
 const semis=layout.nodes.find(x=>x.round===semifinalRound&&x.slot===1);
 assert.equal(semis.match.seedA,state.teams[0].id);
 const leftFeeders=layout.nodes.filter(x=>x.round===semifinalRound-1&&x.slot<=2);
 assert.ok(leftFeeders.length===2);
 assert.ok(!layout.links.some(x=>x.from===leftFeeders[0].match.id&&x.to===semis.match.id),
  'The direct semifinal seed must bypass its reserved feeder branch');
 assert.ok(layout.links.some(x=>x.from===leftFeeders[1].match.id&&x.to===semis.match.id),
  'The opponent must still arrive from the other semifinal feeder');
 assert.ok(layout.links.some(x=>x.to!==semis.match.id));
});
test('Sidebar-free scroll area remains navigable and exposes recorded scores',async()=>{
 const row=sampleRow('knockout');
 row.state.matches[0].sets=[{a:6,b:4},{a:6,b:2}];
 row.state.matches[0].winner=row.state.matches[0].a;
 row.state.matches.at(-1).a=row.state.matches[0].winner;
 const {widget}=makeUI(false,[row]);
 await widget.load();
 const html=widget.page();
 assert.match(html,/role="region" tabindex="0"/);
 assert.match(html,/6-4 \/ 6-2/);
 assert.match(html,/Edit score/);
});

test('Staff can repeatedly shuffle unplayed groups without losing payments, and results lock the control',async()=>{
 const row=sampleRow('groups');
 row.state.teams[0].members[0].paid=700;
 const {widget,calls}=makeUI(false,[row]);
 await widget.load();
 assert.match(widget.page(),/data-action="tm-shuffle-groups"/);
 const originalPayments=row.state.teams.flatMap(t=>t.members.map(m=>[m.id,m.due,m.paid])).sort((a,b)=>a[0].localeCompare(b[0]));
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 assert.deepEqual(calls.map(x=>x.name),['tournament_shuffle_groups','tournament_shuffle_groups']);
 assert.deepEqual(calls.map(x=>x.args.p_expected_version),[0,1]);
 assert.equal(row.version,2);
 assert.deepEqual(row.state.teams.flatMap(t=>t.members.map(m=>[m.id,m.due,m.paid])).sort((a,b)=>a[0].localeCompare(b[0])),originalPayments);
 row.state.matches[0].sets=scoreA;
 row.state.matches[0].winner=row.state.matches[0].a;
 assert.match(widget.page(),/data-action="tm-shuffle-groups" disabled/);
 await assert.rejects(()=>widget.action({dataset:{action:'tm-shuffle-groups'}}),/before match scores/);
 assert.equal(calls.length,2);
});

test('Participant payment search filters names instantly, preserves payment controls, and resets when switching tournaments',async()=>{
 const first=sampleRow('groups'),second=sampleRow('knockout');second.id='second-tournament';
 const {widget,calls}=makeUI(false,[first,second]);
 await widget.load();
 assert.match(widget.page(),/Search player name/);
 assert.match(widget.page(),/Showing 8 of 8 players/);
 const rows=first.state.teams.flatMap(team=>team.members.map(member=>({
  dataset:{paymentPlayer:member.name.toLowerCase()},hidden:false
 })));
 const count={textContent:''},empty={hidden:true};
 const panel={
  querySelectorAll:()=>rows,
  querySelector:selector=>selector==='.tm-payment-count'?count:selector==='.tm-payment-empty'?empty:null
 };
 const input={id:'tm-payment-search',value:'FIRST 2',closest:()=>panel};
 assert.equal(widget.searchPayments(input),true);
 assert.equal(rows.filter(r=>!r.hidden).length,1);
 assert.equal(count.textContent,'Showing 1 of 8 players');
 assert.equal(empty.hidden,true);
 let html=widget.page();
 assert.match(html,/value="FIRST 2"/);
 assert.match(html,/data-payment-player="first 0" hidden/);
 assert.match(html,/data-payment-player="first 2"/);
 assert.match(html,/data-action="tm-pay"/);
 await widget.action({dataset:{action:'tm-pay',team:first.state.teams[2].id,
  member:first.state.teams[2].members[0].id}});
 assert.match(widget.page(),/value="FIRST 2"/);
 const oldForm=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'finance',
   team:first.state.teams[2].id,member:first.state.teams[2].members[0].id},
   _values:[['amount','5.00']]});
 }finally{globalThis.FormData=oldForm;}
 assert.match(widget.page(),/value="FIRST 2"/);
 assert.equal(first.state.teams[2].members[0].paid,500);
 assert.equal(calls.at(-1).args.p_action,'pay');
 input.value='nonexistent name';
 widget.searchPayments(input);
 assert.ok(rows.every(row=>row.hidden));
 assert.equal(empty.hidden,false);
 assert.equal(count.textContent,'Showing 0 of 8 players');
 input.value='';
 widget.searchPayments(input);
 assert.ok(rows.every(row=>!row.hidden));
 assert.equal(empty.hidden,true);
 await widget.action({dataset:{action:'tm-select',id:second.id}});
 assert.match(widget.page(),/id="tm-payment-search"[^>]*value=""/);
 assert.match(widget.page(),/Showing 8 of 8 players/);
});

test('Group fixture time appears below Upcoming, can be edited and cleared without touching scores',async()=>{
 const row=sampleRow('groups'),{widget,calls}=makeUI(false,[row]);
 await widget.load();
 const match=row.state.matches[0];
 assert.match(widget.page(),/tm-match-status/);
 assert.match(widget.page(),/data-action="tm-edit-time"/);
 await widget.action({dataset:{action:'tm-edit-time',id:match.id}});
 let html=widget.page();
 assert.match(html,/data-tm-submit="time"/);
 assert.match(html,/Match start time \(Beirut\)/);
 const originalFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'time',match:match.id},_values:[['time','18:45']]});
  assert.equal(match.scheduledTime,'18:45');
  assert.match(widget.page(),/18:45/);
  assert.deepEqual(match.sets,[]);
  await widget.action({dataset:{action:'tm-edit-time',id:match.id}});
  assert.match(widget.page(),/Clear Time/);
  await assert.rejects(()=>widget.submit({
   dataset:{tmSubmit:'time',match:match.id},_values:[['time','25:15']]
  }),/valid 24-hour/);
  assert.equal(calls.length,1,'Invalid clock does not write to the database');
  await widget.submit({dataset:{tmSubmit:'time',match:match.id},_values:[['time','20:10']]});
  assert.equal(match.scheduledTime,'20:10');
  await widget.action({dataset:{action:'tm-edit-time',id:match.id}});
  await widget.action({dataset:{action:'tm-clear-time',id:match.id}});
  assert.equal(match.scheduledTime,undefined);
  assert.equal(row.version,3);
  assert.deepEqual(calls.map(c=>c.name),
   ['tournament_set_match_time','tournament_set_match_time','tournament_set_match_time']);
  assert.deepEqual(calls.map(c=>c.args.p_expected_version),[0,1,2]);
  assert.equal(calls[2].args.p_time,null);
 }finally{globalThis.FormData=originalFormData}
});
test('Knockout final can be scheduled before contestants are decided; bracket rescheduling keeps slot time',async()=>{
 const row=sampleRow('knockout'),{widget,calls}=makeUI(false,[row]);
 await widget.load();
 const final=row.state.matches.at(-1);
 assert.equal(final.a,null);
 assert.match(widget.page(),/tm-pyramid-match-top/);
 await widget.action({dataset:{action:'tm-edit-time',id:final.id}});
 assert.match(widget.page(),/Schedule Match/);
 const originalFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'time',match:final.id},_values:[['time','21:30']]});
 }finally{globalThis.FormData=originalFormData}
 assert.equal(final.scheduledTime,'21:30');
 assert.match(widget.page(),/21:30/);
 assert.equal(calls.at(-1).args.p_match_id,final.id);
 const seeded=reseedTournamentKnockout(row.state,[{
  team:row.state.teams[0].id,stage:'semifinal',slot:1,side:'a'
 }]);
 assert.equal(seeded.matches.find(m=>m.id===final.id).scheduledTime,'21:30');
 assert.ok(!seeded.matches.some(m=>m.phase==='group'&&m.scheduledTime));
});
test('Tournament PDF archive includes scheduled times in the bordered fixtures table',()=>{
 const row=sampleRow('groups');
 row.state.matches[0].scheduledTime='19:15';
 const before=globalThis.document,oldAtob=globalThis.atob;
 const drawn=[];
 try{
  globalThis.atob=()=>String.fromCharCode(255,216,255,217);
  globalThis.document={createElement:()=>({
   width:1200,height:1553,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',
   getContext:()=>({
    fillStyle:'',strokeStyle:'',lineWidth:1,font:'',
    fillRect(){},strokeRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},
    measureText:v=>({width:String(v).length*10}),fillText:v=>drawn.push(String(v))
   })
  })};
  const out=tournamentArchivePdf(row);
  assert.ok(out.pages>=1);
  assert.ok(drawn.includes('Time (24h)'));
  assert.ok(drawn.includes('19:15'));
  assert.ok(drawn.includes('ALL MATCHES AND SCORES - GROUP STAGE'));
 }finally{globalThis.document=before;globalThis.atob=oldAtob}
});

test('Exactly five teams form one group and play ten unique matches in five rounds',()=>{
 const s=makeInitialTournament(players(5),1000,'groups',fixedRandom);
 assert.equal(new Set(s.teams.map(t=>t.group)).size,1);
 assert.ok(s.teams.every(t=>t.group==='A'));
 assert.equal(s.matches.length,10);
 const unique=new Set(s.matches.map(m=>[m.a,m.b].sort().join(':')));
 assert.equal(unique.size,10);
 for(let round=1;round<=5;round++){
  const games=s.matches.filter(m=>m.round===round);
  assert.equal(games.length,2);
  assert.equal(new Set(games.flatMap(m=>[m.a,m.b])).size,4);
 }
});
test('Five-team semifinals are strictly first vs fourth and second vs third',()=>{
 const s=makeInitialTournament(players(5),1500,'groups',fixedRandom);
 for(const match of s.matches){
  match.sets=[{a:6,b:2},{a:6,b:4}];
  match.winner=match.a;
 }
 const ranked=groupStandings(s,'A').map(x=>x.id);
 const seeded=getQualifiers(s).map(t=>t.id);
 assert.deepEqual(seeded,[ranked[0],ranked[3],ranked[1],ranked[2]]);
 const bracket=makeKnockoutMatches(getQualifiers(s));
 assert.equal(bracket.filter(m=>m.round===1).length,2);
 assert.deepEqual([bracket[0].a,bracket[0].b],[ranked[0],ranked[3]]);
 assert.deepEqual([bracket[1].a,bracket[1].b],[ranked[1],ranked[2]]);
});
test('Team editor preserves old dues, payment amounts, and participant IDs when reducing and adding teams',()=>{
 const s=makeInitialTournament(players(6),1250,'groups',fixedRandom);
 s.teams[0].members[0].paid=500;
 s.teams[0].members[1].due=750;
 const original=s.teams[0];
 const five=resizeTournamentDraw(s,1250,s.teams.slice(0,5).map(t=>({id:t.id})),fixedRandom);
 const kept=five.teams.find(t=>t.id===original.id);
 assert.deepEqual(kept.members,original.members);
 assert.equal(five.matches.length,10);
 assert.equal(new Set(five.teams.map(t=>t.group)).size,1);
 const six=resizeTournamentDraw(five,1250,[
   ...five.teams.map(t=>({id:t.id})),{p1:'New Player One',p2:'New Player Two'}
 ],fixedRandom);
 assert.equal(six.teams.length,6);
 assert.equal(six.matches.length,6);
 const added=six.teams.find(t=>!five.teams.some(old=>old.id===t.id));
 assert.deepEqual(added.members.map(p=>[p.due,p.paid]),[[1250,0],[1250,0]]);
 assert.equal(new Set(six.teams.flatMap(t=>t.members.map(p=>p.id))).size,12);
 assert.deepEqual(six.teams.find(t=>t.id===original.id).members,original.members);
});
test('Cannot remove a team with paid participation; resizing locks after a match result',()=>{
 const s=makeInitialTournament(players(6),1500,'groups',fixedRandom);
 s.teams[5].members[0].paid=250;
 assert.throws(()=>resizeTournamentDraw(s,1500,s.teams.slice(0,5).map(t=>({id:t.id})),fixedRandom));
 s.matches[0].sets=[{a:6,b:0},{a:6,b:2}];
 s.matches[0].winner=s.matches[0].a;
 assert.equal(tournamentCanResize(s),false);
 assert.throws(()=>resizeTournamentDraw(s,1500,s.teams.map(t=>({id:t.id})).concat({p1:'Extra One',p2:'Extra Two'}),fixedRandom));
});
test('Staff may edit an active tournament team count and save five-team draw without losing payment history',async()=>{
 const row=sampleRow('groups');
 row.state=makeInitialTournament(players(6),1500,'groups',fixedRandom);
 row.state.teams[0].members[0].paid=400;
 const originalMember=JSON.stringify(row.state.teams[0].members[0]);
 const {widget,calls}=makeUI(false,[row]);
 await widget.load();
 assert.match(widget.page(),/Manage Teams/);
 await widget.action({dataset:{action:'tm-team-start'}});
 assert.match(widget.page(),/id="tm-existing-team-count"/);
 await widget.change({id:'tm-existing-team-count',value:'5',closest:()=>null});
 assert.match(widget.page(),/Five teams: one group/);
 const before=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'resize-teams'},_values:[]});
 }finally{globalThis.FormData=before}
 assert.equal(row.state.teams.length,5);
 assert.equal(row.state.matches.length,10);
 assert.equal(JSON.stringify(row.state.teams.flatMap(t=>t.members).find(m=>m.id===JSON.parse(originalMember).id)),originalMember);
 assert.equal(calls.filter(x=>x.name==='tournament_resize_teams').length,1);
 assert.match(widget.page(),/5-team group/);
});
test('Team count editor can add new participants and block deletion of paid teams',async()=>{
 const row=sampleRow('knockout'),{widget}=makeUI(false,[row]);
 row.state.teams[0].members[0].paid=100;
 await widget.load();
 await widget.action({dataset:{action:'tm-team-start'}});
 let blocked=false;
 try{await widget.action({dataset:{action:'tm-team-remove',index:'0'},closest:()=>null})}
 catch(e){blocked=/payments/i.test(e.message)}
 assert.ok(blocked);
 await widget.action({dataset:{action:'tm-team-add',closest:()=>null}});
 assert.match(widget.page(),/New Team 5/);
 const old=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'resize-teams'},_values:[['new_p1_4','Added Alice'],['new_p2_4','Added Bob']]});
 }finally{globalThis.FormData=old}
 assert.equal(row.state.teams.length,5);
 assert.equal(row.state.teams.flatMap(t=>t.members).filter(x=>x.name.startsWith('Added')).length,2);
 assert.equal(row.state.teams.find(t=>t.members[0].paid===100)?.members[0].paid,100);
});

test('Staff can open Add Team directly and save new players while retaining existing payments',async()=>{
 const row=sampleRow('groups');
 row.state.teams[0].members[0].paid=325;
 const previous=JSON.stringify(row.state.teams[0].members[0]);
 const {widget,calls}=makeUI(false,[row]);
 await widget.load();
 assert.match(widget.page(),/data-action="tm-team-add-quick"/);
 await widget.action({dataset:{action:'tm-team-add-quick'}});
 const editor=widget.page();
 assert.match(editor,/Manage Tournament Teams/);
 assert.match(editor,/New Team 5/);
 assert.match(editor,/new_p1_4/);
 assert.match(editor,/new_p2_4/);
 assert.match(editor,/data-tm-submit="resize-teams"/);
 const oldFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'resize-teams'},_values:[
   ['new_p1_4','Lama Hassan'],['new_p2_4','Zein Abbas']
  ]});
 }finally{globalThis.FormData=oldFormData}
 assert.equal(row.state.teams.length,5);
 assert.equal(row.state.matches.length,10);
 assert.deepEqual(row.state.teams.flatMap(t=>t.members).find(p=>p.id===JSON.parse(previous).id),JSON.parse(previous));
 assert.equal(row.state.teams.flatMap(t=>t.members).filter(p=>p.name==='Lama Hassan'||p.name==='Zein Abbas').length,2);
 assert.equal(calls.filter(c=>c.name==='tournament_resize_teams').length,1);
});
test('Add Team and team manager both lock after the first recorded result',async()=>{
 const row=sampleRow('groups');
 row.state.matches[0].sets=[{a:6,b:3},{a:6,b:4}];
 row.state.matches[0].winner=row.state.matches[0].a;
 const {widget,calls}=makeUI(false,[row]);
 await widget.load();
 assert.match(widget.page(),/data-action="tm-team-add-quick" disabled/);
 assert.match(widget.page(),/data-action="tm-team-start" disabled/);
 let blocked=false;
 try{await widget.action({dataset:{action:'tm-team-add-quick'}})}catch(e){blocked=/locked/.test(e.message)}
 assert.ok(blocked);
 assert.equal(calls.length,0);
});
test('Add Team cannot exceed the 32-team limit',async()=>{
 const row=sampleRow('knockout');
 row.state=makeInitialTournament(players(32),1500,'knockout',fixedRandom);
 const {widget}=makeUI(false,[row]);await widget.load();
 assert.match(widget.page(),/data-action="tm-team-add-quick" disabled/);
 let blocked=false;
 try{await widget.action({dataset:{action:'tm-team-add-quick'}})}
 catch(e){blocked=/Maximum 32/.test(e.message)}
 assert.ok(blocked);
});

function pinForm(mode,values){
 return {dataset:{tmSubmit:'shuffle-protection',mode},_values:Object.entries(values)};
}
async function withPINForm(widget,form){
 const original=globalThis.FormData;
 globalThis.FormData=class{constructor(f){this.entries=()=>f._values[Symbol.iterator]()};};
 try{return await widget.submit(form);}finally{globalThis.FormData=original;}
}
test('Each group tournament can be PIN locked, requiring the PIN for subsequent shuffles',async()=>{
 const row=sampleRow('groups');
 row.state.teams[0].members[0].paid=325;
 const memberBefore=JSON.stringify(row.state.teams[0].members[0]);
 const {widget,calls}=makeUI(false,[row]);
 await widget.load();
 assert.match(widget.page(),/data-action="tm-lock-shuffle"/);
 await widget.action({dataset:{action:'tm-lock-shuffle'}});
 assert.match(widget.page(),/Create tournament PIN/);
 await assert.rejects(()=>withPINForm(widget,pinForm('lock',{pin:'1234',confirm_pin:'4321'})),/do not match/);
 assert.equal(row.shuffle_locked,false);
 await withPINForm(widget,pinForm('lock',{pin:'1234',confirm_pin:'1234'}));
 assert.equal(row.shuffle_locked,true);
 assert.match(widget.page(),/Shuffle is PIN-protected for this tournament/);
 assert.match(widget.page(),/data-action="tm-unlock-shuffle"/);
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 assert.match(widget.page(),/Enter PIN to shuffle/);
 await assert.rejects(()=>withPINForm(widget,pinForm('shuffle',{pin:'0000'})),/Incorrect tournament PIN/);
 assert.equal(row.version,1);
 await withPINForm(widget,pinForm('shuffle',{pin:'1234'}));
 assert.equal(row.version,2);
 assert.equal(row.shuffle_locked,true,'Lock persists after shuffling');
 assert.equal(JSON.stringify(row.state.teams.flatMap(t=>t.members).find(p=>p.id===JSON.parse(memberBefore).id)),memberBefore,'Members and payments unchanged');
 assert.deepEqual(calls.map(c=>c.name),[
  'tournament_set_shuffle_lock','tournament_shuffle_groups','tournament_shuffle_groups'
 ]);
 await widget.action({dataset:{action:'tm-unlock-shuffle'}});
 await assert.rejects(()=>withPINForm(widget,pinForm('unlock',{pin:'4321'})),/Incorrect tournament PIN/);
 await withPINForm(widget,pinForm('unlock',{pin:'1234'}));
 assert.equal(row.shuffle_locked,false);
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 assert.equal(row.version,4,'Unlocked events can be shuffled immediately');
});
test('Tournament PIN applies to one event only and stays enforced when switching tabs',async()=>{
 const a=sampleRow('groups'),b=sampleRow('groups');
 a.id='tournament-a';b.id='tournament-b';b.name='Sunday Doubles';
 const {widget,calls}=makeUI(false,[a,b]);
 await widget.load();
 await widget.action({dataset:{action:'tm-lock-shuffle'}});
 await withPINForm(widget,pinForm('lock',{pin:'8765',confirm_pin:'8765'}));
 await widget.action({dataset:{action:'tm-select',id:b.id}});
 assert.match(widget.page(),/data-action="tm-lock-shuffle"/);
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 assert.equal(b.version,1);
 await widget.action({dataset:{action:'tm-select',id:a.id}});
 assert.match(widget.page(),/data-action="tm-unlock-shuffle"/);
 await widget.action({dataset:{action:'tm-shuffle-groups'}});
 assert.match(widget.page(),/Enter PIN to shuffle/);
 assert.equal(a.version,1);
 assert.equal(calls.filter(x=>x.name==='tournament_shuffle_groups').length,1);
});
test('Only administrators see a recovery action for a lost tournament PIN',async()=>{
 const a=sampleRow('groups');a.shuffle_locked=true;a._pin='9876';
 const staff=makeUI(false,[a]),admin=makeUI(true,[a]);
 await staff.widget.load();await admin.widget.load();
 assert.doesNotMatch(staff.widget.page(),/data-action="tm-shuffle-reset-pin"/);
 assert.match(admin.widget.page(),/data-action="tm-shuffle-reset-pin"/);
 await assert.rejects(()=>staff.widget.action({dataset:{action:'tm-shuffle-reset-pin'}}),/administrators/);
 const oldWindow=globalThis.window;
 globalThis.window={confirm:()=>true};
 try{await admin.widget.action({dataset:{action:'tm-shuffle-reset-pin'}});}
 finally{globalThis.window=oldWindow;}
 assert.equal(a.shuffle_locked,false);
});

test('Team Player fee rules charge correctly for zero, one, or two eligible players',()=>{
 assert.deepEqual(tournamentTeamPlayerDues(2000,false,false),[2000,2000]);
 assert.deepEqual(tournamentTeamPlayerDues(2000,true,false),[0,2000]);
 assert.deepEqual(tournamentTeamPlayerDues(2000,false,true),[2000,0]);
 assert.deepEqual(tournamentTeamPlayerDues(2000,true,true),[1000,1000]);
 assert.deepEqual(tournamentTeamPlayerDues(1501,true,true),[750,751]);
 assert.deepEqual(tournamentTeamPlayerDues(0,true,true),[0,0]);
 assert.throws(()=>tournamentTeamPlayerDues(1000,'yes',false),/checkbox/);
});

test('Tournament draws preserve Team Player discounts with stable IDs and no automatic payment',()=>{
 const participants=[
  {p1:'A first',p2:'A second'},
  {p1:'B first',p2:'B second',teamPlayer1:true},
  {p1:'C first',p2:'C second',teamPlayer2:true},
  {p1:'D first',p2:'D second',teamPlayer1:true,teamPlayer2:true}
 ];
 for(const format of ['groups','knockout']){
  const original=makeInitialTournament(participants,2000,format,fixedRandom);
  const byId=original.teams.flatMap(t=>t.members);
  assert.deepEqual(byId.map(p=>p.due).sort((a,b)=>a-b),[0,0,1000,1000,2000,2000,2000,2000].sort((a,b)=>a-b));
  assert.equal(new Set(byId.map(p=>p.id)).size,8);
  assert.ok(byId.every(p=>p.paid===0));
  assert.equal(tournamentTotals(original).due,10000);
  assert.deepEqual(
   original.teams.find(t=>t.members[0].name==='D first').members.map(p=>[p.teamPlayer,p.due]),
   [[true,1000],[true,1000]]
  );
  const copied=resizeTournamentDraw(original,2000,[...original.teams.map(t=>({id:t.id})),{p1:'New regular',p2:'New player'}],fixedRandom);
  for(const participant of byId){
   const kept=copied.teams.flatMap(t=>t.members).find(p=>p.id===participant.id);
   assert.deepEqual(kept,participant,'Resize must preserve status, dues, IDs, payments');
  }
  const added=copied.teams.find(t=>t.members.some(p=>p.name==='New regular'));
  assert.deepEqual(added.members.map(p=>[p.due,p.paid]),[[2000,0],[2000,0]]);
 }
});

test('Create tournament Team Player checkboxes set stored participant dues and survive team-count redraw',async()=>{
 const {widget,calls}=makeUI(false,[]);
 await widget.load();await widget.action({dataset:{action:'tm-create-show'}});
 let html=widget.page();
 assert.equal((html.match(/>Team Player<\/span>/g)||[]).length,16);
 assert.match(html,/name="team_player_1_1"/);
 assert.match(html,/name="team_player_1_2"/);
 const oldFormData=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.change({id:'tm-team-count',value:'4',closest:()=>({_values:[
   ['name','Mixed Fees'],['date','2026-11-01'],['time','18:00'],
   ['fee','20'],['format','groups'],['team_count','4'],
   ['player_1_1','A first'],['player_1_2','A second'],
   ['team_player_1_1','on'],['team_player_1_2','on']
  ]})});
  html=widget.page();
  assert.equal((html.match(/>Team Player<\/span>/g)||[]).length,8);
  assert.match(html,/name="team_player_1_1" checked/);
  assert.match(html,/name="team_player_1_2" checked/);
  const values=[
   ['name','Mixed Fees'],['date','2026-11-01'],['time','18:00'],
   ['fee','20'],['format','groups'],['team_count','4'],
   ['player_1_1','A first'],['player_1_2','A second'],['team_player_1_1','on'],['team_player_1_2','on'],
   ['player_2_1','B first'],['player_2_2','B second'],['team_player_2_1','on'],
   ['player_3_1','C first'],['player_3_2','C second'],['team_player_3_2','on'],
   ['player_4_1','D first'],['player_4_2','D second']
  ];
  await widget.submit({dataset:{tmSubmit:'create'},_values:values});
 }finally{globalThis.FormData=oldFormData;}
 const create=calls.find(c=>c.name==='tournament_create');
 assert.ok(create);
 const teams=create.args.p_state.teams;
 const duesFor=name=>teams.find(t=>t.members[0].name===name).members.map(m=>m.due);
 assert.deepEqual(duesFor('A first'),[1000,1000]);
 assert.deepEqual(duesFor('B first'),[0,2000]);
 assert.deepEqual(duesFor('C first'),[2000,0]);
 assert.deepEqual(duesFor('D first'),[2000,2000]);
 assert.equal(create.args.p_fee_cents,2000);
 assert.equal(tournamentTotals(create.args.p_state).due,10000);
 // The creator closes when saved; member badges are shown on the tournament's
 // Participant Payments page once the newly created row is loaded.
 assert.doesNotMatch(widget.page(),/data-tm-submit="create"/);
});

test('Player notes are minimized per participant and only the selected notes expand',async()=>{
 const first=sampleRow(),second=sampleRow();second.id='second-event';
 const {widget}=makeUI(false,[first,second]);await widget.load();
 const team=first.state.teams[0],one=team.members[0],two=team.members[1];
 const keyA=first.id+':'+team.id+':'+one.id,keyB=first.id+':'+team.id+':'+two.id;
 assert.equal((widget.page().match(/class="tm-member-notes"/g)||[]).length,8);
 assert.match(widget.page(),/No notes yet/,'Older players without notes are supported');
 assert.doesNotMatch(widget.page(),new RegExp('data-tm-member-note="'+keyA+'" open'));
 widget.rememberNote(keyA,true);
 assert.match(widget.page(),new RegExp('data-tm-member-note="'+keyA+'" open'));
 assert.doesNotMatch(widget.page(),new RegExp('data-tm-member-note="'+keyB+'" open'));
 await widget.load(true);
 assert.match(widget.page(),new RegExp('data-tm-member-note="'+keyA+'" open'));
 await widget.action({dataset:{action:'tm-select',id:second.id}});
 assert.doesNotMatch(widget.page(),/class="tm-member-notes"[^>]* open/);
 await widget.action({dataset:{action:'tm-select',id:first.id}});
 assert.doesNotMatch(widget.page(),new RegExp('data-tm-member-note="'+keyA+'" open'));
});
test('Participant note edit, save and clear are safe and do not affect fee, payment, or ID',async()=>{
 const row=sampleRow(),{widget,calls}=makeUI(false,[row]);await widget.load();
 const team=row.state.teams[0],p=team.members[0],other=team.members[1];
 p.paid=300;p.due=800;p.teamPlayer=true;
 const before=JSON.stringify({id:p.id,paid:p.paid,due:p.due,teamPlayer:p.teamPlayer});
 await widget.action({dataset:{action:'tm-note-edit',team:team.id,member:p.id}});
 assert.match(widget.page(),/data-tm-submit="member-note"/);
 const old=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  const form=note=>({dataset:{tmSubmit:'member-note',team:team.id,member:p.id},
   _values:[['note',note]]});
  await assert.rejects(()=>widget.submit(form('z'.repeat(1001))),/1000/);
  assert.equal(calls.length,0);
  await widget.submit(form('  Owes 2 waters <script>alert(1)</script>  '));
  assert.equal(p.note,'Owes 2 waters <script>alert(1)</script>');
  assert.match(widget.page(),/&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(widget.page(),/<script>/);
  assert.doesNotMatch(widget.page(),/data-tm-submit="member-note"/);
  assert.equal(row.version,1);
  assert.equal(other.note,undefined);
  assert.equal(JSON.stringify({id:p.id,paid:p.paid,due:p.due,teamPlayer:p.teamPlayer}),before);
  assert.deepEqual(calls.map(c=>c.name),['tournament_set_member_note']);
  await widget.action({dataset:{action:'tm-note-edit',team:team.id,member:p.id}});
  await widget.submit(form(''));
  assert.equal(p.note,'');
  assert.equal(row.version,2);
  assert.match(widget.page(),/No notes yet/);
 }finally{globalThis.FormData=old;}
});
test('Canceled note editors cannot save and saved notes survive team roster changes',async()=>{
 const row=sampleRow(),{widget}=makeUI(false,[row]);await widget.load();
 const team=row.state.teams[0],p=team.members[0];
 p.note='Owes an iced tea';p.paid=700;
 await widget.action({dataset:{action:'tm-note-edit',team:team.id,member:p.id}});
 const saved=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.action({dataset:{action:'tm-note-cancel'}});
  await assert.rejects(()=>widget.submit({
   dataset:{tmSubmit:'member-note',team:team.id,member:p.id},_values:[['note','New note']]
  }),/Open the participant notes editor again/);
 }finally{globalThis.FormData=saved;}
 assert.equal(p.note,'Owes an iced tea');assert.equal(p.paid,700);
 const original=JSON.stringify(p);
 const resized=resizeTournamentDraw(row.state,row.fee_cents,[
  ...row.state.teams.map(t=>({id:t.id})),{p1:'Extra Player',p2:'New Partner'}
 ],fixedRandom);
 assert.equal(JSON.stringify(resized.teams.flatMap(t=>t.members).find(m=>m.id===p.id)),original);
});

test('Pro Set to 8 or 9 accepts exactly one first-to-target set',()=>{
 for(const [mode,target] of [['pro_8',8],['pro_9',9]]){
  assert.equal(proSetWinner([{a:target,b:0}],mode),'a');
  assert.equal(proSetWinner([{a:target-1,b:target}],mode),'b');
  for(const sets of [[{a:target-1,b:target-1}],[{a:target,b:target}],
   [{a:target+1,b:1}],[{a:6,b:4}],[{a:target,b:4,ta:7,tb:5}],
   [{a:target,b:3},{a:target,b:4}],[{a:-1,b:target}]]){
   assert.throws(()=>proSetWinner(sets,mode),undefined,JSON.stringify(sets));
  }
 }
 assert.equal(tournamentMatchWinner([{a:6,b:4},{a:6,b:4}],'best_of_3'),'a');
 assert.throws(()=>tournamentMatchWinner([{a:8,b:4}],'best_of_3'));
});

test('Group standings and five-team qualification handle pro-set scores',()=>{
 const state=makeInitialTournament(players(5),1800,'groups',fixedRandom);
 for(const match of state.matches){match.sets=[{a:9,b:8}];match.winner=match.a;}
 const standings=groupStandings(state,'A','pro_9');
 assert.equal(standings.reduce((n,t)=>n+t.played,0),20);
 assert.equal(standings.reduce((n,t)=>n+t.setsWon,0),10);
 assert.equal(standings.reduce((n,t)=>n+t.gamesWon,0),170);
 assert.equal(getQualifiers(state,'pro_9').length,4);
 assert.throws(()=>groupStandings(state,'A','best_of_3'),/Sets end/);
});

test('Tournament creation sends selected group scoring to Supabase',async()=>{
 const {widget,calls}=makeUI(false,[]);
 await widget.load();await widget.action({dataset:{action:'tm-create-show'}});
 assert.match(widget.page(),/Group stage scoring/);
 assert.match(widget.page(),/Pro Set · First to 9 games/);
 const old=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'create'},_values:[
   ['name','Pro Set Cup'],['date','2026-11-08'],['time','18:00'],['fee','20'],
   ['format','groups'],['group_scoring','pro_9'],['team_count','8'],
   ...players(8).flatMap((p,i)=>[['player_'+(i+1)+'_1',p.p1],['player_'+(i+1)+'_2',p.p2]])
  ]});
 }finally{globalThis.FormData=old;}
 assert.equal(calls[0].name,'tournament_create');
 assert.equal(calls[0].args.p_group_scoring,'pro_9');
 assert.equal(calls[0].args.p_state.teams.length,8);
});

test('Existing tournament format can change before scores without losing payments or times',async()=>{
 const row=sampleRow('groups'),{widget,calls}=makeUI(false,[row]);
 row.shuffle_locked=true;
 row.state.teams[0].members[0].paid=500;
 row.state.teams[0].members[0].note='Owes two drinks';
 row.state.matches[0].scheduledTime='20:30';
 const original=JSON.stringify(row.state.teams[0].members[0]);
 await widget.load();
 assert.match(widget.page(),/data-tm-submit="group-scoring"/);
 const old=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  await widget.submit({dataset:{tmSubmit:'group-scoring'},_values:[['group_scoring','pro_8']]});
  assert.equal(row.group_scoring,'pro_8');assert.equal(row.version,1);
  assert.equal(row.state.matches[0].scheduledTime,'20:30');
  assert.equal(JSON.stringify(row.state.teams[0].members[0]),original);
  const match=row.state.matches[0];
  await widget.action({dataset:{action:'tm-edit-score',id:match.id}});
  assert.match(widget.page(),/tm-pro-set-editor/);
  assert.doesNotMatch(widget.page(),/name="s2a"/);
  await widget.submit({dataset:{tmSubmit:'score',match:match.id},
   _values:[['s1a','8'],['s1b','7']]});
  assert.deepEqual(match.sets,[{a:8,b:7}]);
  assert.equal(match.winner,match.a);assert.equal(row.version,2);
  assert.doesNotMatch(widget.page(),/data-tm-submit="group-scoring"/);
  assert.match(widget.page(),/Locked after the first score/);
  await assert.rejects(()=>widget.submit({dataset:{tmSubmit:'group-scoring'},
   _values:[['group_scoring','best_of_3']]}),/only change before/);
  assert.equal(row.group_scoring,'pro_8');
  assert.deepEqual(calls.map(c=>c.name),['tournament_set_group_scoring','tournament_change']);
 }finally{globalThis.FormData=old;}
});

test('Group format is editable multiple times before play, but not in knockout tournaments',async()=>{
 const row=sampleRow('groups'),{widget}=makeUI(false,[row]);
 await widget.load();
 const prior=globalThis.FormData;
 try{
  globalThis.FormData=class{constructor(form){this.entries=()=>form._values[Symbol.iterator]()}};
  for(const mode of ['pro_9','pro_8','best_of_3'])
   await widget.submit({dataset:{tmSubmit:'group-scoring'},_values:[['group_scoring',mode]]});
  assert.equal(row.group_scoring,'best_of_3');assert.equal(row.version,3);
 }finally{globalThis.FormData=prior;}
 const ko=makeUI(false,[sampleRow('knockout')]);await ko.widget.load();
 assert.doesNotMatch(ko.widget.page(),/data-tm-submit="group-scoring"/);
});
