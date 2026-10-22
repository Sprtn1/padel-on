// Local-only Arabic display/transliteration for names on the daily accounting PDF.
// Never changes the canonical client name or sends personal names to a translation service.
const KNOWN=Object.freeze({
 'ali':'علي','jana':'جانا','bleibel':'بليبل','akhdar':'أخضر',
 'ahmad':'أحمد','ahmed':'أحمد','mohammad':'محمد','mohamad':'محمد',
 'mohammed':'محمد','muhammad':'محمد','mohamed':'محمد','mahmoud':'محمود',
 'mahmood':'محمود','hussein':'حسين','hussain':'حسين','hasan':'حسن',
 'hassan':'حسن','houssam':'حسام','hossam':'حسام','omar':'عمر','umar':'عمر',
 'rami':'رامي','khalil':'خليل','khaled':'خالد','khalid':'خالد',
 'karim':'كريم','kareem':'كريم','youssef':'يوسف','yousef':'يوسف',
 'yousif':'يوسف','joseph':'جوزيف','george':'جورج','georges':'جورج',
 'jad':'جاد','jihad':'جهاد','john':'جون','smith':'سميث',
 'ramy':'رامي','reema':'ريما','reem':'ريم','rim':'ريم',
 'sara':'سارة','sarah':'سارة','maria':'ماريا','marie':'ماري',
 'lara':'لارا','rana':'رنا','randa':'رندا','dana':'دانا',
 'dima':'ديما','nadine':'نادين','nour':'نور','noor':'نور',
 'naji':'ناجي','najwa':'نجوى','sami':'سامي','samir':'سمير',
 'samira':'سميرة','elias':'إلياس','elie':'إيلي','tony':'طوني',
 'fadi':'فادي','hadi':'هادي','abdallah':'عبدالله','abdullah':'عبدالله',
 'rayan':'ريان','ryan':'رايان','zein':'زين','zain':'زين',
 'salma':'سلمى','nabil':'نبيل','bashir':'بشير','chadi':'شادي',
 'shadi':'شادي','fouad':'فؤاد','michel':'ميشال','michael':'مايكل',
 'tani':'تاني','christina':'كريستينا','christine':'كريستين',
 'lina':'لينا','leen':'لين','sandra':'ساندرا','nicolas':'نيكولا'
});
const PAIRS=Object.freeze([
 ['tch','تش'],['sch','ش'],['kh','خ'],['gh','غ'],['sh','ش'],['ch','ش'],
 ['th','ث'],['dh','ذ'],['ph','ف'],['ck','ك'],['qu','ك'],
 ['ee','ي'],['ei','ي'],['ie','ي'],['ea','ي'],
 ['ou','و'],['oo','و'],['au','او'],['aw','او'],
 ['ai','اي'],['ay','اي'],['aa','ا'],['ey','ي']
]);
const LETTERS=Object.freeze({
 a:'ا',b:'ب',c:'ك',d:'د',e:'',f:'ف',g:'ج',h:'ه',i:'ي',
 j:'ج',k:'ك',l:'ل',m:'م',n:'ن',o:'و',p:'ب',q:'ق',
 r:'ر',s:'س',t:'ت',u:'و',v:'ف',w:'و',x:'كس',
 y:'ي',z:'ز'
});
const ARABIC=/[\u0600-\u06FF\u0750-\u077F]/;
const LATIN=/[a-zA-Z]/;
export function isValidArabicClientName(value){
 const s=String(value??'').trim();
 return !s || (s.length<=120&&ARABIC.test(s)&&!LATIN.test(s));
}
function arabicToken(raw){
 if(ARABIC.test(raw))return raw;
 const s=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(KNOWN[s])return KNOWN[s];
 let out='',i=0;
 while(i<s.length){
  let found=false;
  for(const [lat,ar] of PAIRS)if(s.startsWith(lat,i)){
   out+=ar;i+=lat.length;found=true;break;
  }
  if(found)continue;
  const letter=s[i];
  if(letter==='e'&&i===0)out+='إ';
  else out+=LETTERS[letter]??'';
  i++;
 }
 return out||'اسم';
}
export function arabicClientName(original,preferred=''){
 const correction=String(preferred??'').trim();
 if(correction&&isValidArabicClientName(correction))return correction;
 const source=String(original??'').trim();
 if(!source)return 'اسم غير معروف';
 // Keep Arabic spelling unchanged, transliterate Latin words locally and
 // preserve spaces, names separated by hyphens, and harmless punctuation.
 return source.split(/([\s\-–—]+)/u).map(fragment=>{
  if(!fragment||/^[\s\-–—]+$/u.test(fragment))return fragment;
  return fragment.replace(/[A-Za-zÀ-ÿ]+/g,arabicToken).replace(/[^\u0600-\u06FF\u0750-\u077F\s\-–—'.\d]/g,'');
 }).join('')||'اسم غير معروف';
}
