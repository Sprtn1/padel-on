import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourtScheduler} from '../lib/court-scheduler-ui.js';
import {getMatchmakingFinance,getMatchmakingCurrentStreak} from '../lib/logic.js';

const date='2026-11-20';
const matchmakerId='75b8dc1b-0529-489f-8aa1-9a464d9d61a1';
const rows=[{
 id:'11111111-1111-1111-1111-111111111111',business_date:date,sport:'padel',
 court_number:'C2',booking_start_time:'18:00',booking_end_time:'19:30',
 duration_minutes:90,customer_name:'Matchmaking guest',status:'confirmed',
 booking_type:'reservation',notes:'',revision:3,checkmarks:[true,true,false,false,false,false],
 external_source:'matchpoint'
}];
const matchmakers=[{id:matchmakerId,name:'Nazih Sonbol',active:true},
 {id:'75b8dc1b-0529-489f-8aa1-9a464d9d61a2',name:'Khalil Itani',active:true}];
const shift=(d,n)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const setup=({assigned=null,includeRows=true}={})=>{
 const calls=[],bookings=includeRows?rows.map(row=>({...row,matchmaker_id:assigned})):[];
 const api={
  getSession:()=>({access_token:'token'}),
  listAll:async(name)=>{
   calls.push({read:name});
   if(name==='padel_court_reservations')return bookings;
   if(name==='matchmakers')return matchmakers;
   if(name==='matchpoint_sync_status')return [{last_bookings_at:'2026-11-20T09:00:00+02:00'}];
   return [];
  },
  rpc:async(name,args)=>{
   calls.push({rpc:name,args});
   return bookings[0]?.id||'22222222-2222-2222-2222-222222222222';
  }
 };
 const ui=createCourtScheduler({api,today:()=>date,addDays:shift,
  rerender:()=>{},toast:()=>{},onLedgerChanged:async()=>{},
  onReservationChanged:async()=>{}});
 return {ui,calls,bookings};
};
async function withData(entries,callback){
 const original=globalThis.FormData;
 globalThis.FormData=class{entries(){return entries[Symbol.iterator]()}};
 try{return await callback()}finally{globalThis.FormData=original}
}
const fields=type=>[
 ['booking_type',type],['start_time','18:00'],['duration_minutes','90'],
 ['court_number','C2'],['customer_name','Matchmaking guest'],['status','confirmed'],
 ['total_amount','32.00'],['cash_amount','32.00'],['whish_amount','0.00'],['notes','']
];

test('Matchmaking appears in Booking type with an assigned matchmaker field',async()=>{
 const {ui,bookings}=setup({assigned:matchmakerId});
 await ui.load();await ui.openPlanned(bookings[0].id,'padel',date);
 await new Promise(resolve=>setImmediate(resolve));
 const editor=ui.dialog();
 assert.match(editor,/value="matchmaking" selected>Matchmaking Match/);
 assert.match(editor,/name="matchmaker_id" required/);
 assert.match(editor,/Nazih Sonbol/);
 assert.match(editor,/value="reservation">Reservation/);
 const grid=ui.page();
 assert.match(grid,/schedule-matchmaking/);
 assert.match(grid,/MATCHMAKING/);
 assert.match(grid,/Nazih Sonbol/);
 assert.match(grid,/class="schedule-matchmaking">Matchmaking match/);
});

test('Imported MatchPoint booking records matchmaker attribution without changing booking type or fees',async()=>{
 const {ui,calls,bookings}=setup();
 await ui.load();await ui.openPlanned(bookings[0].id,'padel',date);
 await withData(fields('matchmaking').concat([['matchmaker_id',matchmakerId]]),()=>ui.submit({}));
 const saved=calls.find(x=>x.rpc==='club_court_reservation_priced_save');
 const assignment=calls.find(x=>x.rpc==='club_court_reservation_matchmaker_set');
 assert(saved);assert(assignment);
 assert.equal(saved.args.p_booking_type,'reservation');
 assert.equal(saved.args.p_payment_total_cents,3200);
 assert.equal(saved.args.p_cash_cents,3200);
 assert.equal(saved.args.p_whish_cents,0);
 assert.equal(assignment.args.p_id,bookings[0].id);
 assert.equal(assignment.args.p_matchmaker_id,matchmakerId);
 assert.equal(calls.some(x=>x.rpc==='nazih_games'),false);
});

test('Changing matchmaking back to ordinary reservation clears the matchmaker',async()=>{
 const {ui,calls,bookings}=setup({assigned:matchmakerId});
 await ui.load();await ui.openPlanned(bookings[0].id,'padel',date);
 await withData(fields('reservation'),()=>ui.submit({}));
 const rpc=calls.find(x=>x.rpc==='club_court_reservation_matchmaker_set');
 assert(rpc);assert.equal(rpc.args.p_matchmaker_id,null);
});

test('Matchmaking cannot be saved without a matchmaker',async()=>{
 const {ui,calls,bookings}=setup();
 await ui.load();await ui.openPlanned(bookings[0].id,'padel',date);
 await assert.rejects(()=>withData(fields('matchmaking'),()=>ui.submit({})),/Select a matchmaker/);
 assert.equal(calls.filter(x=>x.rpc).length,0);
});

