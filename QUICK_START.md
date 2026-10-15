# Launch PADEL ON — quick checklist

The website is ready as source code. It will not save real records until you connect your own Supabase project.

1. **Create Supabase account/project:** https://supabase.com
2. **Create tables:** SQL Editor → paste/run `supabase/schema.sql`.
3. **Load private initial players:** Download `PADEL_ON_PRIVATE_INITIAL_DATA.sql` separately. Paste/run it as a second query in Supabase SQL Editor. Never upload this private file to GitHub.
4. **Create your login:** Supabase Authentication → Users → Add user. Then SQL Editor → run the `staff_profiles` admin authorization query from README.md using your actual email.
5. **Connect the website:** Replace the two placeholders in `config.js` with Supabase's project URL and PUBLIC publishable key. NEVER use a private key.
6. **Create a GitHub repo:** Create public repo `padel-on-team-tracker`, upload the contents of this folder to its root, and commit.
7. **Enable GitHub Pages:** Repository Settings → Pages → Deploy from branch → `main` → `/(root)` → Save.
8. **Open the site:** GitHub will display the site URL. Sign in and record a test game. Verify it survives a refresh and shows on a second device.
9. **Enable protected resets:** Deploy the Supabase Edge Function and privately set RESET_CODE to your chosen management code as described in README.md.

Do NOT upload the ZIP as the repository's only file. Extract it first and upload the files and subfolders. Replace `assets/logo.svg` with your genuine PADEL ON logo if you want the exact branding.

**Important:** The original Canva design's source code could not be extracted, so this is an independent recreation in the same green/white/black style, not an exact code copy.

**Verification status:** Static JS syntax checks and five automated business-logic tests passed in the development environment. Live Supabase authentication, migrations, Edge Function deployment, and multi-device operations still require your credentials and cannot be certified until you configure and test them.

**Privacy warning:** Do not put `PADEL_ON_PRIVATE_INITIAL_DATA.sql`, passwords, reset code, or admin service keys in the public GitHub repository. The repository contains only the frontend and non-personal database schema.
