-- PADEL ON PUBLIC SCHEMA MIGRATION: team categories
-- Safe to rerun in Supabase SQL Editor. This file contains no private roster names.
-- After applying this schema migration, apply the separate PRIVATE member assignment SQL.
-- No weekly counters, games, financial entries or staff permissions are modified.

begin;
alter table public.team_members
 add column if not exists team_category text not null default 'team';

alter table public.team_members
 drop constraint if exists team_members_team_category_check;

alter table public.team_members
 add constraint team_members_team_category_check
 check (team_category in ('top_team','team','rising_stars','ladies_team'));
commit;

-- Optional verification:
select column_name,data_type
from information_schema.columns
where table_schema='public' and table_name='team_members' and column_name='team_category';
