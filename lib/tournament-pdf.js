import {pdfFromCanvasPages} from './arabic-daily-pdf.js';
import {groupStandings,tournamentTotals,tournamentChampion,padelSetWinner,tournamentTeamName} from './tournament-engine.js';
// Browser-only archive. Generates a full, printable multi-page PDF in memory;
// does not call Supabase Storage, upload APIs or external PDF services.
export function tournamentArchivePdf(tournament){
 const state=tournament.state,teams=state.teams,matches=state.matches;
 const teamMap=new Map(teams.map(t=>[t.id,t]));
 const teamLabel=id=>teamMap.has(id)?tournamentTeamName(teamMap.get(id)):'TBD';
 const money=n=>'$'+(Number(n||0)/100).toFixed(2);
 const totals=tournamentTotals(state),pages=[];
 const W=1200,H=1553,LEFT=58,TABLE_W=1084,BOTTOM=1455;
 let canvas,ctx,y;
 function newPage(){
  canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  ctx=canvas.getContext('2d');if(!ctx)throw Error('PDF rendering is not supported in this browser.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);
  ctx.fillStyle='#185f3e';ctx.fillRect(0,0,W,13);
  ctx.fillStyle='#142b20';ctx.font='bold 36px Arial,sans-serif';
  ctx.fillText('PADEL ON | TOURNAMENT ARCHIVE',LEFT,83);
  ctx.strokeStyle='#cce2d5';ctx.lineWidth=2;
  ctx.beginPath();ctx.moveTo(LEFT,106);ctx.lineTo(LEFT+TABLE_W,106);ctx.stroke();
  y=138;pages.push(canvas);
 }
 function heading(text){
  if(y+52>BOTTOM)newPage();
  ctx.font='bold 25px Arial,sans-serif';ctx.fillStyle='#21633f';
  ctx.fillText(String(text),LEFT,y+25);y+=49;
 }
 function caption(text){
  if(y+32>BOTTOM)newPage();
  ctx.font='17px Arial,sans-serif';ctx.fillStyle='#536b59';
  ctx.fillText(String(text),LEFT,y+18);y+=30;
 }
 function wrap(value,maxWidth,font){
  ctx.font=font;
  const text=String(value===null||value===undefined?'':value);
  if(!text)return [''];
  const words=text.split(/\s+/),lines=[];
  let line='';
  for(const word of words){
   const proposed=line?line+' '+word:word;
   if(ctx.measureText(proposed).width<=maxWidth){line=proposed;continue;}
   if(line){lines.push(line);line='';}
   if(ctx.measureText(word).width<=maxWidth){line=word;continue;}
   // Don't clip long IDs, names, or Arabic strings without spaces.
   let part='';
   for(const ch of word){
    if(part&&ctx.measureText(part+ch).width>maxWidth){lines.push(part);part=ch;}
    else part+=ch;
   }
   line=part;
  }
  if(line)lines.push(line);
  return lines.length?lines:[''];
 }
 function drawTable(tableTitle,columns,rows){
  // Every record remains in a fixed column and row across page breaks.
  // Reprint column headers on every continuation page.
  heading(tableTitle);
  const widths=columns.map(x=>x.width),font='17px Arial,sans-serif';
  if(widths.reduce((a,b)=>a+b,0)!==TABLE_W)throw Error('PDF table columns must fill the page.');
  function header(){
   const h=37;
   ctx.fillStyle='#e2f1e7';ctx.fillRect(LEFT,y,TABLE_W,h);
   ctx.strokeStyle='#a9ccb5';ctx.lineWidth=1;ctx.strokeRect(LEFT,y,TABLE_W,h);
   let x=LEFT;
   for(let i=0;i<columns.length;i++){
    ctx.font='bold 16px Arial,sans-serif';ctx.fillStyle='#245a3b';
    const lines=wrap(columns[i].title,widths[i]-13,'bold 16px Arial,sans-serif');
    ctx.fillText(lines[0],x+7,y+24);
    x+=widths[i];if(i<columns.length-1){
     ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.stroke();
    }
   }
   y+=h;
  }
  header();
  if(!rows.length){
   ctx.font=font;ctx.fillStyle='#819488';ctx.fillText('No entries yet',LEFT+10,y+27);
   y+=38;return;
  }
  for(let index=0;index<rows.length;index++){
   const row=rows[index];
   let wrapped=row.map((value,j)=>wrap(value,widths[j]-15,font));
   const count=Math.max(...wrapped.map(x=>x.length));
   const h=Math.max(38,count*24+13);
   if(y+h>BOTTOM){newPage();heading(tableTitle+' (continued)');header();}
   ctx.fillStyle=index%2===0?'#f9fcfa':'#eff6f1';
   ctx.fillRect(LEFT,y,TABLE_W,h);
   ctx.strokeStyle='#ccdcd0';ctx.lineWidth=.8;ctx.strokeRect(LEFT,y,TABLE_W,h);
   let x=LEFT;
   for(let j=0;j<columns.length;j++){
    ctx.font=font;ctx.fillStyle='#273d2e';
    for(let k=0;k<wrapped[j].length;k++)
     ctx.fillText(wrapped[j][k],x+7,y+24+24*k);
    x+=widths[j];
    if(j<columns.length-1){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y+h);ctx.stroke();}
   }
   y+=h;
  }
  y+=18;
 }
 function col(title,width){return {title,width};}
 newPage();
 heading(tournament.name);
 caption('Date: '+tournament.event_date+'  |  Time: '+String(tournament.start_time).slice(0,5)+
  ' (Beirut)  |  '+(tournament.format==='groups'?'Groups + Knockout ('+({'best_of_3':'Best of 3','pro_8':'Pro Set to 8','pro_9':'Pro Set to 9'}[tournament.group_scoring||'best_of_3']||'Best of 3')+')':'Knockout Only'));
 drawTable('TOURNAMENT SUMMARY',[
  col('Item',300),col('Value',784)
 ],[
  ['Teams',teams.length],['Participants',teams.length*2],
  ['Fee per player',money(tournament.fee_cents)],
  ['Total due',money(totals.due)],['Total paid',money(totals.paid)],
  ['Amount remaining',money(totals.remaining)],
  ['Overpayments after fee changes',money(totals.overpaid)]
 ]);
 drawTable('PARTICIPANTS AND PAYMENTS',[
  col('Participant',266),col('Team / group',254),col('Due',174),
  col('Paid',190),col('Remaining',200)
 ],teams.flatMap(team=>team.members.map(person=>[
  person.name,tournamentTeamName(team)+(team.group?' / '+team.group:''),
  money(person.due),money(person.paid),
  money(Math.max(0,person.due-person.paid))+(person.paid>person.due?' (overpaid '+money(person.paid-person.due)+')':'')
 ])));
 const groups=[...new Set(teams.map(t=>t.group).filter(Boolean))].sort();
 if(groups.length){
  drawTable('GROUP STANDINGS',[
   col('Group',100),col('Team',300),col('Played',128),col('Won',118),
   col('Sets',200),col('Games',238)
  ],groups.flatMap(group=>groupStandings(state,group,tournament.group_scoring||'best_of_3').map(s=>[
   group,tournamentTeamName(s.team),s.played,s.wins,
   s.setsWon+'-'+s.setsLost,s.gamesWon+'-'+s.gamesLost
  ])));
 }
 function printableScore(m){
  if(m.sets?.length)return m.sets.map(s=>s.a+'-'+s.b+
   (s.ta!==undefined?' (TB '+s.ta+'-'+s.tb+')':'')).join(' / ');
  return m.winner?'BYE': 'Pending';
 }
 for(const phase of ['group','knockout']){
  const these=matches.filter(m=>m.phase===phase).filter(m=>
   phase==='group'||m.possibleA===undefined||Number(m.possibleA)+Number(m.possibleB)>0)
   .sort((a,b)=>a.round-b.round||a.slot-b.slot);
  if(!these.length)continue;
  drawTable(phase==='group'?'ALL MATCHES AND SCORES - GROUP STAGE':'ALL MATCHES AND SCORES - KNOCKOUT BRACKET',[
   col('Round / match',159),col('Team A',208),col('Team B',208),
   col('Time (24h)',115),col('Set scores / TB',209),col('Winner',185)
  ],these.map(m=>[
   (phase==='group'?'Group '+m.group+' / R'+m.round:'Round '+m.round)+' / '+m.id,
   teamLabel(m.a)+(m.seedA?' (SEED)':''),teamLabel(m.b)+(m.seedB?' (SEED)':''),
   m.scheduledTime||'Not set',printableScore(m),m.winner?teamLabel(m.winner):'Pending'
  ]));
 }
 const placements=state.seedPlacements||[];
 if(placements.length)drawTable('DIRECT KNOCKOUT SEEDS',[
  col('Team',450),col('Entry round',290),col('Match slot',170),col('Position',174)
 ],placements.map(seed=>[
  teamLabel(seed.team),{final:'Final',semifinal:'Semifinals',quarterfinal:'Quarterfinals'}[seed.stage]||seed.stage,
  'Match '+seed.slot,seed.side==='a'?'First team':'Second team'
 ]));
 const champion=tournamentChampion(state);
 if(champion){heading('CHAMPIONS: '+teamLabel(champion));}
 caption('Exported by PADEL ON on '+new Date().toISOString().slice(0,10)+'. Local PDF archive.');
 const total=pages.length;
 pages.forEach((page,i)=>{
  const c=page.getContext('2d');
  c.font='16px Arial,sans-serif';c.fillStyle='#728e79';
  c.fillText('PADEL ON | '+tournament.name+' | Page '+(i+1)+' / '+total,LEFT,H-48);
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
