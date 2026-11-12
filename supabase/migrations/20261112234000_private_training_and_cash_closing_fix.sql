-- No schema changes to the financial ledgers or existing reservation types.
-- Private client training is a scheduled, non-payment reservation subtype.
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS private_client_id uuid REFERENCES public.private_clients(id),
 ADD COLUMN IF NOT EXISTS private_coach_id uuid REFERENCES public.private_coaches(id),
 ADD COLUMN IF NOT EXISTS private_session_fee_cents bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS private_session_entry_id uuid UNIQUE REFERENCES public.private_ledger_entries(id);
ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT club_private_training_fields_check CHECK (
  (private_client_id IS NULL AND private_coach_id IS NULL AND
   private_session_fee_cents=0 AND private_session_entry_id IS NULL) OR
  (private_client_id IS NOT NULL AND booking_type='reservation' AND
   private_session_fee_cents BETWEEN 0 AND 100000000000));
CREATE INDEX IF NOT EXISTS club_private_training_client_idx
 ON public.padel_court_reservations(private_client_id,business_date)
 WHERE private_client_id IS NOT NULL;

-- Do not allow duplicate accounting: private training has no court cash/Whish split.
CREATE OR REPLACE FUNCTION public.club_private_training_payment_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.source_kind='reservation' AND EXISTS (
   SELECT 1 FROM public.padel_court_reservations
   WHERE id=NEW.source_id AND private_client_id IS NOT NULL)
 THEN RAISE EXCEPTION 'Private training charges belong in Private Sessions, not court Cash/Whish'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.club_private_training_payment_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS club_private_training_payment_guard_trigger ON public.court_payment_splits;
CREATE TRIGGER club_private_training_payment_guard_trigger
 BEFORE INSERT OR UPDATE ON public.court_payment_splits
 FOR EACH ROW EXECUTE FUNCTION public.club_private_training_payment_guard();

-- Prevent cancellation after the completed private session has been charged.
CREATE OR REPLACE FUNCTION public.club_private_training_posted_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF OLD.private_client_id IS NOT NULL AND OLD.private_session_entry_id IS NOT NULL
   AND NEW.status='cancelled' AND OLD.status<>'cancelled'
   AND EXISTS(SELECT 1 FROM public.private_ledger_entries
     WHERE id=OLD.private_session_entry_id AND voided_at IS NULL)
 THEN RAISE EXCEPTION 'The private session is already recorded. Correct it in Private Sessions before cancelling.'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.club_private_training_posted_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS club_private_training_posted_guard_trigger ON public.padel_court_reservations;
CREATE TRIGGER club_private_training_posted_guard_trigger
 BEFORE UPDATE OF status ON public.padel_court_reservations
 FOR EACH ROW EXECUTE FUNCTION public.club_private_training_posted_guard();

-- Existing club reservation RPC handles conflict checks, locking and audit;
-- this wrapper adds the client link and fee atomically with the court booking.
CREATE OR REPLACE FUNCTION public.club_private_training_save(
 p_id uuid,p_business_date date,p_sport text,p_court text,p_start text,
 p_duration integer,p_client_id uuid,p_coach_id uuid,p_session_fee_cents bigint,
 p_notes text,p_status text,p_expected_revision integer
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_id uuid;v_client record;v_existing public.padel_court_reservations%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 SELECT id,name INTO v_client FROM public.private_clients WHERE id=p_client_id
  AND active AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select an active Private Sessions client'; END IF;
 IF p_coach_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.private_coaches WHERE id=p_coach_id AND active)
 THEN RAISE EXCEPTION 'Select an active coach or leave coach unassigned'; END IF;
 IF p_session_fee_cents IS NULL OR p_session_fee_cents<0 OR p_session_fee_cents>100000000000
 THEN RAISE EXCEPTION 'Enter a valid session fee'; END IF;
 IF p_id IS NOT NULL THEN
  SELECT * INTO v_existing FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_existing.private_client_id IS NULL
    THEN RAISE EXCEPTION 'Private training booking not found'; END IF;
  IF v_existing.private_session_entry_id IS NOT NULL AND
    (v_existing.private_client_id IS DISTINCT FROM p_client_id
     OR v_existing.private_session_fee_cents<>p_session_fee_cents
     OR v_existing.private_coach_id IS DISTINCT FROM p_coach_id)
   THEN RAISE EXCEPTION 'The session is already recorded; edit financial details in Private Sessions'; END IF;
 END IF;
 v_id:=public.club_court_reservation_save(
  p_id,p_business_date,p_sport,p_court,p_start,p_duration,v_client.name,
  coalesce(p_notes,''),p_status,'reservation',p_expected_revision,
  0,0,0,0,NULL,false);
 UPDATE public.padel_court_reservations SET
  private_client_id=p_client_id,private_coach_id=p_coach_id,
  private_session_fee_cents=p_session_fee_cents,customer_name=v_client.name,
  updated_at=now() WHERE id=v_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),CASE WHEN p_id IS NULL THEN 'CREATE' ELSE 'UPDATE' END,
  'court_private_training',v_id::text,
  jsonb_build_object('client_id',p_client_id,'coach_id',p_coach_id,
    'fee_cents',p_session_fee_cents,'status',p_status));
 RETURN v_id;
END $$;

