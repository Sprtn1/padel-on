# MatchPoint Query API integration

MatchPoint is the booking system of record. Padel On imports names, court, date,
time and booking status, **never MatchPoint amounts, payment methods, lighting
costs, customer email/phone or access codes**. All Cash/Whish accounting happens
in existing Padel On payment splits on the date the staff records payment.

## Activation (disabled until the real system details are supplied)

In GitHub repo Settings → Secrets and variables → Actions, add:

| Setting | GitHub type | Value |
| --- | --- | --- |
| MATCHPOINT_ENABLED | Workflow setting | `true` for the verified bookings-only rollout; the API remains read-only |
| MATCHPOINT_HOST | Workflow configuration | `https://padelon-lb.matchpoint.com.es` (MatchPoint Query API origin, provided by club, not the app login host) |
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

## Verified bookings-only rollout (November 16, 2026)

The real provider returned PascalCase controls `Ok=true`, `Data=[...]`,
`HasMore=false`, `Error=null`, `Offset=0` and `Limit=1000`.
The new strict parser accepts this observed wrapper and the documented
lowercase wrapper. It rejects ambiguous error/success flags, offset
mismatches, unknown end-of-pagination, a nonzero HasMore flag, and
incomplete booking rows. A read-only live check validated **77/77**
bookings and their actual court mapping. No MatchPoint financial,
contact, or access-code fields are imported.

**Initial production rollout is now enabled** with an emergency pause control; this does not by itself confirm a successful production import. The first scheduled run must be checked in GitHub Actions and against `matchpoint_sync_status` and reservations.

Initial production rollout settings:
`MATCHPOINT_FEEDS=bookings`, `MATCHPOINT_EXTENDED_SCAN=false`, and `MATCHPOINT_ENABLED=true`.
That makes one booking API request per allowed slot, looking ahead
seven days. **Matches and activities remain off** until their record
schemas are separately verified, and the previous 90-day extended
scan is temporarily disabled until its paging has been validated.
The normal service-role request claims and 24/day hard cap remain.
The booking worker checks true time overlaps, not only identical
start/end strings, including existing local reservations and times
with SQL seconds. Overlapping court imports are skipped, not merged
or allowed to replace staff bookings or accounting.

To stop the rollout, set the GitHub Actions repository variable
`MATCHPOINT_PAUSED=true` in
Settings > Secrets and variables > Actions > Variables. Never put
the service role key or API token in browser code.

## Staff-editable MatchPoint reservations — local overrides

The MatchPoint Query API remains **read-only**. An imported booking is a normal
Padel On reservation after it is created: staff can open **Edit booking** from
the timetable or the Cafeteria Finances list and locally change its name,
notes, court, start time, duration/extension, tentative/confirmed/cancelled
status, player-paid checkmarks, and optional Cash/Whish price allocation.
The booking-type selector allows changing a MatchPoint reservation to a local
**Block Court** or, for Padel, **Private Client Training** (client, coach and
session fee). Converting to private training links the existing booking to
Private Sessions without charging the client until normal session completion.

Every local customization keeps the original `external_source`,
`external_kind` and `external_id`. The database records
`external_local_override=true` and an edited-at timestamp through the
existing authenticated staff reservation RPCs, with optimistic revision and
court-overlap checks. Direct updates cannot bypass these controls.
Existing active court Cash/Whish splits must be reversed appropriately before
converting to Block Court or Private Training. Posted private training cannot
be repurposed, preserving the client ledger and audit history.

**Sync behavior after a local edit:** the importer updates the remote
status, remote booking snapshot and last-seen timestamp, but never silently
reverts staff-edited booking fields or alters its payments, private-client
link, checkmarks or notes. If MatchPoint subsequently changes or cancels a
locally overridden booking, Padel On retains the local version and places a
review warning on the record. Local cancellation also stays local and requires
a corresponding MatchPoint change to release that venue slot. The UI explicitly
warns that an extension or court change in Padel On does not update MatchPoint.

An imported reservation with **no recorded court payment starts at $0** in
the full editor; editing its details does *not* automatically create a cash
receipt. Staff may explicitly allocate a court price and Cash/Whish when
appropriate. Staff cannot convert a paid court reservation into a block or
private training until the financial allocation is corrected.

