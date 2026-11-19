-- Local court receipts outside operating hours and explicit bulk adoption of provider logistics.
-- No existing bookings or payments are changed by installing this migration.
CREATE OR REPLACE FUNCTION public.club_court_reservation_save(p_id uuid, p_business_date date, p_sport text, p_court text, p_start text, p_duration integer, p_customer text, p_notes text, p_status text, p_booking_type text, p_expected_revision integer, p_payment_total_cents bigint, p_cash_cents bigint, p_whish_cents bigint, p_unpaid_cents bigint, p_split_revision integer, p_update_payments boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_old public.padel_court_reservations%rowtype;
 v_id uuid:=coalesce(p_id,gen_random_uuid());
 v_today date:=(now() at time zone 'Asia/Beirut')::date;
 v_start integer;v_end integer;v_raw integer;v_other_start integer;v_other_end integer;
 v_end_time time;v_category text;v_name text:=btrim(coalesce(p_customer,''));
 v_notes text:=btrim(coalesce(p_notes,''));
 v_booking record;v_ledger record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required';END IF;
 IF p_business_date IS NULL OR p_business_date < date '2025-01-01' OR p_business_date > v_today+365
  THEN RAISE EXCEPTION 'Date is outside the reservation window';END IF;
 IF (p_sport='padel' AND p_court IN ('C1','C2','C3')) THEN v_category:='padel_courts';
 ELSIF p_sport='pickleball' AND p_court='P1' THEN v_category:='pickleball_courts';
 ELSIF p_sport='basketball' AND p_court='B1' THEN v_category:='basketball_courts';
 ELSE RAISE EXCEPTION 'Select a valid court in the chosen sport';END IF;
 IF p_booking_type NOT IN ('reservation','block') OR p_booking_type IS NULL
  THEN RAISE EXCEPTION 'Invalid booking type';END IF;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN RAISE EXCEPTION 'Invalid start time';END IF;
 IF p_duration IS NULL OR p_duration NOT BETWEEN 1 AND 960 OR
    (p_duration%30<>0 AND NOT EXISTS(SELECT 1 FROM public.padel_court_reservations
        WHERE id=p_id AND external_source='matchpoint'))
  THEN RAISE EXCEPTION 'Duration must use 30-minute intervals';END IF;
 v_raw:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 v_start:=CASE WHEN v_raw<=60 THEN v_raw+1440 ELSE v_raw END;
 v_end:=v_start+p_duration;
 -- Local ordinary bookings may use the entire clock. Blocks/imported bookings
 -- retain the timetable range; the overlap trigger still protects adjacent days.
 IF ((p_booking_type <> 'reservation' OR EXISTS(SELECT 1 FROM public.padel_court_reservations
        WHERE id=p_id AND (external_source='matchpoint' OR private_client_id IS NOT NULL)))
      AND (v_start<540 OR v_start>=1500 OR v_end>1500))
    OR (v_start%30<>0 AND NOT EXISTS(SELECT 1 FROM public.padel_court_reservations
        WHERE id=p_id AND external_source='matchpoint'))
  THEN RAISE EXCEPTION 'Choose a valid start time; blocks, training and synced bookings must fit from 09:00 through 01:00';END IF;
 IF char_length(v_name) NOT BETWEEN 2 AND 120 OR char_length(v_notes)>500
  THEN RAISE EXCEPTION 'Enter a valid name or block reason and notes';END IF;
 IF p_status NOT IN ('confirmed','tentative','cancelled') OR p_status IS NULL
  THEN RAISE EXCEPTION 'Invalid booking status';END IF;
 IF p_booking_type='block' AND (coalesce(p_payment_total_cents,0)<>0 OR
   coalesce(p_cash_cents,0)<>0 OR coalesce(p_whish_cents,0)<>0 OR coalesce(p_unpaid_cents,0)<>0)
  THEN RAISE EXCEPTION 'Blocked time cannot collect payments';END IF;
 v_end_time:=make_time((v_end%1440)/60,(v_end%1440)%60,0);
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),p_business_date-date '2000-01-01');
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation no longer exists';END IF;
  IF p_expected_revision IS NULL OR v_old.revision<>p_expected_revision
   THEN RAISE EXCEPTION 'Reservation changed on another device. Refresh first';END IF;
  IF v_old.business_date<>p_business_date OR v_old.sport<>p_sport OR
      (v_old.booking_type<>p_booking_type AND v_old.external_source IS DISTINCT FROM 'matchpoint')
   THEN RAISE EXCEPTION 'Change sport/date/type by creating a new booking, not overwriting a record';END IF;
  IF v_old.external_source='matchpoint' THEN
   IF v_old.private_session_entry_id IS NOT NULL AND p_booking_type='block'
    THEN RAISE EXCEPTION 'Completed private training cannot become a blocked court';END IF;
   IF p_booking_type<>'reservation' AND EXISTS (
    SELECT 1 FROM public.court_payment_splits WHERE source_kind='reservation'
     AND source_id=p_id AND voided_at IS NULL
   ) THEN RAISE EXCEPTION 'Reverse court payments before changing the booking type';END IF;
   PERFORM set_config('app.matchpoint_local_edit','yes',true);
  END IF;
 END IF;
 IF p_status<>'cancelled' THEN
  FOR v_booking IN SELECT booking_start_time,duration_minutes
   FROM public.padel_court_reservations
   WHERE business_date=p_business_date AND sport=p_sport AND court_number=p_court
    AND status<>'cancelled' AND id<>v_id
  LOOP
   v_other_start:=extract(hour FROM v_booking.booking_start_time)::integer*60+
    extract(minute FROM v_booking.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440;END IF;
   v_other_end:=v_other_start+v_booking.duration_minutes;
   IF v_start<v_other_end AND v_other_start<v_end
    THEN RAISE EXCEPTION 'That court is already reserved during these hours';END IF;
  END LOOP;
  FOR v_ledger IN SELECT booking_start_time,booking_end_time
   FROM public.cafeteria_finance_entries
   WHERE entry_date=p_business_date AND category=v_category AND voided_at IS NULL
    AND (p_sport<>'padel' OR court_number=p_court)
    AND booking_start_time IS NOT NULL AND booking_end_time IS NOT NULL
  LOOP
   v_other_start:=extract(hour FROM v_ledger.booking_start_time)::integer*60+
    extract(minute FROM v_ledger.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440;END IF;
   v_other_end:=extract(hour FROM v_ledger.booking_end_time)::integer*60+
    extract(minute FROM v_ledger.booking_end_time)::integer;
   IF v_other_end<=v_other_start THEN v_other_end:=v_other_end+1440;END IF;
   IF v_start<v_other_end AND v_other_start<v_end
    THEN RAISE EXCEPTION 'A recorded court booking already uses that time';END IF;
  END LOOP;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.padel_court_reservations
  (id,business_date,sport,court_number,booking_type,booking_start_time,booking_end_time,
   duration_minutes,customer_name,notes,status,created_by)
  VALUES(v_id,p_business_date,p_sport,p_court,p_booking_type,p_start::time,v_end_time,
   p_duration,v_name,v_notes,p_status,auth.uid());
 ELSE
  UPDATE public.padel_court_reservations SET
   court_number=p_court,booking_start_time=p_start::time,booking_end_time=v_end_time,
   duration_minutes=p_duration,customer_name=v_name,notes=v_notes,status=p_status,
   booking_type=p_booking_type,
   private_client_id=CASE WHEN p_booking_type='block' THEN NULL ELSE private_client_id END,
   private_coach_id=CASE WHEN p_booking_type='block' THEN NULL ELSE private_coach_id END,
   private_session_fee_cents=CASE WHEN p_booking_type='block' THEN 0 ELSE private_session_fee_cents END,
   private_session_entry_id=CASE WHEN p_booking_type='block' THEN NULL ELSE private_session_entry_id END,
   external_local_override=CASE WHEN external_source='matchpoint' THEN true ELSE external_local_override END,
   external_local_edited_at=CASE WHEN external_source='matchpoint' THEN now() ELSE external_local_edited_at END,
   updated_at=now(),revision=revision+1 WHERE id=v_id;
 END IF;
 IF p_status='cancelled' THEN
  -- Only zero-receipt reservations can be cancelled; existing guard rejects paid cancellations.
  UPDATE public.court_payment_splits SET voided_at=now(),updated_at=now()
   WHERE source_kind='reservation' AND source_id=v_id AND voided_at IS NULL
    AND cash_cents=0 AND whish_cents=0;
 ELSIF p_booking_type='reservation' AND coalesce(p_update_payments,false) THEN
  IF p_payment_total_cents IS NULL OR p_payment_total_cents<1
   THEN RAISE EXCEPTION 'Enter a valid court price before recording payments';END IF;
  PERFORM public.court_payment_split_save('reservation',v_id,p_payment_total_cents,
   p_cash_cents,p_whish_cents,p_unpaid_cents,p_split_revision,NULL);
 END IF;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),CASE WHEN p_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
  'padel_court_reservations',v_id::text,
  CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
  jsonb_build_object('sport',p_sport,'court',p_court,'type',p_booking_type,'date',p_business_date,
   'start',p_start,'duration',p_duration,'status',p_status));
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.matchpoint_resolve_all_remote(p_issues jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_issue jsonb; v_row public.padel_court_reservations%rowtype;
 v_next public.padel_court_reservations%rowtype;
 v_snapshot jsonb; v_status text; v_paid boolean; v_resolved integer:=0;
 v_skipped jsonb:='[]'::jsonb; v_context text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Only staff may resolve booking sync issues'; END IF;
 IF jsonb_typeof(p_issues) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Select sync issues first'; END IF;
 v_context:=current_setting('app.matchpoint_local_edit',true);
 FOR v_issue IN SELECT value FROM jsonb_array_elements(p_issues)
 LOOP
  BEGIN
   SELECT * INTO v_row FROM public.padel_court_reservations WHERE id=(v_issue->>'id')::uuid FOR UPDATE;
   IF NOT FOUND OR v_row.external_source IS DISTINCT FROM 'matchpoint'
      OR v_row.external_alert IS NULL OR v_row.revision IS DISTINCT FROM (v_issue->>'revision')::integer
      OR v_row.external_alert IS DISTINCT FROM v_issue->>'alert'
      OR v_row.external_status IS DISTINCT FROM v_issue->>'remote_status'
      OR coalesce(v_row.external_remote_snapshot,'null'::jsonb) IS DISTINCT FROM coalesce(v_issue->'snapshot','null'::jsonb)
   THEN RAISE EXCEPTION 'Issue changed; refresh and try again'; END IF;
   v_snapshot:=v_row.external_remote_snapshot;
   IF v_row.external_status='MISSING' AND v_row.external_missing_count<2 THEN
    RAISE EXCEPTION 'Awaiting a second complete MatchPoint sync';
   END IF;
   IF v_row.external_status IN ('MISSING','CANCELLED','CANCELED') THEN
    v_status:='cancelled';
   ELSE
    v_status:=v_snapshot->>'status';
   END IF;
   IF v_snapshot IS NULL OR v_status IS NULL OR v_status NOT IN ('confirmed','tentative','cancelled')
      OR nullif(v_snapshot->>'business_date','') IS NULL
      OR nullif(v_snapshot->>'sport','') IS NULL
      OR nullif(v_snapshot->>'court_number','') IS NULL
      OR nullif(v_snapshot->>'booking_start_time','') IS NULL
      OR nullif(v_snapshot->>'booking_end_time','') IS NULL
      OR nullif(v_snapshot->>'duration_minutes','') IS NULL
      OR nullif(v_snapshot->>'customer_name','') IS NULL
   THEN RAISE EXCEPTION 'Complete MatchPoint booking details are unavailable'; END IF;
   SELECT EXISTS(SELECT 1 FROM public.court_payment_splits WHERE source_kind='reservation'
     AND source_id=v_row.id AND voided_at IS NULL) INTO v_paid;
   IF v_row.private_session_entry_id IS NOT NULL THEN RAISE EXCEPTION 'Completed training requires manual review'; END IF;
   IF (v_paid OR true=ANY(v_row.checkmarks)) AND
      (v_status='cancelled' OR v_row.sport IS DISTINCT FROM v_snapshot->>'sport'
        OR v_row.business_date IS DISTINCT FROM (v_snapshot->>'business_date')::date)
   THEN RAISE EXCEPTION 'Recorded payments or player marks require manual review'; END IF;
   -- This is a staff-authorized explicit overwrite, not an automatic sync.
   -- Use the existing local-edit guard for the logistics update; clear the override
   -- in a separate update in the same subtransaction.
   PERFORM set_config('app.matchpoint_local_edit','yes',true);
   UPDATE public.padel_court_reservations SET
    business_date=(v_snapshot->>'business_date')::date,
    sport=v_snapshot->>'sport',court_number=v_snapshot->>'court_number',
    booking_start_time=(v_snapshot->>'booking_start_time')::time,
    booking_end_time=(v_snapshot->>'booking_end_time')::time,
    duration_minutes=(v_snapshot->>'duration_minutes')::integer,
    customer_name=v_snapshot->>'customer_name',status=v_status,booking_type='reservation',
    private_client_id=NULL,private_coach_id=NULL,private_session_fee_cents=0,
    pickleball_player_count=CASE WHEN sport IS DISTINCT FROM v_snapshot->>'sport' THEN 4 ELSE pickleball_player_count END,
    external_local_override=true,external_local_edited_at=now(),
    external_review_ack=NULL,external_alert=NULL,revision=revision+1,updated_at=now()
   WHERE id=v_row.id;
   UPDATE public.padel_court_reservations SET external_local_override=false,external_local_edited_at=NULL
    WHERE id=v_row.id RETURNING * INTO v_next;
   INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
   VALUES(auth.uid(),'MATCHPOINT_ACCEPT_REMOTE','padel_court_reservations',v_row.id::text,
    to_jsonb(v_row),to_jsonb(v_next));
   v_resolved:=v_resolved+1;
  EXCEPTION WHEN OTHERS THEN
   v_skipped:=v_skipped||jsonb_build_array(jsonb_build_object('id',v_issue->>'id','reason',SQLERRM));
  END;
 END LOOP;
 PERFORM set_config('app.matchpoint_local_edit',coalesce(v_context,''),true);
 RETURN jsonb_build_object('resolved',v_resolved,'skipped',v_skipped);
END;
$$;
REVOKE ALL ON FUNCTION public.matchpoint_resolve_all_remote(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.matchpoint_resolve_all_remote(jsonb) TO authenticated;

-- Private-training wrapper retains its existing operating-hours constraint.
CREATE OR REPLACE FUNCTION public.club_private_training_save(p_id uuid, p_business_date date, p_sport text, p_court text, p_start text, p_duration integer, p_client_id uuid, p_coach_id uuid, p_session_fee_cents bigint, p_notes text, p_status text, p_expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;v_client record;v_existing public.padel_court_reservations%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]
 SELECT id,name INTO v_client FROM public.private_clients WHERE id=p_client_id
  AND active AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active Private Sessions client'; END IF;
 IF p_coach_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.private_coaches WHERE id=p_coach_id AND active)
 THEN RAISE EXCEPTION 'Select an active coach or leave coach unassigned'; END IF;
 IF p_session_fee_cents IS NULL OR p_session_fee_cents<0 OR p_session_fee_cents>100000000000
 THEN RAISE EXCEPTION 'Enter a valid session fee'; END IF;
 -- Match the shared day lock order of existing court booking saves.
 IF p_business_date IS NULL THEN RAISE EXCEPTION 'Choose a booking date'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),p_business_date-date '2000-01-01');
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_existing FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR (v_existing.private_client_id IS NULL
     AND v_existing.external_source IS DISTINCT FROM 'matchpoint')
    THEN RAISE EXCEPTION 'Private training booking not found'; END IF;
  IF v_existing.external_source='matchpoint' AND EXISTS(
   SELECT 1 FROM public.court_payment_splits
    WHERE source_kind='reservation' AND source_id=p_id AND voided_at IS NULL)
   THEN RAISE EXCEPTION 'Reverse existing court payments before converting to private training'; END IF;
  IF v_existing.private_session_entry_id IS NOT NULL AND
    (v_existing.private_client_id IS DISTINCT FROM p_client_id
     OR v_existing.private_session_fee_cents<>p_session_fee_cents
     OR v_existing.private_coach_id IS DISTINCT FROM p_coach_id)
   THEN RAISE EXCEPTION 'The session is already recorded; edit financial details in Private Sessions'; END IF;
 END IF;
 v_id:=public.club_court_reservation_save(
  p_id,p_business_date,p_sport,p_court,p_start,p_duration,v_client.name,
  coalesce(p_notes,''),p_status,'reservation',p_expected_revision,
  0,0,0,0,NULL,false);
 UPDATE public.padel_court_reservations SET
  private_client_id=p_client_id,private_coach_id=p_coach_id,
  private_session_fee_cents=p_session_fee_cents,customer_name=v_client.name,
  updated_at=now() WHERE id=v_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),CASE WHEN p_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
  'court_private_training',v_id::text,
  jsonb_build_object('client_id',p_client_id,'coach_id',p_coach_id,
    'fee_cents',p_session_fee_cents,'status',p_status));
 RETURN v_id;
