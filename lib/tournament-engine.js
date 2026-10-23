// Tournament draws, scoring, standings and fee calculation. Pure client logic.
// Supabase independently validates match scores and financial writes.
const assert=(condition,message)=>{if(!condition)throw Error(message)};
const n=x=>Number(x);
const nextPow2=n=>2**Math.ceil(Math.log2(n));
const label=i=>String.fromCharCode(65+i);
export function parseTournamentMoney(value){
 const s=String(value??'').trim();
 if(!/^(?:\d{1,9})(?:\.\d{1,2})?$/.test(s))throw Error('Enter a valid USD amount with at most two decimals.');
 const [whole,dec='']=s.split('.');
 const cents=Number(whole)*100+Number(dec.padEnd(2,'0'));
 if(!Number.isSafeInteger(cents)||cents>100000000)throw Error('Amount is too high.');
 return cents;
}
export function shuffleTournament(items,random=Math.random){
 const out=[...items];
 for(let i=out.length-1;i>0;i--){
  const r=Math.min(0.999999999,Math.max(0,Number(random())));
  const j=Math.floor(r*(i+1));[out[i],out[j]]=[out[j],out[i]];
 }
 return out;
}
export function makeTournamentTeams(rows,feeCents){
 assert(rows.length>=2&&rows.length<=32,'Tournament requires 2–32 teams.');
 const nonempty=new Set();
 return rows.map((r,i)=>{
  const names=[String(r.p1||'').trim(),String(r.p2||'').trim()];
  for(const name of names){
   assert(name.length>=2&&name.length<=100,'Both player names are required for every team (2–100 characters).');
   const key=name.toLocaleLowerCase();
   assert(!nonempty.has(key),'The same participant cannot play on multiple teams: '+name);
   nonempty.add(key);
  }
  return {id:'t'+(i+1),label:String(r.label||'').trim().slice(0,100)||('Team '+(i+1)),
   group:null,members:names.map((name,k)=>({id:'p'+(i*2+k+1),name,due:feeCents,paid:0}))};
 });
}
export function makeGroupDraw(input,random=Math.random){
 const teams=shuffleTournament(input,random);
 const groupCount=Math.max(1,Math.ceil(teams.length/4)),groups=Array.from({length:groupCount},()=>[]);
 teams.forEach((team,i)=>{team.group=label(i%groupCount);groups[i%groupCount].push(team)});
 const matches=[];let ordinal=0;
 for(let g=0;g<groups.length;g++){
  const members=groups[g];
  // Circle method: each team plays at most once per group round.
  // Odd groups receive one bye each round.
  let ring=members.map(t=>t.id);
  if(ring.length%2===1)ring.push(null);
  for(let round=1;round<ring.length;round++){
   for(let i=0;i<ring.length/2;i++){
    const a=ring[i],b=ring[ring.length-1-i];
    if(a&&b)matches.push({
     id:'g'+(++ordinal),phase:'group',group:label(g),round,slot:ordinal,
     a,b,sets:[],winner:null
    });
   }
   ring=[ring[0],ring[ring.length-1],...ring.slice(1,-1)];
  }
 }
 return {teams,matches,knockoutSeeded:false};
}
export function makeKnockoutMatches(seeds){
 assert(seeds.length>=2&&seeds.length<=32,'Knockout needs 2–32 qualifiers.');
 const size=nextPow2(seeds.length),rounds=Math.log2(size),byeCount=size-seeds.length;
 const matches=[];
 let previous=[];
 for(let round=1;round<=rounds;round++){
  const count=size/(2**round),current=[];
  for(let i=0;i<count;i++){
   // Spread every bye into a separate first-round pairing: no empty
   // matches, including with 3, 5, 6, 9, 10, etc. entrants.
   const leftSeed=i<byeCount?i:byeCount+(i-byeCount)*2;
   const rightSeed=i<byeCount?-1:leftSeed+1;
   const a=round===1?seeds[leftSeed]?.id||null:null;
   const b=round===1&&rightSeed>=0?seeds[rightSeed]?.id||null:null;
   const match={id:'k'+round+'-'+(i+1),phase:'knockout',group:null,round,slot:i+1,
    a,b,sets:[],winner:null};
   if(round===1 && !!a!==!!b)match.winner=a||b; // First-round bye.
   current.push(match);matches.push(match);
  }
  if(round>1)for(let i=0;i<previous.length;i++){
   const win=previous[i].winner;
   if(win)current[Math.floor(i/2)][i%2===0?'a':'b']=win;
  }
  previous=current;
 }
 return matches;
}
export function makeInitialTournament(rows,fee,mode,random=Math.random){
 const original=makeTournamentTeams(rows,fee);
 if(mode==='groups')return {...makeGroupDraw(original,random),mode:'groups'};
 if(mode==='knockout'){
  const teams=shuffleTournament(original,random);
  return {teams,matches:makeKnockoutMatches(teams),mode:'knockout',knockoutSeeded:true};
 }
 throw Error('Choose groups with knockout or knockout only.');
}
export function padelSetWinner(set){
 const [a,b,ta,tb]=['a','b','ta','tb'].map(k=>set[k]);
 assert(Number.isInteger(a)&&Number.isInteger(b),'Both teams need whole-game set scores.');
 const valid=(a===6&&b>=0&&b<=4)||(b===6&&a>=0&&a<=4)||
  (a===7&&(b===5||b===6))||(b===7&&(a===5||a===6));
 assert(valid,'Sets end at 6 with a 2-game lead, 7-5, or 7-6 after a tie-break.');
 if((a===7&&b===6)||(b===7&&a===6)){
  assert(Number.isInteger(ta)&&Number.isInteger(tb),'A 7–6 set requires both tie-break scores.');
  const win=a>b?ta:tb,lose=a>b?tb:ta;
  assert(win>=7&&win-lose>=2&&(win===7||win-lose===2),
   'Tie-break must reach at least 7 points with a two-point lead.');
 }else assert(ta===undefined&&tb===undefined,'Tie-break points apply only to 7–6 sets.');
 return a>b?'a':'b';
}
export function padelMatchWinner(sets){
 assert(Array.isArray(sets)&&[2,3].includes(sets.length),'Match requires two or three completed sets.');
 let a=0,b=0;
 sets.forEach((s,i)=>{
  assert(a<2&&b<2,'No sets can be played after a match is won.');
  const side=padelSetWinner(s);if(side==='a')a++;else b++;
 });
 assert(a===2||b===2,'First team to win two sets wins the match.');
 return a===2?'a':'b';
}
export function groupStandings(state,group){
 const members=state.teams.filter(t=>t.group===group);
 const stats=members.map(team=>({team,id:team.id,played:0,wins:0,setsWon:0,setsLost:0,gamesWon:0,gamesLost:0}));
 const lookup=new Map(stats.map(s=>[s.id,s]));
 for(const m of state.matches.filter(m=>m.phase==='group'&&m.group===group&&m.winner)){
  const a=lookup.get(m.a),b=lookup.get(m.b);
  if(!a||!b)continue;
  a.played++;b.played++;
  if(m.winner===a.id)a.wins++;else b.wins++;
  for(const set of m.sets){
   a.gamesWon+=n(set.a);a.gamesLost+=n(set.b);
   b.gamesWon+=n(set.b);b.gamesLost+=n(set.a);
   if(padelSetWinner(set)==='a'){a.setsWon++;b.setsLost++}
   else {b.setsWon++;a.setsLost++}
  }
 }
 return stats.sort((a,b)=>b.wins-a.wins|| (b.setsWon-b.setsLost)-(a.setsWon-a.setsLost)||
  (b.gamesWon-b.gamesLost)-(a.gamesWon-a.gamesLost)||a.team.id.localeCompare(b.team.id,undefined,{numeric:true}));
}
export function getQualifiers(state){
 assert(state.mode==='groups','Group qualifiers are for group-based tournaments.');
 assert(state.matches.filter(m=>m.phase==='group').every(m=>!!m.winner),'Complete group matches first.');
 const letters=[...new Set(state.teams.map(t=>t.group))].sort();
 const rankings=letters.map(g=>groupStandings(state,g));
 let qualifiers=rankings.flatMap(list=>list.slice(0,2));
 let others=rankings.flatMap(list=>list.slice(2));
 const target=Math.min(nextPow2(qualifiers.length),state.teams.length);
 others=others.sort((a,b)=>b.wins/(b.played||1)-a.wins/(a.played||1)||
  (b.setsWon-b.setsLost)/(b.played||1)-(a.setsWon-a.setsLost)/(a.played||1)||
  (b.gamesWon-b.gamesLost)/(b.played||1)-(a.gamesWon-a.gamesLost)/(a.played||1));
 qualifiers=qualifiers.concat(others.slice(0,target-qualifiers.length));
 // Seed better-performing teams against lower-performing teams from a
 // different group where possible, avoiding immediate group-stage rematches.
 const pool=[...qualifiers],draw=[];
 while(pool.length){
  const lead=pool.shift();
  let opponent=-1;
  for(let i=pool.length-1;i>=0;i--){
   if(pool[i].team.group!==lead.team.group){opponent=i;break;}
  }
  if(opponent<0)opponent=pool.length-1;
  draw.push(lead.team,pool.splice(opponent,1)[0].team);
 }
 return draw;
}
export function tournamentTotals(state){
 let due=0,paid=0,remaining=0,overpaid=0;
 for(const team of state.teams)for(const person of team.members){
  const owed=Number(person.due||0),received=Number(person.paid||0);
  due+=owed;paid+=received;remaining+=Math.max(0,owed-received);
  overpaid+=Math.max(0,received-owed);
 }
 return {due,paid,remaining,overpaid};
}
export function completedMatchCount(state){return state.matches.filter(m=>m.winner).length}
export function tournamentChampion(state){
 const finals=state.matches.filter(m=>m.phase==='knockout').sort((a,b)=>b.round-a.round||a.slot-b.slot);
 return finals[0]?.winner||null;
}