### Recovery

Backup branch: `backup/pre-matchpoint-local-edit-20261117`.
A snapshot of the pre-migration court reservations and payment splits exists
in the private schema `backup_matchpoint_local_edit_20261117`. Do not drop
these backups until verifying the live interface. The usual emergency stop
for the MatchPoint importer is the GitHub Actions variable
`MATCHPOINT_PAUSED=true`; it does not disable the normal local editor.

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
  operations available from Cafeteria Finances and Timetable. Because the
  MatchPoint Query API is read-only, staff must create the corresponding
  block/reservation in MatchPoint too; Padel On cannot prevent new bookings
  there. The UI warns about this important limitation.
- Imported MatchPoint booking details cannot be edited by staff in Padel On.
  Paid cancellations are flagged for manual finance review without automatic
  refunds; conflicts with locally occupied courts are logged, never overwritten.
- Source statuses are synchronized only when explicitly present. Missing
  records are not presumed canceled.

## Frequency and strict API-request limit

**Hard maximum: 24 actual MatchPoint HTTP requests per Beirut calendar day.**
An API *request* is a call to MatchPoint, not a sync run or a Supabase call.

Fifteen sync passes are scheduled hourly from **09:00 through 23:00 Asia/Beirut**.
The production workflow uses `/bookings` only: 15 x 1 = 15 scheduled
requests per day, leaving nine of the 24-request daily allowance unused.
Matches and activities remain disabled.

GitHub Actions runs a UTC hour-range cron (`0 6-21 * * *`), while the
worker enforces the valid local hourly slots. This covers Lebanon's
winter (UTC+2) and summer (UTC+3) time, without duplicating calls.
Cron execution is best-effort: delayed runs outside a valid slot are
skipped, not retried into an extra slot.

Every MatchPoint HTTP call must first claim an entry in the Supabase
`matchpoint_query_request_claims` table using the server-role-only RPC
`matchpoint_claim_query_request`. Its primary key allows one request per
feed per time slot and its transactionally checked daily count is capped at
24. Requests are counted **before** they are attempted, including failed
connections and requests rejected by MatchPoint. Manual runs, retries,
failed jobs, and overlapping GitHub workers cannot exceed the cap.

To avoid unbudgeted pagination, each endpoint requests only its first
(up to 1,000 records) page. If `hasMore=true`, it **fails closed** with an
error instead of silently importing an incomplete result or issuing an
additional HTTP request. In that case shorten the date window or request
a larger MatchPoint quota; imported financial rows are never overwritten.
The active production feed covers seven days ahead. The optional extended
scan is disabled in the production workflow.

The source API's own quota reset time zone may differ from Beirut. If the
provider enforces a rolling 24-hour cap or resets in another time zone,
confirm that reset policy with MatchPoint before running at the ceiling.

## Query API document verification (QUERY_API.md, 2026-06-23)

The official Query API document specifies `https://{host}/api/query`,
requires `X-Api-Token` with `query` permission, and defines read-only
`GET /bookings`, `GET /matches`, and `GET /activities` (each with
`dateFrom` and `dateTo`). The maximum date span for these endpoints is
90 days; `limit` may be at most 1000. `canceled=yes` includes canceled
records. Padel On's request construction follows these rules.

**The PDF uses a `{host}` placeholder, but MatchPoint has now provided the club's Query API origin:**
`https://padelon-lb.matchpoint.com.es` (without the `app-` prefix).
Both GitHub Actions workflows set this public hostname explicitly instead of using the old login-host secret.
The Query API remains read-only and authentication stays in the encrypted `MATCHPOINT_API_TOKEN` GitHub secret.

On 2026-11-16, the original **incorrect** `app-padelon-lb.matchpoint.com.es`
website hostname returned HTTP 302 for `/api/query/bookings` despite valid TLS. The
documentation lists **400, 401, and 429** API errors, not 302. A redirect
might indicate website authentication or a different/disabled API route,
rather than proving the token itself is invalid. Do not interpret that test as a failure of the **new** `padelon-lb` origin.
Leave `MATCHPOINT_ENABLED` disabled until a read-only request confirms the corrected host.
The diagnostic never follows a redirect with an API token.

