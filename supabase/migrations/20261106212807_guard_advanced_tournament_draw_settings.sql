-- Restrict V2 group settings to the actual saved fixture draw.
-- Legacy tournaments and their payments, scores, IDs and schedules are unaffected.
create function public.tournament_v2_draw_settings_guard()
returns trigger language plpgsql set search_path=pg_catalog,public as $$
declare
 v_smallest integer;
 v_qualifiers integer;
begin
 if old.format is distinct from 'groups' or
    old.settings->>'engine_version' is distinct from '2' then
  return new;
 end if;
 if new.format is distinct from 'groups' or
    new.settings->>'engine_version' is distinct from '2' or
    new.settings->>'group_size' is distinct from old.settings->>'group_size' then
  raise exception 'Existing V2 group sizes cannot be edited without regenerating the draw';
 end if;
 if coalesce(new.settings->>'qualifiers_per_group','') !~ '^[0-9]{1,2}$' then
  raise exception 'Invalid V2 qualifier count';
 end if;
 v_qualifiers := (new.settings->>'qualifiers_per_group')::integer;
 select min(group_count) into v_smallest
 from (
  select count(*)::integer as group_count
  from jsonb_array_elements(new.state->'teams') as entry(value)
  group by entry.value->>'group'
 ) as actual_groups;
 if v_smallest is null or v_qualifiers<1 or v_qualifiers>v_smallest then
  raise exception 'Qualifier count exceeds the smallest generated group';
 end if;
 return new;
end
$$;
revoke all on function public.tournament_v2_draw_settings_guard() from public,anon,authenticated;
create trigger tournament_v2_draw_integrity
before update of settings,state on public.tournaments
for each row execute function public.tournament_v2_draw_settings_guard();
