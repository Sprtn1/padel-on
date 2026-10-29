import {arabicClientName,isValidArabicClientName} from './arabic-client-names.js';
export {arabicClientName,isValidArabicClientName};
// Browser-only Arabic daily accounting export. No PDF bytes or document contents
// are uploaded to GitHub, Supabase, storage APIs, or any network endpoint.
export const ARABIC_SHEET_FILENAME_PREFIX='padel-on-daily-sheet';
// Accounting ledger number: October 24, 2026 is 1150; each calendar day is one entry.
// Derive it from the selected report date, not the device clock or previous downloads.
const LEDGER_BASE_DATE='2026-10-24';
const LEDGER_BASE_NUMBER=1150;
const DAY_MS=24*60*60*1000;
export function arabicDailyEntryNumber(date){
 const value=String(date??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))
  throw Error('تاريخ المحاسبة غير صالح');
 const dateMillis=Date.parse(value+'T00:00:00Z');
 if(!Number.isFinite(dateMillis)||new Date(dateMillis).toISOString().slice(0,10)!==value)
  throw Error('تاريخ المحاسبة غير صالح');
 return LEDGER_BASE_NUMBER+Math.round((dateMillis-Date.parse(LEDGER_BASE_DATE+'T00:00:00Z'))/DAY_MS);
}
const W=612,H=792,SCALE=2.2;
// Format only rendered PDF amounts: round cents to the nearest tenth of a dollar.
// All underlying accounting calculations remain exact in cents.
export function formatArabicPdfAmount(cents){
 if(cents===null||cents===undefined)return '';
 const tenths=Math.sign(Number(cents))*Math.round(Math.abs(Number(cents))/10);
 // Avoid displaying "-0" when a tiny negative adjustment rounds to zero.
 if(tenths===0)return '0';
 return (tenths/10).toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:1});
}
const money=formatArabicPdfAmount;
const sum=(rows,field='amount_cents')=>rows.reduce((v,r)=>v+Number(r[field]||0),0);
const activeFor=(items,date)=>items.filter(e=>!e.voided_at&&(!e.entry_date||e.entry_date===date));
const cat=(items,id)=>sum(items.filter(e=>e.category===id));
const keyName=s=>String(s??'');
const detailType={padel_courts:'ملعب بادل',pickleball_courts:'ملعب بيكل بول',
 basketball_courts:'ملعب باسكت',grips:'جربات',balls:'طابات',racket_rental:'إيجار راكات',
 clothes:'ملابس',racket_sold:'بيع راكات',gymnastics:'جمناستك',classes:'صف تدريب',
 pt_gym:'صف جم',summer_camp:'دورة الصيف',shoes:'أحذية',
 basketball_academy:'أكاديمية باسكت',other_income:'إيرادات أخرى',
 general_payment:'صرف متفرقات / نادي',coaches:'مدرب',
 cafeteria_stock:'مشتريات بوظة / ماء',family_debt:'دين عائلة',
 other_expense:'مصاريف أخرى'};
