-- Configurable group-stage match scoring, without modifying existing results.
begin;
alter table public.tournaments
 add column if not exists group_scoring text not null default 'best_of_3'
 check (group_scoring in ('best_of_3','pro_8','pro_9'));

-- A Pro Set is a SINGLE first-to-8 or first-to-9 game set.
-- Knockout matches still use the existing best-of-three validator.
create or replace function public.tournament_group_score_winner(p_sets jsonb,p_scoring text)
returns integer language plpgsql immutable set search_path=public,pg_temp
as $group_score$
declare v_target integer; v_set jsonb; v_a integer; v_b integer;
begin
 if p_scoring='best_of_3' then return public.tournament_score_winner(p_sets); end if;
 if p_scoring not in ('pro_8','pro_9') or p_scoring is null then
  raise exception 'Invalid group stage scoring format';
 end if;
 v_target:=case when p_scoring='pro_8' then 8 else 9 end;
 if jsonb_typeof(p_sets) is distinct from 'array'
    or jsonb_array_length(p_sets)<>1 then
  raise exception 'Pro Set requires exactly one completed set';
 end if;
 v_set:=p_sets->0;
 if jsonb_typeof(v_set) is distinct from 'object'
    or (select count(*) from jsonb_object_keys(v_set))<>2
    or jsonb_typeof(v_set->'a') is distinct from 'number'
    or jsonb_typeof(v_set->'b') is distinct from 'number'
    or coalesce(v_set->>'a','') !~ '^[0-9]{1,2}$'
    or coalesce(v_set->>'b','') !~ '^[0-9]{1,2}$' then
   raise exception 'Enter a valid Pro Set score without tie-break fields';
 end if;
 v_a:=(v_set->>'a')::integer;v_b:=(v_set->>'b')::integer;
 if (v_a=v_target and v_b>=0 and v_b<v_target) then return 1;end if;
 if (v_b=v_target and v_a>=0 and v_a<v_target) then return 2;end if;
 raise exception 'Pro Set ends when the first team reaches % games',v_target;
end;
$group_score$;
revoke all on function public.tournament_group_score_winner(jsonb,text) from public,anon,authenticated;
grant execute on function public.tournament_group_score_winner(jsonb,text) to authenticated;

