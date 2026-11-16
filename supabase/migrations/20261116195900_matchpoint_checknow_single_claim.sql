-- One-time read-only Query API host/response diagnostic, explicitly
-- authorized on 2026-11-16. Shared daily quota ledger and serializing lock.
-- Slot -3 is reserved for this SINGLE test, not a production time slot.
ALTER TABLE public.matchpoint_query_request_claims
 DROP CONSTRAINT matchpoint_query_request_claims_slot_hour_check;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_slot_hour_check
 CHECK (slot_hour IN (-3,-2,-1,9,11,13,15,17,19,21,23));
ALTER TABLE public.matchpoint_query_request_claims
 DROP CONSTRAINT matchpoint_query_request_claims_feed_check;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_feed_check
 CHECK (feed IN ('bookings','matches','activities','diagnostic_bookings','diagnostic_retest','diagnostic_checknow'));
CREATE OR REPLACE FUNCTION public.matchpoint_claim_checknow_20261116()
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE
 v_day date;
 v_count integer;
 v_added integer;
BEGIN
 IF current_user <> 'service_role' THEN
  RAISE EXCEPTION 'Only service_role may claim MatchPoint diagnostic quota';
 END IF;
 v_day:=timezone('Asia/Beirut',clock_timestamp())::date;
 IF v_day <> DATE '2026-11-16' THEN RETURN false; END IF;
 PERFORM pg_advisory_xact_lock(774816,(v_day-DATE '2000-01-01')::integer);
 SELECT COUNT(*) INTO v_count FROM public.matchpoint_query_request_claims
 WHERE request_date=v_day;
 IF v_count >= 24 THEN RETURN false; END IF;
 INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,feed)
 VALUES(v_day,-3,'diagnostic_checknow') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 RETURN v_added=1;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_checknow_20261116() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_checknow_20261116() TO service_role;