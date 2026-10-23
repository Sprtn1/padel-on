-- Five pairs stay in one round-robin group when staff press Shuffle Groups.
begin;
CREATE OR REPLACE FUNCTION public.tournament_shuffle_groups(p_id uuid, p_expected_version bigint)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
 t public.tournaments%rowtype;
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

 v_old_teams := t.state->'teams';
 if jsonb_typeof(v_old_teams) is distinct from 'array'
    or jsonb_array_length(v_old_teams) not between 2 and 32 then
  raise exception 'Invalid tournament teams';
 end if;
 v_count := jsonb_array_length(v_old_teams);
 v_group_count := case when v_count=5 then 1 else ceil(v_count / 4.0)::integer end;
 
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
$function$

commit;