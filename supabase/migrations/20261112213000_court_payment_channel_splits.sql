-- Padel On: court payment allocations and matched Cash/Whish postings.
-- Legacy court entries remain unchanged unless staff explicitly allocate a payment.
CREATE TABLE public.court_payment_splits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK (source_kind IN ('ledger','reservation')),
 source_id uuid NOT NULL,
 booking_name text NOT NULL,
 payment_date date NOT NULL,
 amount_cents bigint NOT NULL CHECK (amount_cents>0 AND amount_cents<=100000000000),
 cash_cents bigint NOT NULL DEFAULT 0 CHECK (cash_cents>=0),
 whish_cents bigint NOT NULL DEFAULT 0 CHECK (whish_cents>=0),
 unpaid_cents bigint NOT NULL DEFAULT 0 CHECK (unpaid_cents>=0),
 revision integer NOT NULL DEFAULT 1,
 voided_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(source_kind,source_id),
 CONSTRAINT court_split_balanced CHECK (cash_cents+whish_cents+unpaid_cents=amount_cents)
);
CREATE INDEX court_payment_splits_date_idx ON public.court_payment_splits(payment_date);
ALTER TABLE public.court_payment_splits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.court_payment_splits FROM anon,PUBLIC;
GRANT SELECT ON public.court_payment_splits TO authenticated;
CREATE POLICY court_payment_splits_staff_read ON public.court_payment_splits
 FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

