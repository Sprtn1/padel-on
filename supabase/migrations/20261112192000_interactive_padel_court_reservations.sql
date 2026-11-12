-- Additive scheduling model. Planning reservations never affect cash totals.
-- Run before publishing the scheduler UI. Existing financial entries remain intact.
CREATE TABLE IF NOT EXISTS public.padel_court_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 business_date date NOT NULL,
 court_number text NOT NULL CHECK (court_number IN ('C1','C2','C3')),
 booking_start_time time NOT NULL,
 booking_end_time time NOT NULL,
 duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 30 AND 720 AND duration_minutes % 30 = 0),
 customer_name text NOT NULL CHECK (char_length(btrim(customer_name)) BETWEEN 2 AND 120),
 notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 500),
 status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed','tentative','cancelled')),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1)
);
CREATE INDEX IF NOT EXISTS padel_court_reservations_day_idx
 ON public.padel_court_reservations (business_date, court_number, status);
ALTER TABLE public.padel_court_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.padel_court_reservations FROM anon, PUBLIC;
GRANT SELECT ON TABLE public.padel_court_reservations TO authenticated;
DROP POLICY IF EXISTS padel_court_reservation_staff_read ON public.padel_court_reservations;
CREATE POLICY padel_court_reservation_staff_read ON public.padel_court_reservations
 FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

