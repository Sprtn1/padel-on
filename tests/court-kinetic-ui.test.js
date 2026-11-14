import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createCourtScheduler} from '../lib/court-scheduler-ui.js';
import {tabFromHash,canAccessTab} from '../lib/hash-routing.js';
import {tabs} from '../lib/navigation.js';

const repoFile = path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const day='2026-11-14';
const addDays=(ymd,n)=>{const value=new Date(ymd+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+n);return value.toISOString().slice(0,10)};
const reservation={
 id:'booking-1',sport:'padel',status:'confirmed',booking_type:'reservation',
 business_date:day,court_number:'C1',customer_name:'A & B',notes:'Bring rackets',
 booking_start_time:'18:00',booking_end_time:'19:30',duration_minutes:90,
 checkmarks:[true,false,false,false,false,false],revision:1
};
const split={id:'split-1',source_kind:'reservation',source_id:'booking-1',
 amount_cents:3200,cash_cents:2000,whish_cents:1200,unpaid_cents:0,payment_date:day};
function fixture(){
 const writes=[],api={
  getSession:()=>({access_token:'staff'}),
  listAll:async table=>table==='padel_court_reservations'?[reservation]:
   table==='court_payment_splits'?[split]:[],
  rpc:async(name,args)=>{writes.push({name,args});return null;}
 };
 const ui=createCourtScheduler({api,today:()=>day,addDays,rerender:()=>{},toast:()=>{},
  onLedgerChanged:async()=>{},onReservationChanged:async()=>{}});
 return {ui,writes};
}

test('Court Timetable navigation and URL are role-aware',()=>{
 assert.equal(tabFromHash('#court-timetable'),'court-timetable');
 assert.equal(canAccessTab('court-timetable','staff'),true);
 assert.equal(canAccessTab('court-timetable','admin'),true);
 assert.equal(canAccessTab('court-timetable',null),false);
 assert.ok(tabs.some(([key])=>key==='court-timetable'));
});

test('Booking details drawer reads the selected saved row and payment split',async()=>{
 const {ui,writes}=fixture();await ui.load();
 await ui.action({dataset:{action:'cafe-schedule-open',cafeScheduleSource:'reservation',cafeScheduleId:reservation.id}});
 const page=ui.page();
 assert.match(page,/class="ck-detail-drawer"/);
 assert.match(page,/A &amp; B/);
 assert.match(page,/Bring rackets/);
 assert.match(page,/\$32\.00/);
 assert.match(page,/\$20\.00/);
 assert.match(page,/\$12\.00/);
 assert.match(page,/Payment recorded on 2026-11-14/);
 assert.equal(ui.isEditorOpen(),false,'opening details is not a financial edit');
 assert.deepEqual(writes,[],'opening details must never create a booking or wallet record');
 await ui.action({dataset:{action:'cafe-schedule-details-close'}});
 assert.doesNotMatch(ui.page(),/class="ck-detail-drawer"/);
});

test('Details edit reuses the existing authorized reservation editor',async()=>{
 const {ui}=fixture();await ui.load();
 await ui.action({dataset:{action:'cafe-schedule-open',cafeScheduleSource:'reservation',cafeScheduleId:reservation.id}});
 await ui.action({dataset:{action:'cafe-schedule-details-edit'}});
 assert.equal(ui.isEditorOpen(),true);
 assert.match(ui.page(),/data-cafe-save="schedule-reservation"/);
 await ui.action({dataset:{action:'cafe-schedule-close'}});
 assert.equal(ui.isEditorOpen(),false);
});

test('Mobile court tabs reveal only one court while keeping 3-court Padel data',async()=>{
 const {ui}=fixture();await ui.load();
 assert.match(ui.page(),/data-selected-court="C1"/);
 assert.match(ui.page(),/data-action="cafe-schedule-court"/);
 await ui.action({dataset:{action:'cafe-schedule-court',court:'C2'}});
 assert.match(ui.page(),/data-selected-court="C2"/);
 assert.match(ui.page(),/data-court="C3"/);
 await assert.rejects(ui.action({dataset:{action:'cafe-schedule-court',court:'INVALID'}}),/Unknown court/);
});

test('Court Kinetic styles load last without adding a new frontend framework',()=>{
 const bootstrap=repoFile('bootstrap.js'),css=repoFile('styles/court-kinetic-v2.css');
 assert.match(bootstrap,/styles\/court-kinetic-v2\.css/);
 assert.match(css,/\.ck-detail-drawer/);
 assert.match(css,/\.cafe-fold/);
 assert.match(css,/\[data-selected-court="C1"\]/);
 const app=repoFile('app.js');
 assert.match(app,/cafeteriaFinances\.schedulerPage\(\)/);
 assert.match(app,/case'court-timetable'/);
 assert.doesNotMatch(app,/tailwindcss\.com/);
});
