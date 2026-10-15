-- PADEL ON: Monthly Rising Stars training with Coach Khalil
-- Apply once in Supabase SQL Editor after the Team Categories migration.
-- Does not change weekly games, allowances, other benefits, or matchmaking.
begin;

do $$
begin
 if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='team_members' and column_name='team_category')
 then raise exception 'First run supabase/migrations/20261015_team_categories.sql'; end if;
end $$;

create table if not exists public.training_sessions (
 id uuid primary key,
 session_date date not null,
 start_time time without time zone,
 duration_minutes integer not null default 45 check(duration_minutes between 15 and 180),
 coach_name text not null default 'Coach Khalil' check(coach_name = 'Coach Khalil'),
 solo_exception boolean not null default false,
 notes text not null default '' check(length(notes) <= 500),
 recorded_by uuid not null references auth.users(id),
 recorded_at timestamptz not null default now(),
 voided_at timestamptz
);

create table if not exists public.training_attendance (
 id uuid primary key default gen_random_uuid(),
 session_id uuid not null references public.training_sessions(id) on delete restrict,
 member_id uuid not null references public.team_members(id) on delete restrict,
 month_key date not null check(extract(day from month_key)=1),
 voided_at timestamptz,
 unique(session_id,member_id)
);
create unique index if not exists training_member_month_active_unique
 on public.training_attendance(member_id,month_key) where voided_at is null;
create index if not exists training_sessions_month_idx
 on public.training_sessions(session_date desc) where voided_at is null;
create index if not exists training_attendance_session_idx
 on public.training_attendance(session_id);

alter table public.training_sessions enable row level security;
alter table public.training_attendance enable row level security;
drop policy if exists training_sessions_read_staff on public.training_sessions;
create policy training_sessions_read_staff on public.training_sessions
 for select to authenticated using(public.is_staff());
drop policy if exists training_attendance_read_staff on public.training_attendance;
create policy training_attendance_read_staff on public.training_attendance
 for select to authenticated using(public.is_staff());
-- No client INSERT, UPDATE, or DELETE policies. Mutations require validated RPC calls.

create or replace function public.record_training_session(
 p_session_id uuid,
 p_member_ids uuid[],
 p_session_date date,
 p_start_time time without time zone default null,
 p_duration_minutes integer default 45,
 p_notes text default '',
 p_solo_exception boolean default false
) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare
 v_count integer;
 v_found integer:=0;
 v_month date;
 v_existing public.training_sessions%rowtype;
 m record;
begin
 if not public.is_staff() then raise exception 'Authorized PADEL ON staff only'; end if;
 if p_session_id is null then raise exception 'Missing session reference'; end if;
 if p_session_date is null or p_session_date > (now() at time zone 'Asia/Beirut')::date
 then raise exception 'Record a session on or before today (Beirut time)'; end if;
 if p_duration_minutes is null or p_duration_minutes not between 15 and 180
 then raise exception 'Duration must be between 15 and 180 minutes'; end if;
 if length(coalesce(p_notes,''))>500 then raise exception 'Notes must be 500 characters or fewer'; end if;
 v_count := cardinality(p_member_ids);
 if p_member_ids is null or v_count < 1 or v_count > 2
 then raise exception 'Choose one or two Rising Stars players'; end if;
 if v_count=1 and not coalesce(p_solo_exception,false)
 then raise exception 'Two players are normally required; enable solo exception for a single player'; end if;
 if v_count=2 and coalesce(p_solo_exception,false)
 then raise exception 'Solo exception is only allowed with one player'; end if;
 if v_count=1 and length(btrim(coalesce(p_notes,''))) < 4
 then raise exception 'A reason is required for solo training'; end if;
 if (select count(distinct id) from unnest(p_member_ids) as ids(id)) <> v_count
 then raise exception 'A player cannot be selected twice'; end if;

 select * into v_existing from public.training_sessions where id=p_session_id;
 if found then
  if v_existing.recorded_by=auth.uid() and v_existing.voided_at is null
  then return p_session_id; end if;
  raise exception 'Session reference already exists';
 end if;

 v_month:=date_trunc('month',p_session_date::timestamp)::date;
 -- Lock team member rows in a stable order to serialize concurrent attendance writes.
 for m in select * from public.team_members where id=any(p_member_ids)
          order by id for update
 loop
  v_found:=v_found+1;
  if not m.active or m.team_category <> 'rising_stars'
  then raise exception '% is not an active Rising Stars team member',m.name; end if;
  if exists(select 1 from public.training_attendance a
    where a.member_id=m.id and a.month_key=v_month and a.voided_at is null)
  then raise exception '% has already attended a monthly training in %',m.name,to_char(v_month,'Mon YYYY'); end if;
 end loop;
 if v_found <> v_count then raise exception 'Unknown Rising Stars member selected'; end if;

 insert into public.training_sessions
  (id,session_date,start_time,duration_minutes,coach_name,solo_exception,notes,recorded_by)
 values(p_session_id,p_session_date,p_start_time,p_duration_minutes,
        'Coach Khalil',coalesce(p_solo_exception,false),coalesce(p_notes,''),auth.uid());

 insert into public.training_attendance(session_id,member_id,month_key)
 select p_session_id, member_id, v_month from unnest(p_member_ids) as input(member_id);
 insert into public.audit_logs(actor,action,entity,entity_id,after_data)
 values(auth.uid(),'CREATE','training_sessions',p_session_id::text,
   jsonb_build_object('date',p_session_date,'players',p_member_ids,
     'coach','Coach Khalil','duration',p_duration_minutes,'solo',p_solo_exception));
 return p_session_id;
end$$;

create or replace function public.void_training_session(
 p_session_id uuid,
 p_reason text
) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_session public.training_sessions%rowtype;
begin
 if not public.is_admin() then raise exception 'Only administrators can void a training session'; end if;
 if length(btrim(coalesce(p_reason,'')))<4 or length(p_reason)>500
 then raise exception 'Enter a reason of at least 4 characters'; end if;
 select * into v_session from public.training_sessions where id=p_session_id for update;
 if not found or v_session.voided_at is not null
 then raise exception 'Session not found or already voided'; end if;
 update public.training_sessions set voided_at=now() where id=p_session_id;
 update public.training_attendance set voided_at=now()
 where session_id=p_session_id and voided_at is null;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),'VOID','training_sessions',p_session_id::text,to_jsonb(v_session),
   jsonb_build_object('reason',btrim(p_reason)));
end$$;

revoke all on function public.record_training_session(uuid,uuid[],date,time without time zone,integer,text,boolean) from public,anon;
revoke all on function public.void_training_session(uuid,text) from public,anon;
grant execute on function public.record_training_session(uuid,uuid[],date,time without time zone,integer,text,boolean) to authenticated;
grant execute on function public.void_training_session(uuid,text) to authenticated;

commit;
