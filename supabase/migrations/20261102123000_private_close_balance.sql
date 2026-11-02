-- Admin-only private-client credit refund.
-- The closing is an auditable ledger entry, never a coaching session, and may
-- later be routed to physical cash or Whish from Cafeteria Finances.
begin;

alter table public.private_ledger_entries
 drop constraint if exists private_ledger_entries_entry_type_check;
alter table public.private_ledger_entries
 add constraint private_ledger_entries_entry_type_check
 check(entry_type in ('session','deposit','balance_close'));

alter table public.private_ledger_entries
 drop constraint if exists private_entry_type_fields;
alter table public.private_ledger_entries
 add constraint private_entry_type_fields check (
  (entry_type='session' and coach_id is not null and deposit_cents=0)
  or
  (entry_type='deposit' and coach_id is null and deposit_cents>0 and session_fee_cents=0 and paid_cents=0)
  or
  (entry_type='balance_close' and coach_id is null and session_fee_cents>0 and paid_cents=0 and deposit_cents=0)
 );

create or replace function public.private_close_balance(
 p_entry_id uuid,p_client_id uuid,p_entry_date date,p_notes text default 'Account balance closed'
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_existing public.private_ledger_entries%rowtype;
 v_client public.private_clients%rowtype;
 v_balance bigint;
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only an administrator can close a client balance';
 end if;
 if p_entry_id is null or p_client_id is null then raise exception 'Missing record reference'; end if;
 if p_entry_date is null or p_entry_date>(now() at time zone 'Asia/Beirut')::date then
  raise exception 'Date must be today or earlier (Beirut time)';
 end if;
 if char_length(coalesce(p_notes,''))>500 then raise exception 'Notes too long'; end if;

 select * into v_existing from public.private_ledger_entries where id=p_entry_id;
 if found then
  if v_existing.created_by=auth.uid() and v_existing.entry_type='balance_close' and v_existing.voided_at is null then
   return v_existing.session_fee_cents;
  end if;
  raise exception 'Reference already in use';
 end if;

 select * into v_client from public.private_clients where id=p_client_id for update;
 if not found or v_client.deleted_at is not null then raise exception 'Client not found'; end if;

 select v_client.opening_balance_cents+coalesce(sum(
   coalesce(deposit_cents,0)+coalesce(paid_cents,0)-coalesce(session_fee_cents,0)
  ),0)
 into v_balance
 from public.private_ledger_entries
 where client_id=p_client_id and voided_at is null;

 if v_balance<=0 then raise exception 'Only a positive client credit can be closed'; end if;

 insert into public.private_ledger_entries(
  id,client_id,entry_type,entry_date,coach_id,session_fee_cents,paid_cents,deposit_cents,notes,created_by,payment_channel
 ) values(
  p_entry_id,p_client_id,'balance_close',p_entry_date,null,v_balance,0,0,
  btrim(coalesce(nullif(p_notes,''),'Account balance closed')),auth.uid(),'cash'
 );
 return v_balance;
end$$;

revoke all on function public.private_close_balance(uuid,uuid,date,text) from public,anon;
grant execute on function public.private_close_balance(uuid,uuid,date,text) to authenticated;

-- Whish-linked private receipts are deposits; balance closings are withdrawals.
create or replace function public.private_sync_whish_receipt()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_amount bigint;
 v_client public.private_clients%rowtype;
 v_label text;
 v_whish_type text;
begin
 v_amount:=case
  when NEW.entry_type='session' then NEW.paid_cents
  when NEW.entry_type='deposit' then NEW.deposit_cents
  when NEW.entry_type='balance_close' then NEW.session_fee_cents
  else 0 end;
 v_whish_type:=case when NEW.entry_type='balance_close' then 'withdrawal' else 'deposit' end;
 if NEW.payment_channel='whish' and NEW.voided_at is null and v_amount>0 then
  select * into v_client from public.private_clients where id=NEW.client_id;
  v_label:=left(
   case when NEW.entry_type='balance_close' then 'تسكير حساب ' else 'مشترك: ' end||
   left(coalesce(nullif(v_client.arabic_name,''),v_client.name,'مشترك'),80)||
   ' ('||left(coalesce(nullif(btrim(v_client.client_code),''),'—'),30)||')',120);
  if not exists(select 1 from public.whish_ledger_entries
    where source_private_entry_id=NEW.id and voided_at is null) then
   insert into public.whish_ledger_entries(
    id,entry_date,entry_type,name,amount_cents,created_by,source_private_entry_id
   ) values(gen_random_uuid(),NEW.entry_date,v_whish_type,v_label,v_amount,NEW.created_by,NEW.id);
  end if;
 else
  update public.whish_ledger_entries set
   voided_at=now(),voided_by=coalesce(auth.uid(),NEW.voided_by),
   void_reason=case when NEW.voided_at is not null then 'Linked private payment voided'
       else 'Private payment moved to cash' end
   where source_private_entry_id=NEW.id and voided_at is null;
 end if;
 return NEW;
end$$;

revoke all on function public.private_sync_whish_receipt() from public,anon,authenticated;

create or replace function public.private_set_payment_channel(p_entry_id uuid,p_cash boolean)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare v_before public.private_ledger_entries%rowtype; v_next text; v_amount bigint;
begin
 if not public.is_staff() or auth.uid() is null then raise exception 'Authorized staff only'; end if;
 if p_entry_id is null or p_cash is null then raise exception 'Choose a valid private payment'; end if;
 v_next:=case when p_cash then 'cash' else 'whish' end;
 select * into v_before from public.private_ledger_entries where id=p_entry_id for update;
 if not found or v_before.voided_at is not null then raise exception 'Private payment not found'; end if;
 v_amount:=case
  when v_before.entry_type='session' then v_before.paid_cents
  when v_before.entry_type='deposit' then v_before.deposit_cents
  when v_before.entry_type='balance_close' then v_before.session_fee_cents
  else 0 end;
 if v_amount<=0 then raise exception 'Only paid entries have a payment method'; end if;
 if v_before.payment_channel=v_next then return; end if;
 update public.private_ledger_entries set payment_channel=v_next where id=p_entry_id;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'UPDATE','private_ledger_entries',p_entry_id::text,
  jsonb_build_object('payment_channel',v_before.payment_channel),
  jsonb_build_object('payment_channel',v_next,'amount_cents',v_amount));
