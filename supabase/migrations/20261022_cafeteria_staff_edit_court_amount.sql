-- Allow authorized PADEL ON staff to correct court booking amounts without
-- voiding/recreating a booking. Financial history and player markers stay intact.
-- Closed and approved days are protected by cafeteria_closed_entries_guard.
begin;

create or replace function public.cafeteria_finance_set_court_amount(
  p_entry_id uuid,
  p_amount_cents bigint,
  p_expected_amount_cents bigint
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_previous public.cafeteria_finance_entries%rowtype;
begin
  if not public.is_staff() then
    raise exception 'Authorized staff only';
  end if;
  if p_entry_id is null then
    raise exception 'A court entry ID is required';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 100000000000 then
    raise exception 'Court amount must be greater than zero and within the allowed limit';
  end if;
  if p_expected_amount_cents is null then
    raise exception 'Previous court amount is required';
  end if;

  select * into v_previous
  from public.cafeteria_finance_entries
  where id = p_entry_id
  for update;

  if not found or v_previous.voided_at is not null then
    raise exception 'Court entry not found or already voided';
  end if;
  if v_previous.category not in
      ('padel_courts', 'pickleball_courts', 'basketball_courts') then
    raise exception 'Only court booking amounts can be edited';
  end if;
  if v_previous.amount_cents is distinct from p_expected_amount_cents then
    raise exception 'Another staff member has updated this amount. Refresh and try again.';
  end if;
  if v_previous.amount_cents = p_amount_cents then
    return;
  end if;

  -- Existing trigger checks the day-closing status under an advisory lock.
  -- No other fields are updated, including player payment checkboxes.
  update public.cafeteria_finance_entries
  set amount_cents = p_amount_cents
  where id = p_entry_id;

  insert into public.audit_logs
    (actor, action, entity, entity_id, before_data, after_data)
  values
    (auth.uid(), 'UPDATE', 'cafeteria_finance_entries', p_entry_id::text,
     jsonb_build_object('category', v_previous.category,
                        'amount_cents', v_previous.amount_cents),
     jsonb_build_object('category', v_previous.category,
                        'amount_cents', p_amount_cents));
end;
$function$;

revoke all on function public.cafeteria_finance_set_court_amount(uuid,bigint,bigint)
  from public, anon, authenticated;
grant execute on function public.cafeteria_finance_set_court_amount(uuid,bigint,bigint)
  to authenticated;

commit;
