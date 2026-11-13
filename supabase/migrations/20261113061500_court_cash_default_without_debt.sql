-- Courts are CASH by default; Whish is the only alternate payment channel.
-- Keep the legacy unpaid_cents column for API and historical compatibility,
-- but forbid any new debt. Convert active open-day unpaid allocations to Cash.
-- Existing original records, Cash adjustments, Whish entries and revisions survive.
DO $court_no_debt$
DECLARE v_row public.court_payment_splits%rowtype;v_today date:=(now() AT TIME ZONE 'Asia/Beirut')::date;
BEGIN
 IF EXISTS (SELECT 1 FROM public.cafeteria_day_closings
            WHERE day_date=v_today AND status IN ('closed','approved'))
 THEN RAISE EXCEPTION 'Current cashbook day is closed. Reopen before classifying court Unpaid as Cash'; END IF;
 -- No sealed day's original court split may be rewritten as part of this migration.
 IF EXISTS (SELECT 1 FROM public.court_payment_splits s
            JOIN public.cafeteria_day_closings d ON d.day_date=s.payment_date
            WHERE s.voided_at IS NULL AND s.unpaid_cents>0 AND d.status IN ('closed','approved'))
 THEN RAISE EXCEPTION 'Legacy Unpaid is present on a closed day. Review before migrating'; END IF;
 FOR v_row IN SELECT * FROM public.court_payment_splits
  WHERE unpaid_cents>0 AND voided_at IS NULL FOR UPDATE
 LOOP
  UPDATE public.court_payment_splits
   SET cash_cents=v_row.cash_cents+v_row.unpaid_cents,
       unpaid_cents=0, revision=v_row.revision+1,updated_at=now()
   WHERE id=v_row.id;
  -- Reservation cash movements track the money assigned to Cash today.
  -- Ledger entries already count their full amount as cash; increasing their
  -- Cash allocation would otherwise duplicate cash. Record only the delta
  -- needed to preserve the same total under the existing ledger formula.
  INSERT INTO public.court_payment_cash_movements
   (split_id,entry_date,cash_delta_cents,created_by)
   VALUES(v_row.id,v_today,v_row.unpaid_cents,v_row.created_by);
  INSERT INTO public.audit_logs
   (actor,action,entity,entity_id,before_data,after_data)
   VALUES(NULL,'MIGRATE','court_payment_splits',v_row.id::text,to_jsonb(v_row),
    jsonb_build_object('reason','Cash-default/no-court-debt policy',
      'migration','20261113_cash_default_courts',
      'cash_cents',v_row.cash_cents+v_row.unpaid_cents,
      'whish_cents',v_row.whish_cents,'unpaid_cents',0,
      'reclassified_on',v_today));
 END LOOP;
 -- Voided history stays untouched; it is never a current debt.
END $court_no_debt$;

ALTER TABLE public.court_payment_splits
 ADD CONSTRAINT court_split_no_unpaid_active
 CHECK (voided_at IS NOT NULL OR unpaid_cents=0);