-- Only staff explicitly confirming a completed session create a real client charge.
-- Future training remains upcoming and does not prematurely change account balances.
CREATE OR REPLACE FUNCTION public.club_private_training_complete(
 p_booking_id uuid,p_coach_id uuid
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_booking public.padel_court_reservations%rowtype;v_entry uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN RAISE EXCEPTION 'Staff authorization required'; END IF;
 SELECT * INTO v_booking FROM public.padel_court_reservations WHERE id=p_booking_id FOR UPDATE;
 IF NOT FOUND OR v_booking.private_client_id IS NULL OR v_booking.status<>'confirmed'
 THEN RAISE EXCEPTION 'Select a confirmed private training booking'; END IF;
 IF v_booking.business_date>(now() at time zone 'Asia/Beirut')::date
 THEN RAISE EXCEPTION 'Future training cannot be marked completed'; END IF;
 IF v_booking.private_session_entry_id IS NOT NULL
 THEN RAISE EXCEPTION 'Session already recorded; use Private Sessions for corrections'; END IF;
 IF p_coach_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.private_coaches WHERE id=p_coach_id AND active)
 THEN RAISE EXCEPTION 'Choose an active coach to record the session'; END IF;
 v_entry:=gen_random_uuid();
 PERFORM public.private_log_entry(v_entry,v_booking.private_client_id,'session',v_booking.business_date,
   p_coach_id,v_booking.private_session_fee_cents,0,0,
   left('Court training · '||v_booking.sport||' '||v_booking.court_number||
    ' '||v_booking.booking_start_time::text||' · '||coalesce(v_booking.notes,''),500));
 UPDATE public.padel_court_reservations
 SET private_session_entry_id=v_entry,private_coach_id=p_coach_id,
     revision=revision+1,updated_at=now() WHERE id=p_booking_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'COMPLETE','court_private_training',p_booking_id::text,
  jsonb_build_object('private_ledger_entry_id',v_entry,'fee_cents',v_booking.private_session_fee_cents));
 RETURN v_entry;
END $$;
REVOKE ALL ON FUNCTION public.club_private_training_save(uuid,date,text,text,text,integer,uuid,uuid,bigint,text,text,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_private_training_save(uuid,date,text,text,text,integer,uuid,uuid,bigint,text,text,integer)
 TO authenticated;
REVOKE ALL ON FUNCTION public.club_private_training_complete(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_private_training_complete(uuid,uuid) TO authenticated;

-- Server close reconciles court cash reallocations on their collection date.
CREATE OR REPLACE FUNCTION public.cafeteria_change_day_status(p_day_date date, p_action text, p_reason text DEFAULT ''::text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_record public.cafeteria_day_closings%rowtype; v_next text; v_difference bigint;
begin
 if not public.is_staff() then raise exception 'Staff authorization required'; end if;
 if p_day_date is null or p_day_date>(now() at time zone 'Asia/Beirut')::date
 then raise exception 'Invalid date to close'; end if;
 if p_action not in ('close','approve','reopen') then raise exception 'Invalid close action'; end if;
 if p_action in ('approve','reopen') and not public.is_admin() then
  raise exception 'Only an administrator can approve or reopen a day';
 end if;
 if p_action='reopen' and char_length(btrim(coalesce(p_reason,''))) not between 4 and 500
 then raise exception 'A reopening reason (4–500 characters) is required'; end if;
 perform pg_advisory_xact_lock(hashtext('padelon_day_close'),p_day_date-date '2000-01-01');
 select * into v_record from public.cafeteria_day_closings where day_date=p_day_date for update;
 if p_action='close' then
   if coalesce(v_record.status,'reopened') not in ('reopened') then
    raise exception 'This day is already submitted or approved';
   end if;
   if not exists(select 1 from public.cafeteria_finance_days where day_date=p_day_date)
   then raise exception 'Enter the closing cash count before closing the day'; end if;
   select
      (select closing_cash_cents from public.cafeteria_finance_days where day_date=p_day_date)
      + coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(amount_cents) from public.cafeteria_finance_entries
         where entry_date=p_day_date and voided_at is null and category not in
           ('general_payment','coaches','cafeteria_stock','family_debt','other_expense')),0)
      - coalesce((select sum(case
          when entry_type='session' then paid_cents
          when entry_type='deposit' then deposit_cents
          when entry_type='balance_close' then -session_fee_cents
          else 0 end)
         from public.private_ledger_entries
         where entry_date=p_day_date and voided_at is null and payment_channel='cash'),0)
      - coalesce((select sum(cash_delta_cents) from public.court_payment_cash_movements
         where entry_date=p_day_date),0)
    into v_difference;
   if v_difference<0 then
     raise exception 'Negative Goods Sold indicates a cash discrepancy. Correct the entries before closing.';
   end if;
   v_next:='closed';
   insert into public.cafeteria_day_closings(day_date,status,closed_by,closed_at,approved_by,approved_at,updated_at)
   values(p_day_date,v_next,auth.uid(),now(),null,null,now())
   on conflict(day_date) do update set status='closed',closed_by=auth.uid(),closed_at=now(),
      approved_by=null,approved_at=null,updated_at=now();
 elsif p_action='approve' then
   if v_record.status is distinct from 'closed' then
     raise exception 'A day must be submitted before approval'; end if;
   update public.cafeteria_day_closings
    set status='approved',approved_by=auth.uid(),approved_at=now(),updated_at=now()
    where day_date=p_day_date;
   v_next:='approved';
 else
   if coalesce(v_record.status,'reopened') not in ('closed','approved')
   then raise exception 'This day is not closed'; end if;
   update public.cafeteria_day_closings set status='reopened',reopened_by=auth.uid(),
    reopened_at=now(),reopen_reason=btrim(p_reason),updated_at=now() where day_date=p_day_date;
   v_next:='reopened';
 end if;
 insert into public.audit_logs(actor,action,entity,entity_id,before_data,after_data)
 values(auth.uid(),upper(p_action),'cafeteria_day_closings',p_day_date::text,
   case when v_record.day_date is null then null else jsonb_build_object('status',v_record.status) end,
   jsonb_build_object('status',v_next,'reason',nullif(btrim(coalesce(p_reason,'')),'')));
 return v_next;
end$function$;
