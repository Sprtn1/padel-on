# Padel On — daily encrypted backups to Google Drive

The daily GitHub Actions workflow is prepared, but **does not run successfully until you add the required GitHub Secrets**. Missing credentials produce a failed run, not a fake successful backup.

## Daily backup layout

At **03:17 Asia/Beirut time**, the workflow writes one dated folder to the private [Google Drive backup folder](https://drive.google.com/drive/folders/1GaSNJSDIy0P3oivx1OHldFO6lZJz_TnI):

- `database.dump.gpg`: all Postgres database tables and schema, including the empty definition of `public.audit_logs`, but **excluding audit-log rows**.
- `audit_logs.dump.gpg`: data-only backup of `public.audit_logs`.

Both are separate PostgreSQL 17 custom-format dumps encrypted with AES-256 GPG. Each file is checked by a local encryption/decryption round-trip and a matching Google Drive MD5 hash after upload. A failed dump, encryption, or upload aborts cleanup.

**Retention:** Keep the three most recent successful dated backup sets (up to six encrypted files in three folders). Rotate older sets only after the new pair is verified. Files outside the dated backup folders are never touched.

## Weekly audit reset

On Monday, after verified upload of **both** files, the workflow can delete audit entries from before the start of that Monday in Beirut. It verifies the old-row count and ID digest before export and again within a locked SQL transaction immediately before deletion. If the records changed, deletion aborts. Other database tables are never deleted.

Cleanup is **off by default**. Enable only after restoring a backup successfully into a test database by setting the GitHub Actions **repository variable** `ENABLE_AUDIT_PRUNE=true`. Routine `VACUUM` makes deleted storage reusable but does not guarantee an immediate reduction of database disk usage.

**Important:** With only three daily backup sets retained, old audit history can disappear from *all* copies approximately three days after the weekly reset. This is the retention trade-off you approved; these backups are not a long-term compliance archive.

## One-time setup (never paste credentials into chat or commit them)

1. In the [Supabase project's Connect panel](https://supabase.com/dashboard/project/qonscbdbawmvhcdfcvlo), copy the Postgres **session pooler** connection URL on **port 5432**. Use that URL as the GitHub Actions Secret `SUPABASE_DB_URL`. GitHub runners are commonly IPv4-only; don't use port 6543 transaction mode.
2. On your own computer, install [rclone](https://rclone.org/downloads/). Create a Google Drive OAuth app/client ID and configure a remote named **`padelon`** with the *same Google account* that owns the Drive backup folder. Set `type = drive`, `scope = drive`, your OAuth `client_id`, `client_secret`, and a refreshable `token`. Run `rclone config file` to locate the config, then save the file's contents (including the `[padelon]` section) as GitHub Actions Secret `GDRIVE_RCLONE_CONFIG`. Using your own Google OAuth client is important because the old shared rclone client is being retired.
3. Generate a strong, unique encryption passphrase, **save it offline** in your password manager, and set GitHub Actions Secret `PADELON_BACKUP_PASSPHRASE`. If this secret is lost, existing backups cannot be decrypted.
4. Set the three secrets in [GitHub > Repository Settings > Secrets and variables > Actions](https://github.com/Sprtn1/padel-on/settings/secrets/actions).
5. In [GitHub Actions](https://github.com/Sprtn1/padel-on/actions), open **Daily database backups to Google Drive** and select **Run workflow** once. Verify the new dated folder contains both encrypted files, and restore them into an isolated test database before enabling audit pruning.

## Restore into a TEST database

Download both encrypted files from the **same** dated folder. Use the stored passphrase:

```bash
gpg --decrypt --output database.dump database.dump.gpg
gpg --decrypt --output audit_logs.dump audit_logs.dump.gpg
pg_restore --list database.dump
pg_restore --list audit_logs.dump
# Review and use a separate test database, never production by default:
pg_restore --dbname="$NEW_TEST_DATABASE_URL" --no-owner --no-acl database.dump
pg_restore --dbname="$NEW_TEST_DATABASE_URL" --data-only --no-owner --no-acl audit_logs.dump
```

A logical PostgreSQL dump does not capture Google Drive permissions, Supabase API keys, database-role passwords, or Storage object bytes. Restoring managed Supabase schemas might require a Supabase-specific restore sequence. These limits should be tested before relying on this for disaster recovery.
