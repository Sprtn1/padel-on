-- PADEL ON: Private coaching client ledger. Public structural migration only.
-- Run in the existing Supabase project's SQL Editor. Do not put client names/data here.
-- This migration does not modify existing team benefits, training, or matchmaking.

begin;
create extension if not exists pgcrypto;

create table if not exists public.private_coaches (
 id uuid primary key default gen_random_uuid(),
 name text not null unique check (char_length(btrim(name)) between 2 and 100),
 category text not null check (category in ('A','B','C')),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

create table if not exists public.private_clients (
 id uuid primary key default gen_random_uuid(),
 client_code text,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 contact text not null default '' check (char_length(contact) <= 120),
 notes text not null default '' check (char_length(notes) <= 500),
 opening_balance_cents bigint not null default 0 check(opening_balance_cents between -100000000000 and 100000000000),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 constraint private_client_code_length check (client_code is null or char_length(client_code) between 1 and 40)
);
create unique index if not exists private_clients_code_ci_unique on public.private_clients (upper(client_code)) where client_code is not null;

create table if not exists public.private_ledger_entries (
 id uuid primary key,
 client_id uuid not null references public.private_clients(id) on delete restrict,
 entry_type text not null check(entry_type in ('session','deposit')),
 entry_date date not null,
 coach_id uuid references public.private_coaches(id) on delete restrict,
 session_fee_cents bigint not null default 0 check(session_fee_cents between 0 and 100000000000),
 paid_cents bigint not null default 0 check(paid_cents between 0 and 100000000000),
 deposit_cents bigint not null default 0 check(deposit_cents between 0 and 100000000000),
 notes text not null default '' check(char_length(notes)<=500),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_reason text,
 constraint private_entry_type_fields check (
   (entry_type='session' and coach_id is not null and deposit_cents=0)
   or
   (entry_type='deposit' and coach_id is null and deposit_cents>0 and session_fee_cents=0 and paid_cents=0)
 )
);
create index if not exists private_entries_client_idx on public.private_ledger_entries(client_id,entry_date desc) where voided_at is null;
create index if not exists private_entries_coach_idx on public.private_ledger_entries(coach_id,entry_date desc) where voided_at is null;

alter table public.private_coaches enable row level security;
alter table public.private_clients enable row level security;
alter table public.private_ledger_entries enable row level security;
-- Read-only from PostgREST. All writes must pass authorization and validation in RPCs.
revoke all on public.private_coaches,public.private_clients,public.private_ledger_entries from anon,authenticated;
grant select on public.private_coaches,public.private_clients,public.private_ledger_entries to authenticated;
drop policy if exists private_coaches_staff_read on public.private_coaches;
create policy private_coaches_staff_read on public.private_coaches for select to authenticated using(public.is_staff());
drop policy if exists private_clients_staff_read on public.private_clients;
create policy private_clients_staff_read on public.private_clients for select to authenticated using(public.is_staff());
drop policy if exists private_entries_staff_read on public.private_ledger_entries;
create policy private_entries_staff_read on public.private_ledger_entries for select to authenticated using(public.is_staff());

drop trigger if exists private_client_audit on public.private_clients;
create trigger private_client_audit after insert or update on public.private_clients
 for each row execute function public.audit_change();
drop trigger if exists private_entry_audit on public.private_ledger_entries;
create trigger private_entry_audit after insert or update on public.private_ledger_entries
 for each row execute function public.audit_change();

-- Opening balances can be entered when creating the client but never edited later.
-- Corrections to opening balances should use a separately dated ledger adjustment
-- approved and recorded according to your operational policy.
create or replace function public.private_add_client(
 p_name text, p_client_code text default null, p_contact text default '',
 p_opening_balance_cents bigint default 0, p_notes text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Name must be 2–120 characters'; end if;
 if char_length(btrim(coalesce(p_client_code,'')))>40 then raise exception 'Client ID too long'; end if;
 if char_length(coalesce(p_contact,''))>120 or char_length(coalesce(p_notes,''))>500 then raise exception 'Contact or notes too long'; end if;
 if p_opening_balance_cents is null or p_opening_balance_cents not between -100000000000 and 100000000000
 then raise exception 'Invalid starting balance'; end if;
 insert into public.private_clients(name,client_code,contact,opening_balance_cents,notes,created_by)
 values(btrim(p_name),nullif(upper(btrim(p_client_code)),''),btrim(coalesce(p_contact,'')),p_opening_balance_cents,btrim(coalesce(p_notes,'')),auth.uid())
 returning id into v_id;
 return v_id;
end$$;

create or replace function public.private_update_client(
 p_client_id uuid, p_name text, p_client_code text default null,
 p_contact text default '',p_notes text default '',p_active boolean default true
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Invalid client name'; end if;
 if char_length(btrim(coalesce(p_client_code,'')))>40 or char_length(coalesce(p_contact,''))>120 or char_length(coalesce(p_notes,''))>500
 then raise exception 'Field too long'; end if;
 update public.private_clients set
 name=btrim(p_name),client_code=nullif(upper(btrim(p_client_code)),''),contact=btrim(coalesce(p_contact,'')),notes=btrim(coalesce(p_notes,'')),active=coalesce(p_active,true)
 where id=p_client_id;
 if not found then raise exception 'Client not found'; end if;
end$$;

create or replace function public.private_log_entry(
 p_entry_id uuid,p_client_id uuid,p_entry_type text,p_entry_date date,
 p_coach_id uuid default null,p_session_fee_cents bigint default 0,
 p_paid_cents bigint default 0,p_deposit_cents bigint default 0,p_notes text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.private_ledger_entries%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null or p_client_id is null then raise exception 'Missing record reference'; end if;
 if p_entry_date is null or p_entry_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Date must be today or earlier (Beirut time)'; end if;
 if char_length(coalesce(p_notes,''))>500 then raise exception 'Notes too long'; end if;
 if p_entry_type not in ('session','deposit') then raise exception 'Invalid entry type'; end if;
 if coalesce(p_session_fee_cents,-1)<0 or coalesce(p_paid_cents,-1)<0 or coalesce(p_deposit_cents,-1)<0
 or p_session_fee_cents>100000000000 or p_paid_cents>100000000000 or p_deposit_cents>100000000000
 then raise exception 'Invalid monetary amount'; end if;
 if not exists(select 1 from public.private_clients where id=p_client_id and active) then raise exception 'Client not active'; end if;
 if p_entry_type='session' then
  if p_coach_id is null or p_deposit_cents<>0 or not exists(select 1 from public.private_coaches where id=p_coach_id and active)
  then raise exception 'Choose a valid coach'; end if;
 else
  if p_coach_id is not null or p_session_fee_cents<>0 or p_paid_cents<>0 or p_deposit_cents<=0
  then raise exception 'Top-up must have a positive deposit only'; end if;
 end if;
 select * into v_existing from public.private_ledger_entries where id=p_entry_id;
 if found then
   if v_existing.created_by=auth.uid() and v_existing.voided_at is null then return p_entry_id; end if;
   raise exception 'Reference already in use';
 end if;
 insert into public.private_ledger_entries(id,client_id,entry_type,entry_date,coach_id,session_fee_cents,paid_cents,deposit_cents,notes,created_by)
 values(p_entry_id,p_client_id,p_entry_type,p_entry_date,p_coach_id,p_session_fee_cents,p_paid_cents,p_deposit_cents,btrim(coalesce(p_notes,'')),auth.uid());
 return p_entry_id;
end$$;

create or replace function public.private_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.is_admin() then raise exception 'Only administrators can void financial entries'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'A correction reason is required'; end if;
 update public.private_ledger_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
 where id=p_entry_id and voided_at is null;
 if not found then raise exception 'Entry not found or already voided'; end if;
end$$;

revoke all on function public.private_add_client(text,text,text,bigint,text) from public,anon;
revoke all on function public.private_update_client(uuid,text,text,text,text,boolean) from public,anon;
revoke all on function public.private_log_entry(uuid,uuid,text,date,uuid,bigint,bigint,bigint,text) from public,anon;
revoke all on function public.private_void_entry(uuid,text) from public,anon;
grant execute on function public.private_add_client(text,text,text,bigint,text) to authenticated;
grant execute on function public.private_update_client(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.private_log_entry(uuid,uuid,text,date,uuid,bigint,bigint,bigint,text) to authenticated;
grant execute on function public.private_void_entry(uuid,text) to authenticated;
commit;
