import {WIZARD_STEPS} from './tournament-workspace.js';
import {isAmericano} from './tournament-advanced-engine.js';

const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const DEFAULT_TOURNAMENT_RULES=Object.freeze([
 {key:'late_arrivals',enabled:true,text:'Players must arrive at least 10 minutes before their scheduled match.'},
 {key:'substitutions',enabled:true,text:'Player substitutions require staff approval before the first match.'},
 {key:'cancellations',enabled:true,text:'Withdrawals and refunds must be approved by club management.'},
 {key:'disputes',enabled:true,text:'Match disputes are resolved by the tournament organizer.'},
 {key:'fair_play',enabled:true,text:'Respect opponents, officials and court rules at all times.'}
]);
export const tournamentRuleTitle=key=>({late_arrivals:'Arrival & Check-in',substitutions:'Player Substitutions',cancellations:'Cancellations & Refunds',disputes:'Disputes & Decisions',fair_play:'Fair Play & Conduct'}[key]||String(key||'').replaceAll('_',' ').replace(/\\b\\w/g,ch=>ch.toUpperCase()));
export const TOURNAMENT_FORMAT_NAMES=Object.freeze({
 groups:'Groups + Knockout',knockout:'Knockout Only',
 americano_individual:'Individual Americano',americano_team:'Team Americano'
});
export const formatLabel=value=>TOURNAMENT_FORMAT_NAMES[value]||'Tournament';
export function beirutLocalToISO(local){
 const str=String(local||'');
 if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(str))throw Error('Choose a valid Beirut registration deadline.');
 // Determine Asia/Beirut UTC offset for the selected calendar date,
 // rather than trusting the browser/device time zone.
 const probe=new Date(str+':00Z');
 if(Number.isNaN(probe.valueOf()))throw Error('Invalid registration deadline.');
 const localName=new Intl.DateTimeFormat('en',{timeZone:'Asia/Beirut',timeZoneName:'shortOffset'})
  .formatToParts(probe).find(p=>p.type==='timeZoneName')?.value||'GMT+2';
 const match=/GMT([+-]\d{1,2})(?::(\d{2}))?/.exec(localName);
 if(!match)throw Error('Could not interpret Beirut timezone.');
 const hours=Number(match[1]),mins=Number(match[2]||0);
 const sign=hours<0?'-':'+';
 const offset=sign+String(Math.abs(hours)).padStart(2,'0')+':'+String(mins).padStart(2,'0');
 const instant=new Date(str+':00'+offset);
 if(!Number.isFinite(instant.valueOf()))throw Error('Invalid registration deadline.');
 return instant.toISOString();
}
export function buildTournamentSettingsFromWizard(data,format,count){
 const enabledCourts=['C1','C2','C3'].filter(c=>data['court_'+c.toLowerCase()]==='on');
 const courts=enabledCourts.length?enabledCourts:['C1'];
 const rules=DEFAULT_TOURNAMENT_RULES.map(rule=>({
  key:rule.key,enabled:data['rule_enabled_'+rule.key]==='on',
  text:String(data['rule_text_'+rule.key]??rule.text).trim()
 }));
 const deadline=String(data.registration_deadline??'').trim();
 return {
  group_size:Number(data.group_size??4),
  qualifiers_per_group:Number(data.qualifiers_per_group??2),
  entry_limit:Number(data.entry_limit??32),
  courts,fee_mode:data.fee_mode==='free'?'free':'paid',registration_mode:'staff',
  registration_deadline:deadline?beirutLocalToISO(deadline):null,
  prize_mode:data.prize_mode==='announced'?'announced':'tba',
  prize_text:String(data.prize_text??'').trim(),
  publication_status:'draft',rules,
  points_per_match:Number(data.points_per_match??24),
  rounds:Number(data.rounds??Math.min(7,format==='americano_team'?Math.max(1,count-1):7)),
  match_minutes:Number(data.match_minutes??20),
  playoffs:data.playoffs==='on'
 };
}
export function renderAdvancedTournamentWizard({setup,teamCount,step,today,icon=()=>'',busy=false,groupScoreOptions}){
 const format=TOURNAMENT_FORMAT_NAMES[setup.format]?setup.format:'groups';
 const individual=format==='americano_individual';
 const americano=isAmericano(format);
 const feeMode=setup.fee_mode==='free'?'free':'paid';
 const steps=WIZARD_STEPS.map((name,i)=>
  '<span class="tm-wizard-step-label'+(i===step?' current':i<step?' done':'')+'"><b>'+String(i+1).padStart(2,'0')+'</b><span>'+esc(name)+'</span></span>').join('');
 const field=(i,title,body)=>'<section class="tm-wizard-section" data-step="'+i+'"'+(i===step?'':' hidden')+'>'+
  '<div class="tm-wizard-intro"><h3>'+title+'</h3></div>'+body+'</section>';
 const opt=(value,label,current)=>'<option value="'+value+'"'+(current===value?' selected':'')+'>'+label+'</option>';
 const label=(text,body)=>'<label>'+text+body+'</label>';
 const formatOptions=Object.entries(TOURNAMENT_FORMAT_NAMES).map(([v,text])=>opt(v,text,format)).join('');
 const details=field(0,'Basics','<p>Give the event a clear name.</p><div class="tm-create-grid tm-wizard-single">'+
  label('Tournament name','<input name="name" required maxlength="100" placeholder="PADEL ON Friday Open" value="'+esc(setup.name||'')+'">')+'</div>');
 const courts=['C1','C2','C3'].map(c=>'<label class="tm-v2-check"><input type="checkbox" name="court_'+c.toLowerCase()+'"'+
  ((setup['court_'+c.toLowerCase()]??(c==='C1'?'on':''))==='on'?' checked':'')+'><span>'+c+'</span></label>').join('');
 const sectionFormat=field(1,'Format & Structure',
  '<p>Configure groups, court capacity and scoring. Individual Americano counts people; other formats count fixed pairs.</p>'+
  '<div class="tm-create-grid">'+
  label('Tournament format','<select id="tm-new-format" name="format">'+formatOptions+'</select>')+
  label(individual?'Number of players (4–32)':'Number of teams (2–32)',
    '<input id="tm-team-count" type="number" min="'+(individual?4:2)+'" max="32" step="1" name="team_count" value="'+teamCount+'" required>')+
  label('Maximum registrations','<input name="entry_limit" type="number" min="'+teamCount+'" max="32" step="1" required value="'+esc(setup.entry_limit??32)+'">')+
  (format==='groups'?
   label('Teams per group','<input name="group_size" type="number" min="2" max="8" step="1" value="'+esc(setup.group_size??4)+'">')+
   label('Qualify from each group','<input name="qualifiers_per_group" type="number" min="1" max="8" step="1" value="'+esc(setup.qualifiers_per_group??2)+'">')+
   label('Group scoring','<select name="group_scoring">'+groupScoreOptions(setup.group_scoring||'best_of_3')+'</select>'):
   '<input type="hidden" name="group_size" value="'+esc(setup.group_size??4)+'">'+
   '<input type="hidden" name="qualifiers_per_group" value="'+esc(setup.qualifiers_per_group??2)+'">'+
   '<input type="hidden" name="group_scoring" value="best_of_3">')+
  (!individual?label('Knockout scoring','<select name="knockout_scoring">'+groupScoreOptions(setup.knockout_scoring||'best_of_3')+'</select>'):'<input type="hidden" name="knockout_scoring" value="best_of_3">')+
  (americano?
   label('Points per Americano match','<input name="points_per_match" type="number" min="4" max="100" step="2" value="'+esc(setup.points_per_match??24)+'" required>')+
   label('Number of rounds','<input name="rounds" type="number" min="1" max="31" step="1" value="'+esc(setup.rounds??Math.min(7,format==='americano_team'?Math.max(1,teamCount-1):7))+'" required>')+
   label('Match duration (minutes)','<input name="match_minutes" type="number" min="10" max="120" step="5" value="'+esc(setup.match_minutes??20)+'" required>')+
   '<label class="tm-v2-check tm-v2-wide"><input type="checkbox" name="playoffs"'+(setup.playoffs==='on'?' checked':'')+'><span>Optional '+(individual?'top-four championship points round':'top-four semifinal and final')+'</span></label>':
   '<input type="hidden" name="points_per_match" value="24"><input type="hidden" name="rounds" value="7">'+
   '<input type="hidden" name="match_minutes" value="20">')+
  '</div><div class="tm-v2-courts"><strong>Courts in play</strong><div>'+courts+'</div></div>'+
  '<p class="tm-hint">Custom group qualifiers advance to a knockout bracket with byes where needed; no third-place team is added automatically.</p>');
 const entry=field(2,'Dates & Registration',
  '<p>Registration is staff-managed only. No player self-registration or public tournament page is created.</p>'+
  '<div class="tm-create-grid">'+
  label('Tournament date','<input name="date" type="date" required value="'+esc(setup.date||today)+'">')+
  label('Start time (Beirut)','<input name="time" type="time" required value="'+esc(setup.time||'18:00')+'">')+
  label('Registration deadline (Beirut, optional)','<input name="registration_deadline" type="datetime-local" value="'+esc(setup.registration_deadline||'')+'">')+
  label('Entry type','<select name="fee_mode" id="tm-fee-mode">'+opt('paid','Paid entry',feeMode)+opt('free','Free entry',feeMode)+'</select>')+
  (feeMode==='free'?'<input type="hidden" name="fee" value="0">':
   label('Fee per participant ($)','<input name="fee" type="number" min="0.01" max="1000000" step="0.01" required value="'+esc(setup.fee??20)+'">'))+
  '</div><p class="tm-hint">After a deadline, only administrators can override registration for unplayed traditional tournaments. Payment records are never reset.</p>');
 const prizes=field(3,'Prizes','<p>Announce prizes now or keep them to be announced later.</p><div class="tm-create-grid">'+
  label('Prize announcement','<select name="prize_mode">'+opt('tba','To Be Announced',setup.prize_mode||'tba')+
   opt('announced','Announce Now',setup.prize_mode||'tba')+'</select>')+
  '</div><div class="tm-v2-prize-details">'+label('Prize details (optional)','<textarea name="prize_text" maxlength="1000" rows="4" placeholder="Champion prize, runner-up prize, sponsor information...">'+esc(setup.prize_text||'')+'</textarea>')+
  '<p class="tm-hint">Prizes are announcements only; no automatic deduction occurs in Cafeteria Finances.</p>');
 const rules=field(4,'Tournament Rules','<p>Choose which policies staff can publish internally. Editable rules do not alter the scoring engine.</p>'+
  '<div class="tm-v2-rules">'+DEFAULT_TOURNAMENT_RULES.map(rule=>
   '<div class="tm-v2-rule"><label class="tm-v2-check"><input type="checkbox" name="rule_enabled_'+rule.key+'"'+
   ((setup['rule_enabled_'+rule.key]??(rule.enabled?'on':''))==='on'?' checked':'')+'><strong>'+esc(tournamentRuleTitle(rule.key))+'</strong></label>'+
   '<textarea name="rule_text_'+rule.key+'" rows="2" maxlength="500">'+esc(setup['rule_text_'+rule.key]??rule.text)+'</textarea></div>').join('')+'</div>');
 const roster=Array.from({length:teamCount},(_,i)=>{
  const p=i+1;return '<div class="tm-team-input"><strong>'+(individual?'Player ':'Pair ')+p+'</strong>'+
   (individual?[1]:[1,2]).map(slot=>
    '<div class="tm-tournament-player">'+
    '<input name="player_'+p+'_'+slot+'" maxlength="100" required placeholder="Player '+(individual?'full name':slot+' full name')+
    '" value="'+esc(setup['player_'+p+'_'+slot]||'')+'">'+
    '<label class="tm-team-player-option"><input type="checkbox" name="team_player_'+p+'_'+slot+'"'+
      (setup['team_player_'+p+'_'+slot]==='on'?' checked':'')+'><span>Team Player</span></label></div>').join('')+'</div>';
 }).join('');
 const teams=field(5,individual?'Register Players':'Register Teams',
  '<p>Enter each '+(individual?'player':'pair')+'. Team Player benefits are calculated automatically.</p>'+
  '<div class="tm-team-inputs">'+roster+'</div>');
 const review=field(6,'Review Tournament','<p>Check the details before generating fixtures.</p><div class="tm-wizard-review">'+[
  ['Tournament',setup.name||'New tournament'],['Format',formatLabel(format)],
  [individual?'Players':'Teams',teamCount],['Courts',String(['C1','C2','C3'].filter(c=>setup['court_'+c.toLowerCase()]==='on').join(', ')||'C1')],
  ['Entry limit',setup.entry_limit||32],['Entry fee',feeMode==='free'?'Free':'$'+(setup.fee||'20')],
  ['Prize',setup.prize_mode==='announced'?'Announced':'To be announced'],
  ['Registration','Staff-managed only'],
  ['Schedule',(setup.date||today)+' · '+(setup.time||'18:00')+' Beirut']
 ].map(([key,value])=>'<div><small>'+esc(key)+'</small><strong>'+esc(value)+'</strong></div>').join('')+
 '</div><p class="tm-hint">Creating this tournament saves its rules, registration limit, prizes, fixtures and scoring format. Existing tournaments are not affected.</p>');
 const footer='<div class="tm-wizard-actions">'+
  (step>0?'<button type="button" class="btn btn-light" data-action="tm-wizard-prev">Back</button>':'')+
  '<span>Step '+(step+1)+' of '+WIZARD_STEPS.length+'</span>'+
  (step<WIZARD_STEPS.length-1?'<button type="button" class="btn btn-primary" data-action="tm-wizard-next">Continue</button>':
   '<button type="submit" class="btn btn-primary"'+(busy?' disabled':'')+'>'+icon('plus')+' Create Tournament & Generate Fixtures</button>')+
  '</div>';
 return '<section class="panel tm-setup tm-wizard"><div class="tm-head"><h2>New tournament</h2>'+
  '<button type="button" class="btn btn-light btn-xs" data-action="tm-cancel-create">Cancel</button></div>'+
  '<div class="tm-wizard-steps">'+steps+'</div>'+
  '<form id="tm-create-form" data-tm-submit="create" novalidate><div class="tm-wizard-layout">'+
  '<div class="tm-wizard-body">'+details+sectionFormat+entry+prizes+rules+teams+review+footer+'</div>'+
  '<aside class="tm-wizard-preview"><h3>Live preview</h3><span class="tm-stage-badge">Draft</span>'+
  '<h4>'+esc(setup.name||'New tournament')+'</h4><p>'+esc(formatLabel(format))+'</p>'+
  '<div><small>'+ (individual?'Players':'Teams')+'</small><strong>'+teamCount+'</strong></div>'+
  '<div><small>Entry</small><strong>'+(feeMode==='free'?'Free':'Paid')+'</strong></div>'+
  '<div><small>Prize</small><strong>'+esc(setup.prize_mode==='announced'?'Announced':'TBA')+'</strong></div>'+
  '<div><small>Date</small><strong>'+esc(setup.date||today)+'</strong></div>'+
  '<p class="tm-hint">Staff-only tournament. All information and payments remain private.</p></aside></div></form></section>';
}
