-- PADEL ON production database. Run once in Supabase SQL Editor.
-- Safe to rerun for schema/policies; seed records are inserted only if absent.
create extension if not exists pgcrypto;

create table if not exists public.staff_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 email text not null, role text not null check (role in ('admin','staff')),
 created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean language sql stable security definer
 set search_path = public, pg_temp as $$
 select exists(select 1 from public.staff_profiles where id=auth.uid());
$$;
create or replace function public.is_admin() returns boolean language sql stable security definer
 set search_path = public, pg_temp as $$
 select exists(select 1 from public.staff_profiles where id=auth.uid() and role='admin');
$$;
revoke all on function public.is_staff() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.team_members (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 name text not null check (length(btrim(name)) between 2 and 100),
 weekly_allowance integer not null default 2 check (weekly_allowance between 0 and 30),
 unlimited boolean not null default false,
 active boolean not null default true,
 created_at timestamptz not null default now()
);
create table if not exists public.initial_balances (
 member_id uuid not null references public.team_members(id) on delete restrict,
 week_start date not null,
 used integer not null default 0 check (used>=0),
 primary key(member_id, week_start)
);
create table if not exists public.team_matches (
 id uuid primary key,
 played_on date not null,
 benefit_type text not null check (benefit_type in ('free','half')),
 notes text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 voided_at timestamptz
);
create table if not exists public.team_games (
 id uuid primary key default gen_random_uuid(),
 match_id uuid not null references public.team_matches(id) on delete restrict,
 member_id uuid not null references public.team_members(id) on delete restrict,
 played_on date not null,
 benefit_type text not null check (benefit_type in ('free','half')),
 created_at timestamptz not null default now(),
 voided_at timestamptz,
 unique(match_id,member_id)
);
create index if not exists team_games_member_date_idx on public.team_games(member_id,played_on) where voided_at is null;

create table if not exists public.reset_events (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.team_members(id) on delete restrict,
 week_start date not null,
 effective_at timestamptz not null default now(),
 actor uuid references auth.users(id)
);
create index if not exists reset_events_lookup on public.reset_events(member_id,week_start,effective_at desc);

