-- The matchmaking ledger mirrors the full court charge from the existing
-- reservation payment split. This is a reporting/commission amount ONLY:
-- it must never create new Cash, Whish, or cafeteria finance movements.

-- Previous count-only implementation forced all reservation-linked games to $0.
ALTER TABLE public.nazih_games
 DROP CONSTRAINT IF EXISTS nazih_linked_reservation_no_extra_revenue;

-- Ensure matchmaker assignment (or later changes to reservation details) also
-- reads the latest active court total. Cash versus Whish is irrelevant here.
CREATE OR REPLACE FUNCTION public.sync_reservation_matchmaking_game()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_players text;
 v_notes text;
 v_amount bigint;
BEGIN
 PERFORM set_config('app.court_matchmaking_link','yes',true);
 IF NEW.matchmaker_id IS NULL OR NEW.status='cancelled'
    OR NEW.booking_type<>'reservation' OR NEW.private_client_id IS NOT NULL
    OR NEW.sport<>'padel' THEN
  UPDATE public.nazih_games
   SET deleted_at=now(),updated_at=now()
  WHERE source_reservation_id=NEW.id AND deleted_at IS NULL;
 ELSE
  v_players=left(coalesce(nullif(btrim(NEW.customer_name),''),'Court reservation'),255);
  v_notes=left('Court timetable · '||NEW.court_number||' · '||
   to_char(NEW.booking_start_time,'HH24:MI')||'–'||
   to_char(NEW.booking_end_time,'HH24:MI'),500);

  SELECT COALESCE((
   SELECT s.amount_cents FROM public.court_payment_splits s
   WHERE s.source_kind='reservation' AND s.source_id=NEW.id
     AND s.voided_at IS NULL
   LIMIT 1
  ),0) INTO v_amount;

  INSERT INTO public.nazih_games
   (played_on,amount_cents,players,notes,created_by,matchmaker_id,source_reservation_id)
  VALUES
   (NEW.business_date,v_amount,v_players,v_notes,NEW.created_by,NEW.matchmaker_id,NEW.id)
  ON CONFLICT (source_reservation_id) WHERE source_reservation_id IS NOT NULL
  DO UPDATE SET
   played_on=EXCLUDED.played_on,
   amount_cents=EXCLUDED.amount_cents,
   matchmaker_id=EXCLUDED.matchmaker_id,
   players=EXCLUDED.players,
   notes=EXCLUDED.notes,
   deleted_at=NULL,
   updated_at=now()
  WHERE (nazih_games.played_on,nazih_games.amount_cents,nazih_games.matchmaker_id,
         nazih_games.players,nazih_games.notes,nazih_games.deleted_at)
    IS DISTINCT FROM
        (EXCLUDED.played_on,EXCLUDED.amount_cents,EXCLUDED.matchmaker_id,
         EXCLUDED.players,EXCLUDED.notes,NULL::timestamptz);
 END IF;
 RETURN NEW;
END $body$;

-- Court splits can be entered or corrected after the reservation was initially
-- classified. Keep the linked game amount current regardless of payment method
-- and without any second finance entry. Voids and removals reset the mirror.
CREATE OR REPLACE FUNCTION public.sync_matchmaking_amount_from_court_split()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_old_id uuid;
 v_new_id uuid;
 v_id uuid;
 v_amount bigint;
BEGIN
 IF TG_OP IN ('UPDATE','DELETE') THEN
  IF OLD.source_kind='reservation' THEN v_old_id:=OLD.source_id; END IF;
 END IF;
 IF TG_OP IN ('UPDATE','INSERT') THEN
  IF NEW.source_kind='reservation' THEN v_new_id:=NEW.source_id; END IF;
 END IF;
 PERFORM set_config('app.court_matchmaking_link','yes',true);
 FOREACH v_id IN ARRAY ARRAY[v_old_id,v_new_id] LOOP
  IF v_id IS NULL THEN CONTINUE; END IF;
  SELECT COALESCE((
   SELECT s.amount_cents
   FROM public.court_payment_splits s
   WHERE s.source_kind='reservation' AND s.source_id=v_id
     AND s.voided_at IS NULL
   LIMIT 1
  ),0) INTO v_amount;
  UPDATE public.nazih_games
   SET amount_cents=v_amount,updated_at=now()
   WHERE source_reservation_id=v_id AND deleted_at IS NULL
     AND amount_cents IS DISTINCT FROM v_amount;
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $body$;

DROP TRIGGER IF EXISTS sync_matchmaking_game_amount_from_split
 ON public.court_payment_splits;
CREATE TRIGGER sync_matchmaking_game_amount_from_split
 AFTER INSERT OR UPDATE OR DELETE ON public.court_payment_splits
 FOR EACH ROW EXECUTE FUNCTION public.sync_matchmaking_amount_from_court_split();

REVOKE ALL ON FUNCTION public.sync_reservation_matchmaking_game()
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_matchmaking_amount_from_court_split()
 FROM PUBLIC,anon,authenticated;

-- Populate the original two (and any other previously assigned) bookings from
-- the existing court payment records. Never add extra cash/Whish transactions.
DO $body$
BEGIN
 PERFORM set_config('app.court_matchmaking_link','yes',true);
 UPDATE public.nazih_games g SET
  amount_cents=s.amount_cents,updated_at=now()
 FROM public.court_payment_splits s
 WHERE g.source_reservation_id=s.source_id
   AND s.source_kind='reservation' AND s.voided_at IS NULL
   AND g.deleted_at IS NULL
   AND g.amount_cents IS DISTINCT FROM s.amount_cents;
END $body$;
