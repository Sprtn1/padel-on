-- Booking-specific notes for padel, pickleball, and basketball courts.
-- Notes do not change income, payments, or player-paid markers.
begin;

alter table public.cafeteria_finance_entries
 add column if not exists court_notes text not null default ''
 check (char_length(court_notes) <= 1000);

-- Keep the original eight-argument entry function for existing clients.
-- New court forms use this nine-argument overload, saving the entry and
-- its initial notes in a single transaction.
create or replace function public.cafeteria_finance_record_entry(
 p_entry_id uuid, p_entry_date date, p_category text, p_name text,
 p_amount_cents bigint, p_quantity integer, p_unit_price_cents bigint,
 p_checkmarks boolean[], p_court_notes text
) returns uuid
language plpgsql security definer
set search_path = public, pg_temp
as $court_note_create$
declare
 v_id uuid;
 v_note text := btrim(coalesce(p_court_notes, ''));
 v_previous text;
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Authorized staff only';
 end if;
 if p_category not in ('padel_courts','pickleball_courts','basketball_courts') then
  raise exception 'Court notes are available for court bookings only';
 end if;
 if char_length(v_note) > 1000 then
  raise exception 'Court notes cannot exceed 1000 characters';
 end if;

 v_id := public.cafeteria_finance_record_entry(
  p_entry_id,p_entry_date,p_category,p_name,p_amount_cents,
  p_quantity,p_unit_price_cents,p_checkmarks);

 -- The existing entry function also handles safe retries. Never overwrite
 -- notes that another person has subsequently edited on a retry.
 select court_notes into v_previous from public.cafeteria_finance_entries
  where id = v_id for update;
 if v_previous not in ('',v_note) then
  raise exception 'Booking notes have changed. Refresh before retrying';
 end if;
 if v_note <> '' and v_previous is distinct from v_note then
  update public.cafeteria_finance_entries
   set court_notes=v_note where id=v_id;
  insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
   values(auth.uid(),'UPDATE','cafeteria_finance_entries',v_id::text,
    jsonb_build_object('court_notes',v_previous),
    jsonb_build_object('court_notes',v_note));
 end if;
 return v_id;
end;
$court_note_create$;

-- Editing notes is independent of changing the booking amount or payment
-- checkboxes. The existing closed-day database trigger protects this UPDATE.
create or replace function public.cafeteria_finance_set_court_notes(
 p_entry_id uuid, p_court_notes text, p_expected_notes text
) returns void
language plpgsql security definer
set search_path = public, pg_temp
as $court_note_edit$
declare
 v_previous public.cafeteria_finance_entries%rowtype;
 v_note text := btrim(coalesce(p_court_notes,''));
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Authorized staff only';
 end if;
 if p_entry_id is null then raise exception 'Court entry ID is required'; end if;
 if p_expected_notes is null then raise exception 'Previous notes are required'; end if;
 if char_length(v_note)>1000 then
  raise exception 'Court notes cannot exceed 1000 characters';
 end if;
 select * into v_previous from public.cafeteria_finance_entries
  where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then
  raise exception 'Court booking not found or already voided';
 end if;
 if v_previous.category not in ('padel_courts','pickleball_courts','basketball_courts') then
  raise exception 'Notes can only be edited on court bookings';
 end if;
 if v_previous.court_notes is distinct from p_expected_notes then
  raise exception 'Another staff member changed these notes. Refresh and try again.';
 end if;
 if v_previous.court_notes=v_note then return; end if;
 update public.cafeteria_finance_entries
  set court_notes=v_note where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
  values(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
   jsonb_build_object('court_notes',v_previous.court_notes),
   jsonb_build_object('court_notes',v_note));
end;
$court_note_edit$;

revoke all on function public.cafeteria_finance_record_entry(
 uuid,date,text,text,bigint,integer,bigint,boolean[],text)
 from public,anon,authenticated;
grant execute on function public.cafeteria_finance_record_entry(
 uuid,date,text,text,bigint,integer,bigint,boolean[],text)
 to authenticated;
revoke all on function public.cafeteria_finance_set_court_notes(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.cafeteria_finance_set_court_notes(uuid,text,text)
 to authenticated;

commit;
