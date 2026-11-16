-- ONE-DAY DIAGNOSTIC ONLY, authorized for 2026-11-16.
-- Preserve strict 24 counted HTTP attempts/day. Sentinel slot -1 is an
-- out-of-window diagnostic claim (NOT a scheduled request).
-- This claim shares the same table and advisory lock as the regular limiter.
ALTER TABLE public.matchpoint_query_request_claims
 DROP CONSTRAINT matchpoint_query_request_claims_slot_hour_check;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_slot_hour_check
 CHECK (slot_hour IN (-1,9,11,13,15,17,19,21,23));
ALTER TABLE public.matchpoint_query_request_claims
 DROP CONSTRAINT matchpoint_query_request_claims_feed_check;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_feed_check
 CHECK (feed IN ('bookings','matches','activities','diagnostic_bookings'));

CREATE OR REPLACE FUNCTION public.matchpoint_claim_connection_test_20261116()
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE
  v_date date;
  v_used integer;
  v_inserted integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Only the MatchPoint service role can claim a diagnostic request';
  END IF;
  v_date:=timezone('Asia/Beirut',clock_timestamp())::date;
  IF v_date <> DATE '2026-11-16' THEN RETURN false; END IF;
  -- Serialize with the production 24-request/day claim function.
  PERFORM pg_advisory_xact_lock(774816,(v_date-DATE '2000-01-01')::integer);
  SELECT count(*) INTO v_used FROM public.matchpoint_query_request_claims
   WHERE request_date=v_date;
  IF v_used >= 24 THEN RETURN false; END IF;
  INSERT INTO public.matchpoint_query_request_claims
   (request_date,slot_hour,feed)
   VALUES (v_date,-1,'diagnostic_bookings')
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  RETURN v_inserted=1;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_connection_test_20261116() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_connection_test_20261116() TO service_role;
