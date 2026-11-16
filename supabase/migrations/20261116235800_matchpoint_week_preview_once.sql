-- ONE user-authorized 7-day MatchPoint bookings import on 16/17 Nov 2026.
-- Uses an unused existing allowed (slot_hour,feed) pair, -1/diagnostic_retest.
-- Uses the SAME serializing advisory lock + 24 requests/day cap as production.
-- Exactly one claim on each calendar date at most; this workflow runs once.
CREATE OR REPLACE FUNCTION public.matchpoint_claim_week_preview_20261116()
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
DECLARE v_date date;v_count int;v_inserted int;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'MatchPoint preview claim requires service_role';END IF;
 v_date:=timezone('Asia/Beirut',clock_timestamp())::date;
 IF v_date NOT IN (DATE '2026-11-16',DATE '2026-11-17') THEN RETURN false;END IF;
 PERFORM pg_advisory_xact_lock(774816,(v_date-DATE '2000-01-01')::int);
 SELECT count(*) INTO v_count FROM public.matchpoint_query_request_claims WHERE request_date=v_date;
 IF v_count>=24 THEN RETURN false;END IF;
 INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,feed)
 VALUES(v_date,-1,'diagnostic_retest')
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS v_inserted=ROW_COUNT;
 RETURN v_inserted=1;
END;
$$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_week_preview_20261116() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_week_preview_20261116() TO service_role;