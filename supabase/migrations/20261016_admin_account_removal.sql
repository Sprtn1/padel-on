-- PADEL ON — reversible admin-only account removal.
-- Run AFTER private coaching and cafeteria (including prepaid-credit) migrations.
-- Keeps all session, balance, purchase and payment records; no destructive deletes.
-- Removal allowed ONLY if the person's signed balance is exactly zero.
begin;

alter table public.private_clients add column if not exists deleted_at timestamptz;
alter table public.private_clients add column if not exists deleted_by uuid references auth.users(id);
alter table public.private_clients add column if not exists delete_reason text;
alter table public.cafeteria_debt_people add column if not exists deleted_at timestamptz;
alter table public.cafeteria_debt_people add column if not exists deleted_by uuid references auth.users(id);
alter table public.cafeteria_debt_people add column if not exists delete_reason text;

create or replace function public.private_set_client_removed(
 p_client_id uuid,p_remove boolean,p_reason text default ''
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_client public.private_clients%rowtype; v_balance bigint;
begin
 if not public.is_admin() then raise exception 'Only administrators may remove or restore private clients'; end if;
 if p_client_id is null or p_remove is null then raise exception 'Missing client or action'; end if;
 if p_remove and length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Provide a removal reason (4 to 500 characters)'; end if;
 select * into v_client from public.private_clients where id=p_client_id for update;
 if not found then raise exception 'Client not found'; end if;
 if p_remove then
  if v_client.deleted_at is not null then raise exception 'Client already removed'; end if;
  select v_client.opening_balance_cents +
    coalesce(sum(deposit_cents+paid_cents-session_fee_cents),0)
   into v_balance
   from public.private_ledger_entries
   where client_id=p_client_id and voided_at is null;
  if v_balance<>0 then raise exception 'Cannot remove: client credit/debt must be exactly zero'; end if;
  update public.private_clients set
   deleted_at=now(),deleted_by=auth.uid(),delete_reason=btrim(p_reason),active=false
   where id=p_client_id;
 else
  if v_client.deleted_at is null then raise exception 'Client is not removed'; end if;
  update public.private_clients set
   deleted_at=null,deleted_by=null,delete_reason=null,active=true
   where id=p_client_id;
 end if;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),case when p_remove then 'REMOVE' else 'RESTORE' end,
 'private_clients',p_client_id::text,
 jsonb_build_object('client_id',p_client_id,'previously_removed',v_client.deleted_at is not null),
 jsonb_build_object('removed',p_remove,'reason',btrim(coalesce(p_reason,''))));
end$$;

create or replace function public.cafeteria_set_person_removed(
 p_person_id uuid,p_remove boolean,p_reason text default ''
) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_person public.cafeteria_debt_people%rowtype; v_balance bigint;
begin
 if not public.is_admin() then raise exception 'Only administrators may remove or restore cafeteria accounts'; end if;
 if p_person_id is null or p_remove is null then raise exception 'Missing person or action'; end if;
 if p_remove and length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Provide a removal reason (4 to 500 characters)'; end if;
 select * into v_person from public.cafeteria_debt_people where id=p_person_id for update;
 if not found then raise exception 'Cafeteria account not found'; end if;
 if p_remove then
  if v_person.deleted_at is not null then raise exception 'Account already removed'; end if;
  select coalesce(sum(case when entry_type='charge' then amount_cents else -amount_cents end),0)
  into v_balance
  from public.cafeteria_debt_entries
  where person_id=p_person_id and voided_at is null;
  if v_balance<>0 then raise exception 'Cannot remove: cafeteria debt/credit must be exactly zero'; end if;
  update public.cafeteria_debt_people set
   deleted_at=now(),deleted_by=auth.uid(),delete_reason=btrim(p_reason),active=false
   where id=p_person_id;
 else
  if v_person.deleted_at is null then raise exception 'Account is not removed'; end if;
  update public.cafeteria_debt_people set
   deleted_at=null,deleted_by=null,delete_reason=null,active=true
   where id=p_person_id;
 end if;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),case when p_remove then 'REMOVE' else 'RESTORE' end,
 'cafeteria_debt_people',p_person_id::text,
 jsonb_build_object('person_id',p_person_id,'previously_removed',v_person.deleted_at is not null),
 jsonb_build_object('removed',p_remove,'reason',btrim(coalesce(p_reason,''))));
end$$;

