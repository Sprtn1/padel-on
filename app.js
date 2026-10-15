// Each page load uses a fresh module graph to avoid stale GitHub Pages assets.
const assetVersion = new URL(import.meta.url).searchParams.get('v') || Date.now().toString(36);
const api = await import(`./lib/api.js?v=${assetVersion}`);
const {getWeeklyStatus,getMonthFinance} = await import(`./lib/logic.js?v=${assetVersion}`);
const {todayBeirut,addDays,weekStart,weekEnd,weekLabel,niceDay,monthKey,monthLabel,shiftMonth,amount,parseUSD,commission} = await import(`./lib/date.js?v=${assetVersion}`);
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
const tabs=[['dashboard','Overview','grid'],['team','Team Members','users'],['other','Other Benefits','gift'],['finance','Matchmaking','wallet'],['activity','Game Activity','list'],['reports','Reports','download'],['settings','Settings','settings']];
const TEAM_GROUPS=[['top_team','Top Team'],['team','Team'],['rising_stars','Rising Stars Team'],['ladies_team','Ladies Team']];
function groupLabel(value){return TEAM_GROUPS.find(([id])=>id===value)?.[1]||'Team';}
const state={tab:'dashboard',members:[],balances:[],matches:[],games:[],resets:[],special:[],specialGames:[],finance:[],settlements:[],audit:[],staff:null,month:monthKey(todayBeirut()),teamSearch:'',teamSort:'name',teamFilter:'all',teamCategoryFilter:'all',activitySearch:'',loading:false,modal:null,historyWeek:weekStart(todayBeirut()),historyData:null,historyLoading:false,reportMode:'week',reportWeek:weekStart(todayBeirut()),reportMonth:monthKey(todayBeirut()),reportData:null,reportKey:'',reportLoading:false};
// Staff inactivity policy: thirty minutes without user interaction logs out every open tab.
// Background database polling and token refreshes never extend this timer.
let lastKnownWeek=weekStart(todayBeirut());
let lastKnownMonth=monthKey(todayBeirut());
const IDLE_LIMIT_MS=30*60*1000;
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
 state.modal=null;
 // api.signOut clears the local authentication token before contacting Supabase.
 const remoteLogout=api.signOut();
 renderAuth('Signed out after 30 minutes of inactivity. Please sign in again.');
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

