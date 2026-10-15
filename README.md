## Multi-person matchmaking and commissions

The Matchmaking page now has a switchable per-person revenue ledger, independent monthly commissions, settlement statuses, CSV exports, and a per-person breakdown in Reports → Monthly. A one-time database migration plus separate private personnel setup are required. Follow [MULTI_MATCHMAKER_UPGRADE.md](MULTI_MATCHMAKER_UPGRADE.md). All existing Nazih records and previous paid/unpaid settlements are retained.

## Monthly training with Coach Khalil

PADEL ON now has a **Monthly Training** page for Rising Stars. It records two-player (or reasoned solo-exception) completed sessions, one free session per member per month, previous months, and attendance CSV reports. **Run the new Supabase migration first:** see [MONTHLY_TRAINING_UPGRADE.md](MONTHLY_TRAINING_UPGRADE.md). All existing weekly counters and finances are independent.

## Team categories (Top / Team / Rising Stars / Ladies)

The Team Members page now groups players into four categories and lets administrators assign categories when adding or editing members. To activate this against an existing Supabase database, run the structural SQL migration and then the separate private roster assignment script. Details: [TEAM_CATEGORIES_UPGRADE.md](TEAM_CATEGORIES_UPGRADE.md). The **private** script should not be uploaded to GitHub.

## New features: Quick Match, Previous Weeks, Reports

For the four-player Quick Match, browseable previous weeks, and CSV/printable reports, see **[FEATURE_UPGRADE.md](FEATURE_UPGRADE.md)**. **Required:** run [supabase/migrations/20261015_quick_match.sql](supabase/migrations/20261015_quick_match.sql) once in your PADEL ON project's Supabase SQL Editor before using Quick Match. The old Manual Entry function and records remain intact.

# PADEL ON · Team Games Tracker

A real database-backed management site for **PADEL ON**. Host the website on **GitHub Pages** and use **Supabase** for logins, player records, benefit tracking, matchmaking revenue, and protected counter resets.

**No Node.js build, paid Lovable subscription, or Canva is required.** The GitHub-hosted files are a static frontend. Database storage and all security-sensitive operations run in Supabase. The site must not be considered ready for business use until Supabase setup and real-device tests are complete.

## What it does

- **18 team members** loaded using the separate PRIVATE initial-data SQL file, with opening balances and configured allowances.
- Records **free or half-price** team games, including up to 4 team members in a match. A normal member consumes one weekly benefit per qualifying game. Nazih may only be recorded as *free* and has no limit.
- **Monday–Sunday Asia/Beirut weekly counters**, recalculated from dated records rather than erasing history.
- **Other Benefits**: Haidar (counter 1, rule pending), Rami (counter 4; one paid game until next free), Bassem Kaadan (needs confirmation), Zainab (next game free).
- **Nazih permanent financial ledger** with each game, monthly revenue, 15% commission on the **monthly total**, months navigation, adjustments via edit or soft delete, paid/unpaid settlements and CSV export.
- Game activity page showing the **past 30 days** while retaining the database history.
- **Email/password Supabase staff authentication** with separate `staff` and `admin` access.
- **Secure manual reset** with a management code stored privately in the Edge Function secret `RESET_CODE`; wrong attempts are rate-limited and successful resets are audited. The code is never placed into website files.
- Cross-device shared data; the site refreshes from the database roughly every 30 seconds while open (and when coming back into view).

> Original PADEL ON logo: `assets/logo.svg` contains a replacement text mark. Replace it with your real Canva-exported SVG of the same filename, or edit the `<img>` references to use a PNG.

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) and create a project.
2. In **SQL Editor**, create a query, paste the entire contents of [`supabase/schema.sql`](supabase/schema.sql), and **Run**.
3. **Load the private initial data:** In the same Supabase SQL Editor, create a second query and paste/run the separately downloaded `PADEL_ON_PRIVATE_INITIAL_DATA.sql`. **Do not upload that file to GitHub or put it inside the website directory.** Initial values apply to the week when the private SQL is run; they are not re-added on later app loads.
4. **Run initial data only once for setup.** Weekly resets already happen by date.
5. Go to **Authentication → Providers** and enable Email (password) sign-in.
6. For a private staff application, disable public signups. In **Authentication → Users**, add a staff user with an email address and password or an invitation. Follow Supabase's email confirmation instructions if applicable.
7. Back in the **SQL Editor**, grant an administrator role by replacing the email in the following query:

```sql
insert into public.staff_profiles(id, email, role)
select id, email, 'admin' from auth.users
where lower(email)=lower('your-email@example.com')
on conflict (id) do update set role='admin';
```

If the query inserts **zero rows**, your account hasn't been created in **Authentication → Users** yet. You cannot use the website until a matching staff profile exists.

For additional staff accounts, create the Auth user and run the same SQL with `'staff'` instead of `'admin'`. Staff can record/correct games and revenue; admins can also edit rosters, record payments, and reset counters.

**Supabase Auth is the identity provider.** Database policies deny unauthorized visitors access to club tables, regardless of GitHub Pages being public.

## 2. Configure the website

1. Supabase dashboard → **Project Settings → Data API**, copy **Project URL** (like `https://xyz.supabase.co`).
2. Supabase dashboard → **Project Settings → API Keys**, copy the **publishable key** (or legacy `anon` public key).
3. Open [`config.js`](config.js) and replace:

```js
export const SUPABASE_URL = 'https://YOUR_PROJECT_REF.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_YOUR_VALUE';
```

