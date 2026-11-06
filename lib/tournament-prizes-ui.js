const esc=x=>String(x??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
export const prizeLabels=[['winner','Winner'],['runner_up','Runner-up'],['third','Third Place'],['mvp','MVP']];
export function parsePrizes(text){
 const lines=String(text||'').split('\n');
 if(!lines[0]?.startsWith('Prize pool: $'))return {pool:'',winner:'',runner_up:'',third:'',mvp:'',notes:String(text||'')};
 const amount=(i)=>String(lines[i]||'').split('$')[1]||'';
 return {pool:amount(0),winner:amount(1),runner_up:amount(2),third:amount(3),mvp:amount(4),notes:lines.slice(5).join('\n').replace(/^Notes: /,'')};
}
export function serializePrizes(data){
 if(!Object.hasOwn(data,'prize_pool'))return String(data.prize_text||'').trim();
 const money=k=>{const s=String(data[k]||'0').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(s)||Number(s)>1000000)throw Error('Prize amounts must be nonnegative with up to two decimals.');return Number(s).toFixed(2)};
 const lines=['Prize pool: $'+money('prize_pool'),...prizeLabels.map(([k,label])=>label+': $'+money('prize_'+k))];
 const note=String(data.prize_notes||'').trim();if(note)lines.push('Notes: '+note);
 const result=lines.join('\n');if(result.length>1000)throw Error('Prize description exceeds 1000 characters.');return result;
}
export function prizeEditor(mode,text){
 const p=parsePrizes(text),announced=mode==='announced';
 const input=(name,label,value)=>'<label>'+label+'<input type="number" name="'+name+'" min="0" max="1000000" step="0.01" placeholder="0.00" value="'+esc(value)+'"></label>';
 return '<div class="tm-prize-choice"><label><input type="radio" name="prize_mode" value="tba"'+(!announced?' checked':'')+'> To Be Announced</label><label><input type="radio" name="prize_mode" value="announced"'+(announced?' checked':'')+'> Announce Now</label></div>'+
 '<div class="tm-prize-announced">'+input('prize_pool','Total prize pool ($)',p.pool)+'<div class="tm-prize-grid">'+prizeLabels.map(([k,label])=>input('prize_'+k,label+' ($)',p[k])).join('')+'</div><label>Additional details<textarea name="prize_notes" rows="2" maxlength="650">'+esc(p.notes)+'</textarea></label></div>';
}