create table if not exists public.other_players (
 id uuid primary key default gen_random_uuid(),
 slug text not null unique,
 name text not null,
 current_counter integer not null default 0 check(current_counter>=0),
 status text not null default 'needs_confirmation' check(status in ('needs_confirmation','next_free','counting','rule_not_configured','alternating_free_paid','one_free_per_week')),
 threshold integer check(threshold between 1 and 100),
 active boolean not null default true
);
create table if not exists public.other_games (
 id uuid primary key default gen_random_uuid(),
 player_id uuid not null references public.other_players(id) on delete restrict,
 played_on date not null,
 game_type text not null check(game_type in ('paid','free')),
 notes text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.nazih_games (
 id uuid primary key default gen_random_uuid(),
 played_on date not null,
 amount_cents bigint not null check(amount_cents>=0 and amount_cents<=100000000000),
 players text not null default '',
 notes text not null default '',
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz
);
create index if not exists nazih_games_date_idx on public.nazih_games(played_on) where deleted_at is null;
create table if not exists public.nazih_settlements (
 id uuid primary key default gen_random_uuid(),
 month_key date not null unique check (extract(day from month_key)=1),
 status text not null default 'unpaid' check(status in ('paid','unpaid')),
 amount_paid_cents bigint not null default 0 check(amount_paid_cents>=0),
 paid_on date,
 notes text not null default '',
 updated_at timestamptz not null default now()
);
create table if not exists public.audit_logs (
 id uuid primary key default gen_random_uuid(),
 actor uuid,
 action text not null,
 entity text not null,
 entity_id text not null,
 before_data jsonb,
 after_data jsonb,
 happened_at timestamptz not null default now()
);
create table if not exists public.reset_attempts (
 id uuid primary key default gen_random_uuid(),
 actor uuid not null,
 attempted_at timestamptz not null default now(),
 success boolean not null default false
);
create index if not exists reset_attempts_idx on public.reset_attempts(actor, attempted_at desc);

-- Row-level security: no unauthenticated access to club data.
alter table public.staff_profiles enable row level security;
alter table public.team_members enable row level security;
alter table public.initial_balances enable row level security;
alter table public.team_matches enable row level security;
alter table public.team_games enable row level security;
alter table public.reset_events enable row level security;
alter table public.other_players enable row level security;
alter table public.other_games enable row level security;
alter table public.nazih_games enable row level security;
alter table public.nazih_settlements enable row level security;
alter table public.audit_logs enable row level security;
alter table public.reset_attempts enable row level security;

-- Make repeated SQL Editor execution safe.
do $$declare r record;begin
for r in select schemaname,tablename,policyname from pg_policies where schemaname='public' and tablename = any(array[
'staff_profiles','team_members','initial_balances','team_matches','team_games','reset_events','other_players','other_games','nazih_games','nazih_settlements','audit_logs','reset_attempts'])
loop execute format('drop policy if exists %I on %I.%I',r.policyname,r.schemaname,r.tablename);end loop;
end$$;

create policy staff_read_profile on public.staff_profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy members_read on public.team_members for select to authenticated using(public.is_staff());
create policy members_insert on public.team_members for insert to authenticated with check(public.is_admin());
create policy members_update on public.team_members for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy opening_read on public.initial_balances for select to authenticated using(public.is_staff());
create policy matches_read on public.team_matches for select to authenticated using(public.is_staff());
create policy games_read on public.team_games for select to authenticated using(public.is_staff());
create policy resets_read on public.reset_events for select to authenticated using(public.is_staff());
create policy other_read on public.other_players for select to authenticated using(public.is_staff());
create policy other_insert on public.other_players for insert to authenticated with check(public.is_admin());
create policy other_update on public.other_players for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy other_games_read on public.other_games for select to authenticated using(public.is_staff());
create policy nazih_read on public.nazih_games for select to authenticated using(public.is_staff());
create policy nazih_insert on public.nazih_games for insert to authenticated with check(public.is_staff() and created_by=auth.uid());
create policy nazih_update on public.nazih_games for update to authenticated using(public.is_staff()) with check(public.is_staff());
create policy settlements_read on public.nazih_settlements for select to authenticated using(public.is_staff());
create policy settlements_insert on public.nazih_settlements for insert to authenticated with check(public.is_admin());
create policy settlements_update on public.nazih_settlements for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy audits_read on public.audit_logs for select to authenticated using(public.is_admin());
-- No client policies for reset_attempts; only trusted server using service_role.

create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 insert into public.audit_logs(actor, action, entity, entity_id, before_data, after_data)
 values(auth.uid(),tg_op,tg_table_name,coalesce(new.id,old.id)::text,
    case when tg_op <> 'INSERT' then to_jsonb(old) else null end,
    case when tg_op <> 'DELETE' then to_jsonb(new) else null end);
 if tg_op='DELETE' then return old;else return new;end if;
end$$;
drop trigger if exists team_member_audit on public.team_members;
create trigger team_member_audit after insert or update on public.team_members for each row execute function public.audit_change();
drop trigger if exists other_player_audit on public.other_players;
create trigger other_player_audit after insert or update on public.other_players for each row execute function public.audit_change();
drop trigger if exists nazih_financial_audit on public.nazih_games;
create trigger nazih_financial_audit after insert or update on public.nazih_games for each row execute function public.audit_change();
drop trigger if exists settlement_audit on public.nazih_settlements;
create trigger settlement_audit after insert or update on public.nazih_settlements for each row execute function public.audit_change();

-- Atomic recording for one or multiple team members. Row locks prevent overspending.
create or replace function public.record_team_match(
 p_match_id uuid, p_member_ids uuid[], p_played_on date, p_benefit_type text, p_notes text default ''
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
 m record; v_count integer:=0; v_week date; v_used integer; v_initial integer;
 v_latest_reset timestamptz; v_existing public.team_matches%rowtype; v_today date;
begin
 if not public.is_staff() then raise exception 'Not authorized';end if;
 v_today := (now() at time zone 'Asia/Beirut')::date;
 if p_played_on is null or p_played_on>v_today or p_played_on<v_today-30 then raise exception 'Game date must be within the past 30 days';end if;
 if p_benefit_type not in ('free','half') then raise exception 'Invalid benefit';end if;
 if p_member_ids is null or cardinality(p_member_ids)<1 or cardinality(p_member_ids)>4 then raise exception 'Choose 1 to 4 members';end if;
 if (select count(distinct x) from unnest(p_member_ids) as x)<>cardinality(p_member_ids) then raise exception 'Duplicate member selection';end if;
 if length(coalesce(p_notes,''))>500 then raise exception 'Notes too long';end if;
 select * into v_existing from public.team_matches where id=p_match_id;
 if found then
  if v_existing.created_by=auth.uid() and v_existing.voided_at is null then return p_match_id;
  else raise exception 'Match reference already exists';end if;
 end if;
 v_week:=p_played_on-((extract(isodow from p_played_on)::int)-1);
 for m in select * from public.team_members where id=any(p_member_ids) order by id for update loop
  v_count:=v_count+1;
  if not m.active then raise exception 'Inactive member: %',m.name;end if;
  if m.unlimited and p_benefit_type<>'free' then raise exception '% only receives free games',m.name;end if;
  if not m.unlimited then
   select coalesce((select used from public.initial_balances where member_id=m.id and week_start=v_week),0) into v_initial;
   select max(effective_at) into v_latest_reset from public.reset_events where member_id=m.id and week_start=v_week;
   select count(*) into v_used from public.team_games where member_id=m.id and played_on between v_week and (v_week+6)
    and voided_at is null and (v_latest_reset is null or created_at>v_latest_reset);
   if v_latest_reset is not null then v_initial:=0;end if;
   if v_used+v_initial>=m.weekly_allowance then raise exception '% has used all weekly benefits',m.name;end if;
  end if;
 end loop;
 if v_count<>cardinality(p_member_ids) then raise exception 'Unknown member selected';end if;
 insert into public.team_matches(id,played_on,benefit_type,notes,created_by)
 values(p_match_id,p_played_on,p_benefit_type,coalesce(p_notes,''),auth.uid());
 insert into public.team_games(match_id,member_id,played_on,benefit_type)
 select p_match_id,x,p_played_on,p_benefit_type from unnest(p_member_ids) as x;
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','team_matches',p_match_id::text,jsonb_build_object('members',p_member_ids,'date',p_played_on,'type',p_benefit_type));
 return p_match_id;
end$$;

create or replace function public.void_team_match(p_match_id uuid) returns void language plpgsql
 security definer set search_path=public,pg_temp as $$
begin
 if not public.is_staff() then raise exception 'Not authorized';end if;
 update public.team_matches set voided_at=now() where id=p_match_id and voided_at is null;
 if not found then raise exception 'Match not found or already voided';end if;
 update public.team_games set voided_at=now() where match_id=p_match_id and voided_at is null;
 insert into public.audit_logs(actor,action,entity,entity_id) values(auth.uid(),'VOID','team_matches',p_match_id::text);
end$$;

drop function if exists public.record_other_game(uuid,date,text,text);
create or replace function public.record_other_game(p_game_id uuid,p_player_id uuid,p_played_on date,p_game_type text,p_notes text default '')
 returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_player public.other_players%rowtype;v_id uuid;v_counter integer;v_status text;
begin
 if not public.is_staff() then raise exception 'Not authorized';end if;
 if p_game_type not in ('paid','free') then raise exception 'Select Paid or Free';end if;
 if exists(select 1 from public.other_games where id=p_game_id) then
  if exists(select 1 from public.other_games where id=p_game_id and created_by=auth.uid() and player_id=p_player_id) then return p_game_id; end if;
  raise exception 'Game reference already used';
 end if;
 if p_played_on is null or p_played_on>(now() at time zone 'Asia/Beirut')::date or p_played_on<(now() at time zone 'Asia/Beirut')::date-30 then raise exception 'Date must be within past 30 days';end if;
 select * into v_player from public.other_players where id=p_player_id for update;
 if not found or not v_player.active then raise exception 'Player is unavailable';end if;
 insert into public.other_games(id,player_id,played_on,game_type,notes,created_by)
 values(p_game_id,p_player_id,p_played_on,p_game_type,left(coalesce(p_notes,''),500),auth.uid()) returning id into v_id;
 v_counter:=v_player.current_counter+(case when p_game_type='paid' then 1 else 0 end);
 v_status:=v_player.status;
 if p_game_type='free' and v_status='next_free' then v_status:='needs_confirmation';end if;
 if p_game_type='paid' and v_player.slug='rami-al-rifai' and v_player.status='counting' and v_counter>=5 then v_status:='next_free';end if;
 update public.other_players set current_counter=v_counter,status=v_status where id=p_player_id;
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','other_games',v_id::text,jsonb_build_object('player',p_player_id,'type',p_game_type));
 return v_id;
end$$;

-- Called ONLY by the trusted Edge Function through service_role.
create or replace function public.admin_reset_week(p_actor uuid,p_member_id uuid default null) returns integer
 language plpgsql security definer set search_path=public,pg_temp as $$
declare v_week date;v_rows integer;
begin
 if auth.role() <> 'service_role' then raise exception 'Service role required';end if;
 if not exists (select 1 from public.staff_profiles where id=p_actor and role='admin') then raise exception 'Administrator required';end if;
 v_week:=(now() at time zone 'Asia/Beirut')::date;
 v_week:=v_week-(extract(isodow from v_week)::int-1);
 insert into public.reset_events(member_id,week_start,actor)
 select id,v_week,p_actor from public.team_members where active=true and unlimited=false
 and (p_member_id is null or id=p_member_id);
 get diagnostics v_rows=row_count;
 if v_rows=0 then raise exception 'No eligible members';end if;
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(p_actor,'RESET','team_members',coalesce(p_member_id::text,'all'),jsonb_build_object('count',v_rows,'week',v_week));
 return v_rows;
end$$;
revoke all on function public.record_team_match(uuid,uuid[],date,text,text) from public,anon;
revoke all on function public.void_team_match(uuid) from public,anon;
revoke all on function public.record_other_game(uuid,uuid,date,text,text) from public,anon;
revoke all on function public.admin_reset_week(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_team_match(uuid,uuid[],date,text,text) to authenticated;
grant execute on function public.void_team_match(uuid) to authenticated;
grant execute on function public.record_other_game(uuid,uuid,date,text,text) to authenticated;
grant execute on function public.admin_reset_week(uuid,uuid) to service_role;

-- Initial real club member names and opening balances are deliberately stored
-- separately from this public schema. See PRIVATE initial-data file supplied outside the ZIP.

-- AFTER creating a Supabase Auth user, grant admin access by running (replace email):
-- insert into public.staff_profiles(id,email,role)
-- select id,email,'admin' from auth.users where lower(email)=lower('YOU@example.com')
-- on conflict(id) do update set role='admin';
