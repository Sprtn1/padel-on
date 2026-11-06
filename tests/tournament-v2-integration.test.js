import test from 'node:test';
import assert from 'node:assert/strict';
import {createTournamentManagement} from '../lib/tournament-management.js';
import {makeAmericanoDraw} from '../lib/tournament-advanced-engine.js';
import {tournamentTotals} from '../lib/tournament-engine.js';
import {tournamentCsv} from '../lib/tournament-v2-ui.js';
import {WIZARD_STEPS} from '../lib/tournament-workspace.js';

const day='2026-11-06';
const FormDataMock=class{constructor(form){this.entries=()=>form.values[Symbol.iterator]()}};
async function withForm(fn){const old=globalThis.FormData;globalThis.FormData=FormDataMock;
 try{return await fn()}finally{globalThis.FormData=old}}
const data=(format,count)=>[
 ['name','Advanced Test Cup'],['format',format],['team_count',String(count)],
 ['date','2026-11-12'],['time','18:00'],['fee_mode',format==='americano_individual'?'free':'paid'],
 ['fee','20'],['points_per_match','32'],['rounds','3'],['match_minutes','20'],
 ['entry_limit','32'],['group_size','4'],['qualifiers_per_group','2'],
 ['court_c1','on'],['court_c2','on'],['prize_mode','announced'],['prize_text','A trophy'],
 ['playoffs','on'],
 ...Array.from({length:count},(_,i)=>[
  ['player_'+(i+1)+'_1','First Player '+(i+1)],
  ...(format==='americano_individual'?[]:[['player_'+(i+1)+'_2','Second Player '+(i+1)]])
 ]).flat()
];
function fixture(admin=false,rows=[]){
 const calls=[],statuses=[];
 const api={getSession:()=>({access_token:'mock'}),listAll:async table=>
  table==='tournaments'?rows:table==='tournament_registration_status'?statuses:[],
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='tournament_create_v2'){
    rows.push({id:'new-id',name:args.p_name,version:0,event_date:args.p_date,
      start_time:args.p_time,format:args.p_format,fee_cents:args.p_fee_cents,
      state:args.p_state,settings:args.p_settings,shuffle_locked:false,
      group_scoring:args.p_group_scoring,knockout_scoring:args.p_knockout_scoring});
    return 'new-id';
   }
   const t=rows.find(x=>x.id===args.p_id);assert.ok(t);assert.equal(args.p_expected_version,t.version);
   if(name==='tournament_americano_score'){
    const m=t.state.matches.find(x=>x.id===args.p_match_id);
    m.played=true;m.scoreA=args.p_score_a;m.scoreB=args.p_score_b;
    m.winner=m.scoreA===m.scoreB?null:m.scoreA>m.scoreB?m.a:m.b;
   }else if(name==='tournament_update_registration_status'){
    const prior=statuses.find(x=>x.entrant_id===args.p_entrant_id);
    if(prior){prior.status=args.p_status;prior.note=args.p_note;}
    else statuses.push({tournament_id:t.id,entrant_id:args.p_entrant_id,status:args.p_status,note:args.p_note});
   }else if(name==='tournament_update_settings'){
    t.settings=args.p_settings;
   }else throw Error('Unexpected mutation '+name);
   t.version++;return t.version;
 }};
 return {rows,calls,statuses,ui:createTournamentManagement({api,heading:()=>'',icon:()=>'',today:()=>day,
  isAdmin:()=>admin,toast:()=>{},rerender:()=>{}})};
}
async function create(model,format,count){
 await model.ui.load();await model.ui.action({dataset:{action:'tm-create-show'}});
 const values=data(format,count);
 if(count!==8)model.ui.change({id:'tm-team-count',value:String(count),closest:()=>({values})});
 for(let i=0;i<WIZARD_STEPS.length-1;i++)
  await model.ui.action({dataset:{action:'tm-wizard-next'},closest:()=>({values})});
 await model.ui.submit({dataset:{tmSubmit:'create'},values});
 return model.rows.find(t=>t.id==='new-id');
}
test('Individual Americano seven-step wizard creates private free entry and configurable 32-point fixtures',async()=>{
 await withForm(async()=>{
  const x=fixture(),t=await create(x,'americano_individual',8);
  assert.equal(x.calls[0][0],'tournament_create_v2');
  assert.equal(t.format,'americano_individual');assert.equal(t.fee_cents,0);
  assert.equal(t.settings.registration_mode,'staff');
  assert.equal(t.settings.points_per_match,32);
  assert.deepEqual(t.settings.courts,['C1','C2']);
  assert.equal(t.settings.publication_status,'draft');
  assert.equal(t.state.teams.length,8);
  assert.ok(t.state.teams.every(team=>team.members.length===1));
  assert.equal(t.state.matches.length,6);
  assert.deepEqual(tournamentTotals(t.state),{due:0,paid:0,remaining:0,overpaid:0});
  assert.match(x.ui.page(),/Americano Rounds/);
  assert.match(x.ui.page(),/Rankings/);
  assert.match(x.ui.page(),/Staff Exports/);
 });
});
test('Team Americano scores update rankings without mutating payments',async()=>{
 await withForm(async()=>{
  const x=fixture(),t=await create(x,'americano_team',4);
  assert.equal(t.fee_cents,2000);
  const financial=structuredClone(t.state.teams);
  await x.ui.action({dataset:{action:'tm-workspace',section:'rounds'}});
  await x.ui.action({dataset:{action:'tm-am-edit',id:t.state.matches[0].id}});
  assert.match(x.ui.page(),/name="score_a"/);
  await x.ui.submit({dataset:{tmSubmit:'americano-score',match:t.state.matches[0].id},
   values:[['score_a','18'],['score_b','14']]});
  assert.deepEqual(t.state.teams,financial);
  assert.equal(t.state.matches[0].played,true);assert.equal(t.version,1);
  assert.match(x.ui.page(),/18 – 14/);
  await x.ui.action({dataset:{action:'tm-workspace',section:'rankings'}});
  assert.match(x.ui.page(),/Team Americano Rankings/);
 });
});
test('Admin-only tournament settings and registration statuses save independently of scores and payments',async()=>{
 await withForm(async()=>{
  const x=fixture(true),t=await create(x,'americano_team',4);
  await x.ui.submit({dataset:{tmSubmit:'registration-status',entrant:'t1'},
   values:[['status','pending'],['note','Contacted player']]});
  assert.equal(x.statuses[0].status,'pending');
  assert.equal(t.version,1);
  assert.equal(tournamentTotals(t.state).paid,0);
  await x.ui.action({dataset:{action:'tm-workspace',section:'settings'}});
  assert.match(x.ui.page(),/Save Tournament Settings/);
  await x.ui.submit({dataset:{tmSubmit:'advanced-settings'},values:[
   ['publication_status','published_internal'],['prize_mode','announced'],
   ['prize_text','Updated trophy'],['entry_limit','32'],['court_c1','on'],
   ['court_c2','on'],['registration_deadline','']
  ]});
  assert.equal(x.calls.at(-1)[0],'tournament_update_settings');
  assert.equal(t.settings.prize_text,'Updated trophy');
  assert.equal(t.settings.points_per_match,32);
  assert.equal(t.settings.publication_status,'published_internal');
 });
});
test('Non-admin staff cannot change tournament settings or disqualify entrants',async()=>{
 await withForm(async()=>{
  const x=fixture(false),t=await create(x,'americano_team',4);
  await x.ui.action({dataset:{action:'tm-workspace',section:'settings'}});
  assert.doesNotMatch(x.ui.page(),/data-tm-submit="advanced-settings"/);
  await assert.rejects(()=>x.ui.submit({dataset:{tmSubmit:'registration-status',entrant:'t1'},
   values:[['status','disqualified'],['note','Test']]}),/Only administrators/);
  assert.equal(t.version,0);
 });
});
test('Staff CSV exports guard formula injection and preserve amounts',()=>{
 const state=makeAmericanoDraw(Array.from({length:4},(_,i)=>({
  p1:i===0?'=1+1':'First Player '+i,p2:'Second Player '+i
 })),2000,'americano_team',{rounds:2},()=>.4);
 const t={name:'CSV Test',format:'americano_team',state};
 assert.ok(tournamentCsv(t,'participants').includes('"\'=1+1"'));
 const payments=tournamentCsv(t,'payments');
 assert.match(payments,/20\.00/);assert.match(payments,/0\.00/);
});
