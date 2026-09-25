import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../api';
import {getToken,useSessionKey} from '../auth';
type Action='confirmed_normal'|'confirmed_problem';
type Review={id:string;action:Action;sequence:number;revision:number;reviewedAt:string};
type View={reviewState:Action|'unreviewed';reviewSequence:number;reviewHistory:{items:Review[];hasMore:boolean;nextCursor:number|null}};
const labels={unreviewed:'ยังไม่ได้ตรวจสอบ',confirmed_normal:'ยืนยันว่าปกติ',confirmed_problem:'ยืนยันว่ามีปัญหา'};
export default function AnomalyReviewPanel({evaluationId,revision,onDone}:{evaluationId:string;revision:number;onDone:()=>void}){
 const session=useSessionKey();const [data,setData]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const active=useRef(true),locked=useRef(false),request=useRef<{key:string;body:string}|null>(null);
 useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
 const valid=()=>active.current&&getToken()===session;
 useEffect(()=>{let live=true;const abort=new AbortController();void(async()=>{try{const r=await apiFetch(`/anomaly/evaluations/${evaluationId}/reviews`,{signal:abort.signal});if(!r.ok)throw Error();const v=await r.json();if(live&&getToken()===session)setData(v);}catch{if(live&&!abort.signal.aborted&&getToken()===session)setError('โหลดประวัติยืนยันไม่สำเร็จ');}})();return()=>{live=false;abort.abort();};},[evaluationId,session,reload]);
 async function submit(action:Action){
  if(!data||locked.current)return;
  locked.current=true;setBusy(true);setError('');
  const body=JSON.stringify({action,revision,expectedReviewSequence:data.reviewSequence});
  if(request.current?.body!==body)request.current={key:crypto.randomUUID(),body};
  try{
   const r=await apiFetch(`/anomaly/evaluations/${evaluationId}/reviews`,{method:'POST',headers:{'Idempotency-Key':request.current.key},body});
   if(!valid())return;
   if(r.status===409){request.current=null;setReload(n=>n+1);setError('มีข้อมูลใหม่หรือคำขอขัดแย้ง กรุณาตรวจสถานะล่าสุดก่อนยืนยันอีกครั้ง');return;}
   if(!r.ok)throw Error();
   request.current=null;onDone();
  }catch{if(valid())setError('บันทึกไม่สำเร็จ กดการยืนยันเดิมเพื่อลองใหม่ได้');}
  finally{locked.current=false;if(valid())setBusy(false);}
 }
 async function more(){if(!data?.reviewHistory.nextCursor||locked.current)return;locked.current=true;setBusy(true);try{
  const r=await apiFetch(`/anomaly/evaluations/${evaluationId}/reviews?cursor=${data.reviewHistory.nextCursor}`);if(!r.ok)throw Error();const v:View=await r.json();
  if(valid())setData({...v,reviewHistory:{...v.reviewHistory,items:[...data.reviewHistory.items,...v.reviewHistory.items].filter((x,i,all)=>all.findIndex(y=>y.id===x.id)===i)}});
 }catch{if(valid())setError('โหลดประวัติเพิ่มไม่สำเร็จ กรุณาลองใหม่');}finally{locked.current=false;if(valid())setBusy(false);}}
 return <section className="anomaly-review" aria-label={`ผลยืนยัน revision ${revision}`} style={{paddingBlock:12}}>
  <h5>ผลยืนยัน revision {revision}: {data?labels[data.reviewState]:'กำลังโหลด...'}</h5>
  <p>“ยืนยันว่าปกติ” หมายถึงอนุญาตให้ revision นี้เป็นข้อมูลอ้างอิงในอนาคตตามข้อมูลที่ใช้ได้ ไม่อนุญาตเวลาโดยอัตโนมัติ</p>
  <p>“ยืนยันว่ามีปัญหา” หมายถึงไม่นำ revision นี้ไปสร้างพฤติกรรมอ้างอิงทั้งจำนวนเงินและเวลา</p>
  <p>การกดอ่านแจ้งเตือนไม่ใช่การยืนยันผล คำยืนยัน revision เก่าหรือรายการที่ลบแล้วเก็บเป็นหลักฐานเท่านั้น</p>
  <div style={{display:'flex',flexWrap:'wrap',gap:8}}><button type="button" disabled={busy||!data} onClick={()=>void submit('confirmed_normal')}>ยืนยันว่าปกติ</button><button type="button" disabled={busy||!data} onClick={()=>void submit('confirmed_problem')}>ยืนยันว่ามีปัญหา</button></div>
  {busy&&<p role="status">กำลังบันทึกหรือโหลด...</p>}{error&&<p role="alert">{error} <button type="button" disabled={busy} onClick={()=>{setError('');setReload(n=>n+1);}}>โหลดสถานะใหม่</button></p>}
  {data&&<details><summary>ประวัติการยืนยัน revision นี้</summary>{data.reviewHistory.items.length===0?<p>ยังไม่มีการยืนยัน</p>:<ol>{data.reviewHistory.items.map(r=><li key={r.id}>ครั้งที่ {r.sequence}: {labels[r.action]} · {new Date(r.reviewedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</li>)}</ol>}{data.reviewHistory.hasMore&&<button type="button" disabled={busy} onClick={()=>void more()}>โหลดประวัติเพิ่ม</button>}</details>}
 </section>;
}