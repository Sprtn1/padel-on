-- Shared match time editing for group and knockout fixtures.
begin;
CREATE OR REPLACE FUNCTION public.tournament_set_match_time(p_id uuid, p_expected_version bigint, p_match_id text, p_time text)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  t public.tournaments%rowtype;
  v_matches jsonb;
  v_match jsonb;
  v_index integer := -1;
  v_i integer;
  v_version bigint;
begin
  if auth.uid() is null or not public.is_staff() then
    raise exception 'Staff authorization required';
  end if;
  if coalesce(p_match_id,'') = '' or length(p_match_id)>40 then
    raise exception 'Invalid tournament match';
  end if;
  if p_time is not null and p_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'Choose a valid 24-hour match time';
  end if;

  select * into t from public.tournaments where id=p_id for update;
  if not found then raise exception 'Tournament not found. It may have been closed'; end if;
  if t.version is distinct from p_expected_version then
    raise exception 'Tournament changed on another device. Refresh before saving';
  end if;
  v_matches := t.state->'matches';
  if jsonb_typeof(v_matches) is distinct from 'array' then
    raise exception 'Tournament fixtures are invalid';
  end if;
  for v_i in 0..jsonb_array_length(v_matches)-1 loop
    if v_matches->v_i->>'id' = p_match_id then
      if v_index <> -1 then raise exception 'Duplicate fixture ID'; end if;
      v_index := v_i;
    end if;
  end loop;
  if v_index < 0 then raise exception 'Match not found'; end if;
  v_match := v_matches->v_index;
  if v_match->>'phase' not in ('group','knockout') then
    raise exception 'Invalid fixture phase';
  end if;
  if p_time is null then
    v_match := v_match - 'scheduledTime';
  else
    v_match := jsonb_set(v_match,'{scheduledTime}',to_jsonb(p_time),true);
  end if;
  v_matches := jsonb_set(v_matches,array[v_index::text],v_match);
  t.state := jsonb_set(t.state,'{matches}',v_matches);
  update public.tournaments set state=t.state,version=version+1 where id=p_id
  returning version into v_version;
  return v_version;
end;
$function$
;
revoke all on function public.tournament_set_match_time(uuid,bigint,text,text) from public,anon,authenticated;
grant execute on function public.tournament_set_match_time(uuid,bigint,text,text) to authenticated;
commit;
