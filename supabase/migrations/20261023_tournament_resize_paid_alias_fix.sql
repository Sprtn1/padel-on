begin;
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
  gcount:=case when n=5 then 1 else ceil(n/4.0)::integer end;
  for gc in 0..gcount-1 loop
   group_name:=chr(65+gc);
   if (select count(*) from jsonb_array_elements(p_state->'teams') x
       where x->>'group'=group_name) not between 2 and (case when n=5 then 5 else 4 end)
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
$function$

commit;