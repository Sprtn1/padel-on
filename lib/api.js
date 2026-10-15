import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '../config.js';
const STORE='padelon_auth_v1';
export const configured = /^https:\/\/[^\s]+\.supabase\.co\/?$/.test(SUPABASE_URL) && !SUPABASE_PUBLISHABLE_KEY.startsWith('YOUR_');
const base=SUPABASE_URL.replace(/\/$/,'');
let session=null;
try{session=JSON.parse(localStorage.getItem(STORE)||'null')}catch{session=null}
let pendingRefresh=null;
function store(s){session=s; if(s)localStorage.setItem(STORE,JSON.stringify(s));else localStorage.removeItem(STORE);}
function errorText(response,body){return body?.message||body?.error_description||body?.msg||body?.error||`Request failed (${response.status})`}
async function fetchJSON(url,options={}){
 let r;try{r=await fetch(url,options)}catch{throw Error('Network error. Check your internet connection.');}
 const raw=await r.text();let body;try{body=raw?JSON.parse(raw):null}catch{body={message:raw}}
 if(!r.ok)throw Error(errorText(r,body));return body;
}
export function getSession(){return session;}
export async function login(email,password){
 const data=await fetchJSON(`${base}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({email,password})});
 store({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return data;
}
export async function refresh(){
 if(pendingRefresh)return pendingRefresh;
 if(!session?.refresh_token)throw Error('Please sign in again.');
 pendingRefresh=(async()=>{
 try{const data=await fetchJSON(`${base}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({refresh_token:session.refresh_token})});store({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return session;}
 catch(e){store(null);throw e;}finally{pendingRefresh=null}
 })();return pendingRefresh;
}
export async function token(){
 if(!session?.access_token)throw Error('Please sign in.');
 if(!session.expires_at || session.expires_at<Date.now()/1000+90)await refresh();
 return session.access_token;
}
export async function request(method,path,data,extra={}){
 const jwt=await token();
 const headers={'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${jwt}`,Prefer:'return=representation',...extra.headers};
 const res=await fetchJSON(`${base}/rest/v1/${path}`,{method,headers,...(data===undefined?{}:{body:JSON.stringify(data)})});
 return res;
}
export async function list(table,filter='') {return await request('GET',`${table}?select=*${filter?`&${filter}`:''}`);}
export async function listAll(table,filter='') {
 let rows=[],page=0;while(true){const chunk=await request('GET',`${table}?select=*${filter?`&${filter}`:''}`,undefined,{headers:{Range:`${page*1000}-${(page+1)*1000-1}`}});rows.push(...chunk);if(chunk.length<1000)break;page++;if(page>100)throw Error('Too many rows: contact administrator.');}return rows;
}
export const insert=(table,data)=>request('POST',table,data);
export const patch=(table,id,data)=>request('PATCH',`${table}?id=eq.${encodeURIComponent(id)}`,data);
export const rpc=(name,args={})=>request('POST',`rpc/${name}`,args);
export async function functionCall(name,data){const jwt=await token();return fetchJSON(`${base}/functions/v1/${name}`,{method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${jwt}`},body:JSON.stringify(data)});}
export async function signOut(){try{if(session?.access_token)await fetchJSON(`${base}/auth/v1/logout`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${session.access_token}`}})}catch{}store(null)}