export function prepareArabicDailySheet(data){
 const date=String(data.date||'');
 const entryNumber=arabicDailyEntryNumber(date);
 const rows=activeFor(data.rows||[],date);
 const privatePayments=(data.privatePayments||[]).filter(p=>!p.voided_at&&p.payment_channel!=='whish'&&(!p.entry_date||p.entry_date===date));
 const privateSessions=(data.privateSessions||[]).filter(p=>!p.voided_at&&(!p.entry_date||p.entry_date===date));
 const whish=(data.whishRows||[]).filter(e=>!e.voided_at&&['deposit','withdrawal'].includes(e.entry_type));
 const openingWallet=Number(data.whishOpening);
 if(!Number.isSafeInteger(openingWallet)||openingWallet<0)throw Error('Invalid Whish opening balance');
 const whishPdfName=(type,raw)=>{
  const name=keyName(raw).trim();
  // Translate only these two recurring Whish descriptions for the Arabic
  // accounting form. Do not modify or reclassify transactions in Supabase.
  if(type==='deposit'&&(name.toLocaleLowerCase('en')==='goods sold'||name==='مبيع متفرقات'))
   return 'مبيع متفرقات';
  if(type==='withdrawal'&&(
    name.toLocaleLowerCase('en')==='transfer from whish to miscellaneous cash box'||
    name==='خروج إلى صندوق متفرقات'
  ))return 'خروج إلى صندوق متفرقات';
  return name;
 };
 const group=type=>{
  const totals=new Map();
  for(const e of whish.filter(e=>e.entry_date===date&&e.entry_type===type)){
   const name=whishPdfName(type,e.name),cents=Number(e.amount_cents||0);
   totals.set(name,(totals.get(name)||0)+cents);
  }
  return [...totals].map(([name,amount_cents])=>({name,amount_cents}));
 };
 const whishDeposits=sum(whish.filter(e=>e.entry_type==='deposit'));
 const whishWithdrawals=sum(whish.filter(e=>e.entry_type==='withdrawal'));
 const incomeCategories=['padel_courts','pickleball_courts','basketball_courts','grips','balls','racket_rental',
  'clothes','racket_sold','gymnastics','classes','pt_gym',
  'summer_camp','shoes','basketball_academy','other_income'];
 const expenseCategories=['general_payment','coaches','cafeteria_stock','family_debt','other_expense'];
 const receipts=sum(rows.filter(e=>incomeCategories.includes(e.category)))+sum(privatePayments);
 const expenses=sum(rows.filter(e=>expenseCategories.includes(e.category)));
 const closingCash=data.closingCash===null||data.closingCash===undefined?null:Number(data.closingCash);
 if(closingCash!==null&&(!Number.isSafeInteger(closingCash)||closingCash<0))throw Error('Invalid closing cash.');
 const totalGenerated=closingCash===null?null:closingCash+expenses;
 const goodsSold=totalGenerated===null?null:totalGenerated-receipts;

 const normalized=str=>String(str||'').trim().toLocaleLowerCase('en');
 const isName=(row,names)=>names.some(name=>normalized(row.name)===normalized(name));
 const namedIncome=names=>sum(rows.filter(e=>e.category==='other_income'&&isName(e,names)));
 const namedExpense=names=>sum(rows.filter(e=>e.category==='other_expense'&&isName(e,names)));
 const basketballAcademy=['Basketball Academy'];
 const summerCourse=['Summer Course','Summer Camp'];
 const shoeIncome=['Shoes'];
 const familyDebt=['Family Debt'];
 const ballsQuantity=rows.filter(e=>e.category==='balls').reduce((n,e)=>n+Number(e.quantity||1),0);
 const gripsQuantity=rows.filter(e=>e.category==='grips').reduce((n,e)=>n+Number(e.quantity||1),0);

 // Fixed lines reproduce the printed 701 income categories. Balls and
 // grips occupy separate rows with their own quantities and sale amounts.
 // Additional income and individual 401 client receipts use the blank lines.
 const fixedIncome=[
  ['ملعب بادل',cat(rows,'padel_courts'),'701'],
  ['ملعب بيكل بول',cat(rows,'pickleball_courts'),'701'],
  ['ملعب باسكت',cat(rows,'basketball_courts'),'701'],
  ['صف تدريب طابق أول',cat(rows,'classes'),'701'],
  ['صف تدريب جمناستك',cat(rows,'gymnastics'),'701'],
  ['صف جم',cat(rows,'pt_gym'),'701'],
  ['أكاديمية باسكت',cat(rows,'basketball_academy')+namedIncome(basketballAcademy),'701'],
  ['مبيع متفرقات',goodsSold,'701'],
  ['إيجار راكات',cat(rows,'racket_rental'),'701'],
  ['طاولة بينغ بونغ',null,'701'], // Deliberately ignored.
  ['دورة الصيف',cat(rows,'summer_camp')+namedIncome(summerCourse),'701'],
  ['طابات ('+ballsQuantity+')',cat(rows,'balls'),'701'],
  ['جربات ('+gripsQuantity+')',cat(rows,'grips'),'701'],
  ['ملابس',cat(rows,'clothes'),'701'],
  ['أحذية',cat(rows,'shoes')+namedIncome(shoeIncome),'701']
 ];
 const ordinaryIncome=rows.filter(e=>e.category==='other_income'&&!isName(e,[...basketballAcademy,...summerCourse,...shoeIncome]))
  .map(e=>[e.name||'إيرادات أخرى',Number(e.amount_cents),'701']);
 const racketSales=rows.filter(e=>e.category==='racket_sold')
  .map(e=>['بيع راكات'+(e.name?' - '+e.name:''),Number(e.amount_cents),'701']);
 // Keep client names, client IDs, and each distinct amount PAID. A session fee is
 // never substituted for paid cash here.
 const clientRows=privatePayments.map(p=>[
  'مشترك: '+(p.clientName||'مشترك')+' / رقم '+(p.clientCode||'—'),Number(p.amount_cents),'401'
 ]);
 const incomeCandidates=[...racketSales,...ordinaryIncome,...clientRows];
 // Prioritize displaying 401 receipt lines; all overflow is preserved in the
 // additional detailed pages rather than being silently dropped.
 const revenueSpace=18-fixedIncome.length;
 const incoming=[...clientRows,...racketSales,...ordinaryIncome];
 const amountRows=[...fixedIncome,...incoming.slice(0,revenueSpace)];
 while(amountRows.length<18)amountRows.push(['',null,'']);
 const overflowIncome=incoming.slice(revenueSpace);

 const fixedExpense=[
  ['صرف متفرقات / نادي',cat(rows,'general_payment'),'631'],
  ['مشتريات بوظة / ماء',cat(rows,'cafeteria_stock'),'631'],
  ['مدرب',cat(rows,'coaches'),'631'],
  ['دين عائلة',cat(rows,'family_debt')+namedExpense(familyDebt),'631']
 ];
 const generalExpenses=rows.filter(e=>e.category==='other_expense'&&!isName(e,familyDebt))
  .map(e=>[e.name||'مصاريف أخرى',Number(e.amount_cents),'631']);
 const expenseRows=[...fixedExpense,...generalExpenses.slice(0,4)];
 while(expenseRows.length<8)expenseRows.push(['',null,'']);
 const overflowExpenses=generalExpenses.slice(4);

 // Training-hours table: all sessions, even paid_at_session = $0. Session fee,
 // client name and client number correspond to the screenshot and paper.
 const trainingRows=privateSessions.map(s=>({
  clientName:arabicClientName(s.clientName||'مشترك',s.clientArabicName||'')+(s.isNewClient?' (مشترك جديد)':''),
  clientCode:String(s.clientCode||''),
  sessionFeeCents:Number(s.sessionFeeCents??s.session_fee_cents??0),
  paidAtSessionCents:Number(s.paidAtSessionCents??s.paid_cents??0)
 }));
 const details=[];
 for(const item of rows)details.push({
  section:item.category in detailType?detailType[item.category]:'قيد آخر',
  name:String(item.name||detailType[item.category]||''),
  amount_cents:Number(item.amount_cents||0),identifier:''
 });
 for(const p of privatePayments)details.push({
  section:'دفعات المشتركين',
  name:String(p.clientName||'مشترك')+' - '+String(p.type||'دفعة'),
  amount_cents:Number(p.amount_cents||0),identifier:String(p.clientCode||'رقم غير محدد')
 });
 for(const session of trainingRows)details.push({
  section:'ساعات تدريب',name:session.clientName,
  amount_cents:session.sessionFeeCents,identifier:session.clientCode
 });
 // Whish transaction details must be on different appendix pages from cash.
 const whishDetails=whish.filter(e=>e.entry_date===date).map(e=>({
  section:e.entry_type==='deposit'?'دخول صندوق وش':'خروج صندوق وش',
  name:whishPdfName(e.entry_type,e.name),amount_cents:Number(e.amount_cents||0),identifier:''
 }));
 const [year,month,day]=date.split('-');
 // Only the printed Arabic Whish section offsets related Goods Sold deposits
 // and cash-box transfers. The source ledger and actual wallet stay unchanged.
 const printedIn=group('deposit'),printedOut=group('withdrawal');
 const goodsSoldRow=printedIn.find(r=>r.name==='مبيع متفرقات');
 const transferRow=printedOut.find(r=>r.name==='خروج إلى صندوق متفرقات');
 const offset=Math.min(goodsSoldRow?.amount_cents||0,transferRow?.amount_cents||0);
 if(offset>0){
  goodsSoldRow.amount_cents-=offset;
  transferRow.amount_cents-=offset;
 }
 // The fully offset side is blank, not a negative amount.
 const whishIn=printedIn.filter(r=>r.amount_cents>0);
 const whishOut=printedOut.filter(r=>r.amount_cents>0);
 const whishPdfDepositsToday=sum(whishIn);
 const whishPdfWithdrawalsToday=sum(whishOut);
 const whishDetailPageRequired=whishIn.length>5||whishOut.length>4||
  whishDetails.length>(whishIn.length+whishOut.length);
 return {date,dateArabic:day+' / '+month+' / '+year,entryNumber,amountRows,expenseRows,trainingRows,details,whishDetails,whishDetailPageRequired,
  overflowIncome,overflowExpenses,overflowTraining:trainingRows.slice(8),
  whishIn,whishOut,whishPdfDepositsToday,whishPdfWithdrawalsToday,
  whishDepositsToday:sum(whish.filter(e=>e.entry_date===date&&e.entry_type==='deposit')),
  whishWithdrawalsToday:sum(whish.filter(e=>e.entry_date===date&&e.entry_type==='withdrawal')),
  walletBalance:openingWallet+whishDeposits-whishWithdrawals,openingWallet,
  ballsQuantity,gripsQuantity,receipts,expenses,closingCash,goodsSold,totalGenerated,
  missingFields:['يوجد في الصندوق اليوم','الصندوق القديم']
 };
}

