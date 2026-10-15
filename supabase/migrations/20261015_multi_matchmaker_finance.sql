-- PADEL ON: Multi-person matchmaking ledger migration.
-- Apply ONCE in the existing Supabase project's SQL Editor.
-- Does not delete records; maps all existing Nazih financial entries to one legacy ID.
-- After this migration, run the privately provided MATCHMAKERS_PRIVATE_SETUP.sql
-- to assign actual staff names and add the other matchmakers.
begin;

create table if not exists public.matchmakers (
 id uuid primary key,
 name text not null unique check (char_length(btrim(name)) between 2 and 100),
 commission_bps integer not null default 1500 check (commission_bps between 0 and 10000),
 active boolean not null default true,
 created_at timestamptz not null default now()
);

-- A pseudonymous account represents ALL historical Nazih records until the private
-- name setup is applied. Stable ID is referenced by the frontend and legacy rows.
insert into public.matchmakers(id,name,commission_bps,active)
 values('75b8dc1b-0529-489f-8aa1-9a464d9d61a1','Legacy matchmaker — configure name',1500,true)
 on conflict(id) do nothing;

alter table public.nazih_games
 add column if not exists matchmaker_id uuid
 references public.matchmakers(id) default '75b8dc1b-0529-489f-8aa1-9a464d9d61a1';
update public.nazih_games
 set matchmaker_id='75b8dc1b-0529-489f-8aa1-9a464d9d61a1'
 where matchmaker_id is null;
alter table public.nazih_games alter column matchmaker_id set not null;

alter table public.nazih_settlements
 add column if not exists matchmaker_id uuid
 references public.matchmakers(id) default '75b8dc1b-0529-489f-8aa1-9a464d9d61a1';
update public.nazih_settlements
 set matchmaker_id='75b8dc1b-0529-489f-8aa1-9a464d9d61a1'
 where matchmaker_id is null;
alter table public.nazih_settlements alter column matchmaker_id set not null;

-- Old system: one unique settlement per month across the whole club.
-- New system: one unique settlement per matchmaker + calendar month.
alter table public.nazih_settlements
 drop constraint if exists nazih_settlements_month_key_key;
create unique index if not exists nazih_settlements_matchmaker_month_unique
 on public.nazih_settlements(matchmaker_id,month_key);

create index if not exists nazih_games_matchmaker_month_idx
 on public.nazih_games(matchmaker_id,played_on) where deleted_at is null;

alter table public.matchmakers enable row level security;
drop policy if exists matchmakers_staff_read on public.matchmakers;
create policy matchmakers_staff_read on public.matchmakers
 for select to authenticated using(public.is_staff());
-- Names/rates cannot be modified from the public client, only through trusted SQL.

commit;

-- Verification (before private names are assigned):
select (select count(*) from public.nazih_games) as game_records_retained,
       (select count(*) from public.nazih_settlements) as settlements_retained,
       (select count(*) from public.nazih_games where matchmaker_id is null) as unassigned_games,
       (select count(*) from public.nazih_settlements where matchmaker_id is null) as unassigned_settlements;
