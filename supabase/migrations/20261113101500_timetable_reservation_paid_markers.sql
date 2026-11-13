-- Timetable reservations use the same player-paid markers as normal court entries.
-- Keep court receipts in the existing source-linked Cash/Whish split ledger;
-- no second cafeteria_finance_entries row is created or counted.
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS checkmarks boolean[] NOT NULL
 DEFAULT ARRAY[false,false,false,false,false,false]::boolean[];
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT club_reservation_six_paid_markers
 CHECK (array_length(checkmarks,1)=6 AND array_position(checkmarks,NULL) IS NULL);

CREATE OR REPLACE FUNCTION public.club_reservation_set_player_paid(
 p_reservation_id uuid,p_player_no integer,p_paid boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_old public.padel_court_reservations%rowtype;
 v_count integer;v_marks boolean[];
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required';END IF;
 IF p_paid IS NULL THEN RAISE EXCEPTION 'Paid status is required';END IF;
 SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_reservation_id FOR UPDATE;
 IF NOT FOUND OR v_old.status='cancelled' OR v_old.booking_type<>'reservation' OR v_old.private_client_id IS NOT NULL
 THEN RAISE EXCEPTION 'Active court reservation not found';END IF;
 IF EXISTS (SELECT 1 FROM public.cafeteria_day_closings
  WHERE day_date=v_old.business_date AND status IN ('closed','approved'))
 THEN RAISE EXCEPTION 'This financial day is closed';END IF;
 v_count:=CASE WHEN v_old.sport='basketball' THEN 6 ELSE 4 END;
 IF p_player_no IS NULL OR p_player_no<1 OR p_player_no>v_count
 THEN RAISE EXCEPTION 'Invalid player number';END IF;
 IF v_old.checkmarks[p_player_no] IS NOT DISTINCT FROM p_paid THEN RETURN;END IF;
 v_marks:=v_old.checkmarks;v_marks[p_player_no]:=p_paid;
 UPDATE public.padel_court_reservations SET checkmarks=v_marks,updated_at=now()
 WHERE id=p_reservation_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'UPDATE','padel_court_reservations',p_reservation_id::text,
 jsonb_build_object('player',p_player_no,'paid',v_old.checkmarks[p_player_no]),
 jsonb_build_object('player',p_player_no,'paid',p_paid));
END $$;

-- One transaction for timetable editing AND paid-marker creation/updates.
-- The underlying validated reservation RPC still performs all overlap,
-- status, cash allocation and refund checks.
CREATE OR REPLACE FUNCTION public.club_court_reservation_finance_save(
 p_id uuid,p_business_date date,p_sport text,p_court text,p_start text,
 p_duration integer,p_customer text,p_notes text,p_status text,
 p_booking_type text,p_expected_revision integer,
 p_payment_total_cents bigint,p_cash_cents bigint,p_whish_cents bigint,
 p_unpaid_cents bigint,p_split_revision integer,p_update_payments boolean,
 p_checkmarks boolean[],p_expected_checkmarks boolean[]
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_old public.padel_court_reservations%rowtype;
 v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required';END IF;
 IF p_checkmarks IS NULL OR array_length(p_checkmarks,1)<>6 OR
  array_position(p_checkmarks,NULL) IS NOT NULL
 THEN RAISE EXCEPTION 'Exactly six boolean player markers are required';END IF;
 v_count:=CASE WHEN p_sport='basketball' THEN 6 ELSE 4 END;
 IF (v_count=4 AND (p_checkmarks[5] OR p_checkmarks[6])) OR
  (p_booking_type='block' AND p_checkmarks<>ARRAY[false,false,false,false,false,false]::boolean[])
 THEN RAISE EXCEPTION 'Invalid player markers for this booking';END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_old FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_old.checkmarks IS DISTINCT FROM p_expected_checkmarks
   THEN RAISE EXCEPTION 'Player markers changed elsewhere; refresh the reservation first';END IF;
 ELSIF p_expected_checkmarks IS NOT NULL THEN
  RAISE EXCEPTION 'Unexpected player marker revision';END IF;
 v_id:=public.club_court_reservation_save(
  p_id,p_business_date,p_sport,p_court,p_start,p_duration,p_customer,p_notes,p_status,
  p_booking_type,p_expected_revision,p_payment_total_cents,p_cash_cents,p_whish_cents,
  p_unpaid_cents,p_split_revision,p_update_payments);
 UPDATE public.padel_court_reservations SET checkmarks=p_checkmarks WHERE id=v_id;
 RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.club_reservation_set_player_paid(uuid,integer,boolean)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_reservation_set_player_paid(uuid,integer,boolean)
 TO authenticated;
REVOKE ALL ON FUNCTION public.club_court_reservation_finance_save(
 uuid,date,text,text,text,integer,text,text,text,text,integer,
 bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[])
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_court_reservation_finance_save(
 uuid,date,text,text,text,integer,text,text,text,text,integer,
 bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[])
 TO authenticated;
