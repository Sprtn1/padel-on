-- One-time user-authorized read-only MatchPoint booking preview.
-- Existing table already permits slot -3 and feed diagnostic_retest.
-- This PAIR is unique and unused, so no table constraint changes required.
-- The same advisory lock and 24/day count as the regular reservation feed.
CREATE OR REPLACE FUNCTION public.matchpoint_claim_forced_preview_20261116()
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp
AS $$
DECLARE
  v_date date;
  v_count integer;
  v_added integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Only server-side service role may claim forced MatchPoint preview';
  END IF;
  v_date := timezone('Asia/Beirut',clock_timestamp())::date;
  IF v_date <> DATE '2026-11-16' THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(774816,(v_date-DATE '2000-01-01')::integer);
  SELECT COUNT(*) INTO v_count
    FROM public.matchpoint_query_request_claims WHERE request_date=v_date;
  IF v_count >= 24 THEN RETURN false; END IF;
  INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,feed)
    VALUES (v_date,-3,'diagnostic_retest') ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_added=ROW_COUNT;
  RETURN v_added=1;
END;
$$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_forced_preview_20261116() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_forced_preview_20261116() TO service_role;