**Correct host verified on 2026-11-16:** a one-time read-only request
to `https://padelon-lb.matchpoint.com.es/api/query/bookings` returned HTTP
**200** (rather than the prior login-host HTTP 302). The response was
parseable JSON but **did not match the documented `{ok:true,data:[...]}`
envelope**. This does NOT mean bookings can yet be safely imported. The
manual-only diagnostic now reports only response field *types*, without
logging private response content, so the exact discrepancy can be isolated
at the next permitted request window. Keep `MATCHPOINT_ENABLED` disabled
until the response structure, mapping and import behavior are validated.


### Forced preview result — November 16, 2026 at 23:28 Beirut time

The user-authorized single-request diagnostic, counted against the
existing strict 24-per-day Supabase request ledger, returned HTTP 200.
The API used an undocumented JSON envelope with a unique top-level
booking array. The **read-only compatibility preview** found **77
candidate booking records, all 77 structurally valid and correctly
mapped to Padel On courts**, with zero invalid/unmapped rows. The
preview did **not** import data, copy contact/payment information,
or modify the financial tables. The workflow returned a nonzero exit
code intentionally because the production parser still requires the
official `{ok:true,data:[...]}` wrapper.

**Production synchronization stays disabled** until an explicit
alternative-wrapper parser has safe pagination/hasMore handling,
error-state validation, and regression tests. These preview counts
are not evidence that the unknown wrapper's pagination and total
record semantics match the published document.

### Live response findings — November 16, 2026

An actual read-only `GET /api/query/bookings` at 23:14 Beirut time
returned HTTP 200 JSON with **six top-level fields, one top-level array,
and eight objects containing booking-related field groups** including
identifier, court, date, time, status, participants, and payments. It did
**not** contain the documented lowercase `ok` / `data` wrapper. The
privacy-safe schema diagnostics indicate provider fields may also have
different capitalization.

A new **preview-only** compatibility detector can validate a unique
top-level booking array using case-insensitive known field names and
existing court mappings. It returns only aggregate counts and never
customer records, financial data, API tokens, or the unknown wrapper key.
The production importer deliberately still requires the documented page
envelope, because the alternative wrapper's pagination and error flags
have not been confirmed. **Do not enable regular synchronization yet**.
Use only one quota-counted manual connection check per approved time slot
until the alternate envelope and pagination semantics are verified.

The document also describes `GET /api/query/availability`, a **different**
endpoint whose requested *availability slot duration* is limited to 1–600
minutes. That 600-minute limit does not apply to returned booking durations
from `/bookings`, `/matches`, or `/activities`. The local MatchPoint import
normalizer therefore supports court reservations up to Padel On's existing
**960-minute** (16-hour) database/business limit.

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


## Cancellation reconciliation and Sync Issues (November 17, 2026)

Cafeteria Finances → Court bookings → **List / Timetable / Sync Issues** is
the central staff review queue. It lists outstanding reservation alerts
across business dates and individual overlaps that prevented new imports.
Review booking opens the existing booking editor. Keep local version
acknowledges the exact observed MatchPoint status and snapshot and preserves
the local override. If an overlapping new import was skipped, review the
blocking local reservation; a later sync retries the import.

- Explicit provider cancellations soft-cancel an untouched, unpaid booking.
  The cancelled row and provider identity remain in PostgreSQL for audit.
- A missing upcoming booking is flagged on the first fully validated,
  complete, unique-ID bookings response, and may be soft-cancelled only
  after a second complete observation. Failed/invalid/partial responses
  never infer deletion. The worker excludes already-started services and
  the uncertain upper date boundary from omission checks.
- Local edits, notes, payment checkmarks, allocated payments, private
  training and blocks are protected. Staff must resolve these exceptions.
- Existing finance/cashbook/posted-training cancellation guards remain in
  place for staff. The service role can soft-cancel only eligible imported
  bookings, without moving money or changing their booking details.
- MatchPoint stays read-only; resolving a local issue does not write to
  MatchPoint. The schedule and the 24-request cap are unchanged.

Backup: `backup/pre-matchpoint-sync-issues-20261117` and private database
schema `backup_matchpoint_sync_issues_20261117`.
