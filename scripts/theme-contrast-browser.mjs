// Privacy-safe computed-style audit of representative PADEL ON page markup.
// Uses all REAL site styles in bootstrap order. Does not authenticate or write data.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const bootstrap=readFileSync(join(root,'bootstrap.js'),'utf8');
const list=bootstrap.match(/for\s*\(const path of \[([\s\S]*?)\]\)/);
assert.ok(list,'Dynamic stylesheet declaration not found');
const cssPaths=[...list[1].matchAll(/'(\.\/[^']+\.css)'/g)].map(match=>match[1]);
assert.ok(cssPaths.includes('./styles/theme-contrast-fixes.css'),'Contrast overrides must be loaded');
assert.ok(cssPaths.indexOf('./styles/theme-contrast-fixes.css')<cssPaths.indexOf('./styles/sidebar-forest-fixed.css'),'Sidebar identity stylesheet must override both themes');
assert.equal(cssPaths.at(-1),'./styles/sidebar-forest-fixed.css','Brand navigation colors must load LAST');
const fixture=readFileSync(join(root,'tests/theme-contrast-fixture.html'),'utf8');
const screenshotDir=join(root,'theme-contrast-artifacts');
mkdirSync(screenshotDir,{recursive:true});

const tests=[
 ['topbar',4.5],['overview-heading',4.5],['overview-total',4.5],['overview-label',3],
 ['overview-alert',3],['scheduler-heading',4.5],
 ['timetable-hour',4.5],['booking-title',4.5],
 ['ledger-heading',4.5],['ledger-subtitle',3.3],['ledger-date',4.5],
 ['finance-label',3.3],['finance-total',4.5],['finance-fold',4.5],
 ['court-amount',4.5],['finance-input',4.5],['finance-rate',4.5],
 ['wish-balance',4.5],['wish-item',4.5],['shift-total',4.5],
 ['payments-title',4.5],['payments-amount',4.5],['debts-name',4.5],['debts-total',4.5],
 ['inventory-title',4.5],['inventory-input',4.5],['private-name',4.5],
 ['private-balance',4.5],['team-title',4.5],
 ['benefit-title',4.5],['benefit-number',4.5],['matchmaker-tab',4.5],
 ['tournament-title',4.5],['tournament-fixture',4.5],['activity-text',4.5],
 ['reports-title',4.5],['settings-title',4.5],['settings-input',4.5],
 ['order-title',4.5],['reem-title',4.5]
];

