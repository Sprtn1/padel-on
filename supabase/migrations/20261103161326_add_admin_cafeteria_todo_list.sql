-- Applied to Supabase. Admin-only separate operations checklist.
-- Separate administrator-only operational tasks. No relationship to any
-- cafeteria accounting, payment, cash-drawer, or Whish tables.
create table if not exists public.cafeteria_todo_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  notes text not null default '' check (char_length(notes)<=800),
  due_on date,
  completed_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_at timestamptz not null default now()
);
create index if not exists cafeteria_todo_due_idx
 on public.cafeteria_todo_items(due_on) where removed_at is null;
create index if not exists cafeteria_todo_creator_idx
 on public.cafeteria_todo_items(created_by);
alter table public.cafeteria_todo_items enable row level security;
revoke all on public.cafeteria_todo_items from public,anon,authenticated;
grant select,insert on public.cafeteria_todo_items to authenticated;
create policy "admin_read_cafeteria_todos" on public.cafeteria_todo_items
 for select to authenticated using ((select public.is_admin()));
create policy "admin_create_cafeteria_todos" on public.cafeteria_todo_items
 for insert to authenticated with check ((select public.is_admin()) and created_by=(select auth.uid()) and removed_at is null and removed_by is null and completed_at is null);

-- All edits, completions, reopens and removals pass through this function
-- so browsers cannot write audit timestamps or impersonate the actor.
create or replace function public.cafeteria_todo_change(
 p_id uuid,p_action text,p_title text default null,p_notes text default null,p_due_on date default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_todo public.cafeteria_todo_items%rowtype;
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'Only administrators can manage cafeteria tasks';
 end if;
 if p_id is null or p_action not in ('edit','complete','reopen','remove') then
  raise exception 'Invalid to-do action';
 end if;
 select * into v_todo from public.cafeteria_todo_items where id=p_id for update;
 if not found or v_todo.removed_at is not null then raise exception 'Task not found'; end if;
 if p_action='edit' then
  if p_title is null or char_length(btrim(p_title)) not between 1 and 160 then
   raise exception 'Task name must be between 1 and 160 characters';
  end if;
  if char_length(coalesce(p_notes,''))>800 then raise exception 'Task notes are too long'; end if;
  update public.cafeteria_todo_items set
   title=btrim(p_title),notes=btrim(coalesce(p_notes,'')),due_on=p_due_on,updated_at=now()
   where id=p_id;
 elsif p_action='complete' then
  update public.cafeteria_todo_items set completed_at=coalesce(completed_at,now()),updated_at=now()
   where id=p_id;
 elsif p_action='reopen' then
  update public.cafeteria_todo_items set completed_at=null,updated_at=now()
   where id=p_id;
 else
  update public.cafeteria_todo_items set removed_at=now(),removed_by=auth.uid(),updated_at=now()
   where id=p_id;
 end if;
 return p_id;
end$$;
revoke all on function public.cafeteria_todo_change(uuid,text,text,text,date) from public,anon;
grant execute on function public.cafeteria_todo_change(uuid,text,text,text,date) to authenticated;

