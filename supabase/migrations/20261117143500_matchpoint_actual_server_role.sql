-- PostgREST exposes modern claims as a JSON object and switches to the
-- authenticated database role. Do not rely on deprecated individual JWT GUCs.
-- This trigger is SECURITY INVOKER: current_user reflects the actual trusted
-- database role, not user-controlled claims. All staff edit guards remain.
CREATE OR REPLACE FUNCTION public.guard_matchpoint_booking_ownership()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.external_source='matchpoint'
     AND current_user <> 'service_role'
  THEN RAISE EXCEPTION 'Only the MatchPoint integration can import external reservations'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.external_source='matchpoint' THEN
  IF current_user <> 'service_role'
     AND NEW.external_remote_snapshot IS DISTINCT FROM OLD.external_remote_snapshot
  THEN RAISE EXCEPTION 'MatchPoint provider snapshots are server-managed';END IF;
  IF (NEW.external_source,NEW.external_kind,NEW.external_id)
      IS DISTINCT FROM (OLD.external_source,OLD.external_kind,OLD.external_id)
  THEN RAISE EXCEPTION 'MatchPoint external identifiers are immutable'; END IF;
  IF current_user <> 'service_role' THEN
   IF NEW.external_local_override IS DISTINCT FROM OLD.external_local_override
      AND (auth.uid() IS NULL OR NOT public.is_staff() OR
       current_setting('app.matchpoint_local_edit',true) IS DISTINCT FROM 'yes')
   THEN RAISE EXCEPTION 'Use the staff editor to manage imported booking overrides';END IF;
   IF (NEW.business_date,NEW.sport,NEW.court_number,NEW.booking_start_time,
       NEW.booking_end_time,NEW.duration_minutes,NEW.customer_name,NEW.status,
       NEW.booking_type,NEW.private_client_id,NEW.private_coach_id,
       NEW.private_session_fee_cents,NEW.private_session_entry_id)
       IS DISTINCT FROM
      (OLD.business_date,OLD.sport,OLD.court_number,OLD.booking_start_time,
       OLD.booking_end_time,OLD.duration_minutes,OLD.customer_name,OLD.status,
       OLD.booking_type,OLD.private_client_id,OLD.private_coach_id,
       OLD.private_session_fee_cents,OLD.private_session_entry_id)
   THEN
    IF auth.uid() IS NULL OR NOT public.is_staff()
       OR current_setting('app.matchpoint_local_edit',true) IS DISTINCT FROM 'yes'
       OR NEW.external_local_override IS DISTINCT FROM true
    THEN RAISE EXCEPTION 'Edit synced booking details through the staff reservation editor';END IF;
   END IF;
  END IF;
 END IF;
 RETURN NEW;
END $function$;
REVOKE ALL ON FUNCTION public.guard_matchpoint_booking_ownership() FROM PUBLIC,anon,authenticated;
