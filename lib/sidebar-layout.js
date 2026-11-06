// Sidebar state is a visual preference only. No staff or financial information is stored.
export const SIDEBAR_PREFERENCE_KEY='padelon_sidebar_collapsed_v1';
export function readSidebarCollapsed(storage){
 try{return storage?.getItem(SIDEBAR_PREFERENCE_KEY)==='collapsed';}
 catch{return false;}
}
export function storeSidebarCollapsed(storage,collapsed){
 try{storage?.setItem(SIDEBAR_PREFERENCE_KEY,collapsed?'collapsed':'expanded');return true;}
 catch{return false;}
}
export function sidebarToggleLabel(collapsed){return collapsed?'Expand sidebar':'Collapse sidebar';}
