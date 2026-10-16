-- PADEL ON Cafeteria Debts: independent from private coaching, benefits and matchmaking.
-- Run in the existing Supabase project SQL Editor before using the new Debt page.
-- No names, starting debts or customer personal data are stored in this public file.
begin;

create extension if not exists pgcrypto;

create table if not exists public.cafeteria_debt_people (
 id uuid primary key,
 name text not null check (char_length(btrim(name)) between 2 and 120),
 notes text not null default '' check (char_length(notes)<=500),
 active boolean not null default true,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.cafeteria_debt_entries (
 id uuid primary key,
 person_id uuid not null references public.cafeteria_debt_people(id) on delete restrict,
 entry_type text not null check(entry_type in ('charge','payment')),
 amount_cents bigint not null check(amount_cents between 1 and 100000000000),
 entry_date date not null,
 notes text not null default '' check(char_length(notes)<=500),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 voided_by uuid references auth.users(id),
 void_reason text
);
create index if not exists cafeteria_debt_people_name_idx on public.cafeteria_debt_people(lower(name));
create index if not exists cafeteria_debt_entries_person_date_idx
 on public.cafeteria_debt_entries(person_id,created_at,id) where voided_at is null;

alter table public.cafeteria_debt_people enable row level security;
alter table public.cafeteria_debt_entries enable row level security;

-- Only authorized staff can view. No direct client-side table writes.
revoke all on public.cafeteria_debt_people, public.cafeteria_debt_entries from anon,authenticated;
grant select on public.cafeteria_debt_people,public.cafeteria_debt_entries to authenticated;
drop policy if exists cafeteria_people_read_staff on public.cafeteria_debt_people;
create policy cafeteria_people_read_staff on public.cafeteria_debt_people
 for select to authenticated using(public.is_staff());
drop policy if exists cafeteria_entries_read_staff on public.cafeteria_debt_entries;
create policy cafeteria_entries_read_staff on public.cafeteria_debt_entries
 for select to authenticated using(public.is_staff());

create or replace function public.cafeteria_add_person(
 p_person_id uuid,p_name text,p_initial_debt_cents bigint default 0,
 p_entry_date date default null,p_notes text default ''
) returns uuid language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_date date;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_person_id is null then raise exception 'Missing person reference'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120
 then raise exception 'Name must be between 2 and 120 characters'; end if;
 if char_length(coalesce(p_notes,''))>500 then raise exception 'Notes are too long'; end if;
 if p_initial_debt_cents is null or p_initial_debt_cents<0 or p_initial_debt_cents>100000000000
 then raise exception 'Invalid starting debt'; end if;
 v_date:=coalesce(p_entry_date,(now() at time zone 'Asia/Beirut')::date);
 if v_date>(now() at time zone 'Asia/Beirut')::date then raise exception 'Date cannot be in the future'; end if;
 -- Replaying a successful create is safe; it must never duplicate its initial charge.
 if exists(select 1 from public.cafeteria_debt_people where id=p_person_id) then
   if exists(select 1 from public.cafeteria_debt_people where id=p_person_id and created_by=auth.uid())
   then return p_person_id; end if;
   raise exception 'Person reference already in use';
 end if;
 insert into public.cafeteria_debt_people(id,name,notes,created_by)
 values(p_person_id,btrim(p_name),btrim(coalesce(p_notes,'')),auth.uid());
 if p_initial_debt_cents>0 then
   insert into public.cafeteria_debt_entries(id,person_id,entry_type,amount_cents,entry_date,notes,created_by)
   values(gen_random_uuid(),p_person_id,'charge',p_initial_debt_cents,v_date,'Starting cafeteria debt',auth.uid());
 end if;
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','cafeteria_debt_people',p_person_id::text,
 jsonb_build_object('name',btrim(p_name),'initial_debt_cents',p_initial_debt_cents));
 return p_person_id;
end$$;

create or replace function public.cafeteria_update_person(
 p_person_id uuid,p_name text,p_notes text default '',p_active boolean default true
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_previous public.cafeteria_debt_people%rowtype;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 120
 then raise exception 'Name must be between 2 and 120 characters'; end if;
 if char_length(coalesce(p_notes,''))>500 then raise exception 'Notes too long'; end if;
 select * into v_previous from public.cafeteria_debt_people where id=p_person_id for update;
 if not found then raise exception 'Person not found'; end if;
 update public.cafeteria_debt_people
 set name=btrim(p_name),notes=btrim(coalesce(p_notes,'')),active=coalesce(p_active,true)
 where id=p_person_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','cafeteria_debt_people',p_person_id::text,to_jsonb(v_previous),
 jsonb_build_object('name',btrim(p_name),'active',coalesce(p_active,true)));
end$$;

