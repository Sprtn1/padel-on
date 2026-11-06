// Pure tournament view helpers. Route slugs contain no personal or financial data.
export const TOURNAMENT_VIEWS=Object.freeze(['overview','participants','payments','groups','final']);
export const WIZARD_STEPS=Object.freeze(['Basics','Format','Schedule & Entry','Teams','Review']);
const validId=id=>/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/.test(id);
export function tournamentHash(id=null,section='overview'){
 if(!id)return '#tournament';
 if(!validId(String(id)))return '#tournament';
 return '#tournament/'+id+'/'+(TOURNAMENT_VIEWS.includes(section)?section:'overview');
}
export function tournamentCreateHash(){return '#tournament/new';}
export function parseTournamentHash(hash){
 const value=String(hash??'');
 if(value==='#tournament')return {view:'list'};
 if(value==='#tournament/new')return {view:'create'};
 const found=/^#tournament\/([a-zA-Z0-9][a-zA-Z0-9_-]{0,99})(?:\/(overview|participants|payments|groups|final))?$/.exec(value);
 return found?{view:'detail',id:found[1],section:found[2]||'overview'}:null;
}
export function allowedTournamentView(section,format){
 return section==='groups'&&format!=='groups'?'overview':
  TOURNAMENT_VIEWS.includes(section)?section:'overview';
}
export function tournamentStatus(row,today){
 if(row?.state?.matches?.some(x=>x.phase==='knockout')&&
    row.state.matches.filter(x=>x.phase==='knockout').at(-1)?.winner)return 'completed';
 if(String(row?.event_date??'')>String(today??''))return 'upcoming';
 return 'ongoing';
}
