-- PADEL ON: allow cafeteria PREPAID CREDIT without altering existing debt records.
-- Requires the original supabase/migrations/20261016_cafeteria_debts.sql to have been applied.
-- Running this update keeps every existing person, charge, and payment intact.
-- Payments over the amount owed produce a negative signed balance (credit).
-- A new purchase reduces the credit first, then becomes debt if credit is exhausted.

begin;

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
 if not found or not v_person.active then raise exception 'Select an active person'; end if;
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
 perform 1 from public.cafeteria_debt_people where id=v_record.person_id for update;
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


-- Preserve least-privilege RPC access for staff and administrators.
revoke all on function public.cafeteria_record_entry(uuid,uuid,text,bigint,date,text) from public,anon;
revoke all on function public.cafeteria_void_entry(uuid,text) from public,anon;
grant execute on function public.cafeteria_record_entry(uuid,uuid,text,bigint,date,text) to authenticated;
grant execute on function public.cafeteria_void_entry(uuid,text) to authenticated;

commit;
