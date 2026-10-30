import test from 'node:test';
import assert from 'node:assert/strict';
import {parseReceipt} from '../../frontend/src/utils/receiptParser';
test('OCR parser: Buddhist/Gregorian dates, Thai numerals, wall clock and exact decimal',()=>{
 for(const date of ['29/02/2567','2024-02-29','29 ก.พ. 2567'])assert.equal(parseReceipt(date).fields.transactionDate,'2024-02-29');
 const r=parseReceipt('วันที่ ๑๓/๑๐/๒๕๖๙\nเวลา 9:05\nจำนวนเงิน 1,234.07 บาท\nผู้รับเงิน: ร้านทดสอบ');
 assert.deepEqual(r.fields,{transactionDate:'2026-10-13',transactionTime:'09:05',amount:'1234.07',description:'ร้านทดสอบ'});
 assert.equal(parseReceipt('amount 0.07').fields.amount,'0.07');
 assert.equal(parseReceipt('\u0e08\u0e4d\u0e32\u0e19\u0e27\u0e19\u0e40\u0e07\u0e34\u0e19 123.45').fields.amount,'123.45');
});
test('OCR parser: no guessed fields, invalid/ambiguous values, fee not selected',()=>{
 for(const text of ['', '29/02/2025\n25:80\nค่าธรรมเนียม 100.00','ชื่อผู้โอน: Test'])
  assert.deepEqual(parseReceipt(text).fields,{transactionDate:null,transactionTime:null,amount:null,description:null});
 const r=parseReceipt('01/01/2024\n02/01/2024\n10:00\n11:00\namount 100.00\namount 200.00\nrecipient: A\nrecipient: B');
 assert.ok(Object.values(r.fields).every(v=>v===null));assert.ok(r.issues.every(v=>v.endsWith('_ambiguous')));
 assert.equal(parseReceipt('ยอดชำระ 100.00\nค่าธรรมเนียม 5.00').fields.amount,'100.00');
 assert.equal(parseReceipt('amount 0.00').fields.amount,null);
 assert.equal(parseReceipt('amount 99999999999.99').fields.amount,null);
});

test('English multiline slip',()=>{const r=parseReceipt('25 Mar 25, 13:13\nAmount\n400,000.00 THB\nTo\nEXAMPLE SHOP\nFee\n0.00 THB');assert.deepEqual(r.fields,{transactionDate:'2025-03-25',transactionTime:'13:13',amount:'400000.00',description:'EXAMPLE SHOP'});assert.equal(parseReceipt('Amount\nFee 50.00').fields.amount,null);});

test('All total labels, currencies, multiline and excluded tender/tax',()=>{
 for(const label of ['AMOUNT','AMT','TOTAL','GRAND TOTAL','TOTAL DUE','NET AMOUNT','BALANCE DUE','จำนวนเงิน','ยอดสุทธิ','ยอดรวม']){
  for(const value of ['$1,234.07','1,234.07 THB','฿ 1234.07','EUR 1234.07'])
   assert.equal(parseReceipt(label+'\n'+value).fields.amount,'1234.07');
 }
 const text='SUBTOTAL 100.00\nTAX 7.00\nVAT 7.00\nTOTAL DUE $107.00\nTOTAL PAID 200.00\nAMOUNT PAID 200.00\nCASH 200.00\nCHANGE 93.00\nBALANCE 999.00';
 assert.equal(parseReceipt(text).fields.amount,'107.00');
 for(const label of ['SUBTOTAL','TAX','VAT','TOTAL PAID','AMOUNT PAID','CASH','CHANGE','เงินทอน','ค่าธรรมเนียม'])
  assert.equal(parseReceipt(label+' 100.00').fields.amount,null);
 for(const value of ['1,23.45','12.345','100.00 200.00'])assert.equal(parseReceipt('TOTAL '+value).fields.amount,null);
});
test('Conflicting totals remain blank with labeled choices; repeated totals agree',()=>{
 const r=parseReceipt('BALANCE DUE 57.00\nยอดรวม 107.00');
 assert.equal(r.fields.amount,null);assert.deepEqual(r.amountCandidates.map(c=>c.value),['57.00','107.00']);
 assert.equal(parseReceipt('TOTAL 107.00\nยอดรวม 107.00').fields.amount,'107.00');
});
test('Numeric dates are day-first (Thai), month-first only when day-first is impossible',()=>{
 assert.equal(parseReceipt('03/04/2025').fields.transactionDate,'2025-04-03');
 assert.equal(parseReceipt('05/10/2569').fields.transactionDate,'2026-10-05');
 assert.equal(parseReceipt('12/31/2025').fields.transactionDate,'2025-12-31');
 assert.equal(parseReceipt('31/12/2025').fields.transactionDate,'2025-12-31');
 assert.equal(parseReceipt('2025-04-03').fields.transactionDate,'2025-04-03');
 assert.equal(parseReceipt('03/03/2025').fields.transactionDate,'2025-03-03');
});

