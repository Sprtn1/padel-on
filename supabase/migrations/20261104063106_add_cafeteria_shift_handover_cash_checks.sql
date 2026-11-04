-- Applied to Supabase. Independent handover checks; never alter daily cash, closing, PDF or Whish.

-- Staff-only, independent, immutable shift cash snapshots.
create table public.cafeteria_shift_handovers(
 id uuid primary key,
 day_date date not null,
 outgoing_staff_id uuid not null references auth.users(id),
 incoming_staff_id uuid not null references auth.users(id),
 previous_handover_id uuid references public.cafeteria_shift_handovers(id),
 window_start_at timestamptz not null,
 created_at timestamptz not null default now(),
 opening_cash_cents bigint not null,
 recorded_income_cents bigint not null,
 recorded_expenses_cents bigint not null,
 expected_cash_cents bigint not null,
 counted_cash_cents bigint not null,
 difference_cents bigint generated always as (counted_cash_cents-expected_cash_cents) stored,
 finance_entry_count integer not null default 0,
 private_entry_count integer not null default 0,
 notes text not null default '' check(char_length(notes)<=500),
 accepted_at timestamptz,
 accepted_by uuid references auth.users(id),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_reason text,
 constraint shift_cash_range check(opening_cash_cents between 0 and 100000000000 and counted_cash_cents between 0 and 100000000000),
 constraint shift_distinct_staff check(outgoing_staff_id<>incoming_staff_id),
 constraint shift_cash_expected check(expected_cash_cents=opening_cash_cents+recorded_income_cents-recorded_expenses_cents)
);
create index cafeteria_shift_day_idx on public.cafeteria_shift_handovers(day_date,created_at desc)
 where voided_at is null;
create index cafeteria_shift_incoming_idx on public.cafeteria_shift_handovers(incoming_staff_id);
create index cafeteria_shift_outgoing_idx on public.cafeteria_shift_handovers(outgoing_staff_id);
create index cafeteria_shift_accepted_idx on public.cafeteria_shift_handovers(accepted_by);
create index cafeteria_shift_voided_idx on public.cafeteria_shift_handovers(voided_by);
alter table public.cafeteria_shift_handovers enable row level security;
revoke all on public.cafeteria_shift_handovers from public,anon,authenticated;
grant select on public.cafeteria_shift_handovers to authenticated;
create policy "Staff may view handover cash checks" on public.cafeteria_shift_handovers
 for select to authenticated using ((select public.is_staff()));

create function public.cafeteria_handover_staff_directory()
 returns table(id uuid,email text)
 language plpgsql stable security definer
 set search_path=pg_catalog,public as $$
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Staff authorization required';
 end if;
 return query select sp.id,sp.email from public.staff_profiles sp
  where sp.id<>auth.uid() order by sp.email;
end$$;

-- Uses saved cashbook entries and cash-channel private payments only.
-- Whish, end-of-day closing, and unentered Goods Sold are excluded.
create function public.cafeteria_handover_snapshot(p_day_date date,p_opening_cash_cents bigint default null)
 returns jsonb language plpgsql volatile security definer
 set search_path=pg_catalog,public as $$
