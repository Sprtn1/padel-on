-- Remove Nov 16 service-only diagnostic RPC. Preserve the counted
-- diagnostic_retest claim row in the request ledger for the 24/day cap.
DROP FUNCTION IF EXISTS public.matchpoint_claim_retest_20261116();