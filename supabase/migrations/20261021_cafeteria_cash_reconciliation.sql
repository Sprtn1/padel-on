-- Daily cash drawer reconciliation and per-player paid checks for existing Cafeteria Finances.
-- Cash is a daily snapshot; changes are audited. Existing transactions are not touched.
begin;

-- Upgrade any older basketball bookings from four markers to six, preserving the first four.
alter table public.cafeteria_finance_entries
 drop constraint if exists cafeteria_finance_entries_checkmarks_check;
update public.cafeteria_finance_entries
 set checkmarks=checkmarks||array[false,false]
 where category='basketball_courts' and array_length(checkmarks,1)=4;
alter table public.cafeteria_finance_entries
 add constraint cafeteria_finance_player_markers_size_check
 check (array_ndims(checkmarks)=1 and array_position(checkmarks,null) is null and
  array_length(checkmarks,1)=case when category='basketball_courts' then 6 else 4 end);

create table if not exists public.cafeteria_finance_days(
 day_date date primary key,
 closing_cash_cents bigint not null check(closing_cash_cents between 0 and 100000000000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id)
);
alter table public.cafeteria_finance_days enable row level security;
revoke all on public.cafeteria_finance_days from anon,authenticated;
grant select on public.cafeteria_finance_days to authenticated;
drop policy if exists cafeteria_finance_days_staff_read on public.cafeteria_finance_days;
create policy cafeteria_finance_days_staff_read on public.cafeteria_finance_days
 for select to authenticated using(public.is_staff());

create or replace function public.cafeteria_finance_set_closing_cash(
 p_day_date date,p_closing_cash_cents bigint
) returns date language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_previous public.cafeteria_finance_days%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_day_date is null or p_day_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Date must be today or earlier'; end if;
 if p_closing_cash_cents is null or p_closing_cash_cents not between 0 and 100000000000
 then raise exception 'Enter a non-negative closing cash amount'; end if;
 -- Same-day writes serialize so simultaneous staff updates do not silently skip one.
 perform pg_advisory_xact_lock(hashtext('cafeteria_finance_days'),p_day_date - date '2000-01-01');
 select * into v_previous from public.cafeteria_finance_days where day_date=p_day_date for update;
 if found and v_previous.closing_cash_cents=p_closing_cash_cents then return p_day_date; end if;
 insert into public.cafeteria_finance_days(day_date,closing_cash_cents,created_by,updated_by)
 values(p_day_date,p_closing_cash_cents,auth.uid(),auth.uid())
 on conflict(day_date) do update set closing_cash_cents=excluded.closing_cash_cents,
    updated_at=now(),updated_by=auth.uid();
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),case when v_previous.day_date is null then 'CREATE' else 'UPDATE' end,
 'cafeteria_finance_days',p_day_date::text,
 case when v_previous.day_date is null then null
      else jsonb_build_object('closing_cash_cents',v_previous.closing_cash_cents) end,
 jsonb_build_object('closing_cash_cents',p_closing_cash_cents));
 return p_day_date;
end;$$;

