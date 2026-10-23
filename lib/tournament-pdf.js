import {pdfFromCanvasPages} from './arabic-daily-pdf.js';
import {groupStandings,tournamentTotals,tournamentChampion,padelSetWinner} from './tournament-engine.js';
// Browser-only archive. Generates a full, printable multi-page PDF in memory;
// does not call Supabase Storage, upload APIs or external PDF services.
export function tournamentArchivePdf(tournament){
 const state=tournament.state,teams=state.teams,matches=state.matches;
 const labels=new Map(teams.map(t=>[t.id,t.label+' ('+t.members.map(p=>p.name).join(' / ')+')']));
 const money=cents=>'$'+(Number(cents||0)/100).toFixed(2);
 const pages=[];
 const width=1200,height=1553;
 let canvas,ctx,y;
 function page(){
  canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF rendering is not supported in this browser.');
  ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
  ctx.fillStyle='#155c3b';ctx.fillRect(0,0,width,14);
  ctx.fillStyle='#142b20';ctx.font='bold 38px Arial,sans-serif';ctx.fillText('PADEL ON | TOURNAMENT ARCHIVE',70,88);
  ctx.strokeStyle='#c8dfd1';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(70,112);ctx.lineTo(1130,112);ctx.stroke();
  y=155;pages.push(canvas);
 }
 function write(value,style='normal'){
  const heading=style==='heading',sub=style==='sub';
  const fontSize=heading?27:sub?21:18;
  const step=heading?43:sub?33:28;
  ctx.font=(heading||sub?'bold ':'')+fontSize+'px Arial,sans-serif';
  let words=String(value??'').split(/\s+/).filter(Boolean),lines=[],line='';
  for(const word of words){
   const next=line?line+' '+word:word;
   if(ctx.measureText(next).width>1050&&line){lines.push(line);line=word;}
   else line=next;
  }
  if(line)lines.push(line);
  if(!lines.length)lines=[' '];
  if(y+step*lines.length>height-105){page();ctx.font=(heading||sub?'bold ':'')+fontSize+'px Arial,sans-serif';}
  ctx.fillStyle=heading?'#196c43':sub?'#183f2a':'#263a2d';
  for(const line of lines){ctx.fillText(line,70,y);y+=step;}
  if(heading)y+=9;
 }
 function spacer(){y+=12;if(y>height-100)page();}
 page();
 write(tournament.name,'heading');
 write('Date: '+tournament.event_date+'   Start: '+String(tournament.start_time).slice(0,5)+' (Beirut)');
 write('Format: '+(tournament.format==='groups'?'Group Stage + Knockout':'Knockout Only'));
 write('Participation fee per player: '+money(tournament.fee_cents));
 write('Teams: '+teams.length+'   Participants: '+teams.length*2);
 const totals=tournamentTotals(state);
 write('Total due: '+money(totals.due)+'   Total paid: '+money(totals.paid)+'   Remaining: '+money(totals.remaining),'sub');
 if(totals.overpaid)write('Overpayments after fee adjustments: '+money(totals.overpaid));
 spacer();
 write('TEAMS AND PARTICIPANTS','heading');
 for(const t of teams){
  write(t.label+(t.group?' - Group '+t.group:''),'sub');
  for(const p of t.members){
   write('  '+p.name+' | Due '+money(p.due)+' | Paid '+money(p.paid)+' | Remaining '+money(Math.max(0,p.due-p.paid))+
    (p.paid>p.due?' | Overpaid '+money(p.paid-p.due):''));
  }
 }
 spacer();
 const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))].sort();
 if(groups.length){
  write('GROUP STANDINGS','heading');
  for(const g of groups){
   write('Group '+g,'sub');
   for(const s of groupStandings(state,g)){
    write(s.team.label+' | W '+s.wins+' / Played '+s.played+' | Sets '+s.setsWon+':'+s.setsLost+' | Games '+s.gamesWon+':'+s.gamesLost);
   }
  }
 }
 spacer();
 write('ALL MATCHES AND SCORES','heading');
 for(const phase of ['group','knockout']){
  const phaseMatches=matches.filter(m=>m.phase===phase).sort((a,b)=>a.round-b.round||a.slot-b.slot);
  if(!phaseMatches.length)continue;
  write(phase==='group'?'GROUP STAGE':'KNOCKOUT BRACKET','sub');
  let lastRound='';
  for(const m of phaseMatches){
   const headingText=phase==='group'?'Group '+m.group+' - Round '+m.round:'Knockout Round '+m.round;
   if(lastRound!==headingText){write(headingText,'sub');lastRound=headingText}
   const left=labels.get(m.a)||'TBD',right=labels.get(m.b)||'BYE / TBD';
   write('Match '+m.id+': '+left+'  vs  '+right);
   if(m.sets?.length)write('  Sets: '+m.sets.map(s=>s.a+'-'+s.b+(s.ta!==undefined?' (TB '+s.ta+'-'+s.tb+')':'')).join(' / '));
   write('  Winner: '+(labels.get(m.winner)||(m.winner?'Team '+m.winner:'Not played')));
  }
 }
 const champion=tournamentChampion(state);
 if(champion){spacer();write('CHAMPIONS: '+(labels.get(champion)||champion),'heading');}
 spacer();write('Exported by PADEL ON on '+new Date().toISOString().slice(0,10)+' | Local PDF archive');
 const total=pages.length;
 pages.forEach((p,i)=>{
  const c=p.getContext('2d');
  c.font='16px Arial,sans-serif';c.fillStyle='#7a9382';
  c.fillText('PADEL ON | '+tournament.name+' | Page '+(i+1)+' / '+total,70,height-48);
 });
 return {pdf:pdfFromCanvasPages(pages),pages:total};
}
export function downloadTournamentPdf(pdf,tournament){
 if(!(pdf instanceof Blob)||pdf.type!=='application/pdf')throw Error('No archive PDF generated.');
 const safe=String(tournament.name).replace(/[^a-z\d-_]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,55)||'tournament';
 const name='padel-on-'+safe+'-'+tournament.event_date+'.pdf';
 const uri=URL.createObjectURL(pdf),link=document.createElement('a');
 link.href=uri;link.download=name;document.body.append(link);link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(uri),30000);
 return name;
}