-- Atomically create a group tournament with a chosen format. Preserve the
-- six-argument RPC for existing clients and its existing financial validation.
create function public.tournament_create(
 p_name text,p_date date,p_time time,p_fee_cents bigint,
 p_format text,p_state jsonb,p_group_scoring text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $create_group$
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Staff authorization required';
 end if;
 if p_group_scoring not in ('best_of_3','pro_8','pro_9') or p_group_scoring is null
    or (p_format<>'groups' and p_group_scoring<>'best_of_3') then
  raise exception 'Invalid group stage scoring format';
 end if;
 v_id:=public.tournament_create(p_name,p_date,p_time,p_fee_cents,p_format,p_state);
 update public.tournaments set group_scoring=p_group_scoring where id=v_id;
 return v_id;
end;
$create_group$;
revoke all on function public.tournament_create(text,date,time,bigint,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.tournament_create(text,date,time,bigint,text,jsonb,text) to authenticated;

-- Change format only while the GROUP STAGE remains entirely unscored.
-- No teams, notes, match times, payment amounts, or shuffle PINs are modified.
create function public.tournament_set_group_scoring(
 p_id uuid,p_expected_version bigint,p_group_scoring text
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $edit_group$
declare t public.tournaments%rowtype;v_version bigint;
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament changed on another device. Refresh before saving';
 end if;
 if t.format<>'groups' or t.state->>'mode' is distinct from 'groups' then
  raise exception 'Group scoring applies only to group tournaments';
 end if;
 if p_group_scoring not in ('best_of_3','pro_8','pro_9') or p_group_scoring is null then
  raise exception 'Invalid group stage scoring format';
 end if;
 if coalesce(t.state->>'knockoutSeeded','false')='true'
    or exists(select 1 from jsonb_array_elements(t.state->'matches') m
      where m.value->>'phase'<>'group'
       or m.value->>'winner' is not null
       or jsonb_array_length(coalesce(m.value->'sets','[]'::jsonb))>0) then
  raise exception 'Group scoring cannot be changed after scores are recorded or knockout starts';
 end if;
 if t.group_scoring=p_group_scoring then return t.version;end if;
 update public.tournaments set group_scoring=p_group_scoring,version=version+1
  where id=p_id returning version into v_version;
 return v_version;
end;
$edit_group$;
revoke all on function public.tournament_set_group_scoring(uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.tournament_set_group_scoring(uuid,bigint,text) to authenticated;

-- Retain all existing tournament_change branches and behavior; change only
-- score winner validation for group-stage matches.
CREATE OR REPLACE FUNCTION public.tournament_change(p_id uuid, p_expected_version bigint, p_action text, p_data jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare t public.tournaments%rowtype; teams jsonb; matches jsonb; team jsonb; member jsonb; m jsonb;
 idx integer; j integer; k integer; value_cents bigint; previous bigint; due bigint; paid bigint;
 m_index integer; winner_side integer; w text; old_w text;
 r integer; pos integer; next_i integer; next_m jsonb; target_side text;
 seeds jsonb; seen text[]:=array[]::text[]; sid text;
 root_round integer; scan_round integer; scan_slot integer; branch_idx integer;
 child_left jsonb; child_right jsonb; branch jsonb; branch_winner text;
 available_a integer; available_b integer; field_a text; field_b text;
begin
 if not public.is_staff() then raise exception 'Staff authorization required'; end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found. It may have been closed'; end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament changed on another device. Refresh before saving'; end if;
 teams:=t.state->'teams';matches:=t.state->'matches';
 if p_action in ('due','pay') then
   if coalesce(p_data->>'team','')='' or coalesce(p_data->>'member','')='' or
      coalesce(p_data->>'amount','') !~ '^\d{1,11}$' then
     raise exception 'Invalid participant or amount'; end if;
   value_cents:=(p_data->>'amount')::bigint;
   if value_cents>100000000 then raise exception 'Amount exceeds the allowed limit'; end if;
   idx:=-1;j:=-1;
   for k in 0..jsonb_array_length(teams)-1 loop
    if teams->k->>'id'=p_data->>'team' then idx:=k; exit; end if;
   end loop;
   if idx<0 then raise exception 'Team not found'; end if;
   for k in 0..1 loop
    if teams->idx->'members'->k->>'id'=p_data->>'member' then j:=k; exit; end if;
   end loop;
   if j<0 then raise exception 'Participant not found'; end if;
   due:=(teams->idx->'members'->j->>'due')::bigint;
   paid:=(teams->idx->'members'->j->>'paid')::bigint;
   if p_action='due' then
    teams:=jsonb_set(teams,array[idx::text,'members',j::text,'due'],to_jsonb(value_cents));
   else
    if value_cents=0 or paid+value_cents>due then
     raise exception 'Payment must be positive and cannot exceed remaining amount'; end if;
    teams:=jsonb_set(teams,array[idx::text,'members',j::text,'paid'],to_jsonb(paid+value_cents));
   end if;
   t.state:=jsonb_set(t.state,'{teams}',teams);
 elsif p_action='score' then
   m_index:=-1;
   for k in 0..jsonb_array_length(matches)-1 loop
    if matches->k->>'id'=p_data->>'match' then m_index:=k;exit;end if;
   end loop;
   if m_index<0 then raise exception 'Match not found'; end if;
   m:=matches->m_index;
   if coalesce(m->>'a','')='' or coalesce(m->>'b','')='' then
     raise exception 'Both teams must be assigned before recording a result';end if;
   if m->>'phase'='group' and coalesce(t.state->>'knockoutSeeded','false')='true'
   then raise exception 'Group scores are locked after the knockout draw';end if;
   winner_side:=case when m->>'phase'='group'
    then public.tournament_group_score_winner(p_data->'sets',t.group_scoring)
    else public.tournament_score_winner(p_data->'sets') end;
   w:=case when winner_side=1 then m->>'a' else m->>'b' end;
   old_w:=m->>'winner';
   if m->>'phase'='knockout' and old_w is distinct from w then
      r:=(m->>'round')::integer;pos:=(m->>'slot')::integer;
      for k in 0..jsonb_array_length(matches)-1 loop
       next_m:=matches->k;
       if next_m->>'phase'='knockout' and
          (next_m->>'round')::integer>r and
          jsonb_array_length(coalesce(next_m->'sets','[]'::jsonb))>0
       then raise exception 'Cannot change a winner after subsequent knockout results are recorded';end if;
      end loop;
   end if;
   m:=jsonb_set(m,'{sets}',p_data->'sets');
   m:=jsonb_set(m,'{winner}',to_jsonb(w));
   matches:=jsonb_set(matches,array[m_index::text],m);
   if m->>'phase'='knockout' then
     r:=(m->>'round')::integer;pos:=(m->>'slot')::integer;
     next_i:=-1;
     for k in 0..jsonb_array_length(matches)-1 loop
       if matches->k->>'phase'='knockout' and
          (matches->k->>'round')::integer=r+1 and
          (matches->k->>'slot')::integer=(pos+1)/2
       then next_i:=k;exit;end if;
     end loop;
     if next_i>=0 then
       target_side:=case when pos%2=1 then 'a' else 'b' end;
       next_m:=jsonb_set(matches->next_i,array[target_side],to_jsonb(w));
       matches:=jsonb_set(matches,array[next_i::text],next_m);
     end if;
   end if;

   -- A directly seeded team reserves a later-round slot. Recalculate the
   -- entire upstream pyramid after every played knockout match, carrying
   -- winners through automatic walkovers without overwriting locked seeds.
   if m->>'phase'='knockout' and m ? 'possibleA' then
     select max((x.value->>'round')::integer) into root_round
       from jsonb_array_elements(matches) x where x.value->>'phase'='knockout';
     for scan_round in (m->>'round')::integer+1..root_round loop
       for scan_slot in 1..(power(2,root_round-scan_round)::integer) loop
         branch_idx:=-1;child_left:=null;child_right:=null;
         for k in 0..jsonb_array_length(matches)-1 loop
           branch:=matches->k;
           if branch->>'phase'='knockout' then
             if (branch->>'round')::integer=scan_round and (branch->>'slot')::integer=scan_slot
             then branch_idx:=k;end if;
             if (branch->>'round')::integer=scan_round-1 then
               if (branch->>'slot')::integer=scan_slot*2-1 then child_left:=branch;end if;
               if (branch->>'slot')::integer=scan_slot*2 then child_right:=branch;end if;
             end if;
           end if;
         end loop;
         if branch_idx<0 or child_left is null or child_right is null
         then raise exception 'Incomplete knockout bracket structure';end if;
         branch:=matches->branch_idx;
         field_a:=coalesce(branch->>'seedA',child_left->>'winner');
         field_b:=coalesce(branch->>'seedB',child_right->>'winner');
         branch:=jsonb_set(branch,'{a}',coalesce(to_jsonb(field_a),'null'::jsonb));
         branch:=jsonb_set(branch,'{b}',coalesce(to_jsonb(field_b),'null'::jsonb));
         available_a:=(branch->>'possibleA')::integer;
         available_b:=(branch->>'possibleB')::integer;
         if jsonb_array_length(coalesce(branch->'sets','[]'::jsonb))=0 then
           branch_winner:=case when available_a>0 and available_b=0 then field_a
                               when available_b>0 and available_a=0 then field_b
                               else null end;
           branch:=jsonb_set(branch,'{winner}',coalesce(to_jsonb(branch_winner),'null'::jsonb));
         end if;
         matches:=jsonb_set(matches,array[branch_idx::text],branch);
       end loop;
     end loop;
   end if;
   t.state:=jsonb_set(t.state,'{matches}',matches);
 elsif p_action='seed' then
   if t.format<>'groups' or coalesce(t.state->>'knockoutSeeded','false')='true'
   then raise exception 'Knockout stage is already generated or not needed';end if;
   for m in select value from jsonb_array_elements(matches) loop
     if m->>'phase'='group' and m->>'winner' is null
     then raise exception 'Finish every group match before generating knockout';end if;
   end loop;
   seeds:=p_data->'seeds';
   if jsonb_typeof(seeds)<>'array' or jsonb_array_length(seeds) not between 2 and 32
   then raise exception 'Invalid knockout qualification';end if;
   for m in select value from jsonb_array_elements(seeds) loop
    sid:=m#>>'{}';
    if sid=any(seen) or not exists(select 1 from jsonb_array_elements(teams) x where x->>'id'=sid)
    then raise exception 'Duplicate or invalid knockout seed';end if;
    seen:=array_append(seen,sid);
   end loop;
   -- Client passes matches generated by deterministic bracket code. Only staff
   -- can seed and all group fixtures are retained unmodified.
   if jsonb_typeof(p_data->'matches')<>'array' or
      jsonb_array_length(p_data->'matches')>70 then
    raise exception 'Invalid knockout bracket';end if;
   for m in select value from jsonb_array_elements(p_data->'matches') loop
     if m->>'phase'<>'knockout' or
      (m->>'a' is not null and not (m->>'a'=any(seen))) or
      (m->>'b' is not null and not (m->>'b'=any(seen))) or
      coalesce(m->'sets','[]'::jsonb)<>'[]'::jsonb
     then raise exception 'Invalid knockout bracket match';end if;
   end loop;
   t.state:=jsonb_set(t.state,'{matches}',matches||(p_data->'matches'));
   t.state:=jsonb_set(t.state,'{knockoutSeeded}','true'::jsonb);
 else
   raise exception 'Unsupported tournament action';
 end if;
 update public.tournaments set state=t.state,version=version+1 where id=p_id
 returning version into previous;
 return previous;
end;$function$
;
revoke all on function public.tournament_change(uuid,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.tournament_change(uuid,bigint,text,jsonb) to authenticated;
commit;