-- Existing staff-only entry functions, updated to support six Basketball players.
create or replace function public.cafeteria_finance_record_entry(
  p_entry_id uuid,p_entry_date date,p_category text,p_name text,
  p_amount_cents bigint,p_quantity integer,p_unit_price_cents bigint,
  p_checkmarks boolean[]
) returns uuid language plpgsql security definer
set search_path=public,pg_temp as $$
declare
 v_date date:=(now() at time zone 'Asia/Beirut')::date;
 v_existing public.cafeteria_finance_entries%rowtype;
 v_name text:=btrim(coalesce(p_name,''));
 v_markers boolean[]:=coalesce(p_checkmarks,array[false,false,false,false]);
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null then raise exception 'Missing entry ID'; end if;
 if p_entry_date is null or p_entry_date>v_date then raise exception 'Choose today or an earlier date'; end if;
 if p_category is null or p_category not in (
   'padel_courts','pickleball_courts','basketball_courts',
   'grips','balls','racket_rental','gymnastics','classes','pt_gym','other_income',
   'general_payment','coaches','cafeteria_stock','other_expense')
 then raise exception 'Invalid category'; end if;
 if char_length(v_name)>120 then raise exception 'Entry name is too long'; end if;
 if p_category in ('padel_courts','pickleball_courts','basketball_courts','other_income','other_expense')
    and char_length(v_name)<1 then raise exception 'Enter a name or description'; end if;
 if p_amount_cents is null or p_amount_cents not between 1 and 100000000000
   then raise exception 'Amount must be positive'; end if;
 if p_quantity is null or p_quantity not between 1 and 9999
   then raise exception 'Quantity must be between 1 and 9999'; end if;
 if p_unit_price_cents is null or p_unit_price_cents not between 0 and 100000000000
   then raise exception 'Invalid unit price'; end if;
 if array_ndims(v_markers)<>1 or array_length(v_markers,1)<>case when p_category='basketball_courts' then 6 else 4 end or array_position(v_markers,null) is not null
   then raise exception 'Incorrect number of player payment markers'; end if;
 if p_category in ('grips','balls','racket_rental') then
   if p_unit_price_cents<1 or p_amount_cents<>p_quantity*p_unit_price_cents
   then raise exception 'Sale quantity and unit price do not match total'; end if;
   if p_category='racket_rental' and p_unit_price_cents<>200
   then raise exception 'Racket rental is fixed at $2.00 each'; end if;
 else
   if p_quantity<>1 or p_unit_price_cents<>0 then raise exception 'Invalid quantity or price for this category'; end if;
 end if;
 if p_category not in ('padel_courts','pickleball_courts','basketball_courts') and
    v_markers<>array[false,false,false,false]
   then raise exception 'Four markers are only available for court bookings'; end if;
 select * into v_existing from public.cafeteria_finance_entries where id=p_entry_id;
 if found then
   if v_existing.created_by=auth.uid() and v_existing.entry_date=p_entry_date and
      v_existing.category=p_category and v_existing.name=v_name and
      v_existing.amount_cents=p_amount_cents and v_existing.quantity=p_quantity and
      v_existing.unit_price_cents=p_unit_price_cents and v_existing.voided_at is null
     then return p_entry_id; end if;
   raise exception 'Entry ID already used';
 end if;
 insert into public.cafeteria_finance_entries(
   id,entry_date,category,name,amount_cents,quantity,unit_price_cents,checkmarks,created_by)
 values(p_entry_id,p_entry_date,p_category,v_name,p_amount_cents,p_quantity,p_unit_price_cents,v_markers,auth.uid());
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('date',p_entry_date,'category',p_category,'name',v_name,'amount_cents',p_amount_cents,
    'quantity',p_quantity,'unit_price_cents',p_unit_price_cents,'markers',v_markers));
 return p_entry_id;
end;$$;

create or replace function public.cafeteria_finance_set_marks(
 p_entry_id uuid,p_checkmarks boolean[]
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_previous public.cafeteria_finance_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 select * into v_previous from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then raise exception 'Entry not found'; end if;
 if p_checkmarks is null or array_ndims(p_checkmarks)<>1
   or array_length(p_checkmarks,1)<>case when v_previous.category='basketball_courts' then 6 else 4 end
   or array_position(p_checkmarks,null) is not null
   then raise exception 'Incorrect number of player payment markers'; end if;
 if v_previous.category not in ('padel_courts','pickleball_courts','basketball_courts')
 then raise exception 'Markers are only for court bookings'; end if;
 if v_previous.checkmarks=p_checkmarks then return; end if;
 update public.cafeteria_finance_entries set checkmarks=p_checkmarks where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
   jsonb_build_object('markers',v_previous.checkmarks),jsonb_build_object('markers',p_checkmarks));
end;$$;

revoke all on function public.cafeteria_finance_set_closing_cash(date,bigint) from public,anon;
grant execute on function public.cafeteria_finance_set_closing_cash(date,bigint) to authenticated;
commit;
