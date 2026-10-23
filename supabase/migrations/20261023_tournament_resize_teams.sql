-- Staff can add/remove tournament teams before results exist.
-- Old player IDs, names, fees and payments are immutable during resizing.
-- All matches are rebuilt, under a version lock. Paid teams cannot be removed.
begin;
create or replace function public.tournament_resize_teams(
 p_id uuid,p_expected_version bigint,p_state jsonb
) returns bigint
language plpgsql security definer
set search_path=public,pg_temp
as $function$
declare
 t public.tournaments%rowtype;
 old_team jsonb; new_team jsonb; member jsonb; fixture jsonb;
 old_ids text[]:=array[]::text[];
 new_ids text[]:=array[]::text[];
 member_ids text[]:=array[]::text[];
 matched_ids text[]:=array[]::text[];
 seen_pairs text[]:=array[]::text[];
 played_ids text[]:=array[]::text[];
 count_teams integer; group_count integer; match_count integer;
 expected_games integer:=0; gsize integer; gname text; gid text;
 i integer; r integer; max_old_team integer:=0; max_old_player integer:=0;
 a text;b text;pair text; a_group text;b_group text;
 extra boolean; has_results boolean:=false; v_version bigint;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament changed on another device. Refresh before saving';end if;
 if coalesce(jsonb_typeof(t.state->'matches'),'')<>'array' then
  raise exception 'Invalid existing tournament state';end if;
 for fixture in select value from jsonb_array_elements(t.state->'matches') loop
  if jsonb_array_length(coalesce(fixture->'sets','[]'::jsonb))>0 then
   raise exception 'Teams cannot be edited after match scores are recorded';end if;
  if t.format='groups' and fixture->>'phase'='knockout' then
   raise exception 'Teams cannot be edited after the knockout bracket is generated';end if;
 end loop;
 if coalesce(jsonb_array_length(t.state->'seedPlacements'),0)>0 then
  raise exception 'Remove manual seeds before editing the teams';end if;
 if p_state is null or jsonb_typeof(p_state)<>'object' or
    (select count(*) from jsonb_object_keys(p_state))<>4 or
    p_state->>'mode' is distinct from t.format or
    jsonb_typeof(p_state->'teams')<>'array' or
    jsonb_typeof(p_state->'matches')<>'array' or
    coalesce(p_state->>'knockoutSeeded','')<>case when t.format='knockout' then 'true' else 'false' end or
    pg_column_size(p_state)>200000 then
  raise exception 'Invalid tournament draw';end if;
 count_teams:=jsonb_array_length(p_state->'teams');
 if count_teams not between 2 and 32 then raise exception 'Tournament must contain 2–32 teams';end if;

 for old_team in select value from jsonb_array_elements(t.state->'teams') loop
  old_ids:=array_append(old_ids,old_team->>'id');
  if (old_team->>'id') ~ '^t[1-9][0-9]*$' then
   max_old_team:=greatest(max_old_team,substring(old_team->>'id' from 2)::integer);end if;
  for member in select value from jsonb_array_elements(old_team->'members') loop
   if (member->>'id') ~ '^p[1-9][0-9]*$' then
    max_old_player:=greatest(max_old_player,substring(member->>'id' from 2)::integer);end if;
  end loop;
 end loop;
 for new_team in select value from jsonb_array_elements(p_state->'teams') loop
  gid:=new_team->>'id';
  if gid is null or gid !~ '^t[1-9][0-9]{0,5}$' or gid=any(new_ids)
   or jsonb_typeof(new_team->'members')<>'array' or
      jsonb_array_length(new_team->'members')<>2 then
   raise exception 'Invalid or duplicate team';end if;
  new_ids:=array_append(new_ids,gid);
  select value into old_team from jsonb_array_elements(t.state->'teams')
   where value->>'id'=gid limit 1;
  if old_team is not null then
   if old_team-'group' is distinct from new_team-'group'
   then raise exception 'Existing team names and payments must remain unchanged';end if;
  else
   if substring(gid from 2)::integer<=max_old_team
     or char_length(coalesce(new_team->>'label','')) not between 2 and 100
   then raise exception 'New team ID is invalid';end if;
   for member in select value from jsonb_array_elements(new_team->'members') loop
    if coalesce(member->>'id','') !~ '^p[1-9][0-9]{0,5}$'
     or substring(member->>'id' from 2)::integer<=max_old_player
     or (member->>'id')=any(member_ids)
     or char_length(btrim(coalesce(member->>'name',''))) not between 2 and 100
     or member->>'due' is distinct from t.fee_cents::text
     or member->>'paid' is distinct from '0'
    then raise exception 'New participants need valid names and their initial fee';end if;
    member_ids:=array_append(member_ids,member->>'id');
   end loop;
  end if;
 end loop;
 for old_team in select value from jsonb_array_elements(t.state->'teams') loop
  if not (old_team->>'id'=any(new_ids)) then
    if exists(select 1 from jsonb_array_elements(old_team->'members') m
      where (m->>'paid')::bigint<>0) then
      raise exception 'Teams with recorded payments cannot be removed';end if;
  end if;
 end loop;
 if array_length(old_ids,1)=array_length(new_ids,1) and
    (select array_agg(x order by x) from unnest(old_ids) x)=
    (select array_agg(x order by x) from unnest(new_ids) x)
 then raise exception 'Team count and membership have not changed';end if;
 match_count:=jsonb_array_length(p_state->'matches');
 if match_count>300 then raise exception 'Too many tournament matches';end if;

 if t.format='groups' then
  group_count:=case when count_teams=5 then 1 else ceil(count_teams/4.0)::integer end;
  for i in 0..group_count-1 loop
   gname:=chr(65+i);
   select count(*) into gsize from jsonb_array_elements(p_state->'teams') x
    where x->>'group'=gname;
   if gsize<2 or gsize>case when count_teams=5 then 5 else 4 end or
      gsize<floor(count_teams::numeric/group_count) or
      gsize>ceil(count_teams::numeric/group_count) then
    raise exception 'Invalid group sizes';end if;
   expected_games:=expected_games+gsize*(gsize-1)/2;
  end loop;
  if exists(select 1 from jsonb_array_elements(p_state->'teams') x
    where x->>'group' is null or length(x->>'group')<>1
      or ascii(x->>'group')<65 or ascii(x->>'group')>=65+group_count)
  then raise exception 'Every team must belong to a valid group';end if;
  if match_count<>expected_games then raise exception 'Group fixtures are incomplete';end if;
 else
  r:=ceil(ln(count_teams::numeric)/ln(2::numeric))::integer;
  if match_count<>power(2,r)::integer-1 then raise exception 'Invalid knockout bracket';end if;
 end if;
 for fixture in select value from jsonb_array_elements(p_state->'matches') loop
  gid:=fixture->>'id';a:=fixture->>'a';b:=fixture->>'b';
  if gid is null or length(gid)>40 or gid=any(matched_ids) or
     coalesce(fixture->'sets','null'::jsonb)<>'[]'::jsonb or
     (fixture->>'scheduledTime') is not null then
    raise exception 'New fixtures must be unplayed and unscheduled';end if;
  matched_ids:=array_append(matched_ids,gid);
  if a is not null and not a=any(new_ids) or b is not null and not b=any(new_ids)
  then raise exception 'Match refers to a removed or unknown team';end if;
  if t.format='groups' then
   if fixture->>'phase'<>'group' or fixture->>'winner' is not null or
      a is null or b is null or a=b or
      coalesce(fixture->>'round','') !~ '^[1-9][0-9]*$'
   then raise exception 'Invalid group fixture';end if;
   select x->>'group' into a_group from jsonb_array_elements(p_state->'teams') x where x->>'id'=a;
   select x->>'group' into b_group from jsonb_array_elements(p_state->'teams') x where x->>'id'=b;
   if a_group is distinct from b_group or fixture->>'group' is distinct from a_group
   then raise exception 'Group match teams must belong to the same group';end if;
   pair:=least(a,b)||':'||greatest(a,b);
   if pair=any(seen_pairs) then raise exception 'Duplicate group match';end if;
   seen_pairs:=array_append(seen_pairs,pair);
  else
   if fixture->>'phase'<>'knockout' or
     coalesce(fixture->>'round','') !~ '^[1-9][0-9]*$' or
     coalesce(fixture->>'slot','') !~ '^[1-9][0-9]*$' or
     (fixture->>'round')::integer>r or
     (fixture->>'slot')::integer>power(2,r-(fixture->>'round')::integer) or
     gid is distinct from 'k'||(fixture->>'round')||'-'||(fixture->>'slot') or
     (fixture->>'winner' is not null and not (
        (fixture->>'round')::integer=1 and a is not null and b is null and fixture->>'winner'=a))
   then raise exception 'Invalid knockout fixture';end if;
   if (fixture->>'round')::integer=1 then
    if a is null then raise exception 'First-round match requires a team';end if;
    played_ids:=array_append(played_ids,a);
    if b is not null then played_ids:=array_append(played_ids,b);end if;
   end if;
  end if;
 end loop;
 if t.format='knockout' then
  if coalesce(array_length(played_ids,1),0)<>count_teams or
   (select count(distinct x) from unnest(played_ids) x)<>count_teams then
   raise exception 'Each team must enter the knockout once';end if;
 end if;
 update public.tournaments set state=p_state,version=version+1 where id=p_id
 returning version into v_version;
 return v_version;
end;
$function$;
revoke all on function public.tournament_resize_teams(uuid,bigint,jsonb)
 from public,anon,authenticated;
grant execute on function public.tournament_resize_teams(uuid,bigint,jsonb)
 to authenticated;
commit;