-- PADEL ON · Roster categories (Top Team, Team, Rising Stars, Ladies)
-- Run in Supabase SQL Editor on your existing PADEL ON project.
-- Safe to run more than once. Does NOT reset weekly counters, invent games, or delete history.

begin;

alter table public.team_members
  add column if not exists team_category text not null default 'team';

-- Keep the set of allowed categories consistent with the site's selector.
alter table public.team_members
  drop constraint if exists team_members_team_category_check;
alter table public.team_members
  add constraint team_members_team_category_check
  check (team_category in ('top_team','team','rising_stars','ladies_team'));

-- Apply the supplied group classifications to the current roster.
-- Ghaleb and Waddah have been listed under shorter names in earlier data.
update public.team_members
  set name='Ghaleb Antar'
  where lower(btrim(name))='ghaleb';
update public.team_members
  set name='Waddah Fakhry'
  where lower(btrim(name))='waddah';

update public.team_members
  set team_category='top_team'
  where lower(btrim(name)) in ('rami alayli','bahaa hariri','ghaleb antar','karim badih');

update public.team_members
  set team_category='team'
  where lower(btrim(name)) in
    ('bassem baba','yahia hariri','ibrahim kaakour','mhmd ali masri','nazih sonbol','hamza kubrosli');

update public.team_members
  set team_category='rising_stars'
  where lower(btrim(name)) in
    ('afif moati','waddah fakhry','mhmd bizri','ahmad bizri','ali farhat','taym','hasan abou el aynan');

update public.team_members
  set team_category='ladies_team'
  where lower(btrim(name)) in ('reem antar','maya kawas','ghina arnaout','jana fakhry');

-- These three names have no allowance stated by management.
-- Insert them with an explicitly unconfigured (zero) allowance;
-- an administrator can set each member's actual entitlement in Settings.
insert into public.team_members(slug,name,weekly_allowance,unlimited,active,team_category)
select new_member.slug,new_member.name,0,false,true,new_member.team_category
from (values
  ('rami-alayli','Rami Alayli','top_team'),
  ('bahaa-hariri','Bahaa Hariri','top_team'),
  ('hamza-kubrosli','Hamza Kubrosli','team')
) as new_member(slug,name,team_category)
where not exists (
  select 1 from public.team_members existing
  where lower(btrim(existing.name))=lower(new_member.name)
     or existing.slug=new_member.slug
)
on conflict (slug) do nothing;

-- Reapply categories for the newly added rows too.
update public.team_members set team_category='top_team'
where lower(btrim(name)) in ('rami alayli','bahaa hariri');
update public.team_members set team_category='team'
where lower(btrim(name))='hamza kubrosli';

commit;

-- Verification; expected initial grouping is 4 / 6 / 7 / 4 (21 members).
select team_category,count(*) as member_count
from public.team_members
where active=true
group by team_category
order by case team_category
when 'top_team' then 1 when 'team' then 2 when 'rising_stars' then 3 else 4 end;

select name,team_category,weekly_allowance,unlimited
from public.team_members
where active=true
order by team_category,name;
