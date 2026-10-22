import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareArabicDailySheet,makeArabicDailySheetPdf,downloadArabicDailySheet} from '../lib/arabic-daily-pdf.js';

const DAY='2026-10-21';
const sample=()=>({
 date:DAY,
 rows:[
  {entry_date:DAY,category:'padel_courts',name:'Padel A',amount_cents:13400},
  {entry_date:DAY,category:'basketball_courts',name:'Match',amount_cents:1000},
  {entry_date:DAY,category:'gymnastics',name:'Class',amount_cents:10000},
  {entry_date:DAY,category:'grips',name:'Grip',amount_cents:1400,quantity:3},
  {entry_date:DAY,category:'balls',name:'Balls',amount_cents:2000,quantity:2},
  {entry_date:DAY,category:'racket_rental',name:'Rental',amount_cents:200},
  {entry_date:DAY,category:'cafeteria_stock',name:'Water',amount_cents:23900},
  {entry_date:DAY,category:'coaches',name:'Coach',amount_cents:3600},
  {entry_date:DAY,category:'padel_courts',name:'Voided court',amount_cents:99999,voided_at:'x'},
  {entry_date:'2026-10-20',category:'padel_courts',name:'Yesterday',amount_cents:5000}
 ],
 privatePayments:[
  {entry_date:DAY,type:'Session payment',clientName:'Client 1',clientCode:'PS-42',amount_cents:2500},
  {entry_date:DAY,type:'Deposit / top-up',clientName:'Client 2',clientCode:'PS-72',amount_cents:1000}
 ],
 privateSessions:[
  {entry_date:DAY,clientName:'Jana Bleibel',clientCode:'2',sessionFeeCents:3000,paidAtSessionCents:0},
  {entry_date:DAY,clientName:'Ali Akhdar',clientCode:'49',sessionFeeCents:2500,paidAtSessionCents:0}
 ],
 whishRows:[
  {entry_date:DAY,entry_type:'deposit',name:'Goods Sold',amount_cents:1180},
  {entry_date:DAY,entry_type:'deposit',name:'Basketball',amount_cents:1000},
  {entry_date:DAY,entry_type:'deposit',name:'Pickleball',amount_cents:400},
  {entry_date:DAY,entry_type:'withdrawal',name:'Whish withdrawal',amount_cents:200},
  {entry_date:'2026-10-20',entry_type:'deposit',name:'Old',amount_cents:900},
  {entry_date:DAY,entry_type:'deposit',name:'Voided',amount_cents:9999,voided_at:'x'}
 ],
 whishOpening:60,closingCash:null
});

test('Arabic sheet matches the numbered account structure without inventing missing cash values',()=>{
 const sheet=prepareArabicDailySheet(sample());
 assert.equal(sheet.dateArabic,'21 / 10 / 2026');
 assert.equal(sheet.amountRows.find(x=>x[0]==='ملعب بادل')[1],13400);
 assert.equal(sheet.amountRows.find(x=>x[0]==='ملعب باسكت')[1],1000);
 assert.equal(sheet.amountRows.find(x=>x[0]==='صف تدريب جمناستك')[1],10000);
 assert.equal(sheet.amountRows.find(x=>x[0].startsWith('طابات (2) / جربات (3)'))[1],3400);
 assert.equal(sheet.amountRows.find(x=>x[0].includes('Client 1')&&x[0].includes('PS-42'))[2],'401');
 assert.equal(sheet.amountRows.find(x=>x[0].includes('Client 2')&&x[0].includes('PS-72'))[1],1000);
 assert.equal(sheet.trainingRows[0].clientName,'Jana Bleibel');
 assert.equal(sheet.trainingRows[0].clientCode,'2');
 assert.equal(sheet.trainingRows[0].sessionFeeCents,3000);
 assert.equal(sheet.trainingRows[1].clientName,'Ali Akhdar');
 assert.equal(sheet.trainingRows[1].clientCode,'49');
 assert.equal(sheet.trainingRows[1].sessionFeeCents,2500);
 assert.equal(sheet.expenseRows.find(x=>x[0]==='مدرب')[2],'631');
 assert.equal(sheet.expenseRows.find(x=>x[0]==='مشتريات بوظة / ماء')[1],23900);
 assert.equal(sheet.whishDepositsToday,2580);
 assert.equal(sheet.walletBalance,3340);
 assert.equal(sheet.closingCash,null);
 assert.equal(sheet.goodsSold,null);
 assert.equal(sheet.totalGenerated,null);
 assert.ok(sheet.missingFields.includes('الصندوق القديم'));
 assert.ok(sheet.details.some(x=>x.identifier==='PS-42'));
 assert.ok(!sheet.details.some(x=>x.name==='Voided court'));
 assert.ok(!sheet.details.some(x=>x.name==='Yesterday'));
});

