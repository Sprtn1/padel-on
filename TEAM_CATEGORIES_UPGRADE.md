# PADEL ON — Team categories setup

## One-time Supabase migration required

After deploying the GitHub code, open your **existing PADEL ON Supabase project → SQL Editor → New query**.

Copy and run all of:

[supabase/migrations/20261015_team_categories.sql](supabase/migrations/20261015_team_categories.sql)

This migration is safe to rerun; it adds the category field, classifies the existing roster, and inserts missing members **without deleting or replacing game records, resetting counters, or changing existing allowances**.

It preserves the `Nazih Sonbol` unlimited-free-game exception in the live system.

## Category assignments

| Group | Members |
|---|---|
| Top Team | Rami Alayli, Bahaa Hariri, Ghaleb Antar, Karim Badih |
| Team | Bassem Baba, Yahia Hariri, Ibrahim Kaakour, Mhmd Ali Masri, Nazih Sonbol, Hamza Kubrosli |
| Rising Stars Team | Afif Moati, Waddah Fakhry, Mhmd Bizri, Ahmad Bizri, Ali Farhat, Taym, Hasan Abou El Aynan |
| Ladies Team | Reem Antar, Maya Kawas, Ghina Arnaout, Jana Fakhry |

Expected totals: 4 + 6 + 7 + 4 = **21 active members**, assuming your database has no other active members.

The initial seed only adds missing **Rami Alayli**, **Bahaa Hariri**, and **Hamza Kubrosli**. Since their benefit entitlements were not specified, each starts with **weekly allowance 0 (not configured)**, not an invented entitlement. Admins must edit the allowance before recording their regular benefits.

Two previously abbreviated names are expanded: **Ghaleb → Ghaleb Antar** and **Waddah → Waddah Fakhry**. Their stable IDs and game histories are preserved.

## Website controls

1. Go to **Team Members** to see players grouped under Top Team, Team, Rising Stars Team, and Ladies Team.
2. Use the **All teams** dropdown to focus on a single category.
3. To add a member, choose **Add Member** on the current-week Team Members page (administrator only), fill their name and weekly allowance, and choose a **Team category**.
4. To update an existing member, go to **Settings → Edit Team Member**. You can change their category without affecting their historical game entries.
5. **Reports** now include category labels in the table and CSV export.

## What the migration intentionally does not do

The supplied list includes updated 'played' counts for some people. These are **not imported** or used to replace today's actual records because doing so could double-count or erase games already recorded in Supabase. The existing weekly counters remain the source of truth.

The new categories are stored as a member's **current** category. An earlier historical report will show their current category if they are moved later; dated category-change history is not included in this migration.

A category does not itself change a member's eligibility; free/half-price behavior and the existing matchmaking rules remain unchanged.

## Validation checklist

- SQL finishes without error.
- The verification query returns 4 Top Team, 6 Team, 7 Rising Stars Team and 4 Ladies Team (if no other active members).
- A new member can be added with a category selected, and appears in that section.
- Editing a member's category moves their card without resetting the weekly counter.
- Ghaleb and Waddah display expanded names.
- Rami Alayli, Bahaa Hariri and Hamza Kubrosli show 'Allowance not set' until configured.
- Previous Weeks, Quick Match, Reports, other benefit players, and Nazih's financial history still work.

If editing a member returns an error about `team_category`, the migration has not yet been executed on the Supabase project used by the deployed website.
