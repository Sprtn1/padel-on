# Alternating Free / Paid Game Benefits

## What changed

The Other Benefits section supports an additional selectable rule: **Alternating: Free Game, Paid Game**.

For a player using this rule, the next game is automatically determined from the **current counter**. With a counter of 0, the next game is **Free**; with 1, it is **Paid**; with 2, **Free** again, and so on. Every successfully recorded game increases the counter by exactly one. The counter is not reset weekly or monthly.

The Record Game form displays the required type without allowing a manual type override. The Supabase `record_other_game` function independently enforces that type, checks the current counter under a database row lock, and rejects out-of-turn requests. This prevents simultaneous staff submissions from recording the same free turn twice.

Other benefit policies, including existing threshold/counted-paid-game policies, retain their previous behavior.

## Activate it

1. In the existing PADEL ON Supabase project, run the [structural alternating-benefit migration](supabase/migrations/20261016_alternating_other_benefits.sql) in **SQL Editor**.
2. Separately, run the *private player assignment script* provided to club management (`PADEL_ON_PRIVATE_BASSEM_ALTERNATING_SETUP.sql`). This changes the specified player's benefit status without placing their identifying information in the public GitHub repository.
3. Reload PADEL ON → **Other Benefits**. Verify the specified player's status is **Next Game Free** and their counter is 0.
4. Click **Record Game**. Confirm the first is automatically Free; after recording, the next will be Paid, then Free, and so forth.

For any other player, administrators may select this rule using **Other Benefits → Edit player → Eligibility status**. The field **Game counter** represents *games under the alternating policy*, not the old paid-games-only counter. Set counter 0 to start with a free game, or 1 to start with a paid game. Review history before changing an existing nonzero counter; selecting the rule does not erase previous saved games.

The private assignment script intentionally refuses to automatically change a nonzero counter, rather than silently losing the current counter meaning. Existing historical game rows remain untouched.

## Security and operational notes

- Do not commit private player assignment SQL to GitHub.
- The new allowed status is backed by a PostgreSQL constraint.
- The server enforces the Free/Paid sequence, including concurrent submissions.
- A retried identical game ID cannot advance the counter twice.
- The existing Other Benefits staff/admin permissions continue to apply.
- Applying GitHub code updates alone does **not** run migrations in your live Supabase project.

### Recommended verification

Confirm that the expected sequence for counters 0, 1, 2, 3 is Free, Paid, Free, Paid; that a staff user cannot manually force a Free game during a Paid turn; and that the original benefits continue to operate. No live Supabase migration was executed as part of the GitHub commit.
