import test from 'node:test';
import assert from 'node:assert/strict';
import {createCourtScheduler,filterPrivateTrainingClients} from '../lib/court-scheduler-ui.js';

const day='2026-11-16';
const clients=[
 {id:'client-a',name:'Abed Hariri',client_code:'120',active:true},
 {id:'client-b',name:'Aboudi Assi',client_code:'124',active:true},
 {id:'client-c',name:'Ahmad Hamdan',client_code:'115',active:true}
];
const shift=(value,n)=>{
 const d=new Date(value+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()+n);
 return d.toISOString().slice(0,10);
};

test('Private training search matches partial names, case-insensitive words, and client IDs',()=>{
 assert.deepEqual(filterPrivateTrainingClients(clients,'aBOU').map(c=>c.id),['client-b']);
 assert.deepEqual(filterPrivateTrainingClients(clients,'hariri abed').map(c=>c.id),['client-a']);
 assert.deepEqual(filterPrivateTrainingClients(clients,'124').map(c=>c.id),['client-b']);
 assert.deepEqual(filterPrivateTrainingClients(clients,'zzzz'),[]);
 assert.equal(filterPrivateTrainingClients(clients,'').length,3);
 assert.equal(filterPrivateTrainingClients(clients,'  ').length,3);
});

test('Private training search narrows select options without changing the UUID field used to save',async()=>{
 const ui=createCourtScheduler({
  api:{getSession:()=>({access_token:'staff'}),
   listAll:async table=>table==='private_clients'?clients:
    table==='private_coaches'?[]:[]},
  today:()=>day,addDays:shift,rerender:()=>{},toast:()=>{},
  onLedgerChanged:async()=>{}
 });
 await ui.load();
 await ui.openFromFinance('private_training','padel',day);
 await new Promise(resolve=>setImmediate(resolve));
 const html=ui.dialog();
 assert.match(html,/type="search" name="private_client_search"/);
 assert.match(html,/placeholder="Type a name or client ID"/);
 assert.match(html,/select name="private_client_id" required/);
 assert.match(html,/name="private_session_fee"/);
 const select={value:'client-a',innerHTML:''};
 const status={textContent:''};
 const input={name:'private_client_search',value:'124',closest:()=>form};
 const form={querySelector(selector){
  if(selector==='[name="private_client_search"]')return input;
  if(selector==='[name="private_client_id"]')return select;
  if(selector==='[data-cafe-private-client-results]')return status;
  return null;
 }};
 assert.equal(ui.previewEnd(input),true);
 assert.equal(select.value,'','changing the search must clear a previously chosen client');
 assert.match(select.innerHTML,/value="client-b"/);
 assert.doesNotMatch(select.innerHTML,/value="client-a"/);
 assert.match(status.textContent,/1 client available/);
 input.value='no match';
 ui.previewEnd(input);
 assert.match(select.innerHTML,/No matching private clients/);
 assert.match(status.textContent,/No matching clients/);
 input.value='';
 ui.previewEnd(input);
 assert.match(select.innerHTML,/value="client-a"/);
 assert.match(select.innerHTML,/value="client-c"/);
});
