import {cadenceLabels} from './AnomalyPatterns';
import {useEffect,useRef,useState} from 'react';
import {apiFetch} from '../api';
import {getToken,useSessionKey} from '../auth';
import Dropdown from './Dropdown';
type Dimension='amount'|'time';
type Action='normal'|'occasional'|'problem'|'recurring';
type Decision={id:string;action:Action;dimension:Dimension;sequence:number;decidedAt:string;supersedesId:string|null};
type View={dimensions:Record<Dimension,{current:Decision|null;history:Decision[]}>;legacyState:string|null;legacyHistory:{id:string;action:string;reviewedAt:string}[]};
const actionLabels={normal:'เป็นรายการปกติ',occasional:'ถูกต้องแต่เป็นค่าใช้จ่ายครั้งคราว',problem:'เป็นรายการผิดปกติ',recurring:'เป็นรายการตามรอบ'};
const labels:Record<Action,string>={normal:'ปกติ',occasional:'ถูกต้องเป็นครั้งคราว',problem:'ผิดปกติ',recurring:'เป็นรายการตามรอบ'};
export default function AnomalyDecisionPanel({evaluationId,revision,onDone,dimensions=['amount','time']}:{evaluationId:string;revision:number;onDone:()=>void;dimensions?:Dimension[]}){
 const session=useSessionKey();
 return <DecisionBody key={session+evaluationId} evaluationId={evaluationId} revision={revision} onDone={onDone} session={session} dimensions={dimensions}/>;
}
function DecisionBody({evaluationId,revision,onDone,session,dimensions}:{evaluationId:string;revision:number;onDone:()=>void;session:string|null;dimensions:Dimension[]}){
 const [view,setView]=useState<View|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[reload,setReload]=useState(0);
 const [dimension,setDimension]=useState<Dimension>(dimensions[0]??'amount');
 const [choice,setChoice]=useState<{dimension:Dimension;action:Action}|null>(null);
 const dialog=useRef<HTMLDialogElement|null>(null);
 useEffect(()=>{if(choice&&!dialog.current?.open)dialog.current?.showModal();if(!choice)dialog.current?.close();},[choice]);
 useEffect(()=>{if(view){const next=dimensions.find(d=>!view.dimensions[d].current&&!view.legacyState);if(next)setDimension(next);}},[view,dimensions.join(',')]);
 const [editing,setEditing]=useState<Record<Dimension,boolean>>({amount:false,time:false});
 const [cadence,setCadence]=useState<Record<Dimension,string>>({amount:'',time:''});
 const [pending,setPending]=useState<{key:string;body:string}|null>(null);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 const valid=()=>alive.current&&getToken()===session;
 useEffect(()=>{let active=true;const c=new AbortController();setView(null);void(async()=>{
  try{const r=await apiFetch('/anomaly/evaluations/'+evaluationId+'/decisions',{signal:c.signal});if(!r.ok)throw Error();const v=await r.json();if(active&&getToken()===session)setView(v);}
  catch{if(active&&!c.signal.aborted&&getToken()===session)setError('โหลดคำตัดสินไม่สำเร็จ');}
 })();return()=>{active=false;c.abort();};},[evaluationId,session,reload]);
 async function send(request:{key:string;body:string}){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setPending(request);
  try{const r=await apiFetch('/anomaly/evaluations/'+evaluationId+'/decisions',{method:'POST',headers:{'Idempotency-Key':request.key},body:request.body});
   if(!valid())return;
   if(r.status===409){setChoice(null);setPending(null);setReload(n=>n+1);setError('มีคำตัดสินใหม่หรือคำขอขัดแย้ง โปรดตรวจประวัติล่าสุดก่อนยืนยันอีกครั้ง');return;}
   if(!r.ok){if(r.status>=400&&r.status<500)setPending(null);throw Error();}
   const result=await r.json();if(!valid())return;
   const dimension=(JSON.parse(request.body) as {dimension:Dimension}).dimension;
   setView(v=>v?{...v,dimensions:{...v.dimensions,[dimension]:{current:result.decision,history:[result.decision,...v.dimensions[dimension].history.filter(h=>h.id!==result.decision.id)]}}}:v);
   setEditing(v=>({...v,[dimension]:false}));setChoice(null);setPending(null);onDone();setReload(n=>n+1);
  }catch{if(valid())setError('ยังไม่ทราบผลคำขอแน่ชัด กรุณาลองคำขอเดิม');}
  finally{lock.current=false;if(valid())setBusy(false);}
 }
 function decide(dimension:Dimension,action:Action){if(!view||pending||busy||lock.current)return;const current=view.dimensions[dimension].current;if((current||view.legacyState)&&!editing[dimension])return;if(current?.action===action)return;if(action==='recurring'&&!cadence[dimension]){setError('กรุณาเลือกรอบก่อนยืนยัน');return;}void send({key:crypto.randomUUID(),body:JSON.stringify({dimension,action,...(action==='recurring'?{cadence:cadence[dimension]}:{}),revision,expectedDecisionId:view.dimensions[dimension].current?.id??null})});}

 const d=dimension,current=view?.dimensions[d].current;
 const canChoose=!!view&&(!(current||view.legacyState)||editing[d]);
 return <section className="anomaly-decision anomaly-decision-compact" aria-label="เลือกผลการตรวจสอบ" aria-busy={busy}>
 {!view&&!error&&<p role="status">กำลังโหลด...</p>}
 {view&&<>
 {dimensions.length>1&&<div className="anomaly-dimension-switch" aria-label="มิติที่กำลังตรวจ">{dimensions.map(item=><button type="button" key={item} aria-pressed={d===item} disabled={busy||!!pending} onClick={()=>{setDimension(item);setChoice(null);}}>{item==='amount'?'จำนวนเงิน':'เวลา'}{view.dimensions[item].current||view.legacyState?' · ตัดสินแล้ว':' · รอตรวจสอบ'}</button>)}</div>}
 <fieldset data-dimension={d}><legend className="anomaly-sr-only">{d==='amount'?'จำนวนเงิน':'เวลา'}</legend>
 {current&&<p className="anomaly-chosen-status" role="status">เลือกแล้ว: {actionLabels[current.action]}</p>}
 {!canChoose?<button type="button" data-edit-decision={d} disabled={busy||!!pending} onClick={()=>setEditing(v=>({...v,[d]:true}))}>แก้คำตัดสิน</button>:<>
 {editing[d]&&<button type="button" disabled={busy||!!pending} onClick={()=>{setEditing(v=>({...v,[d]:false}));setChoice(null);}}>ยกเลิกการแก้คำตัดสิน</button>}
 <div className="anomaly-actions">{(['normal','occasional','problem'] as const).map(action=><button type="button" key={action} data-decision={action} aria-label={actionLabels[action]+' · '+(d==='amount'?'จำนวนเงิน':'เวลา')} disabled={busy||!!pending||current?.action===action} onClick={()=>{setError('');setChoice({dimension:d,action});}}>{actionLabels[action]}</button>)}</div>
 </>}
 <details className="anomaly-extra-options"><summary>ตัวเลือกอื่นและประวัติ</summary>
 {canChoose&&<button type="button" data-decision="recurring" disabled={busy||!!pending||current?.action==='recurring'} onClick={()=>setChoice({dimension:d,action:'recurring'})}>เป็นรายการตามรอบ</button>}
 <p>revision {revision} · {d==='amount'?'จำนวนเงิน':'เวลา'}</p><ol>{view.dimensions[d].history.map(h=><li key={h.id}>{labels[h.action]} · {new Date(h.decidedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</li>)}</ol>
 {view.legacyHistory.map(h=><p key={h.id}>{h.action==='confirmed_normal'?'ยืนยันว่าปกติ':'ยืนยันว่ามีปัญหา'} · {new Date(h.reviewedAt).toLocaleString('th-TH',{timeZone:'Asia/Bangkok'})}</p>)}
 </details></fieldset></>}
 <dialog ref={dialog} className="anomaly-confirm-dialog" aria-labelledby="anomaly-confirm-title" onCancel={e=>{e.preventDefault();if(!busy&&!pending)setChoice(null);}}>
 {choice&&<><h2 id="anomaly-confirm-title">{actionLabels[choice.action]}</h2><p>ยืนยันสำหรับ{choice.dimension==='amount'?'จำนวนเงิน':'เวลา'}ของรายการนี้</p>
 <p className="anomaly-confirm-effect">{choice.action==='normal'?'ใช้เป็นข้อมูลอ้างอิงหลักของมิตินี้':choice.action==='occasional'?'เก็บเป็นข้อยกเว้น ไม่ใช้เป็นข้อมูลอ้างอิงหลัก':choice.action==='problem'?'เก็บผลว่ามีปัญหา ไม่ใช้เป็นข้อมูลอ้างอิง และไม่ลบธุรกรรม':'เก็บเป็นรูปแบบแยกจากข้อมูลอ้างอิงหลัก'}</p>
 {choice.action==='recurring'&&<label>รอบของรายการ<Dropdown value={cadence[choice.dimension]} disabled={busy||!!pending} onChange={value=>setCadence(v=>({...v,[choice.dimension]:value}))} options={[{value:'',label:'เลือกรอบ'},...Object.entries(cadenceLabels).map(([value,label])=>({value,label}))]}/></label>}
 {error&&<p role="alert">{error}</p>}
 <div className="anomaly-confirm-actions"><button type="button" data-confirm-cancel disabled={busy||!!pending} onClick={()=>setChoice(null)}>ยกเลิก</button>
 {pending&&!busy?<button type="button" onClick={()=>void send(pending)}>ลองคำขอเดิม</button>:<button type="button" data-confirm-decision disabled={busy||!!pending||(choice.action==='recurring'&&!cadence[choice.dimension])} onClick={()=>decide(choice.dimension,choice.action)}>{busy?'กำลังบันทึก...':'ยืนยัน'}</button>}</div></>}
 </dialog>
 {error&&!choice&&<p role="alert">{error} <button disabled={busy} onClick={()=>{setError('');setReload(n=>n+1);}}>โหลดสถานะใหม่</button></p>}
 </section>;
}
