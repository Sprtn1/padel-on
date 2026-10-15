# PADEL ON — Monthly Rising Stars Training

This new page tracks Coach Khalil's complimentary training sessions independently of the regular weekly padel game benefits.

## One-time Supabase migration required

1. Confirm that you already applied the [Team Categories migration](supabase/migrations/20261015_team_categories.sql) and the **private** roster assignment SQL. Rising Stars members must have `team_category = 'rising_stars'`.
2. Open your PADEL ON project at [Supabase](https://supabase.com/dashboard) → **SQL Editor → New query**.
3. Copy the entire [Monthly Training migration](supabase/migrations/20261015_rising_stars_training.sql) and click **Run**.
4. Reload PADEL ON and choose **Monthly Training** in the sidebar or mobile navigation.
5. Confirm that the Rising Stars roster appears and training records can load. There should initially be zero training records unless you have separately imported real ones.

**Do not rerun or change your original player seed or game counters.** The training migration only creates training tables, indexes, read policies, and authorized database functions. It does not modify or delete your current team benefits, coaching, or matchmaking records.

## Club policy implemented

- **Coach:** Khalil (shown as "Coach Khalil").
- **Entitlement:** One free, completed training session per Rising Stars member per **calendar month** (Asia/Beirut local date).
- **Duration:** Defaults to 45 minutes; can be recorded between 15 and 180 minutes.
- **Grouping:** Normally two different Rising Stars members per session. A **one-player exception** is supported when necessary; it requires explicitly checking the exception box and recording a reason. This matters when the Rising Stars roster has an odd number of players.
- **Date:** Record sessions that have already occurred; not future reservations. The date must belong to the month currently selected.
- **Usage:** Once a player's attendance is recorded, their status becomes "Completed"; they cannot be recorded again in that calendar month. The calendar month resets naturally each month without erasing past months.
- **Corrections:** An administrator may **Void** an incorrect training session with a reason. This preserves the original session and audit record but releases the original participants' monthly entitlements.
- **Monthly report:** Three summary cards, individual completion status, permanent dated session history, and **Export Monthly CSV**. Navigate backwards/forwards to examine other calendar months.

## Security and duplicate prevention

The website uses existing staff Supabase Authentication and private Row-Level Security. The SQL grants staff read-only access to the training tables and permits new training entries only through `record_training_session`, a transactional, validated security-definer function. A unique active `(member_id, month_key)` index ensures that even simultaneous submissions cannot give a member a second monthly free training. Only admins can call `void_training_session`. Both operations are audited.

If the page displays a database error saying `training_sessions` or `training_attendance` does not exist or is inaccessible, ensure that the migration was applied to the same Supabase project used by your PADEL ON website.

## Validation checklist

- Session with two untrained Rising Stars members → both become **Completed** for the selected month.
- An attempt to record either member again in that month → rejected.
- Opening the next month → all currently active Rising Stars members show **Available** until trained.
- Returning to a previous month → its attendance history remains accessible.
- Coach is **Coach Khalil** for every entry, and duration defaults to **45 minutes**.
- Solo exception → a note of at least four characters is required.
- Admin void → session stops counting and participants become eligible for that month again.
- CSV report → includes attendance status and the logged session dates, participants, duration, and notes.
- Existing weekly game counters, Nazih financial records, and 30-minute inactivity logout remain unchanged.

## Notes

The monthly status summary uses the **current active Rising Stars roster**. If players switch categories or are deactivated in the future, their already-recorded session records remain in the database, but historical eligibility counts may reflect the current roster rather than an old roster snapshot.

No attendance is seeded or marked complete automatically. Enter only real completed training sessions.
