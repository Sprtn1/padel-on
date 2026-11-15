-- MatchPoint remains authoritative for imported booking details; all receipts stay in Padel On.
-- This migration is additive and does not migrate/delete any existing financial or reservation rows.
ALTER TABLE public.padel_court_reservations
  ADD COLUMN IF NOT EXISTS external_source text,
  ADD COLUMN IF NOT EXISTS external_kind text,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS external_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS external_alert text;
-- Automatically imported reservations have no human staff creator.
ALTER TABLE public.padel_court_reservations ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE public.padel_court_reservations
  ADD CONSTRAINT matchpoint_local_reservation_creator_required
  CHECK (created_by IS NOT NULL OR external_source = 'matchpoint');
ALTER TABLE public.padel_court_reservations
  ADD CONSTRAINT matchpoint_external_identifier_complete
  CHECK (external_source IS NULL OR
    (external_source = 'matchpoint' AND external_kind IN ('bookings','matches','activities')
      AND nullif(btrim(external_id),'') IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS matchpoint_unique_external_reservation
  ON public.padel_court_reservations(external_source,external_kind,external_id)
  WHERE external_source IS NOT NULL;
-- MatchPoint may expose 45- or 75-minute bookings even though local UI schedules in 30-minute steps.
ALTER TABLE public.padel_court_reservations
  DROP CONSTRAINT IF EXISTS padel_court_reservations_duration_minutes_check;
ALTER TABLE public.padel_court_reservations
  ADD CONSTRAINT padel_court_reservations_duration_minutes_check
  CHECK (duration_minutes BETWEEN 1 AND 720);

-- Block staff edits to MatchPoint-owned logistics; retain existing staff payment-marker and payment RPCs.
-- The service role is the only trusted integration writer. Service credentials never reach the client.
CREATE OR REPLACE FUNCTION public.guard_matchpoint_booking_ownership()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.external_source = 'matchpoint'
     AND current_setting('request.jwt.claim.role',true) IS DISTINCT FROM 'service_role'
     AND (NEW.business_date,NEW.sport,NEW.court_number,NEW.booking_start_time,
          NEW.booking_end_time,NEW.duration_minutes,NEW.customer_name,NEW.status,
          NEW.booking_type,NEW.external_source,NEW.external_kind,NEW.external_id)
       IS DISTINCT FROM
         (OLD.business_date,OLD.sport,OLD.court_number,OLD.booking_start_time,
          OLD.booking_end_time,OLD.duration_minutes,OLD.customer_name,OLD.status,
          OLD.booking_type,OLD.external_source,OLD.external_kind,OLD.external_id)
  THEN
    RAISE EXCEPTION 'MatchPoint owns this booking. Edit its schedule in MatchPoint instead.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS matchpoint_booking_ownership_guard ON public.padel_court_reservations;
CREATE TRIGGER matchpoint_booking_ownership_guard
BEFORE UPDATE ON public.padel_court_reservations
FOR EACH ROW EXECUTE FUNCTION public.guard_matchpoint_booking_ownership();
REVOKE ALL ON FUNCTION public.guard_matchpoint_booking_ownership() FROM PUBLIC,anon,authenticated;

-- Dashboard-readable sync timestamps, never MatchPoint credentials.
CREATE TABLE IF NOT EXISTS public.matchpoint_sync_status (
  id integer PRIMARY KEY CHECK (id=1),
  last_bookings_at timestamptz,
  last_matches_at timestamptz,
  last_activities_at timestamptz,
  last_run_at timestamptz,
  last_error text,
  last_conflict_count integer NOT NULL DEFAULT 0
);
INSERT INTO public.matchpoint_sync_status(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
ALTER TABLE public.matchpoint_sync_status ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.matchpoint_sync_status FROM PUBLIC,anon;
GRANT SELECT ON public.matchpoint_sync_status TO authenticated;
DROP POLICY IF EXISTS matchpoint_status_staff_read ON public.matchpoint_sync_status;
CREATE POLICY matchpoint_status_staff_read ON public.matchpoint_sync_status FOR SELECT TO authenticated
  USING ((SELECT public.is_staff()));
