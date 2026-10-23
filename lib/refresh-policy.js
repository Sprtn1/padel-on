// PADEL ON automatic refresh cadence. This controls network reads only;
// inactivity checks, manual Refresh, navigation and post-save reloads remain independent.
export const PAGE_REFRESH_INTERVALS_MS=Object.freeze({
 'cafeteria-finances':90_000,
 'tournament':60_000,
 'dashboard':120_000,
 'private-clients':120_000,
 'debts':120_000,
 'team':300_000,
 'training':300_000,
 'other':300_000,
 'matchmaking':300_000,
 'reports':300_000,
 'settings':300_000,
 'order-counter':300_000,
 'reem-items':300_000
});
export function pageRefreshIntervalMs(tab){
 return PAGE_REFRESH_INTERVALS_MS[tab]??300_000;
}
export function isPageRefreshDue(tab,lastRefreshAt,now){
 return Number.isFinite(now)&&Number.isFinite(lastRefreshAt)&&
  now-lastRefreshAt>=pageRefreshIntervalMs(tab);
}
