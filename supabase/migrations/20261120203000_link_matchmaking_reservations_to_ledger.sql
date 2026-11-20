-- Keep the existing manual matchmaking revenue ledger while representing each
-- active timetable matchmaking booking exactly once as a count-only game.
ALTER TABLE public.nazih_games
 ADD COLUMN IF NOT EXISTS source_reservation_id uuid
 REFERENCES public.padel_court_reservations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS nazih_games_reservation_source_unique
 ON public.nazih_games(source_reservation_id)
 WHERE source_reservation_id IS NOT NULL;

ALTER TABLE public.nazih_games
 ADD CONSTRAINT nazih_linked_reservation_no_extra_revenue
 CHECK (source_reservation_id IS NULL OR amount_cents = 0);

-- A user must edit the original court reservation, not its derived count-only row.
CREATE OR REPLACE FUNCTION public.guard_linked_matchmaking_game()
 RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
 SET search_path TO 'public','pg_temp'
AS $body$
BEGIN
 IF current_setting('app.court_matchmaking_link',true) IS DISTINCT FROM 'yes' THEN
  IF TG_OP='INSERT' AND NEW.source_reservation_id IS NOT NULL
     THEN RAISE EXCEPTION 'Reservation-linked games are created automatically'; END IF;
  IF TG_OP='UPDATE' AND
      (OLD.source_reservation_id IS NOT NULL OR NEW.source_reservation_id IS NOT NULL)
     AND NEW IS DISTINCT FROM OLD
     THEN RAISE EXCEPTION 'Edit this match in the Court Timetable'; END IF;
 END IF;
 RETURN NEW;
END $body$;

CREATE TRIGGER guard_linked_matchmaking_game_row
 BEFORE INSERT OR UPDATE ON public.nazih_games
 FOR EACH ROW EXECUTE FUNCTION public.guard_linked_matchmaking_game();

CREATE OR REPLACE FUNCTION public.sync_reservation_matchmaking_game()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'public','pg_temp'
AS $body$
DECLARE
 v_players text;
 v_notes text;
BEGIN
 -- This derived row never carries court receipts, a separate commission
 -- amount, or a MatchPoint write. The normal finance pages still own payments.
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
   INSERT INTO public.nazih_games
    (played_on,amount_cents,players,notes,created_by,matchmaker_id,source_reservation_id)
   VALUES
    (NEW.business_date,0,v_players,v_notes,NEW.created_by,NEW.matchmaker_id,NEW.id)
   ON CONFLICT (source_reservation_id) WHERE source_reservation_id IS NOT NULL
   DO UPDATE SET
    played_on=EXCLUDED.played_on,
    matchmaker_id=EXCLUDED.matchmaker_id,
    players=EXCLUDED.players,
    notes=EXCLUDED.notes,
    deleted_at=NULL,
    updated_at=now()
   WHERE (nazih_games.played_on,nazih_games.matchmaker_id,
          nazih_games.players,nazih_games.notes,nazih_games.deleted_at)
     IS DISTINCT FROM
         (EXCLUDED.played_on,EXCLUDED.matchmaker_id,
          EXCLUDED.players,EXCLUDED.notes,NULL::timestamptz);
 END IF;
 RETURN NEW;
END $body$;

REVOKE ALL ON FUNCTION public.guard_linked_matchmaking_game() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.sync_reservation_matchmaking_game() FROM PUBLIC,anon,authenticated;

CREATE TRIGGER sync_matchmaking_game_from_reservation
 AFTER INSERT OR UPDATE OF matchmaker_id, status, booking_type,private_client_id,
      sport,business_date,customer_name,notes,booking_start_time,
      booking_end_time,court_number
 ON public.padel_court_reservations
 FOR EACH ROW EXECUTE FUNCTION public.sync_reservation_matchmaking_game();

-- Backfill only existing explicitly classified active reservations, never all
-- imported MatchPoint games and never historical manual ledger entries.
UPDATE public.padel_court_reservations
 SET matchmaker_id=matchmaker_id
 WHERE matchmaker_id IS NOT NULL
   AND status <> 'cancelled'
   AND booking_type='reservation'
   AND private_client_id IS NULL
   AND sport='padel';
