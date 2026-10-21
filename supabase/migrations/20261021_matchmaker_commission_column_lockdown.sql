-- Remove inherited/table-level update rights. Only commission_bps is writable
-- through the client, and RLS further restricts it to administrators.
begin;
revoke update on table public.matchmakers from public, anon, authenticated;
grant update (commission_bps) on table public.matchmakers to authenticated;
commit;
