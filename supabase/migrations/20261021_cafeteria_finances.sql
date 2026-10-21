-- PADEL ON Cafeteria Finances: daily cashbook, independent of debts and other ledgers.
-- Deploy to the existing PADEL ON Supabase project. Figures are stored in integer USD cents.
begin;
create extension if not exists pgcrypto;

create table if not exists public.cafeteria_finance_entries (
  id uuid primary key,
  entry_date date not null,
  category text not null check(category in (
    'padel_courts','pickleball_courts','basketball_courts',
    'grips','balls','racket_rental','gymnastics','classes','pt_gym','other_income',
    'general_payment','coaches','cafeteria_stock','other_expense')),
  name text not null default '' check(char_length(name)<=120),
  amount_cents bigint not null check(amount_cents between 1 and 100000000000),
  quantity integer not null default 1 check(quantity between 1 and 9999),
  unit_price_cents bigint not null default 0 check(unit_price_cents between 0 and 100000000000),
  checkmarks boolean[] not null default array[false,false,false,false]
    check(array_length(checkmarks,1)=4 and array_position(checkmarks,null) is null),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users(id),
  void_reason text,
  constraint cafeteria_finance_named_income check(
    category not in ('padel_courts','pickleball_courts','basketball_courts','other_income','other_expense')
    or length(btrim(name))>0),
  constraint cafeteria_finance_sale_amount check(
    category not in ('grips','balls','racket_rental')
    or amount_cents=quantity*unit_price_cents),
  constraint cafeteria_finance_rental_price check(
    category<>'racket_rental' or unit_price_cents=200)
);
create index if not exists cafeteria_finance_entries_date_idx
  on public.cafeteria_finance_entries(entry_date,created_at,id);
alter table public.cafeteria_finance_entries enable row level security;
revoke all on public.cafeteria_finance_entries from anon,authenticated;
grant select on public.cafeteria_finance_entries to authenticated;
drop policy if exists cafeteria_finance_staff_read on public.cafeteria_finance_entries;
create policy cafeteria_finance_staff_read on public.cafeteria_finance_entries
  for select to authenticated using(public.is_staff());

-- No direct client writes. This staff-only function normalizes, validates and audits entry creation.
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
 if array_ndims(v_markers)<>1 or array_length(v_markers,1)<>4 or array_position(v_markers,null) is not null
   then raise exception 'Exactly four markers are required'; end if;
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
end$$;

create or replace function public.cafeteria_finance_set_marks(
 p_entry_id uuid,p_checkmarks boolean[]
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_previous public.cafeteria_finance_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if array_ndims(p_checkmarks)<>1 or array_length(p_checkmarks,1)<>4
   or array_position(p_checkmarks,null) is not null
   then raise exception 'Exactly four markers are required'; end if;
 select * into v_previous from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then raise exception 'Entry not found'; end if;
 if v_previous.category not in ('padel_courts','pickleball_courts','basketball_courts')
 then raise exception 'Markers are only for court bookings'; end if;
 if v_previous.checkmarks=p_checkmarks then return; end if;
 update public.cafeteria_finance_entries set checkmarks=p_checkmarks where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
   jsonb_build_object('markers',v_previous.checkmarks),jsonb_build_object('markers',p_checkmarks));
end$$;

-- Corrections preserve history; only admins may void, with a recorded explanation.
create or replace function public.cafeteria_finance_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_previous public.cafeteria_finance_entries%rowtype;
begin
 if not public.is_admin() then raise exception 'Administrators only'; end if;
 if length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Enter a correction reason (4 to 500 characters)'; end if;
 select * into v_previous from public.cafeteria_finance_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null then raise exception 'Entry already voided or not found'; end if;
 update public.cafeteria_finance_entries
 set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason) where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','cafeteria_finance_entries',p_entry_id::text,
   to_jsonb(v_previous),jsonb_build_object('reason',btrim(p_reason)));
end$$;

revoke all on function public.cafeteria_finance_record_entry(uuid,date,text,text,bigint,integer,bigint,boolean[]) from public,anon;
revoke all on function public.cafeteria_finance_set_marks(uuid,boolean[]) from public,anon;
revoke all on function public.cafeteria_finance_void_entry(uuid,text) from public,anon;
grant execute on function public.cafeteria_finance_record_entry(uuid,date,text,text,bigint,integer,bigint,boolean[]) to authenticated;
grant execute on function public.cafeteria_finance_set_marks(uuid,boolean[]) to authenticated;
grant execute on function public.cafeteria_finance_void_entry(uuid,text) to authenticated;
commit;
