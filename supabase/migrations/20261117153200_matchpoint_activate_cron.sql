-- Activate native Cron only after Edge deployment and Vault configuration.
-- Named job replacement is idempotent; DB dispatch enforces Beirut slots,
-- pause config, quota and duplicate claims before making an HTTP call.
SELECT cron.schedule(
 'padelon-matchpoint-bookings',
 '0,11,30,41 6-19 * * *',
 'SELECT club_internal.dispatch_matchpoint_sync();'
);