test('Thai bank label sections, short Buddhist years and transaction time vs phone clock',()=>{
 const r=parseReceipt('9:41\nโอนเงินสำเร็จ\n26 ม.ค. 65 05:10 น.\nจำนวน:\n888.00 บาท =\nค่าธรรมเนียม: 0.00 บาท\nยอดเงินคงเหลือ: 83,888.00 บาท');
 assert.equal(r.fields.transactionDate,'2022-01-26');assert.equal(r.fields.transactionTime,'05:10');assert.equal(r.fields.amount,'888.00');assert.equal(r.fields.description,null);
 const scan=parseReceipt('9:41\n18 ส.ค. 61 8:55 น.\nจำนวน: QR\nnoise\n: 888.88 บาท =\nค่าธรรมเนียม: 0.00 บาท');
 assert.equal(scan.fields.transactionDate,'2018-08-18');assert.equal(scan.fields.transactionTime,'08:55');assert.equal(scan.fields.amount,'888.88');
 const bulk=parseReceipt('จำนวนเงินรวมทั้งสิ้น 7,403.00 THB\nจำนวนเงินค่าธรรมเนียม 0.00 THB\nจำนวนรายการ 2 รายการ\nวันที่มีผล 07 ก.ค. 2023');
 assert.equal(bulk.fields.amount,'7403.00');assert.equal(bulk.fields.transactionDate,'2023-07-07');assert.equal(bulk.fields.transactionTime,null);
});
test('QR noise never repairs digits, crosses fee boundary or chooses conflicting values',()=>{
 for(const text of ['จำนวน:\nค่าธรรมเนียม: 5.00 บาท','จำนวน: 10.00 บาท\n20.00 บาท','จำนวน:\n7,.403.00 บาท','จำนวนรายการ 2 รายการ\nยอดเงินคงเหลือ 888.00 บาท'])
  assert.equal(parseReceipt(text).fields.amount,null);
 assert.equal(parseReceipt('9:41\n18 ส.ค. 61 8:55 น.\n18 ส.ค. 61 9:10 น.').fields.transactionTime,null);
});

test('Bank Amount on following line: comma decimals, OCR currency noise, fee/reference exclusion',()=>{
 for(const value of ['400,000.00 THB','400,000.00 ts','400000.00 THB']){
  const result=parseReceipt('25 Mar 25, 13:13\nAmount\n\n'+value+'\nFee\n0.00 THB\nBank reference no.\n987654\nTransaction reference\n20250325131352300010000000');
  assert.equal(result.fields.transactionDate,'2025-03-25');
  assert.equal(result.fields.transactionTime,'13:13');
  assert.equal(result.fields.amount,'400000.00');
  assert.deepEqual(result.amountCandidates,[{label:'Amount',value:'400000.00'}]);
 }
 for(const raw of [
  'Amount\nFee\n0.00 THB\nBank reference no.\n987654',
  'Amount\nBank reference no.\n987654\nFee\n0.00 THB',
  'Fee\n0.00 THB\nTransaction reference\n20250325131352300010000000',
  'Amount\n400,000.00 THB\nAmount\n300,000.00 THB\nFee\n0.00 THB'
 ])assert.equal(parseReceipt(raw).fields.amount,null);
});

