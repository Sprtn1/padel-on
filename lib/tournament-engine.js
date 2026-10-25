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
// The two participant names are the team name. Derive it for older
// tournaments too, whose saved labels may still say "Team 1".
export function tournamentTeamName(team){
 const names=Array.isArray(team?.members)?team.members.map(p=>String(p?.name||'').trim()):[];
 if(names.length===2&&names.every(Boolean))return names.join(' & ');
 return String(team?.label||'').trim()||'TBD';
}
// Team Player tournament fees are calculated per PAIR, in whole cents:
// 0 checked = both pay full; 1 checked = checked player pays 0;
// 2 checked = each pays half (one cent goes to player 2 if fee is odd).
export function tournamentTeamPlayerDues(feeCents,firstTeamPlayer=false,secondTeamPlayer=false){
 assert(Number.isSafeInteger(feeCents)&&feeCents>=0&&feeCents<=100000000,'Invalid participation fee.');
 assert(typeof firstTeamPlayer==='boolean'&&typeof secondTeamPlayer==='boolean','Team Player must be a checkbox.');
 if(firstTeamPlayer&&secondTeamPlayer){
  const first=Math.floor(feeCents/2);
  return [first,feeCents-first];
 }
 return [firstTeamPlayer?0:feeCents,secondTeamPlayer?0:feeCents];
}
export function makeTournamentTeams(rows,feeCents){
 assert(rows.length>=2&&rows.length<=32,'Tournament requires 2–32 teams.');
 return rows.map((r,i)=>{
  const names=[String(r.p1||'').trim(),String(r.p2||'').trim()];
  for(const name of names)
   assert(name.length>=2&&name.length<=100,'Both player names are required for every team (2–100 characters).');
  const flags=[r.teamPlayer1??false,r.teamPlayer2??false];
  const dues=tournamentTeamPlayerDues(feeCents,...flags);
  // Two different people can legitimately share the same name. Member IDs,
  // not display names, are used for score and payment accounting.
  return {id:'t'+(i+1),label:names.join(' & '),
   group:null,members:names.map((name,k)=>({
    id:'p'+(i*2+k+1),name,due:dues[k],paid:0,teamPlayer:flags[k]
   }))};
 });
}
export function makeGroupDraw(input,random=Math.random){
 const teams=shuffleTournament(input,random);
 const groupCount=teams.length===5?1:Math.max(1,Math.ceil(teams.length/4)),groups=Array.from({length:groupCount},()=>[]);
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

const STAGES=Object.freeze({final:0,semifinal:1,quarterfinal:2});
export function knockoutSeedEntrants(state){
 const ids=Array.isArray(state.knockoutEntrants)?state.knockoutEntrants:
  [...new Set([
   ...state.matches.filter(m=>m.phase==='knockout'&&m.round===1).flatMap(m=>[m.a,m.b]),
   ...(state.seedPlacements||[]).map(p=>p.team)
  ].filter(Boolean))];
 const lookup=new Map(state.teams.map(t=>[t.id,t]));
 const found=ids.map(id=>lookup.get(id));
 assert(found.length>=2&&found.length<=32&&found.every(Boolean),'Knockout entrants are missing or invalid.');
 assert(new Set(ids).size===ids.length,'Knockout entrants must be unique.');
 return found;
}
export function tournamentSeedRounds(count){
 assert(Number.isInteger(count)&&count>=2&&count<=32,'Invalid knockout team count.');
 return Math.max(2,Math.ceil(Math.log2(count)));
}
export function makeSeededKnockoutMatches(entrants,placements=[]){
 assert(Array.isArray(entrants)&&entrants.length>=2&&entrants.length<=32,'Knockout must have 2–32 qualified teams.');
 assert(Array.isArray(placements)&&placements.length<=entrants.length,'Too many seeded teams.');
 const ids=new Set(entrants.map(t=>t.id)),seeds=new Set();
 assert(ids.size===entrants.length,'A team appears more than once in the knockout entrants.');
 for(const p of placements){
  assert(ids.has(p.team)&&!seeds.has(p.team),'Seeded team is missing or seeded more than once.');
  assert(Object.hasOwn(STAGES,p.stage),'Choose Final, Semifinals, or Quarterfinals.');
  assert(Number.isInteger(p.slot)&&p.slot>=1&&p.slot<=2**STAGES[p.stage],'Invalid bracket slot.');
  assert(['a','b'].includes(p.side),'Choose the left or right team position.');
  seeds.add(p.team);
 }
 let rounds=Math.max(2,Math.ceil(Math.log2(entrants.length)));
 let reserved=null;
 for(;rounds<=7;rounds++){
  if(placements.some(p=>rounds<STAGES[p.stage]+2))continue;
  const count=2**rounds,mask=Array(count).fill(null);let valid=true;
  for(const p of placements){
   const fromFinal=STAGES[p.stage],round=rounds-fromFinal;
   const chunk=2**(round-1),start=(p.slot-1)*chunk*2+(p.side==='a'?0:chunk);
   for(let i=start;i<start+chunk;i++){
    if(mask[i]!==null)valid=false;
    mask[i]=p.team;
   }
  }
  const free=mask.filter(x=>x===null).length;
  if(valid&&free>=entrants.length-placements.length){reserved=mask;break;}
 }
 assert(reserved,'These seeds would overlap or leave insufficient room. Remove a seed or change the bracket slot.');
 const size=reserved.length,slots=Array(size).fill(null);
 // Spread unseeded entrants through the available branches to keep byes fair.
 const free=Array.from({length:size},(_,i)=>i).filter(i=>reserved[i]===null);
 const bits=rounds,bitReverse=i=>{let result=0;for(let j=0;j<bits;j++){result=result*2+(i&1);i>>=1;}return result};
 free.sort((a,b)=>bitReverse(a)-bitReverse(b));
 const unseeded=entrants.filter(t=>!seeds.has(t.id));
 unseeded.forEach((t,i)=>{slots[free[i]]=t.id});
 const byNode=new Map();
 for(const p of placements){
  const round=rounds-STAGES[p.stage];
  byNode.set(round+':'+p.slot+':'+p.side,p.team);
 }
 const matches=[];let previous=[];
 for(let round=1;round<=rounds;round++){
  const current=[],total=size/(2**round);
  for(let i=0;i<total;i++){
   const slot=i+1;
   const left=previous[i*2],right=previous[i*2+1];
   const seedA=byNode.get(round+':'+slot+':a')||null;
   const seedB=byNode.get(round+':'+slot+':b')||null;
   const a=seedA||(round===1?slots[i*2]||null:left?.winner||null);
   const b=seedB||(round===1?slots[i*2+1]||null:right?.winner||null);
   const possibleA=seedA?1:round===1?(a?1:0):(left.possibleA+left.possibleB);
   const possibleB=seedB?1:round===1?(b?1:0):(right.possibleA+right.possibleB);
   const winner=possibleA>0&&possibleB===0?a:
    possibleB>0&&possibleA===0?b:null;
   const node={id:'k'+round+'-'+slot,phase:'knockout',group:null,round,slot,
    a,b,sets:[],winner,seedA,seedB,possibleA,possibleB};
   matches.push(node);current.push(node);
  }
  previous=current;
 }
 return matches;
}
export function reseedTournamentKnockout(state,placements){
 assert(state.matches.some(m=>m.phase==='knockout'),'Generate the knockout draw first.');
 assert(!state.matches.some(m=>m.phase==='knockout'&&m.sets?.length),
  'Seeding is locked once a knockout match has a recorded score.');
 const entrants=knockoutSeedEntrants(state);
 const previouslyScheduled=new Map(state.matches.filter(m=>m.phase==='knockout'&&m.scheduledTime)
  .map(m=>[m.id,m.scheduledTime]));
 const rebuilt=makeSeededKnockoutMatches(entrants,placements).map(m=>{
  const time=previouslyScheduled.get(m.id);
  return time&&Number(m.possibleA||0)>0&&Number(m.possibleB||0)>0?
   {...m,scheduledTime:time}:m;
 });
 return {...state,knockoutEntrants:entrants.map(t=>t.id),
  seedPlacements:placements.map(x=>({...x})),
  matches:[...state.matches.filter(m=>m.phase!=='knockout'),...rebuilt]};
}

// Editing team count before play preserves existing dues, payments and IDs.
// Only new teams get fresh IDs and the tournament's default participation fee.
export function tournamentCanResize(state){
 return !state.matches.some(m=>Array.isArray(m.sets)&&m.sets.length>0) &&
  !(state.mode==='groups'&&state.matches.some(m=>m.phase==='knockout')) &&
  !(Array.isArray(state.seedPlacements)&&state.seedPlacements.length>0);
}
export function resizeTournamentDraw(state,feeCents,teamRows,random=Math.random){
 assert(tournamentCanResize(state),'Teams cannot be changed after matches or knockout seeding.');
 assert(teamRows.length>=2&&teamRows.length<=32,'Tournament must have 2–32 teams.');
 const existing=new Map(state.teams.map(t=>[t.id,t]));
 const retained=new Set(),teamIds=new Set(),memberIds=new Set();
 let nextTeam=Math.max(0,...state.teams.map(t=>Number(t.id.slice(1))||0));
 let nextPlayer=Math.max(0,...state.teams.flatMap(t=>t.members.map(p=>Number(p.id.slice(1))||0)));
 const teams=teamRows.map(row=>{
  const old=row.id?existing.get(row.id):null;
  if(row.id&&!old)throw Error('Team no longer belongs to this tournament.');
  if(old){
   assert(!retained.has(old.id),'A team is duplicated in the team list.');
   retained.add(old.id);
   return {...old,members:old.members.map(p=>({...p})),group:null};
  }
  const names=[String(row.p1||'').trim(),String(row.p2||'').trim()];
  for(const name of names)
   assert(name.length>=2&&name.length<=100,'Enter both new player names (2–100 characters).');
  const id='t'+(++nextTeam);
  return {id,label:'Team '+id.slice(1),group:null,
   members:names.map(name=>({id:'p'+(++nextPlayer),name,due:feeCents,paid:0}))};
 });
 for(const old of state.teams){
  if(!retained.has(old.id))
   assert(old.members.every(p=>Number(p.paid||0)===0),
    'Cannot remove a team with payments. Refund or correct the payments first.');
 }
 const ids=teams.map(t=>t.id);
 assert(ids.length===new Set(ids).size,'A team appears more than once.');
 const newState=state.mode==='groups'
  ?{...makeGroupDraw(teams,random),mode:'groups'}
  :{teams:shuffleTournament(teams,random),matches:[],mode:'knockout',knockoutSeeded:true};
 if(state.mode==='knockout')newState.matches=makeKnockoutMatches(newState.teams);
 assert(['groups','knockout'].includes(state.mode),'Invalid tournament format.');
 return newState;
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
 // A five-team round robin qualifies four teams: 1st vs 4th, 2nd vs 3rd.
 // It is a special case because the four teams share a single group.
 if(state.teams.length===5&&
   state.teams.every(t=>t.group===state.teams[0].group)){
  const ranked=groupStandings(state,state.teams[0].group);
  assert(ranked.length===5,'Five-team group is incomplete.');
  return [ranked[0].team,ranked[3].team,ranked[1].team,ranked[2].team];
 }
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
