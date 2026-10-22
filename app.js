// Each page load uses a fresh module graph to avoid stale GitHub Pages assets.
const assetVersion = new URL(import.meta.url).searchParams.get('v') || Date.now().toString(36);
const api = await import(`./lib/api.js?v=${assetVersion}`);
const orderCounter = await import(`./lib/order-counter-ui.js?v=${assetVersion}`);
const reemItems = await import(`./lib/reem-items-ui.js?v=${assetVersion}`);
const cafeteriaFinanceModule = await import(`./lib/cafeteria-finances.js?v=${assetVersion}`);
const clubInsightsModule = await import(`./lib/club-finance-insights.js?v=${assetVersion}`);
const arabicDailyPdf = await import(`./lib/arabic-daily-pdf.js?v=${assetVersion}`);
const {getWeeklyStatus,getMonthFinance,getWeeklyFreeGameStatus} = await import(`./lib/logic.js?v=${assetVersion}`);
const {todayBeirut,addDays,weekStart,weekEnd,weekLabel,niceDay,monthKey,monthLabel,shiftMonth,amount,parseUSD} = await import(`./lib/date.js?v=${assetVersion}`);
const app=document.getElementById('app');
const icons={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 gift:'<rect width="18" height="13" x="3" y="8" rx="2"/><path d="M12 8v13M3 12h18M12 8H7.5a2.5 2.5 0 1 1 2.45-3c.65 1.2 2.05 3 2.05 3Zm0 0h4.5a2.5 2.5 0 1 0-2.45-3C13.4 6.2 12 8 12 8Z"/>',
 wallet:'<path d="M20 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h15v9a2 2 0 0 1-2 2H5a3 3 0 0 1-3-3V6"/><path d="M16 14h6"/>',
 list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
 settings:'<path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/><circle cx="12" cy="12" r="5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',search:'<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>',chevronLeft:'<path d="m15 18-6-6 6-6"/>',chevronRight:'<path d="m9 18 6-6-6-6"/>',
 arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',refresh:'<path d="M20 11a8 8 0 1 0-2.5 5.5M20 4v7h-7"/>',
 check:'<path d="m4 12 5 5L20 6"/>',close:'<path d="M18 6 6 18M6 6l12 12"/>',edit:'<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4Z"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 shield:'<path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z"/><path d="m9 12 2 2 4-4"/>',
 logout:'<path d="M10 17l5-5-5-5m5 5H3m10-9h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
 activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',coins:'<circle cx="9" cy="9" r="6"/><path d="M15 15a6 6 0 1 0 3-9"/>',
 spark:'<path d="m12 3 1.9 6.1L20 11l-6.1 1.9L12 19l-1.9-6.1L4 11l6.1-1.9L12 3Z"/>',trash:'<path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m5 4v7m4-7v7"/>',
 alert:'<path d="m10.3 3.3-8.2 14A2 2 0 0 0 3.8 20h16.4a2 2 0 0 0 1.7-2.7l-8.2-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
};
function icon(name,cl=''){return `<svg class="${cl}" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.info}</svg>`}
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(name){return String(name).split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}
function tag(label,color='green'){return `<span class="tag tag-${color}">${esc(label)}</span>`}
function btn(label,action,cls='btn-light',more=''){return `<button class="btn ${cls}" data-action="${action}" ${more}>${label}</button>`}
function toast(message,bad=false){const host=document.getElementById('toast-host');const node=document.createElement('div');node.className=`toast ${bad?'bad':''}`;node.textContent=message;host.append(node);setTimeout(()=>node.remove(),4100)}
const tabs=[['dashboard','Overview','grid'],['cafeteria-finances','Cafeteria Finances','coins'],['debts','Cafeteria Debts','wallet'],['private-clients','Private Sessions','users'],['team','Team Members','users'],['training','Monthly Training','calendar'],['other','Other Benefits','gift'],['finance','Matchmaking','wallet'],['activity','Game Activity','list'],['reports','Reports','download'],['settings','Settings','settings']];
const TEAM_GROUPS=[['top_team','Top Team'],['team','Team'],['rising_stars','Rising Stars Team'],['ladies_team','Ladies Team']];
function groupLabel(value){return TEAM_GROUPS.find(([id])=>id===value)?.[1]||'Team';}
const LEGACY_MATCHMAKER_ID='75b8dc1b-0529-489f-8aa1-9a464d9d61a1';
const state={tab:'dashboard',members:[],balances:[],matches:[],games:[],resets:[],special:[],specialGames:[],finance:[],settlements:[],matchmakers:[],matchmakerId:LEGACY_MATCHMAKER_ID,audit:[],staff:null,month:monthKey(todayBeirut()),teamSearch:'',teamSort:'name',teamFilter:'all',teamCategoryFilter:'all',activitySearch:'',loading:false,modal:null,historyWeek:weekStart(todayBeirut()),historyData:null,historyLoading:false,reportMode:'week',reportWeek:weekStart(todayBeirut()),reportMonth:monthKey(todayBeirut()),reportDay:todayBeirut(),reportData:null,reportKey:'',reportLoading:false,trainingMonth:monthKey(todayBeirut()),trainingSessions:[],trainingAttendance:[],trainingLoading:false,trainingLoadedMonth:null,trainingError:null,privateClients:[],privateCoaches:[],privateEntries:[],privateLoaded:false,privateLoading:false,privateError:null,privateSearch:'',privateSelected:null,privateShowArchived:false,privateListFilter:'all',privateSort:'name',privateDay:todayBeirut(),debtPeople:[],debtEntries:[],debtLoaded:false,debtLoading:false,debtError:null,debtSearch:'',debtSelected:null,debtFilter:'all',settingsPrivateAccountId:'',settingsCafeteriaAccountId:'',overviewTrainingAttendance:[],overviewTrainingMonth:'',overviewTrainingLoading:false,overviewTrainingError:null,overviewTrainingFetchedAt:0,globalSearchOpen:false,globalSearchQuery:'',alertExpanded:false};
// The daily cashbook owns its own dated Supabase query and does not mix with other ledgers.
const cafeteriaFinances=cafeteriaFinanceModule.createCafeteriaFinances({
 api,heading,icon,amount,today,addDays,
 rerender:()=>{if(state.tab==='cafeteria-finances'&&api.getSession()?.access_token)render()},
 toast,isAdmin:()=>state.staff?.role==='admin',
 exportArabicPdf:data=>arabicDailyPdf.downloadArabicDailySheet(data)
});
const clubInsights=clubInsightsModule.createCashInsights({
 api,today,amount,renderIfVisible:tab=>{if(state.tab===tab&&api.getSession()?.access_token)render()}
});
// Staff inactivity policy: six hours without user interaction logs out every open tab.
// Background database polling and token refreshes never extend this timer.
let lastKnownWeek=weekStart(todayBeirut());
let lastKnownMonth=monthKey(todayBeirut());
const IDLE_LIMIT_MS=6*60*60*1000;
const IDLE_ACTIVITY_KEY='padelon_staff_last_activity_v1';
const AUTH_STORAGE_KEY='padelon_auth_v1';
let lastActivityWrite=0;
let idleLogoutStarted=false;
function lastStaffActivity(){
 try{return Number(localStorage.getItem(IDLE_ACTIVITY_KEY))||0}catch{return 0}
}
function idleExpired(){
 const previous=lastStaffActivity();
 return !previous || Date.now()-previous>=IDLE_LIMIT_MS || previous>Date.now()+10000;
}
function beginStaffSession(){
 try{localStorage.setItem(IDLE_ACTIVITY_KEY,String(Date.now()));lastActivityWrite=Date.now()}catch{}
}
function clearStaffActivity(){
 try{localStorage.removeItem(IDLE_ACTIVITY_KEY)}catch{}
}
async function autoSignOut(){
 if(idleLogoutStarted || !api.getSession()?.access_token)return;
 idleLogoutStarted=true;
 clearStaffActivity();
 state.staff=null;
 cafeteriaFinances.reset();clubInsights.reset();
 state.modal=null;state.globalSearchOpen=false;state.globalSearchQuery='';
 // api.signOut clears the local authentication token before contacting Supabase.
 const remoteLogout=api.signOut();
 renderAuth('Signed out after 6 hours of inactivity. Please sign in again.');
 try{await remoteLogout}finally{idleLogoutStarted=false}
}
function activityFromStaff(){
 if(!api.getSession()?.access_token || idleLogoutStarted)return;
 // Coming back after thirty minutes is not activity that can revive an expired session.
 if(idleExpired()){void autoSignOut();return}
 const now=Date.now();
 if(now-lastActivityWrite<2000)return;
 try{localStorage.setItem(IDLE_ACTIVITY_KEY,String(now));lastActivityWrite=now}catch{}
}
function checkStaffInactivity(){
 if(api.getSession()?.access_token && idleExpired())void autoSignOut();
}
for(const eventName of ['pointerdown','pointermove','keydown','wheel','touchstart','scroll']){
 window.addEventListener(eventName,activityFromStaff,{passive:true,capture:true});
}
window.addEventListener('storage',event=>{
 if((event.key===AUTH_STORAGE_KEY || event.key===IDLE_ACTIVITY_KEY) && event.newValue===null && api.getSession()?.access_token){
  void autoSignOut();
 }
});
window.addEventListener('pageshow',checkStaffInactivity);
setInterval(checkStaffInactivity,5000);

