-- Immediately remove the one-off MatchPoint preview quota function.
-- Its 2026-11-17 request-claim row remains counted toward the hard 24/day cap.
DROP FUNCTION IF EXISTS public.matchpoint_claim_week_preview_20261116();