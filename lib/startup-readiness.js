// The startup splash describes first initialization, not tab navigation or data refresh.
// Keep only a non-sensitive in-tab marker. Never store auth or rendered app HTML here.
export const STARTUP_READY_KEY='padelon_startup_ready_v1';
export function wasAppReadyInThisTab(storage){
 try{return storage?.getItem(STARTUP_READY_KEY)==='1'}catch{return false}
}
export function noteAppReadyInThisTab(storage){
 try{storage?.setItem(STARTUP_READY_KEY,'1')}catch{}
}