create or replace function public.cafeteria_record_entry(
 p_entry_id uuid,p_person_id uuid,p_entry_type text,p_amount_cents bigint,
 p_entry_date date,p_notes text default ''
) returns uuid language plpgsql security definer
set search_path=public,pg_temp as $$
declare
 v_person public.cafeteria_debt_people%rowtype;
 v_existing public.cafeteria_debt_entries%rowtype;
 v_owed bigint;
begin
 if not public.is_staff() then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null or p_person_id is null then raise exception 'Missing reference'; end if;
 if p_entry_type not in ('charge','payment') then raise exception 'Invalid transaction type'; end if;
 if p_entry_date is null or p_entry_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Date must be today or earlier (Beirut time)'; end if;
 if p_amount_cents is null or p_amount_cents not between 1 and 100000000000
 then raise exception 'Enter a positive amount'; end if;
 if char_length(coalesce(p_notes,''))>500 then raise exception 'Notes too long'; end if;
 -- Serialize transactions for the same person, including concurrent payments by staff.
 select * into v_person from public.cafeteria_debt_people where id=p_person_id for update;
 if not found or not v_person.active then raise exception 'Select an active person'; end if;
 select * into v_existing from public.cafeteria_debt_entries where id=p_entry_id;
 if found then
   if v_existing.created_by=auth.uid() and v_existing.person_id=p_person_id
     and v_existing.entry_type=p_entry_type and v_existing.amount_cents=p_amount_cents
     and v_existing.entry_date=p_entry_date and v_existing.voided_at is null
   then return p_entry_id; end if;
   raise exception 'Transaction reference already used';
 end if;
 if p_entry_type='payment' then
   select coalesce(sum(case when entry_type='charge' then amount_cents else -amount_cents end),0)
   into v_owed from public.cafeteria_debt_entries
   where person_id=p_person_id and voided_at is null;
   if p_amount_cents>v_owed
   then raise exception 'Payment exceeds outstanding cafeteria debt'; end if;
 end if;
 insert into public.cafeteria_debt_entries(id,person_id,entry_type,amount_cents,entry_date,notes,created_by)
 values(p_entry_id,p_person_id,p_entry_type,p_amount_cents,p_entry_date,btrim(coalesce(p_notes,'')),auth.uid());
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','cafeteria_debt_entries',p_entry_id::text,
 jsonb_build_object('person_id',p_person_id,'entry_type',p_entry_type,
  'amount_cents',p_amount_cents,'entry_date',p_entry_date));
 return p_entry_id;
end$$;

create or replace function public.cafeteria_void_entry(
 p_entry_id uuid,p_reason text
) returns void language plpgsql security definer
set search_path=public,pg_temp as $$
declare v_record public.cafeteria_debt_entries%rowtype; v_owed bigint;
begin
 if not public.is_admin() then raise exception 'Only administrators can correct cafeteria entries'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Explain the correction (at least 4 characters)'; end if;
 select * into v_record from public.cafeteria_debt_entries where id=p_entry_id;
 if not found or v_record.voided_at is not null then raise exception 'Entry not found or already voided'; end if;
 -- Use the same person lock as record_entry so no payment can race a correction.
 perform 1 from public.cafeteria_debt_people where id=v_record.person_id for update;
 select * into v_record from public.cafeteria_debt_entries where id=p_entry_id for update;
 if v_record.voided_at is not null then raise exception 'Entry already voided'; end if;
 -- Voiding a charge cannot leave more payments than valid charges.
 if v_record.entry_type='charge' then
   select coalesce(sum(case when entry_type='charge' then amount_cents else -amount_cents end),0)
   into v_owed from public.cafeteria_debt_entries
   where person_id=v_record.person_id and voided_at is null;
   if v_owed<v_record.amount_cents
   then raise exception 'Cannot void this charge while payments exceed remaining charges. Correct the later payments first'; end if;
 end if;
 update public.cafeteria_debt_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
 where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','cafeteria_debt_entries',p_entry_id::text,to_jsonb(v_record),
 jsonb_build_object('reason',btrim(p_reason)));
end$$;

revoke all on function public.cafeteria_add_person(uuid,text,bigint,date,text) from public,anon;
revoke all on function public.cafeteria_update_person(uuid,text,text,boolean) from public,anon;
revoke all on function public.cafeteria_record_entry(uuid,uuid,text,bigint,date,text) from public,anon;
revoke all on function public.cafeteria_void_entry(uuid,text) from public,anon;
grant execute on function public.cafeteria_add_person(uuid,text,bigint,date,text) to authenticated;
grant execute on function public.cafeteria_update_person(uuid,text,text,boolean) to authenticated;
grant execute on function public.cafeteria_record_entry(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.cafeteria_void_entry(uuid,text) to authenticated;
commit;
