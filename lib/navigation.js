// Shared navigation metadata and accessible, unambiguous mobile labels.
export const tabs=[['dashboard','Overview','grid'],['court-timetable','Court Timetable','calendar'],['cafeteria-finances','Cafeteria Finances','coins'],['cafeteria-payments','Cafeteria Payments & To Do List','wallet'],['debts','Cafeteria Debts','wallet'],['consignment','Consignment Inventory','package'],['private-clients','Private Sessions','users'],['team','Team Members','users'],['training','Monthly Training','calendar'],['other','Other Benefits','gift'],['finance','Matchmaking','wallet'],['tournament','Tournament Management','activity'],['activity','Game Activity','list'],['reports','Reports','download'],['settings','Settings','settings']];
export const MOBILE_NAV_LABELS=Object.freeze({
  'dashboard':'Overview',
  'court-timetable':'Courts',
  'cafeteria-finances':'Finances',
  'cafeteria-payments':'Payments & To Do',
  'debts':'Debts',
  'consignment':'Consignment',
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
// Group the existing tabs without changing their IDs, routes, permissions or order.
export const NAV_SECTIONS=Object.freeze([
 Object.freeze({id:'core',label:'Core Operations',tabs:Object.freeze(['dashboard','court-timetable'])}),
 Object.freeze({id:'facility',label:'Facility & Services',tabs:Object.freeze(['cafeteria-finances','cafeteria-payments','debts','consignment','private-clients'])}),
 Object.freeze({id:'people',label:'People & Training',tabs:Object.freeze(['team','training','other'])}),
 Object.freeze({id:'competition',label:'Competition & Activity',tabs:Object.freeze(['finance','tournament','activity'])}),
 Object.freeze({id:'system',label:'Management & System',tabs:Object.freeze(['reports','settings'])})
]);
export function navSectionForTab(tab){return NAV_SECTIONS.find(section=>section.tabs.includes(tab))||null;}
export function renderNavigation(activeTab,icon,mobile=false,isAdmin=false,scope=mobile?'mobile':'desktop'){
 const visible=tabs.filter(([key])=>(isAdmin||key!=='cafeteria-payments')&&(!mobile||key!=='settings'));
 const byKey=new Map(visible.map(tab=>[tab[0],tab]));
 return NAV_SECTIONS.map(section=>{
  const items=section.tabs.map(key=>byKey.get(key)).filter(Boolean);
  if(!items.length)return '';
  const active=items.some(([key])=>key===activeTab);
  const headerId='po-nav-'+section.id+'-'+scope;
  const links=items.map(([key,title,ico])=>{
   const label=mobile?(MOBILE_NAV_LABELS[key]||title):title;
   const current=activeTab===key;
   return `<button class="${mobile?'mobile-nav':'nav-item'} ${current?'active':''}" data-tab="${key}" aria-label="${title}" aria-current="${current?'page':'false'}"${mobile?'':` title="${title}"`}>${icon(ico)}<span>${label}</span></button>`;
  }).join('');
  return `<section class="po-nav-section ${active?'po-nav-section-active':''}" aria-labelledby="${headerId}"><h2 class="po-nav-heading" id="${headerId}">${section.label}</h2><div class="po-nav-items">${links}</div></section>`;
 }).join('');
}
