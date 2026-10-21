-- PADEL ON Whish wallet ledger: fully independent of physical cash desk finances.
-- Initial wallet balance: $0.60 USD (60 cents). Never changes on rerun.
begin;
create extension if not exists pgcrypto;

create table if not exists public.whish_wallet_settings (
 id smallint primary key default 1 check(id=1),
 opening_balance_cents bigint not null check(opening_balance_cents between 0 and 100000000000),
 initialized_at timestamptz not null default now()
);
insert into public.whish_wallet_settings(id,opening_balance_cents)
values(1,60) on conflict(id) do nothing;

create table if not exists public.whish_ledger_entries (
 id uuid primary key,
 entry_date date not null,
 entry_type text not null check(entry_type in ('deposit','withdrawal')),
 name text not null check(char_length(btrim(name)) between 1 and 120),
 amount_cents bigint not null check(amount_cents between 1 and 100000000000),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_reason text
);
create index if not exists whish_ledger_entries_date_idx
 on public.whish_ledger_entries(entry_date,created_at,id);
alter table public.whish_wallet_settings enable row level security;
alter table public.whish_ledger_entries enable row level security;
revoke all on public.whish_wallet_settings,public.whish_ledger_entries from anon,authenticated;
grant select on public.whish_wallet_settings,public.whish_ledger_entries to authenticated;

drop policy if exists whish_wallet_staff_read on public.whish_wallet_settings;
create policy whish_wallet_staff_read on public.whish_wallet_settings
 for select to authenticated using(public.is_staff());
drop policy if exists whish_ledger_staff_read on public.whish_ledger_entries;
create policy whish_ledger_staff_read on public.whish_ledger_entries
 for select to authenticated using(public.is_staff());

-- Staff can create multiple independently named deposits or withdrawals each day.
-- Client-side direct table writes are forbidden; all writes go through this audited RPC.
create or replace function public.whish_record_entry(
 p_entry_id uuid,p_entry_date date,p_entry_type text,p_name text,p_amount_cents bigint
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_name text:=btrim(coalesce(p_name,''));
 v_existing public.whish_ledger_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null then raise exception 'Missing Whish entry reference'; end if;
 if p_entry_date is null or p_entry_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Whish date must be today or earlier'; end if;
 if p_entry_type is null or p_entry_type not in ('deposit','withdrawal')
 then raise exception 'Invalid Whish transaction type'; end if;
 if char_length(v_name) not between 1 and 120
 then raise exception 'Enter a name (1 to 120 characters)'; end if;
 if p_amount_cents is null or p_amount_cents not between 1 and 100000000000
 then raise exception 'Enter a positive Whish amount'; end if;
 select * into v_existing from public.whish_ledger_entries where id=p_entry_id;
 if found then
  if v_existing.voided_at is null and v_existing.created_by=auth.uid()
   and v_existing.entry_date=p_entry_date and v_existing.entry_type=p_entry_type
   and v_existing.name=v_name and v_existing.amount_cents=p_amount_cents
  then return p_entry_id; end if;
  raise exception 'Whish entry reference already used';
 end if;
 insert into public.whish_ledger_entries(id,entry_date,entry_type,name,amount_cents,created_by)
 values(p_entry_id,p_entry_date,p_entry_type,v_name,p_amount_cents,auth.uid());
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','whish_ledger_entries',p_entry_id::text,
  jsonb_build_object('date',p_entry_date,'type',p_entry_type,'name',v_name,'amount_cents',p_amount_cents));
 return p_entry_id;
end$$;

-- Administrative corrections retain the record and the correction reason.
create or replace function public.whish_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_previous public.whish_ledger_entries%rowtype;
begin
 if not public.is_admin() then raise exception 'Only administrators can correct Whish entries'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Provide a correction reason (4 to 500 characters)'; end if;
 select * into v_previous from public.whish_ledger_entries where id=p_entry_id for update;
 if not found or v_previous.voided_at is not null
 then raise exception 'Whish entry is missing or already voided'; end if;
 update public.whish_ledger_entries
  set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
  where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','whish_ledger_entries',p_entry_id::text,
  to_jsonb(v_previous),jsonb_build_object('reason',btrim(p_reason)));
end$$;

revoke all on function public.whish_record_entry(uuid,date,text,text,bigint) from public,anon;
revoke all on function public.whish_void_entry(uuid,text) from public,anon;
grant execute on function public.whish_record_entry(uuid,date,text,text,bigint) to authenticated;
grant execute on function public.whish_void_entry(uuid,text) to authenticated;
commit;