function createPage(){
 const canvas=document.createElement('canvas');
 canvas.width=Math.round(W*SCALE);canvas.height=Math.round(H*SCALE);
 const c=canvas.getContext('2d',{alpha:false});
 if(!c)throw Error('Canvas is unavailable for local PDF generation.');
 c.scale(SCALE,SCALE);c.fillStyle='#fff';c.fillRect(0,0,W,H);
 c.lineJoin='miter';c.lineCap='square';c.strokeStyle='#101010';
 return {canvas,c};
}
const font=(size,bold=false)=> (bold?'bold ':'')+size+'px "Noto Naskh Arabic","Noto Sans Arabic",Tahoma,Arial,sans-serif';
function box(c,x,y,w,h,thick=0.75){c.lineWidth=thick;c.strokeRect(x,y,w,h);}
function line(c,x,y,x2,y2,thick=0.65){c.beginPath();c.lineWidth=thick;c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();}
function text(c,value,x,y,size=10,align='right',bold=false,maxWidth=null){
 if(value===null||value===undefined||value==='')return;
 c.save();c.font=font(size,bold);c.direction=align==='right'?'rtl':'ltr';
 c.textAlign=align;c.textBaseline='middle';c.fillStyle='#111';
 if(maxWidth!==null)c.fillText(String(value),x,y,maxWidth);
 else c.fillText(String(value),x,y);
 c.restore();
}
function dataRow(c,x,y,w,h,label,cents,code,sign,opts={}){
 box(c,x,y,w,h,0.48);const amountW=76,codeW=26;
 line(c,x+codeW,y,x+codeW,y+h,0.55);
 line(c,x+w-amountW,y,x+w-amountW,y+h,0.55);
 text(c,code,x+3,y+h/2,8.2,'left',true,codeW-5);
 text(c,label,x+w-amountW-6,y+h/2,opts.fontSize||9.4,'right',opts.bold||false,w-amountW-codeW-10);
 if(cents!==null&&cents!==undefined && (cents!==0||opts.showZero)){
  text(c,money(cents),x+w-amountW+5,y+h/2,10,'left',true,amountW-12);
 }
 if(sign)text(c,sign,x+w-3,y+h/2,7.5,'right',false,12);
}
function drawHeader(c,x,y,w,label,code,mark,cents){
 box(c,x,y,w,42,1.6);const amountW=86;line(c,x+w-amountW,y,x+w-amountW,y+42,1.3);
 text(c,code,x+4,y+31,8.3,'left',true,26);
 text(c,label,x+w-amountW-12,y+22,11.6,'right',true,w-amountW-45);
 if(cents!==null&&cents!==undefined)text(c,money(cents),x+w-amountW+5,y+23,13,'left',true,amountW-16);
 text(c,mark,x+w-4,y+8,8.6,'right',true,12);
}
function drawWhishBox(c,x,y,w,title,groups,total,isLeft,balance){
 const headerHeight=29, rowHeight=23, count=5;
 box(c,x,y,w,headerHeight+rowHeight*count,1.2);
 line(c,x+w-77,y,x+w-77,y+headerHeight+count*rowHeight,0.85);
 line(c,x,y+headerHeight,x+w,y+headerHeight,1.3);
 text(c,title,x+w-83,y+headerHeight/2,12,'right',true,w-95);
 text(c,money(total),x+w-71,y+headerHeight/2,10.5,'left',true,60);
 for(let i=0;i<count;i++){
  const yy=y+headerHeight+i*rowHeight;
  if(i>0)line(c,x,yy,x+w,yy,0.5);
  const e=groups[i];
  if(isLeft&&i===count-1){
   text(c,'رصيد الوش',x+w-83,yy+rowHeight/2,10.3,'right',true,w-90);
   text(c,money(balance),x+w-72,yy+rowHeight/2,10.1,'left',true,65);
  }else if(e){
   text(c,e.name,x+w-83,yy+rowHeight/2,9.1,'right',false,w-90);
   text(c,money(e.amount_cents),x+w-72,yy+rowHeight/2,9.9,'left',true,62);
  }
 }
}
function footerValue(c,x,y,w,label,cents){
 box(c,x,y,w,41,1.3);line(c,x+w-84,y,x+w-84,y+41,0.9);
 text(c,label,x+w-92,y+21,10.2,'right',true,w-100);
 if(cents!==null&&cents!==undefined)text(c,money(cents),x+w-78,y+21,12,'left',true,75);
}
function drawMain(sheet){
 const {c,canvas}=createPage();
 const left=30,right=309,leftW=268,rightW=273;
 text(c,'التاريخ',445,47,10.5,'right',true);
 text(c,sheet.dateArabic,387,47,10.8,'right',true);
 text(c,'رقم القيد: '+sheet.entryNumber,right+rightW,47,10.5,'right',true);
 drawHeader(c,left,63,leftW,'شراء من الصندوق','5301','C',sheet.expenses);
 drawHeader(c,right,63,rightW,'مبيعات في الصندوق','5301','D',sheet.totalGenerated);
 const h=21.5,start=105;
 sheet.expenseRows.forEach((row,i)=>dataRow(c,left,start+i*h,leftW,h,row[0],row[1],row[2],'D'));
 sheet.amountRows.forEach((row,i)=>dataRow(c,right,start+i*h,rightW,h,row[0],row[1],row[2],'C'));
 // Fees for all Private Sessions (including those with $0 paid) are displayed
 // here, separately from the 401 amounts actually paid by clients.
 const ty=303,th=21.7;
 box(c,left,ty,leftW,31,1.2);line(c,left+44,ty,left+44,ty+31,0.8);
 text(c,'No',left+9,ty+16,9,'left',true);
 text(c,'ساعات تدريب',left+leftW-10,ty+16,13,'right',true);
 for(let i=0;i<8;i++){
  const yy=ty+31+i*th;
  box(c,left,yy,leftW,th,0.54);
  line(c,left+44,yy,left+44,yy+th,0.5);
  line(c,left+leftW-76,yy,left+leftW-76,yy+th,0.5);
  const session=sheet.trainingRows[i];
  if(session){
   text(c,session.clientCode,left+5,yy+th/2,10.1,'left',true,36);
   text(c,session.clientName,left+leftW-82,yy+th/2,10,'right',false,leftW-134);
   text(c,money(session.sessionFeeCents),left+leftW-72,yy+th/2,10,'left',true,65);
  }
  text(c,'D',left+leftW-4,yy+th/2,7.5,'right');
 }
 const wy=510;
 drawWhishBox(c,left,wy,leftW,'مجموع خروج صندوق وش',sheet.whishOut,sheet.whishPdfWithdrawalsToday,true,sheet.walletBalance);
 drawWhishBox(c,right,wy,rightW,'مجموع دخول صندوق وش',sheet.whishIn,sheet.whishPdfDepositsToday,false,null);
 footerValue(c,left,688,leftW,'يوجد في الصندوق اليوم',null);
 footerValue(c,right,688,rightW,'نقداً بعد صرف اليوم',sheet.closingCash);
 box(c,right,733,rightW,27,0.9);line(c,right+rightW-84,733,right+rightW-84,760,0.7);
 text(c,'الصندوق القديم',right+rightW-92,746.5,9.8,'right',true);
 text(c,'PADEL ON  •  نموذج محاسبة يومي',right+rightW,777,7.7,'right');
 return canvas;
}
export function pdfFromCanvasPages(canvases){
 // Minimal PDF 1.4 writer with a JPEG XObject per letter-sized page.
 // All rasterization and PDF creation happen in memory in the browser.
 const encoder=new TextEncoder(),parts=[];let offset=0;
 const positions=[0];
 const push=x=>{const b=typeof x==='string'?encoder.encode(x):x;parts.push(b);offset+=b.length;};
 const object=(id,body)=>{positions[id]=offset;push(id+' 0 obj\n');push(body);push('\nendobj\n');};
 push('%PDF-1.4\n%PADELON\n');
 const refs=canvases.map((_,i)=>(3+i*3)+' 0 R').join(' ');
 object(1,'<< /Type /Catalog /Pages 2 0 R >>');
 object(2,'<< /Type /Pages /Kids ['+refs+'] /Count '+canvases.length+' >>');
 for(let i=0;i<canvases.length;i++){
  const jpeg=atob(canvases[i].toDataURL('image/jpeg',0.95).split(',')[1]);
  const img=new Uint8Array(jpeg.length);
  for(let j=0;j<jpeg.length;j++)img[j]=jpeg.charCodeAt(j);
  const p=3+i*3,im=p+1,ct=p+2;
  object(p,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+W+' '+H+'] /Resources << /XObject << /Image'+i+' '+im+' 0 R >> >> /Contents '+ct+' 0 R >>');
  positions[im]=offset;
  push(im+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+canvases[i].width+' /Height '+canvases[i].height+
   ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+img.length+' >>\nstream\n');
  push(img);push('\nendstream\nendobj\n');
  const stream='q '+W+' 0 0 '+H+' 0 0 cm /Image'+i+' Do Q\n';
  object(ct,'<< /Length '+encoder.encode(stream).length+' >>\nstream\n'+stream+'endstream');
 }
 const xref=offset,totalObjects=2+canvases.length*3;
 push('xref\n0 '+(totalObjects+1)+'\n0000000000 65535 f \n');
 for(let i=1;i<=totalObjects;i++)push(String(positions[i]).padStart(10,'0')+' 00000 n \n');
 push('trailer\n<< /Size '+(totalObjects+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n');
 return new Blob(parts,{type:'application/pdf'});
}
export function makeArabicDailySheetPdf(input){
 const sheet=prepareArabicDailySheet(input);
 // Export only the original Arabic accounting sheet, not detail appendices.
 // Retain raw details in prepareArabicDailySheet for calculations and auditing.
 const canvases=[drawMain(sheet)];
 return {pdf:pdfFromCanvasPages(canvases),pages:canvases.length,sheet};
}
export function downloadArabicPdfBlob(pdf,date){
 if(!(pdf instanceof Blob)||pdf.type!=='application/pdf')throw Error('A generated PDF is required.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw Error('Invalid PDF date.');
 const link=document.createElement('a');
 const url=URL.createObjectURL(pdf);
 link.href=url;
 link.download=ARABIC_SHEET_FILENAME_PREFIX+'-'+date+'.pdf';
 document.body.append(link);
 link.click();
 link.remove();
 // Give the browser time to initiate the local download.
 setTimeout(()=>URL.revokeObjectURL(url),5000);
 return link.download;
}
export function openArabicPdfBlob(pdf,date){
 if(!(pdf instanceof Blob)||pdf.type!=='application/pdf')throw Error('A generated PDF is required.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))throw Error('Invalid PDF date.');
 const url=URL.createObjectURL(pdf);
 const preview=globalThis.open?.(url,'_blank');
 if(!preview){
  URL.revokeObjectURL(url);
  throw Error('Allow pop-ups for PADEL ON, then try opening the PDF again.');
 }
 try{preview.opener=null}catch{}
 // The new tab loads the Blob locally. Keep the URL alive long enough for
 // Chrome's PDF viewer to finish reading it, then release it from memory.
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return ARABIC_SHEET_FILENAME_PREFIX+'-'+date+'.pdf';
}
export function downloadArabicDailySheet(input){
 const {pdf,pages}=makeArabicDailySheetPdf(input);
 downloadArabicPdfBlob(pdf,input.date);
 return pages;
}
export function previewArabicDailySheet(input){
 const {pdf,pages}=makeArabicDailySheetPdf(input);
 openArabicPdfBlob(pdf,input.date);
 return pages;
}