**This is a public frontend key, not a secret.** The RLS policies protect data. **Never** paste a Supabase `service_role` key, secret API key, database password, or the reset code here or anywhere in GitHub.

4. Optional: replace [`assets/logo.svg`](assets/logo.svg) with your original PADEL ON logo.

## 3. Set up secure reset verification

This is the **only** step requiring the Supabase CLI. The Edge Function is in [`supabase/functions/reset-weekly/index.ts`](supabase/functions/reset-weekly/index.ts).

Install [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) using one of Supabase's supported installation methods, then in a terminal in the project directory:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set RESET_CODE=YOUR_PRIVATE_RESET_CODE
supabase functions deploy reset-weekly
```

Supabase automatically provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as protected function environment variables. Never put the service-role key into the browser or repository.

In Supabase **Edge Functions**, verify that `reset-weekly` is deployed and JWT verification is enabled where supported. The function **also independently verifies the user's access token and admin role**.

After deployment, an administrator can reset one or all standard team members from **Settings**. Five incorrect reset attempts per 15-minute window are blocked. If the Edge Function is not deployed, reset buttons will display an error rather than pretend to work.

## 4. Publish the website to GitHub Pages

1. Create a **public** GitHub repository, for example `padel-on-team-tracker`.
2. Upload **all project files and folders** from this directory into the repository **root** (not the ZIP itself). GitHub's **Add file → Upload files** feature accepts drag-and-drop files; for directories, drag the extracted project contents or use git.
3. Commit the files to the default `main` branch.
4. Go to **Repository → Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**; choose `main` and `/ (root)`; press **Save**.
6. Wait for Pages deployment. Open the generated URL, typically `https://YOUR_USERNAME.github.io/padel-on-team-tracker/`.
7. Log in using the Supabase staff account created earlier.

The `.nojekyll` file prevents unwanted Jekyll processing. All paths are relative, so GitHub Pages project URLs work without a build. **Do not upload any `.env`, database passwords, or private API keys to GitHub.**

If you choose to use a custom domain, update GitHub Pages settings accordingly. The entire application still uses relative asset paths.

## 5. Test before club use

1. Sign in as admin; confirm 18 team members and four special players are present.
2. Check that your members and weekly opening balances match the separately loaded private initial data during the setup week.
3. Record one free game for a member with remaining benefits; refresh and verify the counter decreases correctly.
4. Open the website on a **second device** using an authorized staff login; confirm the new game appears after refresh.
5. Record a team match involving two team members: both should be decremented atomically.
6. Record a paid game for Rami: his counter becomes 5 and his status becomes **Next Game Free**. Record that free game; his status becomes **Needs Confirmation**, with no invented repeating cycle.
7. Enter $40 and $60 for Nazih in the same month: total revenue should become **$100**, commission **$15**. Move one record to a different month and confirm both months update.
8. Verify unpaid/paid settlement controls (admin only).
9. Attempt a reset with a wrong code; it must fail. Enter the backend-configured management code; the counter should reset without deleting old game entries or Nazih's financial ledger.
10. At the next Monday in Beirut, the dashboard starts the new weekly allowance automatically. Historic records remain in the DB.

## Local preview

No package installation is required. If Python is installed, start a simple server in the project folder:

```bash
python3 -m http.server 8080
```

Visit [http://localhost:8080](http://localhost:8080). The page requires working Supabase credentials and staff access to show the management dashboard.

If Node.js is available, run the unit tests without installing dependencies:

```bash
npm test
```

## Security and operational notes

- **Do not publish sensitive details in the GitHub repository.** The initial member names are in the separate `PADEL_ON_PRIVATE_INITIAL_DATA.sql` file, which must **never** be uploaded to the public GitHub repository. The public website JavaScript still contains some static section labels (including the matchmaking section name), so it is not a fully secret website; Supabase RLS must protect the actual database records.
- Do not include the reset code in any public repository or issue. Consider using a stronger, randomly generated secret for real financial operations. Change it through `supabase secrets set RESET_CODE=...`, not the browser.
- Only staff accounts approved in `staff_profiles` can read club data; the email/password login itself is not sufficient without authorization.
- Game activity is shown for 30 days. Historical rows remain archived for auditability; they are **not physically deleted** after 30 days.
- Financial deletions are soft deletes, and database triggers record a before/after audit trail. Historical financial records remain available until explicitly edited or deleted.
- Commission is calculated as `round(sum(amount_cents) * 0.15)`; individual per-game amounts shown in the UI are informational and their rounded sum might differ by a cent from the monthly commission.
- Financial records are stored in whole USD cents; no floating-point money errors.
- There is no automatic money transfer, payment gateway, court booking, or client invoices.
- Supabase and GitHub Pages usage is subject to the providers' current free-tier limits and inactivity policies. Configure backups if club data is valuable.
- Staff should use distinct accounts; do not share one administrator password.

## Project files

```
index.html                 Entry point
styles.css                 Full mobile-first design
app.js                     Pages, forms, navigation and logic
config.js                  Public Supabase URL + publishable key
assets/logo.svg            Replaceable PADEL ON logo
assets/favicon.svg         Browser icon
lib/api.js                 Supabase REST/Auth/Functions client
lib/date.js                Beirut calendar and exact currency helpers
lib/logic.js               Weekly counters and monthly commission math
supabase/schema.sql        Tables, RLS, atomic RPCs, audit triggers (no private roster)
supabase/functions/reset-weekly/index.ts  Server-side reset authorization
package.json               Dependency-free test runner
.nojekyll                  GitHub Pages support
```
