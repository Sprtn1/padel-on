-- Multisport court calendar. Existing Padel rows, cashbook and payment links are retained.
-- Pickleball and Basketball each have one independent court (P1/B1).
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS sport text NOT NULL DEFAULT 'padel',
 ADD COLUMN IF NOT EXISTS booking_type text NOT NULL DEFAULT 'reservation';
ALTER TABLE public.padel_court_reservations
 DROP CONSTRAINT IF EXISTS padel_court_reservations_court_number_check;
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT padel_court_reservations_court_number_check CHECK
 ((sport='padel' AND court_number IN ('C1','C2','C3'))
  OR (sport='pickleball' AND court_number='P1')
  OR (sport='basketball' AND court_number='B1'));
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT court_reservation_booking_type_check CHECK (booking_type IN ('reservation','blocked'));
CREATE INDEX IF NOT EXISTS padel_reservations_sport_day_idx
 ON public.padel_court_reservations(sport,business_date,court_number,status);

-- The old padel-only RPCs remain available for legacy clients. Distinct single-court
-- IDs P1/B1 guarantee that those legacy RPCs never cross-match other sports.
CREATE OR REPLACE FUNCTION public.court_reservation_save_v2(
 p_id uuid,p_business_date date,p_sport text,p_court text,p_start text,p_duration integer,
 p_customer text,p_notes text,p_status text,p_type text,p_expected_revision integer,
 p_payment_total_cents bigint,p_cash_cents bigint,p_whish_cents bigint,
 p_unpaid_cents bigint,p_split_revision integer DEFAULT NULL,
 p_update_payments boolean DEFAULT true
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_old public.padel_court_reservations%rowtype;
 v_id uuid := coalesce(p_id,gen_random_uuid());
 v_today date := (now() at time zone 'Asia/Beirut')::date;
 v_name text := btrim(coalesce(p_customer,''));
 v_notes text := btrim(coalesce(p_notes,''));
 v_category text;
 v_start integer;v_end integer;v_other_start integer;v_other_end integer;
 v_time_end time;v_ledger record;v_booking record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_business_date IS NULL OR p_business_date<date '2025-01-01' OR p_business_date>v_today+365
  THEN RAISE EXCEPTION 'Date must be within the reservation range'; END IF;
 IF p_sport='padel' AND p_court IN ('C1','C2','C3') THEN v_category:='padel_courts';
 ELSIF p_sport='pickleball' AND p_court='P1' THEN v_category:='pickleball_courts';
 ELSIF p_sport='basketball' AND p_court='B1' THEN v_category:='basketball_courts';
 ELSE RAISE EXCEPTION 'Invalid sport or court'; END IF;
 IF p_type NOT IN ('reservation','blocked') OR p_type IS NULL THEN RAISE EXCEPTION 'Invalid booking type'; END IF;
 IF p_status NOT IN ('confirmed','tentative','cancelled') OR p_status IS NULL
  OR (p_type='blocked' AND p_status='tentative') THEN RAISE EXCEPTION 'Invalid booking status'; END IF;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN RAISE EXCEPTION 'Invalid start time'; END IF;
 IF p_duration IS NULL OR p_duration<30 OR p_duration>720 OR p_duration%30<>0
  THEN RAISE EXCEPTION 'Duration must use 30-minute increments'; END IF;
 IF char_length(v_name) NOT BETWEEN 2 AND 120 OR char_length(v_notes)>500
  THEN RAISE EXCEPTION 'Enter a name of 2–120 characters and notes up to 500 characters'; END IF;
 v_start:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 IF v_start<=60 THEN v_start:=v_start+1440; END IF;
 v_end:=v_start+p_duration;
 IF v_start<540 OR v_start>=1500 OR v_start%30<>0 OR v_end>1500
  THEN RAISE EXCEPTION 'Booking must fit the 09:00–01:00 schedule on 30-minute lines'; END IF;
 v_time_end:=make_time((v_end%1440)/60,(v_end%1440)%60,0);

 -- All scheduling writes share the existing day lock with legacy Padel RPCs.
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),p_business_date-date '2000-01-01');
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_old.business_date<>p_business_date OR v_old.sport<>p_sport OR v_old.booking_type<>p_type
   THEN RAISE EXCEPTION 'Sport, date and booking type cannot be changed after creation'; END IF;
  IF p_expected_revision IS NULL OR v_old.revision<>p_expected_revision
   THEN RAISE EXCEPTION 'Booking changed on another device. Refresh first'; END IF;
 END IF;
 IF p_type='blocked' THEN
  IF p_update_payments OR coalesce(p_payment_total_cents,0)<>0
   OR coalesce(p_cash_cents,0)<>0 OR coalesce(p_whish_cents,0)<>0
   OR coalesce(p_unpaid_cents,0)<>0
   THEN RAISE EXCEPTION 'Court blocks cannot collect payments'; END IF;
  IF EXISTS(SELECT 1 FROM public.court_payment_splits s
    WHERE s.source_kind='reservation' AND s.source_id=v_id AND s.voided_at IS NULL)
   THEN RAISE EXCEPTION 'Cannot block a paid reservation'; END IF;
 END IF;

 IF p_status<>'cancelled' THEN
  FOR v_booking IN SELECT * FROM public.padel_court_reservations r
   WHERE r.business_date=p_business_date AND r.court_number=p_court
    AND r.sport=p_sport AND r.status<>'cancelled' AND r.id<>v_id
  LOOP
   v_other_start:=extract(hour FROM v_booking.booking_start_time)::integer*60+
                  extract(minute FROM v_booking.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
   v_other_end:=v_other_start+v_booking.duration_minutes;
   IF v_start<v_other_end AND v_other_start<v_end THEN
    RAISE EXCEPTION 'Court already booked or blocked at this time'; END IF;
  END LOOP;
  FOR v_ledger IN SELECT * FROM public.cafeteria_finance_entries f
   WHERE f.entry_date=p_business_date AND f.category=v_category AND f.voided_at IS NULL
    AND (p_sport<>'padel' OR f.court_number=p_court)
    AND f.booking_start_time IS NOT NULL AND f.booking_end_time IS NOT NULL
  LOOP
   v_other_start:=extract(hour FROM v_ledger.booking_start_time)::integer*60+
                  extract(minute FROM v_ledger.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
   v_other_end:=extract(hour FROM v_ledger.booking_end_time)::integer*60+
                extract(minute FROM v_ledger.booking_end_time)::integer;
   IF v_other_end<=v_other_start THEN v_other_end:=v_other_end+1440; END IF;
   IF v_start<v_other_end AND v_other_start<v_end THEN
    RAISE EXCEPTION 'Recorded finance booking already occupies this time'; END IF;
  END LOOP;
 END IF;

 IF p_id IS NULL THEN
  INSERT INTO public.padel_court_reservations
  (id,business_date,sport,court_number,booking_start_time,booking_end_time,duration_minutes,
   customer_name,notes,status,booking_type,created_by)
  VALUES(v_id,p_business_date,p_sport,p_court,p_start::time,v_time_end,p_duration,
   v_name,v_notes,p_status,p_type,auth.uid());
 ELSE
  UPDATE public.padel_court_reservations SET
   court_number=p_court,booking_start_time=p_start::time,booking_end_time=v_time_end,
   duration_minutes=p_duration,customer_name=v_name,notes=v_notes,status=p_status,
   updated_at=now(),revision=revision+1
  WHERE id=v_id;
 END IF;
 IF p_status='cancelled' THEN
  -- Only unpaid allocations may be cancelled; paid ones are rejected by existing trigger.
  UPDATE public.court_payment_splits SET voided_at=now(),updated_at=now()
   WHERE source_kind='reservation' AND source_id=v_id AND voided_at IS NULL
    AND cash_cents=0 AND whish_cents=0;
 ELSIF p_type='reservation' AND p_update_payments THEN
  IF p_payment_total_cents IS NULL OR p_payment_total_cents<1
   THEN RAISE EXCEPTION 'Enter a positive court price for the payment breakdown'; END IF;
  PERFORM public.court_payment_split_save('reservation',v_id,p_payment_total_cents,
   p_cash_cents,p_whish_cents,p_unpaid_cents,p_split_revision,NULL);
 END IF;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),CASE WHEN p_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
  'padel_court_reservations',v_id::text,
  CASE WHEN p_id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
  jsonb_build_object('date',p_business_date,'sport',p_sport,'court',p_court,
   'start',p_start,'duration',p_duration,'type',p_type,'status',p_status));
 RETURN v_id;
