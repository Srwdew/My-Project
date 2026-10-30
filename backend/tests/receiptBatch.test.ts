import test from 'node:test';
import assert from 'node:assert/strict';
import {batchRowProblems,findDuplicates,ocrDoubts} from '../../frontend/src/lib/receiptBatch';
const row=(id:string,amount:string,transactionDate:string,transactionTime='')=>({id,fields:{amount,transactionDate,transactionTime,description:'',categoryId:'c'}});
test('batch: row problems block save, valid row passes',()=>{
 assert.deepEqual(batchRowProblems(row('a','1,250.50','2026-10-30').fields,'2026-10-30'),[]);
 assert.deepEqual(batchRowProblems({...row('a','','').fields,categoryId:''},'2026-10-30'),['จำนวนเงินไม่ถูกต้อง','ไม่พบวันที่']);
 assert.deepEqual(batchRowProblems(row('a','0','2026-10-31','25:00').fields,'2026-10-30'),['จำนวนเงินไม่ถูกต้อง','วันที่อยู่ในอนาคต','เวลาไม่ถูกต้อง']);
});
test('batch: OCR doubts flag ambiguous reads only',()=>{
 const base={suggestedPaymentMethod:null,fields:{transactionDate:null,transactionTime:null,amount:null,description:null}};
 assert.deepEqual(ocrDoubts({...base,issues:['time_not_found','time_ambiguous'],amountCandidates:[{value:'5',label:'a'},{value:'5',label:'b'}]}),[]);
 assert.equal(ocrDoubts({...base,issues:[],amountCandidates:[{value:'5',label:'a'},{value:'6',label:'b'}]}).length,1);
 assert.equal(ocrDoubts({...base,issues:['currency_ocr_uncertain'],amountCandidates:[]}).length,1);
});
test('batch: duplicates within batch and against saved expenses',()=>{
 const found=findDuplicates([row('a','100','2026-10-01','09:05'),row('b','100.00','2026-10-01'),row('c','100','2026-10-01','10:00'),row('d','55','2026-10-02','08:00'),row('e','70','2026-10-02')],[
  {type:'expense',amount:'55.00',transactionDate:'2026-10-02T00:00:00.000Z',transactionTime:'1970-01-01T08:00:00.000Z'},
  {type:'income',amount:'70.00',transactionDate:'2026-10-02T00:00:00.000Z',transactionTime:null}]);
 assert.deepEqual([...found.keys()],['b','c','d']);
});