test('Arabic sheet derives Goods Sold from known daily cash and appends per-entry detail',()=>{
 const x=sample();
 x.closingCash=15000;
 const sheet=prepareArabicDailySheet(x);
 assert.equal(sheet.expenses,27500);
 // Received: 134+10+100+14+20+2+25+10 = $315.
 assert.equal(sheet.receipts,31500);
 assert.equal(sheet.totalGenerated,42500);
 assert.equal(sheet.goodsSold,11000);
 assert.equal(sheet.amountRows.find(x=>x[0]==='مبيع متفرقات')[1],11000);
 assert.equal(sheet.details.filter(x=>x.section==='دفعات المشتركين').length,2);
});

test('All Whish transactions are kept separate from the cash drawer',()=>{
 const original=sample(),sheet=prepareArabicDailySheet(original);
 const extra=sample();
 extra.whishRows.push({entry_date:DAY,entry_type:'deposit',name:'Extra Whish',amount_cents:20000});
 const changed=prepareArabicDailySheet(extra);
 assert.equal(sheet.receipts,changed.receipts);
 assert.equal(sheet.expenses,changed.expenses);
 assert.equal(sheet.goodsSold,changed.goodsSold);
 assert.equal(changed.walletBalance-sheet.walletBalance,20000);
});

test('Local PDF has a letter-sized Arabic main sheet and appendices without uploads',async()=>{
 const prev=globalThis.document;
 const calls=[];
 // This tiny JPEG payload is only for mocking the canvas API in the PDF unit test.
 const mockJpeg='data:image/jpeg;base64,/9j/2Q==';
 const fakeContext={
  save(){},restore(){},scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},stroke(){},fillText(str){calls.push(String(str));}
 };
 try{
  globalThis.document={createElement(kind){
   assert.equal(kind,'canvas');
   return {getContext:()=>fakeContext,toDataURL:()=>mockJpeg,width:1346,height:1742};
  }};
  const x=sample();
  // More than 42 records: the export must add multiple continuation pages.
  for(let i=0;i<95;i++)x.rows.push({entry_date:DAY,category:'other_income',name:'Extra '+i,amount_cents:100});
  const {pdf,pages}=makeArabicDailySheetPdf(x);
  assert.equal(pages,4);
  assert.equal(pdf.type,'application/pdf');
  const data=Buffer.from(await pdf.arrayBuffer());
  const content=data.toString('latin1');
  assert.ok(content.startsWith('%PDF-1.4\n'));
  assert.ok(content.endsWith('%%EOF\n'));
  assert.match(content,/\/MediaBox \[0 0 612 792\]/);
  assert.match(content,/\/Count 4/);
  assert.match(content,/startxref\n\d+\n%%EOF/);
  assert.ok(calls.some(label=>label.includes('مبيعات في الصندوق')));
  assert.ok(calls.some(label=>label.includes('مجموع خروج صندوق وش')));
  assert.ok(calls.some(label=>label.includes('الصندوق القديم')));
  assert.ok(calls.some(label=>label.includes('تفاصيل القيود النقدية')));
 }finally{globalThis.document=prev;}
});

