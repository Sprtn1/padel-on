-- Timetable Pickleball reservations retain singles/doubles selection.
-- Existing reservations remain doubles (4) without changing their saved prices.
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS pickleball_player_count smallint NOT NULL DEFAULT 4;
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT timetable_pickleball_player_count_allowed
 CHECK (pickleball_player_count IN (2,4));
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT timetable_pickleball_singles_marks
 CHECK (sport <> 'pickleball' OR pickleball_player_count <> 2
  OR (NOT checkmarks[3] AND NOT checkmarks[4] AND NOT checkmarks[5] AND NOT checkmarks[6]));
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT timetable_training_only_for_padel
 CHECK (sport='padel' OR booking_type<>'private_training');

-- Maintain concurrency checks, overlap checks, full Cash/Whish allocation,
-- cancellation rollback and auditing from the existing validated save function.
CREATE OR REPLACE FUNCTION public.club_court_reservation_priced_save(
 p_id uuid,p_business_date date,p_sport text,p_court text,p_start text,
 p_duration integer,p_customer text,p_notes text,p_status text,
 p_booking_type text,p_expected_revision integer,
 p_payment_total_cents bigint,p_cash_cents bigint,p_whish_cents bigint,
 p_unpaid_cents bigint,p_split_revision integer,p_update_payments boolean,
 p_checkmarks boolean[],p_expected_checkmarks boolean[],
 p_pickleball_player_count integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
END $$;

REVOKE ALL ON FUNCTION public.club_court_reservation_priced_save(
 uuid,date,text,text,text,integer,text,text,text,text,integer,
 bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[],integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_court_reservation_priced_save(
 uuid,date,text,text,text,integer,text,text,text,text,integer,
 bigint,bigint,bigint,bigint,integer,boolean,boolean[],boolean[],integer)
 TO authenticated;

-- Player-paid toggles must also respect singles, even when changed from the list.
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
 v_count:=CASE WHEN v_old.sport='basketball' THEN 6
  WHEN v_old.sport='pickleball' THEN v_old.pickleball_player_count
  ELSE 4 END;
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
REVOKE ALL ON FUNCTION public.club_reservation_set_player_paid(uuid,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_reservation_set_player_paid(uuid,integer,boolean) TO authenticated;
