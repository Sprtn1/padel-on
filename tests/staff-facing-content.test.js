import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const cashbook=readFileSync(new URL('../lib/cafeteria-finances.js',import.meta.url),'utf8');
const tournament=readFileSync(new URL('../lib/tournament-management.js',import.meta.url),'utf8');

function renderSettings(role){
 const start=app.indexOf('function settingsPage(){');
 const end=app.indexOf('function renderPage(){',start);
 assert.ok(start>=0&&end>start);
 const isolated=app.slice(start,end);
 const heading=(eyebrow,title,description,actions='')=>
  '<header>'+eyebrow+' '+title+' '+description+' '+actions+'</header>';
 const button=label=>'<button>'+label+'</button>';
 const icon=()=> '';
 const execute=new Function('state','canUseOrderLists','heading','btn','icon',
  'matchmakerCommissionSettings','adminAccountManagementCards',
  isolated+'\nreturn settingsPage();');
 return execute({staff:{role}},()=>true,heading,button,icon,
  ()=>'ADMIN COMMISSION DATA',()=> 'ADMIN CUSTOMER ACCOUNTS');
}

test('Staff Settings only show tools staff can use, not disabled administrator controls',()=>{
 const html=renderSettings('staff');
 assert.match(html,/Order Lists/);
 assert.match(html,/Order Counter/);
 assert.match(html,/Reem/);
 assert.doesNotMatch(html,/Team roster/);
 assert.doesNotMatch(html,/Manual weekly reset/);
 assert.doesNotMatch(html,/ADMIN COMMISSION DATA/);
 assert.doesNotMatch(html,/ADMIN CUSTOMER ACCOUNTS/);
 assert.doesNotMatch(html,/migration required/i);
});
test('Administrator Settings preserve the member, reset and account controls',()=>{
 const html=renderSettings('admin');
 assert.match(html,/Team roster/);
 assert.match(html,/Manual weekly reset/);
 assert.match(html,/ADMIN COMMISSION DATA/);
 assert.match(html,/ADMIN CUSTOMER ACCOUNTS/);
 assert.match(html,/Order Lists/);
});
test('Reports and account help text avoid backend and migration jargon',()=>{
 assert.doesNotMatch(app,/Loading client data or migration required/);
 assert.doesNotMatch(app,/Loading cafeteria data or migration required/);
 assert.doesNotMatch(app,/and audit history<\/p>/);
 assert.doesNotMatch(app,/Financial totals use permanent saved matchmaking records/);
 assert.doesNotMatch(app,/Historical financial records are not cleared by weekly resets/);
 assert.match(app,/Monthly commission is based on total revenue and rounded once/);
});
test('Operational warnings remain meaningful after shortening visible content',()=>{
 assert.match(tournament,/permanently removes its teams, payments, and match results/);
 assert.match(tournament,/Confirm PDF Saved & Delete Tournament/);
 assert.match(cashbook,/This day is read-only/);
 assert.match(cashbook,/Negative difference — review entries and the cash count/);
 assert.match(cashbook,/To make corrections, open Private Sessions/);
 assert.doesNotMatch(cashbook,/history retained\./i);
});

test('Saving court notes always intercepts the form instead of reloading the page',async()=>{
 const start=app.indexOf("document.addEventListener('submit',async e=>{");
 const end=app.indexOf(" if(e.target.dataset?.save==='order-add-item'",start);
 assert.ok(start>=0&&end>start,'Locate submit listener');
 const listeners={},saved=[];
 // Execute the actual tournament and cafeteria dispatch branches.
 const snippet=app.slice(start,end)+'\n});';
 new Function('document','state','cafeteriaFinances','toast','tournamentManagement',snippet)(
  {addEventListener:(name,handler)=>{listeners[name]=handler;}},
  {tab:'cafeteria-finances',staff:{role:'staff'}},
  {submit:async form=>saved.push(form.dataset.cafeSave)},
  error=>{throw Error(error)},
  {submit:async()=>{throw Error('Unexpected tournament action')}}
 );
 for(const kind of ['court-notes','court-amount','entry','closing','whish']){
  let cancelled=false;
  await listeners.submit({
   target:{dataset:{cafeSave:kind}},
   preventDefault:()=>{cancelled=true;}
  });
  assert.equal(cancelled,true,kind+' must prevent native form submission');
 }
 assert.deepEqual(saved,['court-notes','court-amount','entry','closing','whish']);
});