const browser=await chromium.launch({headless:true});
const failures=[];
try{
 for(const width of [390,1366]){
  const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
  await page.setContent(fixture,{waitUntil:'domcontentloaded'});
  for(const path of cssPaths){
   const css=readFileSync(join(root,path),'utf8').replace(/@import\s+url\([^;]+;/g,'');
   await page.addStyleTag({content:css});
  }
  const originals=new Map();
  for(const theme of ['light','dark','light']){
   await page.evaluate(theme=>{
    document.documentElement.setAttribute('data-theme',theme);
    document.documentElement.style.colorScheme=theme;
   },theme);
   // Existing rows animate background changes over ~0.15s; inspect settled colors.
   await page.waitForTimeout(270);
   const values=await page.evaluate(ids=>{
    const rgba=s=>{
     const match=s.match(/rgba?\(([^)]+)\)/);
     if(!match)return [0,0,0,0];
     const a=match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
     return [a[0],a[1],a[2],a.length>3?a[3]:1];
    };
    const blend=(front,behind)=>{
     const a=front[3]+behind[3]*(1-front[3]);
     return a===0?[255,255,255,0]:[
      (front[0]*front[3]+behind[0]*behind[3]*(1-front[3]))/a,
      (front[1]*front[3]+behind[1]*behind[3]*(1-front[3]))/a,
      (front[2]*front[3]+behind[2]*behind[3]*(1-front[3]))/a,a
     ];
    };
    const luminance=rgb=>{
     const values=rgb.slice(0,3).map(v=>{
      const c=v/255;
      return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
     });
     return .2126*values[0]+.7152*values[1]+.0722*values[2];
    };
    const effectiveBg=el=>{
     let output=[255,255,255,0],node=el;
     while(node){
      output=blend(output,rgba(getComputedStyle(node).backgroundColor));
      if(output[3]>.999)break;
      node=node.parentElement;
     }
     return blend(output,[255,255,255,1]);
    };
    const data={};
    for(const id of ids){
     const el=document.querySelector('[data-audit="'+id+'"]');
     if(!el){data[id]={error:'missing'};continue;}
     const style=getComputedStyle(el);
     const fore=rgba(style.color),bg=effectiveBg(el);
     const light=luminance(fore),dark=luminance(bg);
     const ratio=(Math.max(light,dark)+.05)/(Math.min(light,dark)+.05);
     data[id]={foreground:style.color,background:style.backgroundColor,backdrop:bg.slice(0,3),contrast:ratio,
      bgLuminance:dark,text:el.textContent.trim().slice(0,45)};
    }
    for(const id of ['ledger','none']){
     if(id==='none')continue;
     const el=document.querySelector('[data-audit-box="'+id+'"]');
     data[id+'-box']={background:getComputedStyle(el).backgroundColor,bgLuminance:luminance(effectiveBg(el))};
    }
    return data;
   },tests.map(([id])=>id));
   // Navigation is a fixed brand surface and must not change with the dashboard theme.
   const nav=await page.evaluate(mobile=>{
    const panel=document.querySelector(mobile?'.mobile-drawer-panel':'.sidebar-panel');
    const active=document.querySelector(mobile?'.mobile-drawer-links .nav-item.active':'.sidebar .nav-item.active');
    const heading=document.querySelector(mobile?'.mobile-drawer-links .po-nav-heading':'.sidebar .po-nav-heading');
    return {panel:getComputedStyle(panel).backgroundColor,
      active:getComputedStyle(active).backgroundColor,
      text:getComputedStyle(heading).color};
   },width===390);
   if(nav.panel!=='rgb(21, 36, 29)')
    failures.push({width,theme,component:'navigation',error:'Sidebar color must match screenshot #15241D',actual:nav.panel});
   if(nav.active!=='rgb(49, 76, 60)')
    failures.push({width,theme,component:'active navigation',error:'Active item must remain #314C3C',actual:nav.active});
   for(const [id,min] of tests){
    const value=values[id];
    if(value.error||value.contrast<min){
     failures.push({width,theme,id,required:min,...value});
    }
   }
   // Explicit cross-theme regression for the user's three reported controls.
   for(const [id,maxDark,minLight] of [['timetable-hour',.2,.65],['court-amount',.2,.65],['ledger-box',.2,.65]]){
    const v=values[id];
    if(theme==='dark'&&v.bgLuminance>maxDark)failures.push({width,theme,id,error:'Background remained light',...v});
    if(theme==='light'&&v.bgLuminance<minLight)failures.push({width,theme,id,error:'Background remained dark',...v});
   }
   if(theme==='light'&&originals.size===0){
    for(const [id] of tests)originals.set(id,values[id].foreground+'|'+values[id].backdrop.join(','));
   }else if(theme==='light'){
    for(const [id] of tests){
     const current=values[id].foreground+'|'+values[id].backdrop.join(',');
     if(current!==originals.get(id))failures.push({width,theme,id,error:'Light mode did not return to its original style'});
    }
   }
   const label=width===390?'mobile':'desktop';
   if(theme==='dark'){
    if(width===1366)await page.locator('.sidebar-panel').screenshot({path:join(screenshotDir,'sidebar-desktop-dark.png')});
    if(width===390){
     await page.locator('#mobile-drawer').evaluate(el=>el.classList.add('is-open'));
     await page.locator('.mobile-drawer-panel').screenshot({path:join(screenshotDir,'sidebar-mobile-dark.png')});
     await page.locator('#mobile-drawer').evaluate(el=>el.classList.remove('is-open'));
    }
   }
   if(theme==='dark'){
    await page.locator('[data-page="cafeteria-finances"]').screenshot({path:join(screenshotDir,label+'-finances-dark.png')});
    await page.locator('[data-page="court-timetable"]').screenshot({path:join(screenshotDir,label+'-timetable-dark.png')});
   }
   if(theme==='light'&&originals.size===tests.length){
    await page.locator('[data-page="cafeteria-finances"]').screenshot({path:join(screenshotDir,label+'-finances-light.png')});
   }
   console.log(label,theme,'samples',tests.length,'hour',values['timetable-hour'].contrast.toFixed(2),
    'daily-ledger',values['ledger-heading'].contrast.toFixed(2),
    'court-total',values['court-amount'].contrast.toFixed(2));
  }
  await page.close();
 }
}finally{await browser.close();}
if(failures.length){
 console.error('CONTRAST AUDIT FAILED:\n'+JSON.stringify(failures,null,2));
 process.exitCode=1;
}else{
 console.log('PASS: 40 representative text/number controls in light, dark, and restored-light modes at 390 and 1366px.');
}
