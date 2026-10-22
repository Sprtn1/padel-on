-- PADEL ON secure day closing. Closed days cannot be edited by any client
-- or existing SECURITY DEFINER ledger RPC, including concurrent operations.
begin;
create table if not exists public.cafeteria_day_closings (
  day_date date primary key,
  status text not null check (status in ('closed','approved','reopened')),
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  reopened_by uuid references auth.users(id),
  reopened_at timestamptz,
  reopen_reason text,
  updated_at timestamptz not null default now()
);
alter table public.cafeteria_day_closings enable row level security;
revoke all on public.cafeteria_day_closings from anon,authenticated;
grant select on public.cafeteria_day_closings to authenticated;
drop policy if exists cafeteria_day_closings_staff_read on public.cafeteria_day_closings;
create policy cafeteria_day_closings_staff_read on public.cafeteria_day_closings
  for select to authenticated using ((select public.is_staff()));

create or replace function public.cafeteria_guard_closed_day()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_day date; v_status text;
begin
 v_day:=case when TG_OP='DELETE' then
   case when TG_TABLE_NAME='cafeteria_finance_days' then OLD.day_date else OLD.entry_date end
   else case when TG_TABLE_NAME='cafeteria_finance_days' then NEW.day_date else NEW.entry_date end end;
 -- Share one lock with all closing/approval actions to prevent a race.
 perform pg_advisory_xact_lock(hashtext('padelon_day_close'),v_day-date '2000-01-01');
 select status into v_status from public.cafeteria_day_closings where day_date=v_day;
 if v_status in ('closed','approved') then
    raise exception 'This day has been closed. Ask an administrator to reopen it before editing.';
 end if;
 if TG_OP='UPDATE' and (
    case when TG_TABLE_NAME='cafeteria_finance_days' then OLD.day_date else OLD.entry_date end
   )<>v_day then
   raise exception 'Financial transaction dates cannot be changed.';
 end if;
 return case when TG_OP='DELETE' then OLD else NEW end;
end$$;

drop trigger if exists cafeteria_closed_entries_guard on public.cafeteria_finance_entries;
create trigger cafeteria_closed_entries_guard before insert or update or delete on public.cafeteria_finance_entries
 for each row execute function public.cafeteria_guard_closed_day();
drop trigger if exists cafeteria_closed_cash_guard on public.cafeteria_finance_days;
create trigger cafeteria_closed_cash_guard before insert or update or delete on public.cafeteria_finance_days
 for each row execute function public.cafeteria_guard_closed_day();
drop trigger if exists cafeteria_closed_whish_guard on public.whish_ledger_entries;
create trigger cafeteria_closed_whish_guard before insert or update or delete on public.whish_ledger_entries
 for each row execute function public.cafeteria_guard_closed_day();
drop trigger if exists cafeteria_closed_private_guard on public.private_ledger_entries;
create trigger cafeteria_closed_private_guard before insert or update or delete on public.private_ledger_entries
 for each row execute function public.cafeteria_guard_closed_day();

create or replace function public.cafeteria_change_day_status(p_day_date date,p_action text,p_reason text default '')
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_record public.cafeteria_day_closings%rowtype; v_next text;
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

revoke all on function public.cafeteria_change_day_status(date,text,text) from public,anon;
revoke all on function public.cafeteria_guard_closed_day() from public,anon,authenticated;
grant execute on function public.cafeteria_change_day_status(date,text,text) to authenticated;
commit;