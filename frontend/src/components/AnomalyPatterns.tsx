import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../api';
import {getToken,useSessionKey} from '../auth';
export const cadenceLabels:Record<string,string>={weekly:'ทุก 7 วัน',fortnightly:'ทุก 14 วัน',monthly:'รายเดือน',quarterly:'ทุก 3 เดือน',half_yearly:'ทุก 6 เดือน',yearly:'รายปี'};
type Event={id:string;kind:string;createdAt:string;snapshot:{status:string;cadence:string;dimension:string;referenceMedian:string;anchor:string}};
type Pattern={id:string;current:Event;events:Event[]};
export default function AnomalyPatterns(){const session=useSessionKey();return <Body key={session} session={session}/>;}
function Body({session}:{session:string|null}){
 const [items,setItems]=useState<Pattern[]|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[busy,setBusy]=useState(false),[pending,setPending]=useState<{id:string;key:string;body:string}|null>(null);
 const live=useRef(true),lock=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 const valid=()=>live.current&&getToken()===session;
 useEffect(()=>{let active=true;const c=new AbortController();void(async()=>{try{const r=await apiFetch('/anomaly/patterns',{signal:c.signal});if(!r.ok)throw Error();const d=await r.json();if(active&&getToken()===session)setItems(d.items);}catch{if(active&&!c.signal.aborted&&getToken()===session)setError('โหลดรูปแบบไม่สำเร็จ');}})();return()=>{active=false;c.abort();};},[session,reload]);
 useEffect(()=>{const f=()=>setReload(n=>n+1);window.addEventListener('spendsense-anomaly-decision',f);return()=>window.removeEventListener('spendsense-anomaly-decision',f);},[]);
 async function send(r:{id:string;key:string;body:string}){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setPending(r);
  try{const response=await apiFetch('/anomaly/patterns/'+r.id+'/events',{method:'POST',headers:{'Idempotency-Key':r.key},body:r.body});if(!valid())return;
   if(response.status===409){setPending(null);setError('สถานะเปลี่ยนแล้ว โปรดตรวจประวัติล่าสุด');setReload(n=>n+1);return;}
   if(!response.ok)throw Error();setPending(null);setReload(n=>n+1);
  }catch{if(valid())setError('ยังไม่ทราบผลคำขอ กรุณาลองคำขอเดิม');}finally{lock.current=false;if(valid())setBusy(false);}
 }
 return <section className="anomaly-pattern-status"><h2>รูปแบบข้อยกเว้นที่ผู้ใช้ระบุ</h2><p>ยังไม่จับคู่ด้วยยอดเงินอัตโนมัติ: รอ absolute floor จากข้อมูลที่อนุญาต รูปแบบแยกจาก baseline หลักเสมอ</p>
 {!items&&!error&&<p role="status">กำลังโหลดรูปแบบ...</p>}{items?.length===0&&<p>ยังไม่มีรูปแบบตามรอบ</p>}
 {items?.map(p=><article key={p.id}><h3>{cadenceLabels[p.current.snapshot.cadence]} · {p.current.snapshot.dimension==='amount'?'จำนวนเงิน':'เวลา'}</h3><p>สถานะที่บันทึก: {p.current.snapshot.status} · ยอดอ้างอิง {p.current.snapshot.referenceMedian} บาท · ช่วงยอดยังไม่เปิดใช้</p><p>วันอ้างอิงรอบ {p.current.snapshot.anchor}</p>
 <button disabled={busy||!!pending} onClick={()=>void send({id:p.id,key:crypto.randomUUID(),body:JSON.stringify({action:'refresh',expectedEventId:p.current.id})})}>ตรวจรอบที่ขาดและบันทึกสถานะ</button>
 {p.current.snapshot.status==='expired'&&<><p>กู้คืนโดยเริ่มนับรอบจากวันนี้ ไม่สร้างหรือแก้ธุรกรรม</p><button disabled={busy||!!pending} onClick={()=>void send({id:p.id,key:crypto.randomUUID(),body:JSON.stringify({action:'restore',expectedEventId:p.current.id})})}>กู้คืนรูปแบบเดิม</button></>}
 <details><summary>ประวัติรูปแบบ</summary><ol>{p.events.map(e=><li key={e.id}>{e.kind} · {e.snapshot.status} · {new Date(e.createdAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</li>)}</ol></details></article>)}
 {error&&<p role="alert">{error} <button onClick={()=>{setError('');setReload(n=>n+1);}}>โหลดใหม่</button></p>}{pending&&!busy&&<button onClick={()=>void send(pending)}>ลองคำขอรูปแบบเดิม</button>}
 </section>;
}
