-- Expand court booking duration from 12 to 16 hours (09:00–01:00).
-- This does not create, delete, or reprice existing reservations or finance rows.
-- Keep all existing staff permissions, audit logging, conflict checks, payments and Whish logic.
-- These function definitions are copied from the live database and change ONLY duration bounds.

ALTER TABLE public.padel_court_reservations DROP CONSTRAINT IF EXISTS padel_court_reservations_duration_minutes_check;

ALTER TABLE public.padel_court_reservations ADD CONSTRAINT padel_court_reservations_duration_minutes_check CHECK (((duration_minutes >= 1) AND (duration_minutes <= 960)));

ALTER TABLE public.cafeteria_finance_entries DROP CONSTRAINT IF EXISTS cafeteria_court_booking_fields_valid;

ALTER TABLE public.cafeteria_finance_entries ADD CONSTRAINT cafeteria_court_booking_fields_valid CHECK ((((court_number IS NULL) AND (booking_start_time IS NULL) AND (booking_end_time IS NULL)) OR ((category = 'padel_courts'::text) AND (court_number = ANY (ARRAY['C1'::text, 'C2'::text, 'C3'::text])) AND (booking_start_time IS NOT NULL) AND (booking_end_time IS NOT NULL) AND (booking_end_time <> booking_start_time) AND (
CASE
    WHEN (booking_end_time > booking_start_time) THEN (booking_end_time - booking_start_time)
    ELSE ((booking_end_time - booking_start_time) + '24:00:00'::interval)
END <= '16:00:00'::interval)) OR ((category = ANY (ARRAY['pickleball_courts'::text, 'basketball_courts'::text])) AND (court_number IS NULL) AND (booking_start_time IS NOT NULL) AND (booking_end_time IS NOT NULL) AND (booking_end_time <> booking_start_time) AND (
CASE
    WHEN (booking_end_time > booking_start_time) THEN (booking_end_time - booking_start_time)
    ELSE ((booking_end_time - booking_start_time) + '24:00:00'::interval)
END <= '16:00:00'::interval))));

CREATE OR REPLACE FUNCTION public.cafeteria_finance_record_court_booking(p_entry_id uuid, p_entry_date date, p_category text, p_name text, p_amount_cents bigint, p_quantity integer, p_unit_price_cents bigint, p_checkmarks boolean[], p_court_notes text, p_court text, p_start text, p_end text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_id uuid; old_row public.cafeteria_finance_entries%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_category NOT IN ('padel_courts','pickleball_courts','basketball_courts') THEN RAISE EXCEPTION 'Court category required'; END IF;
 IF (p_category='padel_courts' AND (p_court IS NULL OR p_court NOT IN ('C1','C2','C3')))
  OR (p_category<>'padel_courts' AND p_court IS NOT NULL) THEN RAISE EXCEPTION 'Invalid court'; END IF;
 IF p_start IS NULL OR p_end IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR p_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN RAISE EXCEPTION 'Invalid booking time'; END IF;
 IF p_end::time=p_start::time OR
  (CASE WHEN p_end::time>p_start::time THEN p_end::time-p_start::time
   ELSE p_end::time-p_start::time+interval '24 hours' END)>interval '16 hours'
  THEN RAISE EXCEPTION 'Court booking must be 16 hours or less'; END IF;
 v_id:=public.cafeteria_finance_record_entry(p_entry_id,p_entry_date,p_category,p_name,
   p_amount_cents,p_quantity,p_unit_price_cents,p_checkmarks,p_court_notes);
 SELECT * INTO old_row FROM public.cafeteria_finance_entries WHERE id=v_id FOR UPDATE;
 IF old_row.court_number IS NOT NULL OR old_row.booking_start_time IS NOT NULL OR old_row.booking_end_time IS NOT NULL THEN
  IF old_row.court_number IS NOT DISTINCT FROM p_court AND old_row.booking_start_time=p_start::time
   AND old_row.booking_end_time=p_end::time THEN RETURN v_id; END IF;
  RAISE EXCEPTION 'Booking already changed; refresh before retrying';
 END IF;
 UPDATE public.cafeteria_finance_entries SET court_number=p_court,
  booking_start_time=p_start::time,booking_end_time=p_end::time WHERE id=v_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'UPDATE','cafeteria_finance_entries',v_id::text,
  jsonb_build_object('court_number',p_court,'start',p_start,'end',p_end));
 RETURN v_id;