test('User raw OCR currency artifacts 8/m8 retain valid labeled money',()=>{
 for(const suffix of ['8','m8']){
 const result=parseReceipt('25 Mar 25, 13:13\nAmount\n400,000.00 '+suffix+'\nFee\n0.00 THB\nBank reference no.\n987654');
 assert.equal(result.fields.amount,'400000.00');assert.ok(result.issues.includes('currency_ocr_uncertain'));
 }
 for(const raw of ['Amount\n400,000.00 200\nFee 0.00 THB','Amount\n400,000.00 8','Fee\n400,000.00 m8\n0.00 THB','Amount\n400,000.008\nFee 0.00 THB'])
 assert.equal(parseReceipt(raw).fields.amount,null);
});

test('Redacted retail receipt: explicit net total may include an item count',()=>{
 const receipt='ร้านตัวอย่าง\nSUBTOTAL 100.00\nส่วนลด 31.00\nVAT 4.51\nยอดสุทธิ 1 ชิ้น 69.00\nเงินสด/เงินทอน 100.00 31.00\nบิลนี้ประหยัด 31.00';
 const result=parseReceipt(receipt);
 assert.equal(result.fields.amount,'69.00');
 assert.deepEqual(result.amountCandidates,[{label:'ยอดสุทธิ',value:'69.00'}]);
 for(const text of ['ยอดสุทธิ: 1 ชิ้น 69.00 บาท','ยอดสุทธิ\n1 ชิ้น 69.00','ยอดสุทธิ 12 ชิ้น 1,069.00']){
  assert.equal(parseReceipt(text).fields.amount,text.includes('1,069')?'1069.00':'69.00');
 }
});

test('Redacted degraded retail OCR: bare numbers and non-total rows never supply amount',()=>{
 for(const text of [
  '69.00','1 ชิ้น 69.00','14 69.00',
  'SUBTOTAL 100.00\nส่วนลด 31.00\nภาษี 4.51\n69.00\nเงินสด/เงินทอน 100.00 31.00\nบิลนี้ประหยัด 31.00',
  'ยอดสุทธิ 1 ชิ้น','ยอดสุทธิ 1 ชิ้น 69.00 31.00',
  'ยอดสุทธิ 1 ชิ้น 69.00\nยอดชำระ 70.00',
  'ยอดสุทธิ\nภาษี 4.51\n69.00',
  'ส่วนลด 1 ชิ้น 31.00\nVAT 4.51\nCHANGE 31.00',
  'ยอดสุทธิ 1 ชิ้น 6x.00'
 ])assert.equal(parseReceipt(text).fields.amount,null,text);
});

test('7-Eleven redacted structure: pre-discount total, net quantity, savings and merchant',()=>{
 const header='CP ALL,7-Eleven สาขาตัวอย่าง\nVAT Included\nใบเสร็จรับเงิน/ใบกำกับภาษีอย่างย่อ';
 const body='สินค้า 100.00\nยอดรวม 100.00\nส่วนลดสินค้า 31.00\nยอดสุทธิ 1 ชิ้น 69.00\nเงินสด/เงินทอน 100.00 31.00\nบิลนี้ประหยัด 31.00';
 const r=parseReceipt(header+'\n'+body.replace('บิลนี้ประหยัด','R#000000001 P1:0000001 05/10/65 18:08\nบิลนี้ประหยัด'));
 assert.equal(r.fields.amount,'69.00');assert.equal(r.fields.description,'7-Eleven');
 assert.equal(r.fields.transactionDate,'2022-10-05');assert.equal(r.fields.transactionTime,'18:08');
 assert.deepEqual(r.amountCandidates,[{label:'ยอดสุทธิ',value:'69.00'}]);
 for(const net of ['69.00','14 69.00','ยอดสุทธิ 1 ชิ้น','ยอดสุทธิ 1 ชิ้น 6x.00']){
  assert.equal(parseReceipt(header+'\n'+body.replace('ยอดสุทธิ 1 ชิ้น 69.00',net)).fields.amount,null);
 }
 assert.equal(parseReceipt(header+'\n'+body.replace('บิลนี้ประหยัด','ยอดชำระ 70.00\nบิลนี้ประหยัด')).fields.amount,null);
 assert.equal(parseReceipt('สินค้า 7-Eleven 31.00\nบิลนี้ประหยัด 31.00').fields.description,null);
 assert.equal(parseReceipt('CP ALL,7-Eleven\nร้านค้า: ร้านอื่น').fields.description,null);
});

