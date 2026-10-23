-- Active tournament state uses a single JSONB document per tournament.
-- No retained participant/match history after admin PDF-confirmed closure.
begin;
create table if not exists public.tournaments (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(btrim(name)) between 2 and 100),
 event_date date not null,
 start_time time without time zone not null,
 fee_cents bigint not null check (fee_cents between 0 and 100000000),
 format text not null check (format in ('groups','knockout')),
 state jsonb not null check (jsonb_typeof(state)='object' and pg_column_size(state)<250000),
 version bigint not null default 0,
 created_by uuid not null default auth.uid(),
 created_at timestamptz not null default now()
);
alter table public.tournaments enable row level security;
revoke all on public.tournaments from anon,authenticated;
grant select on public.tournaments to authenticated;
drop policy if exists tournament_staff_read on public.tournaments;
create policy tournament_staff_read on public.tournaments for select to authenticated
 using ((select public.is_staff()));

-- Return side 1 or 2. Reject incomplete, impossible, or extra padel sets.
create or replace function public.tournament_score_winner(p_sets jsonb)
returns integer language plpgsql immutable set search_path=public,pg_temp as $$
declare s jsonb; a integer; b integer; ta integer; tb integer;
        played integer; wa integer:=0; wb integer:=0;
begin
 if jsonb_typeof(p_sets)<>'array' or jsonb_array_length(p_sets) not in (2,3)
 then raise exception 'Record two or three completed sets'; end if;
 for s in select value from jsonb_array_elements(p_sets) loop
   if jsonb_typeof(s)<>'object' or
      coalesce(s->>'a','') !~ '^\d{1,2}$' or
      coalesce(s->>'b','') !~ '^\d{1,2}$'
   then raise exception 'Enter valid game scores for every set'; end if;
   a:=(s->>'a')::integer;b:=(s->>'b')::integer;
   if not ((a=6 and b between 0 and 4) or (b=6 and a between 0 and 4) or
           (a=7 and b=5) or (b=7 and a=5) or
           (a=7 and b=6) or (b=7 and a=6))
   then raise exception 'Set must end 6-0 through 6-4, 7-5, or 7-6'; end if;
   if (a=7 and b=6) or (b=7 and a=6) then
     if coalesce(s->>'ta','') !~ '^\d{1,3}$' or coalesce(s->>'tb','') !~ '^\d{1,3}$'
     then raise exception 'A 7-6 set needs both tie-break point scores'; end if;
     ta:=(s->>'ta')::integer;tb:=(s->>'tb')::integer;
     if not ((a>b and ta>=7 and ta-tb=2 and
                 ((ta=7 and tb<=5) or (ta>7 and ta-tb=2))) or
              (b>a and tb>=7 and tb-ta=2 and
                 ((tb=7 and ta<=5) or (tb>7 and tb-ta=2))))
       and not ((a>b and ta=7 and tb<6) or (b>a and tb=7 and ta<6))
     then raise exception 'Tie-break winner needs at least 7 points and a 2-point margin'; end if;
   else
     if s ? 'ta' or s ? 'tb' then raise exception 'Tie-break points only apply to 7-6 sets'; end if;
   end if;
   if a>b then wa:=wa+1;else wb:=wb+1;end if;
   if wa=2 or wb=2 then
     -- Winner cannot have played extra sets.
     if (wa+wb)<>jsonb_array_length(p_sets) then
       raise exception 'Match continues after two sets were won';
     end if;
   end if;
 end loop;
 if wa=2 and wb<2 then return 1;
 elsif wb=2 and wa<2 then return 2;
 else raise exception 'A match needs a winner of two sets'; end if;
end;
$$;