end$$;

revoke all on function public.private_set_payment_channel(uuid,boolean) from public,anon;
grant execute on function public.private_set_payment_channel(uuid,boolean) to authenticated;

-- Match the closing-day server validation to the UI: cash balance closings are
-- outgoing money, so they increase the day's cash expenses rather than receipts.
create or replace function public.cafeteria_change_day_status(p_day_date date,p_action text,p_reason text default '')
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_record public.cafeteria_day_closings%rowtype; v_next text; v_difference bigint;
begin
 if not public.is_staff() then raise exception 'Staff authorization required'; end if;
 if p_day_date is null or p_day_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Invalid date to close'; end if;
 if p_action not in ('close','approve','reopen') then raise exception 'Invalid close action'; end if;
 if p_action in ('approve','reopen') and not public.is_admin() then
  raise exception 'Only an administrator can approve or reopen a day';
 end if;
 if p_action='reopen' and char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'A reopening reason (4–500 characters) is required'; end if;
 perform pg_advisory_xact_lock(hashtext('padelon_day_close'),p_day_date-date '2000-01-01');
 select * into v_record from public.cafeteria_day_closings where day_date=p_day_date for update;
 if p_action='close' then
   if coalesce(v_record.status,'reopened') not in ('reopened') then
    raise exception 'This day is already submitted or approved';
   end if;
   if not exists(select 1 from public.cafeteria_finance_days where day_date=p_day_date)
   then raise exception 'Enter the closing cash count before closing the day'; end if;
   select
      (select closing_cash_cents from public.cafeteria_finance_days where day_date=p_day_date)
      + coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category not in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(case
          when entry_type='session' then paid_cents
          when entry_type='deposit' then deposit_cents
          when entry_type='balance_close' then -session_fee_cents
          else 0 end)
         from public.private_ledger_entries
         where entry_date=p_day_date and voided_at is null and payment_channel='cash'),0)
    into v_difference;
   if v_difference<0 then
     raise exception 'Negative Goods Sold indicates a cash discrepancy. Correct the entries before closing.';
   end if;
   v_next:='closed';
   insert into public.cafeteria_day_closings(day_date,status,closed_by,closed_at,approved_by,approved_at,updated_at)
   values(p_day_date,v_next,auth.uid(),now(),null,null,now())
   on conflict(day_date) do update set status='closed',closed_by=auth.uid(),closed_at=now(),
      approved_by=null,approved_at=null,updated_at=now();
 elsif p_action='approve' then
   if v_record.status is distinct from 'closed' then
     raise exception 'A day must be submitted before approval'; end if;
   update public.cafeteria_day_closings
    set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
    where day_date=p_day_date;
   v_next:='approved';
 else
   if coalesce(v_record.status,'reopened') not in ('closed','approved')
   then raise exception 'This day is not closed'; end if;
   update public.cafeteria_day_closings set status='reopened',reopened_by=auth.uid(),
    reopened_at=now(),reopen_reason=btrim(p_reason),updated_at=now() where day_date=p_day_date;
   v_next:='reopened';
 end if;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),upper(p_action),'cafeteria_day_closings',p_day_date::text,
   case when v_record.day_date is null then null else jsonb_build_object('status',v_record.status) end,
   jsonb_build_object('status',v_next,'reason',nullif(btrim(coalesce(p_reason,'')),'')));
 return v_next;
end$$;

revoke all on function public.cafeteria_change_day_status(date,text,text) from public,anon;
grant execute on function public.cafeteria_change_day_status(date,text,text) to authenticated;

commit;