function titleFor(){return tabs.find(x=>x[0]===state.tab)?.[1]||'Dashboard'}
function today(){return todayBeirut()}
function normalMembers(){return state.members.filter(m=>m.active&&!m.unlimited)}
function status(m,date=today()){const past=state.historyWeek!==weekStart(today())&&weekStart(date)===state.historyWeek?state.historyData:null;return getWeeklyStatus(m,date,state.balances,past?.games||state.games,past?.resets||state.resets);}
function financials(ym=state.month){return getMonthFinance(state.finance,ym);}
function navMarkup(mobile=false){const allowed=tabs.filter(t=>mobile?t[0]!=='settings':true);return allowed.map(([key,title,ico])=>`<button class="${mobile?'mobile-nav':'nav-item'} ${state.tab===key?'active':''}" data-tab="${key}" aria-current="${state.tab===key?'page':'false'}">${icon(ico)}<span>${mobile?title.split(' ')[0]:title}</span></button>`).join('')}
function shell(){
 const name=state.staff?.email?.split('@')[0]||'Staff';
 return `<div class="app-layout"><aside class="sidebar"><div class="brand"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/></div><div class="brand-sub">Club management</div><nav class="menu">${navMarkup()}</nav><div class="menu-footer"><div class="sidebar-info"><span class="status-dot"></span>Live database connected<br/><span style="color:#789d88">Private team workspace</span></div><div class="sidebar-bottom">© ${new Date().getFullYear()} PADEL ON</div></div></aside><main class="main"><header class="topbar"><div><div class="crumb">PADEL ON / MANAGEMENT</div><div class="topbar-main">${titleFor()}</div></div><div class="top-right">${btn(icon('refresh'),'refresh','btn-light btn-icon','aria-label="Refresh data" title="Refresh data"')}<div class="user-meta"><strong>${esc(name)}</strong><small>${esc(state.staff?.role||'staff')} account</small></div><div class="avatar">${esc(initials(name))}</div></div></header><div class="workspace">${renderPage()}<div class="page-footer">PADEL ON · Private management · Asia/Beirut local time</div></div></main><nav class="mobile-bar">${navMarkup(true)}</nav></div><div id="modal-root">${state.modal?modalMarkup():''}</div>`;
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
function dashboard(){const normal=normalMembers();const used=normal.reduce((n,m)=>n+status(m).used,0),left=normal.reduce((n,m)=>n+status(m).remain,0),empty=normal.filter(m=>status(m).remain===0).length;const recent=recentActivity(6);return `
${heading('Your club, organized','Good day, team.','Here’s what’s happening at PADEL ON this week.',btn(`${icon('plus')} Quick Match`,'quick-team','btn-primary'))}
<div class="notice" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">${icon('calendar')} <span><strong>Current week:</strong> ${weekLabel(today())} · Counters automatically follow the Beirut calendar week.</span></div>
<section class="summary">${summaryCard('Active team members',state.members.filter(m=>m.active).length,'Including Nazih Sonbol','users',true)}${summaryCard('Benefits used',used,'This week · standard members','activity')}${summaryCard('Benefits remaining',left,'Available this week','gift')}${summaryCard('Allowances exhausted',empty,'Members with 0 remaining','shield')}</section>
<section class="two-col"><article class="panel"><div class="panel-head"><div><h2>Recent game activity</h2><p>Last 30 days · latest first</p></div><button class="link" data-tab="activity">View all ${icon('arrow')}</button></div><div class="panel-body">${recent.length?recent.map(a=>`<div class="activity-line"><div class="activity-avatar">${esc(initials(a.names.split(',')[0]))}</div><div class="activity-copy"><strong>${esc(a.names)}</strong><small>${esc(a.type)}</small></div><span class="small-date">${niceDay(a.date)}</span></div>`).join(''):`<div class="empty-prompt">${icon('calendar')}<strong>No new games yet</strong><span>Recorded games will appear here.</span></div>`}</div></article><article class="panel"><div class="panel-head"><div><h2>Quick actions</h2><p>Everything in just a tap</p></div></div><div class="panel-body quick-list"><button class="quick-link" data-action="quick-team">${icon('plus')}<span><strong>Quick Match</strong><small>Choose all four participants</small></span></button><button class="quick-link" data-action="add-nazih">${icon('wallet')}<span><strong>Log matchmaking revenue</strong><small>Track Nazih's 15% commission</small></span></button><button class="quick-link" data-tab="other">${icon('gift')}<span><strong>Other player benefits</strong><small>Free game eligibility</small></span></button><button class="quick-link" data-tab="settings">${icon('settings')}<span><strong>Management settings</strong><small>Members and secure resets</small></span></button></div></article></section>`}
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
 if(state.reportMode==='week')return [state.reportWeek,addDays(state.reportWeek,6)];
 const first=state.reportMonth+'-01',last=addDays(shiftMonth(state.reportMonth,1)+'-01',-1);
 return [first,last];
}
async function loadReport(){
 const [start,end]=reportRange(),mode=state.reportMode;
 const request=++reportSeq;
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
 const monthFinance=getMonthFinance(state.finance,state.reportMonth);
 return {validMatches,games,rows,free,half,special,weekUsed,monthFinance};
}
function reportsPage(){
 const [start,end]=reportRange();
 const weekly=state.reportMode==='week',m=reportMetrics();
 const title=weekly?weekLabel(state.reportWeek):monthLabel(state.reportMonth);
 return `${heading('Operations overview','Weekly & Monthly Reports','Read-only reports from saved Supabase records.',btn(`${icon('download')} Export CSV`,'export-report','btn-primary',!m?'disabled':'')+btn('Print / Save PDF','print-report','btn-light',!m?'disabled':''))}
<div class="report-mode"><button class="btn ${weekly?'btn-primary':'btn-light'}" data-action="report-mode-week">Weekly report</button><button class="btn ${!weekly?'btn-primary':'btn-light'}" data-action="report-mode-month">Monthly report</button></div>
<div class="period-control"><div><strong>${icon('calendar')} ${title}</strong><small>${weekly?'Weekly benefits and records':'Monthly games and matchmaking revenue'} · Asia/Beirut dates</small></div><div class="period-buttons"><button class="btn btn-light" data-action="report-prev" aria-label="Previous ${weekly?'week':'month'}">${icon('chevronLeft')}</button><button class="btn btn-light" data-action="report-next" ${(weekly?state.reportWeek>=weekStart(today()):state.reportMonth>=monthKey(today()))?'disabled':''} aria-label="Next ${weekly?'week':'month'}">${icon('chevronRight')}</button></div></div>
${!m?`<div class="panel-empty">${state.reportLoading?'Loading report from Supabase…':'No report loaded. Use the period arrows to retry.'}</div>`:`
<section class="finance-grid">${summaryCard('Team matches',m.validMatches.length,'Matches recorded in selected period','calendar',true)}${summaryCard('Benefit uses',weekly?m.weekUsed:m.games.length,weekly?'Includes imported opening balances':'Dated transactions only','gift')}${summaryCard('Free / Half-price',`${m.free} / ${m.half}`,'Per-member benefit entries','activity')}</section>
${weekly?`<div class="notice">Historical balances use the member's current configured allowance. Imported opening balances are counted as weekly usage; reset events are respected.</div>`:`<section class="finance-grid">${summaryCard('Nazih revenue',amount(m.monthFinance.total),'Collected this month','wallet',true)}${summaryCard('Nazih commission',amount(m.monthFinance.fee),'15% of monthly revenue','coins')}${summaryCard('Other benefit games',m.special,'Special-player entries this month','users')}</section>`}
<article class="panel"><div class="panel-head"><div><h2>Team member breakdown</h2><p>${title} · ${m.rows.length} members with activity</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Member</th><th>Games logged</th><th>Free</th><th>Half-price</th><th>${weekly?'Week used':'Monthly total'}</th>${weekly?'<th>Remaining*</th>':''}</tr></thead><tbody>${m.rows.length?m.rows.map(r=>`<tr><td><strong>${esc(r.member.name)}</strong></td><td>${r.played}</td><td>${r.free}</td><td>${r.half}</td><td><strong>${r.used}</strong></td>${weekly?`<td>${r.member.unlimited?'Unlimited':r.remaining}</td>`:''}</tr>`).join(''):`<tr><td colspan="${weekly?6:5}" class="panel-empty">No benefits recorded for this period.</td></tr>`}</tbody></table></div></article>
<div class="archive-note">${weekly?'* Remaining benefits use current allowances and historical reset events.':'Financial totals use permanent saved matchmaking records. The monthly game counts exclude imported balances.'} No report action edits any records.</div>
`}`;
}
function exportReport(){
 const m=reportMetrics();if(!m)throw Error('Load the report before exporting.');
 const weekly=state.reportMode==='week',period=weekly?state.reportWeek:state.reportMonth;
 const rows=[['PADEL ON',weekly?'Weekly Game Report':'Monthly Game Report',period],
  ['Team matches',m.validMatches.length],['Logged benefit uses',m.games.length],
  ['Free entries',m.free],['Half-price entries',m.half],['Other-player games',m.special]];
 if(weekly)rows.push(['Weekly used (including opening balances)',m.weekUsed]);
 else rows.push(['Nazih revenue USD',(m.monthFinance.total/100).toFixed(2)],['Nazih commission USD',(m.monthFinance.fee/100).toFixed(2)]);
 rows.push([],['Member','Logged games','Free','Half-price',weekly?'Week used':'Monthly total',...(weekly?['Remaining*']:[])]);
 for(const r of m.rows)rows.push([r.member.name,r.played,r.free,r.half,r.used,...(weekly?[r.member.unlimited?'Unlimited':r.remaining]:[])]);
 rows.push([],['Date','Team members','Match benefit','Non-team players']);
 for(const match of m.validMatches.sort((a,b)=>a.played_on.localeCompare(b.played_on))){
  rows.push([match.played_on,m.games.filter(g=>g.match_id===match.id).map(g=>state.members.find(x=>x.id===g.member_id)?.name||'Unknown').join('; '),match.benefit_type,match.non_team_count??'Not recorded']);
 }
 downloadCSV(rows,`padel-on-${weekly?'week':'month'}-${period}.csv`);
}
function downloadCSV(rows,filename){
 // Avoid formula execution when exports are opened in spreadsheet programs.
 const safe=value=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 const csv=rows.map(row=>row.map(safe).join(',')).join('\r\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
 const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=filename;document.body.append(a);a.click();
 setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}

function otherPage(){return `${heading('Special arrangements','Other Benefits','Track free-game eligibility outside the regular team allowances.',state.staff?.role==='admin'?btn(`${icon('plus')} Add Player`,'new-other','btn-primary'):'')}
<div class="other-grid">${state.special.filter(p=>p.active).map(p=>{const info=p.status==='next_free'?['Next Game Free','green']:p.status==='rule_not_configured'?['Rule Not Configured','gray']:p.status==='counting'?[p.threshold?`${Math.max(0,p.threshold-p.current_counter)} Until Free`:'Counting','amber']:['Needs Confirmation','amber'];return `<article class="other-card"><div class="member-top"><div class="player-avatar">${esc(initials(p.name))}</div><div class="player-title"><strong>${esc(p.name)}</strong><small>Special benefit</small></div></div>${tag(info[0],info[1])}<div class="other-note">${p.status==='next_free'?'This player has a free game waiting.':p.slug==='rami-al-rifai'&&p.status==='counting'?`${Math.max(0,5-p.current_counter)} more paid game(s) before a free game.`:p.status==='rule_not_configured'?'Eligibility conditions have not been set.':'Confirm the player’s next-game benefit.'}</div><div class="player-row" style="margin-bottom:18px"><span class="game-caption">Games counter</span><span class="other-count num">${p.current_counter}</span></div><div class="card-bottom">${btn(`${icon('plus')} Record Game`,'record-other','btn-soft',`data-id="${p.id}"`)}${state.staff?.role==='admin'?btn(icon('edit'),'edit-other','btn-light btn-icon history-button',`data-id="${p.id}" title="Edit player"`):''}</div></article>`}).join('')}</div>`}
function financePage(){const f=financials(),sel=state.settlements.find(s=>s.month_key===state.month+'-01');const paid=sel?.status==='paid';const diff=Number(sel?.amount_paid_cents||0)-f.fee;return `${heading('Matchmaking / Nazih Sonbol','Revenue & Commission','Every matchmaking game is saved permanently. Monthly totals are kept separately.',btn(`${icon('plus')} Add Matchmaking Game`,'add-nazih','btn-primary'))}
<div class="toolbar"><div class="money-note">Revenue collected from other players · all figures USD</div><div class="month-control"><button data-action="prev-month" title="Previous month" aria-label="Previous month">${icon('chevronLeft')}</button><strong>${monthLabel(state.month)}</strong><button data-action="next-month" ${state.month>=monthKey(today())?'disabled':''} title="Next month" aria-label="Next month">${icon('chevronRight')}</button></div></div>
<section class="finance-grid">${summaryCard('Revenue collected',amount(f.total),'From other players','wallet',true)}${summaryCard('Nazih’s 15% commission',amount(f.fee),'Calculated monthly','coins')}${summaryCard('Games recorded',f.games,'This selected month','calendar')}</section>
<div class="settlement"><div><strong>Monthly settlement · ${monthLabel(state.month)}</strong><small>${paid?`Marked paid on ${niceDay(sel.paid_on||sel.month_key)}`:'Not marked as paid'}${paid&&diff!==0?' · ⚠ Paid amount differs from current commission':''}</small></div><div class="inline-info">${tag(paid?'Paid':'Unpaid',paid?'green':'amber')}${state.staff?.role==='admin'?btn(`${icon('edit')} ${paid?'Edit Settlement':'Record Payment'}`,'settlement','btn-light'):''}</div></div>
<article class="panel"><div class="panel-head"><div><h2>Matchmaking history</h2><p>${monthLabel(state.month)} · ${f.rows.length} records</p></div></div><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Players / Notes</th><th>Revenue collected</th><th>Game's 15% share*</th><th>Actions</th></tr></thead><tbody>${f.rows.length?f.rows.map(r=>`<tr><td>${niceDay(r.played_on)}</td><td><strong>${esc(r.players||'Matchmaking game')}</strong><br/><small>${esc(r.notes||'—')}</small></td><td><strong class="num">${amount(r.amount_cents)}</strong></td><td class="num">${amount(commission(r.amount_cents))}</td><td>${btn(icon('edit'),'edit-nazih','btn-light btn-icon btn-xs',`data-id="${r.id}" title="Edit"`)} ${btn(icon('trash'),'delete-nazih','btn-danger btn-icon btn-xs',`data-id="${r.id}" title="Delete"`)}</td></tr>`).join(''):`<tr><td colspan="5"><div class="empty-prompt">${icon('wallet')}<strong>No matchmaking records</strong><span>Add a game to start tracking revenue for this month.</span></div></td></tr>`}</tbody></table></div></article><div class="archive-note">* Per-game shares are illustrative. The amount payable is calculated by applying 15% to the <strong>entire monthly revenue</strong> and rounding once. Historical financial records are not cleared by weekly resets.</div>`}
function activityPage(){const recent=recentActivity(10000,state.activitySearch);return `${heading('History','Game Activity','Review games from the last 30 days. Older records remain archived in the database.',btn(`${icon('refresh')} Refresh`,'refresh','btn-light'))}<div class="toolbar"><label class="search">${icon('search')}<input id="activity-search" placeholder="Search player…" value="${esc(state.activitySearch)}"/></label><span class="tiny">${recent.length} entries</span></div><article class="panel"><div class="data-table-wrap"><table class="data-table"><thead><tr><th>Date</th><th>Player(s)</th><th>Benefit type</th><th>Reference</th><th>Action</th></tr></thead><tbody>${recent.length?recent.map(r=>`<tr><td>${niceDay(r.date)}</td><td><strong>${esc(r.names)}</strong></td><td>${tag(r.type,r.type==='Paid Game'?'gray':'green')}</td><td><small>${esc(r.ref.slice(0,8))}…</small></td><td>${r.kind==='team'?btn('Void match','void-match','btn-danger btn-xs',`data-id="${r.key}"`):'<span class="tiny">Saved entry</span>'}</td></tr>`).join(''):'<tr><td colspan="5" class="panel-empty">No activity found.</td></tr>'}</tbody></table></div></article>`}
function settingsPage(){const admin=state.staff?.role==='admin';return `${heading('Administration','Settings','Manage allowances, update players, and protect sensitive changes.',btn(`${icon('logout')} Sign out`,'signout','btn-light'))}<div class="notice warn">${icon('shield')} Manual resets are verified by a server-side Supabase Edge Function. The reset code is never exposed in the public website files.</div><div class="settings-grid"><article class="panel settings-box"><h3>Team roster</h3><p>Create team members, edit weekly allowances, and deactivate members while keeping their history.</p>${btn(`${icon('plus')} Add Member`,'new-member','btn-primary',admin?'':'disabled')}${btn(`${icon('edit')} Edit Member`,'choose-member-edit','btn-light',admin?'':'disabled')}</article><article class="panel settings-box"><h3>Manual weekly reset</h3><p>Reset a member or everyone for the active week. A reset changes the counting baseline but does not remove game records.</p>${btn('Reset One Member','reset-one','btn-light',admin?'':'disabled')}${btn('Reset All Members','reset-all','btn-danger',admin?'':'disabled')}</article><article class="panel settings-box"><h3>Database & security</h3><p>Live records use Supabase with Row-Level Security. Administrators can manage the roster and settlements.</p><div class="flex">${tag('Connected','green')}${tag((state.staff?.role||'Staff').toUpperCase(),'gray')}</div></article><article class="panel settings-box"><h3>Financial archive</h3><p>Matchmaking records are retained indefinitely unless deleted by an authorized staff member. Download a monthly CSV for your records.</p>${btn(`${icon('download')} Export Selected Month`,'export-finance','btn-light')}</article></div>${admin?'<div class="archive-note">To add new staff accounts, create them in Supabase Auth and authorize them in the staff_profiles table. Do not share login passwords.</div>':''}`}
function renderPage(){switch(state.tab){case'dashboard':return dashboard();case'team':return teamPage();case'other':return otherPage();case'finance':return financePage();case'activity':return activityPage();case'reports':return reportsPage();case'settings':return settingsPage();default:return dashboard()}}
function render(){app.innerHTML=shell()}
function field(name,label,value='',type='text',attr=''){return `<label class="form-field"><span>${label}</span><input class="form-input" name="${name}" type="${type}" value="${esc(value)}" ${attr}/></label>`}
function selectField(name,label,options,selected){return `<label class="form-field"><span>${label}</span><select class="form-input" name="${name}">${options.map(([val,lbl])=>`<option value="${esc(val)}" ${val===selected?'selected':''}>${esc(lbl)}</option>`).join('')}</select></label>`}
function textareaField(name,label,value=''){return `<label class="form-field"><span>${label}</span><textarea class="form-input" name="${name}" maxlength="500">${esc(value)}</textarea></label>`}
function modalMarkup(){const m=state.modal;let title='',subtitle='',content='',danger=false,action='';switch(m.type){
 case'team': {
  title='Record Team Game';subtitle='Select all eligible team members in this match.';action='save-team';
  content=`<form id="modal-form" data-save="${action}">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}<div class="form-field"><span>Team member(s) · select up to 4</span><div class="check-options">${state.members.filter(x=>x.active).map(x=>`<label><input type="checkbox" name="member_ids" value="${x.id}" ${x.id===m.id?'checked':''}/> ${esc(x.name)} ${x.unlimited?'(unlimited)':''}</label>`).join('')}</div></div><div class="form-field"><span>Benefit type</span><div class="radio-tiles"><label><input type="radio" name="benefit_type" value="free" checked/> Free game</label><label><input type="radio" name="benefit_type" value="half"/> Half-price game</label></div></div>${textareaField('notes','Notes (optional)')}<div class="notice warn">Confirm the actual player composition: free with two non-team participants, or half-price with three or more team participants. Each selected team member uses one weekly benefit.</div>${formActions('Save Game')}</form>`;break;}
 case 'quick-team':{
  title='Quick Match · Four Players';subtitle='Choose four participants. The benefit is calculated from team composition.';
  const options=state.members.filter(x=>x.active).map(x=>`<option value="${x.id}">${esc(x.name)}${x.unlimited?' · unlimited':` · ${status(x).remain} left`}</option>`).join('');
  const slots=Array.from({length:4},(_,i)=>`<label class="form-field"><span>Player ${i+1}</span><select class="form-input quick-seat" name="seat_${i}" required><option value="">Choose participant</option><option value="non-team">Non-team player</option>${options.replace(`value="${m.id}"`,`value="${m.id}" ${i===0?'selected':''}`)}</select></label>`).join('');
  content=`<form id="modal-form" data-save="save-quick"><div class="form-cols">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}</div><div class="quick-seat-grid">${slots}</div><div id="quick-benefit-preview" class="notice">Select all four players to calculate their game benefits.</div>${field('non_team_names','Non-team names (optional)','','text','maxlength="255" placeholder="Names separated by commas"')}${textareaField('notes','Notes (optional)')}${formActions('Record Match')}</form>`;
  break;}
 case 'other-game': {const p=state.special.find(x=>x.id===m.id);title='Record Special Benefit';subtitle=p?.name||'';content=`<form id="modal-form" data-save="save-other">${field('played_on','Game date',today(),'date',`required max="${today()}" min="${addDays(today(),-30)}"`)}<div class="form-field"><span>Game type</span><div class="radio-tiles"><label><input type="radio" name="game_type" value="paid" ${p?.status!=='next_free'?'checked':''}/> Paid game</label><label><input type="radio" name="game_type" value="free" ${p?.status==='next_free'?'checked':''}/> Free game</label></div></div>${textareaField('notes','Notes (optional)')}${formActions('Record Game')}</form>`;break;}
 case 'finance': {const rec=state.finance.find(x=>x.id===m.id);title=rec?'Edit Matchmaking Game':'Add Matchmaking Game';subtitle='Revenue collected from the other players (USD).';content=`<form id="modal-form" data-save="save-finance"><div class="form-cols">${field('played_on','Game date',rec?.played_on||today(),'date',`required max="${today()}"`)}${field('amount','Amount received ($)',rec?Number(rec.amount_cents/100).toFixed(2):'','number','required min="0" max="1000000000" step="0.01" placeholder="45.00"')}</div>${field('players','Other players (optional)',rec?.players||'','text','maxlength="255"')}${textareaField('notes','Notes (optional)',rec?.notes||'')}${formActions(rec?'Save Changes':'Save Revenue')}</form>`;break;}
 case 'edit-member': {const p=state.members.find(x=>x.id===m.id);title=p?'Edit Team Member':'Add Team Member';subtitle='Only administrators can modify the team roster.';content=`<form id="modal-form" data-save="save-member">${field('name','Full name',p?.name||'','text','required maxlength="100" minlength="2"')}${selectField('team_category','Team category',TEAM_GROUPS,p?.team_category||'team')}<div class="form-cols">${field('weekly_allowance','Weekly allowance',p?.weekly_allowance??0,'number','min="0" max="30" required')}${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}</div>${selectField('unlimited','Free game rule',[['false','Weekly allowance'],['true','Unlimited free games']],p?.unlimited?'true':'false')}${formActions(p?'Save Member':'Create Member')}</form>`;break;}
 case 'choose-member':{title='Edit Team Member';subtitle='Select a person to update.';content=`<form id="modal-form" data-save="choose-member">${selectField('member_id','Team member',state.members.map(x=>[x.id,x.name]),state.members[0]?.id)}${formActions('Continue')}</form>`;break;}
 case 'edit-other':{const p=state.special.find(x=>x.id===m.id);title=p?'Edit Other Benefit':'Add Other Benefit';subtitle='These counters are not reset weekly.';content=`<form id="modal-form" data-save="save-other-player">${field('name','Player name',p?.name||'','text','required maxlength="100"')}${field('current_counter','Current counter',p?.current_counter??0,'number','required min="0" max="1000000"')}${selectField('status','Eligibility status',[['needs_confirmation','Needs Confirmation'],['next_free','Next Game Free'],['counting','Counting Games'],['rule_not_configured','Rule Not Configured']],p?.status||'needs_confirmation')}${field('threshold','Threshold (optional)',p?.threshold??'','number','min="1" max="100"')}${selectField('active','Status',[['true','Active'],['false','Inactive']],p?.active===false?'false':'true')}${formActions('Save Player')}</form>`;break;}
 case 'settlement':{const s=state.settlements.find(x=>x.month_key===state.month+'-01');title='Monthly Settlement';subtitle=monthLabel(state.month);const suggested=Number(s?.amount_paid_cents??financials().fee)/100;content=`<form id="modal-form" data-save="save-settlement">${selectField('status','Payment status',[['unpaid','Unpaid'],['paid','Paid']],s?.status||'unpaid')}<div class="form-cols">${field('amount_paid','Amount paid (USD)',suggested.toFixed(2),'number','required min="0" step="0.01"')}${field('paid_on','Payment date',s?.paid_on||today(),'date')}</div>${textareaField('notes','Notes',s?.notes||'')}${formActions('Save Settlement')}</form>`;break;}
 case 'reset':{title=m.id?'Reset Member Counter':'Reset All Counters';subtitle='Administrator authorization required.';danger=true;content=`<div class="notice warn">${icon('alert')} This records a reset event for the current week. It does not erase old games or Nazih's financial information.</div><form id="modal-form" data-save="submit-reset">${field('code','Management reset code','','password','required autocomplete="off"')}${formActions('Authorize Reset',true)}</form>`;break;}
 case 'confirm-delete':{title=m.entity==='finance'?'Remove Financial Record':'Void Team Match';subtitle='This action will be recorded in the audit log.';danger=true;content=`<p class="hint">${m.entity==='finance'?'The record will stop contributing to monthly revenue.':'The game will stop counting against team members’ weekly allowances.'} Are you sure?</p><form id="modal-form" data-save="confirm-delete">${formActions('Confirm',true)}</form>`;break;}
 case 'member-history':{const p=state.members.find(x=>x.id===m.id);const d=state.historyWeek;title=p?.name||'History';subtitle=`Week: ${weekLabel(d)}`;const gamesForWeek=state.historyWeek!==weekStart(today())?state.historyData?.games||[]:state.games;const logs=gamesForWeek.filter(x=>x.member_id===m.id&&!x.voided_at&&x.played_on>=d&&x.played_on<=addDays(d,6)).sort((a,b)=>b.played_on.localeCompare(a.played_on));const init=state.balances.find(x=>x.member_id===m.id&&x.week_start===d);content=`<div class="notice">${icon('info')} ${status(p,d).used} game(s) counted this week${init?.used?` · includes ${init.used} imported opening game(s)`:''}.</div>${logs.length?logs.map(g=>`<div class="activity-line"><div class="activity-avatar">${icon('calendar')}</div><div class="activity-copy"><strong>${niceDay(g.played_on)}</strong><small>${g.benefit_type==='free'?'Free game':'Half-price game'}</small></div></div>`).join(''):'<div class="panel-empty">No game entries during this week.</div>'}<div class="modal-actions">${btn('Close','close-modal','btn-light')}</div>`;break;}
 }
 return `<div class="modal-backdrop" id="modal-backdrop"><div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close" data-action="close-modal" aria-label="Close">${icon('close')}</button></div><div class="modal-body">${content}</div></div></div>`
}
function formActions(text,danger=false){return `<div class="modal-actions">${btn('Cancel','close-modal','btn-light')}<button type="submit" class="btn ${danger?'btn-danger':'btn-primary'}" id="save-button">${esc(text)}</button></div>`}
function openModal(type,id=null,more={}){state.modal={type,id,...(['team','quick-team','other-game','finance'].includes(type)?{requestId:crypto.randomUUID()}:{}),...more};render();setTimeout(()=>{document.querySelector('#modal-root .form-input')?.focus();updateQuickPreview();},0)}
function closeModal(){state.modal=null;document.getElementById('modal-root').innerHTML=''}
function renderAuth(message=''){
 app.innerHTML=`<main class="auth-wrap"><section class="auth-lead"><img src="./assets/logo.svg?v=${assetVersion}" alt="PADEL ON"/><h1>The team.<br/><em>All in one place.</em></h1><p>Weekly padel benefits, special players, and matchmaking revenue—securely tracked together.</p></section><section class="auth-card"><div class="eyebrow">Private club workspace</div><h2>Welcome back</h2><p class="sub">Sign in with your PADEL ON staff account.</p>${!api.configured?'<div class="auth-error">Database not configured. Set the Supabase URL and publishable key in <strong>config.js</strong>, then follow README.md.</div>':''}${message?`<div class="auth-error">${esc(message)}</div>`:''}<form id="login-form">${field('email','Email address','','email','required autocomplete="email"')}${field('password','Password','','password','required autocomplete="current-password"')}<button class="btn btn-primary" ${!api.configured?'disabled':''} type="submit">Sign In ${icon('arrow')}</button></form><div class="auth-foot">Authorized PADEL ON staff only · Protected by Supabase Auth</div></section></main>`;
}
async function loadData(resetTab=false){if(state.loading)return;state.loading=true;try{
 const auth=api.getSession();if(!auth?.access_token)throw Error('Sign in required');
 const profiles=await api.list('staff_profiles',`id=eq.${auth.user.id}`);
 if(!profiles.length){await api.signOut();throw Error('This login has no PADEL ON staff access. Ask the administrator to add your account in Supabase.');}
 state.staff=profiles[0];
 const since=addDays(today(),-30);
 const [members,balances,matches,games,resets,special,specialGames,finance,settlements]=await Promise.all([
  api.listAll('team_members'),api.listAll('initial_balances'),api.listAll('team_matches',`played_on=gte.${since}`),api.listAll('team_games',`played_on=gte.${since}`),api.listAll('reset_events',`week_start=gte.${since}`),api.listAll('other_players'),api.listAll('other_games',`played_on=gte.${since}`),api.listAll('nazih_games'),api.listAll('nazih_settlements')
 ]);
 // Do not redraw private data if this tab was signed out while requests were pending.
 if(!api.getSession()?.access_token || idleLogoutStarted)return;
 Object.assign(state,{members,balances,matches,games,resets,special,specialGames,finance,settlements});
 if(resetTab)state.tab='dashboard'; render(); if(state.tab==='reports'&&!state.reportLoading)void loadReport();
 }catch(e){if((idleLogoutStarted || !api.getSession()?.access_token) && !e.message.includes('no PADEL ON staff access'))return;if(e.message.includes('sign in')||e.message.includes('JWT')||e.message.includes('refresh token')){clearStaffActivity();await api.signOut();renderAuth(e.message)}else if(state.staff){toast(e.message,true)}else renderAuth(e.message)}finally{state.loading=false;}}
let working=false;
async function runMutation(task,success='Saved successfully'){if(working)return;working=true;const b=document.getElementById('save-button');if(b){b.disabled=true;b.textContent='Saving…'}try{await task();state.modal=null;await loadData();toast(success)}catch(e){toast(e?.message||'Could not save. Try again.',true)}finally{working=false;if(b&&b.isConnected){b.disabled=false;b.textContent='Try again'}}}
function slugify(x){return x.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')+'-'+Math.random().toString(36).slice(2,6)}
async function saveForm(form){const f=new FormData(form),data=Object.fromEntries(f.entries()),m=state.modal;
 switch(form.dataset.save){
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
 case 'save-other':await api.rpc('record_other_game',{p_game_id:m.requestId,p_player_id:m.id,p_played_on:data.played_on,p_game_type:data.game_type,p_notes:data.notes||''});break;
 case 'save-finance':{
  const payload={played_on:data.played_on,amount_cents:parseUSD(data.amount),players:data.players?.trim()||'',notes:data.notes?.trim()||'',updated_at:new Date().toISOString()};
  if(m.id)await api.patch('nazih_games',m.id,payload);else await api.insert('nazih_games',{...payload,id:m.requestId,created_by:api.getSession().user.id});
  state.month=monthKey(data.played_on);break;}
 case 'save-member':{
  const name=data.name.trim();if(name.length<2)throw Error('Name is too short.');if(!TEAM_GROUPS.some(([id])=>id===data.team_category))throw Error('Select a valid team category.');const payload={name,weekly_allowance:Number(data.weekly_allowance),team_category:data.team_category,active:data.active==='true',unlimited:data.unlimited==='true'};
  if(m.id)await api.patch('team_members',m.id,payload);else await api.insert('team_members',{...payload,slug:slugify(name)});break;}
 case 'choose-member':state.modal={type:'edit-member',id:data.member_id};render();return 'keep';
 case 'save-other-player':{
  const payload={name:data.name.trim(),current_counter:Number(data.current_counter),status:data.status,threshold:data.threshold?Number(data.threshold):null,active:data.active==='true'};
  if(m.id)await api.patch('other_players',m.id,payload);else await api.insert('other_players',{...payload,slug:slugify(payload.name)});break;}
 case 'save-settlement':{
  const payload={month_key:state.month+'-01',status:data.status,amount_paid_cents:parseUSD(data.amount_paid),paid_on:data.status==='paid'?(data.paid_on||today()):null,notes:data.notes||'',updated_at:new Date().toISOString()};
  await api.request('POST','nazih_settlements?on_conflict=month_key',payload,{headers:{Prefer:'resolution=merge-duplicates,return=representation'}});break;}
 case 'submit-reset':await api.functionCall('reset-weekly',{code:data.code,member_id:m.id||null});break;
 case 'confirm-delete':
  if(m.entity==='finance')await api.patch('nazih_games',m.id,{deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()});
  else await api.rpc('void_team_match',{p_match_id:m.id});break;
 default:throw Error('Unknown form');
 }
}
function exportFinance(){const f=financials();const csv=[['Date','Players','Notes','Collected USD','Commission Share USD'],...f.rows.map(r=>[r.played_on,r.players,r.notes,(r.amount_cents/100).toFixed(2),(commission(r.amount_cents)/100).toFixed(2)]),['TOTAL','','',(f.total/100).toFixed(2),(f.fee/100).toFixed(2)]].map(a=>a.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`padel-on-nazih-${state.month}.csv`;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500)}
async function handleAction(target){const act=target.dataset.action,id=target.dataset.id;
 switch(act){
 case 'refresh':await loadData();if(state.tab==='reports')await loadReport();else if(state.tab==='team'&&state.historyWeek!==weekStart(today()))await loadHistoryWeek(state.historyWeek);toast('Data refreshed');break;
 case 'quick-team':openModal('quick-team',id);break;
 case 'team-prev-week':await loadHistoryWeek(addDays(state.historyWeek,-7));break;
 case 'team-next-week':await loadHistoryWeek(addDays(state.historyWeek,7));break;
 case 'team-current-week':await loadHistoryWeek(weekStart(today()));break;
 case 'report-mode-week':state.reportMode='week';await loadReport();break;
 case 'report-mode-month':state.reportMode='month';await loadReport();break;
 case 'report-prev':
  if(state.reportMode==='week')state.reportWeek=addDays(state.reportWeek,-7);
  else state.reportMonth=shiftMonth(state.reportMonth,-1);
  await loadReport();break;
 case 'report-next':
  if(state.reportMode==='week'&&state.reportWeek<weekStart(today()))state.reportWeek=addDays(state.reportWeek,7);
  else if(state.reportMode==='month'&&state.reportMonth<monthKey(today()))state.reportMonth=shiftMonth(state.reportMonth,1);
  await loadReport();break;
 case 'export-report':exportReport();break;
 case 'print-report':window.print();break;
 case 'record-team':openModal('team',id);break;
 case 'record-other':openModal('other-game',id);break;
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
 case 'signout':{clearStaffActivity();const logout=api.signOut();state.staff=null;state.modal=null;renderAuth();await logout;break;}
 }}
// Delegate events so every newly rendered interactive component works.
document.addEventListener('click',async e=>{
 if(e.target.id==='modal-backdrop'){closeModal();return;}
 const tab=e.target.closest('[data-tab]');if(tab){state.tab=tab.dataset.tab;state.modal=null;render();window.scrollTo({top:0,behavior:'instant'});if(state.tab==='reports')await loadReport();return;}
 const action=e.target.closest('[data-action]');if(action){try{await handleAction(action)}catch(err){toast(err.message,true)}}
});
document.addEventListener('submit',async e=>{
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
 const id=e.target.id;if(id==='team-search'||id==='activity-search'){
  const caret=e.target.selectionStart;const value=e.target.value;
  if(id==='team-search')state.teamSearch=value;else state.activitySearch=value;
  render();const input=document.getElementById(id);input?.focus();input?.setSelectionRange(caret,caret);
 }
});
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
document.addEventListener('change',e=>{if(e.target.classList?.contains('quick-seat')||(e.target.name==='played_on'&&state.modal?.type==='quick-team'))updateQuickPreview();if(e.target.id==='team-sort'){state.teamSort=e.target.value;render()}if(e.target.id==='team-filter'){state.teamFilter=e.target.value;render()}if(e.target.id==='team-category'){state.teamCategoryFilter=e.target.value;render()}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&state.modal)closeModal()});
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
   lastKnownMonth=currentMonth;
 }
 if(api.configured&&api.getSession()&&state.staff&&!state.modal&&!working&&!document.hidden)loadData();
},30000);
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;checkStaffInactivity();if(!idleExpired()&&api.getSession()&&state.staff&&!state.modal)loadData()});
