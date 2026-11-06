
-- New V2 RPCs coexist with legacy tournament_create/tournament_change.
-- Existing group/knockout scoring, member payments and historical IDs are untouched.

create function public.tournament_validate_v2_settings(
 p_settings jsonb,p_format text,p_count integer,p_fee_cents bigint
) returns void language plpgsql stable
 set search_path=pg_catalog,public as $$
declare c jsonb;v_rule jsonb;seen text[]:=array[]::text[];v_deadline timestamptz;
 v_entry integer;v_group integer;v_qualifiers integer;v_points integer;v_rounds integer;
begin
 if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object' or
  pg_column_size(p_settings)>=15000 or p_settings->>'engine_version'<>'2' then
  raise exception 'Invalid tournament version settings';end if;
 if p_settings->>'registration_mode' is distinct from 'staff' or
    p_settings->>'publication_status' not in ('draft','published_internal') or
    p_settings->>'prize_mode' not in ('tba','announced') or
    p_settings->>'fee_mode' not in ('paid','free') then
  raise exception 'Only private staff-managed tournaments are supported';end if;
 if (p_settings->>'fee_mode'='free' and p_fee_cents<>0)
    or (p_settings->>'fee_mode'='paid' and p_fee_cents<=0) then
  raise exception 'Paid/Free selection does not match the entry fee';end if;
 if p_settings->>'group_size' !~ '^[0-9]{1,2}$' or
    p_settings->>'qualifiers_per_group' !~ '^[0-9]{1,2}$' or
    p_settings->>'entry_limit' !~ '^[0-9]{1,2}$' then
  raise exception 'Invalid tournament group or team limits';end if;
 v_group:=(p_settings->>'group_size')::integer;
 v_qualifiers:=(p_settings->>'qualifiers_per_group')::integer;
 v_entry:=(p_settings->>'entry_limit')::integer;
 if v_group not between 2 and 8 or v_qualifiers not between 1 and v_group or
    v_entry not between p_count and 32 then
  raise exception 'Invalid group size, qualifiers or entry cap';end if;
 c:=p_settings->'courts';
 if jsonb_typeof(c) is distinct from 'array' or jsonb_array_length(c) not between 1 and 3 or
    exists(select 1 from jsonb_array_elements_text(c) x where x not in ('C1','C2','C3')) or
    (select count(distinct x) from jsonb_array_elements_text(c) x)<>jsonb_array_length(c) then
  raise exception 'Select 1–3 available courts';end if;
 if coalesce(p_settings->>'points_per_match','') !~ '^[0-9]{1,3}$' or
    coalesce(p_settings->>'rounds','') !~ '^[0-9]{1,2}$' or
    coalesce(p_settings->>'match_minutes','') !~ '^[0-9]{1,3}$' then
  raise exception 'Invalid Americano scoring or schedule';end if;
 v_points:=(p_settings->>'points_per_match')::integer;
 v_rounds:=(p_settings->>'rounds')::integer;
 if v_points not between 4 and 100 or mod(v_points,2)<>0 or
    v_rounds not between 1 and 31 or (p_settings->>'match_minutes')::integer not between 10 and 120 then
  raise exception 'Invalid Americano points, rounds or duration';end if;
 if p_settings->>'registration_deadline' is not null then
  begin v_deadline:=(p_settings->>'registration_deadline')::timestamptz;
  exception when others then raise exception 'Invalid registration deadline';end;
 end if;
 if char_length(coalesce(p_settings->>'prize_text',''))>1000 then
  raise exception 'Prize announcement too long';end if;
 c:=p_settings->'rules';
 if jsonb_typeof(c) is distinct from 'array' or jsonb_array_length(c)>16 then
  raise exception 'Invalid published tournament rules';end if;
 for v_rule in select value from jsonb_array_elements(c) loop
  if coalesce(v_rule->>'key','') !~ '^[a-z][a-z0-9_-]{1,39}$' or
   coalesce(v_rule->>'text','')='' or char_length(v_rule->>'text')>500 or
   jsonb_typeof(v_rule->'enabled') is distinct from 'boolean' or
   v_rule->>'key'=any(seen) then
   raise exception 'Invalid rule';end if;
  seen:=array_append(seen,v_rule->>'key');
 end loop;
