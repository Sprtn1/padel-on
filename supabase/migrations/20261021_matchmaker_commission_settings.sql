-- Allow only admins to change the commission percentage for each matchmaker.
-- The UI writes basis points (e.g. 15.25% = 1525); the table constraint caps this at 100%.
begin;

alter table public.matchmakers enable row level security;

drop policy if exists matchmakers_admin_update on public.matchmakers;
create policy matchmakers_admin_update
  on public.matchmakers
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Column-level privilege prevents client-side edits to names or active status.
revoke update on table public.matchmakers from public, anon, authenticated;
grant update (commission_bps) on table public.matchmakers to authenticated;

-- Record who changed a rate and preserve before/after values for audit.
drop trigger if exists matchmaker_commission_audit on public.matchmakers;
create trigger matchmaker_commission_audit
  after update of commission_bps on public.matchmakers
  for each row
  when (old.commission_bps is distinct from new.commission_bps)
  execute function public.audit_change();

commit;