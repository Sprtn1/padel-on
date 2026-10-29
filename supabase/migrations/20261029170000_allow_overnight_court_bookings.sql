-- Treat an end clock time at or before the start as the following day.
-- The existing 12-hour maximum keeps accidental day-long bookings invalid.
ALTER TABLE public.cafeteria_finance_entries
 DROP CONSTRAINT IF EXISTS cafeteria_court_booking_fields_valid;
ALTER TABLE public.cafeteria_finance_entries
 ADD CONSTRAINT cafeteria_court_booking_fields_valid CHECK (
  (court_number IS NULL AND booking_start_time IS NULL AND booking_end_time IS NULL)
  OR (category='padel_courts'
   AND court_number IN ('C1','C2','C3')
   AND booking_start_time IS NOT NULL AND booking_end_time IS NOT NULL
   AND booking_end_time<>booking_start_time
   AND (CASE WHEN booking_end_time>booking_start_time
    THEN booking_end_time-booking_start_time
    ELSE booking_end_time-booking_start_time+interval '24 hours' END)<=interval '12 hours')
  OR (category IN ('pickleball_courts','basketball_courts')
   AND court_number IS NULL
   AND booking_start_time IS NOT NULL AND booking_end_time IS NOT NULL
   AND booking_end_time<>booking_start_time
   AND (CASE WHEN booking_end_time>booking_start_time
    THEN booking_end_time-booking_start_time
    ELSE booking_end_time-booking_start_time+interval '24 hours' END)<=interval '12 hours')
 );

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
   ELSE p_end::time-p_start::time+interval '24 hours' END)>interval '12 hours'
  THEN RAISE EXCEPTION 'Court booking must be 12 hours or less'; END IF;
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
      ELSE p_end::time-p_start::time+interval '24 hours' END)<=interval '12 hours')
   OR (prev.category IN ('pickleball_courts','basketball_courts') AND p_court IS NULL
    AND p_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND p_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
    AND p_end::time<>p_start::time AND
     (CASE WHEN p_end::time>p_start::time THEN p_end::time-p_start::time
      ELSE p_end::time-p_start::time+interval '24 hours' END)<=interval '12 hours'))
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

REVOKE ALL ON FUNCTION public.cafeteria_finance_record_court_booking(uuid,date,text,text,bigint,integer,bigint,boolean[],text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cafeteria_finance_record_court_booking(uuid,date,text,text,bigint,integer,bigint,boolean[],text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.cafeteria_finance_set_booking_details(uuid,bigint,bigint,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cafeteria_finance_set_booking_details(uuid,bigint,bigint,text,text,text,text,text,text) TO authenticated;
