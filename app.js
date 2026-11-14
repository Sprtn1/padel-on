// Each page load uses a fresh module graph to avoid stale GitHub Pages assets.
const assetVersion = new URL(import.meta.url).searchParams.get('v') || Date.now().toString(36);
const {icon} = await import(`./lib/icons.js?v=${assetVersion}`);
const {tabs,renderNavigation,navSectionForTab} = await import(`./lib/navigation.js?v=${assetVersion}`);
const {readSidebarCollapsed,storeSidebarCollapsed,sidebarToggleLabel} = await import(`./lib/sidebar-layout.js?v=${assetVersion}`);
const {hashForTab,canAccessTab,resolveTabFromHash} = await import(`./lib/hash-routing.js?v=${assetVersion}`);
const api = await import(`./lib/api.js?v=${assetVersion}`);
const orderCounter = await import(`./lib/order-counter-ui.js?v=${assetVersion}`);
const reemItems = await import(`./lib/reem-items-ui.js?v=${assetVersion}`);
const cafeteriaFinanceModule = await import(`./lib/cafeteria-finances.js?v=${assetVersion}`);
const cafeteriaPaymentsModule = await import(`./lib/cafeteria-payments.js?v=${assetVersion}`);
const cafeteriaTodoModule = await import(`./lib/cafeteria-todo.js?v=${assetVersion}`);
const shiftHandoverModule = await import(`./lib/cafeteria-shift-handover.js?v=${assetVersion}`);
const consignmentModule = await import(`./lib/consignment-inventory.js?v=${assetVersion}`);
const clubInsightsModule = await import(`./lib/club-finance-insights.js?v=${assetVersion}`);
const {sevenDayActivity} = await import(`./lib/activity-visualizations.js?v=${assetVersion}`);
const reportComparison = await import(`./lib/report-comparison.js?v=${assetVersion}`);
const {getDebtDayEntries,summarizeDebtDay} = await import(`./lib/cafeteria-debt-daily.js?v=${assetVersion}`);
const {visiblePrivateClientSelection} = await import(`./lib/private-client-selection.js?v=${assetVersion}`);
const refreshPolicy = await import(`./lib/refresh-policy.js?v=${assetVersion}`);
const scrollPreservation = await import(`./lib/scroll-preservation.js?v=${assetVersion}`);
const tournamentModule = await import(`./lib/tournament-management.js?v=${assetVersion}`);
const arabicDailyPdf = await import(`./lib/arabic-daily-pdf.js?v=${assetVersion}`);
const {getWeeklyStatus,getMonthFinance,getWeeklyFreeGameStatus,getMatchmakingFinance,getMatchmakingStreakLedger,getMatchmakingCurrentStreak} = await import(`./lib/logic.js?v=${assetVersion}`);
const {todayBeirut,addDays,weekStart,weekEnd,weekLabel,niceDay,monthKey,monthLabel,shiftMonth,amount,parseUSD} = await import(`./lib/date.js?v=${assetVersion}`);
const app=document.getElementById('app');
let sidebarCollapsed=false;
let mobileMenuOpen=false;
let routeInitialized=false;
try{sidebarCollapsed=readSidebarCollapsed(window.localStorage)}catch{}
function esc(x){return String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function initials(name){return String(name).split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase()}
function tag(label,color='green'){return `<span class="tag tag-${color}">${esc(label)}</span>`}
function btn(label,action,cls='btn-light',more=''){return `<button class="btn ${cls}" data-action="${action}" ${more}>${label}</button>`}
function toast(message,bad=false){const host=document.getElementById('toast-host');const node=document.createElement('div');node.className=`toast ${bad?'bad':''}`;node.textContent=message;host.append(node);setTimeout(()=>node.remove(),4100)}
// 30-second all-page sync updates data in memory without discarding active drafts.
let autoRefreshRunning=false;
// Sync the data but do not replace table elements while someone is scrolling.
let lastScrollAt=0;
document.addEventListener('scroll',event=>{
 if(event.isTrusted)lastScrollAt=Date.now();
},{capture:true,passive:true});
function canAutoRender(){
 const active=document.activeElement;
 return Date.now()-lastScrollAt>1400 &&
  !state.modal && !active?.closest('form,.cafe-quick-sheet,[contenteditable="true"]') &&
  !['INPUT','TEXTAREA','SELECT'].includes(active?.tagName);
}
const TEAM_GROUPS=[['top_team','Top Team'],['team','Team'],['rising_stars','Rising Stars Team'],['ladies_team','Ladies Team']];
function groupLabel(value){return TEAM_GROUPS.find(([id])=>id===value)?.[1]||'Team';}
const LEGACY_MATCHMAKER_ID='75b8dc1b-0529-489f-8aa1-9a464d9d61a1';
const state={tab:'dashboard',members:[],balances:[],matches:[],games:[],resets:[],special:[],specialGames:[],finance:[],settlements:[],matchmakers:[],matchmakerId:LEGACY_MATCHMAKER_ID,audit:[],staff:null,month:monthKey(todayBeirut()),teamSearch:'',teamSort:'name',teamFilter:'all',teamCategoryFilter:'all',activitySearch:'',loading:false,modal:null,historyWeek:weekStart(todayBeirut()),historyData:null,historyLoading:false,reportMode:'week',reportWeek:weekStart(todayBeirut()),reportMonth:monthKey(todayBeirut()),reportDay:todayBeirut(),reportData:null,reportKey:'',reportLoading:false,reportCompare:false,reportCompareDay:addDays(todayBeirut(),-1),reportCompareWeek:addDays(weekStart(todayBeirut()),-7),reportCompareMonth:shiftMonth(monthKey(todayBeirut()),-1),reportCompareData:null,reportCompareKey:'',trainingMonth:monthKey(todayBeirut()),trainingSessions:[],trainingAttendance:[],trainingLoading:false,trainingLoadedMonth:null,trainingError:null,privateClients:[],privateCoaches:[],privateEntries:[],privateBookings:[],privateLoaded:false,privateLoading:false,privateError:null,privateSearch:'',privateSelected:null,privateNotesOpen:false,privateShowArchived:false,privateListFilter:'all',privateSort:'name',privateDay:todayBeirut(),debtPeople:[],debtEntries:[],debtLoaded:false,debtLoading:false,debtError:null,debtSearch:'',debtSelected:null,debtFilter:'all',debtDay:todayBeirut(),settingsPrivateAccountId:'',settingsCafeteriaAccountId:'',overviewTrainingAttendance:[],overviewTrainingMonth:'',overviewTrainingLoading:false,overviewTrainingError:null,overviewTrainingFetchedAt:0,globalSearchOpen:false,globalSearchQuery:'',alertExpanded:false};
// The daily cashbook owns its own dated Supabase query and does not mix with other ledgers.
const consignmentInventory=consignmentModule.createConsignmentInventory({
 api,heading,icon,toast,
 isAdmin:()=>state.staff?.role==='admin',
 rerender:()=>{if(state.tab==='consignment'&&api.getSession()?.access_token&&!autoRefreshRunning)render()}
});
const shiftHandover=shiftHandoverModule.createCafeteriaShiftHandover({
 api,amount,today,toast,
 staff:()=>state.staff,isAdmin:()=>state.staff?.role==='admin',
 rerender:()=>{if(state.tab==='cafeteria-finances'&&api.getSession()?.access_token&&!autoRefreshRunning)render()}
});
const cafeteriaFinances=cafeteriaFinanceModule.createCafeteriaFinances({
 api,heading,icon,amount,today,addDays,
 rerender:()=>{if(['cafeteria-finances','court-timetable'].includes(state.tab)&&api.getSession()?.access_token)render()},
 toast,isAdmin:()=>state.staff?.role==='admin',
 canVoid:()=>['admin','staff'].includes(state.staff?.role),
 exportArabicPdf:data=>arabicDailyPdf.previewArabicDailySheet(data),
 renderShiftHandover:(day,editable)=>shiftHandover.page(day,editable),
 onShiftDateChanged:day=>{void shiftHandover.load(day)},
 sendArabicPdf:async data=>{
  // The same PDF bytes are downloaded and uploaded once; no Supabase Storage.
  const {pdf,pages}=arabicDailyPdf.makeArabicDailySheetPdf(data);
  arabicDailyPdf.downloadArabicPdfBlob(pdf,data.date);
  const form=new FormData();
  form.append('date',data.date);
  form.append('pdf',pdf,'padel-on-daily-sheet-'+data.date+'.pdf');
  try{
   const result=await api.functionUpload('send-arabic-pdf-whatsapp',form);
   if(result?.accepted!==true)throw Error('WhatsApp did not accept the message.');
   return {pages,messageId:result.messageId};
  }catch(err){
   throw Error('PDF downloaded locally, but WhatsApp did not send: '+(err?.message||'Please check the WhatsApp integration.'));
  }
 }
});
const cafeteriaTodo=cafeteriaTodoModule.createCafeteriaTodo({
 api,today,toast,
 isAdmin:()=>state.staff?.role==='admin',
 rerender:()=>{if(state.tab==='cafeteria-payments'&&api.getSession()?.access_token&&!autoRefreshRunning)render()}
});
const cafeteriaPayments=cafeteriaPaymentsModule.createCafeteriaPayments({
 api,heading,icon,amount,today,toast,
 isAdmin:()=>state.staff?.role==='admin',
 rerender:()=>{if(state.tab==='cafeteria-payments'&&api.getSession()?.access_token&&!autoRefreshRunning)render()}
});
const tournamentManagement=tournamentModule.createTournamentManagement({
 api,heading,icon,today,toast,
 rerender:()=>{if(state.tab==='tournament'&&api.getSession()?.access_token)render()},
 isAdmin:()=>state.staff?.role==='admin'
});
const clubInsights=clubInsightsModule.createCashInsights({
 api,today,amount,renderIfVisible:tab=>{if(state.tab===tab&&api.getSession()?.access_token&&!autoRefreshRunning&&canAutoRender())render()}
});
const compareClubInsights=clubInsightsModule.createCashInsights({
 api,today,amount,renderIfVisible:tab=>{if(state.reportCompare&&state.tab===tab&&api.getSession()?.access_token&&!autoRefreshRunning&&canAutoRender())render()}
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
 cafeteriaFinances.reset();cafeteriaPayments.reset();cafeteriaTodo.reset();consignmentInventory.reset();shiftHandover.reset();clubInsights.reset();compareClubInsights.reset();
 state.modal=null;state.globalSearchOpen=false;state.globalSearchQuery='';routeInitialized=false;
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
function personMatchmakingRows(person){return state.finance.filter(g=>(g.matchmaker_id||LEGACY_MATCHMAKER_ID)===person.id)}
// Compatibility for installations that have not yet loaded matchmaker accounts.
function matchmakerRate(){return 1500}
function matchmakingFee(cents){return Math.round(Number(cents||0)*.15)}
function personFinancials(ym,person){
 return getMatchmakingFinance(personMatchmakingRows(person),ym);
}
function personStreak(person){return getMatchmakingCurrentStreak(personMatchmakingRows(person),today())}
function financials(ym=state.month){
 const person=selectedMatchmaker();
 return person?personFinancials(ym,person):getMatchmakingFinance(state.finance,ym);
}
function navMarkup(mobile=false,scope=mobile?'mobile':'desktop'){return renderNavigation(state.tab,icon,mobile,state.staff?.role==='admin',scope)}
function syncBrowserRoute(tab,{replace=false}={}){
 const hash=hashForTab(tab);
 if(tab==='tournament'&&window.location.hash.startsWith('#tournament/'))return;
 if(window.location.hash!==hash)
  window.history[replace?'replaceState':'pushState'](null,'',hash);
}
async function navigateToTab(tab){
 if(!api.getSession()?.access_token||!state.staff||!canAccessTab(tab,state.staff.role))return;
 if(mobileMenuOpen)setMobileMenuOpen(false,{restoreFocus:false});
 state.tab=tab;state.modal=null;state.globalSearchOpen=false;state.globalSearchQuery='';
 render();window.scrollTo({top:0,behavior:'instant'});
 if(tab==='reports'){void loadClubSources();await loadReport();}
 if(tab==='dashboard'){loadClubSources();void clubInsights.loadOverview(true);}
 if(tab==='debts')await loadDebtData();
 if(tab==='consignment')await consignmentInventory.load();
 if(tab==='training')await loadTrainingMonth();
 if(tab==='private-clients')await loadPrivateClients();
 if(tab==='cafeteria-finances')await Promise.all([cafeteriaFinances.load(true),shiftHandover.load(cafeteriaFinances.getDate())]);
 if(tab==='court-timetable')await cafeteriaFinances.schedulerLoad(true);
 if(tab==='cafeteria-payments')await Promise.all([cafeteriaPayments.load(),cafeteriaTodo.load()]);
 if(tab==='tournament')await tournamentManagement.load(true);
 if(tab==='settings'&&state.staff?.role==='admin'){
  await Promise.all([loadPrivateClients(),loadDebtData()]);
  if(state.tab==='settings'&&api.getSession()?.access_token)render();
 }
}
async function applyLocationRoute(){
 if(!routeInitialized||!api.getSession()?.access_token||!state.staff)return;
 const tab=resolveTabFromHash(window.location.hash,state.staff.role);
 if(window.location.hash!==hashForTab(tab))syncBrowserRoute(tab,{replace:true});
 if(tab!==state.tab)await navigateToTab(tab);
 else if(tab==='tournament'&&tournamentManagement.applyHashRoute(window.location.hash))render();
}
window.addEventListener('popstate',()=>{void applyLocationRoute().catch(err=>toast(err.message||'Navigation failed',true));});
window.addEventListener('hashchange',()=>{void applyLocationRoute().catch(err=>toast(err.message||'Navigation failed',true));});
// Drawer operates in place so opening navigation never clears a half-filled form.
function setMobileMenuOpen(open,{restoreFocus=true}={}){
 mobileMenuOpen=Boolean(open);
 const drawer=app.querySelector('#mobile-drawer');
 if(!drawer)return;
 drawer.classList.toggle('is-open',mobileMenuOpen);
 drawer.setAttribute('aria-hidden',String(!mobileMenuOpen));
 if(mobileMenuOpen)drawer.removeAttribute('inert');
 else drawer.setAttribute('inert','');
 document.body.classList.toggle('mobile-menu-open',mobileMenuOpen);
 const trigger=app.querySelector('[data-action="mobile-menu-toggle"]');
 trigger?.setAttribute('aria-expanded',String(mobileMenuOpen));
 if(mobileMenuOpen)drawer.querySelector('[data-action="mobile-menu-close"]')?.focus();
 else if(restoreFocus)trigger?.focus();
}
function toggleDesktopSidebar(){
 // Change layout in place to preserve forms, drafts, and scroll positions.
 sidebarCollapsed=!sidebarCollapsed;
 try{storeSidebarCollapsed(window.localStorage,sidebarCollapsed)}catch{}
 const layout=app.querySelector('.app-layout');
 if(!layout)return;
 layout.classList.toggle('sidebar-collapsed',sidebarCollapsed);
 const control=layout.querySelector('[data-action="sidebar-toggle"]');
 if(!control)return;
 const label=sidebarToggleLabel(sidebarCollapsed);
 control.setAttribute('aria-label',label);
 control.setAttribute('title',label);
 control.setAttribute('aria-expanded',String(!sidebarCollapsed));
 control.innerHTML=icon(sidebarCollapsed?'chevronRight':'chevronLeft');
}
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
 return `<div class="app-layout ${sidebarCollapsed?'sidebar-collapsed':''}"><aside class="sidebar" aria-label="Primary navigation"><div class="sidebar-panel"><div class="sidebar-header"><div class="sidebar-brand"><div class="brand"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/></div><span class="brand-compact" aria-hidden="true">PO</span></div><button type="button" class="sidebar-toggle" data-action="sidebar-toggle" aria-controls="sidebar-menu" aria-label="${sidebarToggleLabel(sidebarCollapsed)}" title="${sidebarToggleLabel(sidebarCollapsed)}" aria-expanded="${!sidebarCollapsed}">${icon(sidebarCollapsed?'chevronRight':'chevronLeft')}</button></div><div class="brand-sub">Club management</div><nav class="menu" id="sidebar-menu" aria-label="Sections">${navMarkup()}</nav><div class="menu-footer"><div class="sidebar-bottom">© ${new Date().getFullYear()} PADEL ON</div></div></div></aside><main class="main"><header class="topbar"><button type="button" class="mobile-menu-toggle" data-action="mobile-menu-toggle" aria-label="Open navigation menu" aria-controls="mobile-drawer" aria-expanded="${mobileMenuOpen}">${icon("menu")}</button><div class="topbar-identity"><div class="crumb">PADEL ON / ${esc(navSectionForTab(state.tab)?.label||"Club Management")}</div><div class="topbar-main">${titleFor()}</div></div><div class="top-right">${btn(icon('search'),'global-search-open','btn-light btn-icon','aria-label="Search PADEL ON" title="Search PADEL ON (Ctrl+K)"')}${btn(icon('refresh'),'refresh','btn-light btn-icon','aria-label="Refresh data" title="Refresh data"')}<div class="user-meta"><strong>${esc(name)}</strong><small>${esc(state.staff?.role||'staff')} account</small></div><div class="avatar">${esc(initials(name))}</div></div></header><div data-page="${esc(state.tab)}" class="workspace ${state.tab==='private-clients'||state.tab==='debts'||state.tab==='consignment'||state.tab==='tournament'||state.tab==='court-timetable'?'workspace-wide':''}">${renderPage()}<div class="page-footer">PADEL ON · Beirut time</div></div></main><div id="mobile-drawer" class="mobile-drawer ${mobileMenuOpen?'is-open':''}" aria-hidden="${!mobileMenuOpen}" ${mobileMenuOpen?'':'inert'}><button type="button" class="mobile-drawer-backdrop" data-action="mobile-menu-close" aria-label="Close navigation menu"></button><aside class="mobile-drawer-panel" aria-label="Mobile sections"><div class="mobile-drawer-header"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/><button class="mobile-menu-close" type="button" data-action="mobile-menu-close" aria-label="Close menu">${icon('close')}</button></div><div class="mobile-drawer-title">Workspace navigation</div><nav class="mobile-drawer-links" aria-label="All sections">${navMarkup(false,'drawer')}</nav><div class="mobile-drawer-account"><span class="avatar">${esc(initials(name))}</span><div><strong>${esc(name)}</strong><small>${esc(state.staff?.role||'staff')} account</small></div></div></aside></div></div><div id="modal-root">${state.modal?modalMarkup():''}</div>${globalSearchOverlay()}`;
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
 const commissionTotal=matchmakers.reduce((total,p)=>total+getMatchmakingStreakLedger(personMatchmakingRows(p))
  .filter(e=>inPeriod(e.played_on)).reduce((sum,row)=>sum+Number(row.commission_cents||0),0),0);
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
 <div class="data-table-wrap"><table class="data-table po-overview-sessions"><thead><tr><th>Client</th><th>Coach</th><th>Charge</th><th>Paid</th></tr></thead>
 <tbody>${!state.privateLoaded?'<tr><td colspan="4" class="panel-empty">'+(state.privateError?'Private sessions unavailable':'Loading private sessions…')+'</td></tr>':rows||'<tr><td colspan="4" class="panel-empty">No private sessions recorded today.</td></tr>'}</tbody></table></div></article>`;
 const commissions=`<article class="panel"><div class="panel-head"><div><h2>Pending matchmaking commissions</h2><p>${monthLabel(month)} · not marked as paid</p></div><button class="link" data-tab="finance">Matchmaking ${icon('arrow')}</button></div><div class="panel-body">
 <div class="management-commission-total">${amount(pending)}<small>${dueRows.length} unsettled person${dueRows.length===1?'':'s'}</small></div>
 ${dueRows.length?dueRows.slice(0,5).map(x=>`<div class="management-commission-row"><span>${esc(x.name)}</span><strong>${amount(x.fee)}</strong></div>`).join(''):'<div class="panel-empty">No unpaid commissions recorded this month.</div>'}
 
 </div></article>`;
 return `<div class="management-section-label"><h2>Today's club operations</h2><span>${niceDay(todayDate,{weekday:'long',month:'long',day:'numeric'})} · Asia/Beirut</span></div>
 ${overviewMetrics}
 ${clubInsights.overviewHTML()}
 <div class="two-col management-panels">${managementAlertPanel()}${commissions}</div>
 <div class="management-section-label"><h2>Daily coaching activity</h2></div>${todayPanel}`;
}
// Small-screen activity chart shares the same seven-day period for all four ledgers.
function activityVisualization(){
 const days=sevenDayActivity(today(),{
  teamMatches:state.matches,specialGames:state.specialGames,
  matchmaking:state.finance,privateEntries:state.privateLoaded?state.privateEntries:[]
 },addDays);
 const total=days.reduce((sum,day)=>sum+day.total,0),maximum=Math.max(1,...days.map(day=>day.total));
 const bars=days.map(day=>{
  const weekday=new Date(day.date+'T12:00:00Z').toLocaleDateString('en-US',{weekday:'short',timeZone:'UTC'});
  const subtitle=[day.team+' team',day.special+' benefits',day.matchmaking+' matchmaking',day.sessions+' training'].join(', ');
  const segments=[['team',day.team],['special',day.special],['matchmaking',day.matchmaking],['sessions',day.sessions]]
   .filter(([,count])=>count>0).map(([kind,count])=>'<i class="po-chart-segment po-chart-'+kind+'" style="flex:'+count+'"></i>').join('');
  return '<div class="po-chart-day"><div class="po-chart-count">'+day.total+'</div>'+
   '<div class="po-chart-track"><div class="po-chart-bar" style="height:'+Math.round(day.total/maximum*100)+'%" title="'+esc(day.date+' — '+subtitle)+'" aria-label="'+esc(day.date+' — '+subtitle)+'">'+segments+'</div></div>'+
   '<span>'+weekday+'</span></div>';
 }).join('');
 return '<section class="panel po-activity-panel" aria-label="Seven-day activity summary"><div class="panel-head"><div><h2>Activity — last 7 days</h2>'+
  '<p>Recorded team games, special games, matchmaking and private sessions</p></div>'+
  '<span class="po-chart-total">'+total+' entries</span></div>'+
  '<div class="po-chart-wrap">'+bars+'</div><div class="po-chart-legend">'+
  '<span class="po-legend-team">Team games</span><span class="po-legend-special">Other benefits</span>'+
  '<span class="po-legend-matchmaking">Matchmaking</span><span class="po-legend-sessions">Private sessions</span></div>'+
  (!state.privateLoaded?'<p class="po-chart-note">Private session records are loading; this chart updates when they arrive.</p>':'')+
  '<p class="po-chart-note">Activity counts are not cash receipts and do not represent court occupancy.</p></section>';
}
function dashboard(){const normal=normalMembers();const used=normal.reduce((n,m)=>n+status(m).used,0),left=normal.reduce((n,m)=>n+status(m).remain,0),empty=normal.filter(m=>status(m).remain===0).length;const recent=recentActivity(6);return `
${heading('Club operations','Today at PADEL ON','Daily accounts, team benefits and activity in one place.',btn(`${icon('plus')} Quick Match`,'quick-team','btn-primary'))}
${overviewExtra()}
<div class="management-section-label po-week-label"><h2>Team benefits this week</h2><span>${weekLabel(today())} · weekly reset</span></div>
<section class="summary">${summaryCard('Active team members',state.members.filter(m=>m.active).length,'','users',true)}${summaryCard('Benefits used',used,'This week · standard members','activity')}${summaryCard('Benefits remaining',left,'Available this week','gift')}${summaryCard('Allowances exhausted',empty,'Members with 0 remaining','shield')}</section>
${activityVisualization()}
<section class="two-col"><article class="panel"><div class="panel-head"><div><h2>Recent game activity</h2><p>Last 30 days · latest first</p></div><button class="link" data-tab="activity">View all ${icon('arrow')}</button></div><div class="panel-body">${recent.length?recent.map(a=>`<div class="activity-line"><div class="activity-avatar">${esc(initials(a.names.split(',')[0]))}</div><div class="activity-copy"><strong>${esc(a.names)}</strong><small>${esc(a.type)}</small></div><span class="small-date">${niceDay(a.date)}</span></div>`).join(''):`<div class="empty-prompt">${icon('calendar')}<strong>No new games yet</strong><span>Recorded games will appear here.</span></div>`}</div></article><article class="panel"><div class="panel-head"><div><h2>Quick actions</h2></div></div><div class="panel-body quick-list"><button class="quick-link" data-action="quick-team">${icon('plus')}<span><strong>Quick Match</strong><small>Choose all four participants</small></span></button><button class="quick-link" data-tab="debts">${icon('wallet')}<span><strong>Cafeteria debts</strong><small>Track unpaid purchases and partial payments</small></span></button><button class="quick-link" data-action="add-nazih">${icon('wallet')}<span><strong>Log matchmaking revenue</strong><small>Separate revenue and commission by matchmaker</small></span></button><button class="quick-link" data-tab="other">${icon('gift')}<span><strong>Other player benefits</strong><small>Free game eligibility</small></span></button><button class="quick-link" data-tab="settings">${icon('settings')}<span><strong>Management settings</strong><small>Members and secure resets</small></span></button></div></article></section>`}
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
${historical?`<article class="panel"><div class="panel-head"><div><h2>Games during this week</h2><p>${activity.length} match(es) recorded</p></div></div><div class="panel-body">${activity.length?activity.map(m=>`<div class="activity-line"><div class="activity-avatar">${icon('calendar')}</div><div class="activity-copy"><strong>${niceDay(m.played_on)} · ${esc(m.benefit_type==='free'?'Free':'Half-price')}</strong><small>${esc(selectedGames.filter(g=>g.match_id===m.id&&!g.voided_at).map(g=>state.members.find(x=>x.id===g.member_id)?.name).filter(Boolean).join(', ')||'Team game')}</small></div></div>`).join(''):'<div class="panel-empty">No recorded matches this week.</div>'}</div></article>`:''}`;}
function weekNavigator(selected,section){
 const current=weekStart(today());
 return `<div class="period-control"><div><strong>${icon('calendar')} ${weekLabel(selected)}</strong><small>${selected===current?'Current Monday–Sunday period':'Past week · view only'}</small></div><div class="period-buttons"><button class="btn btn-light" data-action="${section}-prev-week" aria-label="Previous week">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="${section}-next-week" ${selected>=current?'disabled':''} aria-label="Next week">${icon('chevronRight')}</button></div></div>`;
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
function reportPeriodValue(compare=false){
 if(state.reportMode==='day')return compare?state.reportCompareDay:state.reportDay;
 if(state.reportMode==='week')return compare?state.reportCompareWeek:state.reportWeek;
 return compare?state.reportCompareMonth:state.reportMonth;
}
function setReportPeriodValue(compare,value){
 const key=state.reportMode==='day'?'Day':state.reportMode==='week'?'Week':'Month';
 state[compare?'reportCompare'+key:'report'+key]=value;
}
function reportRange(compare=false){return reportComparison.reportPeriodRange(state.reportMode,reportPeriodValue(compare))}
function reportPeriodTitle(compare=false){return reportComparison.reportPeriodTitle(state.reportMode,reportPeriodValue(compare))}
function resetReportComparison(){
 setReportPeriodValue(true,reportComparison.previousReportPeriod(state.reportMode,reportPeriodValue(false)));
}
function shiftedComparison(steps){
 let candidate=reportComparison.shiftReportPeriod(state.reportMode,reportPeriodValue(true),steps);
 const primary=reportPeriodValue(false);
 if(candidate===primary)candidate=reportComparison.shiftReportPeriod(state.reportMode,candidate,steps);
 const maximum=state.reportMode==='day'?today():state.reportMode==='week'?weekStart(today()):monthKey(today());
 return candidate<=maximum?candidate:null;
}
function ensureDifferentComparison(){if(state.reportCompare&&reportPeriodValue(true)===reportPeriodValue(false))resetReportComparison()}
async function loadReport({background=false}={}){
 if(background&&state.reportLoading)return;
 const [start,end]=reportRange(),mode=state.reportMode;
 const compareRange=state.reportCompare?reportRange(true):null;
 const request=++reportSeq;
 const insightFetch=clubInsights.loadReport(start,end,true);
 const compareInsightFetch=compareRange?compareClubInsights.loadReport(compareRange[0],compareRange[1],true):Promise.resolve();
 state.reportLoading=true;
 if(!background){state.reportData=null;state.reportCompareData=null}
 state.reportKey=`${mode}:${start}`;
 state.reportCompareKey=compareRange?`${mode}:${compareRange[0]}`:'';
 if(!background)render();
 const results=await Promise.allSettled([fetchPeriod(start,end),compareRange?fetchPeriod(compareRange[0],compareRange[1]):Promise.resolve(null)]);
 if(request===reportSeq){
  if(results[0].status==='fulfilled')state.reportData=results[0].value;
  else toast('Could not load report: '+results[0].reason.message,true);
  if(compareRange){
   if(results[1].status==='fulfilled')state.reportCompareData=results[1].value;
   else toast('Could not load comparison: '+results[1].reason.message,true);
  }
 }
 // Let the background finance reports finish before ending auto-refresh, even
 // when a match report fails. This avoids a delayed repaint over a form.
 if(background)await Promise.allSettled([insightFetch,compareInsightFetch]);
 if(request===reportSeq){state.reportLoading=false;if(!background)render()}
}
function buildReportMetrics(data,mode,period){
 if(!data)return null;
 const validMatches=data.matches.filter(m=>!m.voided_at);
 const matchIDs=new Set(validMatches.map(m=>m.id));
 const games=data.games.filter(g=>!g.voided_at&&matchIDs.has(g.match_id));
 const free=games.filter(g=>g.benefit_type==='free').length,half=games.length-free;
 const special=data.specialGames.length;
 const rows=state.members.map(m=>{
  const personal=games.filter(g=>g.member_id===m.id);
  const opening=mode==='week'?(Number(state.balances.find(b=>b.member_id===m.id&&b.week_start===period)?.used||0)):0;
  const st=mode==='week'?getWeeklyStatus(m,period,state.balances,games,data.resets):null;
  return {member:m,played:personal.length,free:personal.filter(g=>g.benefit_type==='free').length,half:personal.filter(g=>g.benefit_type==='half').length,used:st?.used??personal.length,remaining:st?.remain,opening};
 }).filter(r=>r.played||r.used).sort((a,b)=>b.used-a.used||a.member.name.localeCompare(b.member.name));
 const weekUsed=mode==='week'?state.members.filter(m=>!m.unlimited).reduce((n,m)=>n+getWeeklyStatus(m,period,state.balances,games,data.resets).used,0):null;
 const financeMonth=mode==='month'?period:state.reportMonth;
 const breakdown=state.matchmakers.length?state.matchmakers.map(person=>({...personFinancials(financeMonth,person),person})): [{...getMatchmakingFinance(state.finance,financeMonth),person:{name:'Nazih Sonbol'}}];
 const monthFinance={total:breakdown.reduce((sum,r)=>sum+r.total,0),fee:breakdown.reduce((sum,r)=>sum+r.fee,0),games:breakdown.reduce((sum,r)=>sum+r.games,0)};
 return {validMatches,games,rows,free,half,special,weekUsed,monthFinance,breakdown};
}
function reportMetrics(){return buildReportMetrics(state.reportData,state.reportMode,reportPeriodValue(false))}
function reportCompareMetrics(){return state.reportCompare?buildReportMetrics(state.reportCompareData,state.reportMode,reportPeriodValue(true)):null}
function matchmakingBreakdownHTML(rows){
 return `<article class="panel matchmaking-breakdown"><div class="panel-head"><div><h2>Matchmaking by person</h2><p>Independent monthly revenue, commissions, and payments</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Matchmaker</th><th>Games</th><th>Revenue</th><th>Rate</th><th>Commission</th><th>Settlement</th></tr></thead><tbody>${rows.map(r=>{
 const settlement=state.settlements.find(x=>(x.matchmaker_id||LEGACY_MATCHMAKER_ID)===(r.person.id||LEGACY_MATCHMAKER_ID)&&x.month_key===state.reportMonth+'-01');
 return `<tr><td><strong>${esc(r.person.name)}</strong></td><td>${r.games}</td><td>${amount(r.total)}</td><td>Daily streak</td><td><strong>${amount(r.fee)}</strong></td><td>${tag(settlement?.status==='paid'?'Paid':'Unpaid',settlement?.status==='paid'?'green':'amber')}</td></tr>`;
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
 <div class="consolidated-finance-current"><h3>Current account balances</h3>
 ${line('Outstanding private coaching',balances.privateOwed,'Amount customers currently owe')}
 ${line('Outstanding cafeteria accounts',balances.cafeteriaOwed,'Unpaid cafeteria purchases')}
 ${line('Prepaid private client credit',balances.privateCredit,'Credit already added to client accounts')}
 ${line('Prepaid cafeteria credit',balances.cafeteriaCredit,'Credit held for future cafeteria purchases')}
 </div>
 <p class="management-note consolidated-note">Balances show what clients owe or have prepaid today. Payments and deposits are separate from new sales.</p>
 </article>`;
}
function reportComparisonRows(){
 const primary=reportMetrics(),comparison=reportCompareMetrics();
 if(!primary||!comparison)return [];
 const [start,end]=reportRange(),[compareStart,compareEnd]=reportRange(true);
 return reportComparison.reportComparisonMetrics(state.reportMode,primary,comparison,
  clubInsights.reportTotals(start,end),compareClubInsights.reportTotals(compareStart,compareEnd));
}
function reportComparisonHTML(){
 if(!state.reportCompare)return '';
 const rows=reportComparisonRows(),selected=reportPeriodTitle(false),compared=reportPeriodTitle(true);
 if(!rows.length)return `<article class="panel report-comparison-panel"><div class="panel-empty">${state.reportLoading?'Loading both periods…':'Comparison data is unavailable.'}</div></article>`;
 const shown=(value,kind)=>kind==='money'?(value<0?'−'+amount(-value):amount(value)):String(value);
 const difference=(row)=>{const value=row.primary-row.comparison;if(value===0)return '—';return (value>0?'+':'−')+shown(Math.abs(value),row.kind)};
 return `<article class="panel report-comparison-panel"><div class="panel-head"><div><h2>Period comparison</h2><p>Difference = selected period minus comparison period</p></div></div><div class="data-table-wrap"><table class="data-table report-comparison-table"><thead><tr><th>Metric</th><th>${esc(selected)}</th><th>${esc(compared)}</th><th>Difference</th></tr></thead><tbody>${rows.map(row=>`<tr><td><strong>${esc(row.label)}</strong></td><td class="num">${shown(row.primary,row.kind)}</td><td class="num">${shown(row.comparison,row.kind)}</td><td class="num report-difference">${difference(row)}</td></tr>`).join('')}</tbody></table></div>${clubInsights.reportTotals(...reportRange())&&compareClubInsights.reportTotals(...reportRange(true))?'':'<p class="report-comparison-loading">Financial comparison is still loading; activity totals are already shown.</p>'}</article>`;
}
function reportsPage(){
 const [start,end]=reportRange();
 const weekly=state.reportMode==='week',daily=state.reportMode==='day',m=reportMetrics(),cm=reportCompareMetrics();
 const title=reportPeriodTitle(false),comparisonTitle=reportPeriodTitle(true);
 const exportDisabled=!m||(state.reportCompare&&!cm);
 const compareInputType=state.reportMode==='month'?'month':'date';
 const compareMax=state.reportMode==='month'?monthKey(today()):today();
 return `${heading('Operations overview','Operations & Financial Reports','',btn(`${icon('download')} Export CSV`,'export-report','btn-primary',exportDisabled?'disabled':'')+btn('Print / Save PDF','print-report','btn-light',exportDisabled?'disabled':''))}
<div class="report-mode"><button class="btn ${daily?'btn-primary':'btn-light'}" data-action="report-mode-day">Daily report</button><button class="btn ${weekly?'btn-primary':'btn-light'}" data-action="report-mode-week">Weekly report</button><button class="btn ${!weekly&&!daily?'btn-primary':'btn-light'}" data-action="report-mode-month">Monthly report</button></div>
<div class="period-control"><div><strong>${icon('calendar')} ${title}</strong><small>${daily?'Daily activity and cash count':weekly?'Weekly benefits and records':'Monthly games and matchmaking revenue'} · Asia/Beirut dates</small></div><div class="period-buttons"><button class="btn btn-light" data-action="report-prev" aria-label="Previous ${daily?'day':weekly?'week':'month'}">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="report-next" ${(daily?state.reportDay>=today():weekly?state.reportWeek>=weekStart(today()):state.reportMonth>=monthKey(today()))?'disabled':''} aria-label="Next ${daily?'day':weekly?'week':'month'}">${icon('chevronRight')}</button></div></div>
<div class="report-compare-toolbar"><button class="btn ${state.reportCompare?'btn-soft':'btn-light'}" data-action="report-compare-toggle">${state.reportCompare?'Hide comparison':'Compare with another '+(daily?'day':weekly?'week':'month')}</button>${state.reportCompare?'<span>Selected: '+esc(title)+' · Compared with: '+esc(comparisonTitle)+'</span>':''}</div>
${state.reportCompare?`<div class="period-control report-compare-control"><div><strong>${icon('calendar')} Compare with ${esc(comparisonTitle)}</strong><small>${weekly?'Choose the Monday of another week':'Choose any other '+(daily?'day':'month')} · Asia/Beirut dates</small></div><div class="report-compare-picker"><button class="btn btn-light" data-action="report-compare-prev" aria-label="Earlier comparison period">${icon('chevronLeft')}</button><input id="report-compare-period" type="${compareInputType}" value="${esc(reportPeriodValue(true))}" max="${compareMax}" aria-label="Comparison period"/><button class="btn btn-light" data-action="report-compare-next" aria-label="Later comparison period" ${shiftedComparison(1)?'':'disabled'}>${icon('chevronRight')}</button></div></div>`:''}
${reportComparisonHTML()}
${!m?`<div class="panel-empty">${state.reportLoading?'Loading report…':'No report loaded. Use the period arrows to retry.'}</div>`:`
<section class="finance-grid">${summaryCard('Team matches',m.validMatches.length,'Matches recorded in selected period','calendar',true)}${summaryCard('Benefit uses',weekly?m.weekUsed:m.games.length,weekly?'Includes starting balances':'For selected dates','gift')}${summaryCard('Free / Half-price',`${m.free} / ${m.half}`,'Per-member benefit entries','activity')}</section>
${daily?'':weekly?`<div class="notice">Past weeks use current member allowances and include recorded resets.</div>`:`<section class="finance-grid">${summaryCard('Matchmaking revenue',amount(m.monthFinance.total),'All matchmaking personnel','wallet',true)}${summaryCard('Total commissions',amount(m.monthFinance.fee),'Sum of independent monthly commissions','coins')}${summaryCard('Other benefit games',m.special,'Special-player entries this month','users')}</section>${matchmakingBreakdownHTML(m.breakdown)}${consolidatedFinancePanel(state.reportMonth)}`}
${clubInsights.reportHTML(start,end)}
<article class="panel"><div class="panel-head"><div><h2>Team member breakdown</h2><p>${title} · ${m.rows.length} members with activity</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Category</th><th>Games logged</th><th>Free</th><th>Half-price</th><th>${weekly?'Week used':'Monthly total'}</th>${weekly?'<th>Remaining*</th>':''}</tr></thead><tbody>${m.rows.length?m.rows.map(r=>`<tr><td><strong>${esc(r.member.name)}</strong></td><td>${esc(groupLabel(r.member.team_category))}</td><td>${r.played}</td><td>${r.free}</td><td>${r.half}</td><td><strong>${r.used}</strong></td>${weekly?`<td>${r.member.unlimited?'Unlimited':r.remaining}</td>`:''}</tr>`).join(''):`<tr><td colspan="${weekly?7:6}" class="panel-empty">No benefits recorded for this period.</td></tr>`}</tbody></table></div></article>
<div class="archive-note">${weekly?'* Remaining benefits use current allowances.':'Monthly game counts exclude starting balances.'}</div>
`}`;
}
function exportReport(){
 const m=reportMetrics();if(!m)throw Error('Load the report before exporting.');
 const weekly=state.reportMode==='week',daily=state.reportMode==='day',period=daily?state.reportDay:weekly?state.reportWeek:state.reportMonth;
 const rows=[['PADEL ON',state.reportMode==='day'?'Daily Operations Report':weekly?'Weekly Game Report':'Monthly Game Report',period],
  ['Team matches',m.validMatches.length],['Logged benefit uses',m.games.length],
  ['Free entries',m.free],['Half-price entries',m.half],['Other-player games',m.special]];
 if(state.reportCompare){
  const selected=reportPeriodTitle(false),compared=reportPeriodTitle(true),comparisonRows=reportComparisonRows();
  if(!comparisonRows.length)throw Error('Load both periods before exporting the comparison.');
  rows.push([],['PERIOD COMPARISON'],['Metric',selected,compared,'Difference (selected - comparison)']);
  for(const row of comparisonRows){
   const format=value=>row.kind==='money'?(value/100).toFixed(2):value;
   rows.push([row.label,format(row.primary),format(row.comparison),format(row.primary-row.comparison)]);
  }
 }
 if(weekly)rows.push(['Weekly used (including opening balances)',m.weekUsed]);
 else if(!daily) {const finance=clubFinancialSnapshot(state.reportMonth,'month');rows.push([],['CLUB FINANCIAL OVERVIEW',state.reportMonth],['Cash received across tracked operations USD',finance.collected===null?'Not loaded':(finance.collected/100).toFixed(2)],['Private session fees (charges) USD',finance.privateCharges===null?'Not loaded':(finance.privateCharges/100).toFixed(2)],['Private payments at sessions USD',finance.privatePaid===null?'Not loaded':(finance.privatePaid/100).toFixed(2)],['Private balance top-ups USD',finance.privateTopups===null?'Not loaded':(finance.privateTopups/100).toFixed(2)],['Cafeteria purchases charged USD',finance.cafeteriaCharges===null?'Not loaded':(finance.cafeteriaCharges/100).toFixed(2)],['Cafeteria payments received USD',finance.cafeteriaPaid===null?'Not loaded':(finance.cafeteriaPaid/100).toFixed(2)],['Matchmaking collections USD',(finance.matchmakingCollected/100).toFixed(2)],['Matchmaking commissions USD',(finance.commissionTotal/100).toFixed(2)]);
const currentBalances=clubBalanceSnapshot();
rows.push([],['CURRENT BALANCES (LIVE SNAPSHOT, NOT MONTH-END)'],
 ['Current private coaching outstanding USD',currentBalances.privateOwed===null?'Not loaded':(currentBalances.privateOwed/100).toFixed(2)],
 ['Current cafeteria outstanding USD',currentBalances.cafeteriaOwed===null?'Not loaded':(currentBalances.cafeteriaOwed/100).toFixed(2)],
 ['Current prepaid private client credit USD',currentBalances.privateCredit===null?'Not loaded':(currentBalances.privateCredit/100).toFixed(2)],
 ['Current prepaid cafeteria credit USD',currentBalances.cafeteriaCredit===null?'Not loaded':(currentBalances.cafeteriaCredit/100).toFixed(2)]);
rows.push(['Total matchmaking revenue USD',(m.monthFinance.total/100).toFixed(2)],['Total commissions USD',(m.monthFinance.fee/100).toFixed(2)]);rows.push([],['Matchmaker','Games','Revenue USD','Commission Rule','Commission USD','Payment status']);for(const x of m.breakdown){const settlement=state.settlements.find(t=>(t.matchmaker_id||LEGACY_MATCHMAKER_ID)===(x.person.id||LEGACY_MATCHMAKER_ID)&&t.month_key===state.reportMonth+'-01');rows.push([x.person.name,x.games,(x.total/100).toFixed(2),'15 / 15 / 20 / 20 / 25 / 25 / 30 rolling seven-day streak',(x.fee/100).toFixed(2),settlement?.status||'unpaid']);}}
 rows.push([],['Member','Team category','Logged games','Free','Half-price',weekly?'Week used':daily?'Daily total':'Monthly total',...(weekly?['Remaining*']:[])]);
 for(const r of m.rows)rows.push([r.member.name,groupLabel(r.member.team_category),r.played,r.free,r.half,r.used,...(weekly?[r.member.unlimited?'Unlimited':r.remaining]:[])]);
 rows.push([],['Date','Team members','Match benefit','Non-team players']);
 for(const match of m.validMatches.sort((a,b)=>a.played_on.localeCompare(b.played_on))){
  rows.push([match.played_on,m.games.filter(g=>g.match_id===match.id).map(g=>state.members.find(x=>x.id===g.member_id)?.name||'Unknown').join('; '),match.benefit_type,match.non_team_count??'Not recorded']);
 }
 const [financeStart,financeEnd]=reportRange();rows.push(...clubInsights.csvRows(financeStart,financeEnd));
 downloadCSV(rows,`padel-on-${state.reportMode}-${period}${state.reportCompare?'-comparison':''}.csv`);
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
async function loadTrainingMonth({background=false}={}){
 if(!api.getSession()?.access_token||!state.staff)return;
 const target=state.trainingMonth,seq=++trainingLoadSequence;
 const start=target+'-01',end=addDays(shiftMonth(target,1)+'-01',-1);
 state.trainingLoading=true;state.trainingError=null;state.trainingLoadedMonth=null;
 if(state.tab==='training'&&!background)render();
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
   if(state.tab==='training'&&!background&&api.getSession()?.access_token)render();
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
<div class="training-actions"><div class="notice">${icon('info')} One free session per player per month. Normally two players train together; a solo exception needs a reason. </div>${btn(`${icon('download')} Export Monthly CSV`,'export-training','btn-light')}${btn('Print / Save PDF','print-training','btn-light')}</div>
<article class="panel training-panel"><div class="panel-head"><div><h2>Monthly player status</h2><p>${monthLabel(ym)} · ${d.used} of ${d.members.length} completed</p></div></div><div class="training-members">${memberRows||'<div class="panel-empty">No active Rising Stars members. Check team classifications.</div>'}</div></article>
<article class="panel"><div class="panel-head"><div><h2>Sessions with Coach Khalil</h2><p>${d.sessions.length} sessions · ${d.attendance.length} player attendances</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players</th><th>Time</th><th>Duration</th><th>Notes</th><th>Actions</th></tr></thead><tbody>${sessionRows||'<tr><td colspan="6" class="panel-empty">No sessions recorded this month.</td></tr>'}</tbody></table></div></article>
`}`;
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

function debtDailyPanel(){
 const day=state.debtDay,limit=today();
 const entries=getDebtDayEntries(state.debtEntries,day),totals=summarizeDebtDay(entries);
 const people=new Map(state.debtPeople.map(person=>[person.id,person]));
 const rows=entries.map(e=>{
  const person=people.get(e.person_id);
  const account=person&&!person.deleted_at
   ?btn('View account','debt-day-open-account','btn-light btn-xs',`data-id="${esc(person.id)}"`)
   :'<span class="tiny">Unavailable</span>';
  return `<tr><td><strong>${esc(person?.name||'Unknown account')}</strong></td><td>${e.entry_type==='charge'?tag('New debt','amber'):tag('Payment','green')}</td><td class="num"><strong class="${e.entry_type==='payment'?'debt-clear':'debt-owing'}">${e.entry_type==='payment'?'−':'+'}${amount(e.amount_cents)}</strong></td><td>${esc(e.notes||'—')}</td><td>${account}</td></tr>`;
 }).join('');
 const controls=`<div class="debt-daily-nav">
 <button type="button" class="btn btn-light btn-icon" data-action="debt-day-prev" aria-label="Previous day" title="Previous day">${icon('chevronLeft')}</button>
 <input type="date" id="debt-day-date" aria-label="Choose debt entry date" value="${day}" max="${limit}"/>
 <button type="button" class="btn btn-light btn-icon" data-action="debt-day-next" aria-label="Next day" title="Next day" ${day>=limit?'disabled':''}>${icon('chevronRight')}</button>
 ${btn('Today','debt-day-today','btn-light',day===limit?'disabled':'')}</div>`;
 return `<article class="panel debt-daily-panel">
 <div class="debt-daily-heading"><div><div class="eyebrow">Daily cafeteria activity</div><h2>Entries for ${niceDay(day,{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</h2><p>Review purchases and payments across all cafeteria accounts for the selected date.</p></div>${controls}</div>
 <div class="debt-daily-summary"><div><span>Entries</span><strong>${totals.count}</strong></div><div><span>New debt</span><strong>${amount(totals.charges)}</strong></div><div><span>Payments</span><strong>${amount(totals.payments)}</strong></div><div><span>Net debt change</span><strong>${totals.net>0?'+':totals.net<0?'−':''}${amount(Math.abs(totals.net))}</strong></div></div>
 <div class="data-table-wrap"><table class="data-table debt-daily-table"><thead><tr><th>Person</th><th>Type</th><th>Amount</th><th>Notes</th><th>Account</th></tr></thead><tbody>${rows||'<tr><td colspan="5" class="panel-empty">No cafeteria debt entries recorded for this date.</td></tr>'}</tbody></table></div>
 </article>`;
}

function debtPage(){
 const ready=state.debtLoaded&&!state.debtError;
 const all=state.debtPeople.filter(p=>!p.deleted_at),owed=all.reduce((sum,p)=>sum+Math.max(0,debtOutstanding(p.id)),0);
 const credit=all.reduce((sum,p)=>sum+Math.max(0,-debtOutstanding(p.id)),0);
 const open=all.filter(p=>debtOutstanding(p.id)>0);
 const paidTotal=state.debtEntries.filter(e=>e.entry_type==='payment'&&!e.voided_at).reduce((sum,e)=>sum+Number(e.amount_cents),0);
 const selected=all.find(p=>p.id===state.debtSelected)||all[0]||null;
 const header=heading('Cafeteria / running balances','Cafeteria Debts','Track unpaid purchases, partial payments, and prepaid cafeteria credit in one account.',btn(`${icon('plus')} New Person`,'debt-new-person','btn-primary',ready?'':'disabled')+(ready?btn(`${icon('download')} Export Statement`,'debt-export','btn-light',selected?'':'disabled'):''));
 if(!ready)return `${header}<article class="panel"><div class="empty-prompt"><strong>${state.debtLoading?'Loading cafeteria debt records…':state.debtError?'Unable to load cafeteria debts':'Loading cafeteria debts…'}</strong><span>${state.debtError?esc(state.debtError):'Track cafeteria purchases, payments, and outstanding balances.'}</span>${state.debtError?btn('Retry','debt-retry','btn-light'):''}</div></article>`;
 const metrics=`<section class="finance-grid four-up">${summaryCard('Outstanding debt',amount(owed),'Amount customers still owe','wallet',true)}${summaryCard('Prepaid credit',amount(credit),'Available for future purchases','gift')}${summaryCard('People owing',open.length,'Accounts with balance due','users')}${summaryCard('Payments received',amount(paidTotal),'All recorded payments','activity')}</section>`;
 const daily=debtDailyPanel();
 const displayed=all.filter(p=>(state.debtFilter!=='open'||debtOutstanding(p.id)>0)&&(state.debtFilter!=='settled'||debtOutstanding(p.id)===0)&&(state.debtFilter!=='credit'||debtOutstanding(p.id)<0)).filter(p=>!state.debtSearch||p.name.toLowerCase().includes(state.debtSearch.toLowerCase())).sort((a,b)=>debtOutstanding(b.id)-debtOutstanding(a.id)||a.name.localeCompare(b.name));
 const filters=`<div class="debt-filter-controls"><label class="search">${icon('search')}<input id="debt-search" autocomplete="off" placeholder="Find a person…" value="${esc(state.debtSearch)}"/></label><select id="debt-filter" class="select" aria-label="Debt status"><option value="all" ${state.debtFilter==='all'?'selected':''}>All people</option><option value="open" ${state.debtFilter==='open'?'selected':''}>Unpaid</option><option value="credit" ${state.debtFilter==='credit'?'selected':''}>Prepaid credit</option><option value="settled" ${state.debtFilter==='settled'?'selected':''}>Paid in full</option></select></div>`;
 const directory=`<article class="panel debt-directory"><div class="panel-head"><div><h2>Cafeteria accounts</h2><p>${open.length} unpaid · ${all.length} total</p></div></div>${filters}<div class="debt-people-list">${displayed.map(p=>{
 const remaining=debtOutstanding(p.id);
 return `<button class="debt-person-item ${selected?.id===p.id?'selected':''}" data-action="debt-select-person" data-id="${p.id}"><div><strong>${esc(p.name)}</strong>${p.active?'':tag('Inactive','amber')}</div><span class="debt-person-sub">${remaining>0?'Remaining to pay':remaining<0?'Prepaid credit':'Paid in full'}</span><b class="${remaining>0?'debt-owing':'debt-clear'}">${remaining<0?amount(-remaining)+' credit':amount(remaining)}</b></button>`;
 }).join('')||'<div class="panel-empty">No matching people.</div>'}</div></article>`;
 if(!selected)return `${header}${metrics}${daily}<div class="debt-layout">${directory}<article class="panel"><div class="empty-prompt"><strong>No cafeteria accounts yet</strong><span>Add someone along with their starting debt to begin.</span>${btn(`${icon('plus')} Add First Person`,'debt-new-person','btn-primary')}</div></article></div>`;
 const balance=debtOutstanding(selected.id);
 let accumulated=0;
 const history=debtPersonTransactions(selected.id).map(e=>{accumulated+=e.entry_type==='charge'?Number(e.amount_cents):-Number(e.amount_cents);return {e,running:accumulated}}).reverse();
 const details=`<article class="panel debt-details" id="debt-account-details">
 <div class="debt-person-header"><div><div class="eyebrow">Cafeteria account</div><h2>${esc(selected.name)}</h2><p>${esc(selected.notes||'Cafeteria purchases and payments')}${selected.active?'':' · Inactive'}</p></div><div class="debt-total ${balance<=0?'cleared':''}"><small>${balance>0?'Remaining debt':balance<0?'Prepaid credit':'Account status'}</small><strong>${balance>0?amount(balance):balance<0?amount(-balance):'Paid in full'}</strong></div></div>
 <div class="debt-person-actions">${btn(`${icon('plus')} Add Debt`,'debt-add-charge','btn-primary',selected.active?'':'disabled')}${btn('Record Payment / Add Credit','debt-add-payment','btn-light',selected.active?'':'disabled')}${btn('Edit Person','debt-edit-person','btn-light')}</div>
 <div class="debt-info-text">${balance>0?'Unpaid balance. Partial payments are accepted.':balance<0?'Prepaid credit will be used for future purchases.':'No outstanding balance.'}</div>
 <div class="panel-head"><div><h2>Purchases & payments</h2><p>${history.length} recorded transactions · latest first</p></div></div>
 <div class="data-table-wrap"><table class="data-table debt-transactions"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Remaining after</th><th>Notes</th><th>Correction</th></tr></thead><tbody>
 ${history.map(({e,running})=>`<tr><td>${niceDay(e.entry_date)}</td><td>${e.entry_type==='charge'?tag('New debt','amber'):tag('Payment','green')}</td><td><strong class="${e.entry_type==='payment'?'debt-clear':'debt-owing'}">${e.entry_type==='payment'?'−':'+'}${amount(e.amount_cents)}</strong></td><td>${debtBalanceLabel(running)}</td><td>${esc(e.notes||'—')}</td><td>${state.staff?.role==='admin'?btn('Void','debt-void','btn-danger btn-xs',`data-id="${e.id}"`):'<span class="tiny">Recorded</span>'}</td></tr>`).join('')||'<tr><td colspan="6" class="panel-empty">No cafeteria transactions yet.</td></tr>'}
 </tbody></table></div></article>`;
 return `${header}${metrics}${daily}<div class="debt-layout">${directory}${details}</div>`;
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
function privateScheduledTrainingPanel(client){
 const bookings=state.privateBookings.filter(b=>
  b.private_client_id===client.id&&b.status!=='cancelled')
  .sort((a,b)=>a.business_date.localeCompare(b.business_date)||
    String(a.booking_start_time).localeCompare(String(b.booking_start_time)));
 if(!bookings.length)return '';
 const current=today();
 const options=value=>'<option value="">Choose coach</option>'+state.privateCoaches.filter(c=>c.active)
   .map(c=>'<option value="'+esc(c.id)+'" '+(c.id===value?'selected':'')+'>'+
    esc(c.name+' · '+c.category)+'</option>').join('');
 const rows=bookings.map(b=>{
  const entry=b.private_session_entry_id?
   state.privateEntries.find(e=>e.id===b.private_session_entry_id&&!e.voided_at):null;
  const status=entry?'Recorded in private ledger':b.status==='tentative'?'Tentative':
   b.business_date>current?'Upcoming':'Awaiting completion';
  const due=!entry&&b.status==='confirmed'&&b.business_date<=current&&!b.private_session_entry_id;
  return '<div class="private-training-item"><div><strong>'+esc(niceDay(b.business_date))+
   ' · '+esc(String(b.booking_start_time||'').slice(0,5))+'–'+esc(String(b.booking_end_time||'').slice(0,5))+
   '</strong><small>'+esc((b.sport||'padel')+' · '+b.court_number)+
   ' · '+esc(status)+(b.notes?' · '+esc(b.notes):'')+'</small></div>'+
   '<div class="private-training-fee">'+amount(b.private_session_fee_cents||0)+
   '<small>Session fee · not a court receipt</small></div>'+
   '<div class="private-training-actions">'+(due?
    '<select aria-label="Coach for '+esc(client.name)+' training" data-private-training-coach="'+esc(b.id)+'">'+
      options(b.private_coach_id)+'</select>'+
    btn('Record completed session','private-complete-training','btn-primary btn-xs', 'data-id="'+esc(b.id)+'"'):
    '<small>'+esc(status)+'</small>')+'</div></div>';
 }).join('');
 return '<section class="private-scheduled-bookings"><div class="private-scheduled-head"><div>'+
  '<h3>Private training reservations</h3><p>'+bookings.length+
  ' bookings · only recorded sessions affect the account balance</p></div></div>'+
  '<div class="private-training-list">'+rows+'</div></section>';
}
function upcomingPrivateTrainingsPanel(){
 const upcoming=state.privateBookings.filter(b=>b.status!=='cancelled'&&
  !b.private_session_entry_id&&b.business_date>=today())
  .sort((a,b)=>a.business_date.localeCompare(b.business_date)||
   String(a.booking_start_time).localeCompare(String(b.booking_start_time)));
 if(!upcoming.length)return '';
 const rows=upcoming.slice(0,12).map(b=>{
  const client=state.privateClients.find(c=>c.id===b.private_client_id&&!c.deleted_at);
  return '<div class="private-training-item"><div><strong>'+esc(client?.name||'Private client')+
    '</strong><small>'+esc(niceDay(b.business_date))+' · '+
    esc(String(b.booking_start_time||'').slice(0,5))+' · '+esc((b.sport||'padel')+' '+b.court_number)+'</small></div>'+
    '<div class="private-training-fee">'+amount(b.private_session_fee_cents||0)+'</div>'+
    '<div class="private-training-actions">'+(client?
     btn('View client','private-open-from-day','btn-light btn-xs','data-id="'+esc(client.id)+'"'):
     '<small>Client unavailable</small>')+'</div></div>';
 }).join('');
 return '<section class="private-scheduled-bookings"><div class="private-scheduled-head"><div>'+
  '<h3>Upcoming private training</h3><p>'+upcoming.length+
  ' scheduled · charges are recorded only after completion</p></div></div>'+
  '<div class="private-training-list">'+rows+'</div></section>';
}
function privateClientsPage(){
 const ready=state.privateLoaded&&!state.privateError;
 const rows=state.privateClients.filter(c=>!c.deleted_at&&(state.privateShowArchived||c.active)&&(state.privateListFilter!=='owing'||privateClientBalance(c)<0)&&(!state.privateSearch||[c.name,c.client_code,c.contact].some(v=>String(v||'').toLowerCase().includes(state.privateSearch.toLowerCase())))).sort((a,b)=>comparePrivateClients(a,b));
 const selectedId=visiblePrivateClientSelection(rows,state.privateSelected);
 if(selectedId!==state.privateSelected){state.privateSelected=selectedId;state.privateNotesOpen=false;}
 const selected=rows.find(c=>c.id===selectedId)||null;
 const active=state.privateClients.filter(c=>c.active&&!c.deleted_at),stats=active.map(c=>({client:c,balance:privateClientBalance(c)}));
 const credit=stats.filter(x=>x.balance>0).reduce((sum,x)=>sum+x.balance,0);
 const owed=stats.filter(x=>x.balance<0).reduce((sum,x)=>sum-x.balance,0);
 const activeSessions=state.privateEntries.filter(r=>r.entry_type==='session'&&!r.voided_at);
 const controls=btn(`${icon('plus')} Add Client`,'private-add-client','btn-primary')+(ready?btn(`${icon('download')} Export Client CSV`,'private-export','btn-light',!selected?'disabled':''):'');
 const headline=heading('Client coaching','Private Sessions','Track client IDs, coaching sessions, payments, prepaid credit, and outstanding balances.',controls);
 if(!ready)return `${headline}<div class="panel"><div class="panel-body"><div class="empty-prompt"><strong>${state.privateLoading?'Loading private sessions…':state.privateError?'Private Sessions unavailable':'Loading client records…'}</strong><span>${state.privateError?esc(state.privateError):'Client and coach records are visible only to authorized staff.'}</span>${state.privateError?btn('Try again','private-retry','btn-light'):''}</div></div></div>`;
 const upcomingTrainingPanel=upcomingPrivateTrainingsPanel();
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
  return `${headline}${intro}${upcomingTrainingPanel}${privateDailySessionsPanel()}<div class="private-layout">${panel}<article class="panel"><div class="empty-prompt"><strong>${state.privateClients.length?'No clients match these filters':'No client records yet'}</strong><span>${state.privateClients.length?'Try All clients or clear the search to see the full list.':'Add a client to start tracking private coaching.'}</span>${state.privateClients.length?btn('Show All Clients','private-reset-filters','btn-light'):btn(`${icon('plus')} Add First Client`,'private-add-client','btn-primary')}</div></article></div>`;
 }
 const balance=privateClientBalance(selected),entries=privateClientEntries(selected.id),sessions=entries.filter(e=>e.entry_type==='session');
 let running=Number(selected.opening_balance_cents||0);
 const history=entries.map(e=>{running+=privateEntryDelta(e);return {entry:e,remaining:running}}).reverse();
 const details=`<div class="private-detail">
 <div class="private-detail-header"><div><div class="eyebrow">${esc(selected.client_code||'ID NOT ASSIGNED')}</div><h2>${esc(selected.name)}</h2><details class="private-client-notes" data-private-client-notes ${state.privateNotesOpen?'open':''}><summary>Internal notes</summary><p>${selected.notes?esc(selected.notes):'No internal notes saved.'}</p></details><p>${selected.contact?esc(selected.contact):'Client account'} · ${sessions.length} session${sessions.length===1?'':'s'}</p></div><div class="private-balance-box ${balance<0?'negative':''}"><small>${balance<0?'Outstanding':'Account credit'}</small><strong>${amount(Math.abs(balance))}</strong></div></div>
 <div class="private-client-actions">${btn(`${icon('plus')} Record Session`,'private-record-session','btn-primary',selected.active?'':'disabled')}${btn('Add Balance','private-add-balance','btn-light',selected.active?'':'disabled')}${btn('Edit Client','private-edit-client','btn-light')}${state.staff?.role==='admin'?btn('Close Balance','private-close-balance','btn-danger',balance>0?'':`disabled title="This account has no credit to return"`):''}</div>
 <div class="private-account-note">Balance = opening balance + top-ups + paid amounts − session fees. Scheduled private trainings only affect balances after a completed session is recorded.</div>
 ${privateScheduledTrainingPanel(selected)}
 <div class="panel-head private-ledger-head"><div><h2>Session & payment history</h2><p>${entries.length} session and payment entries</p></div></div>
 <div class="data-table-wrap"><table class="data-table private-ledger-table"><thead><tr><th>Date</th><th>Type / coach</th><th>Charge</th><th>Paid / top-up</th><th>Balance</th><th>Action</th></tr></thead><tbody>
 ${history.length?history.map(({entry:e,remaining:v})=>`<tr><td>${niceDay(e.entry_date)}</td><td><strong>${e.entry_type==='session'?'Private session':e.entry_type==='deposit'?'Balance top-up':'Balance closed'}</strong><br/><small>${e.entry_type==='session'?esc(privateCoachName(e.coach_id)):esc(e.notes||(e.entry_type==='deposit'?'Deposit':'Credit returned to client'))}</small>${e.entry_type==='session'&&e.notes?`<br/><small>${esc(e.notes)}</small>`:''}</td><td>${e.entry_type==='session'||e.entry_type==='balance_close'?amount(e.session_fee_cents):'—'}</td><td>${e.entry_type==='deposit'?amount(e.deposit_cents):e.entry_type==='session'?amount(e.paid_cents):'—'}</td><td class="${v<0?'private-negative':''}">${privateBalanceLabel(v)}</td><td>${state.staff?.role==='admin'?btn('Void','private-void-entry','btn-danger btn-xs',`data-id="${e.id}"`):'<span class="tiny">Recorded</span>'}</td></tr>`).join(''):'<tr><td colspan="6" class="panel-empty">No sessions or payments recorded yet.</td></tr>'}
 </tbody></table></div>
 </div>`;
 return `${headline}${intro}${upcomingTrainingPanel}${privateDailySessionsPanel()}<div class="private-layout">${panel}<article class="panel">${details}</article></div>`;
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
 const streak=personStreak(person),currentRate=streak.currentCommissionBps/100;
 const tabs=state.matchmakers.filter(p=>p.active||p.id===person.id).map(p=>`<button type="button" class="matchmaker-tab ${p.id===person.id?'selected':''}" data-action="select-matchmaker" data-id="${esc(p.id)}" aria-pressed="${p.id===person.id}">${esc(p.name)}</button>`).join('');
 const incomplete=person.name.startsWith('Legacy matchmaker')?`<div class="notice warn">${icon('alert')} Ask an administrator to update this matchmaker’s name.</div>`:'';
 return `${heading('Matchmaking / commissions','Revenue & Commission',`Monthly revenue and commissions for ${esc(person.name)}.`,btn(`${icon('plus')} Add Matchmaking Game`,'add-nazih','btn-primary')+btn(`${icon('download')} Export CSV`,'export-finance','btn-light'))}
 <div class="matchmaker-switch"><div class="matchmaker-switch-label">Select matchmaker</div><div class="matchmaker-tabs" role="group" aria-label="Choose matchmaking person">${tabs}</div></div>
 ${incomplete}
 <div class="toolbar"><div class="money-note">Revenue collected from other players · figures in USD · ${esc(person.name)}</div><div class="month-control"><button data-action="prev-month" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(state.month)}</strong><button data-action="next-month" ${state.month>=monthKey(today())?'disabled':''} title="Next month" aria-label="Next month">${icon('chevronRight')}</button></div></div>
 <section class="finance-grid four-up matchmaking-streak-grid">${summaryCard('Revenue collected',amount(f.total),esc(person.name)+' · this month','wallet',true)}${summaryCard('Commission this month',amount(f.fee),'Sum of each game’s daily streak rate','coins')}${summaryCard('Current streak',streak.currentStreak+' day'+(streak.currentStreak===1?'':'s'),streak.continuesToday?(streak.lastActiveDay===today()?'Active today':'Can continue today'):'Starts again on next game','activity')}${summaryCard('Current commission',currentRate+'%','Rate applicable today · per matchmaker','spark')}</section>
 <div class="settlement"><div><strong>Monthly settlement · ${esc(person.name)}</strong><small>${monthLabel(state.month)} · ${paid?`Marked paid on ${niceDay(sel.paid_on||sel.month_key)}`:'Not marked as paid'}${paid&&diff!==0?' · ⚠ Paid amount differs from current commission':''}</small></div><div class="inline-info">${tag(paid?'Paid':'Unpaid',paid?'green':'amber')}${state.staff?.role==='admin'?btn(`${icon('edit')} ${paid?'Edit Settlement':'Record Payment'}`,'settlement','btn-light'):''}</div></div>
 <article class="panel"><div class="panel-head"><div><h2>Matchmaking history</h2><p>${esc(person.name)} · ${monthLabel(state.month)} · ${f.rows.length} records</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players / Notes</th><th>Revenue</th><th>Streak day</th><th>Rate</th><th>Commission</th><th>Actions</th></tr></thead><tbody>${f.rows.length?f.rows.map(row=>`<tr><td>${niceDay(row.played_on)}</td><td><strong>${esc(row.players||'Matchmaking game')}</strong><br/><small>${esc(row.notes||'—')}</small></td><td><strong class="num">${amount(row.amount_cents)}</strong></td><td class="num">Day ${row.streakDay}</td><td class="num">${row.commissionBps/100}%</td><td class="num">${amount(row.commission_cents)}</td><td>${btn(icon('edit'),'edit-nazih','btn-light btn-icon btn-xs',`data-id="${row.id}" title="Edit"`)} ${btn(icon('trash'),'delete-nazih','btn-danger btn-icon btn-xs',`data-id="${row.id}" title="Remove"`)}</td></tr>`).join(''):'<tr><td colspan="7"><div class="empty-prompt"><strong>No matchmaking records</strong><span>Add a game for this person to track the monthly revenue.</span></div></td></tr>'}</tbody></table></div></article>
 <div class="archive-note">Rolling seven-day schedule: 15%, 15%, 20%, 20%, 25%, 25%, 30%. Each matchmaker’s first active day starts Day 1, and the cycle restarts after Day 7. Multiple matches on one day share one rate. A missed day resets the next active day to 15%.</div>`;
}
function legacyFinancePage(){const person=selectedMatchmaker(),f=getMatchmakingFinance(state.finance,state.month),streak=getMatchmakingCurrentStreak(state.finance,today()),sel=state.settlements.find(s=>s.month_key===state.month+'-01');const paid=sel?.status==='paid';const diff=Number(sel?.amount_paid_cents||0)-f.fee;return `${heading('Matchmaking / Nazih Sonbol','Revenue & Commission','Record and review matchmaking revenue by month.',btn(`${icon('plus')} Add Matchmaking Game`,'add-nazih','btn-primary'))}
<div class="toolbar"><div class="money-note">Revenue collected from other players · all figures USD</div><div class="month-control"><button data-action="prev-month" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(state.month)}</strong><button data-action="next-month" ${state.month>=monthKey(today())?'disabled':''} title="Next month" aria-label="Next month">${icon('chevronRight')}</button></div></div>
<section class="finance-grid four-up matchmaking-streak-grid">${summaryCard('Revenue collected',amount(f.total),'From other players','wallet',true)}${summaryCard('Commission this month',amount(f.fee),'Daily streak rates','coins')}${summaryCard('Current streak',streak.currentStreak+' day'+(streak.currentStreak===1?'':'s'),'Per active day','activity')}${summaryCard('Current commission',streak.currentCommissionBps/100+'%','Rate applicable today','spark')}</section>
<div class="settlement"><div><strong>Monthly settlement · ${monthLabel(state.month)}</strong><small>${paid?`Marked paid on ${niceDay(sel.paid_on||sel.month_key)}`:'Not marked as paid'}${paid&&diff!==0?' · ⚠ Paid amount differs from current commission':''}</small></div><div class="inline-info">${tag(paid?'Paid':'Unpaid',paid?'green':'amber')}${state.staff?.role==='admin'?btn(`${icon('edit')} ${paid?'Edit Settlement':'Record Payment'}`,'settlement','btn-light'):''}</div></div>
<article class="panel"><div class="panel-head"><div><h2>Matchmaking history</h2><p>${monthLabel(state.month)} · ${f.rows.length} records</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players / Notes</th><th>Revenue collected</th><th>Game's ${rate}% share*</th><th>Actions</th></tr></thead><tbody>${f.rows.length?f.rows.map(r=>`<tr><td>${niceDay(r.played_on)}</td><td><strong>${esc(r.players||'Matchmaking game')}</strong><br/><small>${esc(r.notes||'—')}</small></td><td><strong class="num">${amount(r.amount_cents)}</strong></td><td class="num">${amount(matchmakingFee(r.amount_cents,person))}</td><td>${btn(icon('edit'),'edit-nazih','btn-light btn-icon btn-xs',`data-id="${r.id}" title="Edit"`)} ${btn(icon('trash'),'delete-nazih','btn-danger btn-icon btn-xs',`data-id="${r.id}" title="Delete"`)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty-prompt">${icon('wallet')}<strong>No matchmaking records</strong><span>Add a game to start tracking revenue for this month.</span></div></td></tr>`}</tbody></table></div></article><div class="archive-note">* Monthly commission is based on total revenue and rounded once.</div>`}
function activityPage(){const recent=recentActivity(10000,state.activitySearch),showReference=state.staff?.role==='admin';return `${heading('History','Game Activity','Review recent games and benefit usage.',btn(`${icon('refresh')} Refresh`,'refresh','btn-light'))}<div class="toolbar"><label class="search">${icon('search')}<input id="activity-search" placeholder="Search player…" value="${esc(state.activitySearch)}"/></label><span class="tiny">${recent.length} entries</span></div><article class="panel"><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Player(s)</th><th>Benefit type</th>${showReference?'<th>Reference</th>':''}<th>Action</th></tr></thead><tbody>${recent.length?recent.map(r=>`<tr><td>${niceDay(r.date)}</td><td><strong>${esc(r.names)}</strong></td><td>${tag(r.type,r.type==='Paid Game'?'gray':'green')}</td>${showReference?`<td><small>${esc(r.ref.slice(0,8))}…</small></td>`:''}<td>${r.kind==='team'?btn('Void match','void-match','btn-danger btn-xs',`data-id="${r.key}"`):'<span class="tiny">Recorded</span>'}</td></tr>`).join(''):`<tr><td colspan="${showReference?5:4}" class="panel-empty">No activity found.</td></tr>`}</tbody></table></div></article>`}
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
 const privateStatus=!privReady?'Client details are unavailable. Refresh and try again.':priv?(priv.deleted_at?'Removed — history retained':privZero?'Balance settled — removal permitted':'Cannot remove: customer credit or debt is not zero.'):'Select the client to manage.';
 const cafeStatus=!cafeReady?'Account details are unavailable. Refresh and try again.':cafe?(cafe.deleted_at?'Removed — history retained':cafeZero?'Balance settled — removal permitted':'Cannot remove: customer debt or prepaid credit is not zero.'):'Select the person to manage.';
 const privateCard=`<article class="panel settings-box admin-account-box"><h3>Private Sessions accounts</h3><p>Remove or restore an account. Removing a client hides their account. Their sessions and payments remain available if the account is restored.</p>
 <label class="form-field"><span>Client</span><select id="settings-private-account" class="form-input" ${!privReady?'disabled':''}>${privateOptions}</select></label>
 <small class="admin-account-status">${esc(privateStatus)}</small><div class="admin-account-buttons">
 ${btn('Remove Client','settings-private-remove','btn-danger',!priv||priv.deleted_at||!privZero?'disabled':'')}
 ${btn('Restore Client','settings-private-restore','btn-light',!priv||!priv.deleted_at?'disabled':'')}</div></article>`;
 const cafeteriaCard=`<article class="panel settings-box admin-account-box"><h3>Cafeteria accounts</h3><p>Remove or restore a cafeteria account without losing previous purchases and payments.</p>
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
 return '<article class="panel settings-box"><h3>Matchmaking commissions</h3><p>Commission is automatic and tracked separately for every matchmaker by consecutive active day.</p><div class="notice">Rolling seven-day schedule: <strong>15% · 15% · 20% · 20% · 25% · 25% · 30%</strong><br/>Each matchmaker’s first active day starts Day 1, and the cycle restarts after Day 7. Multiple matches on the same day do not advance the streak. A missed day resets the next active day to 15%.</div></article>';
}
function settingsPage(){
 const admin=state.staff?.role==='admin';
 const listsEnabled=canUseOrderLists();
 const adminTools=admin?`<article class="panel settings-box"><h3>Team roster</h3><p>Add or update team members and their weekly allowances.</p>${btn(`${icon('plus')} Add Member`,'new-member','btn-primary',)}${btn(`${icon('edit')} Edit Member`,'choose-member-edit','btn-light',)}</article><article class="panel settings-box"><h3>Manual weekly reset</h3><p>Reset weekly benefit counters. Previous games are unaffected.</p>${btn('Reset One Member','reset-one','btn-light',)}${btn('Reset All Members','reset-all','btn-danger',)}</article>`:'';
 const orderListsCard=listsEnabled?'<article class="panel settings-box order-lists-box"><h3>Order Lists</h3><div class="order-list-options"><section class="order-list-option"><h4>Order Counter</h4><p>Count stock items, prepare a complete restocking message, and copy it for WhatsApp.</p>'+btn(icon('list')+' Open Order Counter','open-order-counter','btn-primary')+'</section><section class="order-list-option"><h4>Reem’s Items List</h4><p>Prepare Reem’s delivery order separately from the original supplier list. Copy the complete message for WhatsApp.</p>'+btn(icon('list')+' Open Reem’s Items List','open-reem-items','btn-light')+'</section></div></article>':'';
 return `${heading('Club tools','Settings',admin?'Manage club settings and member accounts.':'Ordering tools.',btn(`${icon('logout')} Sign out`,'signout','btn-light'))}${admin?`<div class="settings-grid">${adminTools}</div>`:''}${admin||listsEnabled?`<div class="settings-followup-grid ${admin?'':'single-column'}">${admin?'<div class="settings-followup-column">'+matchmakerCommissionSettings()+adminAccountManagementCards('private')+'</div>':''}<div class="settings-followup-column">${orderListsCard}${admin?adminAccountManagementCards('cafeteria'):''}</div></div>`:''}`;
}
function renderPage(){switch(state.tab){case'dashboard':return dashboard();case'court-timetable':return heading('Facility schedule','Court Timetable','Reservations, blocked slots and private training — 09:00 to 01:00 Beirut business day.')+'<div class="ck-timetable-page">'+cafeteriaFinances.schedulerPage()+'</div>';case'cafeteria-finances':return cafeteriaFinances.page();case'cafeteria-payments':return state.staff?.role==='admin'?cafeteriaPayments.page()+cafeteriaTodo.page():dashboard();case'debts':return debtPage();case'consignment':return consignmentInventory.page();case'team':return teamPage();case'other':return otherPage();case'finance':return financePage();case'tournament':return tournamentManagement.page();case'training':return trainingPage();case'private-clients':return privateClientsPage();case'activity':return activityPage();case'reports':return reportsPage();case'settings':return settingsPage();case'order-counter':return canUseOrderLists()?orderCounter.orderCounterPage(state.staff?.id||state.staff?.email):settingsPage();case'reem-items':return canUseOrderLists()?reemItems.reemItemsPage(state.staff?.id||state.staff?.email):settingsPage();default:return dashboard()}}
let lastRenderedMarkup=null,lastRenderedTab=null;
// Mobile card conversion is presentation-only. Preserve every DOM node, form and action.
function enhanceResponsiveTables(root){
 const selectors='.private-daily-table,.debt-daily-table,.debt-transactions,.private-ledger-table,.report-comparison-table,.po-overview-sessions';
 for(const table of root.querySelectorAll(selectors)){
  if(!table.classList.contains('data-table'))continue;
  table.classList.add('po-mobile-card-table');
  const labels=[...table.querySelectorAll('thead tr:first-child th')].map(th=>th.textContent.trim());
  for(const row of table.querySelectorAll('tbody tr')){
   const cells=[...row.children].filter(node=>node.tagName==='TD');
   if(cells.length===1&&cells[0].colSpan>1){cells[0].classList.add('po-mobile-empty-cell');continue;}
   for(const [index,cell] of cells.entries()){
    if(!cell.dataset.label)cell.dataset.label=labels[index]||'Details';
    if(cell.querySelector(':scope > .po-mobile-cell-value'))continue;
    const value=document.createElement('span');
    value.className='po-mobile-cell-value';
    while(cell.firstChild)value.appendChild(cell.firstChild);
    cell.append(value);
   }
  }
 }
}
function render(){
 if(state.staff&&!canAccessTab(state.tab,state.staff.role))state.tab='dashboard';
 if(routeInitialized&&state.staff){syncBrowserRoute(state.tab);document.title='PADEL ON · '+titleFor();}
 // The scheduler patches booking nodes without remounting the static
 // 09:00–01:00 grid, date, sport switch, or horizontal scroll state.
 if(autoRefreshRunning&&lastRenderedTab===state.tab&&
    ((state.tab==='cafeteria-finances'&&cafeteriaFinances.isTimetableMounted())||
     (state.tab==='court-timetable'&&cafeteriaFinances.schedulerMounted())))return;
 const html=shell();
 // Ignore identical poll results rather than replacing the whole DOM.
 if(autoRefreshRunning&&lastRenderedTab===state.tab&&html===lastRenderedMarkup)return;
 const searchFocus=state.globalSearchOpen&&document.activeElement?.id==='global-search-input';
 const cursor=searchFocus?document.activeElement.selectionStart:null;
 const scroll=lastRenderedTab===state.tab?
  scrollPreservation.captureScrollPosition(app,window):null;
 app.innerHTML=html;
 enhanceResponsiveTables(app);
 document.body.classList.toggle('mobile-menu-open',mobileMenuOpen);
 lastRenderedMarkup=html;lastRenderedTab=state.tab;
 if(scroll)scrollPreservation.restoreScrollPosition(app,window,scroll);
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
  ${edit?'':'<div class="notice">Enter a starting debt now, or leave $0.00 and add purchases later.</div>'}
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
 const content=`<div class="notice warn">Voiding this entry updates the balance. The original entry will still appear in history as voided.</div>
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
  const subtitle=edit?'Update client information.':'Client IDs are optional if no ID has been assigned yet.';
  const content=`<form id="modal-form" data-save="save-private-client">
   ${field('name','Client name',client?.name||'','text','required maxlength="120"')}
   ${field('arabic_name','Arabic spelling for daily PDF (optional)',client?.arabic_name||'','text',`maxlength="120" dir="rtl" placeholder="${esc(client?.name?arabicDailyPdf.arabicClientName(client.name):'الاسم بالعربية')}"`)}
   <small class="form-hint">Optional: enter the Arabic spelling to use on exported PDFs.</small>
   ${field('client_code','Existing client ID (optional)',client?.client_code||'','text','maxlength="40" placeholder="Example: C1024" aria-describedby="private-id-feedback"')}<div class="private-id-feedback" id="private-id-feedback" aria-live="polite">IDs must be unique across all clients.</div>
   ${field('contact','Contact information (optional)',client?.contact||'','text','maxlength="120"')}
   ${edit?selectField('active','Account status',[['true','Active'],['false','Inactive']],client.active?'true':'false'):''}
   ${textareaField('notes','Internal notes (optional)',client?.notes||'')}
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
 if(type==='private-close-balance'){
  const credit=client?privateClientBalance(client):0;
  if(!client||credit<=0)throw Error('This client has no credit to close.');
  const content=`<div class="notice warn">This will return ${amount(credit)} to the client and set the account balance to zero. It will be recorded as a negative payment and shown under شراء من الصندوق in the Arabic daily PDF.</div>
  <form id="modal-form" data-save="close-private-balance">
  ${field('entry_date','Closing date',today(),'date',`required max="${today()}"`)}
  ${textareaField('notes','Closing note (optional)','Account balance closed')}
  ${formActions('Close Balance',true)}</form>`;
  return {title:'Close Client Balance',subtitle:(client.name||'')+' · '+amount(credit),content,danger:true};
 }
 const entry=state.privateEntries.find(e=>e.id===m.id);
 const content=`<div class="notice warn">Voiding this entry removes its effect on the client balance. The original entry will stay in history.</div>
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
 case 'private-client':case 'private-session':case 'private-deposit':case 'private-close-balance':case 'private-void':{
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
 case 'other-game': {const p=state.special.find(x=>x.id===m.id);title='Record Special Benefit';subtitle=p?.name||'';const weekly=p?.status==='one_free_per_week'?getWeeklyFreeGameStatus(p,today(),state.specialGames):null;content=`<form id="modal-form" data-save="save-other">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}${p?.status==='alternating_free_paid'? `<div class="form-field"><span>Game type — automatically determined</span><input type="hidden" name="game_type" value="${alternatingBenefitNext(p)}"/><div class="notice">${alternatingBenefitNext(p)==='free'?'This game is FREE. After saving, the next game will be PAID.':'This game is PAID. After saving, the next game will be FREE.'} </div></div>`:p?.status==='one_free_per_week'? `<div class="form-field"><span>Game type</span><div class="radio-tiles"><label><input type="radio" name="game_type" value="paid" checked/> Paid game</label><label><input id="other-free-game" type="radio" name="game_type" value="free" ${weekly?.available?'':'disabled'}/> Free game</label></div><div id="other-weekly-benefit-preview" class="notice">${weekly?.available?`One free game is available for ${weekLabel(today())}.`:`The free game for ${weekLabel(today())} has already been used. Choose Paid game.`}</div></div>`: `<div class="form-field"><span>Game type</span><div class="radio-tiles"><label><input type="radio" name="game_type" value="paid" ${p?.status!=='next_free'?'checked':''}/> Paid game</label><label><input type="radio" name="game_type" value="free" ${p?.status==='next_free'?'checked':''}/> Free game</label></div></div>`}${textareaField('notes','Notes (optional)')}${formActions('Record Game')}</form>`;break;}
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
  content=`<div class="notice warn">Voiding this session restores the players’ monthly training eligibility.</div><form id="modal-form" data-save="void-training">${textareaField('reason','Reason for correction')}${formActions('Void Training',true)}</form>`;
  break;
 }
 case 'edit-member': {const p=state.members.find(x=>x.id===m.id);title=p?'Edit Team Member':'Add Team Member';subtitle='Only administrators can modify the team roster.';content=`<form id="modal-form" data-save="save-member">${field('name','Full name',p?.name||'','text','required maxlength="100" minlength="2"')}${selectField('team_category','Team category',TEAM_GROUPS,p?.team_category||'team')}<div class="form-cols">${field('weekly_allowance','Weekly allowance',p?.weekly_allowance??0,'number','min="0" max="30" required')}${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}</div>${selectField('unlimited','Free game rule',[['false','Weekly allowance'],['true','Unlimited free games']],p?.unlimited?'true':'false')}${formActions(p?'Save Member':'Create Member')}</form>`;break;}
 case 'choose-member':{title='Edit Team Member';subtitle='Select a person to update.';content=`<form id="modal-form" data-save="choose-member">${selectField('member_id','Team member',state.members.map(x=>[x.id,x.name]),state.members[0]?.id)}${formActions('Continue')}</form>`;break;}
 case 'edit-other':{const p=state.special.find(x=>x.id===m.id);title=p?'Edit Other Benefit':'Add Other Benefit';subtitle='Choose the rule that determines free-game eligibility.';content=`<form id="modal-form" data-save="save-other-player">${field('name','Player name',p?.name||'','text','required maxlength="100"')}${field('current_counter','Game counter (alternating: 0 = next free; 1 = next paid)',p?.current_counter??0,'number','required min="0" max="1000000"')}${selectField('status','Eligibility status',[['needs_confirmation','Needs Confirmation'],['next_free','Next Game Free'],['counting','Counting Games'],['alternating_free_paid','Alternating: Free Game, Paid Game'],['one_free_per_week','1 Free Game per Week'],['rule_not_configured','Rule Not Configured']],p?.status||'needs_confirmation')}${field('threshold','Threshold (counting policies only)',p?.threshold??'','number','min="1" max="100"')}<div class="notice">For “1 Free Game per Week”, the selected game date determines its Monday–Sunday week. Only one free game is allowed in that week; paid games remain unrestricted. The allowance resets automatically each Monday.</div>${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}${formActions('Save Player')}</form>`;break;}
 case 'settlement':{const person=selectedMatchmaker();const s=state.settlements.find(x=>x.month_key===state.month+'-01'&&(!person||x.matchmaker_id===person.id));title='Monthly Settlement';subtitle=(person?person.name+' · ':'')+monthLabel(state.month);const suggested=Number(s?.amount_paid_cents??financials().fee)/100;content=`<form id="modal-form" data-save="save-settlement">${selectField('status','Payment status',[['unpaid','Unpaid'],['paid','Paid']],s?.status||'unpaid')}<div class="form-cols">${field('amount_paid','Amount paid (USD)',suggested.toFixed(2),'number','required min="0" step="0.01"')}${field('paid_on','Payment date',s?.paid_on||today(),'date')}</div>${textareaField('notes','Notes',s?.notes||'')}${formActions('Save Settlement')}</form>`;break;}
 case 'reset':{title=m.id?'Reset Member Counter':'Reset All Counters';subtitle='Administrator authorization required.';danger=true;content=`<div class="notice warn">${icon('alert')} Reset this week's benefit counters.</div><form id="modal-form" data-save="submit-reset">${field('code','Management reset code','','password','required autocomplete="off"')}${formActions('Authorize Reset',true)}</form>`;break;}
 case 'confirm-delete':{title=m.entity==='finance'?'Remove Financial Record':'Void Team Match';subtitle='This change will be recorded in the history.';danger=true;content=`<p class="hint">${m.entity==='finance'?'The record will stop contributing to monthly revenue.':'The game will stop counting against team members’ weekly allowances.'} Are you sure?</p><form id="modal-form" data-save="confirm-delete">${formActions('Confirm',true)}</form>`;break;}
 case 'member-history':{const p=state.members.find(x=>x.id===m.id);const d=state.historyWeek;title=p?.name||'History';subtitle=`Week: ${weekLabel(d)}`;const gamesForWeek=state.historyWeek!==weekStart(today())?state.historyData?.games||[]:state.games;const logs=gamesForWeek.filter(x=>x.member_id===m.id&&!x.voided_at&&x.played_on>=d&&x.played_on<=addDays(d,6)).sort((a,b)=>b.played_on.localeCompare(a.played_on));const init=state.balances.find(x=>x.member_id===m.id&&x.week_start===d);content=`<div class="notice">${icon('info')} ${status(p,d).used} game(s) counted this week${init?.used?` · includes ${init.used} starting game(s)`:''}.</div>${logs.length?logs.map(g=>`<div class="activity-line"><div class="activity-avatar">${icon('calendar')}</div><div class="activity-copy"><strong>${niceDay(g.played_on)}</strong><small>${g.benefit_type==='free'?'Free game':'Half-price game'}</small></div></div>`).join(''):'<div class="panel-empty">No game entries during this week.</div>'}<div class="modal-actions">${btn('Close','close-modal','btn-light')}</div>`;break;}
 }
 return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body">${content}</div></div></div>`
}
function formActions(text,danger=false){return `<div class="modal-actions">${btn('Cancel','close-modal','btn-light')}<button type="submit" class="btn ${danger?'btn-danger':'btn-primary'}" id="save-button">${esc(text)}</button></div>`}
function openModal(type,id=null,more={}){state.modal={type,id,...(['team','quick-team','other-game','finance','training','private-session','private-deposit','private-close-balance','debt-person','debt-charge','debt-payment'].includes(type)?{requestId:crypto.randomUUID()}:{}),...(['finance','settlement'].includes(type)?{personId:selectedMatchmaker()?.id||null}:{}),...more};render();setTimeout(()=>{document.querySelector('#modal-root .form-input')?.focus();updateQuickPreview();validatePrivateClientIdInput();},0)}
function closeModal(){state.modal=null;document.getElementById('modal-root').innerHTML=''}
function renderAuth(message=''){
 mobileMenuOpen=false;document.body.classList.remove('mobile-menu-open');
 lastRenderedMarkup=null;lastRenderedTab=null;
 app.innerHTML=`<main class="auth-wrap"><section class="auth-lead"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/><h1>The team.<br/><em>All in one place.</em></h1><p>Weekly padel benefits, special players, and matchmaking revenue—securely tracked together.</p></section><section class="auth-card"><div class="eyebrow">Private club workspace</div><h2>Welcome back</h2><p class="sub">Sign in with your PADEL ON staff account.</p>${!api.configured?'<div class="auth-error">Unable to connect. Please contact an administrator.</div>':''}${message?`<div class="auth-error">${esc(message)}</div>`:''}<form id="login-form">${field('email','Email address','','email','required autocomplete="email"')}${field('password','Password','','password','required autocomplete="current-password"')}<button class="btn btn-primary" ${!api.configured?'disabled':''} type="submit">Sign In ${icon('arrow')}</button></form><div class="auth-foot">Authorized PADEL ON staff only · Staff access only</div></section></main>`;
}
async function loadDebtData({background=false}={}){
 if(!api.getSession()?.access_token||!state.staff||state.debtLoading)return;
 state.debtLoading=true;state.debtError=null;
 if(state.tab==='debts'&&!state.debtLoaded&&!background)render();
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
   state.debtError='Unable to load cafeteria debts. Please try again or contact an administrator.';
   state.debtLoaded=false;
  }
 }finally{
  state.debtLoading=false;
  if(!background&&(state.tab==='debts'||state.tab==='dashboard'||state.tab==='reports')&&!state.modal&&api.getSession()?.access_token)render();updateGlobalSearchResults();
 }
}
async function loadOverviewTraining({background=false}={}){
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
  if(state.tab==='dashboard'&&!state.modal&&!background&&api.getSession()?.access_token)render();
 }
}
function loadClubSources(){
 if(!api.getSession()?.access_token||!state.staff)return;
 if(!state.privateLoading)void loadPrivateClients();
 if(!state.debtLoading)void loadDebtData();
 if(state.tab==='dashboard')void loadOverviewTraining();
}
async function loadPrivateClients({background=false}={}){
 if(!api.getSession()?.access_token||!state.staff||state.privateLoading)return;
 state.privateLoading=true;state.privateError=null;
 if(state.tab==='private-clients'&&!state.privateLoaded&&!background)render();
 try{
  const [clients,coaches,entries,trainingBookings]=await Promise.all([
   api.listAll('private_clients'),
   api.listAll('private_coaches'),
   api.listAll('private_ledger_entries'),
   api.listAll('padel_court_reservations','private_client_id=not.is.null&order=business_date.asc,booking_start_time.asc')
  ]);
  if(!api.getSession()?.access_token||idleLogoutStarted)return;
  state.privateClients=clients;state.privateCoaches=coaches;state.privateEntries=entries;state.privateBookings=trainingBookings;
  state.privateLoaded=true;state.privateError=null;
  if(!clients.some(c=>c.id===state.privateSelected&&!c.deleted_at)){
   state.privateSelected=clients.find(c=>c.active&&!c.deleted_at)?.id||clients.find(c=>!c.deleted_at)?.id||null;
   state.privateNotesOpen=false;
  }
 }catch(e){
  if(api.getSession()?.access_token){
   state.privateLoaded=false;
   state.privateError='Unable to load Private Sessions. Try refreshing or contact an administrator.';
  }
 }finally{
  state.privateLoading=false;
  if(!background&&(state.tab==='private-clients'||state.tab==='dashboard'||state.tab==='reports')&&!state.modal&&api.getSession()?.access_token)render();updateGlobalSearchResults();
 }
}
async function loadData(resetTab=false,{background=false}={}){if(state.loading)return;state.loading=true;try{
 const auth=api.getSession();if(!auth?.access_token)throw Error('Sign in required');
 const profiles=await api.list('staff_profiles',`id=eq.${auth.user.id}`);
 if(!profiles.length){await api.signOut();throw Error('This account does not have staff access. Contact an administrator.');}
 state.staff=profiles[0];
 const since=addDays(today(),-30);
 const [members,balances,matches,games,resets,special,specialGames,finance,settlements,matchmakers]=await Promise.all([
  api.listAll('team_members'),api.listAll('initial_balances'),api.listAll('team_matches',`played_on=gte.${since}`),api.listAll('team_games',`played_on=gte.${since}`),api.listAll('reset_events',`week_start=gte.${since}`),api.listAll('other_players'),api.listAll('other_games',`played_on=gte.${addDays(today(),-36)}`),api.listAll('nazih_games'),api.listAll('nazih_settlements'),api.listAll('matchmakers').then(list=>list.sort((a,b)=>a.id.localeCompare(b.id))).catch(()=>[])
 ]);
 // Do not redraw private data if this tab was signed out while requests were pending.
 if(!api.getSession()?.access_token || idleLogoutStarted)return;
 Object.assign(state,{members,balances,matches,games,resets,special,specialGames,finance,settlements,matchmakers});
 if(matchmakers.length&&!matchmakers.some(p=>p.id===state.matchmakerId))state.matchmakerId=matchmakers[0].id;
 if(resetTab||!routeInitialized){
  // Deep links survive login and session restoration; forbidden pages do not.
  state.tab=resolveTabFromHash(window.location.hash,state.staff?.role);
  routeInitialized=true;
  syncBrowserRoute(state.tab,{replace:true});
 }
 if(!background){
  render();
  if(state.tab==='reports'&&!state.reportLoading)void loadReport();
  if(state.tab==='training'&&!state.trainingLoading)void loadTrainingMonth();
  if(state.tab==='private-clients'&&!state.privateLoading)void loadPrivateClients();
  if(state.tab==='debts'&&!state.debtLoading)void loadDebtData();
   if(state.tab==='consignment')void consignmentInventory.load();
  if(state.tab==='cafeteria-finances'){void cafeteriaFinances.load(true);void shiftHandover.load(cafeteriaFinances.getDate());}
  if(state.tab==='court-timetable')void cafeteriaFinances.schedulerLoad(true);
  if(state.tab==='cafeteria-payments'&&state.staff?.role==='admin'){void cafeteriaPayments.load();void cafeteriaTodo.load();}
  if(state.tab==='tournament')void tournamentManagement.load(true);
  if(state.tab==='dashboard'||state.tab==='reports')loadClubSources();
  if(state.tab==='dashboard')void clubInsights.loadOverview(true);
 }
 }catch(e){if((idleLogoutStarted || !api.getSession()?.access_token) && !e.message.includes('no PADEL ON staff access'))return;if(e.message.includes('sign in')||e.message.includes('JWT')||e.message.includes('refresh token')){clearStaffActivity();await api.signOut();renderAuth(e.message)}else if(state.staff){toast(e.message,true)}else renderAuth(e.message)}finally{state.loading=false;}}
let working=false;
async function runMutation(task,success='Saved successfully'){if(working)return;working=true;const b=document.getElementById('save-button');if(b){b.disabled=true;b.textContent='Saving…'}try{await task();state.modal=null;await loadData();toast(success)}catch(e){toast(e?.message||'Could not save. Try again.',true)}finally{working=false;if(b&&b.isConnected){b.disabled=false;b.textContent='Try again'}}}
function slugify(x){return x.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.random().toString(36).slice(2,6)}
async function saveForm(form){const f=new FormData(form),data=Object.fromEntries(f.entries()),m=state.modal;
 switch(form.dataset.save){
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
       const created=await api.rpc('private_add_client',{p_name:name,p_client_code:clientCode||null,p_contact:data.contact?.trim()||'',p_opening_balance_cents:0,p_notes:data.notes?.trim()||''});
       if(typeof created==='string'){
         state.privateSelected=created;
         state.privateNotesOpen=false;
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
 case 'close-private-balance':{
   if(state.staff?.role!=='admin')throw Error('Only an administrator can close a client balance.');
   const client=state.privateClients.find(c=>c.id===m.clientId&&!c.deleted_at);
   if(!client||privateClientBalance(client)<=0)throw Error('This client has no credit to close.');
   await api.rpc('private_close_balance',{p_entry_id:m.requestId,p_client_id:m.clientId,p_entry_date:data.entry_date,p_notes:data.notes?.trim()||'Account balance closed'});
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
 const name=person?.name||'Nazih Sonbol';
 const rows=[['PADEL ON','Monthly Matchmaking Ledger'],['Matchmaker',name],['Month',monthLabel(state.month)],['Commission rule','15 / 15 / 20 / 20 / 25 / 25 / 30 rolling seven-day streak'],[],['Date','Other players','Notes','Collected USD','Streak day','Rate','Commission USD']];
 for(const entry of f.rows)rows.push([entry.played_on,entry.players||'',entry.notes||'',(Number(entry.amount_cents)/100).toFixed(2),entry.streakDay,(entry.commissionBps/100)+'%',(entry.commission_cents/100).toFixed(2)]);
 rows.push([],['TOTAL','','',(f.total/100).toFixed(2),'','',(f.fee/100).toFixed(2)]);
 const slug=person?.name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'nazih';
 downloadCSV(rows,`padel-on-matchmaking-${slug}-${state.month}.csv`);
}
async function handleAction(target,event){const act=target.dataset.action,id=target.dataset.id;
 if(act?.startsWith('tm-')){
  if(state.tab!=='tournament'||!state.staff)throw Error('Authorized staff only.');
  if(await tournamentManagement.action(target))return;
 }
 if(act?.startsWith('shift-')){
   if(state.tab!=='cafeteria-finances'||!state.staff)throw Error('Authorized staff only.');
   if(await shiftHandover.action({dataset:{shiftAction:act.slice(6),id},closest:selector=>target.closest(selector)}))return;
  }
  if(act?.startsWith('consign-')){
   if(state.tab!=='consignment'||!state.staff)throw Error('Authorized staff only.');
   if(await consignmentInventory.action({dataset:{consignAction:act.slice(8),id}}))return;
  }
  if(act?.startsWith('ctodo-')){
   if(state.tab!=='cafeteria-payments'||state.staff?.role!=='admin')throw Error('Administrator access required.');
   if(await cafeteriaTodo.action({dataset:{ctodoAction:act.slice(6),id}}))return;
  }
  if(act?.startsWith('cpay-')){
   if(state.tab!=='cafeteria-payments'||state.staff?.role!=='admin')throw Error('Administrator access required.');
   if(cafeteriaPayments.action({dataset:{cpayAction:act.slice(5),id}}))return;
  }
  if(act?.startsWith('cafe-')){
  if(!['cafeteria-finances','court-timetable'].includes(state.tab)||!state.staff)throw Error('Authorized staff only.');
  if(state.tab==='court-timetable'&&!act.startsWith('cafe-schedule-'))throw Error('Use Cafeteria Finances for financial entries.');
  if(await cafeteriaFinances.action(target,event)){
    if(act==='cafe-reload')await shiftHandover.load(cafeteriaFinances.getDate());
    return;
   }
 }
 switch(act){
 case 'sidebar-toggle':toggleDesktopSidebar();break;
 case 'mobile-menu-toggle':setMobileMenuOpen(!mobileMenuOpen);break;
 case 'mobile-menu-close':setMobileMenuOpen(false);break;
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
   state.tab='private-clients';state.privateSelected=personId;state.privateNotesOpen=false;
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
   state.tab='private-clients';state.privateSelected=id;state.privateNotesOpen=false;state.privateSearch='';
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
 case 'debt-day-prev':state.debtDay=addDays(state.debtDay,-1);render();break;
 case 'debt-day-next':if(state.debtDay<today())state.debtDay=addDays(state.debtDay,1);render();break;
 case 'debt-day-today':state.debtDay=today();render();break;
 case 'debt-day-open-account':
  if(!state.debtPeople.some(p=>p.id===id&&!p.deleted_at))throw Error('Account is unavailable.');
  state.debtSelected=id;state.debtFilter='all';render();
  document.getElementById('debt-account-details')?.scrollIntoView({behavior:'smooth',block:'start'});break;
 case 'debt-retry':await loadDebtData();break;
 case 'debt-new-person':if(!state.debtLoaded||state.debtError)throw Error('Cafeteria debt records are unavailable. Try refreshing.');openModal('debt-person');break;
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
  state.privateSelected=id;state.privateNotesOpen=false;state.privateListFilter='all';state.privateSearch='';
  if(!client.active)state.privateShowArchived=true;
  render();
  setTimeout(()=>document.querySelector('.private-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),0);
  break;
 }
 case 'private-retry':await loadPrivateClients();break;
 case 'private-add-client':if(!state.privateLoaded||state.privateError)throw Error('Private Sessions are unavailable. Try refreshing or contact an administrator.');openModal('private-client');break;
 case 'private-select-client':if(!state.privateClients.some(c=>c.id===id&&!c.deleted_at))throw Error('Client not found.');state.privateSelected=id;state.privateNotesOpen=false;render();break;
 case 'private-edit-client':if(!state.privateSelected)throw Error('Select a client.');openModal('private-client',null,{clientId:state.privateSelected});break;
 case 'private-complete-training':{
  if(!state.staff||!state.privateLoaded)throw Error('Private Sessions data is unavailable.');
  const booking=state.privateBookings.find(b=>b.id===id&&b.status==='confirmed'&&!b.private_session_entry_id);
  if(!booking)throw Error('Training booking is unavailable or already recorded.');
  if(booking.business_date>today())throw Error('Complete the session on or after its date.');
  const coachId=document.querySelector('[data-private-training-coach="'+id+'"]')?.value||
   booking.private_coach_id||'';
  if(!state.privateCoaches.some(c=>c.id===coachId&&c.active))
   throw Error('Choose an active coach before recording this session.');
  await api.rpc('club_private_training_complete',{p_booking_id:id,p_coach_id:coachId});
  await loadPrivateClients();toast('Private training recorded in the client account.');
  break;
 }
 case 'private-record-session':if(!state.privateSelected)throw Error('Select a client.');if(!state.privateCoaches.some(c=>c.active))throw Error('Coaches are not set up. Run the private coach setup script.');openModal('private-session',null,{clientId:state.privateSelected});break;
 case 'private-add-balance':if(!state.privateSelected)throw Error('Select a client.');openModal('private-deposit',null,{clientId:state.privateSelected});break;
 case 'private-close-balance':{
  if(state.staff?.role!=='admin')throw Error('Only an administrator can close a client balance.');
  const client=state.privateClients.find(c=>c.id===state.privateSelected&&!c.deleted_at);
  if(!client||privateClientBalance(client)<=0)throw Error('This client has no credit to close.');
  openModal('private-close-balance',null,{clientId:client.id});break;
 }
 case 'private-void-entry':if(state.staff?.role!=='admin')throw Error('Only admins can correct financial entries.');if(!state.privateEntries.some(e=>e.id===id))throw Error('Entry not found.');openModal('private-void',id);break;
 case 'private-export':exportPrivateClientCSV();break;
 case 'refresh':if(state.tab==='court-timetable'){await cafeteriaFinances.schedulerLoad(true);toast('Timetable refreshed');break;}if(state.tab==='consignment'){await consignmentInventory.load();toast('Inventory refreshed');break;}if(state.tab==='cafeteria-payments'){if(state.staff?.role!=='admin')throw Error('Administrator access required.');await Promise.all([cafeteriaPayments.load(),cafeteriaTodo.load()]);toast('Payments and tasks refreshed');break;}if(state.tab==='tournament'){await tournamentManagement.load(true);toast('Tournament refreshed');break;}await loadData();if(state.tab==='debts')await loadDebtData();else if(state.tab==='private-clients')await loadPrivateClients();else if(state.tab==='cafeteria-finances')await Promise.all([cafeteriaFinances.load(true),shiftHandover.load(cafeteriaFinances.getDate())]);else if(state.tab==='training')await loadTrainingMonth();else if(state.tab==='reports')await loadReport();else if(state.tab==='team'&&state.historyWeek!==weekStart(today()))await loadHistoryWeek(state.historyWeek);toast('Data refreshed');break;
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
 case 'report-mode-day':state.reportMode='day';if(state.reportCompare)resetReportComparison();await loadReport();break;
 case 'report-mode-week':state.reportMode='week';if(state.reportCompare)resetReportComparison();await loadReport();break;
 case 'report-mode-month':state.reportMode='month';if(state.reportCompare)resetReportComparison();await loadReport();break;
 case 'report-prev':
  if(state.reportMode==='day')state.reportDay=addDays(state.reportDay,-1);
  else if(state.reportMode==='week')state.reportWeek=addDays(state.reportWeek,-7);
  else state.reportMonth=shiftMonth(state.reportMonth,-1);
  ensureDifferentComparison();
  await loadReport();break;
 case 'report-next':
  if(state.reportMode==='day'&&state.reportDay<today())state.reportDay=addDays(state.reportDay,1);
  else if(state.reportMode==='week'&&state.reportWeek<weekStart(today()))state.reportWeek=addDays(state.reportWeek,7);
  else if(state.reportMode==='month'&&state.reportMonth<monthKey(today()))state.reportMonth=shiftMonth(state.reportMonth,1);
  ensureDifferentComparison();
  await loadReport();break;
 case 'report-compare-toggle':
  state.reportCompare=!state.reportCompare;
  if(state.reportCompare)resetReportComparison();
  else{state.reportCompareData=null;state.reportCompareKey='';compareClubInsights.reset()}
  await loadReport();break;
 case 'report-compare-prev':{
  const value=shiftedComparison(-1);if(value)setReportPeriodValue(true,value);
  await loadReport();break;
 }
 case 'report-compare-next':{
  const value=shiftedComparison(1);if(value)setReportPeriodValue(true,value);
  await loadReport();break;
 }
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
 case 'signout':{mobileMenuOpen=false;document.body.classList.remove('mobile-menu-open');clearStaffActivity();const logout=api.signOut();state.staff=null;routeInitialized=false;cafeteriaFinances.reset();cafeteriaPayments.reset();cafeteriaTodo.reset();consignmentInventory.reset();shiftHandover.reset();tournamentManagement.reset();clubInsights.reset();compareClubInsights.reset();state.modal=null;state.globalSearchOpen=false;state.globalSearchQuery='';renderAuth();await logout;break;}
 }}
// Delegate events so every newly rendered interactive component works.
document.addEventListener('click',async e=>{
 if(e.target.id==='modal-backdrop'){closeModal();return;}
 const tab=e.target.closest('[data-tab]');if(tab){
  try{await navigateToTab(tab.dataset.tab);}catch(err){toast(err.message||'Navigation failed',true);}
  return;
 }
 const action=e.target.closest('[data-action]');if(action){try{await handleAction(action,e)}catch(err){toast(err.message,true)}}
});
// Booking pointer gestures. Native scrolling is retained outside booking blocks.
// On phones, tapping a block opens the full accessible court/time editor.
document.addEventListener('pointerdown',e=>{
 if(['cafeteria-finances','court-timetable'].includes(state.tab)&&state.staff)cafeteriaFinances.schedulerPointerDown(e);
});
document.addEventListener('pointermove',e=>{
 if(['cafeteria-finances','court-timetable'].includes(state.tab)&&state.staff)cafeteriaFinances.schedulerPointerMove(e);
},{passive:false});
document.addEventListener('pointerup',e=>{
 if(['cafeteria-finances','court-timetable'].includes(state.tab)&&state.staff)
  void cafeteriaFinances.schedulerPointerUp(e).catch(error=>toast(error.message||'Move unsuccessful',true));
});
document.addEventListener('pointercancel',()=>cafeteriaFinances.schedulerCancelDrag());
document.addEventListener('keydown',e=>{
 if(e.key==='Escape'&&['cafeteria-finances','court-timetable'].includes(state.tab)&&state.staff)
  cafeteriaFinances.schedulerCloseEditor();
});
document.addEventListener('submit',async e=>{
  if(e.target.dataset?.shiftSave){
   e.preventDefault();
   if(state.tab!=='cafeteria-finances'||!state.staff){toast('Authorized staff only.',true);return;}
   try{await shiftHandover.submit(e.target)}catch(err){toast(err.message||'Could not record handover.',true)}
   return;
  }
  if(e.target.dataset?.consignSave){
   e.preventDefault();
   if(state.tab!=='consignment'||!state.staff){toast('Authorized staff only.',true);return;}
   try{await consignmentInventory.submit(e.target)}catch(err){toast(err.message||'Unable to save inventory entry.',true)}
   return;
  }
 if(e.target.dataset?.tmSubmit){
  e.preventDefault();
  if(state.tab!=='tournament'||!state.staff){toast('Authorized staff only.',true);return;}
  try{await tournamentManagement.submit(e.target)}catch(err){toast(err.message||'Tournament could not be saved.',true)}
  return;
 }
 if(e.target.dataset?.ctodoSave){
   e.preventDefault();
   if(state.tab!=='cafeteria-payments'||state.staff?.role!=='admin'){toast('Administrator access required.',true);return;}
   try{await cafeteriaTodo.submit(e.target)}catch(err){toast(err.message||'Could not save task.',true)}
   return;
  }
  if(e.target.dataset?.cpaySave){
   e.preventDefault();
   if(state.tab!=='cafeteria-payments'||state.staff?.role!=='admin'){toast('Administrator access required.',true);return;}
   try{await cafeteriaPayments.submit(e.target)}catch(err){toast(err.message||'Could not record payment.',true)}
   return;
  }
  // Intercept every Cafeteria form before the browser can navigate away.
 // The finance module validates individual actions and rejects unknown ones.
 if(e.target.dataset?.cafeSave){
  e.preventDefault();
  if(!['cafeteria-finances','court-timetable'].includes(state.tab)||!state.staff||
   (state.tab==='court-timetable'&&e.target.dataset.cafeSave!=='schedule-reservation')){toast('Authorized staff only.',true);return;}
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
 if(e.target.id==='modal-form'){
 e.preventDefault();
 const form=e.target;
 if(form.dataset.save==='choose-member'){const sel=new FormData(form).get('member_id');openModal('edit-member',sel);return;}
 if(form.dataset.save==='submit-reset'&&state.modal?.id){const chosen=document.getElementById('reset-member')?.value;if(chosen)state.modal.id=chosen;}
 await runMutation(()=>saveForm(form),form.dataset.save==='submit-reset'?'Weekly counter reset recorded':'Saved successfully');
 }
});
document.addEventListener('input',e=>{
  if(e.target.id==='consign-search'&&state.tab==='consignment'&&state.staff){
   const cursor=e.target.selectionStart;
   consignmentInventory.setSearch(e.target.value);
   render();
   const field=document.getElementById('consign-search');
   field?.focus();if(cursor!==null)field?.setSelectionRange(cursor,cursor);
   return;
  }
  if(e.target.id==='cpay-search'&&state.tab==='cafeteria-payments'&&state.staff?.role==='admin'){
   const cursor=e.target.selectionStart;
   cafeteriaPayments.setSearch(e.target.value);
   render();
   const field=document.getElementById('cpay-search');field?.focus();if(cursor!==null)field?.setSelectionRange(cursor,cursor);
   return;
  }
 if(['cafeteria-finances','court-timetable'].includes(state.tab)&&cafeteriaFinances.schedulerPreviewEnd(e.target))return;
 if(state.tab==='cafeteria-finances'&&cafeteriaFinances.courtPricePreview(e.target))return;
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-list-search'){
  const caret=e.target.selectionStart;
  try{tournamentManagement.searchList(e.target)}catch(err){toast(err.message||'Unable to search tournaments.',true)}
  const field=document.getElementById('tm-list-search');
  field?.focus();if(caret!==null)field?.setSelectionRange(caret,caret);
  return;
 }
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-participant-search'){
  const caret=e.target.selectionStart;
  try{tournamentManagement.searchParticipants(e.target)}catch(err){toast(err.message||'Unable to search participants.',true)}
  const field=document.getElementById('tm-participant-search');
  field?.focus();if(caret!==null)field?.setSelectionRange(caret,caret);
  return;
 }
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-payment-search'){
  tournamentManagement.searchPayments(e.target);return;
 }
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
 if(!e.target?.isConnected)return;
 if(state.tab==='private-clients'&&e.target.dataset?.privateClientNotes!==undefined)
  state.privateNotesOpen=e.target.open;
 if(state.tab==='tournament'&&e.target.dataset?.tmMemberNote)
  tournamentManagement.rememberNote(e.target.dataset.tmMemberNote,e.target.open);
 if(state.tab!=='cafeteria-finances')return;
 if(e.target.dataset.cafeFold)
  cafeteriaFinances.rememberFold(e.target.dataset.cafeFold,e.target.open);
 if(e.target.dataset.cafeNote)
  cafeteriaFinances.rememberNote(e.target.dataset.cafeNote,e.target.open);
},true);
document.addEventListener('change',e=>{
 if(['cafeteria-finances','court-timetable'].includes(state.tab)&&cafeteriaFinances.schedulerPreviewEnd(e.target))return;
 if(state.tab==='cafeteria-finances'&&cafeteriaFinances.courtPricePreview(e.target))return;
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-list-status'){
  try{tournamentManagement.searchList(e.target)}catch(err){toast(err.message||'Unable to filter tournaments.',true)}
  return;
 }
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-participant-filter'){
  try{tournamentManagement.searchParticipants(e.target)}catch(err){toast(err.message||'Unable to filter participants.',true)}
  return;
 }
 if(state.tab==='tournament'&&state.staff&&e.target.id==='tm-payment-status'){
  try{tournamentManagement.searchPayments(e.target)}catch(err){toast(err.message||'Unable to filter participant payments.',true)}
  return;
 }
 if(state.tab==='tournament'&&['tm-team-count','tm-new-format','tm-fee-mode','tm-existing-team-count','tm-archive-saved','tm-seed-stage','tm-seed-slot','tm-seed-side','tm-seed-team'].includes(e.target.id)){
  try{tournamentManagement.change(e.target)}catch(err){toast(err.message||'Unable to update tournament.',true)}
  return;
 }
 if((e.target.id==='cafe-finance-date'||e.target.id==='cafe-schedule-date'||e.target.id==='cafe-quick-category'||e.target.dataset?.cafeMarker||e.target.dataset?.cafeReservationMarker||e.target.dataset?.cafePrivateCash!==undefined)&&
 (state.tab==='cafeteria-finances'||(state.tab==='court-timetable'&&e.target.id==='cafe-schedule-date'))){
  void cafeteriaFinances.change(e.target).catch(err=>toast(err.message||'Could not update finances.',true));return;
 }
 if(e.target.dataset?.reemInput==='quantity' && state.tab==='reem-items' && canUseOrderLists()){render();return;}
 if(e.target.dataset?.orderInput==='quantity' && state.tab==='order-counter' && canUseOrderLists()){render();return;}
 if(e.target.id==='consign-category'&&state.tab==='consignment'&&state.staff){consignmentInventory.setCategory(e.target.value);return;}
  if(e.target.id==='consign-filter'&&state.tab==='consignment'&&state.staff){consignmentInventory.setFilter(e.target.value);return;}
  if(e.target.id==='ctodo-filter'&&state.tab==='cafeteria-payments'&&state.staff?.role==='admin'){cafeteriaTodo.setFilter(e.target.value);return;}
  if(e.target.id==='cpay-filter'&&state.tab==='cafeteria-payments'&&state.staff?.role==='admin'){cafeteriaPayments.setFilter(e.target.value);return;}
  if(e.target.id==='settings-private-account'){state.settingsPrivateAccountId=e.target.value;render();return}
 if(e.target.id==='settings-cafeteria-account'){state.settingsCafeteriaAccountId=e.target.value;render();return}

 if(e.target.id==='report-compare-period'&&state.tab==='reports'&&state.reportCompare){
  let value=e.target.value;
  const valid=state.reportMode==='month'?/^\d{4}-\d{2}$/.test(value):/^\d{4}-\d{2}-\d{2}$/.test(value);
  if(valid&&state.reportMode==='week')value=weekStart(value);
  const maximum=state.reportMode==='day'?today():state.reportMode==='week'?weekStart(today()):monthKey(today());
  if(!valid||value>maximum){toast('Choose a valid past or current comparison period.',true);render();return}
  if(value===reportPeriodValue(false)){toast('Choose a different period to compare.',true);render();return}
  setReportPeriodValue(true,value);void loadReport();return;
 }

 if(e.target.id==='private-client-filter'){state.privateListFilter=e.target.value==='owing'?'owing':'all';render();return}
 if(e.target.id==='private-client-sort'){state.privateSort=e.target.value==='id'?'id':'name';render();return}
 if(e.target.id==='debt-day-date'){
  const value=e.target.value;
  if(/^\d{4}-\d{2}-\d{2}$/.test(value)&&value<=today())state.debtDay=value;
  render();return;
 }
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
 if(e.key==='Escape'&&mobileMenuOpen){setMobileMenuOpen(false);return;}
 if(e.key==='Escape'&&state.globalSearchOpen){state.globalSearchOpen=false;state.globalSearchQuery='';render();return;}
 if(e.key==='Escape'&&state.modal)closeModal();
});
async function start(){if(!api.configured){renderAuth();return}if(api.getSession()?.access_token){if(idleExpired()){await autoSignOut();return}await loadData()}else renderAuth();}
start();
// All authenticated page datasets share one 30-second sync interval.
// Background reads update app state even for pages that aren't currently open,
// but do not redraw a staff member's partially completed form.
let lastAllDataRefreshAt=Date.now();
let allDataRefreshBusy=false;
async function refreshHistoricalWeekInBackground(){
 const current=weekStart(today()),week=state.historyWeek;
 if(week===current)return;
 const request=++historySeq;
 try{
  const data=await fetchPeriod(week,addDays(week,6));
  if(request===historySeq&&week===state.historyWeek&&api.getSession()?.access_token)
   state.historyData=data;
 }catch(err){
  console.warn('Historical team data refresh failed',err);
 }
}
async function refreshAllPagesWhenDue(){
 if(!api.configured||!api.getSession()?.access_token||!state.staff||
  idleLogoutStarted||idleExpired()||state.modal||working||state.loading||
  document.hidden||allDataRefreshBusy)return false;
 const now=Date.now();
 if(!refreshPolicy.isPageRefreshDue(state.tab,lastAllDataRefreshAt,now))return false;
 lastAllDataRefreshAt=now;
 allDataRefreshBusy=true;autoRefreshRunning=true;
 try{
  // Run the shared tables and each independent page feed concurrently.
  // listAll's in-flight coalescer merges overlapping reads of the same table.
  // Retain every page on the same 30-second cadence and paint only once.
  // A failing feed must not prevent other pages from refreshing.
  const feeds=[
   ['Court Timetable',()=>state.tab==='court-timetable'?cafeteriaFinances.schedulerLoad(true):undefined],
   ['Shared data',()=>loadData(false,{background:true})],
   ['Cafeteria Finances',()=>Promise.all([cafeteriaFinances.load(true,true),shiftHandover.load(cafeteriaFinances.getDate(),true)])],
    ['Cafeteria Payments',()=>state.staff?.role==='admin'?Promise.all([cafeteriaPayments.load(true),cafeteriaTodo.load(true)]):undefined],
   ['Tournament Management',()=>tournamentManagement.load(true,true)],
   ['Private Sessions',()=>loadPrivateClients({background:true})],
   ['Cafeteria Debts',()=>loadDebtData({background:true})],
    ['Consignment Inventory',()=>consignmentInventory.load(true)],
   ['Monthly Training',()=>loadTrainingMonth({background:true})],
   ['Overview attendance',()=>loadOverviewTraining({background:true})],
   ['Overview financial totals',()=>clubInsights.loadOverview(true)],
   ['Reports and report financial totals',()=>loadReport({background:true})],
   ['Historical Team Members',refreshHistoricalWeekInBackground],
   ['Order Counter',()=>orderCounter.refreshOrderCounterFromStorage(state.staff?.id||state.staff?.email)],
   ["Reem's Items List",()=>reemItems.refreshReemItemsFromStorage(state.staff?.id||state.staff?.email)]
  ];
  const results=await Promise.allSettled(feeds.map(([,task])=>Promise.resolve().then(task)));
  for(let i=0;i<results.length;i++){
   if(results[i].status==='rejected')
    console.warn('Auto-refresh failed: '+feeds[i][0],results[i].reason);
  }
  if(!api.getSession()?.access_token||idleLogoutStarted)return false;
  // Only repaint when no draft, search field, or input is being edited.
  if(api.getSession()?.access_token&&!idleLogoutStarted&&!document.hidden&&canAutoRender())render();
 }finally{
  autoRefreshRunning=false;
  allDataRefreshBusy=false;
 }
 return true;
}
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
 void refreshAllPagesWhenDue().catch(err=>console.warn('Automatic data refresh failed',err));
},30000);
document.addEventListener('visibilitychange',()=>{
 if(document.hidden)return;
 checkStaffInactivity();
 // Returning after a missed refresh window updates all page feeds immediately.
 void refreshAllPagesWhenDue().catch(err=>console.warn('Visible data refresh failed',err));
});