END $$;

-- Existing Padel ledger mover remains unchanged. Single-court sports require no
-- court_number write: that field is intentionally NULL on their finance entries.
CREATE OR REPLACE FUNCTION public.court_single_ledger_reposition_v2(
 p_entry_id uuid,p_sport text,p_start text,p_expected_start text,
 p_expected_end text,p_expected_amount_cents bigint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_old public.cafeteria_finance_entries%rowtype;
 v_category text;v_court text;v_date date;
 v_start integer;v_end integer;v_duration integer;
 v_old_start integer;v_old_end integer;v_other_start integer;v_other_end integer;
 v_new_end time;v_booking record;v_existing record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_entry_id IS NULL OR p_sport NOT IN ('pickleball','basketball') OR p_sport IS NULL
  THEN RAISE EXCEPTION 'Invalid single-court booking'; END IF;
 v_category:=CASE WHEN p_sport='pickleball' THEN 'pickleball_courts' ELSE 'basketball_courts' END;
 v_court:=CASE WHEN p_sport='pickleball' THEN 'P1' ELSE 'B1' END;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Invalid start time'; END IF;
 SELECT entry_date INTO STRICT v_date FROM public.cafeteria_finance_entries WHERE id=p_entry_id;
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),v_date-date '2000-01-01');
 SELECT * INTO v_old FROM public.cafeteria_finance_entries WHERE id=p_entry_id FOR UPDATE;
 IF NOT FOUND OR v_old.voided_at IS NOT NULL OR v_old.category<>v_category
  OR v_old.booking_start_time IS NULL OR v_old.booking_end_time IS NULL
  THEN RAISE EXCEPTION 'Booking not available'; END IF;
 IF v_old.booking_start_time IS DISTINCT FROM p_expected_start::time
  OR v_old.booking_end_time IS DISTINCT FROM p_expected_end::time
  OR v_old.amount_cents IS DISTINCT FROM p_expected_amount_cents
  THEN RAISE EXCEPTION 'Booking was changed elsewhere; refresh first'; END IF;
 v_old_start:=extract(hour FROM v_old.booking_start_time)::integer*60+
              extract(minute FROM v_old.booking_start_time)::integer;
 v_old_end:=extract(hour FROM v_old.booking_end_time)::integer*60+
            extract(minute FROM v_old.booking_end_time)::integer;
 v_duration:=v_old_end-v_old_start;
 IF v_duration<=0 THEN v_duration:=v_duration+1440; END IF;
 v_start:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 IF v_start<=60 THEN v_start:=v_start+1440; END IF;
 v_end:=v_start+v_duration;
 IF v_start<540 OR v_start>=1500 OR v_start%30<>0 OR v_end>1500
  THEN RAISE EXCEPTION 'Move must fit within 09:00–01:00 in 30-minute steps'; END IF;
 v_new_end:=make_time((v_end%1440)/60,(v_end%1440)%60,0);
 FOR v_booking IN SELECT * FROM public.padel_court_reservations r
  WHERE r.business_date=v_date AND r.sport=p_sport AND r.court_number=v_court AND r.status<>'cancelled'
 LOOP
  v_other_start:=extract(hour FROM v_booking.booking_start_time)::integer*60+
                 extract(minute FROM v_booking.booking_start_time)::integer;
  IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
  v_other_end:=v_other_start+v_booking.duration_minutes;
  IF v_start<v_other_end AND v_other_start<v_end THEN RAISE EXCEPTION 'Court already reserved or blocked'; END IF;
 END LOOP;
 FOR v_existing IN SELECT * FROM public.cafeteria_finance_entries f
  WHERE f.entry_date=v_date AND f.category=v_category AND f.voided_at IS NULL
   AND f.id<>p_entry_id AND f.booking_start_time IS NOT NULL AND f.booking_end_time IS NOT NULL
 LOOP
  v_other_start:=extract(hour FROM v_existing.booking_start_time)::integer*60+
                 extract(minute FROM v_existing.booking_start_time)::integer;
  IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
  v_other_end:=extract(hour FROM v_existing.booking_end_time)::integer*60+
               extract(minute FROM v_existing.booking_end_time)::integer;
  IF v_other_end<=v_other_start THEN v_other_end:=v_other_end+1440; END IF;
  IF v_start<v_other_end AND v_other_start<v_end THEN RAISE EXCEPTION 'Another finance entry occupies this slot'; END IF;
 END LOOP;
 IF v_old.booking_start_time=p_start::time AND v_old.booking_end_time=v_new_end THEN RETURN; END IF;
 -- Existing cafeteria_guard_closed_day trigger protects approved/closed days.
 UPDATE public.cafeteria_finance_entries SET
  booking_start_time=p_start::time,booking_end_time=v_new_end WHERE id=p_entry_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('start',v_old.booking_start_time,'end',v_old.booking_end_time,'category',v_category),
  jsonb_build_object('start',p_start,'end',v_new_end,'category',v_category));
END $$;
REVOKE EXECUTE ON FUNCTION public.court_reservation_save_v2(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court_reservation_save_v2(uuid,date,text,text,text,integer,text,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.court_single_ledger_reposition_v2(uuid,text,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court_single_ledger_reposition_v2(uuid,text,text,text,text,bigint) TO authenticated;
