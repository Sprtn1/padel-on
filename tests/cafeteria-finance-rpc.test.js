import test from 'node:test';
import assert from 'node:assert/strict';
import {cafeteriaFinanceRecordRequest} from '../lib/cafeteria-finance-rpc.js';
import {cafeEntryFromForm,CAFE_CATEGORIES} from '../lib/cafeteria-finances.js';

// Verified using the *live* pg_get_function_identity_arguments on 2026-11-14.
// Reject missing or extra keys: PostgREST matches exposed functions by names.
const contract={
 cafeteria_finance_record_pickleball_booking:[
  'p_entry_id','p_entry_date','p_name','p_amount_cents','p_checkmarks',
  'p_court_notes','p_start','p_end','p_player_count'
 ],
 cafeteria_finance_record_court_booking:[
  'p_entry_id','p_entry_date','p_category','p_name','p_amount_cents',
  'p_quantity','p_unit_price_cents','p_checkmarks','p_court_notes',
  'p_court','p_start','p_end'
 ],
 cafeteria_finance_record_entry:[
  'p_entry_id','p_entry_date','p_category','p_name','p_amount_cents',
  'p_quantity','p_unit_price_cents','p_checkmarks'
 ]
};
const day='2026-11-14',id='11111111-1111-4111-8111-111111111111';
const keys=x=>Object.keys(x).sort();
function assertRpc(entry,name){
 const result=cafeteriaFinanceRecordRequest(entry,day,id);
 assert.equal(result.name,name);
 assert.deepEqual(keys(result.args),[...contract[name]].sort(),name+' must match the live database signature');
 assert.equal(result.args.p_entry_id,id);
 assert.equal(result.args.p_entry_date,day);
 assert.equal(result.args.p_name,entry.name);
 assert.equal(result.args.p_amount_cents,entry.amount_cents);
 assert.deepEqual(result.args.p_checkmarks,entry.checkmarks);
 return result.args;
}
test('Pickleball doubles uses only its 9 database parameters and retains players, dates and price',()=>{
 const entry=cafeEntryFromForm('pickleball_courts',{
  name:'Test doubles',booking_start_time:'18:00',booking_duration_minutes:'60',amount:'24',
  pickleball_player_count:'4',check0:'on',check3:'on',court_notes:'Bring balls'
 });
 const args=assertRpc(entry,'cafeteria_finance_record_pickleball_booking');
 assert.equal(args.p_player_count,4);
 assert.equal(args.p_start,'18:00');assert.equal(args.p_end,'19:00');
 assert.equal(args.p_amount_cents,2400);
 assert.deepEqual(args.p_checkmarks,[true,false,false,true]);
 assert.equal(args.p_court_notes,'Bring balls');
 assert.ok(!('p_category' in args));
 assert.ok(!('p_quantity' in args));
 assert.ok(!('p_unit_price_cents' in args));
});
test('Pickleball singles keeps a four-element legacy marker array with P3/P4 false',()=>{
 const entry=cafeEntryFromForm('pickleball_courts',{
  name:'Test singles',booking_start_time:'19:00',booking_duration_minutes:'90',amount:'20',
  pickleball_player_count:'2',check0:'on',check2:'on',check3:'on'
 });
 const args=assertRpc(entry,'cafeteria_finance_record_pickleball_booking');
 assert.equal(args.p_player_count,2);
 assert.deepEqual(args.p_checkmarks,[true,false,false,false]);
 assert.equal(args.p_end,'20:30');
});
test('Padel and Basketball use the generic 12-parameter court RPC',()=>{
 for(const category of ['padel_courts','basketball_courts']){
  const entry=cafeEntryFromForm(category,{
   name:'Court test',court_number:category==='padel_courts'?'C2':'',booking_start_time:'18:00',
   booking_duration_minutes:'90',amount:'32',check0:'on',check5:'on'
  });
  const args=assertRpc(entry,'cafeteria_finance_record_court_booking');
  assert.equal(args.p_category,category);
  assert.equal(args.p_court,category==='padel_courts'?'C2':null);
  assert.equal(args.p_start,'18:00');assert.equal(args.p_end,'19:30');
  assert.equal(args.p_checkmarks.length,category==='basketball_courts'?6:4);
  assert.equal(args.p_quantity,1);assert.equal(args.p_unit_price_cents,0);
 }
});
test('All non-court categories use exactly the 8-parameter ledger RPC',()=>{
 for(const category of CAFE_CATEGORIES.filter(x=>x.kind!=='court')){
  const data={name:'Other income',amount:'13.50',quantity:'2',unit_price:'6.75'};
  const entry=cafeEntryFromForm(category.id,data);
  const args=assertRpc(entry,'cafeteria_finance_record_entry');
  assert.equal(args.p_category,category.id);
  assert.ok(!('p_court_notes' in args));
  assert.ok(!('p_start' in args));
  assert.ok(!('p_player_count' in args));
 }
});
test('Unknown or missing entries cannot be submitted to an RPC',()=>{
 assert.throws(()=>cafeteriaFinanceRecordRequest(null,day,id),/Missing cafeteria/);
 assert.throws(()=>cafeteriaFinanceRecordRequest({},day,id),/Missing cafeteria/);
});
