-- Preserve legacy function behavior except new versioned event settings.
CREATE OR REPLACE FUNCTION public.tournament_resize_teams(p_id uuid, p_expected_version bigint, p_state jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 t public.tournaments%rowtype;
 old_team jsonb;team jsonb;person jsonb;game jsonb;
 previous_id text; team_id text;
 old_ids text[]:=array[]::text[];
 retained text[]:=array[]::text[];
 new_ids text[]:=array[]::text[];
 people text[]:=array[]::text[];
 pairs text[]:=array[]::text[];
 entrants text[]:=array[]::text[];
 n integer;gcount integer;gc integer;r integer;
 old_max_t integer:=0;old_max_p integer:=0;
 required_matches integer:=0;group_name text;
 a text;b text;team_a text;team_b text;
 version_out bigint;
begin
 if auth.uid() is null or not public.is_staff() then
   raise exception 'Staff authorization required';
 end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then
   raise exception 'Tournament changed on another device. Refresh before saving';end if;
 if exists(select 1 from jsonb_array_elements(t.state->'matches') x
    where jsonb_array_length(coalesce(x->'sets','[]'::jsonb))>0 or
    (t.format='groups' and x->>'phase'='knockout')) then
   raise exception 'Teams cannot be changed after matches or knockout seeding';end if;
 if coalesce(jsonb_array_length(t.state->'seedPlacements'),0)>0 then
   raise exception 'Remove manual seeds before editing the teams';end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or
    jsonb_typeof(p_state->'teams')<>'array' or
    jsonb_typeof(p_state->'matches')<>'array' or
    p_state->>'mode' is distinct from t.format or
    (select count(*) from jsonb_object_keys(p_state))<>4 or
    p_state->>'knockoutSeeded' is distinct from
     (case when t.format='groups' then 'false' else 'true' end) or
    pg_column_size(p_state)>200000 then
   raise exception 'Invalid tournament state';end if;
 n:=jsonb_array_length(p_state->'teams');
 if t.settings ? 'entry_limit' and n>(t.settings->>'entry_limit')::integer then
  raise exception 'Tournament entry limit reached';end if;
 if n>jsonb_array_length(t.state->'teams') and
    t.settings->>'registration_deadline' is not null and
    clock_timestamp()>(t.settings->>'registration_deadline')::timestamptz and
    not public.is_admin() then
  raise exception 'Registration deadline passed. Ask an administrator for an override';end if;
 if n<2 or n>32 then raise exception 'Tournament requires 2–32 teams';end if;
 for old_team in select value from jsonb_array_elements(t.state->'teams') loop
  previous_id:=old_team->>'id';
  old_ids:=array_append(old_ids,previous_id);
  old_max_t:=greatest(old_max_t,substring(previous_id from 2)::integer);
  for person in select value from jsonb_array_elements(old_team->'members') loop
   old_max_p:=greatest(old_max_p,substring(person->>'id' from 2)::integer);
  end loop;
 end loop;
 for team in select value from jsonb_array_elements(p_state->'teams') loop
  team_id:=team->>'id';
  if coalesce(team_id,'') !~ '^t[1-9][0-9]{0,5}$' or team_id=any(new_ids)
     or jsonb_typeof(team->'members')<>'array' or
     jsonb_array_length(team->'members')<>2 then
    raise exception 'Invalid or duplicated team';end if;
  new_ids:=array_append(new_ids,team_id);
  select x.value into old_team from jsonb_array_elements(t.state->'teams') x
     where x.value->>'id'=team_id limit 1;
  if old_team is not null then
   if (old_team-'group')<>(team-'group') then
     raise exception 'Existing team names and payments cannot be overwritten';end if;
  else
   if substring(team_id from 2)::integer<=old_max_t then
      raise exception 'New teams require fresh IDs';end if;
   for person in select value from jsonb_array_elements(team->'members') loop
    if coalesce(person->>'id','') !~ '^p[1-9][0-9]{0,5}$' or
       substring(person->>'id' from 2)::integer<=old_max_p or
       person->>'id'=any(people) or
       length(btrim(coalesce(person->>'name',''))) not between 2 and 100 or
       person->>'due' is distinct from t.fee_cents::text or
       person->>'paid' is distinct from '0' then
     raise exception 'Invalid new participant or participation fee';end if;
    people:=array_append(people,person->>'id');
   end loop;
  end if;
 end loop;
 for old_team in select value from jsonb_array_elements(t.state->'teams') loop
  if not (old_team->>'id'=any(new_ids)) and
     exists(select 1 from jsonb_array_elements(old_team->'members') as paid_member
       where (paid_member->>'paid')::bigint<>0) then
   raise exception 'Teams with recorded payments cannot be removed';end if;
 end loop;
 if n=array_length(old_ids,1) and
   (select array_agg(x order by x) from unnest(old_ids) x)=
   (select array_agg(x order by x) from unnest(new_ids) x)
 then raise exception 'The team list has not changed';end if;
 if t.format='groups' then
  gcount:=case
    when n=5 and not (t.settings ? 'group_size') then 1
    else least(floor(n/2.0)::integer,
      ceil(n/coalesce(nullif((t.settings->>'group_size')::integer,0),4)::numeric)::integer)
   end;
  for gc in 0..gcount-1 loop
   group_name:=chr(65+gc);
   if (select count(*) from jsonb_array_elements(p_state->'teams') x
       where x->>'group'=group_name) not between 2 and
    (case when n=5 and not (t.settings ? 'group_size') then 5
      else coalesce((t.settings->>'group_size')::integer,4) end)
   then raise exception 'Invalid group size';end if;
   required_matches:=required_matches+(
    select count(*)*(count(*)-1)/2 from jsonb_array_elements(p_state->'teams') x
    where x->>'group'=group_name);
  end loop;
  if jsonb_array_length(p_state->'matches')<>required_matches
    then raise exception 'Group fixtures are incomplete';end if;
 else
  r:=ceil(ln(n::numeric)/ln(2::numeric))::integer;
  if jsonb_array_length(p_state->'matches')<>power(2,r)::integer-1
   then raise exception 'Invalid knockout fixture count';end if;
 end if;
 for game in select value from jsonb_array_elements(p_state->'matches') loop
  a:=game->>'a';b:=game->>'b';
  if coalesce(game->'sets','null'::jsonb)<>'[]'::jsonb or
    game->>'scheduledTime' is not null or
    (a is not null and not a=any(new_ids)) or
    (b is not null and not b=any(new_ids)) then
   raise exception 'Invalid match reference, score or schedule';end if;
  if t.format='groups' then
   if game->>'phase'<>'group' or game->>'winner' is not null or
     a is null or b is null or a=b then raise exception 'Invalid group match';end if;
   select x->>'group' into team_a from jsonb_array_elements(p_state->'teams') x where x->>'id'=a;
   select x->>'group' into team_b from jsonb_array_elements(p_state->'teams') x where x->>'id'=b;
   if team_a is distinct from team_b or game->>'group' is distinct from team_a
    then raise exception 'Groups must match the fixtures';end if;
   team_id:=least(a,b)||':'||greatest(a,b);
   if team_id=any(pairs) then raise exception 'Duplicate group match';end if;
   pairs:=array_append(pairs,team_id);
  else
   if game->>'phase'<>'knockout' or
    coalesce(game->>'round','') !~ '^[1-9][0-9]*$' or
    coalesce(game->>'slot','') !~ '^[1-9][0-9]*$' then
      raise exception 'Invalid knockout match';end if;
   if (game->>'round')::integer=1 then
    if a is null then raise exception 'Missing knockout team';end if;
    entrants:=array_append(entrants,a);
    if b is not null then entrants:=array_append(entrants,b);end if;
   end if;
   if game->>'winner' is not null and not
     ((game->>'round')::integer=1 and a is not null and b is null and game->>'winner'=a)
   then raise exception 'Only first-round byes can advance without scores';end if;
  end if;
 end loop;
 if t.format='knockout' and
    (coalesce(array_length(entrants,1),0)<>n or
     (select count(distinct x) from unnest(entrants) x)<>n) then
   raise exception 'Knockout entrants must be unique';end if;
 update public.tournaments set state=p_state,version=version+1 where id=p_id
 returning version into version_out;
 return version_out;
end;
$function$;


-- Preserve legacy function behavior except new versioned event settings.
CREATE OR REPLACE FUNCTION public.tournament_set_match_schedule(p_id uuid, p_expected_version bigint, p_match_id text, p_time text, p_court text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE t public.tournaments%rowtype; ms jsonb; m jsonb; idx integer:=-1; i integer; v bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF coalesce(p_match_id,'')='' OR length(p_match_id)>40 THEN RAISE EXCEPTION 'Invalid match'; END IF;
 IF p_time IS NOT NULL AND p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN RAISE EXCEPTION 'Invalid match time'; END IF;
 IF p_court IS NOT NULL AND p_court NOT IN ('C1','C2','C3')
  THEN RAISE EXCEPTION 'Invalid court'; END IF;
 SELECT * INTO t FROM public.tournaments WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tournament not found'; END IF;
 IF t.version IS DISTINCT FROM p_expected_version
  THEN RAISE EXCEPTION 'Tournament changed on another device. Refresh before saving'; END IF;
 ms:=t.state->'matches';
 IF jsonb_typeof(ms) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid fixtures'; END IF;
 FOR i IN 0..jsonb_array_length(ms)-1 LOOP
  IF ms->i->>'id'=p_match_id THEN
   IF idx<>-1 THEN RAISE EXCEPTION 'Duplicate fixture'; END IF;
   idx:=i;
  END IF;
 END LOOP;
 IF idx<0 THEN RAISE EXCEPTION 'Match not found'; END IF;
 m:=ms->idx;
 IF m->>'phase' NOT IN ('group','knockout') THEN RAISE EXCEPTION 'Invalid match phase'; END IF;
 IF p_time IS NULL THEN m:=m-'scheduledTime';
 ELSE m:=jsonb_set(m,'{scheduledTime}',to_jsonb(p_time),true); END IF;
 IF p_court IS NOT NULL AND t.settings ? 'courts'
  AND NOT (t.settings->'courts') ? p_court
  THEN RAISE EXCEPTION 'Court not enabled for this tournament';END IF;
 IF p_court IS NULL THEN m:=m-'scheduledCourt';
 ELSE m:=jsonb_set(m,'{scheduledCourt}',to_jsonb(p_court),true); END IF;
 ms:=jsonb_set(ms,array[idx::text],m);
 UPDATE public.tournaments SET state=jsonb_set(t.state,'{matches}',ms),version=version+1
 WHERE id=p_id RETURNING version INTO v;
 RETURN v;
END $function$;


-- Preserve legacy function behavior except new versioned event settings.
CREATE OR REPLACE FUNCTION public.tournament_shuffle_groups(p_id uuid, p_expected_version bigint, p_pin text DEFAULT NULL::text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 t public.tournaments%rowtype;
 v_lock public.tournament_shuffle_locks%rowtype;
 v_old_teams jsonb;
 v_teams jsonb := '[]'::jsonb;
 v_matches jsonb := '[]'::jsonb;
 v_team jsonb;
 v_match jsonb;
 v_count integer;
 v_group_count integer;
 v_position integer := 0;
 v_group_index integer;
 v_group_label text;
 v_group_teams text[];
 v_ring text[];
 v_length integer;
 v_round integer;
 v_i integer;
 v_ordinal integer := 0;
 v_a text;
 v_b text;
 v_version bigint;
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Staff authorization required';
 end if;

 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found. It may have been closed'; end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament changed on another device. Refresh before saving';
 end if;
 if t.format <> 'groups' or t.state->>'mode' is distinct from 'groups' then
  raise exception 'Only group-stage tournaments can be reshuffled';
 end if;
 if coalesce(t.state->>'knockoutSeeded', 'false') = 'true'
   or coalesce(jsonb_array_length(t.state->'seedPlacements'), 0) > 0 then
  raise exception 'Groups are locked after knockout seeding';
 end if;
 for v_match in select value from jsonb_array_elements(t.state->'matches') loop
  if v_match->>'phase' is distinct from 'group'
    or v_match->>'winner' is not null
    or coalesce(v_match->'sets', '[]'::jsonb) <> '[]'::jsonb then
   raise exception 'Groups cannot be reshuffled after scores or knockout matches exist';
  end if;
 end loop;


 -- The PIN check belongs to this RPC so direct API calls cannot bypass it.
 if t.shuffle_locked then
  select * into v_lock from public.tournament_shuffle_locks
   where tournament_id=p_id for update;
  if not found then raise exception 'Tournament shuffle lock needs administrator attention'; end if;
  if v_lock.blocked_until > now() then return -2; end if;
  -- Requests without a PIN cannot consume the attempt allowance.
  if p_pin is null then return -1; end if;
  if p_pin !~ '^[0-9]{4,8}$'
     or extensions.crypt(p_pin,v_lock.pin_hash) is distinct from v_lock.pin_hash then
   update public.tournament_shuffle_locks
    set failed_attempts=case when v_lock.failed_attempts>=4 then 0 else v_lock.failed_attempts+1 end,
        blocked_until=case when v_lock.failed_attempts>=4 then now()+interval '15 minutes' else null end
    where tournament_id=p_id;
   if v_lock.failed_attempts>=4 then return -2; end if;
   return -1;
  end if;
  update public.tournament_shuffle_locks
   set failed_attempts=0,blocked_until=null where tournament_id=p_id;
 end if;

 v_old_teams := t.state->'teams';
 if jsonb_typeof(v_old_teams) is distinct from 'array'
    or jsonb_array_length(v_old_teams) not between 2 and 32 then
  raise exception 'Invalid tournament teams';
 end if;
 v_count := jsonb_array_length(v_old_teams);
 v_group_count := case
  when v_count=5 and not (t.settings ? 'group_size') then 1
  else least(floor(v_count/2.0)::integer,
    ceil(v_count / coalesce(nullif((t.settings->>'group_size')::integer,0),4)::numeric)::integer)
  end;
 
 -- Change only the group field. Keep team IDs, members, fees and payments intact.
 for v_team in
  select value from jsonb_array_elements(v_old_teams) order by random()
 loop
  v_group_index := v_position % v_group_count;
  v_group_label := chr(65 + v_group_index);
  v_teams := v_teams || jsonb_build_array(
   jsonb_set(v_team, '{group}', to_jsonb(v_group_label), true));
  v_position := v_position + 1;
 end loop;

 -- Rebuild balanced, round-robin fixtures from the new draw.
 for v_group_index in 0..v_group_count-1 loop
  v_group_label := chr(65 + v_group_index);
  select array_agg(g.team->>'id' order by g.ordinal)
    into v_group_teams
  from jsonb_array_elements(v_teams) with ordinality as g(team,ordinal)
  where g.team->>'group'=v_group_label;
  v_ring := v_group_teams;
  if array_length(v_ring,1) % 2 = 1 then
   v_ring := v_ring || array[null::text];
  end if;
  v_length := array_length(v_ring,1);
  for v_round in 1..v_length-1 loop
   for v_i in 1..v_length/2 loop
    v_a := v_ring[v_i];
    v_b := v_ring[v_length+1-v_i];
    if v_a is not null and v_b is not null then
     v_ordinal := v_ordinal + 1;
     v_matches := v_matches || jsonb_build_array(jsonb_build_object(
      'id', 'g' || v_ordinal, 'phase', 'group', 'group', v_group_label,
      'round', v_round, 'slot', v_ordinal, 'a', v_a, 'b', v_b,
      'sets', '[]'::jsonb, 'winner', null::text
     ));
    end if;
   end loop;
   v_ring := array[v_ring[1],v_ring[v_length]] || v_ring[2:v_length-1];
  end loop;
 end loop;

 t.state := jsonb_set(jsonb_set(t.state, '{teams}', v_teams), '{matches}', v_matches);
 update public.tournaments
 set state=t.state, version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end;
$function$;


-- Preserve legacy function behavior except new versioned event settings.
CREATE OR REPLACE FUNCTION public.tournament_update_settings(p_id uuid, p_expected_version bigint, p_settings jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
 t public.tournaments%rowtype; v_count integer;v_group integer;v_qualifiers integer;v_limit integer;
 v_courts jsonb;v_rules jsonb;v_rule jsonb;v_seen text[]:=array[]::text[];
 v_deadline timestamptz;v_version bigint;v_score_exists boolean;
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can change tournament settings';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament was updated on another device. Refresh first';end if;
 if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object'
   or pg_column_size(p_settings)>15000 then raise exception 'Invalid settings document';end if;
 if p_settings->>'registration_mode' is distinct from 'staff' then
  raise exception 'Only staff-managed registration is supported';end if;
 if coalesce(p_settings->>'publication_status','') not in ('draft','published_internal')
 or coalesce(p_settings->>'fee_mode','') not in ('paid','free')
 or coalesce(p_settings->>'prize_mode','') not in ('tba','announced') then
  raise exception 'Invalid publication, entry or prize settings';end if;
 if char_length(coalesce(p_settings->>'prize_text',''))>1000 then
  raise exception 'Prize description is too long';end if;
 if coalesce(p_settings->>'group_size','') !~ '^[0-9]{1,2}$'
 or coalesce(p_settings->>'qualifiers_per_group','') !~ '^[0-9]{1,2}$'
 or coalesce(p_settings->>'entry_limit','') !~ '^[0-9]{1,2}$' then
  raise exception 'Invalid group or entry limits';end if;
 v_group:=(p_settings->>'group_size')::integer;v_qualifiers:=(p_settings->>'qualifiers_per_group')::integer;
 v_limit:=(p_settings->>'entry_limit')::integer;v_count:=jsonb_array_length(t.state->'teams');
 if v_group not between 2 and 8 or v_qualifiers not between 1 and v_group
  or v_limit not between v_count and 32 then
  raise exception 'Group size, qualifiers or entry limit are out of range';end if;
 v_courts:=p_settings->'courts';
 if jsonb_typeof(v_courts) is distinct from 'array' or jsonb_array_length(v_courts) not between 1 and 3
 or exists(select 1 from jsonb_array_elements_text(v_courts) x where x not in ('C1','C2','C3'))
 or (select count(distinct x) from jsonb_array_elements_text(v_courts) x)<>jsonb_array_length(v_courts) then
  raise exception 'Choose 1–3 distinct courts';end if;
 if p_settings->>'registration_deadline' is not null then
  begin v_deadline:=(p_settings->>'registration_deadline')::timestamptz;
  exception when others then raise exception 'Invalid registration deadline';end;
 end if;
 v_rules:=p_settings->'rules';
 if jsonb_typeof(v_rules) is distinct from 'array' or jsonb_array_length(v_rules)>16 then
  raise exception 'Invalid tournament rule list';end if;
 for v_rule in select value from jsonb_array_elements(v_rules) loop
  if coalesce(v_rule->>'key','') !~ '^[a-z][a-z0-9_-]{1,39}$'
   or coalesce(v_rule->>'text','')='' or char_length(v_rule->>'text')>500
   or jsonb_typeof(v_rule->'enabled') is distinct from 'boolean'
   or v_rule->>'key'=any(v_seen) then
   raise exception 'Invalid or duplicated tournament rule';end if;
  v_seen:=array_append(v_seen,v_rule->>'key');
 end loop;
 if t.settings ? 'fee_mode' and t.settings->>'fee_mode' <> p_settings->>'fee_mode' then
  raise exception 'Paid/free selection is fixed once participant dues are created';end if;
 v_score_exists:=exists(select 1 from jsonb_array_elements(t.state->'matches') m
  where coalesce(m->>'played','false')='true' or m->>'winner' is not null or
   coalesce(jsonb_array_length(m->'sets'),0)>0);
 if v_score_exists then
  if t.format='groups' and (coalesce(t.settings->>'group_size','4') is distinct from p_settings->>'group_size'
   or coalesce(t.settings->>'qualifiers_per_group','2') is distinct from p_settings->>'qualifiers_per_group') then
   raise exception 'Group settings are locked after results';end if;
  if t.format like 'americano_%' and (
   t.settings->>'points_per_match' is distinct from p_settings->>'points_per_match'
   or t.settings->>'rounds' is distinct from p_settings->>'rounds') then
   raise exception 'Americano scoring and rounds are locked after results';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(t.state->'matches') m
  where m->>'scheduledCourt' is not null and not (p_settings->'courts') ? (m->>'scheduledCourt')) then
  raise exception 'A scheduled match uses a court being removed';end if;
 update public.tournaments set settings=p_settings,version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end$function$;