test('7-Eleven dates: day-first Buddhist dates; invalid or conflicting dates stay empty',()=>{
 for(const text of ['13/10/2565','13 ต.ค. 2565','13 ต.ค. 65','๑๓ ต.ค. ๒๕๖๕','13/10/65']){
  assert.equal(parseReceipt('CP ALL,7-Eleven\n'+text+' 18:08').fields.transactionDate,'2022-10-13');
 }
 assert.equal(parseReceipt('CP ALL,7-Eleven\n05/10/2565').fields.transactionDate,'2022-10-05');
 for(const text of ['31/02/2565','05/10/2565\n06/10/2565']){
  assert.equal(parseReceipt('CP ALL,7-Eleven\n'+text).fields.transactionDate,null,text);
 }
});

test('Document-aware payment and short Buddhist dates are suggestions only',()=>{
 const seven='CP ALL,7-Eleven สาขาตัวอย่าง\nใบเสร็จรับเงิน';
 for(const tender of ['เงินสด/เงินทอน 100.00 31.00','CASH 100.00\nCHANGE 31.00','เงินทอน 31.00']){
  const r=parseReceipt(seven+'\nยอดสุทธิ 1 ชิ้น 69.00\n'+tender+'\n05/10/65 18:08');
  assert.equal(r.fields.amount,'69.00');assert.equal(r.fields.transactionDate,'2022-10-05');
  assert.equal(r.suggestedPaymentMethod,'cash');
 }
 assert.equal(parseReceipt(seven+'\nบิลนี้ประหยัด 31.00').suggestedPaymentMethod,null);
 assert.equal(parseReceipt('เงินสด 100.00\n05/10/65').fields.transactionDate,null);
 assert.equal(parseReceipt('เงินสด 100.00').suggestedPaymentMethod,null);
 for(const d of ['31/02/65','05/10/65\n06/10/65'])assert.equal(parseReceipt(seven+'\n'+d).fields.transactionDate,null);
 for(const text of [
 'Bangkok Bank\nTransaction successful\nFrom\nSENDER\nTo\nRECEIVER\nAmount\n400,000.00 THB\nFee 0.00 THB',
 'K PLUS\nโอนเงินสำเร็จ\nจำนวน 888.00 บาท',
 'Krungthai\nทำรายการเสร็จสมบูรณ์\nจำนวนเงินรวมทั้งสิ้น 7,403.00 THB'
 ])assert.equal(parseReceipt(text).suggestedPaymentMethod,'transfer');
 assert.equal(parseReceipt('Bank reference no. 123456\nAmount 69.00').suggestedPaymentMethod,null);
 assert.equal(parseReceipt('TOTAL 69.00\nCASH 100.00\nCHANGE 31.00').suggestedPaymentMethod,null);
});

