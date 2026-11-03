// Shared navigation metadata and accessible, unambiguous mobile labels.
export const tabs=[['dashboard','Overview','grid'],['cafeteria-finances','Cafeteria Finances','coins'],['debts','Cafeteria Debts','wallet'],['private-clients','Private Sessions','users'],['team','Team Members','users'],['training','Monthly Training','calendar'],['other','Other Benefits','gift'],['finance','Matchmaking','wallet'],['tournament','Tournament Management','activity'],['activity','Game Activity','list'],['reports','Reports','download'],['settings','Settings','settings']];
export const MOBILE_NAV_LABELS=Object.freeze({
  'dashboard':'Overview',
  'cafeteria-finances':'Finances',
  'debts':'Debts',
  'private-clients':'Sessions',
  'team':'Team',
  'training':'Training',
  'other':'Benefits',
  'finance':'Matchmaking',
  'tournament':'Tournaments',
  'activity':'Activity',
  'reports':'Reports',
  'settings':'Settings'
});
export function renderNavigation(activeTab,icon,mobile=false){
 const visible=tabs.filter(([key])=>!mobile||key!=='settings');
 return visible.map(([key,title,ico])=>{
  const label=mobile?(MOBILE_NAV_LABELS[key]||title):title;
  const current=activeTab===key;
  return `<button class="${mobile?'mobile-nav':'nav-item'} ${current?'active':''}" data-tab="${key}" aria-label="${title}" aria-current="${current?'page':'false'}">${icon(ico)}<span>${label}</span></button>`;
 }).join('');
}
