-- Restrict accidental access to elevated PostgreSQL helpers.
-- RLS staff/admin policies and the authenticated WhatsApp function need these
-- helpers for signed-in users, so keep authenticated EXECUTE intact.
-- PostgreSQL itself invokes audit_change as a trigger; clients do not need it.
revoke execute on function public.audit_change() from public, anon, authenticated;

revoke execute on function public.is_admin() from public, anon;
revoke execute on function public.is_staff() from public, anon;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
