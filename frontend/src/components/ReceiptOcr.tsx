import { useEffect, useRef, useState } from 'react';
import { readReceipt } from '../lib/receiptOcr';
import { type ReceiptResult } from '../utils/receiptParser';

type Props={file:File;session:string|null;selection:number;
 onStart:(selection:number,session:string|null)=>void;
 onResult:(result:ReceiptResult,selection:number,session:string|null)=>void};
export default function ReceiptOcr({file,session,selection,onStart,onResult}:Props){
 const callbacks=useRef({onStart,onResult});callbacks.current={onStart,onResult};
 const [result,setResult]=useState<ReceiptResult|null>(null);
 const [percent,setPercent]=useState<number|null>(null);
 const [error,setError]=useState(''),[stopped,setStopped]=useState(false);
 useEffect(()=>{
  setResult(null);setError('');setPercent(null);
  if(stopped)return;
  callbacks.current.onStart(selection,session);
  let active=true;
  const job=readReceipt(file,(_status,progress)=>{if(active)setPercent(progress??null);});
  job.promise.then(r=>{if(active){callbacks.current.onResult(r,selection,session);setResult(r);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'อ่านภาพไม่สำเร็จ');});
  return()=>{active=false;job.cancel();};
 },[file,session,selection,stopped]);
 const scanning=!result&&!error&&!stopped;
 return <div className={result?"receipt-ocr receipt-ocr-complete":"receipt-ocr"} data-ocr-complete={result?true:undefined} aria-label="สถานะการอ่านสลิป" aria-busy={scanning}>
  <p role="status" className={result?"success-badge":undefined}>{scanning?(percent===null?'กำลังเตรียมสแกน':'กำลังสแกน '+percent+'%'):stopped?'ยกเลิกแล้ว กรอกข้อมูลเองได้':error?'อ่านภาพไม่สำเร็จ':'สแกนสำเร็จ'}</p>
  {scanning&&<progress max={100} value={percent??undefined} aria-label="ความคืบหน้าการสแกนสลิป"/>}
  {error&&<p role="alert">{error} — กรอกข้อมูลเองต่อได้</p>}
  {scanning&&<button type="button" onClick={()=>setStopped(true)}>ยกเลิกการอ่าน</button>}
 </div>;
}
