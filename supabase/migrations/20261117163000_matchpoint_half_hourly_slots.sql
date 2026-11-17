-- Keep earlier hourly/diagnostic claims as minute zero. Do not reset the
-- daily ledger or modify any reservation/payment records.
ALTER TABLE public.matchpoint_query_request_claims
 ADD COLUMN slot_minute smallint NOT NULL DEFAULT 0;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_slot_minute_check
 CHECK (slot_minute IN (0,30) AND (slot_hour BETWEEN 9 AND 20 OR slot_minute=0));
ALTER TABLE public.matchpoint_query_request_claims
 DROP CONSTRAINT matchpoint_query_request_claims_pkey;
ALTER TABLE public.matchpoint_query_request_claims
 ADD CONSTRAINT matchpoint_query_request_claims_pkey
 PRIMARY KEY (request_date,slot_hour,slot_minute,feed);
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
  -- 25 half-hour slots from 09:00 through 21:00 Beirut time.
  IF v_hour NOT BETWEEN 9 AND 21 OR (v_hour=21 AND v_minute>=30) THEN
    RETURN false;
  END IF;
  PERFORM pg_advisory_xact_lock(774816, (v_date-DATE '2000-01-01')::integer);
  SELECT count(*) INTO v_used
  FROM public.matchpoint_query_request_claims
  WHERE request_date=v_date;
  IF v_used>=25 THEN RETURN false; END IF;
  INSERT INTO public.matchpoint_query_request_claims(request_date,slot_hour,slot_minute,feed)
  VALUES(v_date,v_hour,CASE WHEN v_minute<30 THEN 0 ELSE 30 END,p_feed)
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_inserted=ROW_COUNT;
  RETURN v_inserted=1;
END $function$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_query_request(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_query_request(text) TO service_role;
