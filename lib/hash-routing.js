// Hash-only routes work with GitHub Pages and do not expose record identifiers.
export const PAGE_HASHES=Object.freeze({
 dashboard:'overview',
 'cafeteria-finances':'cafeteria-finances',
 'cafeteria-payments':'cafeteria-payments',
 debts:'debts',consignment:'consignment','private-clients':'private-clients',
 team:'team',training:'training',other:'other',finance:'matchmaking',
 tournament:'tournament',activity:'activity',reports:'reports',settings:'settings',
 'order-counter':'order-counter','reem-items':'reem-items'
});
const HASH_TABS=Object.fromEntries(Object.entries(PAGE_HASHES).map(([tab,slug])=>[slug,tab]));
const ALIASES=Object.freeze({
 dashboard:'dashboard','cafeteria-debts':'debts','private-sessions':'private-clients',
 'team-members':'team','monthly-training':'training','other-benefits':'other',
 finance:'finance','tournament-management':'tournament',tournaments:'tournament',
 'game-activity':'activity'
});
export function hashForTab(tab){return '#'+(PAGE_HASHES[tab]||'overview');}
export function tabFromHash(hash){
 const raw=String(hash??'').toLowerCase();
 if(/^#tournament\/(?:new|[a-z0-9][a-z0-9_-]{0,99}(?:\/(?:overview|participants|payments|groups|rounds|rankings|final|activity|settings|exports))?)$/.test(raw))return 'tournament';
 const slug=raw.replace(/^#/,'');
 return Object.hasOwn(HASH_TABS,slug)?HASH_TABS[slug]:
  Object.hasOwn(ALIASES,slug)?ALIASES[slug]:null;
}
export function canAccessTab(tab,role){
 return (role==='staff'||role==='admin')&&Object.hasOwn(PAGE_HASHES,tab)&&
  (tab!=='cafeteria-payments'||role==='admin');
}
export function resolveTabFromHash(hash,role){
 const tab=tabFromHash(hash);
 return canAccessTab(tab,role)?tab:'dashboard';
}
