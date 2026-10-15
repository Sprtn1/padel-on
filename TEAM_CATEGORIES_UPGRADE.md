# PADEL ON — Team categories rollout

The website supports four groups: **Top Team**, **Team**, **Rising Stars Team**, and **Ladies Team**.

## Complete these two SQL steps in Supabase

1. Open your existing **PADEL ON Supabase project → SQL Editor → New query**.
2. Run [the public schema migration](supabase/migrations/20261015_team_categories.sql), which adds a validated team_category field without modifying existing games or allowances.
3. Create another SQL query and run the separate file **PADEL_ON_PRIVATE_TEAM_ASSIGNMENTS.sql** supplied to PADEL ON management outside this public repository. **Do not upload this private file to GitHub.**
4. Check the resulting counts. If the roster has only the 21 supplied active members, the expected group totals are **Top Team 4, Team 6, Rising Stars 7, Ladies 4**.
5. Reload the PADEL ON website.

The private file maps each existing member to the proper group, expands two previously shortened names without changing their IDs, and adds three missing members. Those three have **weekly allowance 0 (not configured)** until management sets their real allowance.

The migration does **not** alter weekly game counts, add fabricated games, change Nazih's unlimited benefit, modify past matches, or affect monthly financial records. Any counts supplied in a separate message must be reconciled from actual logged games rather than overwriting current database totals.

## Using the website

- **Team Members:** Member cards are grouped by category, with an **All teams** dropdown to filter.
- **Add Member** (administrator): Enter a name, weekly allowance, and select a team category.
- **Settings → Edit Team Member:** Change a member's category and other settings without resetting their records.
- **Reports:** The member category appears as a column and in CSV exports.

Categories describe the **current** classification, including when viewing past weeks or reports. This migration does not store category-change history.

## Safety checks

- Run both SQL files in the same Supabase project used by the website.
- Confirm the expected active member grouping.
- Add one new member with a category and verify the correct section displays it.
- Edit a member's category, confirm the card moves and existing weekly counts remain unchanged.
- Confirm the existing Quick Match, Previous Weeks, Other Benefits, Nazih Matchmaking and Reports pages still work.
- Confirm the original 30-minute inactivity logout and 30-second data refresh remain intact.

If you see a `team_category` database error while saving a member, apply the public schema migration first.