test('Template regions: net beats pre-discount Total and promotions never supply fields',()=>{
 const header='CP ALL\n7-Eleven';
 const body='Sub Total 100.00\nส่วนลด 31.00\nTotal (1) 100.00\nยอดสุทธิ 1 ชิ้น 69.00\nCash/Change 100.00 31.00\nR#000000001 P1:0000001 05/10/65 18:08';
 const r=parseReceipt(header+'\n'+body+'\nบิลนี้ประหยัด 31.00\nTotal 250.00\nหมดเขต 25 เม.ย. 65\n10/10/65 09:00');
 assert.equal(r.fields.amount,'69.00');assert.equal(r.fields.transactionDate,'2022-10-05');assert.equal(r.fields.transactionTime,'18:08');assert.equal(r.suggestedPaymentMethod,'cash');
 assert.equal(parseReceipt(header+'\n'+body.replace('ยอดสุทธิ 1 ชิ้น 69.00','69.00')).fields.amount,null);
});
test('English Total is allowed only with no discount or competing subtotal; Purse is never the total',()=>{
 const header='CP ALL,7-Eleven';
 const ref='R#000000001 P1:0000001 09/04/59 16:12';
 const r=parseReceipt(header+'\nTotal (7) 155.00\nCash/Change 10,000.00 9,845.00\n'+ref+'\nรับสิทธิแลกซื้อ\nTotal 999.00\nหมดเขต 25 เม.ย. 59');
 assert.equal(r.fields.amount,'155.00');assert.equal(r.fields.transactionDate,'2016-04-09');
 // Discounted Total is accepted only when Sub Total − discounts adds up exactly; Purse is still ignored.
 assert.equal(parseReceipt(header+'\nSub Total 74.00\n1 ส่วนลดสโมกกี้ไบท์ ชีสไบท์ 4.00\nTotal (6) 70.00\nPurse 66.00\nCash/Change 5.00 1.00\n'+ref).fields.amount,'70.00');
 assert.equal(parseReceipt(header+'\nSub Total 224.00\n2 ส่วนลดโยเกิร์ตเมจิ 4.00\n1 ส่วนลด10บ.สบู่เบนเนทส้ม 10.00\nTotal (42) 210.00\nPurse 210.00\n'+ref).fields.amount,'210.00');
 for(const text of ['Sub Total 74.00\nส่วนลด 5.00\nTotal (6) 70.00','Sub Total 74.00\nส่วนลด\nTotal (6) 70.00','Sub Total 74.00\nTotal (6) 70.00','Total (6) 70.00\nDiscount 4.00','Purse 210.00','Total (7) 155.00\nTotal (7) 156.00','Total (7) 155.00 100.00']){
  assert.equal(parseReceipt(header+'\n'+text+'\n'+ref).fields.amount,null);
 }
 const cropped=parseReceipt('VAT Included\nSub Total 224.00\nส่วนลด 14.00\nTotal (42) 210.00\nPurse 210.00\nR#000000001 P1:0000001 11/11/56 18:03');
 assert.equal(cropped.fields.description,null);assert.equal(cropped.fields.transactionDate,null);assert.equal(cropped.fields.amount,null);
 // A cropped header is still identified by CP ALL's tax ID line.
 const taxed=parseReceipt('TAX#0107542000011(VAT Included)\nVat 05634 POS# :0200176\nSub Total 224.00\n2 ส่วนลดโยเกิร์ตเมจิ 4.00\n1 ส่วนลด10บ.สบู่เบนเนทส้ม 10.00\nTotal (42) 210.00\nPurse 210.00\nR#0000872886 P1:0453397 11/11/56 18:03');
 assert.equal(taxed.fields.amount,'210.00');assert.equal(taxed.fields.transactionDate,'2013-11-11');assert.equal(taxed.fields.transactionTime,'18:03');
});


test('Template date/time confidence gates preserve ambiguity without repairing OCR digits',async()=>{
 const {gateTemplateDateTime}=await import('../../frontend/src/lib/receiptRegions');
 const page=(date:number,time:number)=>({blocks:[{paragraphs:[{lines:[{words:[{text:'09/04/55',confidence:date},{text:'16:12',confidence:time}]}]}]}]}) as any;
 const text='CP ALL,7-Eleven\n09/04/55 16:12\nTotal 155.00';
 const low=parseReceipt(text);gateTemplateDateTime(low,page(94,79));assert.equal(low.fields.transactionDate,null);assert.equal(low.fields.transactionTime,null);assert.equal(low.fields.amount,'155.00');
 const high=parseReceipt(text);gateTemplateDateTime(high,page(95,80));assert.equal(high.fields.transactionDate,'2012-04-09');assert.equal(high.fields.transactionTime,'16:12');
 const missing=parseReceipt(text);gateTemplateDateTime(missing,{blocks:[]} as any);assert.equal(missing.fields.transactionDate,null);
});

