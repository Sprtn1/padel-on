-- Classify ordinary Padel reservations as matchmaking without changing the provider
-- booking type, cash/Whish receipts, or the existing separate commission ledger.
ALTER TABLE public.padel_court_reservations
 ADD COLUMN IF NOT EXISTS matchmaker_id uuid REFERENCES public.matchmakers(id) ON DELETE RESTRICT;

ALTER TABLE public.padel_court_reservations
 ADD CONSTRAINT court_matchmaker_only_ordinary_reservation
 CHECK (matchmaker_id IS NULL OR (booking_type='reservation' AND private_client_id IS NULL));

-- Conversions to a blocked court or private training cannot retain matchmaking labels.
CREATE OR REPLACE FUNCTION public.club_reservation_clear_inapplicable_matchmaker()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 IF NEW.booking_type<>'reservation' OR NEW.private_client_id IS NOT NULL THEN
  NEW.matchmaker_id:=NULL;
 END IF;
 RETURN NEW;
END $body$;
CREATE TRIGGER court_reservation_clear_matchmaker
 BEFORE UPDATE OF booking_type, private_client_id ON public.padel_court_reservations
 FOR EACH ROW EXECUTE FUNCTION public.club_reservation_clear_inapplicable_matchmaker();

-- Separate narrow RPC: no direct table updates, no changes to MatchPoint fields.
CREATE OR REPLACE FUNCTION public.club_court_reservation_matchmaker_set(
 p_id uuid,p_matchmaker_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','pg_temp'
AS $body$
DECLARE v_row public.padel_court_reservations%rowtype;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_staff() THEN
  RAISE EXCEPTION 'Staff authorization required';
 END IF;
 SELECT * INTO v_row FROM public.padel_court_reservations WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found'; END IF;
 IF v_row.booking_type<>'reservation' OR v_row.private_client_id IS NOT NULL
    OR v_row.status='cancelled' OR v_row.sport<>'padel' THEN
  RAISE EXCEPTION 'Only active Padel reservations can be matchmaking matches';
 END IF;
 IF p_matchmaker_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.matchmakers WHERE id=p_matchmaker_id
    AND (active OR id=v_row.matchmaker_id)
 ) THEN RAISE EXCEPTION 'Choose an active matchmaker'; END IF;
 IF v_row.matchmaker_id IS NOT DISTINCT FROM p_matchmaker_id THEN RETURN; END IF;
 UPDATE public.padel_court_reservations
  SET matchmaker_id=p_matchmaker_id,updated_at=now(),revision=revision+1 WHERE id=p_id;
 INSERT INTO public.audit_logs(actor,action,entity,entity_id,after_data)
 VALUES(auth.uid(),'UPDATE','padel_court_reservations',p_id::text,
  jsonb_build_object('matchmaker_id',p_matchmaker_id));
END $body$;
REVOKE ALL ON FUNCTION public.club_court_reservation_matchmaker_set(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.club_court_reservation_matchmaker_set(uuid,uuid) TO authenticated;