-- Original staff insert/edit/correction RPCs also enforce removal status.
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
 where id=p_client_id and deleted_at is null;
 if not found then raise exception 'Client not found'; end if;
end$$;

create or replace function public.private_log_entry(
 p_entry_id uuid,p_client_id uuid,p_entry_type text,p_entry_date date,
 p_coach_id uuid default null,p_session_fee_cents bigint default 0,
 p_paid_cents bigint default 0,p_deposit_cents bigint default 0,p_notes text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_existing public.private_ledger_entries%rowtype; v_client public.private_clients%rowtype;
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
 select * into v_client from public.private_clients where id=p_client_id for update;
 if not found or not v_client.active or v_client.deleted_at is not null then raise exception 'Client is inactive or removed'; end if;
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
declare v_client_id uuid;
begin
 if not public.is_admin() then raise exception 'Only administrators can void financial entries'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500 then raise exception 'A correction reason is required'; end if;
 select client_id into v_client_id from public.private_ledger_entries where id=p_entry_id and voided_at is null;
 if not found then raise exception 'Entry not found or already voided'; end if;
 perform 1 from public.private_clients where id=v_client_id and deleted_at is null for update;
 if not found then raise exception 'Restore removed client before correcting their transactions'; end if;
 update public.private_ledger_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
 where id=p_entry_id and voided_at is null;
 if not found then raise exception 'Entry not found or already voided'; end if;
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
 if v_previous.deleted_at is not null then raise exception 'Restore removed account before editing'; end if;
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
 if not found or not v_person.active or v_person.deleted_at is not null then raise exception 'Select an active, non-removed person'; end if;
 select * into v_existing from public.cafeteria_debt_entries where id=p_entry_id;
 if found then
   if v_existing.created_by=auth.uid() and v_existing.person_id=p_person_id
     and v_existing.entry_type=p_entry_type and v_existing.amount_cents=p_amount_cents
     and v_existing.entry_date=p_entry_date and v_existing.voided_at is null
   then return p_entry_id; end if;
   raise exception 'Transaction reference already used';
 end if;
 -- Payments can exceed the amount due; the remaining amount becomes prepaid credit.
 -- The existing per-person row lock still serializes concurrent transactions.
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
declare v_record public.cafeteria_debt_entries%rowtype;
begin
 if not public.is_admin() then raise exception 'Only administrators can correct cafeteria entries'; end if;
 if char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'Explain the correction (at least 4 characters)'; end if;
 select * into v_record from public.cafeteria_debt_entries where id=p_entry_id;
 if not found or v_record.voided_at is not null then raise exception 'Entry not found or already voided'; end if;
 -- Use the same person lock as record_entry so no payment can race a correction.
 perform 1 from public.cafeteria_debt_people where id=v_record.person_id and deleted_at is null for update;
 if not found then raise exception 'Restore removed account before correcting transactions'; end if;
 select * into v_record from public.cafeteria_debt_entries where id=p_entry_id for update;
 if v_record.voided_at is not null then raise exception 'Entry already voided'; end if;
 -- A void may create prepaid credit, so no prohibition on negative balances.
 -- Original record, reason, and actor stay preserved in the audit trail.
 update public.cafeteria_debt_entries set voided_at=now(),voided_by=auth.uid(),void_reason=btrim(p_reason)
 where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','cafeteria_debt_entries',p_entry_id::text,to_jsonb(v_record),
 jsonb_build_object('reason',btrim(p_reason)));
end$$;

revoke all on function public.private_set_client_removed(uuid,boolean,text) from public,anon;
revoke all on function public.cafeteria_set_person_removed(uuid,boolean,text) from public,anon;
grant execute on function public.private_set_client_removed(uuid,boolean,text) to authenticated;
grant execute on function public.cafeteria_set_person_removed(uuid,boolean,text) to authenticated;
-- Existing grants are maintained when replacing the functions, but reaffirm for safety.
grant execute on function public.private_update_client(uuid,text,text,text,text,boolean) to authenticated;
grant execute on function public.private_log_entry(uuid,uuid,text,date,uuid,bigint,bigint,bigint,text) to authenticated;
grant execute on function public.private_void_entry(uuid,text) to authenticated;
grant execute on function public.cafeteria_update_person(uuid,text,text,boolean) to authenticated;
grant execute on function public.cafeteria_record_entry(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.cafeteria_void_entry(uuid,text) to authenticated;
commit;
