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
  {entry_date:DAY,category:'grips',name:'Grip',amount_cents:1400},
  {entry_date:DAY,category:'balls',name:'Balls',amount_cents:2000},
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
 assert.equal(sheet.amountRows.find(x=>x[0]==='طابات / جربات')[1],3400);
 assert.equal(sheet.amountRows.find(x=>x[0]==='مشترك - جلسات خاصة')[2],'401');
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
  assert.ok(calls.some(label=>label.includes('تفاصيل القيود اليومية')));
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
