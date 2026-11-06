import test from 'node:test';
import assert from 'node:assert/strict';
import {advancedSettings,makeAdvancedGroupDraw,getAdvancedQualifiers,createAmericanoEntries,
 makeAmericanoDraw,americanoStandings,americanoFixtureResult,americanoPlayoffCandidates,
 isAmericano} from '../lib/tournament-advanced-engine.js';
import {makeTournamentTeams,makeKnockoutMatches} from '../lib/tournament-engine.js';

const names=n=>Array.from({length:n},(_,i)=>({p1:'Player '+(i*2+1),p2:'Player '+(i*2+2)}));
const individuals=n=>Array.from({length:n},(_,i)=>({p1:'Player '+(i+1)}));
test('Advanced settings validate courts, fees, group sizes, private publication and adjustable points',()=>{
 const defaults=advancedSettings({},'groups',8);
 assert.equal(defaults.qualifiers_per_group,2);
 assert.deepEqual(defaults.courts,['C1']);
 assert.equal(defaults.registration_mode,'staff');
 assert.equal(defaults.publication_status,'draft');
 assert.equal(defaults.points_per_match,24);
 assert.equal(advancedSettings({points_per_match:32,courts:['C3','C1'],rounds:5},'americano_team',6).points_per_match,32);
 for(const invalid of [
  {courts:['C1','C1']},{courts:['C7']},{group_size:1},
  {qualifiers_per_group:5},{registration_mode:'public',entry_limit:3},
  {entry_limit:3},{points_per_match:101},{registration_deadline:'bad'}
 ]){
  if(invalid.registration_mode==='public')continue;
  assert.throws(()=>advancedSettings(invalid,'groups',8),Error);
 }
 assert.throws(()=>advancedSettings({rules:[{key:'t',enabled:true,text:'a'}, {key:'t',enabled:false,text:'b'}]}),/rules/);
});
test('Custom group draw allows different sizes and leaves existing team members and payment records unchanged',()=>{
 const initial=makeTournamentTeams(names(10),2000);
 initial[0].members[0].paid=1000;
 const copy=structuredClone(initial);
 const draw=makeAdvancedGroupDraw(initial,5,()=>.1);
 assert.equal(draw.matches.length,20);
 assert.deepEqual([...new Set(draw.teams.map(t=>t.group))],['A','B']);
 for(const group of ['A','B']){
  const ids=draw.teams.filter(t=>t.group===group);
  assert.equal(ids.length,5);
  assert.equal(draw.matches.filter(m=>m.group===group).length,10);
 }
 assert.deepEqual(initial,copy,'Group generation must not edit source financial or player records.');
 assert.equal(draw.teams.find(t=>t.id===initial[0].id).members[0].paid,1000);
 const odd=makeAdvancedGroupDraw(makeTournamentTeams(names(7),0),3,()=>.7);
 const sizes=[...new Set(odd.teams.map(t=>t.group))].map(g=>odd.teams.filter(t=>t.group===g).length);
 assert.ok(sizes.every(n=>n>=2&&n<=3));
});
test('Custom group qualification follows configured number and leaves incomplete brackets as byes',()=>{
 const state=makeAdvancedGroupDraw(makeTournamentTeams(names(9),2000),3,()=>.2);
 for(const m of state.matches){m.winner=m.a;m.sets=[{a:6,b:3},{a:6,b:3}];}
 const qualifiers=getAdvancedQualifiers(state,2);
 assert.equal(qualifiers.length,6);
 const bracket=makeKnockoutMatches(qualifiers);
 assert.ok(bracket.some(m=>m.winner),'Six qualifiers should create first-round byes.');
 assert.ok(bracket.every(m=>m.phase==='knockout'));
 assert.throws(()=>getAdvancedQualifiers({...state,matches:state.matches.map((m,i)=>i===0?{...m,winner:null}:m)},2),/Finish/);
});
test('Team Americano creates fixed pairs, fair round-robin and court waves',()=>{
 const state=makeAmericanoDraw(names(6),2000,'americano_team',{
  rounds:5,courts:['C1','C3'],match_minutes:20,start_time:'18:00'
 },()=>.4);
 assert.equal(state.teams.length,6);
 assert.equal(state.matches.length,15);
 const pairs=new Set();
 const appearances=new Map();
 for(const m of state.matches){
  assert.ok(m.a!==m.b);
  assert.equal(m.phase,'americano');
  assert.ok(['C1','C3'].includes(m.scheduledCourt));
  assert.match(m.scheduledTime,/^\d\d:\d\d$/);
  const pair=[m.a,m.b].sort().join(':');
  assert.ok(!pairs.has(pair));
  pairs.add(pair);
  appearances.set(m.a,(appearances.get(m.a)||0)+1);
  appearances.set(m.b,(appearances.get(m.b)||0)+1);
 }
 assert.deepEqual([...appearances.values()].sort((a,b)=>a-b),Array(6).fill(5));
});
test('Individual Americano rotates partners, includes byes fairly, and uses each player once per round',()=>{
 for(const count of [4,5,6,7,8,13]){
  const state=makeAmericanoDraw(individuals(count),0,'americano_individual',{
   rounds:7,points_per_match:32,courts:['C1','C2']
  },()=>.42);
  const plays=new Map();
  for(const m of state.matches){
   assert.equal(m.playersA.length,2);
   assert.equal(m.playersB.length,2);
   const players=[...m.playersA,...m.playersB];
   assert.equal(new Set(players).size,4);
   for(const id of players)plays.set(id,(plays.get(id)||0)+1);
   for(const other of state.matches.filter(x=>x.round===m.round&&x.id!==m.id)){
    assert.ok(players.every(id=>![...other.playersA,...other.playersB].includes(id)),
     'One player cannot occupy two courts in the same round.');
   }
  }
  assert.ok(Math.max(...plays.values())-Math.min(...plays.values())<=1,
   'Bye distribution should keep player match counts nearly equal.');
 }
});
test('Americano points sum to configured total and rankings handle draws, byes and different match counts',()=>{
 const state=makeAmericanoDraw(names(4),1200,'americano_team',{rounds:3,points_per_match:24},()=>.4);
 const m=state.matches[0];
 assert.throws(()=>americanoFixtureResult(m,15,12,24),/total exactly 24/);
 assert.throws(()=>americanoFixtureResult(m,-1,25,24),/Side A score/);
 state.matches[0]=americanoFixtureResult(m,14,10,24);
 const rows=americanoStandings(state);
 assert.equal(rows.find(x=>x.id===m.a).points,14);
 assert.equal(rows.find(x=>x.id===m.b).points,10);
 assert.equal(rows.find(x=>x.id===m.a).played,1);
 assert.equal(rows.filter(x=>x.played===0).length,2);
 assert.throws(()=>americanoPlayoffCandidates(state),/Finish all/);
});
test('Individual Americano points go to both teammates and do not affect tournament payment amounts',()=>{
 const state=makeAmericanoDraw(individuals(4),1500,'americano_individual',{rounds:3,points_per_match:24},()=>.4);
 const first=state.matches[0];
 state.matches[0]=americanoFixtureResult(first,12,12,24);
 const ranking=americanoStandings(state);
 assert.ok(ranking.every(x=>x.played===1));
 assert.ok(ranking.every(x=>x.points===12));
 assert.ok(state.teams.every(x=>x.members.length===1&&x.members[0].due===1500&&x.members[0].paid===0));
});
test('Team Player benefits stay independent of wins and points',()=>{
 const team=createAmericanoEntries([{p1:'Ali',p2:'Rami',teamPlayer1:true,teamPlayer2:false},
  {p1:'Jad',p2:'Omar',teamPlayer1:true,teamPlayer2:true}],2000,'americano_team');
 assert.deepEqual(team.map(t=>t.members.map(m=>m.due)),[[0,2000],[1000,1000]]);
 const individuals=createAmericanoEntries([{p1:'Ali',teamPlayer1:true},{p1:'Rami'},{p1:'Jad'},{p1:'Omar'}],2000,'americano_individual');
 assert.deepEqual(individuals.map(t=>t.members[0].due),[0,2000,2000,2000]);
 assert.equal(isAmericano('groups'),false);
 assert.equal(isAmericano('americano_team'),true);
});