create or replace function public.tournament_create(
 p_name text,p_date date,p_time time,p_fee_cents bigint,
 p_format text,p_state jsonb
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid; v_teams jsonb; v_matches jsonb; v_team jsonb; v_member jsonb;
        v_seen text[]:=array[]::text[]; v_count integer;
begin
 if not public.is_staff() then raise exception 'Staff authorization required'; end if;
 if char_length(btrim(coalesce(p_name,''))) not between 2 and 100
 or p_date is null or p_time is null or p_format not in ('groups','knockout')
 or p_fee_cents is null or p_fee_cents not between 0 and 100000000
 then raise exception 'Invalid tournament settings'; end if;
 v_teams:=p_state->'teams';v_matches:=p_state->'matches';
 if jsonb_typeof(v_teams)<>'array' or jsonb_array_length(v_teams) not between 2 and 32
 or jsonb_typeof(v_matches)<>'array' or jsonb_array_length(v_matches)>300
 or pg_column_size(p_state)>200000 then
   raise exception 'Tournament must contain 2–32 teams and valid fixtures';
 end if;
 for v_team in select value from jsonb_array_elements(v_teams) loop
  if coalesce(v_team->>'id','') !~ '^t[1-9][0-9]*$'
   or v_team->>'id'=any(v_seen) or jsonb_typeof(v_team->'members')<>'array'
   or jsonb_array_length(v_team->'members')<>2
  then raise exception 'Each team requires two distinct members'; end if;
  v_seen:=array_append(v_seen,v_team->>'id');
  for v_member in select value from jsonb_array_elements(v_team->'members') loop
   if char_length(btrim(coalesce(v_member->>'name',''))) not between 2 and 100
   or coalesce(v_member->>'due','')<>p_fee_cents::text
   or coalesce(v_member->>'paid','')<>'0'
   then raise exception 'Each participant must have a name and initial participation fee'; end if;
  end loop;
 end loop;
 for v_team in select value from jsonb_array_elements(v_matches) loop
   if char_length(coalesce(v_team->>'id',''))>40
   or v_team->>'phase' not in ('group','knockout')
   or (v_team->>'a' is not null and not (v_team->>'a'=any(v_seen)))
   or (v_team->>'b' is not null and not (v_team->>'b'=any(v_seen)))
   or coalesce(v_team->'sets','[]'::jsonb)<>'[]'::jsonb
   or (v_team->>'winner') is not null
   then raise exception 'The tournament draw contains invalid matches'; end if;
 end loop;
 insert into public.tournaments(name,event_date,start_time,fee_cents,format,state)
 values(btrim(p_name),p_date,p_time,p_fee_cents,p_format,p_state)
 returning id into v_id;
 return v_id;
end;$$;

create or replace function public.tournament_change(
 p_id uuid,p_expected_version bigint,p_action text,p_data jsonb
) returns bigint language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments%rowtype; teams jsonb; matches jsonb; team jsonb; member jsonb; m jsonb;
 idx integer; j integer; k integer; value_cents bigint; previous bigint; due bigint; paid bigint;
 m_index integer; winner_side integer; w text; old_w text;
 r integer; pos integer; next_i integer; next_m jsonb; target_side text;
 seeds jsonb; seen text[]:=array[]::text[]; sid text;
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
   winner_side:=public.tournament_score_winner(p_data->'sets');
   w:=case when winner_side=1 then m->>'a' else m->>'b' end;
   old_w:=m->>'winner';
   if m->>'phase'='knockout' and old_w is distinct from w then
      r:=(m->>'round')::integer;pos:=(m->>'slot')::integer;
      for k in 0..jsonb_array_length(matches)-1 loop
       next_m:=matches->k;
       if next_m->>'phase'='knockout' and
          (next_m->>'round')::integer>r and next_m->>'winner' is not null
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
end;$$;

create or replace function public.tournament_close(p_id uuid,p_expected_version bigint)
returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tournaments%rowtype;
begin
 if not public.is_admin() then raise exception 'Only administrators may close tournaments';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version
 then raise exception 'Tournament changed. Refresh, download a new PDF and retry';end if;
 delete from public.tournaments where id=p_id;
 -- No scores, names, or financial account details retained after deletion.
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'DELETE','tournaments',p_id::text,
   jsonb_build_object('name',t.name,'date',t.event_date),null);
end;$$;

revoke all on function public.tournament_score_winner(jsonb) from public,anon;
revoke all on function public.tournament_create(text,date,time,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.tournament_change(uuid,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.tournament_close(uuid,bigint) from public,anon,authenticated;
grant execute on function public.tournament_create(text,date,time,bigint,text,jsonb) to authenticated;
grant execute on function public.tournament_change(uuid,bigint,text,jsonb) to authenticated;
grant execute on function public.tournament_close(uuid,bigint) to authenticated;
commit;