# PADEL ON — Cafeteria Debts

This is an independent cafeteria credit ledger, separate from **Private Sessions**, team benefits, matchmaking commissions, and monthly training. The public repository includes **no cafeteria customers or financial entries**.

## One-time Supabase setup

1. Select the existing PADEL ON project at [Supabase](https://supabase.com/dashboard).
2. Open **SQL Editor → New query**.
3. Copy the complete [Cafeteria Debts migration](supabase/migrations/20261016_cafeteria_debts.sql), paste, and **Run**. Then apply the [Prepaid Credit upgrade](supabase/migrations/20261016_cafeteria_prepaid_credit.sql) to enable extra payments and customer credit.
4. Reload the site and open **Cafeteria Debts**, directly under **Overview**. The Overview Quick Actions section also has a shortcut.
5. Initially the page should show **zero people, zero outstanding debt, and zero payments**. Add only actual cafeteria customer debt records.

This SQL creates two independent tables, not an extension of `private_clients` or `private_ledger_entries`. Existing data and weekly rules are not modified.

## How to use it

**Add person:** Enter their name, the amount they already owe (can be $0), the starting date, and optional notes. The initial amount becomes a dated debt transaction. This operation is atomic.

**Add debt:** Select an active person, choose the purchase date, enter the amount added to what they owe, and optionally note the purchased items. New charges increase the amount owed.

**Record payment / add credit:** Select an active person, enter any positive amount received (even if they owe nothing), date, and optional payment details. The payment reduces the debt. Any amount above the debt becomes **prepaid customer credit**, which automatically offsets future cafeteria charges. There is no weekly or monthly credit reset.

For example:

| Event | Amount | Outstanding |
| --- | ---: | ---: |
| Cafeteria purchases | $100 | $100 |
| First partial payment | $40 | $60 |
| Second partial payment | $20 | $40 |
| Final payment | $40 | $0 — Paid in full |
| Extra prepaid payment | $11 | $11 credit |
| New cafeteria purchase | $7 | $4 credit |
| Another purchase | $10 | $6 owed |

**Person list:** Search by name and filter to **All people**, **Unpaid**, **Prepaid credit**, or **Paid in full**. The history and account remain available after the balance reaches zero. Each entry stores an occurrence date plus the database recording timestamp. Running totals use the **order of recording**, preserving consistent balances even for backdated purchases.

**Edit person:** Staff may rename an account or change its notes/active status without rewriting financial history. Inactive accounts remain in history and totals but cannot accept additional purchases or payments until reactivated.

**Correct a mistake:** Only admins can **void** an incorrect debt or payment with a reason. Corrections are audited. Voiding a charge can create additional prepaid credit; voiding a payment can reopen a debt. The signed balance is recalculated from all remaining transactions.

**Export statement:** Download a selected person's complete cafeteria statement as CSV. Keep it private and do not upload it to this public repository.

## Accounting formula

`Signed balance = total active debt charges − total active payments`

- Positive signed balance: money still owed to the cafeteria.
- Zero: paid in full.
- Negative signed balance: prepaid credit (`abs(signed balance)`), available to cover future purchases.
- Club-wide **Outstanding debt** totals positive balances only; **Prepaid credit** totals negative balances separately, so the two cannot accidentally cancel one another in summary cards.

There is **no relationship to private coaching credit**, so a client can have a positive coaching account balance and separately owe money to the cafeteria.

## Security

- RLS protects both tables: only approved PADEL ON staff can view records.
- Browser-side table writes are disabled; inserts, edits, payments and corrections happen through server-validated `SECURITY DEFINER` RPC functions with authentication and permission checks.
- Multiple staff payment submissions for the same person are serialized by a database row lock. Payments above the actual balance are rejected, even during concurrent updates.
- Entries are never hard-deleted. Admin voids store who corrected an entry, when and why, and also write an audit record.
- No client names, debt amounts, credentials, or cashier details are included in public SQL.
- The current 6-hour inactivity logout and 30-second refresh are retained.

## Validation before daily use

1. Create a genuine debt account. Confirm the opening debt appears as a transaction.
2. Record a $100 charge and a $40 payment. The account must still show $60 outstanding.
3. Record another $60 payment. Status should change to **Paid in full** and the account should be visible under **All people** and **Paid in full**.
4. Record another charge; the balance should reopen.
5. Pay $11 more than the remaining debt; the account should display **$11 prepaid credit**. A later $7 cafeteria charge should leave **$4 credit**. Verify the credit persists after refreshing the page.
6. Confirm a staff account can add people, debts and payments. Only an admin should be able to void.
7. Confirm the private-coaching client balances and other club records are completely unchanged.
8. Verify the exported CSV agrees with the dashboard balances.

**Deployment note:** GitHub code changes do not automatically create Supabase tables. Until the SQL migration runs in the **same project** used by PADEL ON, the new page will display a setup-needed message instead of pretending records were saved.
