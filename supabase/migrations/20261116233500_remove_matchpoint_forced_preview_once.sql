-- Remove user-authorized single-use MatchPoint API preview function.
-- Preserve its one claimed quota entry (2026-11-16, -3, diagnostic_retest)
-- for the entire day: NEVER refund a request because the schema differed.
DROP FUNCTION IF EXISTS public.matchpoint_claim_forced_preview_20261116();