function titleFor(){return state.tab==='order-counter'?'Order Counter':state.tab==='reem-items'?"Reem's Items List":tabs.find(x=>x[0]===state.tab)?.[1]||'Dashboard'}
function today(){return todayBeirut()}
function normalMembers(){return state.members.filter(m=>m.active&&!m.unlimited)}
function status(m,date=today()){const past=state.historyWeek!==weekStart(today())&&weekStart(date)===state.historyWeek?state.historyData:null;return getWeeklyStatus(m,date,state.balances,past?.games||state.games,past?.resets||state.resets);}
function selectedMatchmaker(){return state.matchmakers.find(x=>x.id===state.matchmakerId)||state.matchmakers[0]||null;}
function matchmakerRate(person){return Number(person?.commission_bps??1500)}
function matchmakingFee(cents,person){return Math.round(Number(cents||0)*matchmakerRate(person)/10000)}
function personFinancials(ym,person){
 const rows=state.finance.filter(g=>(g.matchmaker_id||LEGACY_MATCHMAKER_ID)===person.id);
 const f=getMonthFinance(rows,ym);
 return {...f,fee:matchmakingFee(f.total,person)};
}
function financials(ym=state.month){
 const person=selectedMatchmaker();
 return person?personFinancials(ym,person):getMonthFinance(state.finance,ym);
}
function navMarkup(mobile=false){const allowed=tabs.filter(t=>mobile?t[0]!=='settings':true);return allowed.map(([key,title,ico])=>`<button class="${mobile?'mobile-nav':'nav-item'} ${state.tab===key?'active':''}" data-tab="${key}" aria-current="${state.tab===key?'page':'false'}">${icon(ico)}<span>${mobile?title.split(' ')[0]:title}</span></button>`).join('')}
function globalSearchCandidates(){
 const out=[];
 for(const m of state.members.filter(m=>m.active))out.push({kind:'team',id:m.id,title:m.name,sub:groupLabel(m.team_category)});
 for(const p of state.special.filter(p=>p.active))out.push({kind:'other',id:p.id,title:p.name,sub:'Other Benefits'});
 if(state.privateLoaded&&!state.privateError){
  for(const c of state.privateClients.filter(c=>!c.deleted_at)){
   out.push({kind:'private',id:c.id,title:c.name,sub:'Private Sessions'+(c.client_code?' · ID '+c.client_code:'')+(c.active?'':' · Inactive')});
  }
 }
 if(state.debtLoaded&&!state.debtError){
  for(const p of state.debtPeople.filter(p=>!p.deleted_at)){
   out.push({kind:'debt',id:p.id,title:p.name,sub:'Cafeteria Debts'+(p.active?'':' · Inactive')});
  }
 }
 return out;
}
function globalSearchResultsHTML(){
 const q=state.globalSearchQuery.trim().toLowerCase();
 if(!q)return '<div class="global-search-hint">Search team members, private clients, cafeteria accounts or other benefits by name or customer ID.</div>';
 const results=globalSearchCandidates().filter(c=>(c.title+' '+c.sub).toLowerCase().includes(q))
  .sort((a,b)=>a.title.localeCompare(b.title,undefined,{sensitivity:'base'})).slice(0,35);
 const loading=state.privateLoading||state.debtLoading;
 return `${results.map(c=>`<button type="button" class="global-search-result" data-action="global-search-open-result" data-kind="${esc(c.kind)}" data-id="${esc(c.id)}"><span class="global-search-result-icon">${icon(c.kind==='debt'?'wallet':c.kind==='other'?'gift':'users')}</span><span><strong>${esc(c.title)}</strong><small>${esc(c.sub)}</small></span>${icon('arrow')}</button>`).join('')||'<div class="global-search-hint">No matching accounts found.</div>'}${loading?'<div class="global-search-hint">Still loading client directories…</div>':''}`;
}
function updateGlobalSearchResults(){
 const box=document.getElementById('global-search-results');
 if(box&&state.globalSearchOpen)box.innerHTML=globalSearchResultsHTML();
}
function globalSearchOverlay(){
 if(!state.globalSearchOpen)return '';
 return `<div class="global-search-layer"><div class="global-search-backdrop" data-action="global-search-close"></div><section class="global-search-dialog" role="dialog" aria-modal="true" aria-label="Search across PADEL ON"><div class="global-search-header">${icon('search')}<input id="global-search-input" placeholder="Search members, customers, client IDs…" autocomplete="off" spellcheck="false" value="${esc(state.globalSearchQuery)}" aria-label="Search PADEL ON"/><button type="button" class="btn btn-light btn-icon" data-action="global-search-close" aria-label="Close search">${icon('close')}</button></div><div id="global-search-results" class="global-search-results">${globalSearchResultsHTML()}</div><div class="global-search-footer">Search is available only to signed-in PADEL ON staff.</div></section></div>`;
}
function shell(){
 const name=state.staff?.email?.split('@')[0]||'Staff';
 return `<div class="app-layout"><aside class="sidebar"><div class="brand"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/></div><div class="brand-sub">Club management</div><nav class="menu">${navMarkup()}</nav><div class="menu-footer"><div class="sidebar-bottom">© ${new Date().getFullYear()} PADEL ON</div></div></aside><main class="main"><header class="topbar"><div><div class="crumb">PADEL ON / MANAGEMENT</div><div class="topbar-main">${titleFor()}</div></div><div class="top-right">${btn(icon('search'),'global-search-open','btn-light btn-icon','aria-label="Search PADEL ON" title="Search PADEL ON (Ctrl+K)"')}${btn(icon('refresh'),'refresh','btn-light btn-icon','aria-label="Refresh data" title="Refresh data"')}<div class="user-meta"><strong>${esc(name)}</strong><small>${esc(state.staff?.role||'staff')} account</small></div><div class="avatar">${esc(initials(name))}</div></div></header><div class="workspace ${state.tab==='private-clients'||state.tab==='debts'?'workspace-wide':''}">${renderPage()}<div class="page-footer">PADEL ON · Private management · Asia/Beirut local time</div></div></main><nav class="mobile-bar" aria-label="Mobile navigation"><div class="mobile-nav-scroll">${navMarkup(true)}</div><button type="button" class="mobile-nav mobile-settings-nav ${state.tab==='settings'||state.tab==='order-counter'||state.tab==='reem-items'?'active':''}" data-tab="settings" aria-current="${state.tab==='settings'||state.tab==='order-counter'||state.tab==='reem-items'?'page':'false'}" aria-label="Settings">${icon('settings')}<span>Settings</span></button></nav></div><div id="modal-root">${state.modal?modalMarkup():''}</div>${globalSearchOverlay()}`;
}
function heading(eyebrow,title,desc,actions=''){return `<div class="heading-row"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${desc}</p></div>${actions?`<div class="heading-actions">${actions}</div>`:''}</div>`}
function summaryCard(label,num,sub,ico,feature=false){return `<article class="summary-card ${feature?'feature':''}"><div class="card-top"><span class="label">${label}</span><span class="metric-icon">${icon(ico)}</span></div><div class="metric num">${num}</div><div class="submetric">${sub}</div></article>`}
function statusBadge(m,date=today()){if(m.unlimited)return tag('Unlimited','green');if(m.weekly_allowance===0)return tag('Allowance not set','amber');const r=status(m,date).remain;return r===0?tag('Exhausted','red'):r===1?tag('1 left','amber'):tag('Available','green')}
function progress(m,date=today()){const st=status(m,date);if(m.unlimited)return `<div class="unlimited">∞ Unlimited free games</div>`;if(m.weekly_allowance===0)return `<div class="unlimited">Weekly allowance not configured</div>`;const ratio=m.weekly_allowance?Math.min(100,st.used/m.weekly_allowance*100):100;const shade=st.remain===0?'red':st.remain===1?'amber':'';return `<div class="player-row"><div class="game-number num">${st.used} <span>/ ${m.weekly_allowance}</span></div><span class="game-caption">${st.remain} remaining</span></div><div class="progress"><div class="progress-bar ${shade}" style="width:${ratio}%"></div></div>`}
function memberCard(m,date=today()){const historical=weekStart(date)!==weekStart(today());return `<article class="member-card"><div class="member-top"><div class="player-avatar ${m.unlimited?'dark':''}">${esc(initials(m.name))}</div><div class="player-title"><strong title="${esc(m.name)}">${esc(m.name)}</strong><small>${esc(groupLabel(m.team_category))}</small></div>${statusBadge(m,date)}</div>${m.unlimited?`<div class="player-row"><div class="game-number">${status(m,date).used} <span>this week</span></div></div><div class="unlimited">∞ Unlimited free games</div>`:progress(m,date)}<div class="card-bottom">${historical?'<span class="tiny">Historical week · read-only</span>':btn(`${icon('plus')} Add Game`,'record-team','btn-soft',`data-id="${m.id}"`)}${btn(icon('clock'),'member-history','btn-light btn-icon history-button',`data-id="${m.id}" title="Game history" aria-label="History"`)}</div></article>`}
function recentActivity(max=6,filterName=''){
 const team=state.matches.filter(m=>!m.voided_at).map(m=>({key:m.id,type:m.benefit_type==='free'?'Free Game':'Half-Price',names:state.games.filter(g=>g.match_id===m.id&&!g.voided_at).map(g=>state.members.find(x=>x.id===g.member_id)?.name).filter(Boolean).join(', ')||'Team Game',date:m.played_on,ref:m.id,kind:'team'}));
 const special=state.specialGames.map(g=>({key:g.id,type:g.game_type==='free'?'Free Game':'Paid Game',names:state.special.find(x=>x.id===g.player_id)?.name||'Special Player',date:g.played_on,ref:g.id,kind:'other'}));
 return [...team,...special].filter(g=>!filterName||g.names.toLowerCase().includes(filterName.toLowerCase())).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,max);
}
// Club-wide reporting: monetary values are integer USD cents.
const MANAGEMENT_HIGH_DEBT_CENTS=10000;
function validPrivateEntries(){return state.privateEntries.filter(e=>!e.voided_at);}
function validCafeteriaEntries(){return state.debtEntries.filter(e=>!e.voided_at);}
function clubFinancialSnapshot(period,scope='month'){
 const inPeriod=date=>typeof date==='string'&&(scope==='day'?date===period:monthKey(date)===period);
 const sessions=state.privateLoaded&&!state.privateError?validPrivateEntries().filter(e=>e.entry_type==='session'&&inPeriod(e.entry_date)):null;
 const deposits=state.privateLoaded&&!state.privateError?validPrivateEntries().filter(e=>e.entry_type==='deposit'&&inPeriod(e.entry_date)):null;
 const cafeCharges=state.debtLoaded&&!state.debtError?validCafeteriaEntries().filter(e=>e.entry_type==='charge'&&inPeriod(e.entry_date)):null;
 const cafePayments=state.debtLoaded&&!state.debtError?validCafeteriaEntries().filter(e=>e.entry_type==='payment'&&inPeriod(e.entry_date)):null;
 const matchmaking=state.finance.filter(e=>!e.deleted_at&&inPeriod(e.played_on));
 const sum=(items,key)=>items?.reduce((total,row)=>total+Number(row[key]||0),0)??null;
 const privateCharges=sum(sessions,'session_fee_cents'),privatePaid=sum(sessions,'paid_cents'),privateTopups=sum(deposits,'deposit_cents');
 const cafeteriaCharges=sum(cafeCharges,'amount_cents'),cafeteriaPaid=sum(cafePayments,'amount_cents');
 const matchmakingCollected=sum(matchmaking,'amount_cents');
 const matchmakers=state.matchmakers.length?state.matchmakers:[{id:LEGACY_MATCHMAKER_ID,commission_bps:1500,name:'Legacy'}];
 const commissionTotal=matchmakers.reduce((total,p)=>total+matchmakingFee(
  sum(matchmaking.filter(e=>(e.matchmaker_id||LEGACY_MATCHMAKER_ID)===p.id),'amount_cents'),p),0);
 const collected=privatePaid===null||privateTopups===null||cafeteriaPaid===null?null:privatePaid+privateTopups+cafeteriaPaid+matchmakingCollected;
 return {sessions:sessions?.length??null,privateCharges,privatePaid,privateTopups,cafeteriaCharges,cafeteriaPaid,
  matchmakingCollected,commissionTotal,collected,matchmakingGames:matchmaking.length,
  completed:privatePaid!==null&&cafeteriaPaid!==null};
}
function clubBalanceSnapshot(){
 const privateReady=state.privateLoaded&&!state.privateError,cafeReady=state.debtLoaded&&!state.debtError;
 const p=privateReady?state.privateClients.filter(c=>!c.deleted_at).map(c=>({person:c,balance:privateClientBalance(c)})):[];
 const c=cafeReady?state.debtPeople.filter(c=>!c.deleted_at).map(c=>({person:c,balance:debtOutstanding(c.id)})):[];
 return {privateReady,cafeReady,
  privateOwed:privateReady?p.reduce((n,x)=>n+Math.max(0,-x.balance),0):null,
  privateCredit:privateReady?p.reduce((n,x)=>n+Math.max(0,x.balance),0):null,
  cafeteriaOwed:cafeReady?c.reduce((n,x)=>n+Math.max(0,x.balance),0):null,
  cafeteriaCredit:cafeReady?c.reduce((n,x)=>n+Math.max(0,-x.balance),0):null,
  privateRows:p,cafeRows:c};
}
function daysLeftInMonth(date){
 const end=addDays(shiftMonth(monthKey(date),1)+'-01',-1);
 const from=new Date(date+'T12:00:00Z'),to=new Date(end+'T12:00:00Z');
 return Math.round((to-from)/86400000);
}
function managementAlerts(){
 const alerts=[],balances=clubBalanceSnapshot();
 if(balances){
  for(const x of balances.cafeRows.filter(x=>x.balance>=MANAGEMENT_HIGH_DEBT_CENTS).sort((a,b)=>b.balance-a.balance)){
   alerts.push({severity:'warning',subject:x.person.name,detail:(x.person.active?'':'Inactive account · ')+'Cafeteria balance owed: '+amount(x.balance),kind:'debt',id:x.person.id});
  }
  for(const x of balances.privateRows.filter(x=>x.balance<=-MANAGEMENT_HIGH_DEBT_CENTS).sort((a,b)=>a.balance-b.balance)){
   alerts.push({severity:'warning',subject:x.person.name,detail:(x.person.active?'':'Inactive client · ')+'Private coaching amount owed: '+amount(-x.balance),kind:'private',id:x.person.id});
  }
  for(const x of balances.privateRows.filter(x=>!x.person.active&&x.balance<0)){
   if(x.balance<=-MANAGEMENT_HIGH_DEBT_CENTS)continue;
   alerts.push({severity:'warning',subject:x.person.name,detail:'Inactive private client still owes '+amount(-x.balance),kind:'private',id:x.person.id});
  }
  for(const x of balances.cafeRows.filter(x=>!x.person.active&&x.balance>0)){
   if(x.balance>=MANAGEMENT_HIGH_DEBT_CENTS)continue;
   alerts.push({severity:'warning',subject:x.person.name,detail:'Inactive cafeteria account owes '+amount(x.balance),kind:'debt',id:x.person.id});
  }
 }
 const ym=monthKey(today());
 if(state.overviewTrainingMonth===ym&&!state.overviewTrainingError){
  const trained=new Set(state.overviewTrainingAttendance.filter(a=>!a.voided_at).map(a=>a.member_id));
  const missing=state.members.filter(m=>m.active&&m.team_category==='rising_stars'&&!trained.has(m.id));
  const remaining=daysLeftInMonth(today());
  if(missing.length)alerts.push({severity:remaining<=7?'warning':'info',subject:'Rising Stars monthly training',
   detail:missing.length+' member'+(missing.length===1?'':'s')+' not yet trained · '+remaining+' day'+(remaining===1?'':'s')+' left this month',kind:'training'});
 }
 return alerts;
}
function managementAlertPanel(){
 const alerts=managementAlerts(),allReady=state.privateLoaded&&state.debtLoaded&&state.overviewTrainingMonth===monthKey(today())&&!state.overviewTrainingError;
 const content=alerts.length?alerts.slice(0,state.alertExpanded?alerts.length:7).map(a=>
  `<button type="button" class="management-alert ${a.severity}" data-action="management-alert-open" data-kind="${a.kind}" ${a.id?`data-id="${esc(a.id)}"`:''}><span class="management-alert-icon">${icon(a.severity==='warning'?'alert':'info')}</span><span><strong>${esc(a.subject)}</strong><small>${esc(a.detail)}</small></span>${icon('arrow')}</button>`).join(''):
  allReady?'<div class="panel-empty">No outstanding management alerts at the moment.</div>':'<div class="panel-empty">Loading client and training alerts…</div>';
 return `<article class="panel"><div class="panel-head"><div><h2>Management alerts</h2><p>High balances: ${amount(MANAGEMENT_HIGH_DEBT_CENTS)}+ · training follows the Beirut calendar</p></div>${alerts.length?tag(String(alerts.length)+' alerts','amber'):''}</div><div class="management-alerts">${content}${alerts.length>7?btn(state.alertExpanded?'Show fewer alerts':'Show all '+alerts.length+' alerts','management-alert-toggle','btn-light'):''}${!allReady?'<div class="management-alert-status">Some alert sources are still loading or unavailable; totals may be incomplete.</div>':''}</div></article>`;
}
function overviewExtra(){
 const todayDate=today(),snapshot=clubFinancialSnapshot(todayDate,'day'),balance=clubBalanceSnapshot();
 const latest=state.privateLoaded&&!state.privateError?validPrivateEntries()
  .filter(e=>e.entry_type==='session'&&e.entry_date===todayDate)
  .sort((a,b)=>(b.created_at||'').localeCompare(a.created_at||'')):[];
 const commissionAccounts=state.matchmakers.length?state.matchmakers:[{id:LEGACY_MATCHMAKER_ID,name:'Matchmaking',commission_bps:1500}];
 const month=monthKey(todayDate);
 const dueRows=commissionAccounts.map(person=>{
  const total=personFinancials(month,person);
  const settlement=state.settlements.find(e=>e.month_key===month+'-01'&&(e.matchmaker_id||LEGACY_MATCHMAKER_ID)===person.id);
  return {name:person.name,fee:total.fee,settled:settlement?.status==='paid'};
 }).filter(row=>row.fee>0&&!row.settled);
 const pending=dueRows.reduce((n,x)=>n+x.fee,0);
 const overviewMetrics=`<section class="summary management-summary">
  ${summaryCard('Private sessions today',snapshot.sessions??'—','Completed sessions · today','calendar',true)}
  ${summaryCard('Other ledger receipts',snapshot.collected===null?'—':amount(snapshot.collected),'Private receipts, debt payments & matchmaking · not cash drawer','wallet')}
  ${summaryCard('Cafeteria owed',balance.cafeteriaOwed===null?'—':amount(balance.cafeteriaOwed),'Current outstanding balances','activity')}
  ${summaryCard('Private coaching owed',balance.privateOwed===null?'—':amount(balance.privateOwed),'Current outstanding client balances','users')}
 </section>`;
 const rows=latest.slice(0,8).map(e=>{
  const client=state.privateClients.find(c=>c.id===e.client_id);
  return `<tr><td>${esc(client?.name||'Unknown client')}<br/><small>${esc(client?.client_code||'No client ID')}</small></td><td>${esc(privateCoachName(e.coach_id))}</td><td>${amount(e.session_fee_cents)}</td><td>${amount(e.paid_cents)}</td></tr>`;
 }).join('');
 const todayPanel=`<article class="panel"><div class="panel-head"><div><h2>Today's private sessions</h2><p>${niceDay(todayDate,{weekday:'long',month:'short',day:'numeric'})} · session fees and amounts received</p></div><button class="link" data-tab="private-clients">View daily log ${icon('arrow')}</button></div>
 <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Client</th><th>Coach</th><th>Charge</th><th>Paid</th></tr></thead>
 <tbody>${!state.privateLoaded?'<tr><td colspan="4" class="panel-empty">'+(state.privateError?'Private sessions unavailable':'Loading private sessions…')+'</td></tr>':rows||'<tr><td colspan="4" class="panel-empty">No private sessions recorded today.</td></tr>'}</tbody></table></div></article>`;
 const commissions=`<article class="panel"><div class="panel-head"><div><h2>Pending matchmaking commissions</h2><p>${monthLabel(month)} · not marked as paid</p></div><button class="link" data-tab="finance">Matchmaking ${icon('arrow')}</button></div><div class="panel-body">
 <div class="management-commission-total">${amount(pending)}<small>${dueRows.length} unsettled person${dueRows.length===1?'':'s'}</small></div>
 ${dueRows.length?dueRows.slice(0,5).map(x=>`<div class="management-commission-row"><span>${esc(x.name)}</span><strong>${amount(x.fee)}</strong></div>`).join(''):'<div class="panel-empty">No unpaid commissions recorded this month.</div>'}
 <p class="management-note">Commission amounts are calculated from matchmaking revenue. A settlement marked Paid is excluded from this reminder.</p>
 </div></article>`;
 return `<div class="management-section-label"><h2>Today's club operations</h2><span>${niceDay(todayDate,{weekday:'long',month:'long',day:'numeric'})} · Asia/Beirut</span></div>
 ${overviewMetrics}
 ${clubInsights.overviewHTML()}
 <div class="two-col management-panels">${managementAlertPanel()}${commissions}</div>
 <div class="management-section-label"><h2>Daily coaching activity</h2></div>${todayPanel}`;
}
function dashboard(){const normal=normalMembers();const used=normal.reduce((n,m)=>n+status(m).used,0),left=normal.reduce((n,m)=>n+status(m).remain,0),empty=normal.filter(m=>status(m).remain===0).length;const recent=recentActivity(6);return `
${heading('Your club, organized','Good day, team.','Here’s what’s happening at PADEL ON this week.',btn(`${icon('plus')} Quick Match`,'quick-team','btn-primary'))}
<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">${icon('calendar')} <span><strong>Current week:</strong> ${weekLabel(today())} · Counters automatically follow the Beirut calendar week.</span></div>
<section class="summary">${summaryCard('Active team members',state.members.filter(m=>m.active).length,'','users',true)}${summaryCard('Benefits used',used,'This week · standard members','activity')}${summaryCard('Benefits remaining',left,'Available this week','gift')}${summaryCard('Allowances exhausted',empty,'Members with 0 remaining','shield')}</section>
${overviewExtra()}
<section class="two-col"><article class="panel"><div class="panel-head"><div><h2>Recent game activity</h2><p>Last 30 days · latest first</p></div><button class="link" data-tab="activity">View all ${icon('arrow')}</button></div><div class="panel-body">${recent.length?recent.map(a=>`<div class="activity-line"><div class="activity-avatar">${esc(initials(a.names.split(',')[0]))}</div><div class="activity-copy"><strong>${esc(a.names)}</strong><small>${esc(a.type)}</small></div><span class="small-date">${niceDay(a.date)}</span></div>`).join(''):`<div class="empty-prompt">${icon('calendar')}<strong>No new games yet</strong><span>Recorded games will appear here.</span></div>`}</div></article><article class="panel"><div class="panel-head"><div><h2>Quick actions</h2><p>Everything in just a tap</p></div></div><div class="panel-body quick-list"><button class="quick-link" data-action="quick-team">${icon('plus')}<span><strong>Quick Match</strong><small>Choose all four participants</small></span></button><button class="quick-link" data-tab="debts">${icon('wallet')}<span><strong>Cafeteria debts</strong><small>Track unpaid purchases and partial payments</small></span></button><button class="quick-link" data-action="add-nazih">${icon('wallet')}<span><strong>Log matchmaking revenue</strong><small>Separate revenue and commission by matchmaker</small></span></button><button class="quick-link" data-tab="other">${icon('gift')}<span><strong>Other player benefits</strong><small>Free game eligibility</small></span></button><button class="quick-link" data-tab="settings">${icon('settings')}<span><strong>Management settings</strong><small>Members and secure resets</small></span></button></div></article></section>`}
function teamCategoryOptions(){return '<option value=all>All teams</option>'+TEAM_GROUPS.map(([id,name])=>'<option value='+id+(state.teamCategoryFilter===id?' selected':'')+'>'+esc(name)+'</option>').join('');}
function groupedMemberCards(members,selected){let out='';for(const [key,label] of TEAM_GROUPS){if(state.teamCategoryFilter!=='all'&&state.teamCategoryFilter!==key)continue;const group=members.filter(m=>(m.team_category||'team')===key);if(!group.length)continue;out+='<section class=team-category-section><div class=team-category-heading><h2>'+esc(label)+'</h2><span>'+group.length+' members</span></div><div class=member-grid>'+group.map(m=>memberCard(m,selected)).join('')+'</div></section>';}return out||'<div class=panel-empty>No matching members.</div>';}
function teamPage(){
 const selected=state.historyWeek, historical=selected!==weekStart(today());
 let members=state.members.filter(m=>m.active);
 const q=state.teamSearch.toLowerCase();members=members.filter(m=>m.name.toLowerCase().includes(q));if(state.teamCategoryFilter!=='all')members=members.filter(m=>(m.team_category||'team')===state.teamCategoryFilter);
 if(historical && (state.historyLoading || !state.historyData))return `
${heading('Team benefits','Team Members','Browse previous weeks without changing the current allowance.',btn(`${icon('plus')} Quick Match`,'quick-team','btn-primary'))}
${weekNavigator(selected,'team')}
<div class="panel-empty">${state.historyLoading?'Loading the selected week…':'Could not load this week. Use the arrows to try again.'}</div>`;
 if(state.teamFilter==='available')members=members.filter(m=>m.unlimited||status(m,selected).remain>0);
 if(state.teamFilter==='exhausted')members=members.filter(m=>!m.unlimited&&m.weekly_allowance>0&&status(m,selected).remain===0);
 if(state.teamSort==='remaining')members.sort((a,b)=>status(b,selected).remain-status(a,selected).remain);
 else if(state.teamSort==='used')members.sort((a,b)=>status(b,selected).used-status(a,selected).used);
 else members.sort((a,b)=>a.name.localeCompare(b.name));
 const selectedGames=historical?state.historyData?.games||[]:state.games;
 const selectedMatches=historical?state.historyData?.matches||[]:state.matches;
 const activity=selectedMatches.filter(m=>!m.voided_at).sort((a,b)=>b.played_on.localeCompare(a.played_on));
 return `
${heading('Team benefits','Team Members',`Week of ${weekLabel(selected)} · ${historical?'Past week (read-only)':'Current week'}`,historical?btn(`${icon('calendar')} Current Week`,'team-current-week','btn-light'):btn(`${icon('plus')} Quick Match`,'quick-team','btn-primary')+btn('Manual Entry','record-team','btn-light')+(state.staff?.role==='admin'?btn(`${icon('plus')} Add Member`,'new-member','btn-light'):''))}
${weekNavigator(selected,'team')}
<div class="toolbar"><div class="toolbar-left"><label class="search">${icon('search')}<input id="team-search" placeholder="Search members…" autocomplete="off" value="${esc(state.teamSearch)}"/></label><select class="select" id="team-category" aria-label="Team category">${teamCategoryOptions()}</select><select class="select" id="team-filter"><option value="all" ${state.teamFilter==='all'?'selected':''}>All members</option><option value="available" ${state.teamFilter==='available'?'selected':''}>Benefits available</option><option value="exhausted" ${state.teamFilter==='exhausted'?'selected':''}>Exhausted</option></select><select class="select" id="team-sort"><option value="name" ${state.teamSort==='name'?'selected':''}>Sort: Name</option><option value="remaining" ${state.teamSort==='remaining'?'selected':''}>Sort: Remaining</option><option value="used" ${state.teamSort==='used'?'selected':''}>Sort: Most used</option></select></div><span class="tiny">${members.length} displayed</span></div>
<div class="team-sections">${groupedMemberCards(members,selected)}</div>
${historical?`<article class="panel"><div class="panel-head"><div><h2>Games during this week</h2><p>${activity.length} match(es) · original entries preserved</p></div></div><div class="panel-body">${activity.length?activity.map(m=>`<div class="activity-line"><div class="activity-avatar">${icon('calendar')}</div><div class="activity-copy"><strong>${niceDay(m.played_on)} · ${esc(m.benefit_type==='free'?'Free':'Half-price')}</strong><small>${esc(selectedGames.filter(g=>g.match_id===m.id&&!g.voided_at).map(g=>state.members.find(x=>x.id===g.member_id)?.name).filter(Boolean).join(', ')||'Team game')}</small></div></div>`).join(''):'<div class="panel-empty">No recorded matches this week.</div>'}</div></article>`:''}`;}
function weekNavigator(selected,section){
 const current=weekStart(today());
 return `<div class="period-control"><div><strong>${icon('calendar')} ${weekLabel(selected)}</strong><small>${selected===current?'Current Monday–Sunday period':'Archived week · records are read-only'}</small></div><div class="period-buttons"><button class="btn btn-light" data-action="${section}-prev-week" aria-label="Previous week">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="${section}-next-week" ${selected>=current?'disabled':''} aria-label="Next week">${icon('chevronRight')}</button></div></div>`;
}
// Load only the requested historical period. The dashboard keeps its lightweight 30-day refresh.
async function fetchPeriod(start,end){
 const dates=`played_on=gte.${start}&played_on=lte.${end}`;
 const [matches,games,resets,specialGames]=await Promise.all([
  api.listAll('team_matches',dates),
  api.listAll('team_games',dates),
  api.listAll('reset_events',`week_start=gte.${weekStart(start)}&week_start=lte.${weekStart(end)}`),
  api.listAll('other_games',dates)
 ]);
 return {matches,games,resets,specialGames};
}
let historySeq=0,reportSeq=0;
async function loadHistoryWeek(newWeek){
 const current=weekStart(today()),candidate=weekStart(newWeek);
 if(candidate>current)return;
 const seq=++historySeq;
 state.historyWeek=candidate;state.historyData=null;
 state.historyLoading=candidate!==current;
 render();
 if(candidate===current)return;
 try{const data=await fetchPeriod(candidate,addDays(candidate,6));if(seq!==historySeq)return;state.historyData=data;}
 catch(e){if(seq===historySeq)toast('Could not load week: '+e.message,true)}
 finally{if(seq===historySeq){state.historyLoading=false;render()}}
}
function reportRange(){
 if(state.reportMode==='day')return [state.reportDay,state.reportDay];
 if(state.reportMode==='week')return [state.reportWeek,addDays(state.reportWeek,6)];
 const first=state.reportMonth+'-01',last=addDays(shiftMonth(state.reportMonth,1)+'-01',-1);
 return [first,last];
}
async function loadReport(){
 const [start,end]=reportRange(),mode=state.reportMode;
 const request=++reportSeq;
 void clubInsights.loadReport(start,end,true);
 state.reportLoading=true;state.reportData=null;state.reportKey=`${mode}:${start}`;
 render();
 try{
  const data=await fetchPeriod(start,end);
  if(request===reportSeq)state.reportData=data;
 }catch(e){if(request===reportSeq)toast('Could not load report: '+e.message,true)}
 finally{if(request===reportSeq){state.reportLoading=false;render()}}
}
function reportMetrics(){
 const data=state.reportData;
 if(!data)return null;
 const validMatches=data.matches.filter(m=>!m.voided_at);
 const matchIDs=new Set(validMatches.map(m=>m.id));
 const games=data.games.filter(g=>!g.voided_at&&matchIDs.has(g.match_id));
 const free=games.filter(g=>g.benefit_type==='free').length,half=games.length-free;
 const special=data.specialGames.length;
 const rows=state.members.map(m=>{
  const personal=games.filter(g=>g.member_id===m.id);
  const opening=state.reportMode==='week'?(Number(state.balances.find(b=>b.member_id===m.id&&b.week_start===state.reportWeek)?.used||0)):0;
  const st=state.reportMode==='week'?getWeeklyStatus(m,state.reportWeek,state.balances,games,data.resets):null;
  return {member:m,played:personal.length,free:personal.filter(g=>g.benefit_type==='free').length,half:personal.filter(g=>g.benefit_type==='half').length,used:st?.used??personal.length,remaining:st?.remain,opening};
 }).filter(r=>r.played||r.used).sort((a,b)=>b.used-a.used||a.member.name.localeCompare(b.member.name));
 const weekUsed=state.reportMode==='week'?state.members.filter(m=>!m.unlimited).reduce((n,m)=>n+getWeeklyStatus(m,state.reportWeek,state.balances,games,data.resets).used,0):null;
 const breakdown=state.matchmakers.length?state.matchmakers.map(person=>({...personFinancials(state.reportMonth,person),person})): [{...getMonthFinance(state.finance,state.reportMonth),person:{name:'Nazih Sonbol',commission_bps:1500}}];
 const monthFinance={total:breakdown.reduce((sum,r)=>sum+r.total,0),fee:breakdown.reduce((sum,r)=>sum+r.fee,0),games:breakdown.reduce((sum,r)=>sum+r.games,0)};
 return {validMatches,games,rows,free,half,special,weekUsed,monthFinance,breakdown};
}
function matchmakingBreakdownHTML(rows){
 return `<article class="panel matchmaking-breakdown"><div class="panel-head"><div><h2>Matchmaking by person</h2><p>Independent monthly revenue, commissions, and payments</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Matchmaker</th><th>Games</th><th>Revenue</th><th>Rate</th><th>Commission</th><th>Settlement</th></tr></thead><tbody>${rows.map(r=>{
 const settlement=state.settlements.find(x=>(x.matchmaker_id||LEGACY_MATCHMAKER_ID)===(r.person.id||LEGACY_MATCHMAKER_ID)&&x.month_key===state.reportMonth+'-01');
 return `<tr><td><strong>${esc(r.person.name)}</strong></td><td>${r.games}</td><td>${amount(r.total)}</td><td>${(matchmakerRate(r.person)/100).toLocaleString('en-US',{maximumFractionDigits:2})}%</td><td><strong>${amount(r.fee)}</strong></td><td>${tag(settlement?.status==='paid'?'Paid':'Unpaid',settlement?.status==='paid'?'green':'amber')}</td></tr>`;
 }).join('')}</tbody></table></div></article>`;
}
function consolidatedFinancePanel(ym){
 const data=clubFinancialSnapshot(ym,'month'),balances=clubBalanceSnapshot();
 const line=(label,value,desc,highlight=false)=>
 `<div class="consolidated-finance-row ${highlight?'strong':''}"><div><strong>${esc(label)}</strong><small>${esc(desc)}</small></div><b>${value===null?'—':amount(value)}</b></div>`;
 const ready=state.privateLoaded&&!state.privateError&&state.debtLoaded&&!state.debtError;
 const rows=[
 ['Private session fees',data.privateCharges,'Service value recorded; not necessarily paid'],
 ['Paid at private sessions',data.privatePaid,'Money received during coaching sessions'],
 ['Private client top-ups',data.privateTopups,'Cash received as prepaid balance (not new revenue)'],
 ['Cafeteria purchases charged',data.cafeteriaCharges,'Value of items placed on accounts'],
 ['Cafeteria payments received',data.cafeteriaPaid,'Money paid against cafeteria balances'],
 ['Matchmaking collections',data.matchmakingCollected,'Revenue recorded in matchmaking ledgers'],
 ['Matchmaking commissions',data.commissionTotal,'Commission payable, not cash received']
 ].map(([label,value,desc])=>line(label,value,desc)).join('');
 return `<article class="panel consolidated-finance-panel"><div class="panel-head"><div><h2>Club financial overview</h2><p>${monthLabel(ym)} · separate charges, cash receipts and commissions</p></div></div>
 ${!ready?'<div class="notice finance-loading">Private and cafeteria records are still loading or unavailable. Missing figures are shown as —, not zero.</div>':''}
 <div class="consolidated-finance-grid">
 <div class="consolidated-finance-total"><small>Cash collected across tracked activities</small><strong>${data.collected===null?'—':amount(data.collected)}</strong><p>Session payments + balance top-ups + cafeteria payments + matchmaking collections</p></div>
 <div class="consolidated-finance-total secondary"><small>Matchmaking commissions</small><strong>${amount(data.commissionTotal)}</strong><p>Separate estimated payment obligation, not deducted from cash collected</p></div></div>
 <div class="consolidated-finance-rows">${rows}</div>
 <div class="consolidated-finance-current"><h3>Current balances · live, not historical month-end values</h3>
 ${line('Outstanding private coaching',balances.privateOwed,'Amount customers currently owe')}
 ${line('Outstanding cafeteria accounts',balances.cafeteriaOwed,'Unpaid cafeteria purchases')}
 ${line('Prepaid private client credit',balances.privateCredit,'Credit already added to client accounts')}
 ${line('Prepaid cafeteria credit',balances.cafeteriaCredit,'Credit held for future cafeteria purchases')}
 </div>
 <p class="management-note consolidated-note">Current balances are live snapshots, not historical month-end balances. Payments toward outstanding debt can relate to earlier purchases; prepaid top-ups are cash received but not additional session revenue. Do not add charges and payments together as total revenue. Figures are based on entry dates in Asia/Beirut.</p>
 </article>`;
}
function reportsPage(){
 const [start,end]=reportRange();
 const weekly=state.reportMode==='week',daily=state.reportMode==='day',m=reportMetrics();
 const title=daily?state.reportDay:weekly?weekLabel(state.reportWeek):monthLabel(state.reportMonth);
 return `${heading('Operations overview','Operations & Financial Reports','',btn(`${icon('download')} Export CSV`,'export-report','btn-primary',!m?'disabled':'')+btn('Print / Save PDF','print-report','btn-light',!m?'disabled':''))}
<div class="report-mode"><button class="btn ${daily?'btn-primary':'btn-light'}" data-action="report-mode-day">Daily report</button><button class="btn ${weekly?'btn-primary':'btn-light'}" data-action="report-mode-week">Weekly report</button><button class="btn ${!weekly?'btn-primary':'btn-light'}" data-action="report-mode-month">Monthly report</button></div>
<div class="period-control"><div><strong>${icon('calendar')} ${title}</strong><small>${daily?'Daily activity and cash count':weekly?'Weekly benefits and records':'Monthly games and matchmaking revenue'} · Asia/Beirut dates</small></div><div class="period-buttons"><button class="btn btn-light" data-action="report-prev" aria-label="Previous ${daily?'day':weekly?'week':'month'}">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="report-next" ${(daily?state.reportDay>=today():weekly?state.reportWeek>=weekStart(today()):state.reportMonth>=monthKey(today()))?'disabled':''} aria-label="Next ${daily?'day':weekly?'week':'month'}">${icon('chevronRight')}</button></div></div>
${!m?`<div class="panel-empty">${state.reportLoading?'Loading report from Supabase…':'No report loaded. Use the period arrows to retry.'}</div>`:`
<section class="finance-grid">${summaryCard('Team matches',m.validMatches.length,'Matches recorded in selected period','calendar',true)}${summaryCard('Benefit uses',weekly?m.weekUsed:m.games.length,weekly?'Includes imported opening balances':'Dated transactions only','gift')}${summaryCard('Free / Half-price',`${m.free} / ${m.half}`,'Per-member benefit entries','activity')}</section>
${daily?'':weekly?`<div class="notice">Historical balances use the member's current configured allowance. Imported opening balances are counted as weekly usage; reset events are respected.</div>`:`<section class="finance-grid">${summaryCard('Matchmaking revenue',amount(m.monthFinance.total),'All matchmaking personnel','wallet',true)}${summaryCard('Total commissions',amount(m.monthFinance.fee),'Sum of independent monthly commissions','coins')}${summaryCard('Other benefit games',m.special,'Special-player entries this month','users')}</section>${matchmakingBreakdownHTML(m.breakdown)}${consolidatedFinancePanel(state.reportMonth)}`}
${clubInsights.reportHTML(start,end)}
<article class="panel"><div class="panel-head"><div><h2>Team member breakdown</h2><p>${title} · ${m.rows.length} members with activity</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Category</th><th>Games logged</th><th>Free</th><th>Half-price</th><th>${weekly?'Week used':'Monthly total'}</th>${weekly?'<th>Remaining*</th>':''}</tr></thead><tbody>${m.rows.length?m.rows.map(r=>`<tr><td><strong>${esc(r.member.name)}</strong></td><td>${esc(groupLabel(r.member.team_category))}</td><td>${r.played}</td><td>${r.free}</td><td>${r.half}</td><td><strong>${r.used}</strong></td>${weekly?`<td>${r.member.unlimited?'Unlimited':r.remaining}</td>`:''}</tr>`).join(''):`<tr><td colspan="${weekly?7:6}" class="panel-empty">No benefits recorded for this period.</td></tr>`}</tbody></table></div></article>
<div class="archive-note">${weekly?'* Remaining benefits use current allowances and historical reset events.':'Financial totals use permanent saved matchmaking records. The monthly game counts exclude imported balances.'} No report action edits any records.</div>
`}`;
}
function exportReport(){
 const m=reportMetrics();if(!m)throw Error('Load the report before exporting.');
 const weekly=state.reportMode==='week',daily=state.reportMode==='day',period=daily?state.reportDay:weekly?state.reportWeek:state.reportMonth;
 const rows=[['PADEL ON',state.reportMode==='day'?'Daily Operations Report':weekly?'Weekly Game Report':'Monthly Game Report',period],
  ['Team matches',m.validMatches.length],['Logged benefit uses',m.games.length],
  ['Free entries',m.free],['Half-price entries',m.half],['Other-player games',m.special]];
 if(weekly)rows.push(['Weekly used (including opening balances)',m.weekUsed]);
 else if(!daily) {const finance=clubFinancialSnapshot(state.reportMonth,'month');rows.push([],['CLUB FINANCIAL OVERVIEW',state.reportMonth],['Cash received across tracked operations USD',finance.collected===null?'Not loaded':(finance.collected/100).toFixed(2)],['Private session fees (charges) USD',finance.privateCharges===null?'Not loaded':(finance.privateCharges/100).toFixed(2)],['Private payments at sessions USD',finance.privatePaid===null?'Not loaded':(finance.privatePaid/100).toFixed(2)],['Private balance top-ups USD',finance.privateTopups===null?'Not loaded':(finance.privateTopups/100).toFixed(2)],['Cafeteria purchases charged USD',finance.cafeteriaCharges===null?'Not loaded':(finance.cafeteriaCharges/100).toFixed(2)],['Cafeteria payments received USD',finance.cafeteriaPaid===null?'Not loaded':(finance.cafeteriaPaid/100).toFixed(2)],['Matchmaking collections USD',(finance.matchmakingCollected/100).toFixed(2)],['Matchmaking commissions USD',(finance.commissionTotal/100).toFixed(2)]);
const currentBalances=clubBalanceSnapshot();
rows.push([],['CURRENT BALANCES (LIVE SNAPSHOT, NOT MONTH-END)'],
 ['Current private coaching outstanding USD',currentBalances.privateOwed===null?'Not loaded':(currentBalances.privateOwed/100).toFixed(2)],
 ['Current cafeteria outstanding USD',currentBalances.cafeteriaOwed===null?'Not loaded':(currentBalances.cafeteriaOwed/100).toFixed(2)],
 ['Current prepaid private client credit USD',currentBalances.privateCredit===null?'Not loaded':(currentBalances.privateCredit/100).toFixed(2)],
 ['Current prepaid cafeteria credit USD',currentBalances.cafeteriaCredit===null?'Not loaded':(currentBalances.cafeteriaCredit/100).toFixed(2)]);
rows.push(['Total matchmaking revenue USD',(m.monthFinance.total/100).toFixed(2)],['Total commissions USD',(m.monthFinance.fee/100).toFixed(2)]);rows.push([],['Matchmaker','Games','Revenue USD','Commission Rate','Commission USD','Payment status']);for(const x of m.breakdown){const settlement=state.settlements.find(t=>(t.matchmaker_id||LEGACY_MATCHMAKER_ID)===(x.person.id||LEGACY_MATCHMAKER_ID)&&t.month_key===state.reportMonth+'-01');rows.push([x.person.name,x.games,(x.total/100).toFixed(2),(matchmakerRate(x.person)/100)+'%',(x.fee/100).toFixed(2),settlement?.status||'unpaid']);}}
 rows.push([],['Member','Team category','Logged games','Free','Half-price',weekly?'Week used':daily?'Daily total':'Monthly total',...(weekly?['Remaining*']:[])]);
 for(const r of m.rows)rows.push([r.member.name,groupLabel(r.member.team_category),r.played,r.free,r.half,r.used,...(weekly?[r.member.unlimited?'Unlimited':r.remaining]:[])]);
 rows.push([],['Date','Team members','Match benefit','Non-team players']);
 for(const match of m.validMatches.sort((a,b)=>a.played_on.localeCompare(b.played_on))){
  rows.push([match.played_on,m.games.filter(g=>g.match_id===match.id).map(g=>state.members.find(x=>x.id===g.member_id)?.name||'Unknown').join('; '),match.benefit_type,match.non_team_count??'Not recorded']);
 }
 const [financeStart,financeEnd]=reportRange();rows.push(...clubInsights.csvRows(financeStart,financeEnd));
 downloadCSV(rows,`padel-on-${state.reportMode}-${period}.csv`);
}
function downloadCSV(rows,filename){
 // Avoid formula execution when exports are opened in spreadsheet programs.
 const safe=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const csv=rows.map(row=>row.map(safe).join(',')).join('\r\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();
 setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

function alternatingBenefitNext(player){
 return Number(player?.current_counter||0)%2===0?'free':'paid';
}
function otherPage(){return `${heading('Special arrangements','Other Benefits','Track free-game eligibility outside the regular team allowances.',state.staff?.role==='admin'?btn(`${icon('plus')} Add Player`,'new-other','btn-primary'):'')}
<div class="other-grid">${state.special.filter(p=>p.active).map(p=>{
 const weekly=p.status==='one_free_per_week'?getWeeklyFreeGameStatus(p,today(),state.specialGames):null;
 const info=p.status==='one_free_per_week'?[weekly.available?'1 Free Game Available':'Free Game Used This Week',weekly.available?'green':'amber']:p.status==='alternating_free_paid'?[alternatingBenefitNext(p)==='free'?'Next Game Free':'Next Game Paid',alternatingBenefitNext(p)==='free'?'green':'amber']:p.status==='next_free'?['Next Game Free','green']:p.status==='rule_not_configured'?['Rule Not Configured','gray']:p.status==='counting'?[p.threshold?`${Math.max(0,p.threshold-p.current_counter)} Until Free`:'Counting','amber']:['Needs Confirmation','amber'];
 const note=p.status==='one_free_per_week'?(weekly.available?`One free game is available for ${weekLabel(today())}.`:`The free game for ${weekLabel(today())} has already been used.`):p.status==='alternating_free_paid'?`Alternating benefit: free game → paid game → free game. ${p.current_counter} game(s) recorded in this cycle.`:p.status==='next_free'?'This player has a free game waiting.':p.slug==='rami-al-rifai'&&p.status==='counting'?`${Math.max(0,5-p.current_counter)} more paid game(s) before a free game.`:p.status==='rule_not_configured'?'Eligibility conditions have not been set.':'Confirm the player’s next-game benefit.';
 return `<article class="other-card"><div class="member-top"><div class="player-avatar">${esc(initials(p.name))}</div><div class="player-title"><strong>${esc(p.name)}</strong><small>Special benefit</small></div></div>${tag(info[0],info[1])}<div class="other-note">${note}</div><div class="player-row" style="margin-bottom:18px"><span class="game-caption">${p.status==='alternating_free_paid'?'Games in cycle':'Games counter'}</span><span class="other-count num">${p.current_counter}</span></div><div class="card-bottom">${btn(`${icon('plus')} Record Game`,'record-other','btn-soft',`data-id="${p.id}"`)}${state.staff?.role==='admin'?btn(icon('edit'),'edit-other','btn-light btn-icon history-button',`data-id="${p.id}" title="Edit player"`):''}</div></article>`
 }).join('')}</div>`}

function risingStarsMembers(){return state.members.filter(m=>m.active&&m.team_category==='rising_stars').sort((a,b)=>a.name.localeCompare(b.name));}
function trainingMonthData(){
 const sessions=state.trainingSessions.filter(s=>!s.voided_at&&monthKey(s.session_date)===state.trainingMonth).sort((a,b)=>b.session_date.localeCompare(a.session_date)||(b.start_time||'').localeCompare(a.start_time||''));
 const sessionIds=new Set(sessions.map(s=>s.id));
 const attendance=state.trainingAttendance.filter(a=>!a.voided_at&&sessionIds.has(a.session_id));
 const attended=new Set(attendance.map(a=>a.member_id));
 const members=risingStarsMembers();
 return {sessions,attendance,attended,members,used:members.filter(m=>attended.has(m.id)).length,remaining:members.filter(m=>!attended.has(m.id)).length};
}
let trainingLoadSequence=0;
async function loadTrainingMonth(){
 if(!api.getSession()?.access_token||!state.staff)return;
 const target=state.trainingMonth,seq=++trainingLoadSequence;
 const start=target+'-01',end=addDays(shiftMonth(target,1)+'-01',-1);
 state.trainingLoading=true;state.trainingError=null;state.trainingLoadedMonth=null;
 if(state.tab==='training')render();
 try{
  const [sessions,attendance]=await Promise.all([
   api.listAll('training_sessions','session_date=gte.'+start+'&session_date=lte.'+end),
   api.listAll('training_attendance','month_key=eq.'+start)
  ]);
  if(seq!==trainingLoadSequence||!api.getSession()?.access_token)return;
  state.trainingSessions=sessions;state.trainingAttendance=attendance;state.trainingLoadedMonth=target;
 }catch(e){
  if(seq===trainingLoadSequence&&api.getSession()?.access_token)state.trainingError=e?.message||'Unable to retrieve monthly training.';
 }finally{
  if(seq===trainingLoadSequence){
   state.trainingLoading=false;
   if(state.tab==='training'&&api.getSession()?.access_token)render();
  }
 }
}


function trainingPage(){
 const ym=state.trainingMonth,ready=!state.trainingLoading&&!state.trainingError&&state.trainingLoadedMonth===ym;
 const d=ready?trainingMonthData():null;
 const sessionRows=d?d.sessions.map(se=>{
  const people=d.attendance.filter(a=>a.session_id===se.id).map(a=>state.members.find(m=>m.id===a.member_id)?.name||'Member').join(' & ');
  return `<tr><td>${niceDay(se.session_date)}</td><td><strong>${esc(people)}</strong>${se.solo_exception?'<br/><small>Solo exception</small>':''}</td><td>${se.start_time?esc(String(se.start_time).slice(0,5)):'—'}</td><td>${se.duration_minutes} min</td><td>${esc(se.notes||'—')}</td><td>${state.staff?.role==='admin'?btn('Void','void-training','btn-danger btn-xs',`data-id="${se.id}"`):'<span class="tiny">Recorded</span>'}</td></tr>`;
 }).join(''):'';
 const memberRows=d?d.members.map(m=>{
  const att=d.attendance.find(a=>a.member_id===m.id),session=att?d.sessions.find(se=>se.id===att.session_id):null;
  return `<div class="training-member"><div class="player-avatar">${esc(initials(m.name))}</div><div class="training-member-name"><strong>${esc(m.name)}</strong><small>${session?'Completed '+niceDay(session.session_date):'Monthly session available'}</small></div>${tag(session?'Completed':'Available',session?'green':'amber')}</div>`;
 }).join(''):'';
 return `${heading('Rising Stars / Coach Khalil','Monthly Training','One free training entitlement per Rising Stars member every calendar month.',btn(`${icon('plus')} Record Session`,'add-training','btn-primary',!ready?'disabled':''))}
<div class="period-control"><div><strong>${icon('calendar')} ${monthLabel(ym)}</strong><small>Coach Khalil · 45 minutes by default · normally 2 players</small></div><div class="period-buttons"><button class="btn btn-light" data-action="training-prev-month" aria-label="Previous month">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="training-next-month" ${ym>=monthKey(today())?'disabled':''} aria-label="Next month">${icon('chevronRight')}</button></div></div>
${!ready?`<div class="panel-empty">${state.trainingLoading?'Loading monthly training records…':state.trainingError?'Unable to load: '+esc(state.trainingError):'Loading training…'}</div>`:`
<section class="finance-grid">${summaryCard('Eligible players',d.members.length,'Active Rising Stars members','users',true)}${summaryCard('Already trained',d.used,'Used this month','check')}${summaryCard('Still available',d.remaining,'Free sessions remaining','calendar')}</section>
<div class="training-actions"><div class="notice">${icon('info')} One free session per player per month. Normally two players train together; a solo exception needs a reason. Weekly game benefits are unaffected.</div>${btn(`${icon('download')} Export Monthly CSV`,'export-training','btn-light')}${btn('Print / Save PDF','print-training','btn-light')}</div>
<article class="panel training-panel"><div class="panel-head"><div><h2>Monthly player status</h2><p>${monthLabel(ym)} · ${d.used} of ${d.members.length} completed</p></div></div><div class="training-members">${memberRows||'<div class="panel-empty">No active Rising Stars members. Check team classifications.</div>'}</div></article>
<article class="panel"><div class="panel-head"><div><h2>Sessions with Coach Khalil</h2><p>${d.sessions.length} sessions · ${d.attendance.length} player attendances</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players</th><th>Time</th><th>Duration</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${sessionRows||'<tr><td colspan="6" class="panel-empty">No sessions recorded this month.</td></tr>'}</tbody></table></div></article>
<div class="archive-note">Training attendance is saved across months. Corrections require administrator authorization and are audited. This does not reset or change weekly padel games.</div>`}`;
}
function exportTrainingCSV(){
 if(state.trainingLoadedMonth!==state.trainingMonth||state.trainingLoading||state.trainingError)throw Error('Load a training month first.');
 const d=trainingMonthData(),ym=state.trainingMonth;
 const rows=[['PADEL ON','Monthly Rising Stars Training',monthLabel(ym)],['Coach','Coach Khalil'],['Eligible',d.members.length],['Trained',d.used],['Remaining',d.remaining],[],['Member','Status','Training date','Duration (min)','Coach']];
 for(const m of d.members){
  const att=d.attendance.find(a=>a.member_id===m.id),se=att?d.sessions.find(x=>x.id===att.session_id):null;
  rows.push([m.name,se?'Completed':'Not yet',se?.session_date||'',se?.duration_minutes||'',se?'Coach Khalil':'']);
 }
 rows.push([],['Date','Start time','Player names','Duration (min)','Solo exception','Notes']);
 for(const se of d.sessions){
  rows.push([se.session_date,se.start_time||'',d.attendance.filter(a=>a.session_id===se.id).map(a=>state.members.find(m=>m.id===a.member_id)?.name||'Member').join(' & '),se.duration_minutes,se.solo_exception?'Yes':'No',se.notes]);
 }
 downloadCSV(rows,'padel-on-training-'+ym+'.csv');
}

function debtPersonTransactions(id){
 return state.debtEntries.filter(e=>e.person_id===id&&!e.voided_at)
  .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}

function debtOutstanding(id){
 return debtPersonTransactions(id).reduce((sum,e)=>sum+(e.entry_type==='charge'?Number(e.amount_cents):-Number(e.amount_cents)),0);
}

function debtBalanceLabel(cents){return cents>0?'Owes '+amount(cents):cents<0?'Credit '+amount(-cents):'Paid in full';}

function debtPage(){
 const ready=state.debtLoaded&&!state.debtError;
 const all=state.debtPeople.filter(p=>!p.deleted_at),owed=all.reduce((sum,p)=>sum+Math.max(0,debtOutstanding(p.id)),0);
 const credit=all.reduce((sum,p)=>sum+Math.max(0,-debtOutstanding(p.id)),0);
 const open=all.filter(p=>debtOutstanding(p.id)>0);
 const paidTotal=state.debtEntries.filter(e=>e.entry_type==='payment'&&!e.voided_at).reduce((sum,e)=>sum+Number(e.amount_cents),0);
 const selected=all.find(p=>p.id===state.debtSelected)||all[0]||null;
 const header=heading('Cafeteria / running balances','Cafeteria Debts','Track unpaid purchases, partial payments, and prepaid cafeteria credit in one account.',btn(`${icon('plus')} New Person`,'debt-new-person','btn-primary',ready?'':'disabled')+(ready?btn(`${icon('download')} Export Statement`,'debt-export','btn-light',selected?'':'disabled'):''));
 if(!ready)return `${header}<article class="panel"><div class="empty-prompt"><strong>${state.debtLoading?'Loading cafeteria debt records…':state.debtError?'Database setup required':'Loading cafeteria debts…'}</strong><span>${state.debtError?esc(state.debtError):'This debt ledger is separate from Private Sessions and other balances.'}</span>${state.debtError?btn('Retry','debt-retry','btn-light'):''}</div></article>`;
 const metrics=`<section class="finance-grid four-up">${summaryCard('Outstanding debt',amount(owed),'Amount customers still owe','wallet',true)}${summaryCard('Prepaid credit',amount(credit),'Available for future purchases','gift')}${summaryCard('People owing',open.length,'Accounts with balance due','users')}${summaryCard('Payments received',amount(paidTotal),'All recorded payments','activity')}</section>`;
 const displayed=all.filter(p=>(state.debtFilter!=='open'||debtOutstanding(p.id)>0)&&(state.debtFilter!=='settled'||debtOutstanding(p.id)===0)&&(state.debtFilter!=='credit'||debtOutstanding(p.id)<0)).filter(p=>!state.debtSearch||p.name.toLowerCase().includes(state.debtSearch.toLowerCase())).sort((a,b)=>debtOutstanding(b.id)-debtOutstanding(a.id)||a.name.localeCompare(b.name));
 const filters=`<div class="debt-filter-controls"><label class="search">${icon('search')}<input id="debt-search" autocomplete="off" placeholder="Find a person…" value="${esc(state.debtSearch)}"/></label><select id="debt-filter" class="select" aria-label="Debt status"><option value="all" ${state.debtFilter==='all'?'selected':''}>All people</option><option value="open" ${state.debtFilter==='open'?'selected':''}>Unpaid</option><option value="credit" ${state.debtFilter==='credit'?'selected':''}>Prepaid credit</option><option value="settled" ${state.debtFilter==='settled'?'selected':''}>Paid in full</option></select></div>`;
 const directory=`<article class="panel debt-directory"><div class="panel-head"><div><h2>Cafeteria accounts</h2><p>${open.length} unpaid · ${all.length} total</p></div></div>${filters}<div class="debt-people-list">${displayed.map(p=>{
 const remaining=debtOutstanding(p.id);
 return `<button class="debt-person-item ${selected?.id===p.id?'selected':''}" data-action="debt-select-person" data-id="${p.id}"><div><strong>${esc(p.name)}</strong>${p.active?'':tag('Inactive','amber')}</div><span class="debt-person-sub">${remaining>0?'Remaining to pay':remaining<0?'Prepaid credit':'Paid in full'}</span><b class="${remaining>0?'debt-owing':'debt-clear'}">${remaining<0?amount(-remaining)+' credit':amount(remaining)}</b></button>`;
 }).join('')||'<div class="panel-empty">No matching people.</div>'}</div></article>`;
 if(!selected)return `${header}${metrics}<div class="debt-layout">${directory}<article class="panel"><div class="empty-prompt"><strong>No cafeteria accounts yet</strong><span>Add someone along with their starting debt to begin.</span>${btn(`${icon('plus')} Add First Person`,'debt-new-person','btn-primary')}</div></article></div>`;
 const balance=debtOutstanding(selected.id);
 let accumulated=0;
 const history=debtPersonTransactions(selected.id).map(e=>{accumulated+=e.entry_type==='charge'?Number(e.amount_cents):-Number(e.amount_cents);return {e,running:accumulated}}).reverse();
 const details=`<article class="panel debt-details">
 <div class="debt-person-header"><div><div class="eyebrow">Cafeteria account</div><h2>${esc(selected.name)}</h2><p>${esc(selected.notes||'Cafeteria purchases and payments')}${selected.active?'':' · Inactive'}</p></div><div class="debt-total ${balance<=0?'cleared':''}"><small>${balance>0?'Remaining debt':balance<0?'Prepaid credit':'Account status'}</small><strong>${balance>0?amount(balance):balance<0?amount(-balance):'Paid in full'}</strong></div></div>
 <div class="debt-person-actions">${btn(`${icon('plus')} Add Debt`,'debt-add-charge','btn-primary',selected.active?'':'disabled')}${btn('Record Payment / Add Credit','debt-add-payment','btn-light',selected.active?'':'disabled')}${btn('Edit Person','debt-edit-person','btn-light')}</div>
 <div class="debt-info-text">${balance>0?'Partial payments reduce the outstanding balance. You can also pay extra to leave prepaid credit.':balance<0?'Prepaid credit is automatically used for future cafeteria purchases.':'The balance is zero. Payments can add prepaid credit and new purchases can reopen the account.'}</div>
 <div class="panel-head"><div><h2>Purchases & payments</h2><p>${history.length} recorded transactions · latest first</p></div></div>
 <div class="data-table-wrap"><table class="data-table debt-transactions"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Remaining after</th><th>Notes</th><th>Correction</th></tr></thead><tbody>
 ${history.map(({e,running})=>`<tr><td>${niceDay(e.entry_date)}</td><td>${e.entry_type==='charge'?tag('New debt','amber'):tag('Payment','green')}</td><td><strong class="${e.entry_type==='payment'?'debt-clear':'debt-owing'}">${e.entry_type==='payment'?'−':'+'}${amount(e.amount_cents)}</strong></td><td>${debtBalanceLabel(running)}</td><td>${esc(e.notes||'—')}</td><td>${state.staff?.role==='admin'?btn('Void','debt-void','btn-danger btn-xs',`data-id="${e.id}"`):'<span class="tiny">Recorded</span>'}</td></tr>`).join('')||'<tr><td colspan="6" class="panel-empty">No cafeteria transactions yet.</td></tr>'}
 </tbody></table></div></article>`;
 return `${header}${metrics}<div class="debt-layout">${directory}${details}</div>`;
}

function debtExport(){
 const person=state.debtPeople.find(p=>p.id===state.debtSelected);
 if(!person||!state.debtLoaded||state.debtError)throw Error('Select a person with loaded history.');
 const rows=[['PADEL ON','Cafeteria Debt Statement'],['Person',person.name],[],['Purchase / Payment Date','Type','Amount USD','Signed Balance USD (negative means credit)','Notes']];
 let balance=0;
 for(const e of debtPersonTransactions(person.id)){balance+=e.entry_type==='charge'?Number(e.amount_cents):-Number(e.amount_cents);rows.push([e.entry_date,e.entry_type,(Number(e.amount_cents)/100).toFixed(2),(balance/100).toFixed(2),e.notes]);}
 rows.push([],['Final status',debtBalanceLabel(balance)],['Signed balance USD',(balance/100).toFixed(2)]);
 downloadCSV(rows,'padel-on-cafeteria-'+person.name.replace(/[^a-z0-9_-]+/gi,'-')+'.csv');
}
function privateClientEntries(id){
 return state.privateEntries.filter(row=>row.client_id===id&&!row.voided_at).sort((a,b)=>a.entry_date.localeCompare(b.entry_date)||a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
}

function privateEntryDelta(entry){
 return Number(entry.deposit_cents||0)+Number(entry.paid_cents||0)-Number(entry.session_fee_cents||0);
}

function privateClientBalance(client){
 return Number(client.opening_balance_cents||0)+privateClientEntries(client.id).reduce((sum,row)=>sum+privateEntryDelta(row),0);
}

function privateBalanceLabel(cents){
 return cents<0?'Owes '+amount(-cents):'Credit '+amount(cents);
}

function privateCoachName(id){
 const coach=state.privateCoaches.find(x=>x.id===id);
 return coach?`${coach.name} · Category ${coach.category}`:'Unknown coach';
}

function comparePrivateClients(a,b,sort=state.privateSort){
 const nameOrder=a.name.localeCompare(b.name,undefined,{sensitivity:'base',numeric:true});
 if(sort!=='id')return nameOrder;
 const idA=String(a.client_code||'').trim(),idB=String(b.client_code||'').trim();
 if(!idA)return idB?1:nameOrder;
 if(!idB)return -1;
 const idOrder=idA.localeCompare(idB,undefined,{numeric:true,sensitivity:'base'});
 return idOrder||nameOrder;
}
function privateDayEntries(day=state.privateDay,type='session'){
 return state.privateEntries.filter(e=>!e.voided_at&&e.entry_date===day&&e.entry_type===type)
  .sort((a,b)=>(a.created_at||'').localeCompare(b.created_at||'')||a.id.localeCompare(b.id));
}
function privateDateInMonth(ym,preferredDay){
 const lastDay=Number(addDays(shiftMonth(ym,1)+'-01',-1).slice(-2));
 const candidate=ym+'-'+String(Math.min(Number(preferredDay),lastDay)).padStart(2,'0');
 return candidate>today()?today():candidate;
}
function privateDailySessionsPanel(){
 const day=state.privateDay,ym=monthKey(day),limit=today();
 const end=addDays(shiftMonth(ym,1)+'-01',-1),days=Number(end.slice(-2));
 const dailySessions=privateDayEntries(day,'session'),dailyDeposits=privateDayEntries(day,'deposit');
 const monthlySessions=state.privateEntries.filter(e=>!e.voided_at&&e.entry_type==='session'&&monthKey(e.entry_date)===ym);
 const counts=Object.create(null);
 for(const session of monthlySessions)counts[session.entry_date]=(counts[session.entry_date]||0)+1;
 const fee=dailySessions.reduce((sum,e)=>sum+Number(e.session_fee_cents||0),0);
 const paid=dailySessions.reduce((sum,e)=>sum+Number(e.paid_cents||0),0);
 const deposits=dailyDeposits.reduce((sum,e)=>sum+Number(e.deposit_cents||0),0);
 const dayControls=`<div class="private-daily-nav">
 <button type="button" class="btn btn-light btn-icon" data-action="private-day-prev" title="Previous day" aria-label="Previous day">${icon('chevronLeft')}</button>
 <input id="private-day-date" aria-label="Choose session date" type="date" value="${day}" max="${limit}"/>
 <button type="button" class="btn btn-light btn-icon" data-action="private-day-next" title="Next day" aria-label="Next day" ${day>=limit?'disabled':''}>${icon('chevronRight')}</button>
 <button class="btn btn-light" data-action="private-day-today" ${day===limit?'disabled':''}>Today</button></div>`;
 const weekdayOffset=(new Date(ym+'-01T12:00:00Z').getUTCDay()+6)%7;
 const calendarHeader=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(day=>`<span class="private-calendar-weekday">${day}</span>`).join('');
 const calendarOffset=Array.from({length:weekdayOffset},()=>'<span class="private-calendar-placeholder" aria-hidden="true"></span>').join('');
 const dayButtons=Array.from({length:days},(_,i)=>{
  const d=ym+'-'+String(i+1).padStart(2,'0'),n=counts[d]||0,disabled=d>limit;
  return `<button type="button" class="private-calendar-day ${day===d?'selected':''} ${n?'has-sessions':''}" data-action="private-day-select" data-day="${d}" ${disabled?'disabled':''} aria-label="${esc(niceDay(d,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}, ${n} sessions" aria-pressed="${day===d}"><span>${i+1}</span>${n?`<small>${n}</small>`:'<small class="private-calendar-dot">·</small>'}</button>`;
 }).join('');
 const summary=`<div class="private-day-summary"><div><span>Sessions</span><strong>${dailySessions.length}</strong></div><div><span>Session charges</span><strong>${amount(fee)}</strong></div><div><span>Paid at sessions</span><strong>${amount(paid)}</strong></div><div><span>Balance top-ups</span><strong>${amount(deposits)}</strong></div></div>`;
 const sessionRows=dailySessions.map(e=>{
  const client=state.privateClients.find(c=>c.id===e.client_id);
  return `<tr><td><strong>${esc(client?.name||'Unknown client')}</strong><br/><small>${esc(client?.client_code||'No client ID')}</small></td><td>${esc(privateCoachName(e.coach_id))}</td><td class="num">${amount(e.session_fee_cents)}</td><td class="num">${amount(e.paid_cents)}</td><td>${client&&!client.deleted_at?btn('View Client','private-open-from-day','btn-light btn-xs',`data-id="${client.id}"`):'—'}</td></tr>`;
 }).join('');
 const depositRows=dailyDeposits.map(e=>{
  const client=state.privateClients.find(c=>c.id===e.client_id);
  return `<tr><td><strong>${esc(client?.name||'Unknown client')}</strong><br/><small>${esc(client?.client_code||'No client ID')}</small></td><td class="num">${amount(e.deposit_cents)}</td><td>${esc(e.notes||'—')}</td><td>${client&&!client.deleted_at?btn('View Client','private-open-from-day','btn-light btn-xs',`data-id="${client.id}"`):'—'}</td></tr>`;
 }).join('');
 return `<article class="panel private-daily-panel">
 <div class="private-daily-heading"><div><div class="eyebrow">Daily coaching activity</div><h2>${esc(niceDay(day,{weekday:'long',month:'long',day:'numeric',year:'numeric'}))}</h2><p>Browse each day to review all private sessions, coaches, charges and payments.</p></div>${dayControls}</div>
 <div class="private-month-nav"><button type="button" class="btn btn-light btn-icon" data-action="private-month-prev" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(ym)}</strong><small>${monthlySessions.length} sessions this month</small><button type="button" class="btn btn-light btn-icon" data-action="private-month-next" title="Next month" aria-label="Next month" ${ym>=monthKey(limit)?'disabled':''}>${icon('chevronRight')}</button></div>
 <div class="private-calendar-days" role="group" aria-label="Choose day in ${monthLabel(ym)}">${calendarHeader}${calendarOffset}${dayButtons}</div>
 ${summary}
 <div class="panel-head private-daily-table-title"><div><h2>Sessions on ${niceDay(day,{month:'short',day:'numeric'})}</h2><p>${dailySessions.length} session${dailySessions.length===1?'':'s'} · payments shown are amounts paid at each session</p></div></div>
 <div class="data-table-wrap"><table class="data-table private-daily-table"><thead><tr><th>Client / ID</th><th>Coach</th><th>Session fee</th><th>Paid at session</th><th>Account</th></tr></thead><tbody>${sessionRows||'<tr><td colspan="5" class="panel-empty">No private sessions recorded for this date.</td></tr>'}</tbody></table></div>
 ${dailyDeposits.length?`<div class="panel-head private-daily-table-title"><div><h2>Balance top-ups</h2><p>Deposits recorded this day, separate from session payments</p></div></div><div class="data-table-wrap"><table class="data-table private-daily-table"><thead><tr><th>Client / ID</th><th>Amount added</th><th>Notes</th><th>Account</th></tr></thead><tbody>${depositRows}</tbody></table></div>`:''}
 </article>`;
}
function privateClientsPage(){
 const ready=state.privateLoaded&&!state.privateError;
 const rows=state.privateClients.filter(c=>!c.deleted_at&&(state.privateShowArchived||c.active)&&(state.privateListFilter!=='owing'||privateClientBalance(c)<0)&&(!state.privateSearch||[c.name,c.client_code,c.contact].some(v=>String(v||'').toLowerCase().includes(state.privateSearch.toLowerCase())))).sort((a,b)=>comparePrivateClients(a,b));
 const selected=rows.find(c=>c.id===state.privateSelected)||rows[0]||null;
 const active=state.privateClients.filter(c=>c.active&&!c.deleted_at),stats=active.map(c=>({client:c,balance:privateClientBalance(c)}));
 const credit=stats.filter(x=>x.balance>0).reduce((sum,x)=>sum+x.balance,0);
 const owed=stats.filter(x=>x.balance<0).reduce((sum,x)=>sum-x.balance,0);
 const activeSessions=state.privateEntries.filter(r=>r.entry_type==='session'&&!r.voided_at);
 const controls=btn(`${icon('plus')} Add Client`,'private-add-client','btn-primary')+(ready?btn(`${icon('download')} Export Client CSV`,'private-export','btn-light',!selected?'disabled':''):'');
 const headline=heading('Client coaching','Private Sessions','Track client IDs, coaching sessions, payments, prepaid credit, and outstanding balances.',controls);
 if(!ready)return `${headline}<div class="panel"><div class="panel-body"><div class="empty-prompt"><strong>${state.privateLoading?'Loading private sessions…':state.privateError?'Private Sessions setup required':'Loading client records…'}</strong><span>${state.privateError?esc(state.privateError):'Client and coach records are visible only to authorized staff.'}</span>${state.privateError?btn('Try again','private-retry','btn-light'):''}</div></div></div>`;
 const intro=`<section class="finance-grid four-up">${summaryCard('Active clients',active.length,'Client profiles','users',true)}${summaryCard('Sessions recorded',activeSessions.length,'Across all recorded dates','calendar')}${summaryCard('Client credit',amount(credit),'Prepaid balances','wallet')}${summaryCard('Outstanding',amount(owed),'Total amount owed','activity')}</section>`;
 const search=`<div class="private-directory-head">
 <label class="search">${icon('search')}<input id="private-client-search" placeholder="Search by name or client ID…" autocomplete="off" value="${esc(state.privateSearch)}"/></label>
 <div class="private-directory-selects">
  <label class="private-filter-label">Show<select id="private-client-filter" class="select" aria-label="Filter clients by balance"><option value="all" ${state.privateListFilter==='all'?'selected':''}>All clients</option><option value="owing" ${state.privateListFilter==='owing'?'selected':''}>Owes us only</option></select></label>
  <label class="private-filter-label">Sort<select id="private-client-sort" class="select" aria-label="Sort clients"><option value="name" ${state.privateSort==='name'?'selected':''}>Name (A–Z)</option><option value="id" ${state.privateSort==='id'?'selected':''}>Client ID (numeric)</option></select></label>
 </div>
 <label class="private-archive-check"><input type="checkbox" id="private-show-archived" ${state.privateShowArchived?'checked':''}/> Include inactive clients</label>
 </div>`;

 const clientButtons=rows.map(c=>{
  const balance=privateClientBalance(c);
  return `<button type="button" class="private-client-row ${selected?.id===c.id?'selected':''}" data-action="private-select-client" data-id="${c.id}"><div class="private-client-heading"><strong>${esc(c.name)}</strong>${c.active?'':tag('Inactive','gray')}</div><small>${esc(c.client_code||'No ID assigned')}</small><span class="private-client-balance ${balance<0?'negative':''}">${privateBalanceLabel(balance)}</span></button>`;
 }).join('')||'<div class="panel-empty">No matching clients.</div>';
 const panel=`<article class="panel private-directory"><div class="panel-head"><div><h2>Clients</h2><p>${rows.length} shown · ${active.length} active${state.privateListFilter==='owing'?' · outstanding balances only':''}</p></div></div>${search}<div class="private-client-list">${clientButtons}</div></article>`;
 if(!selected){
  return `${headline}${intro}${privateDailySessionsPanel()}<div class="private-layout">${panel}<article class="panel"><div class="empty-prompt"><strong>${state.privateClients.length?'No clients match these filters':'No client records yet'}</strong><span>${state.privateClients.length?'Try All clients or clear the search to see the full list.':'Add a client to start tracking private coaching.'}</span>${state.privateClients.length?btn('Show All Clients','private-reset-filters','btn-light'):btn(`${icon('plus')} Add First Client`,'private-add-client','btn-primary')}</div></article></div>`;
 }
 const balance=privateClientBalance(selected),entries=privateClientEntries(selected.id),sessions=entries.filter(e=>e.entry_type==='session');
 let running=Number(selected.opening_balance_cents||0);
 const history=entries.map(e=>{running+=privateEntryDelta(e);return {entry:e,remaining:running}}).reverse();
 const details=`<div class="private-detail">
 <div class="private-detail-header"><div><div class="eyebrow">${esc(selected.client_code||'ID NOT ASSIGNED')}</div><h2>${esc(selected.name)}</h2><p>${selected.contact?esc(selected.contact):'Client account'} · ${sessions.length} session${sessions.length===1?'':'s'}</p></div><div class="private-balance-box ${balance<0?'negative':''}"><small>${balance<0?'Outstanding':'Account credit'}</small><strong>${amount(Math.abs(balance))}</strong></div></div>
 <div class="private-client-actions">${btn(`${icon('plus')} Record Session`,'private-record-session','btn-primary',selected.active?'':'disabled')}${btn('Add Balance','private-add-balance','btn-light',selected.active?'':'disabled')}${btn('Edit Client','private-edit-client','btn-light')}</div>
 <div class="private-account-note">Balance = opening balance + top-ups + paid amounts − session fees. A negative balance is money owed by the client.</div>
 <div class="panel-head private-ledger-head"><div><h2>Session & payment history</h2><p>${entries.length} entries · oldest records are preserved</p></div></div>
 <div class="data-table-wrap"><table class="data-table private-ledger-table"><thead><tr><th>Date</th><th>Type / coach</th><th>Charge</th><th>Paid / top-up</th><th>Balance</th><th>Action</th></tr></thead><tbody>
 ${history.length?history.map(({entry:e,remaining:v})=>`<tr><td>${niceDay(e.entry_date)}</td><td><strong>${e.entry_type==='session'?'Private session':'Balance top-up'}</strong><br/><small>${e.entry_type==='session'?esc(privateCoachName(e.coach_id)):esc(e.notes||'Deposit')}</small>${e.entry_type==='session'&&e.notes?`<br/><small>${esc(e.notes)}</small>`:''}</td><td>${e.entry_type==='session'?amount(e.session_fee_cents):'—'}</td><td>${amount(e.entry_type==='deposit'?e.deposit_cents:e.paid_cents)}</td><td class="${v<0?'private-negative':''}">${privateBalanceLabel(v)}</td><td>${state.staff?.role==='admin'?btn('Void','private-void-entry','btn-danger btn-xs',`data-id="${e.id}"`):'<span class="tiny">Recorded</span>'}</td></tr>`).join(''):'<tr><td colspan="6" class="panel-empty">No sessions or deposits recorded yet.</td></tr>'}
 </tbody></table></div>
 </div>`;
 return `${headline}${intro}${privateDailySessionsPanel()}<div class="private-layout">${panel}<article class="panel">${details}</article></div>`;
}

function exportPrivateClientCSV(){
 const c=state.privateClients.find(x=>x.id===state.privateSelected);
 if(!c||!state.privateLoaded||state.privateLoading)throw Error('Choose a client to export.');
 const rows=[['PADEL ON','Private Coaching Client Statement'],['Client ID',c.client_code||'Unassigned'],['Client',c.name],['Opening balance USD',(Number(c.opening_balance_cents)/100).toFixed(2)],[],['Date','Type','Coach','Session fee USD','Paid USD','Deposit USD','Running balance USD','Notes']];
 let running=Number(c.opening_balance_cents||0);
 for(const e of privateClientEntries(c.id)){
  running+=privateEntryDelta(e);
  rows.push([e.entry_date,e.entry_type,e.entry_type==='session'?privateCoachName(e.coach_id):'',(Number(e.session_fee_cents)/100).toFixed(2),(Number(e.paid_cents)/100).toFixed(2),(Number(e.deposit_cents)/100).toFixed(2),(running/100).toFixed(2),e.notes]);
 }
 rows.push([],['ENDING BALANCE USD',(running/100).toFixed(2)]);
 downloadCSV(rows,'padel-on-client-'+String(c.client_code||c.id).replace(/[^A-Za-z0-9_-]/g,'-')+'.csv');
}

function financePage(){
 if(!state.matchmakers.length)return legacyFinancePage();
 const person=selectedMatchmaker();if(!person)return '<div class="panel-empty">No matchmaking personnel configured.</div>';
 const f=financials(),sel=state.settlements.find(s=>s.matchmaker_id===person.id&&s.month_key===state.month+'-01');
 const paid=sel?.status==='paid',diff=Number(sel?.amount_paid_cents||0)-f.fee;
 const rate=(matchmakerRate(person)/100).toLocaleString('en-US',{maximumFractionDigits:2});
 const tabs=state.matchmakers.filter(p=>p.active||p.id===person.id).map(p=>`<button type="button" class="matchmaker-tab ${p.id===person.id?'selected':''}" data-action="select-matchmaker" data-id="${esc(p.id)}" aria-pressed="${p.id===person.id}">${esc(p.name)}</button>`).join('');
 const incomplete=person.name.startsWith('Legacy matchmaker')?`<div class="notice warn">${icon('alert')} Finish the private matchmaker name setup in Supabase. Historical data is preserved.</div>`:'';
 return `${heading('Matchmaking / commissions','Revenue & Commission',`Independent monthly ledger for ${esc(person.name)}.`,btn(`${icon('plus')} Add Matchmaking Game`,'add-nazih','btn-primary')+btn(`${icon('download')} Export CSV`,'export-finance','btn-light'))}
 <div class="matchmaker-switch"><div class="matchmaker-switch-label">Select matchmaker</div><div class="matchmaker-tabs" role="group" aria-label="Choose matchmaking person">${tabs}</div></div>
 ${incomplete}
 <div class="toolbar"><div class="money-note">Revenue collected from other players · figures in USD · ${esc(person.name)}</div><div class="month-control"><button data-action="prev-month" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(state.month)}</strong><button data-action="next-month" ${state.month>=monthKey(today())?'disabled':''} title="Next month" aria-label="Next month">${icon('chevronRight')}</button></div></div>
 <section class="finance-grid">${summaryCard('Revenue collected',amount(f.total),esc(person.name)+' · this month','wallet',true)}${summaryCard(`${rate}% commission`,amount(f.fee),'Calculated on monthly revenue','coins')}${summaryCard('Games recorded',f.games,'Selected person · selected month','calendar')}</section>
 <div class="settlement"><div><strong>Monthly settlement · ${esc(person.name)}</strong><small>${monthLabel(state.month)} · ${paid?`Marked paid on ${niceDay(sel.paid_on||sel.month_key)}`:'Not marked as paid'}${paid&&diff!==0?' · ⚠ Paid amount differs from current commission':''}</small></div><div class="inline-info">${tag(paid?'Paid':'Unpaid',paid?'green':'amber')}${state.staff?.role==='admin'?btn(`${icon('edit')} ${paid?'Edit Settlement':'Record Payment'}`,'settlement','btn-light'):''}</div></div>
 <article class="panel"><div class="panel-head"><div><h2>Matchmaking history</h2><p>${esc(person.name)} · ${monthLabel(state.month)} · ${f.rows.length} records</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players / Notes</th><th>Revenue collected</th><th>Game's ${rate}% share*</th><th>Actions</th></tr></thead><tbody>${f.rows.length?f.rows.map(row=>`<tr><td>${niceDay(row.played_on)}</td><td><strong>${esc(row.players||'Matchmaking game')}</strong><br/><small>${esc(row.notes||'—')}</small></td><td><strong class="num">${amount(row.amount_cents)}</strong></td><td class="num">${amount(matchmakingFee(row.amount_cents,person))}</td><td>${btn(icon('edit'),'edit-nazih','btn-light btn-icon btn-xs',`data-id="${row.id}" title="Edit"`)} ${btn(icon('trash'),'delete-nazih','btn-danger btn-icon btn-xs',`data-id="${row.id}" title="Remove"`)}</td></tr>`).join(''):'<tr><td colspan="5"><div class="empty-prompt"><strong>No matchmaking records</strong><span>Add a game for this person to track the monthly revenue.</span></div></td></tr>'}</tbody></table></div></article>
 <div class="archive-note">* Per-game shares are illustrative. The amount payable is calculated by applying ${rate}% to this person's <strong>entire monthly revenue</strong> and rounding once. Historical records are not reset weekly. Each person's ledger and settlement are independent.</div>`;
}
function legacyFinancePage(){const person=selectedMatchmaker();const rate=(matchmakerRate(person)/100).toLocaleString('en-US',{maximumFractionDigits:2});const f=financials(),sel=state.settlements.find(s=>s.month_key===state.month+'-01');const paid=sel?.status==='paid';const diff=Number(sel?.amount_paid_cents||0)-f.fee;return `${heading('Matchmaking / Nazih Sonbol','Revenue & Commission','Every matchmaking game is saved permanently. Monthly totals are kept separately.',btn(`${icon('plus')} Add Matchmaking Game`,'add-nazih','btn-primary'))}
<div class="toolbar"><div class="money-note">Revenue collected from other players · all figures USD</div><div class="month-control"><button data-action="prev-month" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(state.month)}</strong><button data-action="next-month" ${state.month>=monthKey(today())?'disabled':''} title="Next month" aria-label="Next month">${icon('chevronRight')}</button></div></div>
<section class="finance-grid">${summaryCard('Revenue collected',amount(f.total),'From other players','wallet',true)}${summaryCard(`${esc(person?.name||'Matchmaker')}’s ${rate}% commission`,amount(f.fee),'Calculated monthly','coins')}${summaryCard('Games recorded',f.games,'This selected month','calendar')}</section>
<div class="settlement"><div><strong>Monthly settlement · ${monthLabel(state.month)}</strong><small>${paid?`Marked paid on ${niceDay(sel.paid_on||sel.month_key)}`:'Not marked as paid'}${paid&&diff!==0?' · ⚠ Paid amount differs from current commission':''}</small></div><div class="inline-info">${tag(paid?'Paid':'Unpaid',paid?'green':'amber')}${state.staff?.role==='admin'?btn(`${icon('edit')} ${paid?'Edit Settlement':'Record Payment'}`,'settlement','btn-light'):''}</div></div>
<article class="panel"><div class="panel-head"><div><h2>Matchmaking history</h2><p>${monthLabel(state.month)} · ${f.rows.length} records</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players / Notes</th><th>Revenue collected</th><th>Game's ${rate}% share*</th><th>Actions</th></tr></thead><tbody>${f.rows.length?f.rows.map(r=>`<tr><td>${niceDay(r.played_on)}</td><td><strong>${esc(r.players||'Matchmaking game')}</strong><br/><small>${esc(r.notes||'—')}</small></td><td><strong class="num">${amount(r.amount_cents)}</strong></td><td class="num">${amount(matchmakingFee(r.amount_cents,person))}</td><td>${btn(icon('edit'),'edit-nazih','btn-light btn-icon btn-xs',`data-id="${r.id}" title="Edit"`)} ${btn(icon('trash'),'delete-nazih','btn-danger btn-icon btn-xs',`data-id="${r.id}" title="Delete"`)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty-prompt">${icon('wallet')}<strong>No matchmaking records</strong><span>Add a game to start tracking revenue for this month.</span></div></td></tr>`}</tbody></table></div></article><div class="archive-note">* Per-game shares are illustrative. The amount payable is calculated by applying ${rate}% to the <strong>entire monthly revenue</strong> and rounding once. Historical financial records are not cleared by weekly resets.</div>`}
function activityPage(){const recent=recentActivity(10000,state.activitySearch);return `${heading('History','Game Activity','Review games from the last 30 days. Older records remain archived in the database.',btn(`${icon('refresh')} Refresh`,'refresh','btn-light'))}<div class="toolbar"><label class="search">${icon('search')}<input id="activity-search" placeholder="Search player…" value="${esc(state.activitySearch)}"/></label><span class="tiny">${recent.length} entries</span></div><article class="panel"><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Player(s)</th><th>Benefit type</th><th>Reference</th><th>Action</th></tr></thead><tbody>${recent.length?recent.map(r=>`<tr><td>${niceDay(r.date)}</td><td><strong>${esc(r.names)}</strong></td><td>${tag(r.type,r.type==='Paid Game'?'gray':'green')}</td><td><small>${esc(r.ref.slice(0,8))}…</small></td><td>${r.kind==='team'?btn('Void match','void-match','btn-danger btn-xs',`data-id="${r.key}"`):'<span class="tiny">Saved entry</span>'}</td></tr>`).join(''):'<tr><td colspan="5" class="panel-empty">No activity found.</td></tr>'}</tbody></table></div></article>`}
function adminAccountManagementCards(section='all'){
 const privReady=state.privateLoaded&&!state.privateError;
 const cafeReady=state.debtLoaded&&!state.debtError;
 const priv=state.privateClients.find(c=>c.id===state.settingsPrivateAccountId)||null;
 const cafe=state.debtPeople.find(c=>c.id===state.settingsCafeteriaAccountId)||null;
 function options(rows,chosen,balanceFunc){
  return '<option value="">Select an account…</option>'+rows.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(c=>
   '<option value="'+esc(c.id)+'" '+(c.id===chosen?'selected':'')+'>'+esc(c.name)+
   (c.client_code?' · ID '+esc(c.client_code):'')+
   (c.deleted_at?' · REMOVED':'')+' · '+(balanceFunc(c)===0?'Settled':balanceFunc(c)>0?'Owes '+amount(balanceFunc(c)):'Credit '+amount(-balanceFunc(c)))+'</option>'
  ).join('');
 }
 const privateOptions=options(state.privateClients,state.settingsPrivateAccountId,c=>-privateClientBalance(c));
 const cafeOptions=options(state.debtPeople,state.settingsCafeteriaAccountId,c=>debtOutstanding(c.id));
 const privZero=priv?privateClientBalance(priv)===0:false;
 const cafeZero=cafe?debtOutstanding(cafe.id)===0:false;
 const privateStatus=!privReady?'Loading client data or migration required.':priv?(priv.deleted_at?'Removed — history retained':privZero?'Balance settled — removal permitted':'Cannot remove: customer credit or debt is not zero.'):'Select the client to manage.';
 const cafeStatus=!cafeReady?'Loading cafeteria data or migration required.':cafe?(cafe.deleted_at?'Removed — history retained':cafeZero?'Balance settled — removal permitted':'Cannot remove: customer debt or prepaid credit is not zero.'):'Select the person to manage.';
 const privateCard=`<article class="panel settings-box admin-account-box"><h3>Private Sessions accounts</h3><p>Remove or restore an account. Removal hides the client from the working list but keeps sessions, payments, client IDs and audit history.</p>
 <label class="form-field"><span>Client</span><select id="settings-private-account" class="form-input" ${!privReady?'disabled':''}>${privateOptions}</select></label>
 <small class="admin-account-status">${esc(privateStatus)}</small><div class="admin-account-buttons">
 ${btn('Remove Client','settings-private-remove','btn-danger',!priv||priv.deleted_at||!privZero?'disabled':'')}
 ${btn('Restore Client','settings-private-restore','btn-light',!priv||!priv.deleted_at?'disabled':'')}</div></article>`;
 const cafeteriaCard=`<article class="panel settings-box admin-account-box"><h3>Cafeteria accounts</h3><p>Remove or restore a cafeteria account. Purchases and partial payments remain in its permanent financial history.</p>
 <label class="form-field"><span>Person</span><select id="settings-cafeteria-account" class="form-input" ${!cafeReady?'disabled':''}>${cafeOptions}</select></label>
 <small class="admin-account-status">${esc(cafeStatus)}</small><div class="admin-account-buttons">
 ${btn('Remove Account','settings-cafe-remove','btn-danger',!cafe||cafe.deleted_at||!cafeZero?'disabled':'')}
 ${btn('Restore Account','settings-cafe-restore','btn-light',!cafe||!cafe.deleted_at?'disabled':'')}</div></article>`;
 if(section==='private')return privateCard;
 if(section==='cafeteria')return cafeteriaCard;
 return privateCard+cafeteriaCard;
}
function canUseOrderLists(){return Boolean(api.getSession()?.access_token&&['admin','staff'].includes(state.staff?.role));}
function matchmakerCommissionSettings(){
 if(state.staff?.role!=='admin')return '';
 const people=state.matchmakers.slice().sort((a,b)=>a.name.localeCompare(b.name));
 const rows=people.map(person=>{
  const rate=(matchmakerRate(person)/100).toLocaleString('en-US',{maximumFractionDigits:2});
  const value=String(matchmakerRate(person)/100);
  return '<form id="commission-rate-'+esc(person.id)+'" data-save="save-matchmaker-rate" data-matchmaker-id="'+esc(person.id)+'" style="display:flex;align-items:end;gap:12px;flex-wrap:wrap;border-top:1px solid var(--border);padding:12px 0 0;margin-top:12px">'+
   '<div style="flex:1;min-width:160px"><strong>'+esc(person.name)+'</strong><small style="display:block;color:var(--muted)">Current rate: '+rate+'%</small></div>'+
   '<div style="width:150px;max-width:100%">'+field('commission_percent','Commission (%)',value,'number','required min="0" max="100" step="0.01"')+'</div>'+
   '<button type="submit" class="btn btn-primary">Save Rate</button></form>';
 }).join('');
 return '<article class="panel settings-box"><h3>Matchmaking commissions</h3><p>Set the commission percentage for each matchmaker. Saving a rate updates matchmaking summaries, report totals, monthly boxes, and CSV exports.</p>'+
  (rows||'<div class="notice">No matchmakers are configured yet.</div>')+'</article>';
}
function settingsPage(){
 const admin=state.staff?.role==='admin';
 const listsEnabled=canUseOrderLists();
 const orderListsCard=listsEnabled?'<article class="panel settings-box order-lists-box"><h3>Order Lists</h3><div class="order-list-options"><section class="order-list-option"><h4>Order Counter</h4><p>Count stock items, prepare a complete restocking message, and copy it for WhatsApp.</p>'+btn(icon('list')+' Open Order Counter','open-order-counter','btn-primary')+'</section><section class="order-list-option"><h4>Reem’s Items List</h4><p>Prepare Reem’s delivery order separately from the original supplier list. Copy the complete message for WhatsApp.</p>'+btn(icon('list')+' Open Reem’s Items List','open-reem-items','btn-light')+'</section></div></article>':'';
 return `${heading('Administration','Settings','Manage allowances, update players, and protect sensitive changes.',btn(`${icon('logout')} Sign out`,'signout','btn-light'))}<div class="notice warn">${icon('shield')} Manual resets are verified by a server-side Supabase Edge Function. The reset code is never exposed in the public website files.</div><div class="settings-grid"><article class="panel settings-box"><h3>Team roster</h3><p>Create team members, edit weekly allowances, and deactivate members while keeping their history.</p>${btn(`${icon('plus')} Add Member`,'new-member','btn-primary',admin?'':'disabled')}${btn(`${icon('edit')} Edit Member`,'choose-member-edit','btn-light',admin?'':'disabled')}</article><article class="panel settings-box"><h3>Manual weekly reset</h3><p>Reset a member or everyone for the active week. A reset changes the counting baseline but does not remove game records.</p>${btn('Reset One Member','reset-one','btn-light',admin?'':'disabled')}${btn('Reset All Members','reset-all','btn-danger',admin?'':'disabled')}</article><article class="panel settings-box"><h3>Database & security</h3><p>Live records use Supabase with Row-Level Security. Administrators can manage the roster and settlements.</p><div class="flex">${tag('Connected','green')}${tag((state.staff?.role||'Staff').toUpperCase(),'gray')}</div></article><article class="panel settings-box"><h3>Financial archive</h3><p>Matchmaking records are retained indefinitely unless deleted by an authorized staff member. Download a monthly CSV for your records.</p>${btn(`${icon('download')} Export Selected Month`,'export-finance','btn-light')}</article></div>${admin||listsEnabled?`<div class="settings-followup-grid ${admin?'':'single-column'}">${admin?'<div class="settings-followup-column">'+matchmakerCommissionSettings()+adminAccountManagementCards('private')+'</div>':''}<div class="settings-followup-column">${orderListsCard}${admin?adminAccountManagementCards('cafeteria'):''}</div></div>`:''}${admin?'<div class="archive-note">To add new staff accounts, create them in Supabase Auth and authorize them in the staff_profiles table. Do not share login passwords.</div>':''}`;
}
function renderPage(){switch(state.tab){case'dashboard':return dashboard();case'cafeteria-finances':return cafeteriaFinances.page();case'debts':return debtPage();case'team':return teamPage();case'other':return otherPage();case'finance':return financePage();case'training':return trainingPage();case'private-clients':return privateClientsPage();case'activity':return activityPage();case'reports':return reportsPage();case'settings':return settingsPage();case'order-counter':return canUseOrderLists()?orderCounter.orderCounterPage(state.staff?.id||state.staff?.email):settingsPage();case'reem-items':return canUseOrderLists()?reemItems.reemItemsPage(state.staff?.id||state.staff?.email):settingsPage();default:return dashboard()}}
function render(){
 if(['order-counter','reem-items'].includes(state.tab)&&!canUseOrderLists())state.tab='settings';
 const searchFocus=state.globalSearchOpen&&document.activeElement?.id==='global-search-input';
 const cursor=searchFocus?document.activeElement.selectionStart:null;
 app.innerHTML=shell();
 if(searchFocus){const input=document.getElementById('global-search-input');input?.focus();if(cursor!==null)input?.setSelectionRange(cursor,cursor);}
}
function field(name,label,value='',type='text',attr=''){return `<label class="form-field"><span>${label}</span><input class="form-input" name="${name}" type="${type}" value="${esc(value)}" ${attr}/></label>`}
function selectField(name,label,options,selected){return `<label class="form-field"><span>${label}</span><select class="form-input" name="${name}">${options.map(([val,lbl])=>`<option value="${esc(val)}" ${val===selected?'selected':''}>${esc(lbl)}</option>`).join('')}</select></label>`}
function textareaField(name,label,value=''){return `<label class="form-field"><span>${label}</span><textarea class="form-input" name="${name}" maxlength="500">${esc(value)}</textarea></label>`}
function debtModal(type,m){
 const person=state.debtPeople.find(p=>p.id===m.personId);
 if(type==='debt-person'){
  const edit=Boolean(person),title=edit?'Edit Cafeteria Account':'New Cafeteria Account';
  const content=`<form id="modal-form" data-save="save-debt-person">
  ${field('name','Person name',person?.name||'','text','required minlength="2" maxlength="120"')}
  ${edit?selectField('active','Account status',[['true','Active'],['false','Inactive']],person.active?'true':'false'):field('initial_debt','Initial amount owed ($)','0.00','number','required min="0" max="1000000000" step="0.01"')}
  ${edit?'':field('entry_date','Date of starting debt',today(),'date',`required max="${today()}"`)}
  ${textareaField('notes','Notes (optional)',person?.notes||'')}
  <div class="notice">${edit?'Historical purchases and payments remain unchanged.':'Enter a starting debt now, or leave $0.00 and add purchases later.'}</div>
  ${formActions(edit?'Save Person':'Create Person')}</form>`;
  return {title,subtitle:edit?'Rename or update this account without losing its history.':'New cafeteria credit account · independent from coaching',content};
 }
 if(type==='debt-charge'||type==='debt-payment'){
  const isCharge=type==='debt-charge';
  const due=person?debtOutstanding(person.id):0;
  const content=`<form id="modal-form" data-save="${isCharge?'save-debt-charge':'save-debt-payment'}">
    ${field('entry_date',isCharge?'Purchase date':'Payment date',today(),'date',`required max="${today()}"`)}
    ${field('amount',isCharge?'Amount to add to debt ($)':'Amount received ($)','','number',`required min="0.01" max="1000000000" step="0.01" placeholder="${isCharge?'25.00':'11.00'}"`)}
    ${textareaField('notes',isCharge?'Items purchased / notes':'Payment notes (optional)')}
    <div class="notice">${isCharge?'Adds to the existing amount owed. Previous payments remain recorded.':`Current account: ${debtBalanceLabel(due)}. You can pay less than you owe or add extra prepaid credit for future purchases.`}</div>
    ${formActions(isCharge?'Add Debt':'Record Payment')}</form>`;
  return {title:isCharge?'Add Cafeteria Debt':'Record Payment / Add Credit',subtitle:person?.name||'',content};
 }
 const entry=state.debtEntries.find(e=>e.id===m.id);
 const content=`<div class="notice warn">This correction is audited and changes the outstanding debt or prepaid credit. The original entry is kept in history as voided.</div>
 <form id="modal-form" data-save="void-debt-entry">${textareaField('reason','Reason for correction')}${formActions('Void Entry',true)}</form>`;
 return {title:'Correct Cafeteria Entry',subtitle:entry?.entry_type==='charge'?'Void a debt charge':'Void a recorded payment',content,danger:true};
}
function normalizePrivateClientId(value){return String(value??'').trim().toUpperCase();}
function privateClientIdOwner(value,editingId=null){
 const id=normalizePrivateClientId(value);
 if(!id)return null;
 // Includes inactive clients: archived IDs remain reserved.
 return state.privateClients.find(client=>
  client.id!==editingId&&normalizePrivateClientId(client.client_code)===id
 )||null;
}
function validatePrivateClientIdInput(){
 const form=document.querySelector('#modal-form[data-save="save-private-client"]');
 if(!form)return true;
 const input=form.querySelector('[name="client_code"]');
 const feedback=form.querySelector('#private-id-feedback');
 const submit=form.querySelector('#save-button');
 if(!input||!feedback||!submit)return true;
 const normalized=normalizePrivateClientId(input.value);
 const owner=privateClientIdOwner(normalized,state.modal?.clientId||null);
 input.setCustomValidity(owner?'This client ID is already assigned.':'');
 feedback.textContent=owner?
  'Already assigned to '+owner.name+'. Please choose another ID.':
  normalized?'This client ID is available.':'Optional. Enter an ID only if the client has one.';
 feedback.classList.toggle('duplicate',Boolean(owner));
 feedback.classList.toggle('available',Boolean(normalized)&&!owner);
 input.setAttribute('aria-invalid',owner?'true':'false');
 submit.disabled=Boolean(owner);
 return !owner;
}
function privateClientModal(type,m){
 const client=state.privateClients.find(c=>c.id===m.clientId);
 if(type==='private-client'){
  const edit=Boolean(client);
  const title=edit?'Edit Client':'Add Private Client';
  const subtitle=edit?'Update client information. Opening balance stays locked after creation.':'Client IDs are optional if no ID has been assigned yet.';
  const initial=edit?'':field('opening_balance','Opening balance ($) · negative = amount owed','0.00','number','required step="0.01" min="-1000000000" max="1000000000"');
  const content=`<form id="modal-form" data-save="save-private-client">
   ${field('name','Client name',client?.name||'','text','required maxlength="120"')}
   ${field('arabic_name','Arabic spelling for daily PDF (optional)',client?.arabic_name||'','text',`maxlength="120" dir="rtl" placeholder="${esc(client?.name?arabicDailyPdf.arabicClientName(client.name):'الاسم بالعربية')}"`)}
   <small class="form-hint">PDF names are automatically converted into Arabic. Enter a preferred spelling here if needed; the English client name remains unchanged.</small>
   ${field('client_code','Existing client ID (optional)',client?.client_code||'','text','maxlength="40" placeholder="Example: C1024" aria-describedby="private-id-feedback"')}<div class="private-id-feedback" id="private-id-feedback" aria-live="polite">IDs must be unique across all clients.</div>
   ${field('contact','Contact information (optional)',client?.contact||'','text','maxlength="120"')}
   ${initial}
   ${edit?selectField('active','Account status',[['true','Active'],['false','Inactive']],client.active?'true':'false'):''}
   ${textareaField('notes','Internal notes (optional)',client?.notes||'')}
   <div class="notice">Private client details are stored in Supabase and visible only to authorized PADEL ON staff.</div>
   ${formActions(edit?'Save Client':'Create Client')}</form>`;
  return {title,subtitle,content};
 }
 if(type==='private-session'){
  const options=state.privateCoaches.filter(c=>c.active).sort((a,b)=>a.category.localeCompare(b.category)||a.name.localeCompare(b.name));
  const grouped=['A','B','C'].map(cat=>`<optgroup label="Category ${cat}">${options.filter(c=>c.category===cat).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
  const content=`<form id="modal-form" data-save="save-private-session">
  ${field('entry_date','Session date',today(),'date',`required max="${today()}"`)}
  <label class="form-field"><span>Coach</span><select class="form-input" name="coach_id" required><option value="">Select coach</option>${grouped}</select></label>
  <div class="form-cols">${field('session_fee','Session price ($)','','number','required min="0" step="0.01" placeholder="50.00"')}${field('paid','Amount paid now ($)','0.00','number','required min="0" step="0.01"')}</div>
  ${textareaField('notes','Session notes (optional)')}
  <div class="notice">The session price is deducted from the client balance; money paid now is credited. Any difference changes the credit or amount owed.</div>
  ${formActions('Record Session')}</form>`;
  return {title:'Record Private Session',subtitle:client?.name||'',content};
 }
 if(type==='private-deposit'){
  const content=`<form id="modal-form" data-save="save-private-deposit">
  ${field('entry_date','Payment date',today(),'date',`required max="${today()}"`)}
  ${field('deposit','Amount added to balance ($)','','number','required min="0.01" step="0.01" placeholder="100.00"')}
  ${textareaField('notes','Payment reference / notes (optional)')}
  <div class="notice">Adds credit to this client’s account. It is not recorded as a coaching session.</div>
  ${formActions('Add Balance')}</form>`;
  return {title:'Add Client Balance',subtitle:client?.name||'',content};
 }
 const entry=state.privateEntries.find(e=>e.id===m.id);
 const content=`<div class="notice warn">This correction is permanent in the audit log but excludes the selected entry from the account balance.</div>
 <form id="modal-form" data-save="void-private-entry">${textareaField('reason','Correction reason')}${formActions('Void Entry',true)}</form>`;
 return {title:'Void Financial Entry',subtitle:entry?.entry_type==='session'?'Cancel incorrect session record':'Cancel incorrect balance top-up',content,danger:true};
}
function modalMarkup(){const m=state.modal;let title='',subtitle='',content='',danger=false,action='';switch(m.type){
 case 'admin-account-manage':{
  if(state.staff?.role!=='admin')throw Error('Administrators only.');
  const person=m.accountKind==='private'?state.privateClients.find(c=>c.id===m.id):state.debtPeople.find(c=>c.id===m.id);
  if(!person)throw Error('Account not found.');
  const friendly=m.accountKind==='private'?'private coaching client':'cafeteria account';
  title=(m.remove?'Remove':'Restore')+' '+friendly;
  subtitle=person.name;
  danger=Boolean(m.remove);
  content=`<div class="notice ${m.remove?'warn':''}">${m.remove?
   'Removal hides this account but keeps all financial records and preserves its ID. The current balance must be exactly zero.':
   'Restore this removed account with its complete previous history.'}</div>
   <form id="modal-form" data-save="save-admin-account-manage">
   ${m.remove?`${field('confirm_name','Type the exact account name to confirm','','text','required autocomplete="off"')} ${textareaField('reason','Reason for removal')}`:''}
   ${formActions(m.remove?'Confirm Removal':'Restore Account',m.remove)}</form>`;
  break;
 }

 case 'debt-person':case 'debt-charge':case 'debt-payment':case 'debt-void':{
  const dialog=debtModal(m.type,m);
  title=dialog.title;subtitle=dialog.subtitle;content=dialog.content;danger=Boolean(dialog.danger);break;
 }
 case 'private-client':case 'private-session':case 'private-deposit':case 'private-void':{
  const details=privateClientModal(m.type,m);
  title=details.title;subtitle=details.subtitle;content=details.content;danger=Boolean(details.danger);break;
 }
 case'team': {
  title='Record Team Game';subtitle='Select all eligible team members in this match.';action='save-team';
  content=`<form id="modal-form" data-save="${action}">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}<div class="form-field"><span>Team member(s) · select up to 4</span><div class="check-options">${state.members.filter(x=>x.active).map(x=>`<label><input type="checkbox" name="member_ids" value="${x.id}" ${x.id===m.id?'checked':''}/> ${esc(x.name)} ${x.unlimited?'(unlimited)':''}</label>`).join('')}</div></div><div class="form-field"><span>Benefit type</span><div class="radio-tiles"><label><input type="radio" name="benefit_type" value="free" checked/> Free game</label><label><input type="radio" name="benefit_type" value="half"/> Half-price game</label></div></div>${textareaField('notes','Notes (optional)')}<div class="notice warn">Confirm the actual player composition: free with two non-team participants, or half-price with three or more team participants. Each selected team member uses one weekly benefit.</div>${formActions('Save Game')}</form>`;break;}
 case 'quick-team':{
  title='Quick Match · Four Players';subtitle='Choose four participants. The benefit is calculated from team composition.';
  const options=state.members.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)} · ${esc(groupLabel(x.team_category))}${x.unlimited?' · unlimited':x.weekly_allowance===0?' · allowance not set':` · ${status(x).remain} left`}</option>`).join('');
  const slots=Array.from({length:4},(_,i)=>`<label class="form-field"><span>Player ${i+1}</span><select class="form-input quick-seat" name="seat_${i}" required><option value="">Choose participant</option><option value="non-team">Non-team player</option>${options.replace(`value="${m.id}"`,`value="${m.id}" ${i===0?'selected':''}`)}</select></label>`).join('');
  content=`<form id="modal-form" data-save="save-quick"><div class="form-cols">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}</div><div class="quick-seat-grid">${slots}</div><div id="quick-benefit-preview" class="notice">Select all four players to calculate their game benefits.</div>${field('non_team_names','Non-team names (optional)','','text','maxlength="255" placeholder="Names separated by commas"')}${textareaField('notes','Notes (optional)')}${formActions('Record Match')}</form>`;
  break;}
 case 'other-game': {const p=state.special.find(x=>x.id===m.id);title='Record Special Benefit';subtitle=p?.name||'';const weekly=p?.status==='one_free_per_week'?getWeeklyFreeGameStatus(p,today(),state.specialGames):null;content=`<form id="modal-form" data-save="save-other">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}${p?.status==='alternating_free_paid'? `<div class="form-field"><span>Game type — automatically determined</span><input type="hidden" name="game_type" value="${alternatingBenefitNext(p)}"/><div class="notice">${alternatingBenefitNext(p)==='free'?'This game is FREE. After saving, the next game will be PAID.':'This game is PAID. After saving, the next game will be FREE.'} The alternating rule is enforced by Supabase.</div></div>`:p?.status==='one_free_per_week'? `<div class="form-field"><span>Game type</span><div class="radio-tiles"><label><input type="radio" name="game_type" value="paid" checked/> Paid game</label><label><input id="other-free-game" type="radio" name="game_type" value="free" ${weekly?.available?'':'disabled'}/> Free game</label></div><div id="other-weekly-benefit-preview" class="notice">${weekly?.available?`One free game is available for ${weekLabel(today())}.`:`The free game for ${weekLabel(today())} has already been used. Choose Paid game.`}</div></div>`: `<div class="form-field"><span>Game type</span><div class="radio-tiles"><label><input type="radio" name="game_type" value="paid" ${p?.status!=='next_free'?'checked':''}/> Paid game</label><label><input type="radio" name="game_type" value="free" ${p?.status==='next_free'?'checked':''}/> Free game</label></div></div>`}${textareaField('notes','Notes (optional)')}${formActions('Record Game')}</form>`;break;}
 case 'finance': {const person=selectedMatchmaker();const rec=state.finance.find(x=>x.id===m.id);if(rec&&person&&rec.matchmaker_id!==person.id)throw Error('Selected person does not own this record.');title=rec?'Edit Matchmaking Game':'Add Matchmaking Game';subtitle=(person?person.name+' · ':'')+'Revenue collected from the other players (USD).';content=`<form id="modal-form" data-save="save-finance"><div class="form-cols">${field('played_on','Game date',rec?.played_on||today(),'date',`required max="${today()}"`)}${field('amount','Amount received ($)',rec?Number(rec.amount_cents/100).toFixed(2):'','number','required min="0" max="1000000000" step="0.01" placeholder="45.00"')}</div>${field('players','Other players (optional)',rec?.players||'','text','maxlength="255"')}${textareaField('notes','Notes (optional)',rec?.notes||'')}${formActions(rec?'Save Changes':'Save Revenue')}</form>`;break;}

 case 'training':{
  title='Record Coach Khalil Training';subtitle='One free monthly training per Rising Stars member.';
  const d=trainingMonthData(),eligible=d.members.filter(m=>!d.attended.has(m.id));
  const opts=eligible.map(p=>[p.id,p.name]);
  const first=state.trainingMonth+'-01',last=addDays(shiftMonth(state.trainingMonth,1)+'-01',-1);
  const latest=last>today()?today():last;
  content=`<form id="modal-form" data-save="save-training">
   ${field('session_date','Training date',state.trainingMonth===monthKey(today())?today():latest,'date',`required min="${first}" max="${latest}"`)}
   ${selectField('player1','Rising Stars player 1',[['','Choose player'],...opts],'')}
   ${selectField('player2','Rising Stars player 2',[['','Choose second player (or use solo exception)'],...opts],'')}
   <label class="training-solo-check"><input type="checkbox" name="solo_exception" value="yes"/> One-player exception (normally two players train together)</label>
   <div class="form-cols">${field('start_time','Start time (optional)','','time')}${field('duration_minutes','Duration (minutes)',45,'number','required min="15" max="180" step="5"')}</div>
   ${textareaField('notes','Notes / solo exception reason')}
   <div class="notice">Coach Khalil · Free session · Up to one attendance per player each month. For one player, tick the solo exception and write a reason.</div>
   ${formActions('Save Completed Training')}</form>`;
  break;
 }
 case 'void-training':{
  const session=state.trainingSessions.find(x=>x.id===m.id);
  title='Void Training Record';subtitle=session?'Coach Khalil · '+niceDay(session.session_date):'Correct an incorrect training entry';danger=true;
  content=`<div class="notice warn">Voiding preserves the audit history and restores the selected players’ eligibility for that month.</div><form id="modal-form" data-save="void-training">${textareaField('reason','Reason for correction')}${formActions('Void Training',true)}</form>`;
  break;
 }
 case 'edit-member': {const p=state.members.find(x=>x.id===m.id);title=p?'Edit Team Member':'Add Team Member';subtitle='Only administrators can modify the team roster.';content=`<form id="modal-form" data-save="save-member">${field('name','Full name',p?.name||'','text','required maxlength="100" minlength="2"')}${selectField('team_category','Team category',TEAM_GROUPS,p?.team_category||'team')}<div class="form-cols">${field('weekly_allowance','Weekly allowance',p?.weekly_allowance??0,'number','min="0" max="30" required')}${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}</div>${selectField('unlimited','Free game rule',[['false','Weekly allowance'],['true','Unlimited free games']],p?.unlimited?'true':'false')}${formActions(p?'Save Member':'Create Member')}</form>`;break;}
 case 'choose-member':{title='Edit Team Member';subtitle='Select a person to update.';content=`<form id="modal-form" data-save="choose-member">${selectField('member_id','Team member',state.members.map(x=>[x.id,x.name]),state.members[0]?.id)}${formActions('Continue')}</form>`;break;}
 case 'edit-other':{const p=state.special.find(x=>x.id===m.id);title=p?'Edit Other Benefit':'Add Other Benefit';subtitle='Choose the rule that determines free-game eligibility.';content=`<form id="modal-form" data-save="save-other-player">${field('name','Player name',p?.name||'','text','required maxlength="100"')}${field('current_counter','Game counter (alternating: 0 = next free; 1 = next paid)',p?.current_counter??0,'number','required min="0" max="1000000"')}${selectField('status','Eligibility status',[['needs_confirmation','Needs Confirmation'],['next_free','Next Game Free'],['counting','Counting Games'],['alternating_free_paid','Alternating: Free Game, Paid Game'],['one_free_per_week','1 Free Game per Week'],['rule_not_configured','Rule Not Configured']],p?.status||'needs_confirmation')}${field('threshold','Threshold (counting policies only)',p?.threshold??'','number','min="1" max="100"')}<div class="notice">For “1 Free Game per Week”, the selected game date determines its Monday–Sunday week. Only one free game is allowed in that week; paid games remain unrestricted. The allowance resets automatically each Monday.</div>${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}${formActions('Save Player')}</form>`;break;}
 case 'settlement':{const person=selectedMatchmaker();const s=state.settlements.find(x=>x.month_key===state.month+'-01'&&(!person||x.matchmaker_id===person.id));title='Monthly Settlement';subtitle=(person?person.name+' · ':'')+monthLabel(state.month);const suggested=Number(s?.amount_paid_cents??financials().fee)/100;content=`<form id="modal-form" data-save="save-settlement">${selectField('status','Payment status',[['unpaid','Unpaid'],['paid','Paid']],s?.status||'unpaid')}<div class="form-cols">${field('amount_paid','Amount paid (USD)',suggested.toFixed(2),'number','required min="0" step="0.01"')}${field('paid_on','Payment date',s?.paid_on||today(),'date')}</div>${textareaField('notes','Notes',s?.notes||'')}${formActions('Save Settlement')}</form>`;break;}
 case 'reset':{title=m.id?'Reset Member Counter':'Reset All Counters';subtitle='Administrator authorization required.';danger=true;content=`<div class="notice warn">${icon('alert')} This records a reset event for the current week. It does not erase old games or any matchmaking financial records.</div><form id="modal-form" data-save="submit-reset">${field('code','Management reset code','','password','required autocomplete="off"')}${formActions('Authorize Reset',true)}</form>`;break;}
 case 'confirm-delete':{title=m.entity==='finance'?'Remove Financial Record':'Void Team Match';subtitle='This action will be recorded in the audit log.';danger=true;content=`<p class="hint">${m.entity==='finance'?'The record will stop contributing to monthly revenue.':'The game will stop counting against team members’ weekly allowances.'} Are you sure?</p><form id="modal-form" data-save="confirm-delete">${formActions('Confirm',true)}</form>`;break;}
 case 'member-history':{const p=state.members.find(x=>x.id===m.id);const d=state.historyWeek;title=p?.name||'History';subtitle=`Week: ${weekLabel(d)}`;const gamesForWeek=state.historyWeek!==weekStart(today())?state.historyData?.games||[]:state.games;const logs=gamesForWeek.filter(x=>x.member_id===m.id&&!x.voided_at&&x.played_on>=d&&x.played_on<=addDays(d,6)).sort((a,b)=>b.played_on.localeCompare(a.played_on));const init=state.balances.find(x=>x.member_id===m.id&&x.week_start===d);content=`<div class="notice">${icon('info')} ${status(p,d).used} game(s) counted this week${init?.used?` · includes ${init.used} imported opening game(s)`:''}.</div>${logs.length?logs.map(g=>`<div class="activity-line"><div class="activity-avatar">${icon('calendar')}</div><div class="activity-copy"><strong>${niceDay(g.played_on)}</strong><small>${g.benefit_type==='free'?'Free game':'Half-price game'}</small></div></div>`).join(''):'<div class="panel-empty">No game entries during this week.</div>'}<div class="modal-actions">${btn('Close','close-modal','btn-light')}</div>`;break;}
 }
 return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body">${content}</div></div></div>`
}
function formActions(text,danger=false){return `<div class="modal-actions">${btn('Cancel','close-modal','btn-light')}<button type="submit" class="btn ${danger?'btn-danger':'btn-primary'}" id="save-button">${esc(text)}</button></div>`}
function openModal(type,id=null,more={}){state.modal={type,id,...(['team','quick-team','other-game','finance','training','private-session','private-deposit','debt-person','debt-charge','debt-payment'].includes(type)?{requestId:crypto.randomUUID()}:{}),...(['finance','settlement'].includes(type)?{personId:selectedMatchmaker()?.id||null}:{}),...more};render();setTimeout(()=>{document.querySelector('#modal-root .form-input')?.focus();updateQuickPreview();validatePrivateClientIdInput();},0)}
function closeModal(){state.modal=null;document.getElementById('modal-root').innerHTML=''}
function renderAuth(message=''){
 app.innerHTML=`<main class="auth-wrap"><section class="auth-lead"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/><h1>The team.<br/><em>All in one place.</em></h1><p>Weekly padel benefits, special players, and matchmaking revenue—securely tracked together.</p></section><section class="auth-card"><div class="eyebrow">Private club workspace</div><h2>Welcome back</h2><p class="sub">Sign in with your PADEL ON staff account.</p>${!api.configured?'<div class="auth-error">Database not configured. Contact your PADEL ON administrator.</div>':''}${message?`<div class="auth-error">${esc(message)}</div>`:''}<form id="login-form">${field('email','Email address','','email','required autocomplete="email"')}${field('password','Password','','password','required autocomplete="current-password"')}<button class="btn btn-primary" ${!api.configured?'disabled':''} type="submit">Sign In ${icon('arrow')}</button></form><div class="auth-foot">Authorized PADEL ON staff only · Protected by Supabase Auth</div></section></main>`;
}
async function loadDebtData(){
 if(!api.getSession()?.access_token||!state.staff||state.debtLoading)return;
 state.debtLoading=true;state.debtError=null;
 if(state.tab==='debts'&&!state.debtLoaded)render();
 try{
  const [people,entries]=await Promise.all([
   api.listAll('cafeteria_debt_people'),
   api.listAll('cafeteria_debt_entries')
  ]);
  if(!api.getSession()?.access_token||idleLogoutStarted)return;
  state.debtPeople=people;state.debtEntries=entries;state.debtLoaded=true;state.debtError=null;
  if(!people.some(p=>p.id===state.debtSelected&&!p.deleted_at))state.debtSelected=people.find(p=>!p.deleted_at)?.id||null;
 }catch(e){
  if(api.getSession()?.access_token){
   state.debtError=(e?.message||'Unable to load cafeteria debts')+'. Apply the Cafeteria Debts SQL migration in Supabase.';
   state.debtLoaded=false;
  }
 }finally{
  state.debtLoading=false;
  if((state.tab==='debts'||state.tab==='dashboard'||state.tab==='reports')&&!state.modal&&api.getSession()?.access_token)render();updateGlobalSearchResults();
 }
}
async function loadOverviewTraining(){
 if(!api.getSession()?.access_token||!state.staff||state.overviewTrainingLoading)return;
 const ym=monthKey(today());
 if(state.overviewTrainingMonth===ym&&Date.now()-state.overviewTrainingFetchedAt<30000)return;
 state.overviewTrainingLoading=true;
 try{
  const records=await api.listAll('training_attendance','month_key=eq.'+ym+'-01');
  if(!api.getSession()?.access_token||idleLogoutStarted)return;
  state.overviewTrainingAttendance=records;
  state.overviewTrainingMonth=ym;state.overviewTrainingError=null;
 }catch(e){
  if(api.getSession()?.access_token)state.overviewTrainingError=e?.message||'Training attendance unavailable';
 }finally{
  state.overviewTrainingLoading=false;state.overviewTrainingFetchedAt=Date.now();
  if(state.tab==='dashboard'&&!state.modal&&api.getSession()?.access_token)render();
 }
}
function loadClubSources(){
 if(!api.getSession()?.access_token||!state.staff)return;
 if(!state.privateLoading)void loadPrivateClients();
 if(!state.debtLoading)void loadDebtData();
 if(state.tab==='dashboard')void loadOverviewTraining();
}
async function loadPrivateClients(){
 if(!api.getSession()?.access_token||!state.staff||state.privateLoading)return;
 state.privateLoading=true;state.privateError=null;
 if(state.tab==='private-clients'&&!state.privateLoaded)render();
 try{
  const [clients,coaches,entries]=await Promise.all([
   api.listAll('private_clients'),
   api.listAll('private_coaches'),
   api.listAll('private_ledger_entries')
  ]);
  if(!api.getSession()?.access_token||idleLogoutStarted)return;
  state.privateClients=clients;state.privateCoaches=coaches;state.privateEntries=entries;
  state.privateLoaded=true;state.privateError=null;
  if(!clients.some(c=>c.id===state.privateSelected&&!c.deleted_at)){
   state.privateSelected=clients.find(c=>c.active&&!c.deleted_at)?.id||clients.find(c=>!c.deleted_at)?.id||null;
  }
 }catch(e){
  if(api.getSession()?.access_token){
   state.privateLoaded=false;
   state.privateError=(e?.message||'Failed to load client data')+'. Apply the Private Coaching migration in Supabase if this feature has not been set up.';
  }
 }finally{
  state.privateLoading=false;
  if((state.tab==='private-clients'||state.tab==='dashboard'||state.tab==='reports')&&!state.modal&&api.getSession()?.access_token)render();updateGlobalSearchResults();
 }
}
async function loadData(resetTab=false){if(state.loading)return;state.loading=true;try{
 const auth=api.getSession();if(!auth?.access_token)throw Error('Sign in required');
 const profiles=await api.list('staff_profiles',`id=eq.${auth.user.id}`);
 if(!profiles.length){await api.signOut();throw Error('This login has no PADEL ON staff access. Ask the administrator to add your account in Supabase.');}
 state.staff=profiles[0];
 const since=addDays(today(),-30);
 const [members,balances,matches,games,resets,special,specialGames,finance,settlements,matchmakers]=await Promise.all([
  api.listAll('team_members'),api.listAll('initial_balances'),api.listAll('team_matches',`played_on=gte.${since}`),api.listAll('team_games',`played_on=gte.${since}`),api.listAll('reset_events',`week_start=gte.${since}`),api.listAll('other_players'),api.listAll('other_games',`played_on=gte.${addDays(today(),-36)}`),api.listAll('nazih_games'),api.listAll('nazih_settlements'),api.listAll('matchmakers').then(list=>list.sort((a,b)=>a.id.localeCompare(b.id))).catch(()=>[])
 ]);
 // Do not redraw private data if this tab was signed out while requests were pending.
 if(!api.getSession()?.access_token || idleLogoutStarted)return;
 Object.assign(state,{members,balances,matches,games,resets,special,specialGames,finance,settlements,matchmakers});
 if(matchmakers.length&&!matchmakers.some(p=>p.id===state.matchmakerId))state.matchmakerId=matchmakers[0].id;
 if(resetTab)state.tab='dashboard'; render(); if(state.tab==='reports'&&!state.reportLoading)void loadReport(); if(state.tab==='training'&&!state.trainingLoading)void loadTrainingMonth(); if(state.tab==='private-clients'&&!state.privateLoading)void loadPrivateClients(); if(state.tab==='debts'&&!state.debtLoading)void loadDebtData(); if(state.tab==='cafeteria-finances')void cafeteriaFinances.load(true); if(state.tab==='dashboard'||state.tab==='reports')loadClubSources();if(state.tab==='dashboard')void clubInsights.loadOverview();
 }catch(e){if((idleLogoutStarted || !api.getSession()?.access_token) && !e.message.includes('no PADEL ON staff access'))return;if(e.message.includes('sign in')||e.message.includes('JWT')||e.message.includes('refresh token')){clearStaffActivity();await api.signOut();renderAuth(e.message)}else if(state.staff){toast(e.message,true)}else renderAuth(e.message)}finally{state.loading=false;}}
let working=false;
async function runMutation(task,success='Saved successfully'){if(working)return;working=true;const b=document.getElementById('save-button');if(b){b.disabled=true;b.textContent='Saving…'}try{await task();state.modal=null;await loadData();toast(success)}catch(e){toast(e?.message||'Could not save. Try again.',true)}finally{working=false;if(b&&b.isConnected){b.disabled=false;b.textContent='Try again'}}}
function slugify(x){return x.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.random().toString(36).slice(2,6)}
function privateSignedUSD(raw){
 const text=String(raw).trim();
 return text.startsWith('-')?-parseUSD(text.slice(1)):parseUSD(text);
}
async function saveForm(form){const f=new FormData(form),data=Object.fromEntries(f.entries()),m=state.modal;
 switch(form.dataset.save){
 case 'save-matchmaker-rate':{
  if(state.staff?.role!=='admin')throw Error('Only administrators can change matchmaking commission rates.');
  const personId=form.dataset.matchmakerId;
  const person=state.matchmakers.find(p=>p.id===personId);
  if(!person)throw Error('Matchmaker not found. Refresh Settings and try again.');
  const raw=String(data.commission_percent??'').trim();
  const percent=Number(raw);
  if(raw===''||!Number.isFinite(percent)||percent<0||percent>100)throw Error('Enter a commission between 0% and 100%.');
  const scaled=percent*100;
  if(Math.abs(scaled-Math.round(scaled))>0.000001)throw Error('Use no more than two decimal places.');
  await api.patch('matchmakers',personId,{commission_bps:Math.round(scaled)});
  break;
 }
 case 'save-admin-account-manage':{
  if(state.staff?.role!=='admin')throw Error('Only administrators can remove or restore accounts.');
  if(m.accountKind!=='private'&&m.accountKind!=='cafeteria')throw Error('Invalid account type.');
  const isPrivate=m.accountKind==='private';
  const person=isPrivate?state.privateClients.find(x=>x.id===m.id):state.debtPeople.find(x=>x.id===m.id);
  if(!person)throw Error('Account not found.');
  const balance=isPrivate?privateClientBalance(person):debtOutstanding(person.id);
  if(m.remove){
   if(person.deleted_at)throw Error('Account already removed.');
   if(balance!==0)throw Error('Account cannot be removed until its balance is exactly zero.');
   if((data.confirm_name||'').trim()!==person.name)throw Error('Type the exact account name to confirm.');
   if((data.reason||'').trim().length<4)throw Error('Provide a reason (at least four characters).');
  }else if(!person.deleted_at)throw Error('This account is not removed.');
  await api.rpc(isPrivate?'private_set_client_removed':'cafeteria_set_person_removed',{
   ...(isPrivate?{p_client_id:person.id}:{p_person_id:person.id}),
   p_remove:Boolean(m.remove),p_reason:m.remove?data.reason.trim():''
  });
  if(isPrivate){state.settingsPrivateAccountId=person.id;await loadPrivateClients();}
  else {state.settingsCafeteriaAccountId=person.id;await loadDebtData();}
  break;
 }
 case 'save-debt-person':{
  const name=(data.name||'').trim();
  if(name.length<2)throw Error('Enter the person’s name.');
  if(m.personId){
   await api.rpc('cafeteria_update_person',{p_person_id:m.personId,p_name:name,p_notes:(data.notes||'').trim(),p_active:data.active==='true'});
  }else{
   const initial=parseUSD(data.initial_debt);
   const created=await api.rpc('cafeteria_add_person',{p_person_id:m.requestId,p_name:name,p_initial_debt_cents:initial,p_entry_date:data.entry_date,p_notes:(data.notes||'').trim()});
   state.debtSelected=typeof created==='string'?created:m.requestId;
   if(initial===0)state.debtFilter='all';
   else state.debtFilter='open';
  }
  break;
 }
 case 'save-debt-charge':case 'save-debt-payment':{
  const person=state.debtPeople.find(x=>x.id===m.personId);
  if(!person||!person.active)throw Error('Choose an active cafeteria account.');
  const isCharge=form.dataset.save==='save-debt-charge';
  const cents=parseUSD(data.amount);
  if(cents<=0)throw Error('Enter an amount greater than zero.');
  await api.rpc('cafeteria_record_entry',{p_entry_id:m.requestId,p_person_id:person.id,p_entry_type:isCharge?'charge':'payment',p_amount_cents:cents,p_entry_date:data.entry_date,p_notes:(data.notes||'').trim()});
  state.debtSelected=person.id;
  if(!isCharge)state.debtFilter='all'; // Keep prepaid-credit and settled accounts visible.
  else state.debtFilter='open';
  break;
 }
 case 'void-debt-entry':{
  if(state.staff?.role!=='admin')throw Error('Only an administrator can correct a debt transaction.');
  if((data.reason||'').trim().length<4)throw Error('Provide a reason for the correction.');
  await api.rpc('cafeteria_void_entry',{p_entry_id:m.id,p_reason:data.reason.trim()});
  state.debtFilter='all';
  break;
 }
 case 'save-private-client':{
   const name=(data.name||'').trim();
   if(name.length<2)throw Error('Enter a client name.');
   const arabicName=(data.arabic_name||'').trim();
   if(!arabicDailyPdf.isValidArabicClientName(arabicName))
     throw Error('Use an Arabic spelling without English letters (maximum 120 characters).');
   const clientCode=normalizePrivateClientId(data.client_code);
   const conflict=privateClientIdOwner(clientCode,m.clientId||null);
   if(conflict)throw Error('Client ID '+clientCode+' is already assigned to '+conflict.name+'. Please enter another ID.');
   try{
     if(m.clientId){
       await api.rpc('private_update_client',{p_client_id:m.clientId,p_name:name,p_client_code:clientCode||null,p_contact:data.contact?.trim()||'',p_notes:data.notes?.trim()||'',p_active:data.active==='true'});
       if(arabicName!==(state.privateClients.find(c=>c.id===m.clientId)?.arabic_name||'').trim())
         await api.rpc('private_set_arabic_name',{p_client_id:m.clientId,p_arabic_name:arabicName});
     }else{
       const created=await api.rpc('private_add_client',{p_name:name,p_client_code:clientCode||null,p_contact:data.contact?.trim()||'',p_opening_balance_cents:privateSignedUSD(data.opening_balance),p_notes:data.notes?.trim()||''});
       if(typeof created==='string'){
         state.privateSelected=created;
         if(arabicName){
           try{await api.rpc('private_set_arabic_name',{p_client_id:created,p_arabic_name:arabicName});}
           catch(err){toast('Client created, but Arabic spelling was not saved. Edit the client to retry: '+(err.message||'Unknown error'),true);}
         }
       }
     }
   }catch(error){
     // The database unique index is authoritative across concurrent staff sessions.
     if(/private_clients_code_ci_unique|private_clients_code_normalized_unique|private_client.*(duplicate|already exists)/i.test(error?.message||''))
       throw Error('Client ID '+clientCode+' is already in use. Choose a different ID.');
     throw error;
   }
   break;
 }
 case 'save-private-session':case 'save-private-deposit':{
   if(!m.clientId||!state.privateClients.some(c=>c.id===m.clientId&&c.active))throw Error('Choose an active client.');
   const session=form.dataset.save==='save-private-session';
   if(session&&!state.privateCoaches.some(c=>c.id===data.coach_id&&c.active))throw Error('Choose a valid coach.');
   const charge=session?parseUSD(data.session_fee):0;
   const paid=session?parseUSD(data.paid):0;
   const deposit=session?0:parseUSD(data.deposit);
   if(!session&&deposit===0)throw Error('Enter a positive top-up amount.');
   await api.rpc('private_log_entry',{p_entry_id:m.requestId,p_client_id:m.clientId,p_entry_type:session?'session':'deposit',p_entry_date:data.entry_date,p_coach_id:session?data.coach_id:null,p_session_fee_cents:charge,p_paid_cents:paid,p_deposit_cents:deposit,p_notes:data.notes?.trim()||''});
   break;
 }
 case 'void-private-entry':{
   if(state.staff?.role!=='admin')throw Error('Only admins can correct ledger entries.');
   if((data.reason||'').trim().length<4)throw Error('Include a correction reason.');
   await api.rpc('private_void_entry',{p_entry_id:m.id,p_reason:data.reason.trim()});
   break;
 }
 case 'save-quick':{
  const seats=Array.from({length:4},(_,i)=>data[`seat_${i}`]);
  if(seats.some(x=>!x))throw Error('Select all four match participants.');
  const ids=seats.filter(x=>x!=='non-team');
  const nonTeam=seats.filter(x=>x==='non-team').length;
  if(!ids.length)throw Error('A benefit match needs at least one team member.');
  if(new Set(ids).size!==ids.length)throw Error('Select each team member only once.');
  const benefit=nonTeam>=2?'free':ids.length>=3?'half':null;
  if(!benefit)throw Error('No benefit rule matches this group.');
  // The Supabase function independently validates the match and handles Nazih's unlimited free exception.
  await api.rpc('record_quick_team_match',{p_match_id:m.requestId,p_member_ids:ids,p_non_team_count:nonTeam,p_played_on:data.played_on,p_non_team_names:data.non_team_names?.trim()||'',p_notes:data.notes?.trim()||''});
  break;}
 case 'save-team':{
  const ids=f.getAll('member_ids');if(!ids.length)throw Error('Select at least one team member.');if(ids.length>4)throw Error('Select at most four team members.');
  await api.rpc('record_team_match',{p_match_id:m.requestId,p_member_ids:ids,p_played_on:data.played_on,p_benefit_type:data.benefit_type,p_notes:data.notes||''});break;}
 case 'save-other':{
  const player=state.special.find(p=>p.id===m.id);
  if(!player||!player.active)throw Error('Player is unavailable.');
  if(player.status==='alternating_free_paid'&&data.game_type!==alternatingBenefitNext(player))
   throw Error('The next game type has changed. Reopen this form.');
  await api.rpc('record_other_game',{p_game_id:m.requestId,p_player_id:m.id,p_played_on:data.played_on,p_game_type:data.game_type,p_notes:data.notes||''});break;
 }
 case 'save-training':{
  const ids=[data.player1,data.player2].filter(Boolean);
  if(ids.length===0)throw Error('Select a Rising Stars member.');
  if(new Set(ids).size!==ids.length)throw Error('Select two different members.');
  const solo=data.solo_exception==='yes';
  if(ids.length===1&&!solo)throw Error('Select a second player or enable the one-player exception.');
  if(ids.length===2&&solo)throw Error('Uncheck solo exception when two players are selected.');
  if(solo&&(data.notes||'').trim().length<4)throw Error('Write a reason for solo training in Notes.');
  if(monthKey(data.session_date)!==state.trainingMonth)throw Error('Date must be in the selected month.');
  await api.rpc('record_training_session',{p_session_id:m.requestId,p_member_ids:ids,p_session_date:data.session_date,p_start_time:data.start_time||null,p_duration_minutes:Number(data.duration_minutes),p_notes:(data.notes||'').trim(),p_solo_exception:solo});
  break;
 }
 case 'void-training':{
  if(!data.reason||data.reason.trim().length<4)throw Error('Provide a reason for the correction.');
  await api.rpc('void_training_session',{p_session_id:m.id,p_reason:data.reason.trim()});
  break;
 }
 case 'save-finance':{
  const person=selectedMatchmaker();
  if(person&&m.personId!==person.id)throw Error('Selection changed. Reopen the game form.');
  const payload={played_on:data.played_on,amount_cents:parseUSD(data.amount),players:data.players?.trim()||'',notes:data.notes?.trim()||'',updated_at:new Date().toISOString()};
  if(m.id){const existing=state.finance.find(x=>x.id===m.id);if(!existing||person&&(existing.matchmaker_id||LEGACY_MATCHMAKER_ID)!==person.id)throw Error('Invalid game selection.');await api.patch('nazih_games',m.id,payload)}
  else await api.insert('nazih_games',{...payload,...(person?{matchmaker_id:person.id}:{}),id:m.requestId,created_by:api.getSession().user.id});
  state.month=monthKey(data.played_on);break;}
 case 'save-member':{
  const name=data.name.trim();if(name.length<2)throw Error('Name is too short.');if(!TEAM_GROUPS.some(([id])=>id===data.team_category))throw Error('Select a valid team category.');const payload={name,weekly_allowance:Number(data.weekly_allowance),team_category:data.team_category,active:data.active==='true',unlimited:data.unlimited==='true'};
  if(m.id)await api.patch('team_members',m.id,payload);else await api.insert('team_members',{...payload,slug:slugify(name)});break;}
 case 'choose-member':state.modal={type:'edit-member',id:data.member_id};render();return 'keep';
 case 'save-other-player':{
  const allowed=['needs_confirmation','next_free','counting','alternating_free_paid','one_free_per_week','rule_not_configured'];
  if(!allowed.includes(data.status))throw Error('Select a valid benefit rule.');
  const count=Number(data.current_counter);
  if(!Number.isSafeInteger(count)||count<0||count>1000000)throw Error('Enter a valid game counter.');
  const payload={name:data.name.trim(),current_counter:count,status:data.status,threshold:data.status==='alternating_free_paid'?null:data.threshold?Number(data.threshold):null,active:data.active==='true'};
  if(m.id)await api.patch('other_players',m.id,payload);else await api.insert('other_players',{...payload,slug:slugify(payload.name)});break;}
 case 'save-settlement':{
  const person=selectedMatchmaker();if(person&&m.personId!==person.id)throw Error('Selection changed. Reopen settlement form.');
  const payload={month_key:state.month+'-01',status:data.status,amount_paid_cents:parseUSD(data.amount_paid),paid_on:data.status==='paid'?(data.paid_on||today()):null,notes:data.notes||'',updated_at:new Date().toISOString(),...(person?{matchmaker_id:person.id}:{})};
  const onConflict=person?'matchmaker_id,month_key':'month_key';
  await api.request('POST','nazih_settlements?on_conflict='+onConflict,payload,{headers:{Prefer:'resolution=merge-duplicates,return=representation'}});break;}
 case 'submit-reset':await api.functionCall('reset-weekly',{code:data.code,member_id:m.id||null});break;
 case 'confirm-delete':
  if(m.entity==='finance')await api.patch('nazih_games',m.id,{deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  else await api.rpc('void_team_match',{p_match_id:m.id});break;
 default:throw Error('Unknown form');
 }
}
function exportFinance(){
 const f=financials(),person=selectedMatchmaker();
 const rate=matchmakerRate(person)/100;
 const name=person?.name||'Nazih Sonbol';
 const rows=[['PADEL ON','Monthly Matchmaking Ledger'],['Matchmaker',name],['Month',monthLabel(state.month)],['Commission rate',rate+'%'],[],['Date','Other players','Notes','Collected USD','Illustrative share USD']];
 for(const entry of f.rows)rows.push([entry.played_on,entry.players||'',entry.notes||'',(Number(entry.amount_cents)/100).toFixed(2),(matchmakingFee(entry.amount_cents,person)/100).toFixed(2)]);
 rows.push([],['TOTAL','','',(f.total/100).toFixed(2),(f.fee/100).toFixed(2)]);
 const slug=person?.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'nazih';
 downloadCSV(rows,`padel-on-matchmaking-${slug}-${state.month}.csv`);
}
async function handleAction(target){const act=target.dataset.action,id=target.dataset.id;
 if(act?.startsWith('cafe-')){
  if(state.tab!=='cafeteria-finances'||!state.staff)throw Error('Authorized staff only.');
  if(await cafeteriaFinances.action(target))return;
 }
 switch(act){
 case 'open-reem-items':
  if(!canUseOrderLists())throw Error('Authorized staff only.');
  state.tab='reem-items';state.modal=null;render();window.scrollTo({top:0,behavior:'instant'});break;
 case 'reem-back':
  if(!canUseOrderLists())throw Error('Authorized staff only.');
  state.tab='settings';render();window.scrollTo({top:0,behavior:'instant'});break;
 case 'reem-filter':case 'reem-step':case 'reem-clear':case 'reem-copy':case 'reem-remove-item':case 'reem-restore-item':
  if(state.tab!=='reem-items'||!canUseOrderLists())throw Error('Authorized staff only.');
  if(await reemItems.reemAction(target,toast))render();
  break;
 case 'open-order-counter':
  if(!canUseOrderLists())throw Error('Authorized staff only.');
  state.tab='order-counter';state.modal=null;render();window.scrollTo({top:0,behavior:'instant'});break;
 case 'order-back':
  if(!canUseOrderLists())throw Error('Authorized staff only.');
  state.tab='settings';render();window.scrollTo({top:0,behavior:'instant'});break;
 case 'order-filter':case 'order-step':case 'order-clear':case 'order-copy':case 'order-remove-item':case 'order-restore-item':
  if(state.tab!=='order-counter'||!canUseOrderLists())throw Error('Authorized staff only.');
  if(await orderCounter.orderAction(target,toast))render();
  break;
 case 'management-alert-toggle':
  state.alertExpanded=!state.alertExpanded;render();break;
 case 'management-alert-open':{
  const kind=target.dataset.kind;
  if(kind==='training'){
   state.tab='training';state.trainingMonth=monthKey(today());render();await loadTrainingMonth();break;
  }
  const personId=target.dataset.id;
  if(kind==='private'){
   const client=state.privateClients.find(x=>x.id===personId&&!x.deleted_at);
   if(!client)throw Error('Private client not found.');
   state.tab='private-clients';state.privateSelected=personId;
   state.privateSearch='';state.privateListFilter='all';
   state.privateShowArchived=!client.active;
  }else if(kind==='debt'){
   if(!state.debtPeople.some(x=>x.id===personId&&!x.deleted_at))throw Error('Cafeteria account not found.');
   state.tab='debts';state.debtSelected=personId;state.debtSearch='';state.debtFilter='all';
  }else throw Error('Unknown alert type.');
  render();window.scrollTo({top:0,behavior:'instant'});break;
 }
 case 'global-search-open':
  if(!state.staff||!api.getSession()?.access_token)throw Error('Sign in before searching.');
  state.modal=null;state.globalSearchOpen=true;state.globalSearchQuery='';
  render();
  setTimeout(()=>document.getElementById('global-search-input')?.focus(),0);
  loadClubSources();break;
 case 'global-search-close':
  state.globalSearchOpen=false;state.globalSearchQuery='';render();break;
 case 'global-search-open-result':{
  const kind=target.dataset.kind;
  const candidate=globalSearchCandidates().find(x=>x.kind===kind&&x.id===id);
  if(!candidate)throw Error('Search result is no longer available.');
  state.globalSearchOpen=false;state.globalSearchQuery='';state.modal=null;
  if(kind==='team'){
   state.tab='team';state.teamSearch=candidate.title;state.teamCategoryFilter='all';state.teamFilter='all';
   state.historyWeek=weekStart(today());
  }else if(kind==='private'){
   const client=state.privateClients.find(x=>x.id===id);
   state.tab='private-clients';state.privateSelected=id;state.privateSearch='';
   state.privateListFilter='all';state.privateShowArchived=Boolean(!client?.active);
  }else if(kind==='debt'){
   state.tab='debts';state.debtSelected=id;state.debtSearch='';state.debtFilter='all';
  }else if(kind==='other'){
   state.tab='other';
  }
  render();window.scrollTo({top:0,behavior:'instant'});break;
 }
 case 'settings-private-remove':case 'settings-private-restore':
 case 'settings-cafe-remove':case 'settings-cafe-restore':{
  if(state.staff?.role!=='admin')throw Error('Administrators only.');
  const isPrivate=act.startsWith('settings-private'),isRemoval=act.endsWith('-remove');
  const accountId=isPrivate?state.settingsPrivateAccountId:state.settingsCafeteriaAccountId;
  const person=isPrivate?state.privateClients.find(x=>x.id===accountId):state.debtPeople.find(x=>x.id===accountId);
  if(!person)throw Error('Select an account in Settings first.');
  if(isRemoval&&(isPrivate?privateClientBalance(person):debtOutstanding(person.id))!==0)
   throw Error('Settle the account balance before removal.');
  openModal('admin-account-manage',person.id,{accountKind:isPrivate?'private':'cafeteria',remove:isRemoval});break;
 }
 case 'debt-retry':await loadDebtData();break;
 case 'debt-new-person':if(!state.debtLoaded||state.debtError)throw Error('Cafeteria database not configured yet.');openModal('debt-person');break;
 case 'debt-select-person':if(!state.debtPeople.some(p=>p.id===id&&!p.deleted_at))throw Error('Person not found.');state.debtSelected=id;render();break;
 case 'debt-edit-person':if(!state.debtSelected)throw Error('Select a person.');openModal('debt-person',null,{personId:state.debtSelected});break;
 case 'debt-add-charge':case 'debt-add-payment':{
  const person=state.debtPeople.find(p=>p.id===state.debtSelected);
  if(!person||!person.active)throw Error('Select an active person.');
  openModal(act==='debt-add-charge'?'debt-charge':'debt-payment',null,{personId:person.id});break;
 }
 case 'debt-void':
  if(state.staff?.role!=='admin')throw Error('Only admins may correct cafeteria transactions.');
  if(!state.debtEntries.some(e=>e.id===id&&!e.voided_at))throw Error('Entry not found.');
  openModal('debt-void',id);break;
 case 'debt-export':debtExport();break;
 case 'private-day-prev':
  state.privateDay=addDays(state.privateDay,-1);render();break;
 case 'private-day-next':
  if(state.privateDay<today())state.privateDay=addDays(state.privateDay,1);
  render();break;
 case 'private-day-today':
  state.privateDay=today();render();break;
 case 'private-month-prev':
  state.privateDay=privateDateInMonth(shiftMonth(monthKey(state.privateDay),-1),state.privateDay.slice(-2));render();break;
 case 'private-month-next':
  if(monthKey(state.privateDay)<monthKey(today()))
   state.privateDay=privateDateInMonth(shiftMonth(monthKey(state.privateDay),1),state.privateDay.slice(-2));
  render();break;
 case 'private-day-select':{
  const candidate=target.dataset.day||'';
  if(/^\d{4}-\d{2}-\d{2}$/.test(candidate)&&candidate<=today())
   state.privateDay=candidate;
  render();break;
 }
 case 'private-reset-filters':
  state.privateListFilter='all';state.privateSearch='';state.privateShowArchived=false;render();break;
 case 'private-open-from-day':{
  const client=state.privateClients.find(c=>c.id===id);
  if(!client||client.deleted_at)throw Error('Client has been removed from active account management.');
  state.privateSelected=id;state.privateListFilter='all';state.privateSearch='';
  if(!client.active)state.privateShowArchived=true;
  render();
  setTimeout(()=>document.querySelector('.private-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
  break;
 }
 case 'private-retry':await loadPrivateClients();break;
 case 'private-add-client':if(!state.privateLoaded||state.privateError)throw Error('Client database is not ready. Apply the Supabase migration.');openModal('private-client');break;
 case 'private-select-client':if(!state.privateClients.some(c=>c.id===id&&!c.deleted_at))throw Error('Client not found.');state.privateSelected=id;render();break;
 case 'private-edit-client':if(!state.privateSelected)throw Error('Select a client.');openModal('private-client',null,{clientId:state.privateSelected});break;
 case 'private-record-session':if(!state.privateSelected)throw Error('Select a client.');if(!state.privateCoaches.some(c=>c.active))throw Error('Coaches are not set up. Run the private coach setup script.');openModal('private-session',null,{clientId:state.privateSelected});break;
 case 'private-add-balance':if(!state.privateSelected)throw Error('Select a client.');openModal('private-deposit',null,{clientId:state.privateSelected});break;
 case 'private-void-entry':if(state.staff?.role!=='admin')throw Error('Only admins can correct financial entries.');if(!state.privateEntries.some(e=>e.id===id))throw Error('Entry not found.');openModal('private-void',id);break;
 case 'private-export':exportPrivateClientCSV();break;
 case 'refresh':await loadData();if(state.tab==='dashboard')void clubInsights.loadOverview(true);if(state.tab==='dashboard'){loadClubSources();void clubInsights.loadOverview(true);}if(state.tab==='debts')await loadDebtData();else if(state.tab==='private-clients')await loadPrivateClients();else if(state.tab==='cafeteria-finances')await cafeteriaFinances.load(true);else if(state.tab==='training')await loadTrainingMonth();else if(state.tab==='reports')await loadReport();else if(state.tab==='team'&&state.historyWeek!==weekStart(today()))await loadHistoryWeek(state.historyWeek);toast('Data refreshed');break;
 case 'training-prev-month':
  state.trainingMonth=shiftMonth(state.trainingMonth,-1);await loadTrainingMonth();break;
 case 'training-next-month':
  if(state.trainingMonth<monthKey(today())){state.trainingMonth=shiftMonth(state.trainingMonth,1);await loadTrainingMonth()}break;
 case 'add-training':
  if(state.trainingLoadedMonth!==state.trainingMonth||state.trainingLoading)throw Error('Please load this month first.');
  if(!trainingMonthData().remaining)throw Error('All Rising Stars members have used their session this month.');
  openModal('training');break;
 case 'void-training':
  if(state.staff?.role!=='admin')throw Error('Only administrators can correct recorded training.');
  openModal('void-training',id);break;
 case 'export-training':exportTrainingCSV();break;
 case 'print-training':window.print();break;
 case 'quick-team':openModal('quick-team',id);break;
 case 'team-prev-week':await loadHistoryWeek(addDays(state.historyWeek,-7));break;
 case 'team-next-week':await loadHistoryWeek(addDays(state.historyWeek,7));break;
 case 'team-current-week':await loadHistoryWeek(weekStart(today()));break;
 case 'report-mode-day':state.reportMode='day';await loadReport();break;
 case 'report-mode-week':state.reportMode='week';await loadReport();break;
 case 'report-mode-month':state.reportMode='month';await loadReport();break;
 case 'report-prev':
  if(state.reportMode==='day')state.reportDay=addDays(state.reportDay,-1);
  else if(state.reportMode==='week')state.reportWeek=addDays(state.reportWeek,-7);
  else state.reportMonth=shiftMonth(state.reportMonth,-1);
  await loadReport();break;
 case 'report-next':
  if(state.reportMode==='day'&&state.reportDay<today())state.reportDay=addDays(state.reportDay,1);
  else if(state.reportMode==='week'&&state.reportWeek<weekStart(today()))state.reportWeek=addDays(state.reportWeek,7);
  else if(state.reportMode==='month'&&state.reportMonth<monthKey(today()))state.reportMonth=shiftMonth(state.reportMonth,1);
  await loadReport();break;
 case 'export-report':exportReport();break;
 case 'print-report':window.print();break;
 case 'record-team':openModal('team',id);break;
 case 'record-other':openModal('other-game',id);break;
 case 'select-matchmaker':if(!state.matchmakers.some(p=>p.id===id))throw Error('Unknown matchmaker.');state.matchmakerId=id;render();break;
 case 'add-nazih':openModal('finance');break;
 case 'edit-nazih':openModal('finance',id);break;
 case 'delete-nazih':openModal('confirm-delete',id,{entity:'finance'});break;
 case 'void-match':openModal('confirm-delete',id,{entity:'match'});break;
 case 'member-history':openModal('member-history',id);break;
 case 'new-member':openModal('edit-member');break;
 case 'choose-member-edit':openModal('choose-member');break;
 case 'new-other':openModal('edit-other');break;
 case 'edit-other':openModal('edit-other',id);break;
 case 'settlement':openModal('settlement');break;
 case 'reset-one':openModal('reset',normalMembers()[0]?.id);{
  const form=document.getElementById('modal-form');if(form){const label=form.querySelector('.form-field');const sel=document.createElement('label');sel.className='form-field';sel.innerHTML=`<span>Member to reset</span><select class="form-input" id="reset-member">${normalMembers().map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select>`;form.insertBefore(sel,label);}}
  break;
 case 'reset-all':openModal('reset');break;
 case 'close-modal':closeModal();break;
 case 'prev-month':state.month=shiftMonth(state.month,-1);render();break;
 case 'next-month':if(state.month<monthKey(today())){state.month=shiftMonth(state.month,1);render()}break;
 case 'export-finance':exportFinance();break;
 case 'signout':{clearStaffActivity();const logout=api.signOut();state.staff=null;cafeteriaFinances.reset();clubInsights.reset();state.modal=null;state.globalSearchOpen=false;state.globalSearchQuery='';renderAuth();await logout;break;}
 }}
// Delegate events so every newly rendered interactive component works.
document.addEventListener('click',async e=>{
 if(e.target.id==='modal-backdrop'){closeModal();return;}
 const tab=e.target.closest('[data-tab]');if(tab){if(!tabs.some(([key])=>key===tab.dataset.tab))return;state.tab=tab.dataset.tab;state.modal=null;render();window.scrollTo({top:0,behavior:'instant'});if(state.tab==='reports'){void loadClubSources();await loadReport();}if(state.tab==='dashboard'){loadClubSources();void clubInsights.loadOverview();}if(state.tab==='debts')await loadDebtData();if(state.tab==='training')await loadTrainingMonth();if(state.tab==='private-clients')await loadPrivateClients();if(state.tab==='cafeteria-finances')await cafeteriaFinances.load(true);
 if(state.tab==='settings'&&state.staff?.role==='admin'){
  await Promise.all([loadPrivateClients(),loadDebtData()]);
  if(state.tab==='settings'&&api.getSession()?.access_token)render();
 }
 return;}
 const action=e.target.closest('[data-action]');if(action){try{await handleAction(action)}catch(err){toast(err.message,true)}}
});
document.addEventListener('submit',async e=>{
 if(['entry','closing','whish'].includes(e.target.dataset?.cafeSave)){
  e.preventDefault();
  if(state.tab!=='cafeteria-finances'||!state.staff){toast('Authorized staff only.',true);return;}
  try{await cafeteriaFinances.submit(e.target)}catch(err){toast(err.message||'Unable to save entry.',true)}
  return;
 }
 if(e.target.dataset?.save==='order-add-item' || e.target.dataset?.save==='reem-add-item'){
  e.preventDefault();
  const isReem=e.target.dataset.save==='reem-add-item';
  if(!canUseOrderLists() || state.tab!==(isReem?'reem-items':'order-counter')){
   toast('Authorized staff only.',true);return;
  }
  const name=new FormData(e.target).get('item_name');
  const ok=isReem?reemItems.reemAddItem(name,toast):orderCounter.orderAddItem(name,toast);
  if(ok)render();
  return;
 }
 if(e.target.id==='login-form'){
 e.preventDefault();if(working)return;working=true;const f=new FormData(e.target);const button=e.target.querySelector('[type=submit]');button.disabled=true;button.textContent='Signing in…';
 try{await api.login(f.get('email'),f.get('password'));beginStaffSession();await loadData(true)}catch(err){renderAuth(err.message)}finally{working=false}return;
 }
 if(e.target.id==='modal-form'||e.target.dataset?.save==='save-matchmaker-rate'){
 e.preventDefault();
 const form=e.target;
 if(form.dataset.save==='choose-member'){const sel=new FormData(form).get('member_id');openModal('edit-member',sel);return;}
 if(form.dataset.save==='submit-reset'&&state.modal?.id){const chosen=document.getElementById('reset-member')?.value;if(chosen)state.modal.id=chosen;}
 await runMutation(()=>saveForm(form),form.dataset.save==='submit-reset'?'Weekly counter reset recorded':form.dataset.save==='save-matchmaker-rate'?'Matchmaking commission updated.':'Saved successfully');
 }
});
document.addEventListener('input',e=>{
 if(e.target.dataset?.reemInput && state.tab==='reem-items' && canUseOrderLists()){
  const type=reemItems.reemInput(e.target);
  if(type==='search'){
   const cursor=e.target.selectionStart;
   render();
   const input=document.getElementById('reem-search');
   input?.focus();if(cursor!==null)input?.setSelectionRange(cursor,cursor);
  }
  return;
 }
 if(e.target.dataset?.orderInput && state.tab==='order-counter' && canUseOrderLists()){
  const type=orderCounter.orderInput(e.target);
  if(type==='search'){
   const cursor=e.target.selectionStart;
   render();
   const input=document.getElementById('order-search');
   input?.focus();if(cursor!==null)input?.setSelectionRange(cursor,cursor);
  }
  return;
 }
 if(e.target.id==='global-search-input'){
  state.globalSearchQuery=e.target.value;
  updateGlobalSearchResults();return;
 }
 if(e.target.name==='client_code'&&e.target.closest('form[data-save="save-private-client"]'))validatePrivateClientIdInput();
 const id=e.target.id;if(id==='team-search'||id==='activity-search'||id==='private-client-search'||id==='debt-search'){
  const caret=e.target.selectionStart;const value=e.target.value;
  if(id==='team-search')state.teamSearch=value;else if(id==='activity-search')state.activitySearch=value;else if(id==='private-client-search')state.privateSearch=value;else state.debtSearch=value;
  render();const input=document.getElementById(id);input?.focus();input?.setSelectionRange(caret,caret);
 }
});
function updateOtherGamePreview(){
 const form=document.getElementById('modal-form');
 if(!form||form.dataset.save!=='save-other')return;
 const player=state.special.find(p=>p.id===state.modal?.id);
 if(player?.status!=='one_free_per_week')return;
 const date=form.querySelector('[name="played_on"]')?.value||today();
 const info=getWeeklyFreeGameStatus(player,date,state.specialGames);
 const free=form.querySelector('#other-free-game');
 const paid=form.querySelector('input[name="game_type"][value="paid"]');
 const note=form.querySelector('#other-weekly-benefit-preview');
 if(free){free.disabled=!info.available;if(!info.available&&free.checked&&paid)paid.checked=true;}
 if(note)note.textContent=info.available?`One free game is available for ${weekLabel(date)}.`:`The free game for ${weekLabel(date)} has already been used. Choose Paid game.`;
}
function updateQuickPreview(){
 const form=document.getElementById('modal-form');
 if(!form||form.dataset.save!=='save-quick')return;
 const seats=Array.from(form.querySelectorAll('.quick-seat')).map(el=>el.value);
 const hint=document.getElementById('quick-benefit-preview');
 const button=form.querySelector('#save-button');
 if(!hint||!button)return;
 if(seats.some(v=>!v)){hint.textContent='Choose all four participants to calculate benefits.';button.disabled=true;return}
 const ids=seats.filter(v=>v!=='non-team');
 if(ids.length===0 || new Set(ids).size!==ids.length){
   hint.textContent=ids.length===0?'Select at least one team member.':'The same team member cannot occupy two spots.';
   button.disabled=true;return;
 }
 const other=4-ids.length;
 const type=other>=2?'Free':'Half-price';
 const nazih=ids.some(id=>state.members.find(m=>m.id===id)?.unlimited);
 hint.textContent=`${ids.length} team + ${other} non-team · ${type} for standard team members${nazih?' · Nazih plays free':''}. Each standard member uses one weekly benefit.`;
 const gameDate=form.querySelector('[name="played_on"]')?.value||today();
 const exhausted=ids.filter(id=>{const m=state.members.find(x=>x.id===id);return m&&!m.unlimited&&status(m,gameDate).remain===0});
 if(exhausted.length){hint.textContent+=' · Warning: a member has no remaining benefits.';button.disabled=true}
 else button.disabled=false;
}
// A native details element preserves its open state across full-page rerenders.
document.addEventListener('toggle',e=>{
 if(state.tab==='cafeteria-finances'&&e.target?.dataset?.cafeFold)
  cafeteriaFinances.rememberFold(e.target.dataset.cafeFold,e.target.open);
},true);
document.addEventListener('change',e=>{
 if((e.target.id==='cafe-finance-date'||e.target.id==='cafe-quick-category'||e.target.dataset?.cafeMarker)&&state.tab==='cafeteria-finances'){
  void cafeteriaFinances.change(e.target).catch(err=>toast(err.message||'Could not update finances.',true));return;
 }
 if(e.target.dataset?.reemInput==='quantity' && state.tab==='reem-items' && canUseOrderLists()){render();return;}
 if(e.target.dataset?.orderInput==='quantity' && state.tab==='order-counter' && canUseOrderLists()){render();return;}
 if(e.target.id==='settings-private-account'){state.settingsPrivateAccountId=e.target.value;render();return}
 if(e.target.id==='settings-cafeteria-account'){state.settingsCafeteriaAccountId=e.target.value;render();return}

 if(e.target.id==='private-client-filter'){state.privateListFilter=e.target.value==='owing'?'owing':'all';render();return}
 if(e.target.id==='private-client-sort'){state.privateSort=e.target.value==='id'?'id':'name';render();return}
 if(e.target.id==='private-day-date'){
  const value=e.target.value;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&value<=today())state.privateDay=value;
  render();return;
 }
if(e.target.id==='debt-filter'){state.debtFilter=e.target.value;render()}if(e.target.id==='private-show-archived'){state.privateShowArchived=e.target.checked;render()}if(e.target.classList?.contains('quick-seat')||(e.target.name==='played_on'&&state.modal?.type==='quick-team'))updateQuickPreview();if(e.target.name==='played_on'&&state.modal?.type==='other-game')updateOtherGamePreview();if(e.target.id==='team-sort'){state.teamSort=e.target.value;render()}if(e.target.id==='team-filter'){state.teamFilter=e.target.value;render()}if(e.target.id==='team-category'){state.teamCategoryFilter=e.target.value;render()}});
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){
  e.preventDefault();
  if(api.getSession()?.access_token){
   if(!state.globalSearchOpen)void handleAction({dataset:{action:'global-search-open'}}).catch(err=>toast(err.message,true));
   else document.getElementById('global-search-input')?.focus();
  }
  return;
 }
 if(e.key==='Escape'&&state.globalSearchOpen){state.globalSearchOpen=false;state.globalSearchQuery='';render();return;}
 if(e.key==='Escape'&&state.modal)closeModal();
});
async function start(){if(!api.configured){renderAuth();return}if(api.getSession()?.access_token){if(idleExpired()){await autoSignOut();return}await loadData()}else renderAuth();}
start();
// Lightweight cross-device refresh. All records are read from Supabase, never local state alone.
setInterval(()=>{
 checkStaffInactivity();
 const currentWeek=weekStart(today()),currentMonth=monthKey(today());
 if(lastKnownWeek!==currentWeek){
   if(state.historyWeek===lastKnownWeek){state.historyWeek=currentWeek;state.historyData=null;state.historyLoading=false}
   if(state.reportWeek===lastKnownWeek)state.reportWeek=currentWeek;
   lastKnownWeek=currentWeek;
 }
 if(lastKnownMonth!==currentMonth){
   if(state.reportMonth===lastKnownMonth)state.reportMonth=currentMonth;
   if(state.month===lastKnownMonth)state.month=currentMonth;
   if(state.trainingMonth===lastKnownMonth){state.trainingMonth=currentMonth;state.trainingLoadedMonth=null;}
   lastKnownMonth=currentMonth;
 }
 if(api.configured&&api.getSession()&&state.staff&&!state.modal&&!working&&!document.hidden){
  // Keep unsaved daily cashbook forms intact while staff is entering transactions.
  if(state.tab==='cafeteria-finances'){
   if(!document.activeElement?.closest('.cafe-entry-form, .cafe-closing-form'))void cafeteriaFinances.load(true);
  }else loadData();
 }
},30000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;checkStaffInactivity();if(!idleExpired()&&api.getSession()&&state.staff&&!state.modal){
  if(state.tab==='cafeteria-finances'){
   if(!document.activeElement?.closest('.cafe-entry-form, .cafe-closing-form'))void cafeteriaFinances.load(true);
  }else loadData();
 }});
