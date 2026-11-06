import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createTournamentManagement} from '../lib/tournament-management.js';
import {makeInitialTournament,tournamentTotals} from '../lib/tournament-engine.js';
import {tournamentHash,tournamentCreateHash,parseTournamentHash,allowedTournamentView,tournamentStatus,WIZARD_STEPS} from '../lib/tournament-workspace.js';
import {tabFromHash,resolveTabFromHash} from '../lib/hash-routing.js';

const date='2026-11-06';
const players=Array.from({length:4},(_,i)=>({p1:'First '+i,p2:'Second '+i}));
const row=(id,format='groups',eventDate='2026-11-06')=>({
 id,version:0,name:'Event '+id,event_date:eventDate,start_time:'18:00',
 format,fee_cents:2000,shuffle_locked:false,
 state:makeInitialTournament(players,2000,format,()=>0.4)
});
function create(rows=[]){
 const calls=[];
 const api={getSession:()=>({access_token:'valid'}),listAll:async(table)=>{
  if(table!=='tournaments')throw Error('Unexpected read '+table);return rows;
 },rpc:async(name,args)=>{calls.push({name,args});return name==='tournament_create'?'new-tournament':null;}};
 return {ui:createTournamentManagement({api,heading:()=>'',today:()=>date,icon:()=>'',toast:()=>{},rerender:()=>{},isAdmin:()=>false}),calls};
}
test('Deep links resolve to the Tournament Management page and safe sections',()=>{
 const id='c3f8137b-1589-4c1c-8350-24e925bd2aaa';
 assert.equal(tournamentHash(),'#tournament');
 assert.equal(tournamentCreateHash(),'#tournament/new');
 assert.equal(tournamentHash(id,'payments'),'#tournament/'+id+'/payments');
 assert.deepEqual(parseTournamentHash('#tournament'),{view:'list'});
 assert.deepEqual(parseTournamentHash('#tournament/new'),{view:'create'});
 assert.deepEqual(parseTournamentHash('#tournament/'+id+'/groups'),{view:'detail',id,section:'groups'});
 assert.equal(tabFromHash('#tournament/'+id+'/final'),'tournament');
 assert.equal(resolveTabFromHash('#tournament/'+id+'/payments','staff'),'tournament');
 assert.equal(parseTournamentHash('#tournament/<script>'),null);
 assert.equal(tournamentHash('<script>'),'#tournament');
 assert.equal(allowedTournamentView('groups','knockout'),'overview');
 assert.equal(allowedTournamentView('groups','groups'),'groups');
 assert.equal(WIZARD_STEPS.length,7);
});
test('Tournament browser displays search, status filter, match progress, and safe card titles',async()=>{
 const a=row('one'),b=row('two','knockout','2026-12-01');b.name='<script>DO NOT RUN</script>';
 const {ui}=create([a,b]);await ui.load();
 assert.equal(ui.applyHashRoute('#tournament'),true);
 let html=ui.page();
 assert.match(html,/id="tm-list-search"/);
 assert.match(html,/id="tm-list-status"/);
 assert.match(html,/All tournaments/);
 assert.match(html,/Upcoming/);
 assert.match(html,/Ongoing/);
 assert.match(html,/data-action="tm-select"/);
 assert.match(html,/&lt;script&gt;DO NOT RUN&lt;\/script&gt;/);
 assert.doesNotMatch(html,/<script>DO NOT RUN<\/script>/);
 ui.searchList({id:'tm-list-search',value:'event one'});
 html=ui.page();
 assert.match(html,/Event one/);
 assert.doesNotMatch(html,/DO NOT RUN/);
 ui.searchList({id:'tm-list-search',value:''});
 ui.searchList({id:'tm-list-status',value:'upcoming'});
 assert.match(ui.page(),/DO NOT RUN/);
 assert.doesNotMatch(ui.page(),/Event one/);
 assert.throws(()=>ui.searchList({id:'tm-list-status',value:'malicious'}),/valid tournament status/);
});
test('Existing tournament has dedicated Overview, Participants, Payments, Group Stage, and Final Stage tabs',async()=>{
 const t=row('test-id');
 const {ui,calls}=create([t]);await ui.load();
 let html=ui.page();
 for(const key of ['overview','participants','payments','groups','final'])
  assert.match(html,new RegExp('data-section="'+key+'"'));
 assert.match(html,/data-tm-panel="overview"/);
 assert.match(html,/data-tm-panel="participants" hidden/);
 assert.match(html,/data-tm-panel="payments" hidden/);
 assert.match(html,/Tournament progress/);
 assert.match(html,/Upcoming matches/);
 await ui.action({dataset:{action:'tm-workspace',section:'participants'}});
 html=ui.page();
 assert.match(html,/data-tm-panel="participants">/);
 assert.match(html,/Registered Participants/);
 assert.match(html,/Manage Teams/);
 await ui.action({dataset:{action:'tm-workspace',section:'payments'}});
 html=ui.page();
 assert.match(html,/data-tm-panel="payments">/);
 assert.match(html,/Participant Payments/);
 assert.match(html,/Edit Amount/);
 assert.match(html,/>Pay</);
 await ui.action({dataset:{action:'tm-workspace',section:'groups'}});
 html=ui.page();
 assert.match(html,/data-tm-panel="groups">/);
 assert.match(html,/Shuffled Group Stage/);
 assert.match(html,/Shuffle Groups/);
 assert.match(html,/Lock Shuffle/);
 await ui.action({dataset:{action:'tm-workspace',section:'final'}});
 html=ui.page();
 assert.match(html,/data-tm-panel="final">/);
 assert.match(html,/Knockout Bracket/);
 assert.equal(calls.length,0,'Changing tabs must never modify tournament data.');
 assert.deepEqual(tournamentTotals(t.state),{due:16000,paid:0,remaining:16000,overpaid:0});
});
test('Knockout-only tournaments have Final Stage but no Group Stage tab',async()=>{
 const {ui}=create([row('knockout-id','knockout')]);await ui.load();
 let html=ui.page();
 assert.doesNotMatch(html,/data-section="groups"/);
 assert.match(html,/data-section="final"/);
 assert.equal(ui.applyHashRoute('#tournament/knockout-id/groups'),false);
 assert.match(ui.page(),/data-tm-panel="overview">/);
 assert.doesNotMatch(ui.page(),/data-tm-panel="groups"/);
});
test('Switching URLs restores an existing tournament and invalid IDs show the list without writes',async()=>{
 const {ui,calls}=create([row('first'),row('second')]);await ui.load();
 assert.equal(ui.applyHashRoute('#tournament/second/payments'),true);
 assert.match(ui.page(),/Event second/);
 assert.match(ui.page(),/data-tm-panel="payments">/);
 assert.equal(ui.applyHashRoute('#tournament/first/groups'),true);
 assert.match(ui.page(),/Event first/);
 assert.match(ui.page(),/data-tm-panel="groups">/);
 assert.equal(ui.applyHashRoute('#tournament/not-found/overview'),true);
 assert.match(ui.page(),/All tournaments/);
 assert.equal(calls.length,0);
});
test('Seven-step creator retains player fields, scoring, prizes and rules',async()=>{
 const {ui}=create([]);await ui.load();
 await ui.action({dataset:{action:'tm-create-show'}});
 let html=ui.page();
 assert.match(html,/New tournament/);
 assert.match(html,/Live preview/);
 assert.equal((html.match(/class="tm-wizard-step-label/g)||[]).length,7);
 assert.match(html,/Number of teams/);
 assert.match(html,/name="group_scoring"/);
 assert.match(html,/name="knockout_scoring"/);
 assert.match(html,/name="team_player_1_1"/);
 assert.match(html,/Player 1 full name/);
 assert.match(html,/data-step="0">/);
 assert.match(html,/data-step="1" hidden/);
});
test('Creation steps validate name, format, schedule and pairs before review',async()=>{
 const {ui,calls}=create([]);await ui.load();await ui.action({dataset:{action:'tm-create-show'}});
 const prior=globalThis.FormData;
 const entries=[['name','Friday Open'],['format','groups'],['team_count','8'],['date',date],['time','18:00'],['fee','20']];
 for(let i=1;i<=8;i++){
  entries.push(['player_'+i+'_1','Player A '+i],['player_'+i+'_2','Player B '+i]);
 }
 globalThis.FormData=class{constructor(form){this.entries=()=>form.values[Symbol.iterator]()}};
 const target=action=>({dataset:{action},closest:()=>({values:entries})});
 try{
  for(let step=1;step<=6;step++){
   await ui.action(target('tm-wizard-next'));
   assert.match(ui.page(),new RegExp('data-step="'+step+'">'));
  }
  assert.match(ui.page(),/Create Tournament &amp; Generate Fixtures|Create Tournament & Generate Fixtures/);
  assert.match(ui.page(),/Review/);
  await ui.action(target('tm-wizard-prev'));
  assert.match(ui.page(),/data-step="5">/);
  assert.equal(calls.length,0);
 }finally{globalThis.FormData=prior}
});
test('The new responsive stylesheet hides inactive sections but preserves functionality in markup',()=>{
 const css=readFileSync(new URL('../styles/tournament-workspace.css',import.meta.url),'utf8');
 const boot=readFileSync(new URL('../bootstrap.js',import.meta.url),'utf8');
 const source=readFileSync(new URL('../lib/tournament-management.js',import.meta.url),'utf8');
 assert.match(css,/\.tm-workspace-panel\[hidden\]/);
 assert.match(css,/\.tm-wizard-section\[hidden\]/);
 assert.match(css,/@media\(max-width:720px\)/);
 assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
 assert.match(boot,/styles\/tournament-workspace\.css/);
 assert.match(source,/data-action="tm-workspace"/);
 assert.match(source,/tournamentHash\(t\.id,workspaceTab\)/);
 assert.match(source,/renderTournamentOverview\(t\)/);
 assert.match(source,/renderTournamentParticipants\(t\)/);
 assert.match(source,/paymentTable\(t\)/);
 assert.match(source,/groupStage\(t\)/);
 assert.match(source,/knockoutStage\(t\)/);
});
