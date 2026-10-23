import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,padelSetWinner,
 padelMatchWinner,groupStandings,getQualifiers,tournamentTotals,tournamentChampion,
 knockoutSeedEntrants,reseedTournamentKnockout,makeSeededKnockoutMatches} from '../lib/tournament-engine.js';
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
   assert.ok(members.length>=2&&members.length<=4);
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
     m.sets=p.sets;m.winner=padelMatchWinner(p.sets)==='a'?m.a:m.b;
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
  fee_cents:1500,format:mode,state};
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
 const semis=layout.nodes.find(x=>x.round===2&&x.slot===1);
 assert.equal(semis.match.seedA,state.teams[0].id);
 const leftFeeders=layout.nodes.filter(x=>x.round===1&&x.slot<=2);
 assert.ok(leftFeeders.length===2);
 assert.equal(layout.links.filter(x=>leftFeeders.some(y=>y.match.id===x.from)).length,0,
  'Reserved semifinalist cannot also receive earlier-round winners in their half');
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