end$$;
revoke all on function public.tournament_validate_v2_settings(jsonb,text,integer,bigint) from public,anon;
grant execute on function public.tournament_validate_v2_settings(jsonb,text,integer,bigint) to authenticated;

create function public.tournament_create_v2(
 p_name text,p_date date,p_time time without time zone,p_fee_cents bigint,
 p_format text,p_state jsonb,p_group_scoring text,p_knockout_scoring text,p_settings jsonb
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_id uuid;v_teams jsonb;v_matches jsonb;v_team jsonb;v_member jsonb;v_match jsonb;
 v_team_ids text[]:=array[]::text[];v_member_ids text[]:=array[]::text[];
 v_visited text[]:=array[]::text[];v_id_text text;v_slot integer;v_count integer;
 v_player_count integer;v_due1 bigint;v_due2 bigint;v_t1 boolean;v_t2 boolean;
 v_side jsonb;v_player text;v_round integer;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100 or
   p_date is null or p_time is null or p_fee_cents not between 0 and 100000000 or
   p_format not in ('groups','knockout','americano_individual','americano_team') or
   p_group_scoring not in ('best_of_3','pro_8','pro_9') or
   p_knockout_scoring not in ('best_of_3','pro_8','pro_9') then
  raise exception 'Invalid tournament details';end if;
 if p_format<>'groups' and p_group_scoring<>'best_of_3' then
  raise exception 'Group scoring is not applicable to this format';end if;
 v_teams:=p_state->'teams';v_matches:=p_state->'matches';
 if p_state is null or jsonb_typeof(p_state) is distinct from 'object' or
  p_state->>'mode' is distinct from p_format or
  jsonb_typeof(v_teams) is distinct from 'array' or
  jsonb_typeof(v_matches) is distinct from 'array' or
  jsonb_array_length(v_matches)>300 or pg_column_size(p_state)>=200000 then
  raise exception 'Invalid tournament draw';end if;
 v_count:=jsonb_array_length(v_teams);
 if v_count not between (case when p_format='americano_individual' then 4 else 2 end) and 32 then
  raise exception 'Incorrect number of tournament entries';end if;
 perform public.tournament_validate_v2_settings(p_settings,p_format,v_count,p_fee_cents);
 if p_format in ('groups','knockout') then
  -- Legacy create validates names, dues, Team Player flags, and match references.
  v_id:=public.tournament_create(p_name,p_date,p_time,p_fee_cents,
    p_format,p_state,p_group_scoring,p_knockout_scoring);
 else
  v_player_count:=case when p_format='americano_individual' then 1 else 2 end;
  for v_team in select value from jsonb_array_elements(v_teams) loop
   v_id_text:=v_team->>'id';
   if coalesce(v_id_text,'') !~ '^t[1-9][0-9]{0,5}$' or
     v_id_text=any(v_team_ids) or jsonb_typeof(v_team->'members') is distinct from 'array'
     or jsonb_array_length(v_team->'members')<>v_player_count then
    raise exception 'Invalid or duplicate Americano participant';end if;
   v_team_ids:=array_append(v_team_ids,v_id_text);
   v_t1:=coalesce((v_team->'members'->0->>'teamPlayer')::boolean,false);
   v_t2:=coalesce((v_team->'members'->1->>'teamPlayer')::boolean,false);
   v_due1:=case when v_player_count=1 and v_t1 then 0
     when v_t1 and v_t2 then p_fee_cents/2 when v_t1 then 0 else p_fee_cents end;
   v_due2:=case when v_t1 and v_t2 then p_fee_cents-v_due1
     when v_t2 then 0 else p_fee_cents end;
   v_slot:=0;
   for v_member in select value from jsonb_array_elements(v_team->'members') loop
    v_slot:=v_slot+1;v_id_text:=v_member->>'id';
    if coalesce(v_id_text,'') !~ '^p[1-9][0-9]{0,5}$' or
       v_id_text=any(v_member_ids) or
       char_length(btrim(coalesce(v_member->>'name',''))) not between 2 and 100 or
       coalesce(v_member->>'due','') <>
       (case when v_slot=1 then v_due1 else v_due2 end)::text or
       coalesce(v_member->>'paid','')<>'0' then
     raise exception 'Invalid Americano name, member ID or participation fee';end if;
    v_member_ids:=array_append(v_member_ids,v_id_text);
   end loop;
  end loop;
  for v_match in select value from jsonb_array_elements(v_matches) loop
   v_id_text:=v_match->>'id';
   v_round:=coalesce((v_match->>'round')::integer,0);
   if coalesce(v_id_text,'') !~ '^a[1-9][0-9]{0,5}$' or
      v_id_text=any(v_visited) or v_match->>'phase' is distinct from 'americano' or
      v_round not between 1 and (p_settings->>'rounds')::integer or
      v_match->>'played' is distinct from 'false' or
      v_match->>'scoreA' is not null or v_match->>'scoreB' is not null or
      v_match->>'winner' is not null or
      v_match->>'scheduledCourt' not in ('C1','C2','C3') or
      not (p_settings->'courts') ? (v_match->>'scheduledCourt') then
    raise exception 'Invalid or duplicate Americano fixture';end if;
   v_visited:=array_append(v_visited,v_id_text);
   if p_format='americano_team' then
    if not (v_match->>'a'=any(v_team_ids)) or not (v_match->>'b'=any(v_team_ids))
      or v_match->>'a'=v_match->>'b' then
     raise exception 'Americano fixture requires two valid teams';end if;
   else
    if jsonb_typeof(v_match->'playersA') is distinct from 'array' or
       jsonb_typeof(v_match->'playersB') is distinct from 'array' or
       jsonb_array_length(v_match->'playersA')<>2 or
       jsonb_array_length(v_match->'playersB')<>2 then
     raise exception 'Individual fixtures require four players';end if;
    for v_side in select value from jsonb_array_elements(v_match->'playersA'||
     v_match->'playersB') loop
     v_player:=v_side#>>'{}';
     if not v_player=any(v_team_ids) then
      raise exception 'Individual fixture references an unknown player';end if;
     if v_round::text||':'||v_player=any(v_visited) then
      raise exception 'One player appears twice in an Americano round';end if;
     v_visited:=array_append(v_visited,v_round::text||':'||v_player);
    end loop;
   end if;
  end loop;
  insert into public.tournaments(name,event_date,start_time,fee_cents,format,state,
   group_scoring,knockout_scoring,settings)
  values(btrim(p_name),p_date,p_time,p_fee_cents,p_format,p_state,
   p_group_scoring,p_knockout_scoring,p_settings) returning id into v_id;
 end if;
 if p_format in ('groups','knockout') then
  update public.tournaments set settings=p_settings where id=v_id;
 end if;
 return v_id;
end$$;
revoke all on function public.tournament_create_v2(text,date,time without time zone,bigint,text,jsonb,text,text,jsonb) from public,anon;
grant execute on function public.tournament_create_v2(text,date,time without time zone,bigint,text,jsonb,text,text,jsonb) to authenticated;

create function public.tournament_americano_score(
 p_id uuid,p_expected_version bigint,p_match_id text,p_score_a integer,p_score_b integer
) returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 t public.tournaments%rowtype;ms jsonb;m jsonb;v_index integer:=-1;
 i integer;v_points integer;v_version bigint;v_winner text;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then raise exception 'Tournament changed. Refresh before saving';end if;
 if t.format not in ('americano_individual','americano_team') then raise exception 'Not an Americano tournament';end if;
 v_points:=(t.settings->>'points_per_match')::integer;
 if p_score_a is null or p_score_b is null or
  p_score_a not between 0 and v_points or p_score_b not between 0 and v_points or
  p_score_a+p_score_b<>v_points then
  raise exception 'Americano scores must total exactly % points',v_points;end if;
 ms:=t.state->'matches';
 for i in 0..jsonb_array_length(ms)-1 loop
  if ms->i->>'id'=p_match_id then
   if v_index<>-1 then raise exception 'Duplicate Americano fixture';end if;
   v_index:=i;
  end if;
 end loop;
 if v_index<0 then raise exception 'Americano fixture not found';end if;
 m:=ms->v_index;
 if m->>'phase' not in ('americano','americano_final') then
  raise exception 'Not an Americano points match';end if;
 if m->>'phase'='americano' and exists(
  select 1 from jsonb_array_elements(ms) fixture where fixture->>'phase' in ('americano_final','knockout')) then
  raise exception 'The Americano rounds are locked after the final is generated';end if;
 m:=jsonb_set(m,'{scoreA}',to_jsonb(p_score_a),true);
 m:=jsonb_set(m,'{scoreB}',to_jsonb(p_score_b),true);
 m:=jsonb_set(m,'{played}','true'::jsonb,true);
 v_winner:=case when p_score_a=p_score_b then null::text when p_score_a>p_score_b then m->>'a' else m->>'b' end;
 m:=jsonb_set(m,'{winner}',coalesce(to_jsonb(v_winner),'null'::jsonb),true);
 ms:=jsonb_set(ms,array[v_index::text],m);
 update public.tournaments set state=jsonb_set(t.state,'{matches}',ms),version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end$$;
revoke all on function public.tournament_americano_score(uuid,bigint,text,integer,integer) from public,anon;
grant execute on function public.tournament_americano_score(uuid,bigint,text,integer,integer) to authenticated;

create function public.tournament_americano_start_final(
 p_id uuid,p_expected_version bigint
) returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 t public.tournaments%rowtype;v_ranked text[];v_top text[];v_id text;v_version bigint;
 v_matches jsonb;v_first jsonb;v_second jsonb;v_final jsonb;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then raise exception 'Tournament changed. Refresh before saving';end if;
 if t.format not in ('americano_individual','americano_team') or
    t.settings->>'playoffs' is distinct from 'true' then
  raise exception 'The Americano final is not enabled';end if;
 v_matches:=t.state->'matches';
 if exists(select 1 from jsonb_array_elements(v_matches) x
   where x->>'phase'='americano' and coalesce(x->>'played','false')<>'true') then
  raise exception 'Finish every Americano round first';end if;
 if exists(select 1 from jsonb_array_elements(v_matches) x
   where x->>'phase' in ('knockout','americano_final')) then
  raise exception 'The Americano final is already generated';end if;
 if jsonb_array_length(t.state->'teams')<4 then
  raise exception 'The final requires four entries';end if;
 -- Rankings are calculated from SAVED scores by the database (not supplied by
 -- the browser). Unequal completed-match totals are compared using averages.
 with contestants as (
  select team->>'id' as id from jsonb_array_elements(t.state->'teams') team
 ), performance as (
  select c.id,
   coalesce(sum(case when
     (t.format='americano_team' and m->>'a'=c.id) or
     (t.format='americano_individual' and (m->'playersA') ? c.id)
       then (m->>'scoreA')::integer
     when (t.format='americano_team' and m->>'b'=c.id) or
     (t.format='americano_individual' and (m->'playersB') ? c.id)
       then (m->>'scoreB')::integer else 0 end),0) points,
   coalesce(sum(case when
     (t.format='americano_team' and m->>'a'=c.id) or
     (t.format='americano_individual' and (m->'playersA') ? c.id)
       then (m->>'scoreA')::integer-(m->>'scoreB')::integer
     when (t.format='americano_team' and m->>'b'=c.id) or
     (t.format='americano_individual' and (m->'playersB') ? c.id)
       then (m->>'scoreB')::integer-(m->>'scoreA')::integer else 0 end),0) diff,
   count(*) filter(where
     (t.format='americano_team' and (m->>'a'=c.id or m->>'b'=c.id)) or
     (t.format='americano_individual' and
       ((m->'playersA') ? c.id or (m->'playersB') ? c.id))) played
  from contestants c cross join lateral jsonb_array_elements(v_matches) m
  where m->>'phase'='americano' and m->>'played'='true'
  group by c.id
 )
 select array_agg(id order by points::numeric/greatest(played,1) desc,diff desc,id)
 into v_ranked from performance;
 v_top:=v_ranked[1:4];
 if v_top is null or array_length(v_top,1)<>4 then raise exception 'Unable to rank finalists';end if;
 if t.format='americano_team' then
  v_first:=jsonb_build_object('id','k1-1','phase','knockout','round',1,'slot',1,
   'group',null,'a',v_top[1],'b',v_top[4],'sets','[]'::jsonb,'winner',null);
  v_second:=jsonb_build_object('id','k1-2','phase','knockout','round',1,'slot',2,
   'group',null,'a',v_top[2],'b',v_top[3],'sets','[]'::jsonb,'winner',null);
  v_final:=jsonb_build_object('id','k2-1','phase','knockout','round',2,'slot',1,
   'group',null,'a',null,'b',null,'sets','[]'::jsonb,'winner',null);
  v_matches:=v_matches||jsonb_build_array(v_first,v_second,v_final);
 else
  -- Individual final is one championship points round. All four players keep
  -- individual rankings, including the points scored in this final.
  v_final:=jsonb_build_object('id','af1','phase','americano_final','round',1,'slot',1,
   'a',v_top[1]||'+'||v_top[4],'b',v_top[2]||'+'||v_top[3],
   'playersA',jsonb_build_array(v_top[1],v_top[4]),
   'playersB',jsonb_build_array(v_top[2],v_top[3]),
   'scoreA',null,'scoreB',null,'played',false,'winner',null);
  v_matches:=v_matches||jsonb_build_array(v_final);
 end if;
 update public.tournaments set state=jsonb_set(t.state,'{matches}',v_matches),version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end$$;
revoke all on function public.tournament_americano_start_final(uuid,bigint) from public,anon;
grant execute on function public.tournament_americano_start_final(uuid,bigint) to authenticated;

create function public.tournament_americano_set_schedule(
 p_id uuid,p_expected_version bigint,p_match_id text,p_time text,p_court text
) returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 t public.tournaments%rowtype;ms jsonb;m jsonb;idx integer:=-1;
 i integer;v_version bigint;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 if p_time is not null and p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
  raise exception 'Invalid match time';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then raise exception 'Tournament changed. Refresh before saving';end if;
 if t.format not in ('americano_individual','americano_team') then raise exception 'Not an Americano tournament';end if;
 if p_court is not null and not (t.settings->'courts') ? p_court then
  raise exception 'Court is not enabled for this tournament';end if;
 ms:=t.state->'matches';
 for i in 0..jsonb_array_length(ms)-1 loop
  if ms->i->>'id'=p_match_id then idx:=i;exit;end if;
 end loop;
 if idx<0 then raise exception 'Fixture not found';end if;
 m:=ms->idx;
 if m->>'played'='true' then raise exception 'Played fixtures cannot be rescheduled';end if;
 if m->>'phase' not in ('americano','americano_final','knockout') then raise exception 'Unsupported fixture';end if;
 m:=case when p_time is null then m-'scheduledTime' else jsonb_set(m,'{scheduledTime}',to_jsonb(p_time)) end;
 m:=case when p_court is null then m-'scheduledCourt' else jsonb_set(m,'{scheduledCourt}',to_jsonb(p_court)) end;
 ms:=jsonb_set(ms,array[idx::text],m);
 update public.tournaments set state=jsonb_set(t.state,'{matches}',ms),version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end$$;
revoke all on function public.tournament_americano_set_schedule(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.tournament_americano_set_schedule(uuid,bigint,text,text,text) to authenticated;