test('Normal reservations keep matchmaker field hidden; selecting matchmaking reveals it',async()=>{
 const {ui,bookings}=setup();
 await ui.load();await ui.openPlanned(bookings[0].id,'padel',date);
 const normal=ui.dialog();
 assert.match(normal, /<label class="cafe-matchmaker-field" hidden>/);
 assert.doesNotMatch(normal, /<label class="cafe-matchmaker-field">/);
 const css=readFileSync(new URL('../styles/stitch-timetable.css',import.meta.url),'utf8');
 assert.match(css, /\.cafe-scheduler-form \.cafe-matchmaker-field\[hidden\]\{display:none!important\}/);

 const field={hidden:true,querySelector:()=>({required:false})};
 const form={querySelector:selector=>selector==='.cafe-matchmaker-field'?field:null};
 const choice={name:'booking_type',value:'matchmaking',closest:()=>form};
 assert.equal(ui.previewEnd(choice),true);
 assert.equal(field.hidden,false);
 assert.match(ui.dialog(), /<label class="cafe-matchmaker-field">/);
 choice.value='reservation';
 assert.equal(ui.previewEnd(choice),true);
 assert.equal(field.hidden,true);
 assert.match(ui.dialog(), /<label class="cafe-matchmaker-field" hidden>/);
});

test('Other sports do not get a matchmaking booking type',async()=>{
 const {ui}=setup();
 await ui.load();await ui.openFromFinance('reservation','pickleball',date);
 assert.doesNotMatch(ui.dialog(),/value="matchmaking"/);
});

test('Schema and pink styles are linked to existing reservation records',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261120195000_court_matchmaking_reservations.sql',import.meta.url),'utf8');
 const css=readFileSync(new URL('../styles/stitch-timetable.css',import.meta.url),'utf8');
 assert.match(sql,/ADD COLUMN IF NOT EXISTS matchmaker_id uuid REFERENCES public\.matchmakers/);
 assert.match(sql,/NOT public\.is_staff\(\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.club_court_reservation_matchmaker_set/);
 assert.match(css,/\.schedule-matchmaking/);
 assert.match(css,/html\[data-theme="dark"\].*schedule-matchmaking/);
});

test('Linked timetable reservations add their full court value to game revenue and commissions',()=>{
 const items=[
  {id:'manual',matchmaker_id:matchmakerId,played_on:'2026-11-19',amount_cents:3000,created_at:'2026-11-19T18:00:00Z'},
  {id:'linked',matchmaker_id:matchmakerId,played_on:'2026-11-20',amount_cents:2200,source_reservation_id:rows[0].id,
   players:'Matchmaking guest',created_at:'2026-11-20T18:00:00Z'}
 ];
 const total=getMatchmakingFinance(items,'2026-11');
 assert.equal(total.games,2);
 assert.equal(total.rows.length,2);
 assert.equal(total.total,5200,'the full court booking price is reflected in matchmaking revenue');
 assert.equal(total.rows.find(row=>row.id==='linked').commission_cents,330,'the linked $22 booking earns 15% on streak day two');
 assert.equal(getMatchmakingCurrentStreak(items,'2026-11-20').currentStreak,2);
});

test('Full court price mirror follows Cash or Whish edits without creating another receipt',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261120214500_matchmaking_court_amount_mirror.sql',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(sql,/DROP CONSTRAINT IF EXISTS nazih_linked_reservation_no_extra_revenue/);
 assert.match(sql,/SELECT s\.amount_cents FROM public\.court_payment_splits s/);
 assert.match(sql,/s\.source_kind='reservation' AND s\.source_id=NEW\.id/);
 assert.match(sql,/amount_cents=EXCLUDED\.amount_cents/);
 assert.match(sql,/AFTER INSERT OR UPDATE OR DELETE ON public\.court_payment_splits/);
 assert.match(sql,/AND s\.voided_at IS NULL/);
 assert.doesNotMatch(sql,/INSERT INTO public\.court_payment_cash_movements/);
 assert.doesNotMatch(sql,/INSERT INTO public\.whish_ledger_entries/);
 assert.match(app,/const matchmakingStandaloneCollected=sum\(matchmaking\.filter\(row=>!row\.source_reservation_id\)/);
 assert.match(app,/privatePaid\+privateTopups\+cafeteriaPaid\+matchmakingStandaloneCollected/);
 assert.match(app,/Timetable \(full court amount\)/);
});

test('Database links matchmaking bookings exactly once and protects linked entries from manual editing',()=>{
 const sql=readFileSync(new URL('../supabase/migrations/20261120203000_link_matchmaking_reservations_to_ledger.sql',import.meta.url),'utf8');
 const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
 assert.match(sql,/CREATE UNIQUE INDEX IF NOT EXISTS nazih_games_reservation_source_unique/);
 assert.match(sql,/source_reservation_id IS NULL OR amount_cents = 0/);
 assert.match(sql,/ON CONFLICT \(source_reservation_id\)/);
 assert.match(sql,/UPDATE public\.nazih_games[\s\S]*deleted_at=now\(\)/);
 assert.match(sql,/WHERE matchmaker_id IS NOT NULL[\s\S]*status <> 'cancelled'/);
 assert.match(app,/source_reservation_id\)\.length\} from the court timetable/);
 assert.match(app,/Edit in Court Timetable/);
 assert.match(app,/state\.finance=await api\.listAll\('nazih_games'\)/);
});