CREATE TABLE public.court_payment_cash_movements(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 split_id uuid NOT NULL REFERENCES public.court_payment_splits(id),
 entry_date date NOT NULL,
 cash_delta_cents bigint NOT NULL,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX court_payment_movement_day_idx ON public.court_payment_cash_movements(entry_date,created_at);
ALTER TABLE public.court_payment_cash_movements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.court_payment_cash_movements FROM anon,PUBLIC;
GRANT SELECT ON public.court_payment_cash_movements TO authenticated;
CREATE POLICY court_payment_movements_staff_read ON public.court_payment_cash_movements
 FOR SELECT TO authenticated USING ((SELECT public.is_staff()));

ALTER TABLE public.whish_ledger_entries
 ADD COLUMN source_court_split_id uuid UNIQUE REFERENCES public.court_payment_splits(id);

-- Only the atomic posting RPC may edit a court-sourced Whish deposit.
CREATE OR REPLACE FUNCTION public.whish_protect_court_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.source_court_split_id IS NOT NULL
  AND current_setting('app.court_split_internal',true) IS DISTINCT FROM 'yes' THEN
  RAISE EXCEPTION 'Edit this Padel Courts payment using its booking payment split.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER whish_court_split_protect BEFORE UPDATE OR DELETE ON public.whish_ledger_entries
FOR EACH ROW EXECUTE FUNCTION public.whish_protect_court_split();

-- Removing or modifying a linked ledger amount would invalidate a saved allocation.
CREATE OR REPLACE FUNCTION public.court_split_guard_ledger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.category IN ('padel_courts','pickleball_courts','basketball_courts')
  AND EXISTS(SELECT 1 FROM public.court_payment_splits p
   WHERE p.source_kind='ledger' AND p.source_id=OLD.id)
  AND NEW.amount_cents IS DISTINCT FROM OLD.amount_cents
  AND current_setting('app.court_split_internal',true) IS DISTINCT FROM 'yes'
 THEN RAISE EXCEPTION 'Edit amount or payments through the court Cash/Whish breakdown first.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER court_split_ledger_amount_guard BEFORE UPDATE ON public.cafeteria_finance_entries
FOR EACH ROW EXECUTE FUNCTION public.court_split_guard_ledger();

-- Preserve the existing administrator void action, including its Cash/Whish corrections.
CREATE OR REPLACE FUNCTION public.court_split_sync_void_finance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_split public.court_payment_splits%rowtype;v_net bigint;
BEGIN
 IF OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL THEN
  SELECT * INTO v_split FROM public.court_payment_splits
   WHERE source_kind='ledger' AND source_id=NEW.id AND voided_at IS NULL FOR UPDATE;
  IF FOUND THEN
   SELECT coalesce(sum(cash_delta_cents),0) INTO v_net
    FROM public.court_payment_cash_movements WHERE split_id=v_split.id;
   IF v_net<>0 THEN
    INSERT INTO public.court_payment_cash_movements(split_id,entry_date,cash_delta_cents,created_by)
     VALUES(v_split.id,NEW.entry_date,-v_net,auth.uid());
   END IF;
   UPDATE public.court_payment_splits SET voided_at=now(),updated_at=now() WHERE id=v_split.id;
   PERFORM set_config('app.court_split_internal','yes',true);
   UPDATE public.whish_ledger_entries SET voided_at=now(),voided_by=auth.uid(),
    void_reason='Source court finance entry voided' WHERE source_court_split_id=v_split.id
    AND voided_at IS NULL;
   PERFORM set_config('app.court_split_internal','no',true);
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER court_split_finance_void_sync AFTER UPDATE OF voided_at ON public.cafeteria_finance_entries
FOR EACH ROW EXECUTE FUNCTION public.court_split_sync_void_finance();

CREATE OR REPLACE FUNCTION public.court_split_guard_reservation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status='cancelled' AND OLD.status<>'cancelled'
 AND EXISTS(SELECT 1 FROM public.court_payment_splits p WHERE p.source_kind='reservation'
  AND p.source_id=OLD.id AND p.voided_at IS NULL AND (p.cash_cents>0 OR p.whish_cents>0)) THEN
  RAISE EXCEPTION 'Reservation has collected payments. Reverse them before cancelling.';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER court_split_reservation_cancel_guard BEFORE UPDATE ON public.padel_court_reservations
FOR EACH ROW EXECUTE FUNCTION public.court_split_guard_reservation();

CREATE OR REPLACE FUNCTION public.court_payment_split_save(
 p_source_kind text, p_source_id uuid,p_total_cents bigint,
 p_cash_cents bigint,p_whish_cents bigint,p_unpaid_cents bigint,
 p_expected_revision integer DEFAULT NULL,p_expected_total_cents bigint DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
  OR LEAST(p_cash_cents,p_whish_cents,p_unpaid_cents)<0
  OR p_cash_cents+p_whish_cents+p_unpaid_cents<>p_total_cents
  THEN RAISE EXCEPTION 'Cash + Whish + Unpaid must equal the total court price'; END IF;
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
END $$;
REVOKE EXECUTE ON FUNCTION public.court_payment_split_save(text,uuid,bigint,bigint,bigint,bigint,integer,bigint)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.court_payment_split_save(text,uuid,bigint,bigint,bigint,bigint,integer,bigint)
 TO authenticated;

-- The cash handover calculation starts with ledger entries and then applies
-- dated payment-difference movements, including future-reservation prepayments.
CREATE OR REPLACE FUNCTION public.cafeteria_handover_snapshot(
 p_day_date date, p_opening_cash_cents bigint DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $$
DECLARE
 v_previous public.cafeteria_shift_handovers%rowtype;
 v_from timestamptz;v_cutoff timestamptz:=clock_timestamp();
 v_start_cash bigint;v_finance_in bigint;v_finance_out bigint;v_finance_count integer;
 v_private_in bigint;v_private_out bigint;v_private_count integer;
 v_court_adjust bigint;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required';END IF;
 IF p_day_date IS DISTINCT FROM (now() at time zone 'Asia/Beirut')::date
 THEN RAISE EXCEPTION 'Cash checks are available for today only';END IF;
 SELECT * INTO v_previous FROM public.cafeteria_shift_handovers
 WHERE day_date=p_day_date AND voided_at IS NULL ORDER BY created_at DESC,id DESC LIMIT 1;
 IF v_previous.id IS NULL THEN
  v_from=p_day_date::timestamp at time zone 'Asia/Beirut';
  IF p_opening_cash_cents IS NOT NULL AND p_opening_cash_cents NOT BETWEEN 0 AND 100000000000
   THEN RAISE EXCEPTION 'Invalid opening cash count';END IF;
  v_start_cash=p_opening_cash_cents;
 ELSE
  v_from=v_previous.created_at;v_start_cash=v_previous.counted_cash_cents;
 END IF;
 SELECT
  coalesce(sum(amount_cents) FILTER(WHERE category NOT IN
    ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0),
  coalesce(sum(amount_cents) FILTER(WHERE category IN
    ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0),
  count(*)::integer
 INTO v_finance_in,v_finance_out,v_finance_count
 FROM public.cafeteria_finance_entries WHERE entry_date=p_day_date
  AND voided_at IS NULL AND created_at>=v_from
  AND (v_previous.id IS NULL OR created_at>v_from) AND created_at<v_cutoff;
 SELECT coalesce(sum(cash_delta_cents),0) INTO v_court_adjust
 FROM public.court_payment_cash_movements
 WHERE entry_date=p_day_date AND created_at>=v_from
  AND (v_previous.id IS NULL OR created_at>v_from) AND created_at<v_cutoff;
 SELECT coalesce(sum(greatest(amount,0)),0),coalesce(sum(greatest(-amount,0)),0),
 count(*)::integer INTO v_private_in,v_private_out,v_private_count
 FROM(
 SELECT CASE entry_type WHEN 'session' THEN paid_cents WHEN 'deposit' THEN deposit_cents
   WHEN 'balance_close' THEN -session_fee_cents ELSE 0 END AS amount
 FROM public.private_ledger_entries
 WHERE entry_date=p_day_date AND voided_at IS NULL AND payment_channel='cash'
 AND entry_type IN ('session','deposit','balance_close') AND created_at>=v_from
 AND (v_previous.id IS NULL OR created_at>v_from) AND created_at<v_cutoff
 ) private_cash;
 RETURN jsonb_build_object('previous_id',v_previous.id,'window_start_at',v_from,
  'checked_at',v_cutoff,'opening_cash_cents',v_start_cash,
  'income_cents',v_finance_in+v_court_adjust+v_private_in,
  'expenses_cents',v_finance_out+v_private_out,
  'expected_cents',CASE WHEN v_start_cash IS NULL THEN NULL ELSE
   v_start_cash+v_finance_in+v_court_adjust+v_private_in-v_finance_out-v_private_out END,
  'finance_count',v_finance_count,'private_count',v_private_count);
END $$;

-- Save a reservation and its payment allocation in one transaction, preventing
-- a booking from existing without its selected payment split after an error.
CREATE OR REPLACE FUNCTION public.padel_reservation_save_with_split(
 p_id uuid,p_business_date date,p_court text,p_start text,p_duration integer,
 p_customer text,p_notes text,p_status text,p_expected_revision integer,
 p_payment_total_cents bigint,p_cash_cents bigint,p_whish_cents bigint,
 p_unpaid_cents bigint,p_split_revision integer DEFAULT NULL,
 p_update_payments boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_existing record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff()
 THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 IF p_update_payments AND p_status='cancelled'
  AND (coalesce(p_cash_cents,0)>0 OR coalesce(p_whish_cents,0)>0)
 THEN RAISE EXCEPTION 'A paid reservation cannot be cancelled without reversing its payments'; END IF;
 v_id:=public.padel_reservation_save(
  p_id,p_business_date,p_court,p_start,p_duration,
  p_customer,p_notes,p_status,p_expected_revision);
 IF p_status='cancelled' THEN
  UPDATE public.court_payment_splits SET voided_at=now(),updated_at=now()
   WHERE source_kind='reservation' AND source_id=v_id AND voided_at IS NULL
    AND cash_cents=0 AND whish_cents=0;
 END IF;
 IF p_update_payments AND p_status<>'cancelled' THEN
  IF p_payment_total_cents IS NULL OR p_payment_total_cents<1 THEN
   RAISE EXCEPTION 'Enter a court price before saving the payment breakdown'; END IF;
  PERFORM public.court_payment_split_save(
    'reservation',v_id,p_payment_total_cents,p_cash_cents,p_whish_cents,
    p_unpaid_cents,p_split_revision,NULL);
 END IF;
 RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.padel_reservation_save_with_split(uuid,date,text,text,integer,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.padel_reservation_save_with_split(uuid,date,text,text,integer,text,text,text,integer,bigint,bigint,bigint,bigint,integer,boolean) TO authenticated;
