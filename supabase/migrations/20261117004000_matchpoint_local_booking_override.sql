-- Staff may edit imported MatchPoint rows locally using the normal booking and
-- private-training RPCs. Remote identifiers stay immutable and the integration
-- never becomes a direct payment writer.
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS external_local_override boolean NOT NULL DEFAULT false,
 ADD COLUMN IF NOT EXISTS external_local_edited_at timestamptz,
 ADD COLUMN IF NOT EXISTS external_remote_snapshot jsonb;

-- Capture original provider details BEFORE any staff customizations. It
-- stores only booking logistics, never MatchPoint financial/contact fields.
UPDATE public.padel_court_reservations
 SET external_remote_snapshot=jsonb_build_object(
  'business_date',business_date::text,'sport',sport,
  'court_number',court_number,
  'booking_start_time',to_char(booking_start_time,'HH24:MI'),
  'booking_end_time',to_char(booking_end_time,'HH24:MI'),
  'duration_minutes',duration_minutes,
  'customer_name',customer_name,'status',status)
 WHERE external_source='matchpoint' AND external_remote_snapshot IS NULL;

CREATE OR REPLACE FUNCTION public.guard_matchpoint_booking_ownership()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $function$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.external_source='matchpoint'
     AND current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
  THEN RAISE EXCEPTION 'Only the MatchPoint integration can import external reservations'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.external_source='matchpoint' THEN
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
     AND NEW.external_remote_snapshot IS DISTINCT FROM OLD.external_remote_snapshot
  THEN RAISE EXCEPTION 'MatchPoint provider snapshots are server-managed';END IF;
  IF (NEW.external_source,NEW.external_kind,NEW.external_id)
      IS DISTINCT FROM (OLD.external_source,OLD.external_kind,OLD.external_id)
  THEN RAISE EXCEPTION 'MatchPoint external identifiers are immutable'; END IF;
  IF current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role' THEN
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
DROP TRIGGER IF EXISTS matchpoint_booking_ownership_guard ON public.padel_court_reservations;
CREATE TRIGGER matchpoint_booking_ownership_guard BEFORE INSERT OR UPDATE
 ON public.padel_court_reservations FOR EACH ROW
 EXECUTE FUNCTION public.guard_matchpoint_booking_ownership();

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
 IF v_start<540 OR v_start>=1500 OR v_end>1500 OR
    (v_start%30<>0 AND NOT EXISTS(SELECT 1 FROM public.padel_court_reservations
        WHERE id=p_id AND external_source='matchpoint'))
  THEN RAISE EXCEPTION 'Bookings must fit from 09:00 through 01:00';END IF;
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
END $function$


CREATE OR REPLACE FUNCTION public.club_court_reservation_priced_save(p_id uuid, p_business_date date, p_sport text, p_court text, p_start text, p_duration integer, p_customer text, p_notes text, p_status text, p_booking_type text, p_expected_revision integer, p_payment_total_cents bigint, p_cash_cents bigint, p_whish_cents bigint, p_unpaid_cents bigint, p_split_revision integer, p_update_payments boolean, p_checkmarks boolean[], p_expected_checkmarks boolean[], p_pickleball_player_count integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;v_old public.padel_court_reservations%rowtype;v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_sport NOT IN ('padel','pickleball','basketball') THEN RAISE EXCEPTION 'Unsupported sport'; END IF;
 IF p_booking_type='private_training' AND p_sport<>'padel' THEN
  RAISE EXCEPTION 'Private training is only available for Padel';END IF;
 IF p_pickleball_player_count IS NULL OR p_pickleball_player_count NOT IN (2,4) THEN
  RAISE EXCEPTION 'Choose 2 or 4 Pickleball players'; END IF;
 IF p_sport<>'pickleball' AND p_pickleball_player_count<>4 THEN
  RAISE EXCEPTION 'Player count is only selectable for Pickleball'; END IF;
 IF p_sport='pickleball' AND p_pickleball_player_count=2
  AND (coalesce(p_checkmarks[3],false) OR coalesce(p_checkmarks[4],false)
   OR coalesce(p_checkmarks[5],false) OR coalesce(p_checkmarks[6],false)) THEN
  RAISE EXCEPTION 'Two-player Pickleball cannot mark players 3 or 4'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_old.revision IS DISTINCT FROM p_expected_revision THEN
   RAISE EXCEPTION 'Reservation changed elsewhere. Refresh first';END IF;
  IF v_old.sport IS DISTINCT FROM p_sport THEN
   RAISE EXCEPTION 'Reservation sport cannot change';END IF;
  -- Imported private training can be reclassified before it is posted.
  -- Clear its client link atomically; the court record and external ID persist.
  IF v_old.external_source='matchpoint' AND v_old.private_client_id IS NOT NULL THEN
   IF v_old.private_session_entry_id IS NOT NULL
    THEN RAISE EXCEPTION 'Completed private training cannot be converted; correct it in Private Sessions';END IF;
   PERFORM set_config('app.matchpoint_local_edit','yes',true);
   UPDATE public.padel_court_reservations
    SET private_client_id=NULL,private_coach_id=NULL,
        private_session_fee_cents=0,private_session_entry_id=NULL,
        external_local_override=true,external_local_edited_at=now()
    WHERE id=p_id;
  END IF;
  -- When expanding singles to doubles, lift the two-player CHECK before the
  -- existing atomic save writes any newly checked P3/P4 markers.
  IF p_sport='pickleball' AND v_old.pickleball_player_count=2
     AND p_pickleball_player_count=4 THEN
   UPDATE public.padel_court_reservations SET pickleball_player_count=4 WHERE id=p_id;
  END IF;
 END IF;
 v_id:=public.club_court_reservation_finance_save(
  p_id,p_business_date,p_sport,p_court,p_start,p_duration,p_customer,p_notes,p_status,
  p_booking_type,p_expected_revision,p_payment_total_cents,p_cash_cents,p_whish_cents,
  p_unpaid_cents,p_split_revision,p_update_payments,p_checkmarks,p_expected_checkmarks);
 UPDATE public.padel_court_reservations
 SET pickleball_player_count=p_pickleball_player_count WHERE id=v_id;
 IF v_old.id IS NOT NULL AND v_old.pickleball_player_count IS DISTINCT FROM p_pickleball_player_count THEN
  INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
  VALUES(auth.uid(),'UPDATE','padel_court_reservations',v_id::text,
   jsonb_build_object('pickleball_player_count',v_old.pickleball_player_count),
   jsonb_build_object('pickleball_player_count',p_pickleball_player_count));
 END IF;
 RETURN v_id;
END $function$


CREATE OR REPLACE FUNCTION public.club_private_training_save(p_id uuid, p_business_date date, p_sport text, p_court text, p_start text, p_duration integer, p_client_id uuid, p_coach_id uuid, p_session_fee_cents bigint, p_notes text, p_status text, p_expected_revision integer)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid;v_client record;v_existing public.padel_court_reservations%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
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
END $function$


-- Existing staff-only grants are retained. This migration never opens
-- service credentials or private financial RPCs to anonymous users.
REVOKE ALL ON FUNCTION public.guard_matchpoint_booking_ownership() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.club_court_reservation_save(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.club_court_reservation_priced_save(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[],integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.club_private_training_save(uuid,date,text,text,text,integer,uuid,uuid,bigint,text,text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_court_reservation_save(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_court_reservation_priced_save(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[],integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.club_private_training_save(uuid,date,text,text,text,integer,uuid,uuid,bigint,text,text,integer) TO authenticated;
