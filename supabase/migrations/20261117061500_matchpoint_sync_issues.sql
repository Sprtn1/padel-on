-- No rows are deleted. Preserve the pre-change booking and payment snapshot.
CREATE SCHEMA IF NOT EXISTS backup_matchpoint_sync_issues_20261117;
REVOKE ALL ON SCHEMA backup_matchpoint_sync_issues_20261117 FROM PUBLIC,anon,authenticated;
CREATE TABLE IF NOT EXISTS backup_matchpoint_sync_issues_20261117.padel_court_reservations AS TABLE public.padel_court_reservations;
CREATE TABLE IF NOT EXISTS backup_matchpoint_sync_issues_20261117.court_payment_splits AS TABLE public.court_payment_splits;

ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS external_missing_count integer NOT NULL DEFAULT 0 CHECK(external_missing_count BETWEEN 0 AND 2),
 ADD COLUMN IF NOT EXISTS external_review_ack jsonb;
ALTER TABLE public.matchpoint_sync_status
 ADD COLUMN IF NOT EXISTS last_booking_conflicts jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE INDEX IF NOT EXISTS matchpoint_pending_review_idx ON public.padel_court_reservations(business_date)
 WHERE external_source='matchpoint' AND external_alert IS NOT NULL;

CREATE OR REPLACE FUNCTION public.court_split_guard_reservation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_split public.court_payment_splits%rowtype;
 v_today date:=(now() AT TIME ZONE 'Asia/Beirut')::date;
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
  -- Only trusted server sync may soft-cancel untouched, unpaid imported bookings.
  -- The row lock held by UPDATE serializes this check with booking payment RPCs.
  IF current_setting('role',true)='service_role' THEN
   IF OLD.external_source IS DISTINCT FROM 'matchpoint'
    OR OLD.external_local_override
    OR OLD.booking_type IS DISTINCT FROM 'reservation'
    OR OLD.private_client_id IS NOT NULL OR OLD.private_session_entry_id IS NOT NULL
    OR true=ANY(OLD.checkmarks) OR btrim(coalesce(OLD.notes,''))<>''
    OR NEW.external_status NOT IN ('CANCELED','CANCELLED','MISSING')
    OR NEW.external_status IS NULL
    OR (NEW.external_status='MISSING' AND NEW.external_missing_count<>2)
    OR (NEW.business_date,NEW.sport,NEW.court_number,NEW.booking_start_time,
        NEW.booking_end_time,NEW.duration_minutes,NEW.customer_name,NEW.booking_type,
        NEW.private_client_id,NEW.checkmarks,NEW.notes)
      IS DISTINCT FROM
       (OLD.business_date,OLD.sport,OLD.court_number,OLD.booking_start_time,
        OLD.booking_end_time,OLD.duration_minutes,OLD.customer_name,OLD.booking_type,
        OLD.private_client_id,OLD.checkmarks,OLD.notes)
    OR EXISTS(SELECT 1 FROM public.court_payment_splits
       WHERE source_kind='reservation' AND source_id=OLD.id AND voided_at IS NULL)
   THEN RAISE EXCEPTION 'MatchPoint cancellation requires staff review'; END IF;
   RETURN NEW;
  END IF;
  IF auth.uid() IS NULL OR NOT public.is_staff()
  THEN RAISE EXCEPTION 'Only staff may cancel court reservations'; END IF;
  SELECT * INTO v_split FROM public.court_payment_splits
   WHERE source_kind='reservation' AND source_id=OLD.id AND voided_at IS NULL FOR UPDATE;
  IF FOUND THEN
   IF v_split.payment_date<>v_today
    THEN RAISE EXCEPTION 'Payment was allocated on a previous date. Request a dated refund correction from an administrator'; END IF;
   IF EXISTS(SELECT 1 FROM public.cafeteria_day_closings
      WHERE day_date=v_today AND status IN ('closed','approved'))
    THEN RAISE EXCEPTION 'This cashbook day is closed. Reopen it before reversing a court payment'; END IF;
   IF v_split.cash_cents<>0 THEN
    INSERT INTO public.court_payment_cash_movements
     (split_id,entry_date,cash_delta_cents,created_by)
    VALUES(v_split.id,v_today,-v_split.cash_cents,auth.uid());
   END IF;
   PERFORM set_config('app.court_split_internal','yes',true);
   UPDATE public.whish_ledger_entries
    SET voided_at=now(),voided_by=auth.uid(),
     void_reason='Court reservation cancelled: payment allocation reversed'
    WHERE source_court_split_id=v_split.id AND voided_at IS NULL;
   PERFORM set_config('app.court_split_internal','no',true);
   UPDATE public.court_payment_splits
    SET voided_at=now(),updated_at=now(),revision=revision+1 WHERE id=v_split.id;
   INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
    VALUES(auth.uid(),'CANCEL_REVERSE','court_payment_splits',v_split.id::text,
     to_jsonb(v_split),jsonb_build_object('date',v_today,'reservation_id',OLD.id,
      'cash_reversed_cents',v_split.cash_cents,'whish_reversed_cents',v_split.whish_cents));
  END IF;
 END IF;
 RETURN NEW;
END $function$;

-- Staff explicitly choose to retain the local reservation. No payment is changed.
CREATE OR REPLACE FUNCTION public.matchpoint_keep_local(p_id uuid,p_revision integer,p_alert text,p_remote_status text,p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_row public.padel_court_reservations%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Only staff may resolve booking sync issues'; END IF;
 SELECT * INTO v_row FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_row.external_source IS DISTINCT FROM 'matchpoint'
   OR v_row.revision IS DISTINCT FROM p_revision OR v_row.external_alert IS NULL
   OR v_row.external_alert IS DISTINCT FROM p_alert
   OR v_row.external_status IS DISTINCT FROM p_remote_status
   OR v_row.external_remote_snapshot IS DISTINCT FROM p_snapshot
 THEN RAISE EXCEPTION 'This issue changed. Refresh before resolving it.'; END IF;
 PERFORM set_config('app.matchpoint_local_edit','yes',true);
 UPDATE public.padel_court_reservations SET
   external_local_override=true,external_local_edited_at=now(),
   external_review_ack=jsonb_build_object('status',external_status,'snapshot',external_remote_snapshot),
   external_alert=NULL,revision=revision+1,updated_at=now()
 WHERE id=p_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),'MATCHPOINT_KEEP_LOCAL','padel_court_reservations',p_id::text,
   jsonb_build_object('alert',v_row.external_alert),
   jsonb_build_object('resolution','keep_local','external_status',v_row.external_status));
END;
$$;
REVOKE ALL ON FUNCTION public.matchpoint_keep_local(uuid,integer,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.matchpoint_keep_local(uuid,integer,text,text,jsonb) TO authenticated;
