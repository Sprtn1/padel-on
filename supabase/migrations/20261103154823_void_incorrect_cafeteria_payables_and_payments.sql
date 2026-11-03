-- Applied to Supabase on 2026-11-03. Preserve audit trail for admin corrections.
-- Admin-only correction of mistaken cafeteria obligations or payment installments.
-- Only the new payable tracker is touched. Original records remain for audit.
alter table public.cafeteria_payables
 add column if not exists voided_at timestamptz,
 add column if not exists voided_by uuid references auth.users(id),
 add column if not exists void_reason text;
alter table public.cafeteria_payable_payments
 add column if not exists voided_at timestamptz,
 add column if not exists voided_by uuid references auth.users(id),
 add column if not exists void_reason text;

-- Lock the parent before changing any child or accepting a new payment.
-- This prevents a payment racing a removal or a payment correction.
create or replace function public.cafeteria_void_payable_entry(
 p_kind text, p_id uuid, p_reason text default 'Incorrect entry'
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_parent_id uuid;
 v_payable public.cafeteria_payables%rowtype;
 v_reason text:=btrim(coalesce(p_reason,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can remove cafeteria payment entries';
 end if;
 if p_id is null or p_kind not in ('payable','payment') then raise exception 'Invalid entry reference'; end if;
 if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
  raise exception 'Enter a reason between 3 and 500 characters';
 end if;
 if p_kind='payable' then
  select * into v_payable from public.cafeteria_payables where id=p_id for update;
  if not found then raise exception 'Obligation not found'; end if;
  if v_payable.voided_at is not null then return p_id; end if;
  update public.cafeteria_payables
   set voided_at=now(),voided_by=auth.uid(),void_reason=v_reason
   where id=p_id;
  update public.cafeteria_payable_payments
   set voided_at=now(),voided_by=auth.uid(),void_reason='Obligation removed: '||left(v_reason,470)
   where payable_id=p_id and voided_at is null;
 else
  select payable_id into v_parent_id from public.cafeteria_payable_payments where id=p_id;
  if not found then raise exception 'Payment not found'; end if;
  select * into v_payable from public.cafeteria_payables where id=v_parent_id for update;
  if not found or v_payable.voided_at is not null then raise exception 'Obligation has been removed'; end if;
  update public.cafeteria_payable_payments
   set voided_at=now(),voided_by=auth.uid(),void_reason=v_reason
   where id=p_id and voided_at is null;
  if not found then raise exception 'Payment already removed or missing'; end if;
 end if;
 return p_id;
end$$;
revoke all on function public.cafeteria_void_payable_entry(text,uuid,text) from public,anon;
grant execute on function public.cafeteria_void_payable_entry(text,uuid,text) to authenticated;

-- Original insertion RPC now excludes removed installments from the balance,
-- and cannot append payments to an obligation that was removed.
create or replace function public.cafeteria_record_payable_payment(
 p_id uuid, p_payable_id uuid, p_amount_cents bigint, p_paid_on date, p_notes text default ''
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_payable public.cafeteria_payables%rowtype;
 v_existing public.cafeteria_payable_payments%rowtype;
 v_paid bigint;
 v_notes text := btrim(coalesce(p_notes,''));
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can record cafeteria payments';
 end if;
 if p_id is null or p_payable_id is null then raise exception 'Missing payment reference'; end if;
 if p_amount_cents is null or p_amount_cents < 1 or p_amount_cents > 100000000000 then
  raise exception 'Enter a valid payment amount';
 end if;
 if p_paid_on is null or p_paid_on > (now() at time zone 'Asia/Beirut')::date then
  raise exception 'Payment date must be today or earlier';
 end if;
 if char_length(v_notes) > 500 then raise exception 'Notes must be 500 characters or fewer'; end if;

 select * into v_payable from public.cafeteria_payables where id=p_payable_id for update;
 if not found then raise exception 'Payable not found'; end if;
 if v_payable.voided_at is not null then raise exception 'This obligation has been removed'; end if;
 select * into v_existing from public.cafeteria_payable_payments where id=p_id;
 if found then
  if v_existing.voided_at is not null then raise exception 'Payment reference was removed'; end if;
  if v_existing.payable_id=p_payable_id and v_existing.amount_cents=p_amount_cents
     and v_existing.paid_on=p_paid_on and v_existing.notes=v_notes
     and v_existing.created_by=auth.uid() then return p_id; end if;
  raise exception 'Payment reference already in use';
 end if;
 select coalesce(sum(amount_cents),0) into v_paid
 from public.cafeteria_payable_payments where payable_id=p_payable_id and voided_at is null;
 if p_amount_cents>v_payable.total_cents-v_paid then
  raise exception 'Payment exceeds the remaining balance';
 end if;
 insert into public.cafeteria_payable_payments(id,payable_id,amount_cents,paid_on,notes,created_by)
 values(p_id,p_payable_id,p_amount_cents,p_paid_on,v_notes,auth.uid());
 return p_id;
end$$;

revoke all on function public.cafeteria_record_payable_payment(uuid,uuid,bigint,date,text) from public,anon;
grant execute on function public.cafeteria_record_payable_payment(uuid,uuid,bigint,date,text) to authenticated;

