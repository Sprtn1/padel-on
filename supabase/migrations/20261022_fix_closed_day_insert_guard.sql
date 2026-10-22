-- Fix INSERT failures in Private Sessions and other ledgers caused by the
-- closed-day guard referencing OLD fields on INSERT.
-- Keep the same cross-ledger locks and approved-day safeguards.
begin;

create or replace function public.cafeteria_guard_closed_day()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date;
  v_previous_day date;
  v_status text;
begin
  -- TG_OP must be handled in separate branches. PostgreSQL may evaluate
  -- both sides of AND; "IF TG_OP='UPDATE' AND OLD.day_date..." is not safe
  -- on an INSERT, because OLD has no populated fields.
  if TG_OP = 'INSERT' then
    if TG_TABLE_NAME = 'cafeteria_finance_days' then
      v_day := NEW.day_date;
    else
      v_day := NEW.entry_date;
    end if;
  elsif TG_OP = 'UPDATE' then
    if TG_TABLE_NAME = 'cafeteria_finance_days' then
      v_day := NEW.day_date;
      v_previous_day := OLD.day_date;
    else
      v_day := NEW.entry_date;
      v_previous_day := OLD.entry_date;
    end if;
    if v_previous_day is distinct from v_day then
      raise exception 'Financial transaction dates cannot be changed.';
    end if;
  elsif TG_OP = 'DELETE' then
    if TG_TABLE_NAME = 'cafeteria_finance_days' then
      v_day := OLD.day_date;
    else
      v_day := OLD.entry_date;
    end if;
  else
    raise exception 'Unsupported ledger operation';
  end if;

  if v_day is null then
    raise exception 'The financial transaction must have a date.';
  end if;

  -- Shared with cafeteria_change_day_status to avoid concurrent edits
  -- being committed after a day is submitted or approved.
  perform pg_advisory_xact_lock(hashtext('padelon_day_close'),
                                v_day - date '2000-01-01');
  select status into v_status
  from public.cafeteria_day_closings
  where day_date = v_day;
  if v_status in ('closed', 'approved') then
    raise exception 'This day has been closed. Ask an administrator to reopen it before editing.';
  end if;

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

commit;
