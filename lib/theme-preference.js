// Theme preference is local to the current browser; no Supabase or account settings writes.
export const THEME_KEY='padelon-theme';
export function normalizeTheme(value){return value==='dark'?'dark':'light';}
export function nextTheme(theme){return normalizeTheme(theme)==='dark'?'light':'dark';}
export function readTheme(storage){
 try{return normalizeTheme(storage?.getItem(THEME_KEY));}
 catch{return 'light';}
}
export function writeTheme(storage,theme){
 const safe=normalizeTheme(theme);
 try{storage?.setItem(THEME_KEY,safe);}catch{}
 return safe;
}
export function themeActionLabel(theme){
 return normalizeTheme(theme)==='dark'?'Switch to light mode':'Switch to dark mode';
}
