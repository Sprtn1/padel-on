# PADEL ON — Club Operations Tracker

PADEL ON is a private, staff-facing club management application hosted as a static website on GitHub Pages, with authentication, authorization, and stored records handled by Supabase.

**This repository is public.** Its frontend source code, configuration of public API endpoints, migration files, and commit history can be viewed by anyone. **Never commit passwords, confidential club reports, private roster setup scripts, service-role credentials, or reset codes.**

## Features

- Weekly team game benefits and dated game history
- Four configurable team categories, with member search and filters
- Quick match recording and read-only previous-week views
- Separate benefit tracking for special cases
- Matchmaking ledgers, monthly settlements, and reporting by authorized staff
- Monthly training attendance and history
- Downloadable operational reports
- Authenticated staff and administrator workflows

Individual entitlements, commission arrangements, actual member records, and other club policies belong in the private Supabase database and internal management documentation, not this public README.

## Architecture

| Part | Technology | What is public? |
| --- | --- | --- |
| Website | Static HTML, CSS, and JavaScript on GitHub Pages | All deployed frontend code |
| API configuration | `config.js` | Supabase project URL and **publishable** key |
| Identity | Supabase Auth | Sign-in handled by Supabase |
| Data | Supabase PostgreSQL | Access must be restricted with Row-Level Security |
| Restricted operations | Supabase SQL functions and Edge Functions | Source code may be public; credentials must be stored only as server-side secrets |

**A Supabase publishable/anon key is intended for browser use.** It is not an administrator credential. Protect club data with Supabase Row-Level Security (RLS), permissions, and authenticated server-side checks. Do not put a `service_role` key or `sb_secret_` key in `config.js`.

## Getting started

### 1. Database and authentication

1. Create or select the appropriate Supabase project.
2. Review [`supabase/schema.sql`](supabase/schema.sql) and apply the base database schema in **Supabase → SQL Editor**, if setting up a new project. Do not blindly rerun the initial schema on an existing live database.
3. Review and apply only the relevant upgrades from [`supabase/migrations/`](supabase/migrations/), in the documented order. For existing installations, take a database backup first.
4. Load any required **private** initial data and club-specific setup scripts directly into the intended Supabase project. These files must stay outside this repository.
5. Configure Supabase Auth users and map authorized users to staff profiles. Limit administrative access and disable public signups if appropriate.
6. Verify all RLS policies and restricted database functions before recording real club data.

Setup information for specific features is available in the corresponding upgrade guides, but **those documents and all tracked SQL/JavaScript are public**. Keep actual person-specific rules and confidential financial details in private documentation.

### 2. Public browser configuration

Use [`config.js`](config.js) for the Supabase project URL and the project's **publishable** key only. These two values are deliberately visible in browser developer tools.

Never place any of the following in frontend files, migration scripts, documentation, commit messages, or GitHub issues:

- Supabase secret/service-role keys, database passwords, or other privileged access tokens
- Staff account passwords or recovery credentials
- Private reset/management codes
- Confidential financial exports, backup files, or identifiable roster data not intended for publication

### 3. Deploy restricted functions

The server-side reset function is located at [`supabase/functions/reset-weekly/index.ts`](supabase/functions/reset-weekly/index.ts). Configure its required environment variables and secrets **inside Supabase**, not in source control. Deploy it using your established Supabase CLI or dashboard workflow and test that the authorization checks reject non-admin users.

### 4. Host with GitHub Pages

1. Publish the website assets in this repository to a branch configured for GitHub Pages.
2. In **Repository → Settings → Pages**, select the appropriate branch and root directory.
3. Wait for deployment, then open the hosted website.
4. Sign in with an authorized account and verify API access, role restrictions, and a genuine record from a test environment or approved workflow.

The frontend uses relative asset URLs and can be served from a GitHub Pages project path or a configured custom domain. **GitHub Pages does not make the JavaScript private; the database must enforce access.**

## Operational checks

Before relying on the app for day-to-day operations, verify that only approved users can view or change club data, that server-side validation prevents duplicate or unauthorized benefit usage, that changes are audited, that reports correspond to stored records, and that database backups and restore procedures work.

The automated tests are intended to check application logic; they are not a substitute for testing the deployed Supabase policies. If Node.js is available, run `npm test`.

## Repository safety

A [`.gitignore`](.gitignore) is included to help avoid accidentally staging local secrets, exports, private SQL scripts, and backups **with Git**. It does not remove files already committed, hide public webpage assets, or prevent manual uploads through the GitHub website. Review every staged file before committing:

```bash
git status --short
git diff --cached --name-only
```

If an actual credential is ever committed, **revoke or rotate it immediately**. Deleting or editing the file is not sufficient because Git history, forks, and cached copies may still contain it.

## Source layout

```text
index.html                    Website entry point
app.js                        Application views and interaction
styles.css                    Responsive styling
config.js                     PUBLIC Supabase URL and publishable key
lib/                          Client, dates, and business logic
assets/                       Website branding and icons
supabase/schema.sql           Public database schema and RLS
supabase/migrations/          Public structural upgrades
supabase/functions/           Server-side function source (no secrets)
tests/                        Automated application tests
```

For deployment details and feature upgrade instructions, review the public technical guides in this repository. Keep private club-specific setup and operational documents in a separate access-controlled location.
