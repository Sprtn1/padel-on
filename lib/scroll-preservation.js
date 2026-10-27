// Retain window position plus independently scrolling tables during redraws.
export const SCROLL_CONTAINER_SELECTOR=[
 '.data-table-wrap','.tm-table-scroll','.tm-bracket-scroll','.tm-bracket',
 '.tm-selector','.private-client-list','.debt-people-list',
 '.cafe-auto-payments-wrap','.mobile-nav-scroll','.cafe-quick-sheet',
 '.global-search-results','.modal','[data-preserve-scroll]'
].join(',');

function signature(node){
 const named=node.getAttribute?.('data-preserve-scroll');
 if(named)return 'key:'+named;
 if(node.id)return 'id:'+node.id;
 return 'class:'+node.tagName+':'+String(node.className||'').trim().split(/\s+/).sort().join(' ');
}
function keyedContainers(root){
 const seen=new Map();
 return Array.from(root.querySelectorAll(SCROLL_CONTAINER_SELECTOR),element=>{
  const base=signature(element),index=seen.get(base)||0;
  seen.set(base,index+1);
  return {element,key:base+'#'+index};
 });
}
export function captureScrollPosition(root,viewport){
 const containers=keyedContainers(root)
  .filter(({element})=>element.scrollTop!==0||element.scrollLeft!==0)
  .map(({element,key})=>({key,top:element.scrollTop,left:element.scrollLeft}));
 return {x:viewport.scrollX||0,y:viewport.scrollY||0,containers};
}
export function restoreScrollPosition(root,viewport,snapshot){
 if(!snapshot)return;
 const positions=new Map(snapshot.containers.map(({key,top,left})=>[key,{top,left}]));
 for(const {element,key} of keyedContainers(root)){
  const saved=positions.get(key);
  if(saved){element.scrollTop=saved.top;element.scrollLeft=saved.left;}
 }
 if(snapshot.x||snapshot.y)
  viewport.scrollTo({left:snapshot.x,top:snapshot.y,behavior:'instant'});
}
