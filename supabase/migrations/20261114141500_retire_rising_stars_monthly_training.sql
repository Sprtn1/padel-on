-- Retire only the discontinued Rising Stars monthly free training entitlement.
-- Both tables were confirmed empty on the production Supabase project before authoring.
-- This does NOT affect team_members/team_category='rising_stars', private_clients,
-- private_ledger_entries, padel_court_reservations or club_private_training_* RPCs.
-- Keep historical 20261015_rising_stars_training.sql as an applied migration record.
begin;
set local lock_timeout='5s';
set local statement_timeout='20s';

-- Fail closed if anyone recorded a monthly session since the preflight count.
-- Do not silently delete non-empty operational data.
do $$
begin
  if to_regclass('public.training_attendance') is not null then
    if exists(select 1 from public.training_attendance limit 1) then
      raise exception 'Monthly training attendance is no longer empty; manual review required';
    end if;
  end if;
  if to_regclass('public.training_sessions') is not null then
    if exists(select 1 from public.training_sessions limit 1) then
      raise exception 'Monthly training sessions are no longer empty; manual review required';
    end if;
  end if;
end $$;

drop function if exists public.record_training_session(
  uuid,uuid[],date,time without time zone,integer,text,boolean
);
drop function if exists public.void_training_session(uuid,text);
drop table if exists public.training_attendance;
drop table if exists public.training_sessions;
commit;
