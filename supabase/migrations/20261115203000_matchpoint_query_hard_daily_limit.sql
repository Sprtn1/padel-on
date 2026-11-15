-- A hard ceiling of 24 MatchPoint HTTP requests per Beirut calendar day.
-- Each claimed row is committed BEFORE the outgoing network call, including failures.
-- Unchanged customer bookings and financial records; only new accounting metadata.
CREATE TABLE IF NOT EXISTS public.matchpoint_query_request_claims (
  request_date date NOT NULL,
  slot_hour smallint NOT NULL CHECK (slot_hour IN (9,11,13,15,17,19,21,23)),
  feed text NOT NULL CHECK (feed IN ('bookings','matches','activities')),
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (request_date,slot_hour,feed)
);
ALTER TABLE public.matchpoint_query_request_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matchpoint_query_request_claims FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.matchpoint_query_request_claims TO service_role;

-- Invoker privileges and grants prevent any website/staff user from spending the quota.
-- Advisory lock serializes the count and claim even if two Actions workers race.
CREATE OR REPLACE FUNCTION public.matchpoint_claim_query_request(p_feed text)
RETURNS boolean
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp
AS $$
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
  -- 09:00–23:44 (local), at eight odd-hour slots, including DST changes.
  IF v_hour NOT IN (9,11,13,15,17,19,21,23) OR v_minute>=45 THEN
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
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_claim_query_request(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_claim_query_request(text) TO service_role;
