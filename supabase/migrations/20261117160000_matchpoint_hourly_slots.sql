-- Allow 15 local hourly booking slots. Keep all historical diagnostic claims,
-- privileges, primary key, per-day advisory lock and 24-call ceiling intact.
ALTER TABLE public.matchpoint_query_request_claims DROP CONSTRAINT matchpoint_query_request_claims_slot_hour_check;
ALTER TABLE public.matchpoint_query_request_claims ADD CONSTRAINT matchpoint_query_request_claims_slot_hour_check
 CHECK(slot_hour IN (-3,-2,-1) OR slot_hour BETWEEN 9 AND 23);
CREATE OR REPLACE FUNCTION public.matchpoint_claim_query_request(p_feed text)
 RETURNS boolean
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_now timestamp;
  v_date date;
  v_hour integer;
  v_minute integer;
  v_used integer;
  v_inserted integer;
BEGIN
  IF current_user <> 'service_role' THEN
    RAISE EXCEPTION 'MatchPoint API claims require server-side service authorization';
  END IF;
  IF p_feed NOT IN ('bookings','matches','activities') OR p_feed IS NULL THEN
    RAISE EXCEPTION 'Unknown MatchPoint feed';
  END IF;
  v_now:=timezone('Asia/Beirut',clock_timestamp());
  v_date:=v_now::date;
  v_hour:=extract(hour from v_now)::integer;
  v_minute:=extract(minute from v_now)::integer;
  -- 09:00–23:44 (local), at fifteen hourly slots, including DST changes.
  IF v_hour NOT BETWEEN 9 AND 23 OR v_minute>=45 THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(774816, (v_date-DATE '2000-01-01')::integer);
  SELECT count(*) INTO v_used
  FROM public.matchpoint_query_request_claims
  WHERE request_date=v_date;
  IF v_used>=24 THEN RETURN false; END IF;
  INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,feed)
  VALUES(v_date,v_hour,p_feed)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  RETURN v_inserted=1;
END $function$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_query_request(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_query_request(text) TO service_role;