END $function$ OR p_duration IS NULL
 THEN RAISE EXCEPTION 'Choose a valid training time and duration'; END IF;
 IF p_start::time > time '01:00' AND p_start::time < time '09:00'
    OR (CASE WHEN p_start::time <= time '01:00' THEN 1440 ELSE 0 END
         + extract(hour FROM p_start::time)::integer*60 + extract(minute FROM p_start::time)::integer
         + p_duration > 1500)
 THEN RAISE EXCEPTION 'Private training must fit from 09:00 through 01:00'; END IF;
 SELECT id,name INTO v_client FROM public.private_clients WHERE id=p_client_id
  AND active AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active Private Sessions client'; END IF;
 IF p_coach_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.private_coaches WHERE id=p_coach_id AND active)
 THEN RAISE EXCEPTION 'Select an active coach or leave coach unassigned'; END IF;
 IF p_session_fee_cents IS NULL OR p_session_fee_cents<0 OR p_session_fee_cents>100000000000
 THEN RAISE EXCEPTION 'Enter a valid session fee'; END IF;
 -- Match the shared day lock order of existing court booking saves.
 IF p_business_date IS NULL THEN RAISE EXCEPTION 'Choose a booking date'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),p_business_date-date '2000-01-01');
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_existing FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR (v_existing.private_client_id IS NULL
     AND v_existing.external_source IS DISTINCT FROM 'matchpoint')
    THEN RAISE EXCEPTION 'Private training booking not found'; END IF;
  IF v_existing.external_source='matchpoint' AND EXISTS(
   SELECT 1 FROM public.court_payment_splits
    WHERE source_kind='reservation' AND source_id=p_id AND voided_at IS NULL)
   THEN RAISE EXCEPTION 'Reverse existing court payments before converting to private training'; END IF;
  IF v_existing.private_session_entry_id IS NOT NULL AND
    (v_existing.private_client_id IS DISTINCT FROM p_client_id
     OR v_existing.private_session_fee_cents<>p_session_fee_cents
     OR v_existing.private_coach_id IS DISTINCT FROM p_coach_id)
   THEN RAISE EXCEPTION 'The session is already recorded; edit financial details in Private Sessions'; END IF;
 END IF;
 v_id:=public.club_court_reservation_save(
  p_id,p_business_date,p_sport,p_court,p_start,p_duration,v_client.name,
  coalesce(p_notes,''),p_status,'reservation',p_expected_revision,
  0,0,0,0,NULL,false);
 UPDATE public.padel_court_reservations SET
  private_client_id=p_client_id,private_coach_id=p_coach_id,
  private_session_fee_cents=p_session_fee_cents,customer_name=v_client.name,
  updated_at=now() WHERE id=v_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),CASE WHEN p_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
  'court_private_training',v_id::text,
  jsonb_build_object('client_id',p_client_id,'coach_id',p_coach_id,
    'fee_cents',p_session_fee_cents,'status',p_status));
 RETURN v_id;
END $function$;
