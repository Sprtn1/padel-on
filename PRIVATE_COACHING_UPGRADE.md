# Private Sessions: staff-only client coaching ledger

This feature is an **empty client ledger**, independent of all weekly team benefits, matchmaking revenue, and monthly Rising Stars training. No clients, sessions, or client balances are included in the GitHub repository.

## Activate in Supabase

1. In your existing PADEL ON Supabase project, open **SQL Editor → New query**.
2. Copy and run [`supabase/migrations/20261016_private_coaching.sql`](supabase/migrations/20261016_private_coaching.sql). This creates the three secured tables and the approved staff RPCs. It does **not** change any existing club ledger.
3. In a second query run the separate **`PADEL_ON_PRIVATE_COACHES_SETUP.sql`**, supplied to management outside this public repository. It populates the coach directory and the A/B/C categories. Do not put that private file into the public repository.
4. Reload PADEL ON, then open **Private Sessions**.
5. Verify that the page shows **zero clients** and an empty history. Create a real client with their actual existing customer ID, if they have one.

**The order is important:** the structure migration must run before the private coach-directory SQL.

## Staff workflow

Both `staff` and `admin` accounts may:

- **Add Client:** Enter a client name, optional existing external client ID, optional contact and notes, and a starting credit/debt. If the ID hasn't been assigned yet, leave it blank. Client IDs are case-insensitively unique.
- **Edit Client:** Update client ID/name/contact/notes and active/inactive status. Starting balance is immutable after creation so staff cannot silently rewrite past cash flow.
- **Record Session:** Choose the client, coaching date (today or a past date), coach, session fee, amount paid at the time, and optional notes. Coach names and A/B/C categories are read from the protected database, not embedded in the public JavaScript.
- **Add Balance:** Record a dated, positive top-up as a separate transaction with optional payment reference. This is useful for prepaid client credit.
- **Review History:** View the client session list, coach, charge, paid amount, top-ups, and balance after each transaction.
- **Export Client CSV:** Download the selected client’s statement. The file contains private information, so store it securely and do not upload it to GitHub.

Only an `admin` account can **void a mistaken financial entry**, and a reason is mandatory. The record stays in the audit log; the voided amount no longer counts in the client balance.

## Client filters and day-by-day session history

The **Private Sessions** page now includes:

- **Show:** All clients or **Owes us only** (clients with a negative credit balance). This filter uses all non-voided coaching transactions.
- **Sort:** Alphabetically by client name or by **Client ID (numeric order)**, so ID `2` is listed before `10` and `100`. Mixed IDs use natural alphanumeric sorting; unassigned IDs appear last. Search and inactive-client controls continue to work.
- **Daily coaching activity:** Defaults to today's date in **Asia/Beirut**. Navigate with previous/next day arrows, a date picker, or previous/next month buttons. Each day of the month is clickable, and session counts are marked on days with activity.
- **Daily totals:** Session count, session charges, money paid **at sessions**, and **separate** balance top-ups. Deposits do not count as coaching sessions.
- **Session details:** Each non-voided session for that date, across all clients, with client name and ID, coach and category, fee, amount paid, and a button to open the client's full account.
- **Historical browsing:** You can view older dates and months without changing any balances or records. Future dates are disabled.

**No extra SQL migration is required:** these views reuse the protected `private_clients`, `private_coaches`, and `private_ledger_entries` tables.

## Meaning of the balance

`Current balance = opening balance + deposits + amounts paid during sessions − session prices`

Example: A client opens with **$50 credit**, attends a session priced at **$35** and pays **$10** at the session. The client balance becomes **$25 credit**. If they later add **$40** to their account, the balance becomes **$65 credit**.

If the result is **negative**, PADEL ON labels it as an amount **owed**. A positive amount is **credit** available toward future sessions.

**Important accounting clarification:** If cash paid on the day should NOT be credited to the client's overall balance in your club's bookkeeping process, adjust the transaction model before daily use. The implementation follows the equation above and displays its meaning directly on the page. No coach fees or prices are assumed automatically.

## Privacy and security

- `private_coaches`, `private_clients`, and `private_ledger_entries` use Supabase RLS.
- Only approved staff/admin accounts may **select** records.
- Client-side database `INSERT`, `UPDATE`, and `DELETE` permissions are revoked. Changes are validated by server-side authenticated Postgres functions.
- Admin corrections are audit logged. Client creation and edits, session recordings, and entry voids also trigger audit records.
- No coach-name seed, actual client contact details, customer IDs, staff credentials, or balances belong in tracked source files.
- The site automatically refreshes active pages and retains the existing authentication and inactivity rules.
- Public GitHub Pages frontend code is still viewable by anyone. Do not treat client-side code or browser storage as a secure secrets store.

## Check before live use

1. Both authorized staff and admin can add a client and save a genuine session.
2. Client ID uniqueness is enforced; an ID can be left empty for clients awaiting assignment.
3. Top-ups increase the balance. Session charges decrease it. Cash paid for sessions increases it.
4. Archived clients retain their history and balance but cannot record new sessions until reactivated.
5. Only admins see the void control; voiding reverses the entry’s balance effect and preserves an audit trail.
6. All approved coach names appear under their correct A/B/C category after the private setup script runs.
7. A non-staff or anonymous user cannot read client records or call any write RPC.
8. The existing team games, special benefits, coaching entitlement, and matchmaking pages still work.

**Live migration status:** GitHub commits do not execute SQL on your Supabase project. Apply both SQL scripts and test with a real staff account before considering the Private Sessions feature operational.
