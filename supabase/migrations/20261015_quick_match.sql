-- PADEL ON: Quick Match. Apply ONCE in Supabase SQL Editor before using Quick Match.
-- Keeps the existing record_team_match function and all previously recorded data intact.
-- The original manual entry workflow remains functional.
alter table public.team_matches
  add column if not exists non_team_count integer;
alter table public.team_matches
  add column if not exists non_team_names text not null default '';
alter table public.team_matches
  drop constraint if exists team_matches_non_team_count_check;
alter table public.team_matches
  add constraint team_matches_non_team_count_check
  check (non_team_count between 0 and 3 or non_team_count is null);

create or replace function public.record_quick_team_match(
  p_match_id uuid, p_member_ids uuid[], p_non_team_count integer,
  p_played_on date, p_notes text default '', p_non_team_names text default ''
) returns uuid language plpgsql security definer
set search_path=public,pg_temp as $$
declare
  m record;
  v_count integer := 0;
  v_team_count integer;
  v_type text;
  v_game_type text;
  v_week date;
  v_used integer;
  v_initial integer;
  v_latest_reset timestamptz;
  v_today date;
  v_existing public.team_matches%rowtype;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  v_today := (now() at time zone 'Asia/Beirut')::date;
  if p_played_on is null or p_played_on > v_today or p_played_on < v_today-30
    then raise exception 'Game date must be within the past 30 days'; end if;
  if p_match_id is null then raise exception 'Missing match reference'; end if;
  v_team_count := cardinality(p_member_ids);
  if p_member_ids is null or v_team_count < 1 or v_team_count > 4
    then raise exception 'Select at least one team member'; end if;
  if p_non_team_count is null or p_non_team_count < 0 or p_non_team_count > 3
    or v_team_count + p_non_team_count <> 4
    then raise exception 'A match must contain exactly four players'; end if;
  if (select count(distinct x) from unnest(p_member_ids) as x) <> v_team_count
    then raise exception 'Each team member may appear only once'; end if;
  if length(coalesce(p_notes,'')) > 500 or length(coalesce(p_non_team_names,'')) > 255
    then raise exception 'Notes or player names are too long'; end if;

  -- With four players, two or more non-team players means free;
  -- three or more team players means half-price for regular team members.
  if p_non_team_count >= 2 then v_type := 'free';
  elsif v_team_count >= 3 then v_type := 'half';
  else raise exception 'Match composition has no defined benefit'; end if;

  select * into v_existing from public.team_matches where id=p_match_id;
  if found then
    if v_existing.created_by = auth.uid() and v_existing.voided_at is null
      then return p_match_id;
    end if;
    raise exception 'Match reference already exists';
  end if;

  v_week := p_played_on - (extract(isodow from p_played_on)::int - 1);
  -- Lock all selected member rows in deterministic order to prevent overspending.
  for m in
    select * from public.team_members
    where id = any(p_member_ids)
    order by id
    for update
  loop
    v_count := v_count + 1;
    if not m.active then raise exception 'Inactive team member: %',m.name; end if;
    v_game_type := case when m.unlimited then 'free' else v_type end;
    if not m.unlimited then
      select coalesce((select used from public.initial_balances
        where member_id=m.id and week_start=v_week),0) into v_initial;
      select max(effective_at) into v_latest_reset from public.reset_events
        where member_id=m.id and week_start=v_week;
      select count(*) into v_used from public.team_games
        where member_id=m.id and played_on between v_week and (v_week + 6)
        and voided_at is null
        and (v_latest_reset is null or created_at > v_latest_reset);
      if v_latest_reset is not null then v_initial := 0; end if;
      if v_used + v_initial >= m.weekly_allowance
        then raise exception '% has used all weekly benefits',m.name; end if;
    end if;
  end loop;
  if v_count <> v_team_count then raise exception 'Unknown team member selected'; end if;

  insert into public.team_matches
    (id,played_on,benefit_type,notes,created_by,non_team_count,non_team_names)
  values
    (p_match_id,p_played_on,v_type,coalesce(p_notes,''),auth.uid(),
     p_non_team_count,coalesce(p_non_team_names,''));
  insert into public.team_games(match_id,member_id,played_on,benefit_type)
  select p_match_id,x,p_played_on,
    case when tm.unlimited then 'free' else v_type end
  from unnest(p_member_ids) as x
  join public.team_members tm on tm.id=x;
  insert into public.audit_logs(actor,action,entity,entity_id,after_data)
  values(auth.uid(),'CREATE','team_matches',p_match_id::text,
    jsonb_build_object('team_members',p_member_ids,'non_team_count',p_non_team_count,
      'game_date',p_played_on,'benefit',v_type,'source','quick_match'));
  return p_match_id;
end$$;

revoke all on function public.record_quick_team_match(uuid,uuid[],integer,date,text,text)
  from public,anon;
grant execute on function public.record_quick_team_match(uuid,uuid[],integer,date,text,text)
  to authenticated;
