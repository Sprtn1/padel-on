# MatchPoint Query API integration

MatchPoint is the booking system of record. Padel On imports names, court, date,
time and booking status, **never MatchPoint amounts, payment methods, lighting
costs, customer email/phone or access codes**. All Cash/Whish accounting happens
in existing Padel On payment splits on the date the staff records payment.

## Activation (disabled until the real system details are supplied)

In GitHub repo Settings → Secrets and variables → Actions, add:

| Setting | GitHub type | Value |
| --- | --- | --- |
| MATCHPOINT_ENABLED | Variable | true **only after verification** |
| MATCHPOINT_HOST | Secret | HTTPS origin of MatchPoint server, e.g. https://club.example.com (example only) |
| MATCHPOINT_API_TOKEN | Secret | Query-permission API token (never commit or put in browser) |
| MATCHPOINT_COURT_MAP_JSON | Secret | JSON mapping of actual MatchPoint venue/court names to Padel On |
| MATCHPOINT_CENTER_CODE | Variable | Optional center code for /bookings |
| SUPABASE_URL | Secret | Existing Padel On project URL |
| SUPABASE_SERVICE_ROLE_KEY | Secret | Existing project server-side service_role JWT; never publish |

Example `MATCHPOINT_COURT_MAP_JSON` **replace with actual MatchPoint names**:

```json
{
  "MAIN|Court 1": {"sport":"padel","court":"C1"},
  "MAIN|Court 2": {"sport":"padel","court":"C2"},
  "MAIN|Court 3": {"sport":"padel","court":"C3"},
  "MAIN|Pickle Court": {"sport":"pickleball","court":"P1"},
  "MAIN|Basketball Court": {"sport":"basketball","court":"B1"}
}
```

For bookings, the key can use `venueCode|resourceName` or
`venue|resourceName`. For matches and activities, the API has `venue` rather
than `venueCode`, so add those exact venue-name keys as needed. A bare
`resourceName` mapping is also supported only when unique and verified.
Unknown courts are logged and **not guessed**.

## Data and financial safety

- Service-role-only automated inserts/updates carry external source/kind/id
  and can never silently overwrite existing manual finance entries.
- MatchPoint does not receive changes from Padel On (its Query API is read-only).
- Imports use `padel_court_reservations`, not `cafeteria_finance_entries`.
  A new import has **no payment split**, so no amount appears in daily totals.
- Staff records a Cash/Whish split through the existing linked reservation,
  not as a second court cashbook entry. This preserves daily reconciliation,
  receipts, Whish categories and PDF totals.
- Existing private-client training and maintenance blocks remain local
  operations available from Cafeteria Finances and Timetable.
- Imported MatchPoint booking details cannot be edited by staff in Padel On.
  Paid cancellations are flagged for manual finance review without automatic
  refunds; conflicts with locally occupied courts are logged, never overwritten.
- Source statuses are synchronized only when explicitly present. Missing
  records are not presumed canceled.

## Frequency and limits

The job runs every **five minutes**. `/bookings` polls every run.
`/matches` and `/activities` poll approximately every 30 minutes to
respect the MatchPoint Query API **default 500-request daily quota**:
288 + 48 + 48 = approximately 384 requests/day before pagination or retries.
If all three feeds must refresh every five minutes, request an increased
MatchPoint query-token quota (at least 864 calls/day plus headroom), then
update the throttling after approval.

Each source fetches an inclusive seven-day forward window and paginates via
`hasMore`/offset, including canceled records. Check action logs for unknown
court names, source errors, duplicate bookings and API throttling. An
administrator can manually trigger a sync via Actions → MatchPoint booking sync.

## Installation and rollback

1. Pre-change code snapshot:
   `backup/pre-matchpoint-integration-20261115`.
2. Private Supabase data snapshot:
   `backup_matchpoint_20261115` (reservations, cashbook, linked payments,
   Whish, private accounts, closing records and audit history).
3. Apply versioned migration
   `supabase/migrations/20261115180000_matchpoint_external_reservations.sql`.
4. Merge tested web UI and sync script, set server-only configuration, then
   enable `MATCHPOINT_ENABLED=true` after a dry-run mapping review.
5. To stop syncing immediately, set `MATCHPOINT_ENABLED=false`.
   Imported records and financial history remain intact. Restore code using
   the backup branch if necessary. Never delete linked receipts as rollback.

This integration does **not** automatically back up the whole Supabase
database offsite; the existing Google Drive daily backup workflow remains
separate and should be verified independently.
