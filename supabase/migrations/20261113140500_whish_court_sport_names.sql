-- Categorize source-linked Whish deposits by actual Padel, Basketball or Pickleball court.
-- Preserve source split ID, payment date, amount, Cash movements and wallet balance.
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
 v_whish_name text;
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
  v_whish_name:=CASE v_ledger.category
   WHEN 'basketball_courts' THEN 'Basketball Courts'
   WHEN 'pickleball_courts' THEN 'Pickleball Courts'
   ELSE 'Padel Courts' END;
  v_previous_amount:=v_ledger.amount_cents;
 ELSE
  SELECT * INTO v_res FROM public.padel_court_reservations WHERE id=p_source_id FOR UPDATE;
  IF NOT FOUND OR v_res.status='cancelled' THEN RAISE EXCEPTION 'Reservation unavailable'; END IF;
  v_name:=v_res.customer_name;
  v_whish_name:=CASE v_res.sport
   WHEN 'basketball' THEN 'Basketball Courts'
   WHEN 'pickleball' THEN 'Pickleball Courts'
   ELSE 'Padel Courts' END;
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
 -- Whish deposits remain source-linked and categorized by sport; never post twice.
 -- Keep a single source-linked row, preserving its ID across edits.
 PERFORM set_config('app.court_split_internal','yes',true);
 SELECT id INTO v_whish FROM public.whish_ledger_entries
  WHERE source_court_split_id=v_id LIMIT 1 FOR UPDATE;
 IF p_whish_cents>0 THEN
  IF v_whish IS NULL THEN
   INSERT INTO public.whish_ledger_entries
   (id,entry_date,entry_type,name,amount_cents,created_by,source_court_split_id)
   VALUES(gen_random_uuid(),v_date,'deposit',v_whish_name,p_whish_cents,auth.uid(),v_id);
  ELSE
   UPDATE public.whish_ledger_entries SET name=v_whish_name,amount_cents=p_whish_cents,
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

REVOKE ALL ON FUNCTION public.court_payment_split_save(
 text,uuid,bigint,bigint,bigint,bigint,integer,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court_payment_split_save(
 text,uuid,bigint,bigint,bigint,bigint,integer,bigint) TO authenticated;


-- This trigger covers all three sports; avoid a misleading Padel-only message.
CREATE OR REPLACE FUNCTION public.whish_protect_court_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $guard$
BEGIN
 IF OLD.source_court_split_id IS NOT NULL
  AND current_setting('app.court_split_internal',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Edit this court payment using its booking payment split.';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.whish_protect_court_split() FROM PUBLIC,anon,authenticated;


-- Correct only previously mislabeled source-linked deposits, never manual entries.
-- Preserve every ID, amount, source ID and date; write an audit trail for relabels.
DO $linked_whish_names$
DECLARE rec record;
BEGIN
 PERFORM set_config('app.court_split_internal','yes',true);
 FOR rec IN
  SELECT w.id, w.name AS previous_name,
   CASE WHEN s.source_kind='ledger' THEN
      CASE f.category
       WHEN 'padel_courts' THEN 'Padel Courts'
       WHEN 'basketball_courts' THEN 'Basketball Courts'
       WHEN 'pickleball_courts' THEN 'Pickleball Courts'
       END
    WHEN s.source_kind='reservation' THEN
      CASE r.sport
       WHEN 'padel' THEN 'Padel Courts'
       WHEN 'basketball' THEN 'Basketball Courts'
       WHEN 'pickleball' THEN 'Pickleball Courts'
       END
    END AS target_name
  FROM public.whish_ledger_entries w
  JOIN public.court_payment_splits s ON s.id=w.source_court_split_id
  LEFT JOIN public.cafeteria_finance_entries f
   ON s.source_kind='ledger' AND f.id=s.source_id
  LEFT JOIN public.padel_court_reservations r
   ON s.source_kind='reservation' AND r.id=s.source_id
  WHERE w.entry_type='deposit'
 LOOP
  IF rec.target_name IS NOT NULL AND rec.previous_name IS DISTINCT FROM rec.target_name THEN
   UPDATE public.whish_ledger_entries SET name=rec.target_name WHERE id=rec.id;
   INSERT INTO public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
   VALUES(NULL,'RECLASSIFY','whish_ledger_entries',rec.id::text,
    jsonb_build_object('name',rec.previous_name),
    jsonb_build_object('name',rec.target_name));
  END IF;
 END LOOP;
 PERFORM set_config('app.court_split_internal','no',true);
END $linked_whish_names$;
