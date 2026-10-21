-- PADEL ON: one free game per Monday-Sunday week for Other Benefits players.
-- The weekly allowance is derived from saved game history, not a manually reset counter.
-- The player row lock prevents concurrent staff submissions from consuming two free games.
begin;

alter table public.other_players drop constraint if exists other_players_status_check;
alter table public.other_players
  add constraint other_players_status_check
  check (status in (
    'needs_confirmation',
    'next_free',
    'counting',
    'rule_not_configured',
    'alternating_free_paid',
    'one_free_per_week'
  ));

create or replace function public.record_other_game(
  p_game_id uuid,
  p_player_id uuid,
  p_played_on date,
  p_game_type text,
  p_notes text default ''
) returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
declare
  v_player public.other_players%rowtype;
  v_id uuid;
  v_counter integer;
  v_status text;
  v_expected text;
  v_week_start date;
begin
  if not public.is_staff() then raise exception 'Not authorized'; end if;
  if p_game_id is null or p_player_id is null then
    raise exception 'Missing game or player reference';
  end if;
  if p_game_type is null or p_game_type not in ('paid','free') then
    raise exception 'Select Paid or Free';
  end if;
  if p_played_on is null
     or p_played_on>(now() at time zone 'Asia/Beirut')::date
     or p_played_on<(now() at time zone 'Asia/Beirut')::date-30
  then raise exception 'Date must be within past 30 days'; end if;

  -- Serialize updates for each player so two simultaneous free-game requests cannot pass.
  select * into v_player
  from public.other_players
  where id=p_player_id
  for update;

  if not found or not v_player.active then
    raise exception 'Player is unavailable';
  end if;

  -- Retries of the same saved request are idempotent and never increment counters twice.
  if exists(select 1 from public.other_games where id=p_game_id) then
    if exists(
      select 1 from public.other_games
      where id=p_game_id
        and created_by=auth.uid()
        and player_id=p_player_id
        and played_on=p_played_on
        and game_type=p_game_type
    ) then return p_game_id; end if;
    raise exception 'Game reference already used';
  end if;

  v_counter:=v_player.current_counter;
  v_status:=v_player.status;

  if v_status='alternating_free_paid' then
    v_expected:=case when mod(v_counter,2)=0 then 'free' else 'paid' end;
    if p_game_type<>v_expected then
      raise exception 'Next game must be % for this alternating benefit',upper(v_expected);
    end if;
    -- Both free and paid games advance the alternating cycle.
    v_counter:=v_counter+1;

  elsif v_status='one_free_per_week' then
    -- The week is determined by the recorded game date, using Monday as day one.
    v_week_start:=p_played_on-(extract(isodow from p_played_on)::int-1);
    if p_game_type='free' and exists(
      select 1
      from public.other_games
      where player_id=p_player_id
        and game_type='free'
        and played_on>=v_week_start
        and played_on<v_week_start+7
    ) then
      raise exception 'This player has already used the free game for the week starting %',v_week_start;
    end if;
    -- Weekly eligibility is based on game history; this counter is not used for eligibility.
    v_counter:=v_counter+(case when p_game_type='paid' then 1 else 0 end);

  else
    -- Preserve existing next-free, counting, and unconfigured behavior.
    v_counter:=v_counter+(case when p_game_type='paid' then 1 else 0 end);
    if p_game_type='free' and v_status='next_free' then
      v_status:='needs_confirmation';
    end if;
    if p_game_type='paid'
       and v_player.slug='rami-al-rifai'
       and v_player.status='counting'
       and v_counter>=5 then
      v_status:='next_free';
    end if;
  end if;

  insert into public.other_games(id,player_id,played_on,game_type,notes,created_by)
  values(p_game_id,p_player_id,p_played_on,p_game_type,left(coalesce(p_notes,''),500),auth.uid())
  returning id into v_id;

  update public.other_players
  set current_counter=v_counter,status=v_status
  where id=p_player_id;

  insert into public.audit_logs(actor,action,entity,entity_id,after_data)
  values(
    auth.uid(),'CREATE','other_games',v_id::text,
    jsonb_build_object(
      'player',p_player_id,
      'type',p_game_type,
      'policy',v_player.status,
      'counter_before',v_player.current_counter,
      'counter_after',v_counter
    )
  );

  return v_id;
end
$function$;

revoke all on function public.record_other_game(uuid,uuid,date,text,text) from public,anon;
grant execute on function public.record_other_game(uuid,uuid,date,text,text) to authenticated;

commit;