END $function$;

CREATE OR REPLACE FUNCTION public.cafeteria_finance_set_booking_details(p_entry_id uuid, p_amount_cents bigint, p_expected_amount_cents bigint, p_court text, p_start text, p_end text, p_expected_court text, p_expected_start text, p_expected_end text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE prev public.cafeteria_finance_entries%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_amount_cents IS NULL OR p_amount_cents NOT BETWEEN 1 AND 100000000000
  THEN RAISE EXCEPTION 'Invalid booking price'; END IF;
 SELECT * INTO prev FROM public.cafeteria_finance_entries WHERE id=p_entry_id FOR UPDATE;
 IF NOT FOUND OR prev.voided_at IS NOT NULL
  OR prev.category NOT IN ('padel_courts','pickleball_courts','basketball_courts')
  THEN RAISE EXCEPTION 'Court entry not found'; END IF;
 IF NOT ((p_court IS NULL AND p_start IS NULL AND p_end IS NULL)
   OR (prev.category='padel_courts' AND p_court IN ('C1','C2','C3')
    AND p_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND p_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND p_end::time<>p_start::time AND
     (CASE WHEN p_end::time>p_start::time THEN p_end::time-p_start::time
      ELSE p_end::time-p_start::time+interval '24 hours' END)<=interval '16 hours')
   OR (prev.category IN ('pickleball_courts','basketball_courts') AND p_court IS NULL
    AND p_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND p_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND p_end::time<>p_start::time AND
     (CASE WHEN p_end::time>p_start::time THEN p_end::time-p_start::time
      ELSE p_end::time-p_start::time+interval '24 hours' END)<=interval '16 hours'))
  THEN RAISE EXCEPTION 'Invalid court or booking times'; END IF;
 IF prev.amount_cents IS DISTINCT FROM p_expected_amount_cents
 OR prev.court_number IS DISTINCT FROM p_expected_court
 OR prev.booking_start_time IS DISTINCT FROM p_expected_start::time
 OR prev.booking_end_time IS DISTINCT FROM p_expected_end::time
  THEN RAISE EXCEPTION 'Booking updated on another device. Refresh first'; END IF;
 IF prev.amount_cents=p_amount_cents AND prev.court_number IS NOT DISTINCT FROM p_court
 AND prev.booking_start_time IS NOT DISTINCT FROM p_start::time
 AND prev.booking_end_time IS NOT DISTINCT FROM p_end::time THEN RETURN; END IF;
 UPDATE public.cafeteria_finance_entries SET amount_cents=p_amount_cents,
  court_number=p_court,booking_start_time=p_start::time,booking_end_time=p_end::time
 WHERE id=p_entry_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('amount_cents',prev.amount_cents,'court',prev.court_number,'start',prev.booking_start_time,'end',prev.booking_end_time),
  jsonb_build_object('amount_cents',p_amount_cents,'court',p_court,'start',p_start,'end',p_end));
END $function$;

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
 IF p_duration IS NULL OR p_duration NOT BETWEEN 30 AND 960 OR p_duration%30<>0
  THEN RAISE EXCEPTION 'Duration must use 30-minute intervals';END IF;
 v_raw:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 v_start:=CASE WHEN v_raw<=60 THEN v_raw+1440 ELSE v_raw END;
 v_end:=v_start+p_duration;
 IF v_start<540 OR v_start>=1500 OR v_start%30<>0 OR v_end>1500
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
  IF v_old.business_date<>p_business_date OR v_old.sport<>p_sport OR v_old.booking_type<>p_booking_type
   THEN RAISE EXCEPTION 'Change sport/date/type by creating a new booking, not overwriting a record';END IF;
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
