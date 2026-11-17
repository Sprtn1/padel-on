-- pg_net holds transient HTTP headers; authenticate using a short-lived HMAC
-- signature instead of sending the durable Vault key in those headers.
DROP FUNCTION IF EXISTS public.matchpoint_get_cron_config(text);
CREATE OR REPLACE FUNCTION public.matchpoint_get_cron_config(p_timestamp text,p_signature text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_config jsonb; v_key text; v_time timestamptz;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Server role required'; END IF;
 IF p_timestamp IS NULL OR p_timestamp !~ '^[0-9]{10}$' OR p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' THEN RETURN NULL; END IF;
 v_time:=to_timestamp(p_timestamp::bigint);
 IF abs(extract(epoch FROM clock_timestamp()-v_time))>180 THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_cron_key';
 IF v_key IS NULL OR encode(extensions.hmac(p_timestamp,v_key,'sha256'),'hex') IS DISTINCT FROM p_signature THEN RETURN NULL; END IF;
 SELECT decrypted_secret::jsonb INTO v_config FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_config';
 RETURN v_config;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_get_cron_config(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_get_cron_config(text,text) TO service_role;

CREATE OR REPLACE FUNCTION club_internal.dispatch_matchpoint_sync()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_now timestamp:=timezone('Asia/Beirut',clock_timestamp());
 v_hour int; v_minute int; v_key text; v_paused boolean; v_timestamp text;
BEGIN
 v_hour:=extract(hour FROM v_now)::int; v_minute:=extract(minute FROM v_now)::int;
 IF v_hour NOT BETWEEN 9 AND 21 OR (v_hour=21 AND v_minute>=30) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.matchpoint_query_request_claims WHERE request_date=v_now::date
  AND slot_hour=v_hour AND slot_minute=CASE WHEN v_minute<30 THEN 0 ELSE 30 END AND feed='bookings')
 OR (SELECT count(*) FROM public.matchpoint_query_request_claims WHERE request_date=v_now::date)>=25 THEN RETURN NULL; END IF;
 SELECT (decrypted_secret::jsonb->>'paused')::boolean INTO v_paused FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_config';
 IF v_paused IS DISTINCT FROM false THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_cron_key';
 IF v_key IS NULL THEN RETURN NULL; END IF;
 v_timestamp:=floor(extract(epoch FROM clock_timestamp()))::bigint::text;
 RETURN net.http_post(url:='https://qonscbdbawmvhcdfcvlo.supabase.co/functions/v1/matchpoint-sync',
  headers:=jsonb_build_object('Content-Type','application/json','X-Padelon-Cron-Time',v_timestamp,
   'X-Padelon-Cron-Signature',encode(extensions.hmac(v_timestamp,v_key,'sha256'),'hex')),
  body:='{}'::jsonb,timeout_milliseconds:=120000);
END $$;
REVOKE ALL ON FUNCTION club_internal.dispatch_matchpoint_sync() FROM PUBLIC,anon,authenticated,service_role;
