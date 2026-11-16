-- Remove the one-time readiness diagnostic function immediately after use.
-- Keep its November 16 request-claim ledger entry so it still counts toward
-- the strict 24 MatchPoint API requests per Beirut calendar day.
DROP FUNCTION IF EXISTS public.matchpoint_claim_readiness_20261116();