test('MyMo PromptPay: labeled amount, Buddhist date and recipient; no fee/reference inference',()=>{
 const text='รายการโอนเงินพร้อมเพย์สำเร็จ\nจำนวนเงิน\n20.00\n0.00 ค่าธรรมเนียม\nรหัสอ้างอิง: REDACTED\n12 ต.ค. 2569 15:58\nจาก\nผู้ส่ง ทดสอบ\nธนาคารออมสิน\nXXXX\nถึง\nผู้รับ ทดสอบ\nพร้อมเพย์\nXXX\nQR Code\nmyMo by GSB';
 const r=parseReceipt(text);
 assert.deepEqual(r.fields,{amount:'20.00',transactionDate:'2026-10-12',transactionTime:'15:58',description:'ผู้รับ ทดสอบ'});
 assert.equal(r.suggestedPaymentMethod,'transfer');
 assert.equal(parseReceipt(text.replace('จำนวนเงิน\n','')).fields.amount,null);
 assert.equal(parseReceipt(text.replace('20.00','')).fields.amount,null);
 assert.equal(parseReceipt(text+'\nยอดโอน 30.00').fields.amount,null);
 assert.equal(parseReceipt(text.replace('12 ต.ค. 2569','03/04/2569')).fields.transactionDate,'2026-04-03');
 assert.equal(parseReceipt(text.replace('รายการโอนเงินพร้อมเพย์สำเร็จ','รายการไม่สำเร็จ')).suggestedPaymentMethod,null);
 assert.equal(parseReceipt('myMo by GSB\n20.00\n0.00 ค่าธรรมเนียม').suggestedPaymentMethod,null);
});

test('Actual MyMo date OCR: month/year without whitespace remains unambiguous',()=>{
 for(const line of ['12 ต.ค.2569 15:58','12 ต.ค. 2569 15:58']){
  const r=parseReceipt(line);assert.equal(r.fields.transactionDate,'2026-10-12');assert.equal(r.fields.transactionTime,'15:58');
 }
 assert.equal(parseReceipt('31 ก.พ.2569 15:58').fields.transactionDate,null);
 assert.equal(parseReceipt('12 ต.ค.2569\n13 ต.ค.2569').fields.transactionDate,null);
});

test('Full Thai month names and unlabeled currency amounts',()=>{
 assert.equal(parseReceipt('24 ตุลาคม 2569 14:22 น.').fields.transactionDate,'2026-10-24');
 assert.equal(parseReceipt('2 กุมภาพันธ์ 68').fields.transactionDate,'2025-02-02');
 assert.equal(parseReceipt('โอนเงินสำเร็จ\n1,250.00 บาท\nค่าธรรมเนียม 0.00 บาท').fields.amount,'1250.00');
 assert.equal(parseReceipt('฿ 89.50').fields.amount,'89.50');
 // Two different unlabeled values or a labeled section stay unresolved.
 assert.equal(parseReceipt('100.00 บาท\n200.00 บาท').fields.amount,null);
 assert.equal(parseReceipt('จำนวน:\n7,.403.00 บาท').fields.amount,null);
 assert.equal(parseReceipt('ยอดเงินคงเหลือ 888.00 บาท').fields.amount,null);
});
test('12-hour AM/PM times convert to 24-hour',()=>{
 for(const [text,expected] of [['เวลา 1:05 PM','13:05'],['Time 12:30 AM','00:30'],['12:15 pm','12:15'],['09:40 a.m.','09:40'],['11:59PM','23:59'],['8:05 น.','08:05']] as const)
  assert.equal(parseReceipt(text).fields.transactionTime,expected,text);
 assert.equal(parseReceipt('13:05 PM').fields.transactionTime,null);
});
test('Any line naming a total is the amount and outranks other amount labels',()=>{
 for(const text of ['Order Total: 120.00','Total amount 120.00 THB','Net Total 120.00','Total\n120.00','TOTAL 120.00\nAMOUNT 80.00'])
  assert.equal(parseReceipt(text).fields.amount,'120.00',text);
 assert.equal(parseReceipt('TOTAL 107.00\nBALANCE DUE 57.00\nยอดรวม 107.00').fields.amount,'107.00');
 // Subtotals and tendered cash are still not totals; disagreeing totals stay blank.
 for(const text of ['Sub Total 100.00','SUBTOTAL 100.00','TOTAL PAID 200.00','TOTAL 100.00\nGrand Total 120.00'])
  assert.equal(parseReceipt(text).fields.amount,null,text);
});
