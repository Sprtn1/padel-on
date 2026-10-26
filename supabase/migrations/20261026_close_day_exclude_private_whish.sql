-- Correct cashbook closing validation to exclude private receipts received by Whish.
-- Previous closing RPC incorrectly counted every private receipt as cash, while the UI
-- correctly excluded Whish. Preserve approvals, audit logs, locking, and all records.
-- This migration replaces ONLY the existing closing RPC; no ledger rows are modified.
begin;
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
   -- Recompute under the day-level advisory lock. Whish is deliberately excluded.
   select
      (select closing_cash_cents from public.cafeteria_finance_days where day_date=p_day_date)
      + coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category not in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(
        case when entry_type='session' then paid_cents
             when entry_type='deposit' then deposit_cents else 0 end)
          from public.private_ledger_entries
          where entry_date=p_day_date and voided_at is null
            and payment_channel='cash'),0)
    into v_difference;
   if v_difference<0 then
     raise exception 'Negative Goods Sold indicates a cash discrepancy. Correct the entries before closing.';
   end if;
   v_next:='closed';
   insert into public.cafeteria_day_closings(day_date,status,closed_by,closed_at,approved_by,approved_at,updated_at)
   values(p_day_date,v_next,auth.uid(),now(),null,null,now())
   on conflict(day_date) do update set
      status='closed',closed_by=auth.uid(),closed_at=now(),
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
-- Preserve staff access without enabling unauthenticated closing changes.
revoke all on function public.cafeteria_change_day_status(date,text,text) from public,anon;
grant execute on function public.cafeteria_change_day_status(date,text,text) to authenticated;
commit;
