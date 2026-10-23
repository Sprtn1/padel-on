import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTournamentMoney,makeInitialTournament,makeKnockoutMatches,padelSetWinner,
 padelMatchWinner,groupStandings,getQualifiers,tournamentTotals,tournamentChampion} from '../lib/tournament-engine.js';
import {createTournamentManagement} from '../lib/tournament-management.js';
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
   if(name==='tournament_close'){
    const index=backing.findIndex(x=>x.id===args.p_id);
    backing.splice(index,1);return null;
   }
  }
 };
 const widget=createTournamentManagement({
  api,heading:()=>'',icon:()=>'',today:()=> '2026-10-23',
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
   moveTo(){},lineTo(){},stroke(){},measureText:v=>({width:String(v).length*10})})
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
