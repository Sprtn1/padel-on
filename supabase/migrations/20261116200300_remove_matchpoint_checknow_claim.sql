-- Remove the one-off November 16 diagnostic function immediately after use.
-- Do not delete today's diagnostic_checknow row: the attempt must remain
-- counted against the same hard 24-requests-per-Beirut-day ceiling.
DROP FUNCTION IF EXISTS public.matchpoint_claim_checknow_20261116();