test('Download uses a browser-only Blob URL and never invokes an HTTP upload',()=>{
 const saved={document:globalThis.document,URL:globalThis.URL,setTimeout:globalThis.setTimeout};
 let name='',clicked=0,urlCreated=0;
 const ctx={
  save(){},restore(){},scale(){},fillRect(){},strokeRect(){},beginPath(){},
  moveTo(){},lineTo(){},stroke(){},fillText(){}
 };
 try{
  globalThis.document={
   body:{append(){}},
   createElement(tag){
    if(tag==='canvas')return {getContext:()=>ctx,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',width:1346,height:1742};
    return {set download(v){name=v},set href(v){},click(){clicked++},remove(){}};
   }
  };
  globalThis.URL={createObjectURL:()=>{urlCreated++;return 'blob:local'},revokeObjectURL(){}};
  globalThis.setTimeout=fn=>fn();
  const pages=downloadArabicDailySheet(sample());
  assert.equal(pages,2);
  assert.equal(clicked,1);
  assert.equal(urlCreated,1);
  assert.equal(name,'padel-on-daily-sheet-2026-10-21.pdf');
 }finally{
  globalThis.document=saved.document;
  globalThis.URL=saved.URL;
  globalThis.setTimeout=saved.setTimeout;
 }
});

test('special named income and expense categories map only to their own lines',()=>{
 const x=sample();
 x.rows.push(
  {entry_date:DAY,category:'classes',amount_cents:2200},
  {entry_date:DAY,category:'pt_gym',amount_cents:1700},
  {entry_date:DAY,category:'pickleball_courts',amount_cents:1200},
  {entry_date:DAY,category:'other_income',name:'Basketball Academy',amount_cents:2900},
  {entry_date:DAY,category:'other_income',name:'Summer Course',amount_cents:3200},
  {entry_date:DAY,category:'other_income',name:'Shoes',amount_cents:1800},
  {entry_date:DAY,category:'other_income',name:'Unlisted Income',amount_cents:400},
  {entry_date:DAY,category:'racket_sold',name:'New racket',amount_cents:7000},
  {entry_date:DAY,category:'other_expense',name:'Family Debt',amount_cents:1400},
  {entry_date:DAY,category:'other_expense',name:'Stationery',amount_cents:320},
  {entry_date:DAY,category:'general_payment',amount_cents:500}
 );
 const sheet=prepareArabicDailySheet(x);
 const row=label=>sheet.amountRows.find(r=>r[0]===label);
 const paid=label=>sheet.expenseRows.find(r=>r[0]===label);
 assert.equal(row('ملعب بيكل بول')[1],1200);
 assert.equal(row('صف تدريب طابق أول')[1],2200);
 assert.equal(row('صف جم')[1],1700);
 assert.equal(row('أكاديمية باسكت')[1],2900);
 assert.equal(row('دورة الصيف')[1],3200);
 assert.equal(row('أحذية')[1],1800);
 assert.equal(row('طاولة بينغ بونغ')[1],null);
 assert.equal(row('مبيع متفرقات')[1],null);
 assert.equal(paid('دين عائلة')[1],1400);
 assert.equal(paid('صرف متفرقات / نادي')[1],500);
 assert.equal(paid('Stationery')[1],320);
 assert.ok(sheet.details.some(r=>r.section==='إيرادات أخرى'&&r.name==='Unlisted Income'));
 assert.ok(sheet.details.some(r=>r.section==='بيع راكات'&&r.name==='New racket'));
 assert.equal(sheet.receipts,31500+2200+1700+1200+2900+3200+1800+400+7000);
 assert.equal(sheet.expenses,27500+1400+320+500);
});
test('extra client payments and miscellaneous entries survive overflow into details',()=>{
 const x=sample();
 for(let i=0;i<12;i++){
  x.privatePayments.push({entry_date:DAY,type:'Deposit / top-up',clientName:'Person '+i,clientCode:String(i+10),amount_cents:100+i});
  x.privateSessions.push({entry_date:DAY,clientName:'Training '+i,clientCode:String(100+i),sessionFeeCents:3000+i,paidAtSessionCents:0});
  x.rows.push({entry_date:DAY,category:'other_expense',name:'Expense '+i,amount_cents:500+i});
 }
 const sheet=prepareArabicDailySheet(x);
 assert.equal(sheet.amountRows.length,18);
 assert.equal(sheet.expenseRows.length,8);
 assert.equal(sheet.trainingRows.length,14);
 assert.ok(sheet.overflowIncome.length>0);
 assert.ok(sheet.overflowExpenses.length>0);
 assert.equal(sheet.overflowTraining.length,6);
 assert.ok(sheet.details.some(d=>d.name==='Training 11'&&d.identifier==='111'));
 assert.ok(sheet.details.some(d=>d.name==='Expense 11'));
 assert.ok(sheet.details.some(d=>d.name.includes('Person 11')));
});
test('Whish balance reflects the complete wallet, but its daily rows use selected date only',()=>{
 const x=sample();
 const old=prepareArabicDailySheet(x);
 x.whishRows.push({entry_date:'2026-10-22',entry_type:'deposit',name:'Later transfer',amount_cents:3000});
 const now=prepareArabicDailySheet(x);
 assert.equal(now.walletBalance,old.walletBalance+3000);
 assert.equal(now.whishDepositsToday,old.whishDepositsToday);
 assert.ok(!now.whishIn.some(e=>e.name==='Later transfer'));
 assert.equal(now.expenses,old.expenses);
 assert.equal(now.totalGenerated,old.totalGenerated);
});
test('PDF paints opening cash headers and only the prescribed bottom closing-cash value',async()=>{
 const save=globalThis.document;
 const paints=[];
 const ctx={save(){},restore(){},scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},stroke(){},fillText(value,x,y){paints.push({value:String(value),x,y});}};
 try{
  globalThis.document={createElement:()=>({
   width:1346,height:1742,getContext:()=>ctx,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q=='
  })};
  const x=sample();x.closingCash=15000;
  makeArabicDailySheetPdf(x);
  // Cash header: expenses $275.00; sales generated $425.00.
  assert.ok(paints.some(p=>p.value==='275.00'&&p.y===86));
  assert.ok(paints.some(p=>p.value==='425.00'&&p.y===86));
  // Closing cash only goes in نقداً بعد صرف اليوم on the right.
  assert.ok(paints.some(p=>p.value==='150.00'&&p.y===709&&p.x>300));
  assert.ok(!paints.some(p=>p.value==='150.00'&&p.y===709&&p.x<300));
  assert.ok(paints.some(p=>p.value==='Jana Bleibel'));
  assert.ok(paints.some(p=>p.value==='Ali Akhdar'));
 }finally{globalThis.document=save;}
});

