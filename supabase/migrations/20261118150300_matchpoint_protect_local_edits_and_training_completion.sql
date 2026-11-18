-- Preserve staff-local edits and enable authenticated private training completion.
CREATE OR REPLACE FUNCTION public.club_private_training_complete(p_booking_id uuid, p_coach_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_booking public.padel_court_reservations%rowtype;v_entry uuid;v_previous_context text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 SELECT * INTO v_booking FROM public.padel_court_reservations WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.private_client_id IS NULL OR v_booking.status<>'confirmed'
 THEN RAISE EXCEPTION 'Select a confirmed private training booking'; END IF;
 IF v_booking.business_date>(now() at time zone 'Asia/Beirut')::date
 THEN RAISE EXCEPTION 'Future training cannot be marked completed'; END IF;
 IF v_booking.private_session_entry_id IS NOT NULL
 THEN RAISE EXCEPTION 'Session already recorded; use Private Sessions for corrections'; END IF;
 IF p_coach_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.private_coaches WHERE id=p_coach_id AND active)
 THEN RAISE EXCEPTION 'Choose an active coach to record the session'; END IF;
 v_entry:=gen_random_uuid();
 PERFORM public.private_log_entry(v_entry,v_booking.private_client_id,'session',v_booking.business_date,
   p_coach_id,v_booking.private_session_fee_cents,0,0,
   left('Court training · '||v_booking.sport||' '||v_booking.court_number||
    ' '||v_booking.booking_start_time::text||' · '||coalesce(v_booking.notes,''),500));
 -- The authenticated staff-only completion RPC is also an authorized local edit.
 v_previous_context:=current_setting('app.matchpoint_local_edit',true);
 IF v_booking.external_source='matchpoint' THEN
  PERFORM set_config('app.matchpoint_local_edit','yes',true);
 END IF;
 UPDATE public.padel_court_reservations
 SET private_session_entry_id=v_entry,private_coach_id=p_coach_id,
     external_local_override=CASE WHEN external_source='matchpoint' THEN true ELSE external_local_override END,
     external_local_edited_at=CASE WHEN external_source='matchpoint' THEN now() ELSE external_local_edited_at END,
     revision=revision+1,updated_at=now() WHERE id=p_booking_id;
 IF v_booking.external_source='matchpoint' THEN
  PERFORM set_config('app.matchpoint_local_edit',coalesce(v_previous_context,''),true);
 END IF;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'COMPLETE','court_private_training',p_booking_id::text,
  jsonb_build_object('private_ledger_entry_id',v_entry,'fee_cents',v_booking.private_session_fee_cents));
 RETURN v_entry;
END $function$;

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
  -- Even if the importer read an outdated row, remote writes must not mutate
  -- locally edited booking data. Provider metadata remains refreshable.
  IF current_user = 'service_role' THEN
   IF (NEW.external_local_override,NEW.external_local_edited_at,NEW.notes,NEW.checkmarks,
       NEW.private_client_id,NEW.private_coach_id,NEW.private_session_fee_cents,
       NEW.private_session_entry_id,NEW.pickleball_player_count)
      IS DISTINCT FROM
      (OLD.external_local_override,OLD.external_local_edited_at,OLD.notes,OLD.checkmarks,
       OLD.private_client_id,OLD.private_coach_id,OLD.private_session_fee_cents,
       OLD.private_session_entry_id,OLD.pickleball_player_count)
   THEN RAISE EXCEPTION 'MatchPoint cannot overwrite local reservation fields'; END IF;
   IF OLD.external_local_override IS TRUE AND
      (NEW.business_date,NEW.sport,NEW.court_number,NEW.booking_start_time,
       NEW.booking_end_time,NEW.duration_minutes,NEW.customer_name,NEW.status,NEW.booking_type)
      IS DISTINCT FROM
      (OLD.business_date,OLD.sport,OLD.court_number,OLD.booking_start_time,
       OLD.booking_end_time,OLD.duration_minutes,OLD.customer_name,OLD.status,OLD.booking_type)
   THEN RAISE EXCEPTION 'MatchPoint cannot overwrite a locally edited reservation'; END IF;
  END IF;
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
