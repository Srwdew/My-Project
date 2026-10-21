import AnomalyPatterns from '../components/AnomalyPatterns';
import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import {apiFetch} from '../api';
import {getToken,useSessionKey} from '../auth';
import AnomalyDetails,{AnomalyReconcileButton} from '../components/AnomalyDetails';
import './AnomalyQueue.css';
type Item={id:string;revision:number;originalTransactionId:string;severity:number;waiting:boolean;snapshot:{transaction:{amount:string;categoryName:string;date:string;time?:string|null};scope?:{amount:string;time:string};assessment:{amount:{status:string};time:{status:string}}}};
type Queue={readiness:{asOfDate:string;count:number;inclusiveDays:number;ready:boolean;enabled:boolean};items:Item[];total:number;offset:number;limit:number;pendingEvaluation:number};
export default function AnomalyQueue(){const session=useSessionKey();return <QueueBody key={session} session={session}/>;}
function QueueBody({session}:{session:string|null}){
 const detailRef=useRef<HTMLElement|null>(null);
 const choose=(id:string)=>{setSelected(id);if(window.matchMedia('(max-width: 800px)').matches)requestAnimationFrame(()=>{detailRef.current?.focus();detailRef.current?.scrollIntoView({block:'start',behavior:'smooth'});});};
 const [filter,setFilter]=useState('waiting'),[offset,setOffset]=useState(0),[reload,setReload]=useState(0),[data,setData]=useState<Queue|null>(null),[selected,setSelected]=useState<string|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;const c=new AbortController();setError('');
 void(async()=>{try{const r=await apiFetch('/anomaly/queue?filter='+filter+'&offset='+offset,{signal:c.signal});if(!r.ok)throw Error();const d=await r.json();if(active&&getToken()===session){if(!d.items.length&&offset>0&&d.total<=offset){setOffset(Math.max(0,Math.floor(Math.max(0,d.total-1)/25)*25));return;}setData(d);setSelected(previous=>d.items.some((i:Item)=>i.originalTransactionId===previous)?previous:d.items[0]?.originalTransactionId??null);}}catch{if(active&&!c.signal.aborted&&getToken()===session)setError('โหลดรายการไม่สำเร็จ');}})();
 return()=>{active=false;c.abort();};},[session,filter,offset,reload]);
 useEffect(()=>{const update=()=>setReload(n=>n+1);window.addEventListener('spendsense-anomaly-decision',update);return()=>window.removeEventListener('spendsense-anomaly-decision',update);},[]);
 return <main className="anomaly-queue"><header className="compact-page-toolbar"><h1 className="page-heading-accessible">รายการที่ควรตรวจสอบ</h1></header>
 <nav aria-label="ตัวกรองรายการ">{[['all','ทั้งหมด'],['waiting','รอตรวจสอบ'],['amount','ยอดสูงกว่ารูปแบบเดิม'],['time','ช่วงเวลาที่พบน้อย']].map(([v,label])=><button key={v} aria-pressed={filter===v} onClick={()=>{if(v===filter)return;setData(null);setSelected(null);setFilter(v);setOffset(0);}}>{label}</button>)}</nav>
 <button className="anomaly-refresh" onClick={()=>setReload(n=>n+1)}>โหลดสถานะล่าสุด</button>
 {error?<p role="alert">{error} <button onClick={()=>setReload(n=>n+1)}>ลองใหม่</button></p>:!data?<p role="status">กำลังโหลดรายการ...</p>:<>
 <details className="anomaly-readiness"><summary>เกณฑ์ข้อมูลและการประเมิน</summary><p>เกณฑ์เริ่มตรวจรายการของวันนี้ ({data.readiness.asOfDate}): {data.readiness.ready?'ผ่าน':'ข้อมูลยังไม่พอ'} · {data.readiness.count}/30 รายการ · {data.readiness.inclusiveDays}/30 วันรวมต้น–ปลาย</p>{!data.readiness.enabled&&<p>การตรวจอัตโนมัติยังปิดอยู่ <Link to="/settings">เปิดการตรวจใน Settings</Link></p>}<AnomalyReconcileButton onDone={()=>setReload(n=>n+1)}/></details>
 <p className="anomaly-queue-count" role="status">{data.total} รายการในตัวกรองนี้ · รอระบบประเมิน {data.pendingEvaluation} รายการ</p>
 <div className="anomaly-queue-grid"><section aria-label="รายการตามความสำคัญ">
 {!data.items.length?<p role="status">{filter==='waiting'?'ไม่มีรายการรอตรวจสอบ':'ไม่มีรายการในตัวกรองนี้'}</p>:<ul className="anomaly-transaction-list">{data.items.map(i=><li key={i.id}>
 <p className="anomaly-list-date">{i.snapshot.transaction.date}</p>
 <button className={'anomaly-transaction-row '+(i.severity===0?'priority':'attention')} aria-pressed={selected===i.originalTransactionId} aria-controls="anomaly-selected-detail" onClick={()=>choose(i.originalTransactionId)}>
 <span className="anomaly-row-name"><span className="anomaly-severity-dot" aria-hidden="true"/>{i.snapshot.transaction.categoryName}</span>
 <strong className="anomaly-row-amount">{Number(i.snapshot.transaction.amount).toLocaleString('th-TH',{minimumFractionDigits:2,maximumFractionDigits:2})} <small>บาท</small></strong>
 <span className="anomaly-row-status">{i.waiting?'รอตรวจสอบ':'ตัดสินแล้ว'} · {i.severity===0?'ควรตรวจสอบเป็นพิเศษ':'ควรตรวจสอบ'}</span>
 <span className="anomaly-row-time">{i.snapshot.transaction.time??'ไม่ระบุเวลา'}</span>
 </button></li>)}</ul>}
 <div className="anomaly-actions"><button disabled={offset===0} onClick={()=>setOffset(n=>Math.max(0,n-25))}>ก่อนหน้า</button><button disabled={offset+25>=data.total} onClick={()=>setOffset(n=>n+25)}>ถัดไป</button></div>
 </section><aside id="anomaly-selected-detail" ref={detailRef} tabIndex={-1} aria-label="รายละเอียดรายการที่เลือก"><button className="anomaly-back-to-list" onClick={()=>{const row=document.querySelector<HTMLButtonElement>('.anomaly-transaction-row[aria-pressed="true"]');row?.focus();row?.scrollIntoView({block:'center'});}}>กลับไปรายการ</button>{selected?<><Link className="anomaly-edit-source" to={'/transactions/'+selected+'/edit'}>แก้หมวดหรือข้อมูลก่อนตัดสิน</Link><AnomalyDetails expanded key={selected} path={'/transactions/'+selected+'/anomaly'}/></>:<p>เลือกรายการเพื่อดูเหตุผลและหลักฐาน</p>}</aside></div>
 </>}
 <details className="anomaly-patterns-fold"><summary>รูปแบบตามรอบและประวัติ</summary><AnomalyPatterns/></details>
 </main>;
}
