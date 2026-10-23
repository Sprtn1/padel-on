// Positions a single-elimination padel bracket from left to right.
// Round 1 starts on the left; the Final is the rightmost column.
// Geometry and connecting paths share one coordinate system, so a final
// remains centered between its two semifinal feeders at any bracket size.
export function knockoutBracketLayout(matches,{cardWidth=230,columnGap=82,matchPitch=182,headerHeight=74}={}){
 const games=matches.filter(m=>m.phase==='knockout');
 if(!games.length)return {width:0,height:0,rounds:[],nodes:[],links:[],cardWidth,columnGap,matchPitch};
 const maxRound=Math.max(...games.map(m=>Number(m.round)));
 if(!Number.isInteger(maxRound)||maxRound<1||maxRound>7)
  throw Error('Unsupported knockout round count.');
 const lookup=new Map();
 const nodes=[];
 for(const m of games){
  const round=Number(m.round),slot=Number(m.slot);
  if(!Number.isInteger(round)||round<1||round>maxRound||
     !Number.isInteger(slot)||slot<1||slot>2**(maxRound-round))
   throw Error('Invalid knockout match position.');
  const key=round+':'+slot;
  if(lookup.has(key))throw Error('Duplicate knockout match position.');
  const item={
   match:m,round,slot,x:(round-1)*(cardWidth+columnGap),
   y:headerHeight+(slot-.5)*2**(round-1)*matchPitch
  };
  lookup.set(key,item);nodes.push(item);
 }
 for(let round=1;round<=maxRound;round++)
  for(let slot=1;slot<=2**(maxRound-round);slot++)
   if(!lookup.has(round+':'+slot))throw Error('Incomplete knockout bracket.');
 const links=[];
 for(const node of nodes){
  if(node.round===maxRound)continue;
  const parent=lookup.get(node.round+1+':'+Math.ceil(node.slot/2));
  const branch=node.slot%2?'A':'B';
  // A directly seeded semifinalist/finalist owns this side of the match.
  // Do not connect an unused feeder through that reserved branch.
  if(parent.match['seed'+branch])continue;
  const m=node.match,empty=m.possibleA!==undefined&&
   Number(m.possibleA||0)+Number(m.possibleB||0)===0;
  if(empty)continue;
  const fromX=node.x+cardWidth,toX=parent.x,midX=(fromX+toX)/2;
  links.push({
   from:m.id,to:parent.match.id,
   d:'M '+fromX+' '+node.y+' H '+midX+' V '+parent.y+' H '+toX
  });
 }
 return {
  width:maxRound*cardWidth+(maxRound-1)*columnGap,
  height:Math.max(230,headerHeight+2**(maxRound-1)*matchPitch+50),
  rounds:Array.from({length:maxRound},(_,i)=>i+1),
  nodes,links,cardWidth,columnGap,matchPitch,headerHeight
 };
}
