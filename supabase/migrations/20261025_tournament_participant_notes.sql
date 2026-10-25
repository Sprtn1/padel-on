-- Free-text notes for individual players in an existing tournament.
-- Neither participant dues nor paid amounts are ever touched by this RPC.
begin;

create or replace function public.tournament_set_member_note(
 p_id uuid, p_expected_version bigint, p_team text, p_member text, p_note text
) returns bigint
language plpgsql security definer set search_path=public,pg_temp
as $function$
declare
 t public.tournaments%rowtype;
 teams jsonb;
 team_index integer := -1;
 member_index integer := -1;
 i integer;
 new_note text;
 version_out bigint;
begin
 if auth.uid() is null or not public.is_staff() then
  raise exception 'Staff authorization required';
 end if;
 if p_note is null then raise exception 'Participant note is required'; end if;
 new_note := btrim(p_note);
 if char_length(new_note)>1000 then
  raise exception 'Participant notes cannot exceed 1000 characters';
 end if;

 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found'; end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament changed on another device. Refresh before saving';
 end if;
 teams:=t.state->'teams';
 if jsonb_typeof(teams) is distinct from 'array' then
  raise exception 'Invalid tournament teams';
 end if;
 for i in 0..jsonb_array_length(teams)-1 loop
  if teams->i->>'id'=p_team then team_index:=i;exit;end if;
 end loop;
 if team_index<0 then raise exception 'Team not found';end if;
 if jsonb_typeof(teams->team_index->'members') is distinct from 'array' then
  raise exception 'Invalid tournament participants';
 end if;
 for i in 0..jsonb_array_length(teams->team_index->'members')-1 loop
  if teams->team_index->'members'->i->>'id'=p_member then
   member_index:=i;exit;
  end if;
 end loop;
 if member_index<0 then raise exception 'Participant not found';end if;

 if coalesce(teams->team_index->'members'->member_index->>'note','')=new_note then
  return t.version;
 end if;
 teams:=jsonb_set(teams,
  array[team_index::text,'members',member_index::text,'note'],
  to_jsonb(new_note),true);
 update public.tournaments
  set state=jsonb_set(t.state,'{teams}',teams),version=version+1
  where id=p_id returning version into version_out;
 return version_out;
end;
$function$;

revoke all on function public.tournament_set_member_note(uuid,bigint,text,text,text)
 from public,anon,authenticated;
grant execute on function public.tournament_set_member_note(uuid,bigint,text,text,text)
 to authenticated;
commit;
