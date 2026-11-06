-- V2 additive schema: no existing tournament state, IDs, scores, dues, or payments are rewritten.
alter table public.tournaments add column settings jsonb not null default '{}'::jsonb;
alter table public.tournaments add constraint tournaments_settings_v2_check
 check (jsonb_typeof(settings)='object' and pg_column_size(settings)<16000);
alter table public.tournaments drop constraint tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
 check(format in ('groups','knockout','americano_individual','americano_team'));

create table public.tournament_activity_events(
 id bigint generated always as identity primary key,
 tournament_id uuid not null,
 at_time timestamptz not null default clock_timestamp(),
 actor_id uuid references auth.users(id) on delete set null,
 event_type text not null check(char_length(event_type) between 3 and 60),
 details jsonb not null default '{}'::jsonb check(pg_column_size(details)<8000)
);
create index tournament_activity_event_lookup on public.tournament_activity_events(tournament_id,at_time desc);
create index tournament_activity_actor on public.tournament_activity_events(actor_id);
alter table public.tournament_activity_events enable row level security;
revoke all on public.tournament_activity_events from public,anon,authenticated;
grant select on public.tournament_activity_events to authenticated;
create policy "Staff view tournament activity" on public.tournament_activity_events
 for select to authenticated using ((select public.is_staff()));

create function public.tournament_v2_log_activity() returns trigger
 language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_type text;v_id uuid;v_before bigint;v_after bigint;v_format text;
begin
 if TG_OP='INSERT' then
  v_type:='tournament_created';v_id:=NEW.id;v_before:=null;v_after:=NEW.version;v_format:=NEW.format;
 elsif TG_OP='DELETE' then
  v_type:='tournament_archived';v_id:=OLD.id;v_before:=OLD.version;v_after:=null;v_format:=OLD.format;
 else
  v_id:=NEW.id;v_before:=OLD.version;v_after:=NEW.version;v_format:=NEW.format;
  v_type:=case
   when NEW.settings is distinct from OLD.settings then 'settings_updated'
   when NEW.state->'matches' is distinct from OLD.state->'matches' then 'fixtures_or_scores_updated'
   when NEW.state->'teams' is distinct from OLD.state->'teams' then 'roster_or_payment_updated'
   else 'tournament_updated' end;
 end if;
 insert into public.tournament_activity_events(tournament_id,actor_id,event_type,details)
 values(v_id,auth.uid(),v_type,jsonb_build_object('previous_version',v_before,'new_version',v_after,'format',v_format));
 return coalesce(NEW,OLD);
end$$;
revoke all on function public.tournament_v2_log_activity() from public,anon,authenticated;
create trigger tournament_v2_activity after insert or update or delete on public.tournaments
 for each row execute function public.tournament_v2_log_activity();

-- Participant status/notes are independent of paid balances and bracket scores.
create table public.tournament_registration_status(
 tournament_id uuid not null references public.tournaments(id) on delete cascade,
 entrant_id text not null check(entrant_id~'^t[1-9][0-9]{0,5}$'),
 status text not null default 'active'
  check(status in ('active','pending','waitlisted','cancelled','disqualified')),
 note text not null default '' check(char_length(note)<=500),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default clock_timestamp(),
 primary key(tournament_id,entrant_id)
);
create index tournament_registration_status_actor on public.tournament_registration_status(updated_by);
alter table public.tournament_registration_status enable row level security;
revoke all on public.tournament_registration_status from public,anon,authenticated;
grant select on public.tournament_registration_status to authenticated;
create policy "Staff view tournament registration states" on public.tournament_registration_status
 for select to authenticated using ((select public.is_staff()));

create function public.tournament_update_registration_status(
 p_id uuid,p_expected_version bigint,p_entrant_id text,p_status text,p_note text default ''
) returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_t public.tournaments%rowtype;v_version bigint;v_note text:=btrim(coalesce(p_note,''));
begin
 if auth.uid() is null or not public.is_staff() then raise exception 'Staff authorization required';end if;
 if p_status is null or p_status not in ('active','pending','waitlisted','cancelled','disqualified') then
  raise exception 'Invalid registration status';end if;
 if p_status='disqualified' and not public.is_admin() then
  raise exception 'Only an administrator can disqualify a participant';end if;
 if char_length(v_note)>500 then raise exception 'Registration note exceeds 500 characters';end if;
 select * into v_t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if v_t.version is distinct from p_expected_version then
  raise exception 'Tournament was updated on another device. Refresh first';end if;
 if p_entrant_id is null or not exists(select 1 from jsonb_array_elements(v_t.state->'teams') team
   where team->>'id'=p_entrant_id) then raise exception 'Participant not found in this tournament';end if;
 insert into public.tournament_registration_status(tournament_id,entrant_id,status,note,updated_by)
 values(p_id,p_entrant_id,p_status,v_note,auth.uid())
 on conflict(tournament_id,entrant_id) do update
 set status=excluded.status,note=excluded.note,updated_by=excluded.updated_by,updated_at=clock_timestamp();
 update public.tournaments set version=version+1 where id=p_id returning version into v_version;
 insert into public.tournament_activity_events(tournament_id,actor_id,event_type,details)
 values(p_id,auth.uid(),'registration_status_changed',
  jsonb_build_object('entrant_id',p_entrant_id,'status',p_status));
 return v_version;