test('Whish duplicate and overflowing groups get a separate Arabic appendix, not a cash detail page',async()=>{
 const sheetInput=sample();
 sheetInput.whishRows.push(
  {entry_date:DAY,entry_type:'deposit',name:'Goods Sold',amount_cents:300},
  {entry_date:DAY,entry_type:'deposit',name:'Other A',amount_cents:100},
  {entry_date:DAY,entry_type:'deposit',name:'Other B',amount_cents:200},
  {entry_date:DAY,entry_type:'deposit',name:'Other C',amount_cents:300}
 );
 const sheet=prepareArabicDailySheet(sheetInput);
 assert.equal(sheet.whishDetailPageRequired,true);
 assert.ok(sheet.whishDetails.length>sheet.whishIn.length+sheet.whishOut.length);
 assert.doesNotMatch(JSON.stringify(sheet.details),/Whish withdrawal/);
 assert.match(JSON.stringify(sheet.whishDetails),/Whish withdrawal/);
 const prev=globalThis.document,labels=[];
 const ctx={save(){},restore(){},scale(){},fillRect(){},strokeRect(){},beginPath(){},moveTo(){},
  lineTo(){},stroke(){},fillText(v){labels.push(String(v));}};
 try{
  globalThis.document={createElement:()=>({
   getContext:()=>ctx,toDataURL:()=>'data:image/jpeg;base64,/9j/2Q==',width:1346,height:1742
  })};
  const {pages}=makeArabicDailySheetPdf(sheetInput);
  assert.equal(pages,3);
  assert.ok(labels.some(v=>v==='تفاصيل القيود النقدية'));
  assert.ok(labels.some(v=>v==='تفاصيل صندوق وش'));
 }finally{globalThis.document=prev}
});

