-- Enforce one active court occupancy interval across BOTH reservation and finance tables.
-- Preserve historical overlaps. Only NEW or actually MOVED/REACTIVATED occupancy
-- is validated; changing notes, payment markers or prices remains possible.
-- A shared advisory lock per sport/court serializes concurrent cross-page saves.
CREATE SCHEMA IF NOT EXISTS club_internal;
REVOKE ALL ON SCHEMA club_internal FROM PUBLIC;
REVOKE ALL ON SCHEMA club_internal FROM anon, authenticated;

CREATE OR REPLACE FUNCTION club_internal.reject_overlapping_court_bookings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $guard$
DECLARE
 v_day date;
 v_category text;
 v_court text;
 v_start timestamp;
 v_finish timestamp;
 v_duration interval;
 v_conflict record;
BEGIN
 IF TG_TABLE_NAME = 'padel_court_reservations' THEN
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' THEN
   IF (NEW.business_date, NEW.sport, NEW.court_number, NEW.booking_start_time,
       NEW.duration_minutes, NEW.status = 'cancelled')
      IS NOT DISTINCT FROM
      (OLD.business_date, OLD.sport, OLD.court_number, OLD.booking_start_time,
       OLD.duration_minutes, OLD.status = 'cancelled') THEN
    RETURN NEW;
   END IF;
  END IF;
  v_day := NEW.business_date;
  v_category := CASE NEW.sport
   WHEN 'padel' THEN 'padel_courts'
   WHEN 'pickleball' THEN 'pickleball_courts'
   WHEN 'basketball' THEN 'basketball_courts' END;
  v_court := NEW.court_number;
  IF v_category IS NULL OR v_court IS NULL THEN
   RAISE EXCEPTION 'Choose a valid sport and court';
  END IF;
  IF NEW.booking_start_time IS NULL OR NEW.duration_minutes IS NULL OR NEW.duration_minutes <= 0 THEN
   RAISE EXCEPTION 'A valid booking start and duration are required';
  END IF;
  v_duration := make_interval(mins => NEW.duration_minutes);
  v_start := NEW.business_date + NEW.booking_start_time
    + CASE WHEN NEW.booking_start_time <= time '01:00'
      THEN interval '1 day' ELSE interval '0 days' END;
 ELSE
  -- For historical court rows, do not block changes to money, payment or notes.
  IF TG_OP = 'UPDATE' THEN
   IF (NEW.entry_date, NEW.category, NEW.court_number, NEW.booking_start_time,
       NEW.booking_end_time, NEW.voided_at IS NULL)
      IS NOT DISTINCT FROM
      (OLD.entry_date, OLD.category, OLD.court_number, OLD.booking_start_time,
       OLD.booking_end_time, OLD.voided_at IS NULL) THEN
    RETURN NEW;
   END IF;
  END IF;
  IF NEW.voided_at IS NOT NULL
     OR NEW.category NOT IN ('padel_courts', 'pickleball_courts', 'basketball_courts') THEN
   RETURN NEW;
  END IF;
  IF NEW.booking_start_time IS NULL AND NEW.booking_end_time IS NULL THEN
   RETURN NEW; -- Finance RPC creates an unplaced row before assigning its times.
  END IF;
  IF NEW.booking_start_time IS NULL OR NEW.booking_end_time IS NULL THEN
   RAISE EXCEPTION 'Court bookings need both a start time and an end time';
  END IF;
  v_day := NEW.entry_date;
  v_category := NEW.category;
  v_court := CASE v_category
   WHEN 'padel_courts' THEN NEW.court_number
   WHEN 'pickleball_courts' THEN 'P1'
   WHEN 'basketball_courts' THEN 'B1' END;
  IF v_court IS NULL OR (v_category = 'padel_courts' AND v_court NOT IN ('C1','C2','C3')) THEN
   RAISE EXCEPTION 'Select C1, C2 or C3 for this Padel booking';
  END IF;
  v_duration := NEW.booking_end_time - NEW.booking_start_time;
  IF v_duration <= interval '0 seconds' THEN v_duration := v_duration + interval '1 day'; END IF;
  v_start := NEW.entry_date + NEW.booking_start_time
    + CASE WHEN NEW.booking_start_time <= time '01:00'
      THEN interval '1 day' ELSE interval '0 days' END;
 END IF;

 IF v_day IS NULL OR v_duration IS NULL OR v_duration <= interval '0 seconds' THEN
  RAISE EXCEPTION 'Invalid court booking date or duration';
 END IF;
 v_finish := v_start + v_duration;

 -- Same lock for the same court regardless of entry page, booking date, or
 -- whether an existing booking is being moved. This prevents double-booking
 -- even when two staff members save simultaneously.
 PERFORM pg_advisory_xact_lock(
  hashtext('padelon_cross_page_court'), hashtext(v_category || ':' || v_court)
 );

 WITH occupied AS (
  SELECT r.id, r.business_date AS booked_date,
   (r.business_date + r.booking_start_time +
    CASE WHEN r.booking_start_time <= time '01:00'
     THEN interval '1 day' ELSE interval '0 days' END) AS begins_at,
   (r.business_date + r.booking_start_time +
    CASE WHEN r.booking_start_time <= time '01:00'
     THEN interval '1 day' ELSE interval '0 days' END +
    make_interval(mins => r.duration_minutes)) AS ends_at
  FROM public.padel_court_reservations r
  WHERE r.business_date BETWEEN v_day - 1 AND v_day + 1
   AND r.sport = CASE v_category WHEN 'padel_courts' THEN 'padel'
    WHEN 'pickleball_courts' THEN 'pickleball' ELSE 'basketball' END
   AND r.court_number = v_court AND r.status <> 'cancelled'
   AND (TG_TABLE_NAME <> 'padel_court_reservations' OR r.id <> NEW.id)

  UNION ALL

  SELECT f.id, f.entry_date AS booked_date,
   (f.entry_date + f.booking_start_time +
    CASE WHEN f.booking_start_time <= time '01:00'
     THEN interval '1 day' ELSE interval '0 days' END) AS begins_at,
   (f.entry_date + f.booking_start_time +
    CASE WHEN f.booking_start_time <= time '01:00'
     THEN interval '1 day' ELSE interval '0 days' END +
    CASE WHEN f.booking_end_time > f.booking_start_time
     THEN f.booking_end_time - f.booking_start_time
     ELSE f.booking_end_time - f.booking_start_time + interval '1 day' END) AS ends_at
  FROM public.cafeteria_finance_entries f
  WHERE f.entry_date BETWEEN v_day - 1 AND v_day + 1
   AND f.category = v_category AND f.voided_at IS NULL
   AND f.booking_start_time IS NOT NULL AND f.booking_end_time IS NOT NULL
   AND (v_category <> 'padel_courts' OR f.court_number = v_court)
   AND (TG_TABLE_NAME <> 'cafeteria_finance_entries' OR f.id <> NEW.id)
 )
 SELECT booked_date, begins_at, ends_at INTO v_conflict
 FROM occupied
 WHERE tsrange(begins_at, ends_at, '[)') && tsrange(v_start, v_finish, '[)')
 ORDER BY begins_at
 LIMIT 1;

 IF FOUND THEN
  RAISE EXCEPTION USING
   ERRCODE = '23P01',
   MESSAGE = format('Court %s already has a booking %s–%s on %s. Choose a free time or another court.',
    v_court, to_char(v_conflict.begins_at,'HH24:MI'),
    to_char(v_conflict.ends_at,'HH24:MI'),v_conflict.booked_date);
 END IF;
 RETURN NEW;
END
$guard$;

REVOKE ALL ON FUNCTION club_internal.reject_overlapping_court_bookings() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS court_reservations_no_overlap ON public.padel_court_reservations;
CREATE TRIGGER court_reservations_no_overlap
 BEFORE INSERT OR UPDATE ON public.padel_court_reservations
 FOR EACH ROW EXECUTE FUNCTION club_internal.reject_overlapping_court_bookings();

DROP TRIGGER IF EXISTS court_finance_no_overlap ON public.cafeteria_finance_entries;
CREATE TRIGGER court_finance_no_overlap
 BEFORE INSERT OR UPDATE ON public.cafeteria_finance_entries
 FOR EACH ROW EXECUTE FUNCTION club_internal.reject_overlapping_court_bookings();
