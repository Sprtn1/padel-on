-- Remove the November 16 exception immediately after the single authorized test.
-- Keep the already claimed diagnostic row in matchpoint_query_request_claims:
-- it MUST continue to count toward the strict 24-request daily total.
-- Never clear/reuse a consumed quota entry just because the API returned 302.
DROP FUNCTION IF EXISTS public.matchpoint_claim_connection_test_20261116();
