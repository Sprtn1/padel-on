# Admin account removal — Private Sessions and Cafeteria

PADEL ON now offers **Remove Account** and **Restore Account** options inside **Settings**, visible only to users whose staff role is `admin`.

## Required Supabase migration

In the **existing PADEL ON Supabase project**:

1. Back up your database first.
2. Ensure both the Private Coaching and Cafeteria Debts base migrations have already been applied. If using cafeteria prepaid credit, apply that migration before this one.
3. In **Supabase → SQL Editor → New query**, run the complete [admin account removal migration](supabase/migrations/20261016_admin_account_removal.sql).
4. Reload PADEL ON, sign in as an admin, open **Settings**, and find the **Private Sessions accounts** and **Cafeteria accounts** sections.

The migration uses non-destructive schema changes and authenticated functions. It **does not delete any existing client, person, session, purchase, or payment records**. Your existing history stays intact.

## How removal works

This is a **reversible soft removal**, not a permanent database erasure.

- Choose an account from the dropdown in Settings. Both active and previously removed accounts are visible there to admins.
- The **Remove** button is enabled only when the account's **signed balance equals $0.00**.
- Confirm removal by typing the exact account name and entering a reason of at least four characters.
- After removal, the account disappears from the ordinary Private Sessions or Cafeteria people list, including their inactive filter. Financial history and assigned client ID are kept.
- Restoring the account from Settings reactivates it and returns the full history. Removal and restoration are recorded in the audit log.
- Staff cannot invoke removal or restoration. The database functions independently enforce admin authorization.
- A removed client cannot receive another private session, top-up, cafeteria purchase, or payment until restored.

The zero-balance rule prevents accidentally hiding open debts or prepaid credit. Private Sessions balances use **opening balance + deposits + amounts paid − session fees**. Cafeteria balances use **purchases − payments**, so a prepaid-credit balance is negative and cannot be removed either.

**Unique client IDs remain reserved** even when an account is removed. This prevents assigning a previously used ID to another client.

## Existing features

This migration doesn't change team-game benefits, matchmaking, Rising Stars training, or their associated database tables. The three text-only changes are also included:

- Removed "Including Nazih Sonbol" under Active Team Members.
- Removed the Private Sessions comparison sentence from the Cafeteria Debts page.
- Removed the introductory "Read-only reports from saved Supabase records." sentence from Reports.

## Suggested checks

1. Admin Settings shows both account-management panels; staff Settings does not.
2. An account owing money cannot be removed; an account with positive prepaid credit cannot be removed.
3. A zero-balance account can be removed after typed-name confirmation and a reason.
4. The removed account disappears from the operating client list.
5. Its historical entries remain stored; restoring shows the same customer ID and ledger.
6. Another staff user cannot create entries against a removed account, even by sending database requests directly.
7. Staff cannot invoke the removal RPC directly.
8. Other club pages continue to load normally.

No live Supabase migration or browser-based integration tests are executed by these GitHub commits. Apply the migration and verify these steps with an authorized test account.
