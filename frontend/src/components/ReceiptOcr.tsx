import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { detailedReadImage, readReceipt } from '../lib/receiptOcr';
import { parseReceipt, type ReceiptResult } from '../utils/receiptParser';

type Props={file:File;session:string|null;selection:number;
 onStart:(selection:number,session:string|null)=>void;
 onResult:(result:ReceiptResult,selection:number,session:string|null)=>void};
export default function ReceiptOcr({file,session,selection,onStart,onResult}:Props){
 const callbacks=useRef({onStart,onResult});callbacks.current={onStart,onResult};
 const [result,setResult]=useState<ReceiptResult|null>(null);
 const [percent,setPercent]=useState<number|null>(null);
 const [error,setError]=useState(''),[stopped,setStopped]=useState(false);
 const [detailed,setDetailed]=useState<'idle'|'reading'|'done'>('idle'),[detailedError,setDetailedError]=useState('');
 const detailedJob=useRef<AbortController|null>(null);
 useEffect(()=>{
  setResult(null);setError('');setPercent(null);setDetailed('idle');setDetailedError('');
  if(stopped)return;
  callbacks.current.onStart(selection,session);
  let active=true;
  const job=readReceipt(file,(_status,progress)=>{if(active)setPercent(progress??null);});
  job.promise.then(r=>{if(active){callbacks.current.onResult(r,selection,session);setResult(r);}})
   .catch(e=>{if(active)setError(e instanceof Error?e.message:'อ่านภาพไม่สำเร็จ');});
  return()=>{active=false;job.cancel();detailedJob.current?.abort();};
 },[file,session,selection,stopped]);
 // Server-side PaddleOCR, only on request: the image leaves the device for this read.
 const readDetailed=async()=>{
  const controller=new AbortController();detailedJob.current=controller;
  setDetailed('reading');setDetailedError('');
  try{
   const body=await detailedReadImage(file);
   const response=await apiFetch('/receipts/ocr',{method:'POST',body,headers:{'Content-Type':'image/jpeg'},signal:controller.signal});
   const data=await response.json().catch(()=>null);
   if(!response.ok||typeof data?.text!=='string')throw Error(data?.error||'อ่านภาพละเอียดไม่สำเร็จ');
   const parsed=parseReceipt(data.text);
   if(controller.signal.aborted)return;
   callbacks.current.onResult(parsed,selection,session);setResult(parsed);setDetailed('done');
  }catch(e){
   if(controller.signal.aborted)return;
   setDetailed('idle');setDetailedError(e instanceof Error?e.message:'อ่านภาพละเอียดไม่สำเร็จ');
  }
 };
 const scanning=!result&&!error&&!stopped;
 const reading=detailed==='reading';
 const incomplete=!!result&&(!result.fields.amount||!result.fields.transactionDate);
 const offerDetailed=!scanning&&!stopped&&!reading&&detailed!=='done'&&(incomplete||!!error);
 const busy=scanning||reading;
 return <div className={result&&!busy&&!offerDetailed?"receipt-ocr receipt-ocr-complete":"receipt-ocr"} data-ocr-complete={result&&!busy?true:undefined} aria-label="สถานะการอ่านสลิป" aria-busy={busy}>
  <p role="status" className={result&&!busy&&!incomplete?"success-badge":undefined}>{reading?'กำลังอ่านละเอียด… ประมาณ 10–20 วินาที':scanning?(percent===null?'กำลังเตรียมสแกน':'กำลังสแกน '+percent+'%'):stopped?'ยกเลิกแล้ว กรอกข้อมูลเองได้':error&&!result?'อ่านภาพไม่สำเร็จ':incomplete?'อ่านได้ไม่ครบ':'สแกนสำเร็จ'}</p>
  {scanning&&<progress max={100} value={percent??undefined} aria-label="ความคืบหน้าการสแกนสลิป"/>}
  {reading&&<progress aria-label="ความคืบหน้าการอ่านละเอียด"/>}
  {error&&!result&&<p role="alert">{error} — กรอกข้อมูลเองต่อได้</p>}
  {detailedError&&<p role="alert">{detailedError}</p>}
  {scanning&&<button type="button" onClick={()=>setStopped(true)}>ยกเลิกการอ่าน</button>}
  {reading&&<button type="button" onClick={()=>{detailedJob.current?.abort();setDetailed('idle');}}>ยกเลิกการอ่าน</button>}
  {offerDetailed&&<div className="receipt-ocr-detailed">
   <button type="button" onClick={()=>void readDetailed()}>อ่านละเอียด (ประมาณ 10–20 วินาที)</button>
   <small>ส่งภาพไปอ่านที่เซิร์ฟเวอร์ของ KebTang · ไม่เก็บภาพ</small>
  </div>}
 </div>;
}
