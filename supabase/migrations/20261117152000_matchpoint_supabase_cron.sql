-- Supabase-based MatchPoint schedule; no existing booking/payment data is modified.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- The endpoint has its own randomly generated server-only authentication key.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name='padelon_matchpoint_cron_key') THEN
  PERFORM vault.create_secret(gen_random_uuid()::text||gen_random_uuid()::text,
     'padelon_matchpoint_cron_key','Private authentication for the MatchPoint Cron Edge Function');
 END IF;
END $$;

-- Only the trusted server-side GitHub bootstrap can provision the provider configuration.
-- Vault's table write grants are not expanded. Never return credential contents.
CREATE OR REPLACE FUNCTION public.matchpoint_set_cron_config(p_token text,p_map text,p_center text,p_paused boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_id uuid; v_map jsonb; v_config text;
BEGIN
 IF current_setting('role',true) IS DISTINCT FROM 'service_role' THEN
  RAISE EXCEPTION 'Server role required';
 END IF;
 IF p_token IS NULL OR length(btrim(p_token))=0 OR length(p_token)>8192 THEN
  RAISE EXCEPTION 'Missing or invalid MatchPoint token';
 END IF;
 v_map:=p_map::jsonb;
 IF jsonb_typeof(v_map) IS DISTINCT FROM 'object' OR v_map='{}'::jsonb THEN
  RAISE EXCEPTION 'Invalid MatchPoint court mapping';
 END IF;
 v_config:=jsonb_build_object('token',p_token,'map',v_map,'center',coalesce(p_center,''),'paused',coalesce(p_paused,true))::text;
 PERFORM pg_advisory_xact_lock(774817);
 SELECT id INTO v_id FROM vault.secrets WHERE name='padelon_matchpoint_config';
 IF v_id IS NULL THEN
  PERFORM vault.create_secret(v_config,'padelon_matchpoint_config','Server-only MatchPoint Query API configuration');
 ELSE
  PERFORM vault.update_secret(v_id,v_config);
 END IF;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_set_cron_config(text,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_set_cron_config(text,text,text,boolean) TO service_role;

-- The function is callable only with the service role, and it also verifies
-- the secret sent by the private scheduled caller. No credential leaves the Edge runtime.
CREATE OR REPLACE FUNCTION public.matchpoint_get_cron_config(p_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_config jsonb; v_key text;
BEGIN
 IF current_user<>'service_role' THEN RAISE EXCEPTION 'Server role required'; END IF;
 IF p_key IS NULL OR length(p_key)<>72 THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_cron_key';
 IF v_key IS NULL OR v_key IS DISTINCT FROM p_key THEN RETURN NULL; END IF;
 SELECT decrypted_secret::jsonb INTO v_config FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_config';
 RETURN v_config;
END $$;
REVOKE ALL ON FUNCTION public.matchpoint_get_cron_config(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.matchpoint_get_cron_config(text) TO service_role;

-- Native Cron runs as postgres. Do not expose the dispatch routine to app roles.
CREATE OR REPLACE FUNCTION club_internal.dispatch_matchpoint_sync()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE v_now timestamp:=timezone('Asia/Beirut',clock_timestamp());
 v_hour int; v_minute int; v_key text; v_paused boolean;
BEGIN
 v_hour:=extract(hour FROM v_now)::int;
 v_minute:=extract(minute FROM v_now)::int;
 IF v_hour NOT BETWEEN 9 AND 21 OR (v_hour=21 AND v_minute>=30) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.matchpoint_query_request_claims WHERE request_date=v_now::date
  AND slot_hour=v_hour AND slot_minute=CASE WHEN v_minute<30 THEN 0 ELSE 30 END AND feed='bookings')
 OR (SELECT count(*) FROM public.matchpoint_query_request_claims WHERE request_date=v_now::date)>=25 THEN RETURN NULL; END IF;
 SELECT (decrypted_secret::jsonb->>'paused')::boolean INTO v_paused FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_config';
 IF v_paused IS DISTINCT FROM false THEN RETURN NULL; END IF;
 SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='padelon_matchpoint_cron_key';
 IF v_key IS NULL THEN RETURN NULL; END IF;
 RETURN net.http_post(url:='https://qonscbdbawmvhcdfcvlo.supabase.co/functions/v1/matchpoint-sync',
  headers:=jsonb_build_object('Content-Type','application/json','X-Padelon-Cron-Key',v_key),
  body:='{}'::jsonb,timeout_milliseconds:=120000);
END $$;
REVOKE ALL ON FUNCTION club_internal.dispatch_matchpoint_sync() FROM PUBLIC,anon,authenticated,service_role;

-- Network queue contains transient authorization headers. No browser role should see them.
REVOKE ALL ON TABLE net.http_request_queue,net._http_response FROM PUBLIC,anon,authenticated;
-- Job activation is intentionally separate, after credentials and Edge runtime are verified.
