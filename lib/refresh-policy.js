// All PADEL ON page data refreshes on a single 30-second schedule.
// Refresh fetches are skipped while a form is being edited or the tab is hidden.
// Manual refresh, navigation and post-save reloads remain independent.
export const AUTO_REFRESH_INTERVAL_MS=30_000;
export const PAGE_REFRESH_INTERVALS_MS=Object.freeze({
 'dashboard':AUTO_REFRESH_INTERVAL_MS,
 'cafeteria-finances':AUTO_REFRESH_INTERVAL_MS,
 'debts':AUTO_REFRESH_INTERVAL_MS,
 'private-clients':AUTO_REFRESH_INTERVAL_MS,
 'team':AUTO_REFRESH_INTERVAL_MS,
 'training':AUTO_REFRESH_INTERVAL_MS,
 'other':AUTO_REFRESH_INTERVAL_MS,
 'finance':AUTO_REFRESH_INTERVAL_MS,
 'tournament':AUTO_REFRESH_INTERVAL_MS,
 'activity':AUTO_REFRESH_INTERVAL_MS,
 'reports':AUTO_REFRESH_INTERVAL_MS,
 'settings':AUTO_REFRESH_INTERVAL_MS,
 'order-counter':AUTO_REFRESH_INTERVAL_MS,
 'reem-items':AUTO_REFRESH_INTERVAL_MS
});
export function pageRefreshIntervalMs(tab){
 return PAGE_REFRESH_INTERVALS_MS[tab]??AUTO_REFRESH_INTERVAL_MS;
}
export function isPageRefreshDue(tab,lastRefreshAt,now){
 return Number.isFinite(now)&&Number.isFinite(lastRefreshAt)&&
  now-lastRefreshAt>=pageRefreshIntervalMs(tab);
}