-- Used for both scheduled reservations and recorded cashbook bookings.
-- Serializes edits for one business day and rejects double bookings at the DB level.
CREATE OR REPLACE FUNCTION public.padel_reservation_save(
 p_id uuid, p_business_date date, p_court text, p_start text,
 p_duration integer, p_customer text, p_notes text, p_status text,
 p_expected_revision integer DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_old public.padel_court_reservations%rowtype;
 v_id uuid := coalesce(p_id,gen_random_uuid());
 v_today date := (now() at time zone 'Asia/Beirut')::date;
 v_start integer; v_end integer; v_start_raw integer;
 v_other_start integer; v_other_end integer;
 v_ledger record;
 v_booking record;
 v_name text := btrim(coalesce(p_customer,''));
 v_notes text := btrim(coalesce(p_notes,''));
 v_end_time time;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_business_date IS NULL OR p_business_date < date '2025-01-01' OR p_business_date > v_today+365
  THEN RAISE EXCEPTION 'Booking date must be within the scheduling range'; END IF;
 IF p_court NOT IN ('C1','C2','C3') OR p_court IS NULL THEN RAISE EXCEPTION 'Choose C1, C2 or C3'; END IF;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
  THEN RAISE EXCEPTION 'Choose a valid booking start time'; END IF;
 IF p_duration IS NULL OR p_duration < 30 OR p_duration > 720 OR p_duration % 30 <> 0
  THEN RAISE EXCEPTION 'Duration must be 30-minute increments up to 12 hours'; END IF;
 IF char_length(v_name) NOT BETWEEN 2 AND 120 THEN RAISE EXCEPTION 'Enter the customer name (2 to 120 characters)'; END IF;
 IF char_length(v_notes) > 500 THEN RAISE EXCEPTION 'Booking notes are too long'; END IF;
 IF p_status IS NULL OR p_status NOT IN ('confirmed','tentative','cancelled')
  THEN RAISE EXCEPTION 'Invalid reservation status'; END IF;
 v_start_raw := extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 v_start := CASE WHEN v_start_raw <= 60 THEN v_start_raw+1440 ELSE v_start_raw END;
 v_end := v_start+p_duration;
 IF v_start < 540 OR v_start >= 1500 OR v_start % 30 <> 0 OR v_end > 1500
  THEN RAISE EXCEPTION 'Reservations must fit within 09:00–01:00 in 30-minute steps'; END IF;
 v_end_time := make_time((v_end%1440)/60,(v_end%1440)%60,0);
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),p_business_date - date '2000-01-01');
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
  IF p_expected_revision IS NULL OR v_old.revision <> p_expected_revision
   THEN RAISE EXCEPTION 'Reservation changed on another device. Refresh before editing'; END IF;
 END IF;
 IF p_status <> 'cancelled' THEN
  FOR v_booking IN SELECT * FROM public.padel_court_reservations r
   WHERE r.business_date=p_business_date AND r.court_number=p_court AND r.status<>'cancelled' AND r.id<>v_id
  LOOP
   v_other_start := extract(hour FROM v_booking.booking_start_time)::integer*60+
                    extract(minute FROM v_booking.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
   v_other_end:=v_other_start+v_booking.duration_minutes;
   IF v_start<v_other_end AND v_other_start<v_end THEN
    RAISE EXCEPTION 'Court already reserved at that time';
   END IF;
  END LOOP;
  FOR v_ledger IN SELECT * FROM public.cafeteria_finance_entries f
   WHERE f.entry_date=p_business_date AND f.category='padel_courts'
    AND f.court_number=p_court AND f.voided_at IS NULL
    AND f.booking_start_time IS NOT NULL AND f.booking_end_time IS NOT NULL
  LOOP
   v_other_start:=extract(hour FROM v_ledger.booking_start_time)::integer*60+
                  extract(minute FROM v_ledger.booking_start_time)::integer;
   IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
   v_other_end:=extract(hour FROM v_ledger.booking_end_time)::integer*60+
                extract(minute FROM v_ledger.booking_end_time)::integer;
   IF v_other_end<=v_other_start THEN v_other_end:=v_other_end+1440; END IF;
   IF v_start<v_other_end AND v_other_start<v_end THEN
    RAISE EXCEPTION 'A recorded finance booking already occupies this court and time';
   END IF;
  END LOOP;
 END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.padel_court_reservations
   (id,business_date,court_number,booking_start_time,booking_end_time,duration_minutes,
    customer_name,notes,status,created_by)
  VALUES(v_id,p_business_date,p_court,p_start::time,v_end_time,p_duration,
    v_name,v_notes,p_status,auth.uid());
  INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
  VALUES(auth.uid(),'CREATE','padel_court_reservations',v_id::text,
   jsonb_build_object('date',p_business_date,'court',p_court,'start',p_start,'duration',p_duration,'status',p_status));
 ELSE
  UPDATE public.padel_court_reservations SET
   business_date=p_business_date,court_number=p_court,booking_start_time=p_start::time,
   booking_end_time=v_end_time,duration_minutes=p_duration,customer_name=v_name,
   notes=v_notes,status=p_status,updated_at=now(),revision=revision+1 WHERE id=v_id;
  INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
  VALUES(auth.uid(),'UPDATE','padel_court_reservations',v_id::text,
   to_jsonb(v_old),
   jsonb_build_object('date',p_business_date,'court',p_court,'start',p_start,'duration',p_duration,'status',p_status));
 END IF;
 RETURN v_id;
END $$;

-- Reposition an existing financial booking without touching amounts, markers or financial dates.
CREATE OR REPLACE FUNCTION public.padel_ledger_reposition(
 p_entry_id uuid, p_court text, p_start text,
 p_expected_court text, p_expected_start text, p_expected_end text,
 p_expected_amount_cents bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
 v_old public.cafeteria_finance_entries%rowtype;
 v_start_raw integer; v_start integer; v_end integer; v_duration integer;
 v_old_start integer; v_old_end integer;
 v_other_start integer; v_other_end integer;
 v_new_end time;
 v_business_date date;
 v_booking record; v_existing record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_entry_id IS NULL OR p_court NOT IN ('C1','C2','C3') OR p_court IS NULL THEN RAISE EXCEPTION 'Invalid court booking'; END IF;
 IF p_start IS NULL OR p_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' THEN RAISE EXCEPTION 'Invalid start time'; END IF;
 -- The daily lock is shared with the reservations table.
 SELECT entry_date INTO STRICT v_business_date FROM public.cafeteria_finance_entries WHERE id=p_entry_id;
 PERFORM pg_advisory_xact_lock(hashtext('padelon_reservation_day'),v_business_date - date '2000-01-01');
 SELECT * INTO v_old FROM public.cafeteria_finance_entries WHERE id=p_entry_id FOR UPDATE;
 IF NOT FOUND OR v_old.voided_at IS NOT NULL OR v_old.category<>'padel_courts'
  OR v_old.booking_start_time IS NULL OR v_old.booking_end_time IS NULL
  THEN RAISE EXCEPTION 'Padel booking not available'; END IF;
 IF v_old.court_number IS DISTINCT FROM p_expected_court OR
    v_old.booking_start_time IS DISTINCT FROM p_expected_start::time OR
    v_old.booking_end_time IS DISTINCT FROM p_expected_end::time OR
    v_old.amount_cents IS DISTINCT FROM p_expected_amount_cents
  THEN RAISE EXCEPTION 'Booking changed elsewhere; refresh first'; END IF;
 v_old_start:=extract(hour FROM v_old.booking_start_time)::integer*60+
              extract(minute FROM v_old.booking_start_time)::integer;
 v_old_end:=extract(hour FROM v_old.booking_end_time)::integer*60+
            extract(minute FROM v_old.booking_end_time)::integer;
 v_duration:=v_old_end-v_old_start;
 IF v_duration<=0 THEN v_duration:=v_duration+1440; END IF;
 v_start_raw:=extract(hour FROM p_start::time)::integer*60+extract(minute FROM p_start::time)::integer;
 v_start:=CASE WHEN v_start_raw<=60 THEN v_start_raw+1440 ELSE v_start_raw END;
 v_end:=v_start+v_duration;
 IF v_start<540 OR v_start>=1500 OR v_start%30<>0 OR v_end>1500
  THEN RAISE EXCEPTION 'Move must fit inside 09:00–01:00 on 30-minute lines'; END IF;
 v_new_end:=make_time((v_end%1440)/60,(v_end%1440)%60,0);
 FOR v_booking IN SELECT * FROM public.padel_court_reservations r
  WHERE r.business_date=v_old.entry_date AND r.court_number=p_court AND r.status<>'cancelled'
 LOOP
  v_other_start:=extract(hour FROM v_booking.booking_start_time)::integer*60+extract(minute FROM v_booking.booking_start_time)::integer;
  IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
  v_other_end:=v_other_start+v_booking.duration_minutes;
  IF v_start<v_other_end AND v_other_start<v_end THEN RAISE EXCEPTION 'Court already reserved at that time'; END IF;
 END LOOP;
 FOR v_existing IN SELECT * FROM public.cafeteria_finance_entries f
  WHERE f.entry_date=v_old.entry_date AND f.category='padel_courts'
  AND f.court_number=p_court AND f.voided_at IS NULL AND f.id<>p_entry_id
  AND f.booking_start_time IS NOT NULL AND f.booking_end_time IS NOT NULL
 LOOP
  v_other_start:=extract(hour FROM v_existing.booking_start_time)::integer*60+
                 extract(minute FROM v_existing.booking_start_time)::integer;
  IF v_other_start<=60 THEN v_other_start:=v_other_start+1440; END IF;
  v_other_end:=extract(hour FROM v_existing.booking_end_time)::integer*60+
               extract(minute FROM v_existing.booking_end_time)::integer;
  IF v_other_end<=v_other_start THEN v_other_end:=v_other_end+1440; END IF;
  IF v_start<v_other_end AND v_other_start<v_end THEN RAISE EXCEPTION 'Another recorded court booking occupies that slot'; END IF;
 END LOOP;
 IF v_old.court_number=p_court AND v_old.booking_start_time=p_start::time AND
    v_old.booking_end_time=v_new_end THEN RETURN; END IF;
 -- Existing trigger also blocks changing an approved or closed financial day.
 UPDATE public.cafeteria_finance_entries SET
  court_number=p_court,booking_start_time=p_start::time,booking_end_time=v_new_end
  WHERE id=p_entry_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'UPDATE','cafeteria_finance_entries',p_entry_id::text,
  jsonb_build_object('court',v_old.court_number,'start',v_old.booking_start_time,'end',v_old.booking_end_time),
  jsonb_build_object('court',p_court,'start',p_start,'end',v_new_end));
END $$;

REVOKE ALL ON FUNCTION public.padel_reservation_save(uuid,date,text,text,integer,text,text,text,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.padel_ledger_reposition(uuid,text,text,text,text,text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.padel_reservation_save(uuid,date,text,text,integer,text,text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.padel_ledger_reposition(uuid,text,text,text,text,text,bigint) TO authenticated;
