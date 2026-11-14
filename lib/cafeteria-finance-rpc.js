// Exact RPC contracts verified against public.pg_proc in PADEL ON Supabase.
// The specialized Pickleball RPC supplies its category, quantity and unit price
// server-side. Extra keys make PostgREST reject the call (PGRST202).
const COURT_BOOKING_RPC='cafeteria_finance_record_court_booking';
const PICKLEBALL_RPC='cafeteria_finance_record_pickleball_booking';
const ENTRY_RPC='cafeteria_finance_record_entry';

export function cafeteriaFinanceRecordRequest(entry,entryDate,entryId){
 if(!entry||!entry.category)throw Error('Missing cafeteria entry category.');
 const shared={
  p_entry_id:entryId,
  p_entry_date:entryDate,
  p_name:entry.name,
  p_amount_cents:entry.amount_cents,
  p_checkmarks:entry.checkmarks
 };
 if(entry.category==='pickleball_courts'){
  return {name:PICKLEBALL_RPC,args:{
   ...shared,
   p_court_notes:entry.court_notes,
   p_start:entry.booking_start_time,
   p_end:entry.booking_end_time,
   p_player_count:entry.pickleball_player_count
  }};
 }
 const regular={
  ...shared,
  p_category:entry.category,
  p_quantity:entry.quantity,
  p_unit_price_cents:entry.unit_price_cents
 };
 if(entry.category==='padel_courts'||entry.category==='basketball_courts'){
  return {name:COURT_BOOKING_RPC,args:{
   ...regular,
   p_court_notes:entry.court_notes,
   p_court:entry.court_number||null,
   p_start:entry.booking_start_time,
   p_end:entry.booking_end_time
  }};
 }
 return {name:ENTRY_RPC,args:regular};
}
