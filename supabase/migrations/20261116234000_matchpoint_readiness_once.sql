-- One-time read-only MatchPoint readiness diagnostic: authorized Nov 16 only.
-- Uses existing allowed slot (-2) and feed (diagnostic_checknow) combination,
-- never used before, in the exact same ledger and advisory lock as production.
CREATE OR REPLACE FUNCTION public.matchpoint_claim_readiness_20261116()
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE v_date date;v_used integer;v_added integer;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Server-side role required';END IF;
 v_date:=timezone('Asia/Beirut',clock_timestamp())::date;
 IF v_date<>DATE '2026-11-16' THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(774816,(v_date-DATE '2000-01-01')::integer);
 SELECT count(*) INTO v_used FROM public.matchpoint_query_request_claims WHERE request_date=v_date;
 IF v_used>=24 THEN RETURN false;END IF;
 INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,feed)
 VALUES(v_date,-2,'diagnostic_checknow') ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_added=ROW_COUNT;
 RETURN v_added=1;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_readiness_20261116() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_readiness_20261116() TO service_role;