end$$;
revoke all on function public.tournament_update_registration_status(uuid,bigint,text,text,text) from public,anon;
grant execute on function public.tournament_update_registration_status(uuid,bigint,text,text,text) to authenticated;

create function public.tournament_update_settings(
 p_id uuid,p_expected_version bigint,p_settings jsonb
) returns bigint language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 t public.tournaments%rowtype; v_count integer;v_group integer;v_qualifiers integer;v_limit integer;
 v_courts jsonb;v_rules jsonb;v_rule jsonb;v_seen text[]:=array[]::text[];
 v_deadline timestamptz;v_version bigint;v_score_exists boolean;
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can change tournament settings';end if;
 select * into t from public.tournaments where id=p_id for update;
 if not found then raise exception 'Tournament not found';end if;
 if t.version is distinct from p_expected_version then
  raise exception 'Tournament was updated on another device. Refresh first';end if;
 if p_settings is null or jsonb_typeof(p_settings) is distinct from 'object'
   or pg_column_size(p_settings)>15000 then raise exception 'Invalid settings document';end if;
 if p_settings->>'registration_mode' is distinct from 'staff' then
  raise exception 'Only staff-managed registration is supported';end if;
 if coalesce(p_settings->>'publication_status','') not in ('draft','published_internal')
 or coalesce(p_settings->>'fee_mode','') not in ('paid','free')
 or coalesce(p_settings->>'prize_mode','') not in ('tba','announced') then
  raise exception 'Invalid publication, entry or prize settings';end if;
 if char_length(coalesce(p_settings->>'prize_text',''))>1000 then
  raise exception 'Prize description is too long';end if;
 if coalesce(p_settings->>'group_size','') !~ '^[0-9]{1,2}$'
 or coalesce(p_settings->>'qualifiers_per_group','') !~ '^[0-9]{1,2}$'
 or coalesce(p_settings->>'entry_limit','') !~ '^[0-9]{1,2}$' then
  raise exception 'Invalid group or entry limits';end if;
 v_group:=(p_settings->>'group_size')::integer;v_qualifiers:=(p_settings->>'qualifiers_per_group')::integer;
 v_limit:=(p_settings->>'entry_limit')::integer;v_count:=jsonb_array_length(t.state->'teams');
 if v_group not between 2 and 8 or v_qualifiers not between 1 and v_group
  or v_limit not between v_count and 32 then
  raise exception 'Group size, qualifiers or entry limit are out of range';end if;
 v_courts:=p_settings->'courts';
 if jsonb_typeof(v_courts) is distinct from 'array' or jsonb_array_length(v_courts) not between 1 and 3
 or exists(select 1 from jsonb_array_elements_text(v_courts) x where x not in ('C1','C2','C3'))
 or (select count(distinct x) from jsonb_array_elements_text(v_courts) x)<>jsonb_array_length(v_courts) then
  raise exception 'Choose 1–3 distinct courts';end if;
 if p_settings->>'registration_deadline' is not null then
  begin v_deadline:=(p_settings->>'registration_deadline')::timestamptz;
  exception when others then raise exception 'Invalid registration deadline';end;
 end if;
 v_rules:=p_settings->'rules';
 if jsonb_typeof(v_rules) is distinct from 'array' or jsonb_array_length(v_rules)>16 then
  raise exception 'Invalid tournament rule list';end if;
 for v_rule in select value from jsonb_array_elements(v_rules) loop
  if coalesce(v_rule->>'key','') !~ '^[a-z][a-z0-9_-]{1,39}$'
   or coalesce(v_rule->>'text','')='' or char_length(v_rule->>'text')>500
   or jsonb_typeof(v_rule->'enabled') is distinct from 'boolean'
   or v_rule->>'key'=any(v_seen) then
   raise exception 'Invalid or duplicated tournament rule';end if;
  v_seen:=array_append(v_seen,v_rule->>'key');
 end loop;
 if t.settings ? 'fee_mode' and t.settings->>'fee_mode' <> p_settings->>'fee_mode' then
  raise exception 'Paid/free selection is fixed once participant dues are created';end if;
 v_score_exists:=exists(select 1 from jsonb_array_elements(t.state->'matches') m
  where coalesce(m->>'played','false')='true' or m->>'winner' is not null or
   coalesce(jsonb_array_length(m->'sets'),0)>0);
 if v_score_exists then
  if t.format='groups' and (t.settings->>'group_size' is distinct from p_settings->>'group_size'
   or t.settings->>'qualifiers_per_group' is distinct from p_settings->>'qualifiers_per_group') then
   raise exception 'Group settings are locked after results';end if;
  if t.format like 'americano_%' and (
   t.settings->>'points_per_match' is distinct from p_settings->>'points_per_match'
   or t.settings->>'rounds' is distinct from p_settings->>'rounds') then
   raise exception 'Americano scoring and rounds are locked after results';end if;
 end if;
 if exists(select 1 from jsonb_array_elements(t.state->'matches') m
  where m->>'scheduledCourt' is not null and not (p_settings->'courts') ? (m->>'scheduledCourt')) then
  raise exception 'A scheduled match uses a court being removed';end if;
 update public.tournaments set settings=p_settings,version=version+1
 where id=p_id returning version into v_version;
 return v_version;
end$$;
revoke all on function public.tournament_update_settings(uuid,bigint,jsonb) from public,anon;
grant execute on function public.tournament_update_settings(uuid,bigint,jsonb) to authenticated;