declare
 v_previous public.cafeteria_shift_handovers%rowtype;
 v_from timestamptz;
 v_cutoff timestamptz:=clock_timestamp();
 v_start_cash bigint;
 v_finance_in bigint;v_finance_out bigint;v_finance_count integer;
 v_private_in bigint;v_private_out bigint;v_private_count integer;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 if p_day_date is distinct from (now() at time zone 'Asia/Beirut')::date then
  raise exception 'Cash checks are available for today only';
 end if;
 select * into v_previous from public.cafeteria_shift_handovers
  where day_date=p_day_date and voided_at is null
  order by created_at desc,id desc limit 1;
 if v_previous.id is null then
  v_from=p_day_date::timestamp at time zone 'Asia/Beirut';
  if p_opening_cash_cents is not null and p_opening_cash_cents not between 0 and 100000000000 then
   raise exception 'Invalid opening cash count';
  end if;
  v_start_cash=p_opening_cash_cents;
 else
  v_from=v_previous.created_at;
  v_start_cash=v_previous.counted_cash_cents;
 end if;
 select
  coalesce(sum(amount_cents) filter(where category not in
   ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0),
  coalesce(sum(amount_cents) filter(where category in
   ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0),
  count(*)::integer
 into v_finance_in,v_finance_out,v_finance_count
 from public.cafeteria_finance_entries
 where entry_date=p_day_date and voided_at is null
  and created_at>=v_from and (v_previous.id is null or created_at>v_from)
  and created_at<v_cutoff;
 select coalesce(sum(greatest(amount,0)),0),coalesce(sum(greatest(-amount,0)),0),count(*)::integer
 into v_private_in,v_private_out,v_private_count
 from (
  select case entry_type when 'session' then paid_cents
   when 'deposit' then deposit_cents
   when 'balance_close' then -session_fee_cents else 0 end as amount
  from public.private_ledger_entries
  where entry_date=p_day_date and voided_at is null and payment_channel='cash'
   and entry_type in ('session','deposit','balance_close')
   and created_at>=v_from and (v_previous.id is null or created_at>v_from)
   and created_at<v_cutoff
 ) private_cash;
 return jsonb_build_object(
  'previous_id',v_previous.id,'window_start_at',v_from,'checked_at',v_cutoff,
  'opening_cash_cents',v_start_cash,
  'income_cents',v_finance_in+v_private_in,
  'expenses_cents',v_finance_out+v_private_out,
  'expected_cents',case when v_start_cash is null then null
    else v_start_cash+v_finance_in+v_private_in-v_finance_out-v_private_out end,
  'finance_count',v_finance_count,'private_count',v_private_count
 );
end$$;

create function public.cafeteria_handover_record(
 p_id uuid,p_day_date date,p_incoming_staff_id uuid,
 p_opening_cash_cents bigint,p_counted_cash_cents bigint,p_checked_expected_cents bigint,
 p_checked_finance_count integer,p_checked_private_count integer,
 p_checked_previous_id uuid,p_notes text default ''
) returns uuid language plpgsql volatile security definer
 set search_path=pg_catalog,public as $$
declare
 v_snapshot jsonb;v_existing public.cafeteria_shift_handovers%rowtype;
 v_expected bigint;v_previous uuid;v_notes text:=btrim(coalesce(p_notes,''));
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 if p_id is null or p_incoming_staff_id is null or p_incoming_staff_id=auth.uid() or
  not exists(select 1 from public.staff_profiles where id=p_incoming_staff_id) then
  raise exception 'Select another active staff account';
 end if;
 if p_day_date is distinct from (now() at time zone 'Asia/Beirut')::date then
  raise exception 'Handovers may only be recorded today';
 end if;
 if exists(select 1 from public.cafeteria_day_closings
   where day_date=p_day_date and status in ('closed','approved')) then
  raise exception 'Cannot hand over cash after the day is closed';
 end if;
 if p_counted_cash_cents is null or p_counted_cash_cents not between 0 and 100000000000 then
  raise exception 'Enter valid counted cash';
 end if;
 if char_length(v_notes)>500 then raise exception 'Handover notes too long';end if;
 perform pg_advisory_xact_lock(hashtext('padelon_shift_cash'),p_day_date-date '2000-01-01');
 select * into v_existing from public.cafeteria_shift_handovers where id=p_id;
 if found then
  if v_existing.voided_at is null and v_existing.outgoing_staff_id=auth.uid() and
   v_existing.day_date=p_day_date and v_existing.incoming_staff_id=p_incoming_staff_id and
   v_existing.counted_cash_cents=p_counted_cash_cents and v_existing.notes=v_notes then
    return p_id;
  end if;
  raise exception 'Handover reference already used';
 end if;
 v_snapshot:=public.cafeteria_handover_snapshot(p_day_date,p_opening_cash_cents);
 v_expected:=(v_snapshot->>'expected_cents')::bigint;
 v_previous:=(v_snapshot->>'previous_id')::uuid;
 if v_expected is null then raise exception 'Enter the opening cash for the first check';end if;
 if v_expected is distinct from p_checked_expected_cents or
   (v_snapshot->>'finance_count')::integer is distinct from p_checked_finance_count or
   (v_snapshot->>'private_count')::integer is distinct from p_checked_private_count or
   v_previous is distinct from p_checked_previous_id then
  raise exception 'Ledger entries or an earlier handover changed; calculate the cash again';
 end if;
 insert into public.cafeteria_shift_handovers
 (id,day_date,outgoing_staff_id,incoming_staff_id,previous_handover_id,
  window_start_at,created_at,opening_cash_cents,recorded_income_cents,
  recorded_expenses_cents,expected_cash_cents,counted_cash_cents,
  finance_entry_count,private_entry_count,notes)
 values(p_id,p_day_date,auth.uid(),p_incoming_staff_id,v_previous,
  (v_snapshot->>'window_start_at')::timestamptz,(v_snapshot->>'checked_at')::timestamptz,
  (v_snapshot->>'opening_cash_cents')::bigint,(v_snapshot->>'income_cents')::bigint,
  (v_snapshot->>'expenses_cents')::bigint,v_expected,p_counted_cash_cents,
  (v_snapshot->>'finance_count')::integer,(v_snapshot->>'private_count')::integer,v_notes);
 return p_id;
end$$;

create function public.cafeteria_handover_accept(p_id uuid)
 returns uuid language plpgsql volatile security definer
 set search_path=pg_catalog,public as $$
declare v_record public.cafeteria_shift_handovers%rowtype;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into v_record from public.cafeteria_shift_handovers where id=p_id for update;
 if not found or v_record.voided_at is not null then raise exception 'Handover not found';end if;
 if v_record.incoming_staff_id<>auth.uid() then raise exception 'Only incoming staff can confirm';end if;
 if v_record.accepted_at is not null then return p_id;end if;
 update public.cafeteria_shift_handovers
  set accepted_at=clock_timestamp(),accepted_by=auth.uid() where id=p_id;
 return p_id;
end$$;

create function public.cafeteria_handover_void(p_id uuid,p_reason text)
 returns uuid language plpgsql volatile security definer
 set search_path=pg_catalog,public as $$
declare v_record public.cafeteria_shift_handovers%rowtype;
 v_latest uuid;v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.is_admin() then raise exception 'Administrator access required';end if;
 if p_id is null or char_length(v_reason) not between 4 and 500 then
  raise exception 'Enter a removal reason (4-500 characters)';
 end if;
 select * into v_record from public.cafeteria_shift_handovers where id=p_id for update;
 if not found or v_record.voided_at is not null then raise exception 'Handover not found';end if;
 perform pg_advisory_xact_lock(hashtext('padelon_shift_cash'),v_record.day_date-date '2000-01-01');
 select id into v_latest from public.cafeteria_shift_handovers
  where day_date=v_record.day_date and voided_at is null
  order by created_at desc,id desc limit 1;
 if v_latest is distinct from p_id then
  raise exception 'Only the latest handover can be removed because later counts depend on it';
 end if;
 update public.cafeteria_shift_handovers
  set voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=v_reason where id=p_id;
 return p_id;
end$$;

revoke all on function public.cafeteria_handover_staff_directory() from public,anon;
revoke all on function public.cafeteria_handover_snapshot(date,bigint) from public,anon;
revoke all on function public.cafeteria_handover_record(uuid,date,uuid,bigint,bigint,bigint,integer,integer,uuid,text) from public,anon;
revoke all on function public.cafeteria_handover_accept(uuid) from public,anon;
revoke all on function public.cafeteria_handover_void(uuid,text) from public,anon;
grant execute on function public.cafeteria_handover_staff_directory() to authenticated;
grant execute on function public.cafeteria_handover_snapshot(date,bigint) to authenticated;
grant execute on function public.cafeteria_handover_record(uuid,date,uuid,bigint,bigint,bigint,integer,integer,uuid,text) to authenticated;
grant execute on function public.cafeteria_handover_accept(uuid) to authenticated;
grant execute on function public.cafeteria_handover_void(uuid,text) to authenticated;

