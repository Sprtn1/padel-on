// Regression-test real Special Benefit modal HTML at desktop and mobile sizes.
// Uses synthetic data only and reads app templates plus real styles.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const app=readFileSync(join(root,'app.js'),'utf8');
const bootstrap=readFileSync(join(root,'bootstrap.js'),'utf8');
const list=bootstrap.match(/for\s*\(const path of \[([\s\S]*?)\]\)/);
assert.ok(list);
const cssPaths=[...list[1].matchAll(/'(\.\/[^']+\.css)'/g)].map(m=>m[1]);
const a=app.indexOf(" case 'edit-other':{"),b=app.indexOf(" case 'settlement':{",a);
assert.ok(a>=0&&b>a);
const fieldStart=app.indexOf('function field('),fieldEnd=app.indexOf('function textareaField(',fieldStart);
const actionStart=app.indexOf('function formActions('),actionEnd=app.indexOf('function openModal(',actionStart);
assert.ok(fieldStart>=0&&fieldEnd>fieldStart&&actionStart>=0&&actionEnd>actionStart);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const btn=(label,action,cls)=>`<button type="button" class="btn ${cls}" data-action="${action}">${label}</button>`;
const {field,selectField,formActions}=new Function('esc','btn',app.slice(fieldStart,fieldEnd)+app.slice(actionStart,actionEnd)+'return {field,selectField,formActions};')(esc,btn);
const rules=[['one_free_per_week','Weekly free'],['alternating_free_paid','Alternating'],['counting','Counting'],['next_free','Free ready'],['needs_confirmation','Review'],['rule_not_configured','Unconfigured']];
const render=player=>new Function('state','m','field','selectField','formActions','OTHER_RULES',
 `let title='',subtitle='',content='';switch('edit-other'){${app.slice(a,b)}}return {title,subtitle,content};`
)({special:player?[player]:[]},{id:player?.id||null},field,selectField,formActions,rules);
const browser=await chromium.launch({headless:true});
mkdirSync(join(root,'theme-contrast-artifacts'),{recursive:true});
try{
 for(const width of [390,1366]){
  for(const [scenario,player] of [
   ['counting',{id:'example',name:'Example Player',active:true,status:'counting',current_counter:0,threshold:5}],
   ['earned',{id:'example',name:'Example Player',active:true,status:'next_free',current_counter:5,threshold:5}],
   ['new',null]
  ]){
   const page=await browser.newPage({viewport:{width,height:width===390?667:768}});
   const {title,subtitle,content}=render(player);
   const markup=`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div class="modal-backdrop" id="modal-backdrop"><div class="modal ob-edit-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><div><h2>${esc(title)}</h2><p>${esc(subtitle)}</p></div><button class="modal-close">×</button></div><div class="modal-body">${content}</div></div></div></body></html>`;
   await page.setContent(markup);
   for(const path of cssPaths)await page.addStyleTag({content:readFileSync(join(root,path),'utf8').replace(/@import\s+url\([^;]+;/g,'')});
   const result=await page.evaluate(()=>{
    const modal=document.querySelector('.ob-edit-modal');
    const body=modal.querySelector('.modal-body'),form=modal.querySelector('#modal-form');
    const keys=['name','status','current_counter','threshold','active'];
    const missing=keys.filter(k=>!form?.elements.namedItem(k));
    const threshold=modal.querySelector('[name="threshold"]'),counter=modal.querySelector('[name="current_counter"]');
    const footer=modal.querySelector('.modal-actions'),status=modal.querySelector('[name="active"]');
    const before=modal.getBoundingClientRect();
    body.scrollTop=body.scrollHeight;
    const bounds=modal.getBoundingClientRect(),footRect=footer.getBoundingClientRect(),statusRect=status.getBoundingClientRect();
    return {missing,forms:document.querySelectorAll('form').length,
      allInside:form?.contains(footer)&&form?.contains(status)&&form?.contains(threshold),
      inModalBody:form?.parentElement===body,
      maxCounter:counter?.max,maxThreshold:threshold?.max,
      scrollMode:getComputedStyle(body).overflowY,top:before.top,bottom:before.bottom,height:window.innerHeight,
      footerInside:footRect.top>=bounds.top-2&&footRect.bottom<=bounds.bottom+2,
      statusInside:statusRect.top>=bounds.top-2&&statusRect.bottom<=bounds.bottom+2};
   });
   assert.deepEqual(result.missing,[],`${scenario} ${width}px: missing form controls`);
   assert.equal(result.forms,1,'Form markup must not split or detach');
   assert.equal(result.allInside,true,'Inputs and footer must stay within the form');
   assert.equal(result.inModalBody,true,'Form must stay within the modal body');
   assert.equal(result.maxCounter,'1000000');
   assert.equal(result.maxThreshold,'100');
   assert.equal(result.scrollMode,'auto');
   assert.ok(result.top>=-1&&result.bottom<=result.height+1,`Dialog exceeds viewport: ${JSON.stringify(result)}`);
   assert.equal(result.footerInside,true,'Actions escape dialog');
   assert.equal(result.statusInside,true,'Status field escapes dialog');
   if(scenario==='counting')await page.screenshot({path:join(root,'theme-contrast-artifacts',`other-benefits-modal-${width}.png`)});
   console.log(`Other Benefits modal OK: ${scenario}, ${width}px`);
   await page.close();
  }
 }
}finally{await browser.close()}