test('dedicated categories and older miscellaneous entries share their matching Arabic PDF rows',()=>{
 const x=sample();
 x.rows.push(
  {entry_date:DAY,category:'summer_camp',amount_cents:1200},
  {entry_date:DAY,category:'summer_camp',amount_cents:600},
  {entry_date:DAY,category:'shoes',amount_cents:2700},
  {entry_date:DAY,category:'basketball_academy',amount_cents:900},
  {entry_date:DAY,category:'family_debt',amount_cents:400},
  {entry_date:DAY,category:'family_debt',amount_cents:500},
  {entry_date:DAY,category:'other_income',name:'Summer Camp',amount_cents:200},
  {entry_date:DAY,category:'other_income',name:'Shoes',amount_cents:300},
  {entry_date:DAY,category:'other_income',name:'Basketball Academy',amount_cents:100},
  {entry_date:DAY,category:'other_expense',name:'Family Debt',amount_cents:250}
 );
 const sheet=prepareArabicDailySheet(x);
 assert.equal(sheet.amountRows.find(r=>r[0]==='دورة الصيف')[1],2000);
 assert.equal(sheet.amountRows.find(r=>r[0]==='أحذية')[1],3000);
 assert.equal(sheet.amountRows.find(r=>r[0]==='أكاديمية باسكت')[1],1000);
 assert.equal(sheet.expenseRows.find(r=>r[0]==='دين عائلة')[1],1150);
 assert.equal(sheet.receipts,31500+1800+2700+900+600);
 assert.equal(sheet.expenses,27500+900+250);
 assert.ok(sheet.details.some(e=>e.section==='دورة الصيف'));
 assert.ok(sheet.details.some(e=>e.section==='أحذية'));
 assert.ok(sheet.details.some(e=>e.section==='أكاديمية باسكت'));
 assert.ok(sheet.details.some(e=>e.section==='دين عائلة'));
 assert.ok(!sheet.amountRows.some(e=>e[0]==='Summer Camp'||e[0]==='Shoes'));
});
test('Whish PDF converts Goods Sold and cash-box transfer only and keeps data independent',()=>{
 const input=sample();
 input.whishRows.push(
  {entry_date:DAY,entry_type:'deposit',name:'goods sold',amount_cents:175},
  {entry_date:DAY,entry_type:'deposit',name:'مبيع متفرقات',amount_cents:225},
  {entry_date:DAY,entry_type:'withdrawal',name:'Transfer from Whish to Miscellaneous Cash Box',amount_cents:560},
  {entry_date:DAY,entry_type:'withdrawal',name:'خروج إلى صندوق متفرقات',amount_cents:140},
  {entry_date:DAY,entry_type:'withdrawal',name:'Other withdrawal',amount_cents:300}
 );
 const before=JSON.parse(JSON.stringify(input));
 const sheet=prepareArabicDailySheet(input);
 assert.equal(sheet.whishIn.find(e=>e.name==='مبيع متفرقات').amount_cents,1580);
 assert.equal(sheet.whishOut.find(e=>e.name==='خروج إلى صندوق متفرقات').amount_cents,700);
 assert.ok(sheet.whishOut.some(e=>e.name==='Other withdrawal'));
 assert.ok(sheet.whishDetails.some(e=>e.name==='خروج إلى صندوق متفرقات'));
 assert.ok(!sheet.whishDetails.some(e=>e.name==='Transfer from Whish to Miscellaneous Cash Box'));
 assert.ok(!sheet.whishDetails.some(e=>e.name==='Goods Sold'));
 assert.ok(!sheet.details.some(e=>e.name==='خروج إلى صندوق متفرقات'));
 assert.deepEqual(input,before);
 const noWhish=prepareArabicDailySheet(sample());
 assert.equal(sheet.receipts,noWhish.receipts);
 assert.equal(sheet.expenses,noWhish.expenses);
 assert.equal(sheet.totalGenerated,noWhish.totalGenerated);
});
