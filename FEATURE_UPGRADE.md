# PADEL ON — Quick Match, Week History and Reports

## Deployment status

The website files are committed to GitHub Pages. **One database migration must be run manually before Quick Match works.** Other new features use existing database read permissions.

### 1. Run the one required SQL migration

In your existing PADEL ON Supabase project:

1. Open **SQL Editor → New query**.
2. Open [supabase/migrations/20261015_quick_match.sql](supabase/migrations/20261015_quick_match.sql) in this repository.
3. Copy the **entire SQL file**, paste it into Supabase SQL Editor, and click **Run**.
4. Ensure that the SQL query completes without an error.
5. Refresh the PADEL ON website and test **Quick Match**.

Do not paste your Supabase password, reset code, or secret API key into GitHub. This SQL file contains only structural changes — **no player data or passwords**.

The migration is idempotent and does not modify existing matches or delete records. It adds two columns to `team_matches`:

- `non_team_count integer` — total non-team players in the match, `NULL` for older entries.
- `non_team_names text` — optional names of non-team players.

It also creates the authenticated, atomic Postgres RPC `public.record_quick_team_match(...)`. It uses the existing `staff_profiles` permissions, team member allowance limits, transaction locks, and audit table. It does not replace the original `record_team_match` function.

If Quick Match reports that the function cannot be found, the migration has not been run in **the same Supabase project** as the website, or its function schema cache needs a moment to refresh.

### 2. Quick Match

Use **Overview → Quick Match** or **Team Members → Quick Match**.

- Select four positions. Each must be an active team member or **Non-team player**.
- Each team member can occupy only one position. At least one team member must be selected.
- With **2 or more non-team players**, standard members receive a **free** benefit.
- With **3 or 4 team players**, standard members receive a **half-price** benefit.
- **Nazih always plays free**, even when the other team members receive half-price benefits.
- Every selected team member receives an appropriately typed entry from **one match**. The database rejects games that would exceed a standard member's allowance.
- Game date can be today or within the past 30 days.
- Optional non-team names and notes are stored in the match record.

**Manual Entry** and the older per-member **Add Game** controls remain available and unchanged. The old manual flow does not automatically verify four-player composition.

### 3. Previous weeks

Open **Team Members**, then use the arrows next to the week label. You can browse earlier weeks, review each member's historical used benefits and view the week's matches. Historical views are read-only; use the current week for entry.

The page requests the selected week's saved Supabase records, even if the records are older than the last 30 days of the standard Activity screen. Imported opening balances and authorized reset events are included in weekly totals.

**Limitation:** If an administrator later changes a member's weekly allowance, old weeks display the historical *usage* correctly but show **remaining** benefits against the member's **current allowance**. Allowance change history is not currently snapshotted.

### 4. Weekly / monthly reports

Open **Reports** in the sidebar or mobile navigation:

- Weekly: matches, benefit entries, effective usage (including imported opening balances and resets), and member-by-member details.
- Monthly: recorded team matches/benefit entries, other-player game counts, Nazih's monthly revenue and 15% commission.
- Previous/next arrows navigate independently by week or month.
- **Export CSV** downloads a report including summary, member totals and match rows. Formula-like cell values are escaped for spreadsheet safety.
- **Print / Save PDF** uses your browser's print dialog.

Reports are read-only and query Supabase for the selected date range. Monthly logged-game totals count real dated records only; manually imported opening usage is not a fabricated match.

### 5. Smoke tests before real use

1. Quick Match: 2 team members + 2 non-team players → **Free** for each selected team member.
2. Quick Match: 3 team members + 1 non-team player → **Half-price** for regular members.
3. Quick Match: Nazih + 2 other team members + 1 non-team → Nazih **Free**, others **Half-price**.
4. Attempt to select the same team member twice — Save must be blocked.
5. Attempt to use a fully exhausted member — backend must reject the transaction.
6. Open **Team Members**, navigate to a previous week, confirm its games are visible and current counters are unaffected.
7. Open **Reports**, select a week, export CSV. Then select a previous month and confirm Nazih's saved financial totals match the Matchmaking tab.
8. Confirm the same match is not double-counted on a second device.

Note: Tests 1–3 will record real games. To avoid corrupting the club's data, use a dedicated test project or enter a genuine match and verify its result; if necessary, use the existing **Void Match** operation to correct the record. Avoid creating fake financial entries.

### No other schema changes

Historical reports use existing Row-Level Security policies for `team_matches`, `team_games`, `reset_events`, `initial_balances`, `other_games`, `nazih_games`, and `team_members`. No new tables, roles, environment variables, or service keys are required.

The original 30-second dashboard refresh, 30-minute inactivity logout, Supabase authentication, and manual reset function remain unchanged.
