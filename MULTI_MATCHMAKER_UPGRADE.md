# PADEL ON — Multi-person matchmaking commissions

The Matchmaking page now supports four **independent** person-specific financial ledgers, while retaining all legacy financial records and the existing design. Each person has their own date-based revenue records, monthly commission, month navigation, monthly paid/unpaid settlement, edits, soft-deletes, and CSV export. The main Reports page also includes a per-person monthly breakdown and combined totals.

## Required setup: two SQL queries (in this order)

1. Sign in to the existing PADEL ON project at [Supabase](https://supabase.com/dashboard). Open **SQL Editor → New query**.
2. Copy and run [supabase/migrations/20261015_multi_matchmaker_finance.sql](supabase/migrations/20261015_multi_matchmaker_finance.sql). This **preserves** existing Nazih revenue rows and settlements; each receives a unique legacy matchmaker ID. It removes the old database restriction allowing only one settlement per month and replaces it with one settlement per person per month.
3. In a second SQL query, run the private file **MATCHMAKERS_PRIVATE_SETUP.sql** supplied separately to PADEL ON management. This adds the approved personnel and associates the previously used legacy ID with its correct name. **Do not upload private personnel SQL to the public GitHub repository.**
4. Refresh PADEL ON. The four entries should appear in the selector at the top of **Matchmaking**.
5. Verify that the legacy person's October/previous-month games and paid statuses are unchanged and that the three new ledgers start with zero records.

No original `nazih_games` or `nazih_settlements` table is renamed or dropped. Keeping the current table names protects older workflows and historic audit triggers. The new `matchmaker_id` column distinguishes which person owns a record.

**Before setup is complete** the original Nazih-only Matchmaking page remains available, so deploying the frontend first does not block prior financial features. After step 1 but before step 2, you may see a temporary “Legacy matchmaker” label; finish the private setup before entering new financial records.

## Commission assumptions

The previous ledger used **15%**. Because different rates were not provided, **all four matchmakers default to 15%**. The rate is stored separately on each `matchmakers` row as `commission_bps = 1500`. Monthly commission is calculated independently per person:

`commission = round(total monthly revenue in cents × commission_bps / 10000)`

Per-game commission shares displayed in the table are only illustrative; the official monthly commission is rounded **once per person per month**. The club-wide report adds the four independently rounded results.

If a person's rate is different, confirm it with management **before** adding that person's financial records. An administrator can update it directly in Supabase SQL Editor; the frontend does not allow staff to change rates. Note that changing a rate retroactively recalculates the displayed commission for all months because this first implementation has a current-per-person rate (not a historical rate schedule).

## How to use

- **Matchmaking:** Select a person using the top row of buttons. The history, monthly revenue, commission, settlement, and CSV export all switch together.
- **Add Matchmaking Game:** Records the new entry only under the currently selected person.
- **Edit / Remove:** Changes only a record from the selected person's ledger. Remove is a reversible database soft-delete (existing behavior), not destruction of history.
- **Record Payment:** Admin-only. Marks payment status for **this person + this month**. Payments do not alter game revenue.
- **Previous / Next Month:** Scroll through the selected person's archived financial history.
- **Export CSV:** Produces a person-and-month-specific sheet.
- **Reports → Monthly:** Provides total matchmaking revenue, total commissions, and a breakdown per person including their settlement status.

## Data safety and security

- Supabase RLS restricts the `matchmakers` directory to authenticated PADEL ON staff. Game and payment permissions remain as they were.
- Existing Nazih rows and settlements are associated with a single stable ID, not duplicated or reset.
- The original 15% calculator, weekly member entitlements, monthly training sessions, 6-hour inactivity sign-out, and periodic data refresh are unchanged.
- No reset code or Supabase secret needs to be entered into GitHub.

## Validate before daily use

- Confirm four names appear, with the legacy financial balance under the correct person.
- Log one genuine game for each new person; ensure no game appears under anyone else.
- For the same month, create separate settlements for two people; verify each one's Paid/Unpaid state stays independent.
- Check month arrows and independent CSV exports.
- Open Reports → Monthly and confirm the total equals the sum of per-person amounts.
- If a table or new column is reported missing, check both SQL steps ran against the same Supabase project and reload the website.

Database migration execution against the live project is not automated by this repository update.