CREATE OR REPLACE FUNCTION public.court_payment_split_save(p_source_kind text, p_source_id uuid, p_total_cents bigint, p_cash_cents bigint, p_whish_cents bigint, p_unpaid_cents bigint, p_expected_revision integer DEFAULT NULL::integer, p_expected_total_cents bigint DEFAULT NULL::bigint)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 v_date date:=(now() at time zone 'Asia/Beirut')::date;
 v_old public.court_payment_splits%rowtype;
 v_ledger public.cafeteria_finance_entries%rowtype;
 v_res public.padel_court_reservations%rowtype;
 v_id uuid;v_previous_cash bigint;v_previous_amount bigint;
 v_delta bigint;v_name text;
 v_whish uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required';END IF;
 IF p_source_kind NOT IN ('ledger','reservation') OR p_source_kind IS NULL OR p_source_id IS NULL
  THEN RAISE EXCEPTION 'Invalid court booking source'; END IF;
 IF p_total_cents IS NULL OR p_total_cents NOT BETWEEN 1 AND 100000000000
  OR p_cash_cents IS NULL OR p_whish_cents IS NULL OR p_unpaid_cents IS NULL
  OR LEAST(p_cash_cents,p_whish_cents,p_unpaid_cents)<0 OR p_unpaid_cents<>0
  OR p_cash_cents+p_whish_cents<>p_total_cents
  THEN RAISE EXCEPTION 'Cash + Whish must equal the total court price. Courts do not track unpaid balances'; END IF;
 -- Payments are accounted on the date they are received; closed days cannot be adjusted.
 IF EXISTS(SELECT 1 FROM public.cafeteria_day_closings d
  WHERE d.day_date=v_date AND d.status IN ('closed','approved'))
 THEN RAISE EXCEPTION 'Today is closed. Ask an administrator to reopen it before correcting court payments.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('padelon_court_payments'),hashtext(p_source_kind||p_source_id::text));
 IF p_source_kind='ledger' THEN
  SELECT * INTO v_ledger FROM public.cafeteria_finance_entries WHERE id=p_source_id FOR UPDATE;
  IF NOT FOUND OR v_ledger.voided_at IS NOT NULL
    OR v_ledger.category NOT IN ('padel_courts','pickleball_courts','basketball_courts')
   THEN RAISE EXCEPTION 'Court ledger entry unavailable'; END IF;
  IF v_ledger.entry_date<>v_date THEN
   RAISE EXCEPTION 'Payment splits on existing finance entries can only be entered on their cashbook date'; END IF;
  IF p_expected_total_cents IS NULL OR v_ledger.amount_cents<>p_expected_total_cents
   THEN RAISE EXCEPTION 'Court price changed on another device; refresh first'; END IF;
  v_name:=v_ledger.name;
  v_previous_amount:=v_ledger.amount_cents;
 ELSE
  SELECT * INTO v_res FROM public.padel_court_reservations WHERE id=p_source_id FOR UPDATE;
  IF NOT FOUND OR v_res.status='cancelled' THEN RAISE EXCEPTION 'Reservation unavailable'; END IF;
  v_name:=v_res.customer_name;
  v_previous_amount:=0;
 END IF;
 SELECT * INTO v_old FROM public.court_payment_splits
  WHERE source_kind=p_source_kind AND source_id=p_source_id FOR UPDATE;
 IF FOUND THEN
  IF v_old.payment_date<>v_date THEN
   RAISE EXCEPTION 'Payments were recorded on another day; ask an administrator for a dated correction'; END IF;
  IF p_expected_revision IS NULL OR v_old.revision<>p_expected_revision
   THEN RAISE EXCEPTION 'Payment breakdown changed on another device; refresh first'; END IF;
  v_id:=v_old.id;
  v_previous_cash:=v_old.cash_cents;
 ELSE
  IF p_expected_revision IS NOT NULL THEN
   RAISE EXCEPTION 'Payment breakdown changed on another device; refresh first'; END IF;
  v_id:=gen_random_uuid();
  v_previous_cash:=CASE WHEN p_source_kind='ledger' THEN v_previous_amount ELSE 0 END;
 END IF;
 IF p_source_kind='ledger' AND v_previous_amount<>p_total_cents THEN
  -- Existing validated amount changer preserves every player's paid marker.
  PERFORM set_config('app.court_split_internal','yes',true);
  PERFORM public.cafeteria_finance_set_court_amount(
   p_source_id,p_total_cents,v_previous_amount);
 END IF;
 IF v_old.id IS NULL THEN
  INSERT INTO public.court_payment_splits
  (id,source_kind,source_id,booking_name,payment_date,amount_cents,cash_cents,whish_cents,unpaid_cents,created_by)
  VALUES(v_id,p_source_kind,p_source_id,v_name,v_date,p_total_cents,p_cash_cents,p_whish_cents,p_unpaid_cents,auth.uid());
 ELSE
  UPDATE public.court_payment_splits SET booking_name=v_name,voided_at=NULL,amount_cents=p_total_cents,cash_cents=p_cash_cents,
    whish_cents=p_whish_cents,unpaid_cents=p_unpaid_cents,revision=revision+1,updated_at=now()
   WHERE id=v_id;
 END IF;
 -- A ledger booking already counted its full charge as cash. A reservation did not.
 v_delta:=p_cash_cents-v_previous_cash;
 IF p_source_kind='ledger' AND v_old.id IS NOT NULL THEN
  v_delta:=v_delta-(p_total_cents-v_previous_amount);
 ELSIF p_source_kind='ledger' AND v_old.id IS NULL THEN
  v_delta:=p_cash_cents-p_total_cents;
 END IF;
 IF v_delta<>0 THEN
  INSERT INTO public.court_payment_cash_movements
    (split_id,entry_date,cash_delta_cents,created_by)
   VALUES(v_id,v_date,v_delta,auth.uid());
 END IF;
 -- Padel court Whish deposits are never entered manually a second time.
 -- Keep a single source-linked row, preserving its ID across edits.
 PERFORM set_config('app.court_split_internal','yes',true);
 SELECT id INTO v_whish FROM public.whish_ledger_entries
  WHERE source_court_split_id=v_id LIMIT 1 FOR UPDATE;
 IF p_whish_cents>0 THEN
  IF v_whish IS NULL THEN
   INSERT INTO public.whish_ledger_entries
   (id,entry_date,entry_type,name,amount_cents,created_by,source_court_split_id)
   VALUES(gen_random_uuid(),v_date,'deposit','Padel Courts',p_whish_cents,auth.uid(),v_id);
  ELSE
   UPDATE public.whish_ledger_entries SET amount_cents=p_whish_cents,
    voided_at=NULL,voided_by=NULL,void_reason=NULL WHERE id=v_whish;
  END IF;
 ELSIF v_whish IS NOT NULL THEN
  UPDATE public.whish_ledger_entries SET voided_at=now(),voided_by=auth.uid(),
   void_reason='Court payment breakdown changed to zero Whish' WHERE id=v_whish;
 END IF;
 PERFORM set_config('app.court_split_internal','no',true);
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 VALUES(auth.uid(),CASE WHEN v_old.id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
 'court_payment_splits',v_id::text,
 CASE WHEN v_old.id IS NULL THEN NULL ELSE to_jsonb(v_old) END,
 jsonb_build_object('source_kind',p_source_kind,'source_id',p_source_id,
 'payment_date',v_date,'total_cents',p_total_cents,'cash_cents',p_cash_cents,
 'whish_cents',p_whish_cents,'unpaid_cents',p_unpaid_cents,'cash_adjustment',v_delta));
 RETURN v_id;
END $function$;

-- Function and table permissions remain staff-only as before.
REVOKE EXECUTE ON FUNCTION public.court_payment_split_save(
 text,uuid,bigint,bigint,bigint,bigint,integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court_payment_split_save(
 text,uuid,bigint,bigint,bigint,bigint,integer,bigint) TO authenticated;

-- Cash-default reservations must remain cancellable on their payment date.
-- Reverse Cash and Whish atomically before the status change; never lose
-- historic receipts or silently adjust already closed accounting periods.
CREATE OR REPLACE FUNCTION public.court_split_guard_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $court_cancel$
DECLARE v_split public.court_payment_splits%rowtype;
 v_today date:=(now() AT TIME ZONE 'Asia/Beirut')::date;
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled' THEN
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
END $court_cancel$;
REVOKE ALL ON FUNCTION public.court_split_guard_reservation() FROM PUBLIC,anon,authenticated;

-- These are trigger-only helpers, not public RPC endpoints.
-- Trigger execution still works without direct EXECUTE privileges.
REVOKE EXECUTE ON FUNCTION public.court_split_guard_ledger() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.court_split_sync_void_finance() FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.whish_protect_court_split() FROM PUBLIC,anon,authenticated;
