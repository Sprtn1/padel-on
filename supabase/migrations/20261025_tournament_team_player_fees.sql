-- Per-player Team Player fees for new tournaments only.
-- Existing tournaments, player IDs, payments and participant dues are unchanged.
begin;
CREATE OR REPLACE FUNCTION public.tournament_create(p_name text, p_date date, p_time time without time zone, p_fee_cents bigint, p_format text, p_state jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_id uuid; v_teams jsonb; v_matches jsonb; v_team jsonb; v_member jsonb;
        v_seen text[]:=array[]::text[]; v_count integer;
        v_first_team boolean; v_second_team boolean;
        v_first_due bigint; v_second_due bigint; v_slot integer;
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
  -- Existing clients without this field are treated as two regular players.
  if jsonb_typeof(coalesce(v_team->'members'->0->'teamPlayer','false'::jsonb))<>'boolean'
     or jsonb_typeof(coalesce(v_team->'members'->1->'teamPlayer','false'::jsonb))<>'boolean'
  then raise exception 'Team Player must be a checkbox'; end if;
  v_first_team:=coalesce((v_team->'members'->0->>'teamPlayer')::boolean,false);
  v_second_team:=coalesce((v_team->'members'->1->>'teamPlayer')::boolean,false);
  -- If both qualify, allocate an odd cent to the second player.
  v_first_due:=case when v_first_team and v_second_team then p_fee_cents/2
                    when v_first_team then 0 else p_fee_cents end;
  v_second_due:=case when v_first_team and v_second_team then p_fee_cents-v_first_due
                     when v_second_team then 0 else p_fee_cents end;
  v_slot:=0;
  for v_member in select value from jsonb_array_elements(v_team->'members') loop
   v_slot:=v_slot+1;
   if char_length(btrim(coalesce(v_member->>'name',''))) not between 2 and 100
   or coalesce(v_member->>'due','')<>(case when v_slot=1 then v_first_due else v_second_due end)::text
   or coalesce(v_member->>'paid','')<>'0'
   then raise exception 'Each participant must have a name and the correct Team Player participation fee'; end if;
  end loop;
 end loop;
 for v_team in select value from jsonb_array_elements(v_matches) loop
   if char_length(coalesce(v_team->>'id',''))>40
   or v_team->>'phase' not in ('group','knockout')
   or (v_team->>'a' is not null and not (v_team->>'a'=any(v_seen)))
   or (v_team->>'b' is not null and not (v_team->>'b'=any(v_seen)))
   or coalesce(v_team->'sets','[]'::jsonb)<>'[]'::jsonb
   or (v_team->>'winner') is not null and not (
       p_format='knockout' and v_team->>'phase'='knockout' and
       v_team->>'winner'=v_team->>'a' and v_team->>'b' is null and
       v_team->>'round'='1'
     )
   then raise exception 'The tournament draw contains invalid matches'; end if;
 end loop;
 insert into public.tournaments(name,event_date,start_time,fee_cents,format,state)
 values(btrim(p_name),p_date,p_time,p_fee_cents,p_format,p_state)
 returning id into v_id;
 return v_id;
end;$function$

revoke all on function public.tournament_create(text,date,time,bigint,text,jsonb) from public,anon,authenticated;
grant execute on function public.tournament_create(text,date,time,bigint,text,jsonb) to authenticated;
commit;
