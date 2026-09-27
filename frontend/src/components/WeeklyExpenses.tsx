import { useEffect,useState } from 'react';
import { apiFetch } from '../api';
import { getToken } from '../auth';
import { moneyText } from '../utils/dashboard';
import { validateRange } from '../utils/overviewPeriod';
import { weeklyMoney,weeklyView,type WeeklyResponse } from '../utils/weeklyExpenses';
import './WeeklyExpenses.css';

export default function WeeklyExpenses({month,today,session}:{month:string;today:string;session:string|null}){
  const last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).toISOString().slice(0,10);
  const [start,setStart]=useState(month+'-01'),[end,setEnd]=useState(last<today?last:today),[category,setCategory]=useState('');
  const [data,setData]=useState<{key:string;value:WeeklyResponse}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const key=start+':'+end,validation=validateRange({startDate:start,endDate:end})||(end>today?'เลือกวันสิ้นสุดไม่เกินวันนี้ตาม Asia/Bangkok':'');
  useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('spendsense-data-changed',refresh);return()=>window.removeEventListener('spendsense-data-changed',refresh);},[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;setError('');setLoading(true);
    if(validation||!session){setLoading(false);return()=>{active=false;controller.abort();};}
    void(async()=>{try{
      const r=await apiFetch('/overview/weekly?'+new URLSearchParams({startDate:start,endDate:end}),{signal:controller.signal});
      if(!r.ok)throw Error();const result=await r.json() as WeeklyResponse;
      if(result.period?.startDate!==start||result.period?.endDate!==end||!Array.isArray(result.weeks))throw Error();
      weeklyView(result);
      if(active&&!controller.signal.aborted&&getToken()===session)setData({key,value:result});
    }catch{if(active&&!controller.signal.aborted&&getToken()===session)setError('โหลดรายจ่ายรายสัปดาห์ไม่สำเร็จ กรุณาลองใหม่');}
    finally{if(active&&getToken()===session)setLoading(false);}})();
    return()=>{active=false;controller.abort();};
  },[start,end,key,session,validation,revision]);
  const view=!validation&&!error&&data?.key===key?weeklyView(data.value,category):null;
  const options=data?weeklyView(data.value).options:[];
  const max=Math.max(1,...(view?.weeks.map(w=>Number(w.cents))??[]));
  const width=Math.max(680,(view?.weeks.length??0)*70);
  return <section className="dashboard-panel weekly-expenses" aria-label="รายจ่ายย้อนหลังรายสัปดาห์" aria-busy={loading}>
    <h2>รายจ่ายย้อนหลังรายสัปดาห์</h2>
    <p>รวมเฉพาะรายจ่ายที่บันทึก จันทร์–อาทิตย์ ตัดขอบสัปดาห์ตามช่วงที่เลือก ตัวกรองส่วนนี้ไม่เปลี่ยน Dashboard รายเดือน</p>
    <div className="weekly-controls">
      <label>วันเริ่มต้น<input aria-label="วันเริ่มต้นรายสัปดาห์" type="date" min="1900-01-01" max={today} value={start} onChange={e=>setStart(e.target.value)}/></label>
      <label>วันสิ้นสุด<input aria-label="วันสิ้นสุดรายสัปดาห์" type="date" min={start} max={today} value={end} onChange={e=>setEnd(e.target.value)}/></label>
      <label>หมวดรายจ่าย<select aria-label="หมวดรายจ่ายรายสัปดาห์" value={category} onChange={e=>setCategory(e.target.value)}><option value="">ทุกหมวด</option>{category&&!options.some(([id])=>id===category)&&<option value={category}>หมวดที่เลือก — ไม่มีรายการในช่วงนี้</option>}{options.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
    </div>
    {validation&&<p role="alert">{validation}</p>}
    {loading&&<p role="status">กำลังโหลดรายจ่ายรายสัปดาห์...</p>}
    {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setRevision(n=>n+1)}>ลองใหม่รายสัปดาห์</button></div>}
    {view&&<><p className="weekly-total">ยอดรวมช่วง {start} ถึง {end}: <strong>{moneyText(weeklyMoney(view.total))} บาท</strong> · {view.count} รายการ</p>
      {!view.count?<p role="status" className="weekly-empty">ไม่มีรายการรายจ่ายที่บันทึกในช่วงและหมวดที่เลือก</p>:<div className="weekly-scroll" tabIndex={0} role="region" aria-label="กราฟรายสัปดาห์ เลื่อนแนวนอนได้"><svg className="weekly-chart" style={{minWidth:width}} viewBox={'0 0 '+width+' 260'} role="img" aria-label="กราฟแท่งรายจ่ายรายสัปดาห์ เรียงจากเก่าไปใหม่ อ่านยอดและวันที่ในตารางด้านล่าง">
        <line x1="20" y1="190" x2={width-15} y2="190" stroke="#8495a6"/>
        {view.weeks.map((w,i)=>{const x=25+i*(width-40)/view.weeks.length,bar=(width-40)/view.weeks.length*.6,h=Number(w.cents)/max*145;return <g key={w.startDate}><title>{w.startDate+' ถึง '+w.endDate+': '+weeklyMoney(w.cents)+' บาท'}</title>{w.count?<><rect x={x} y={190-h} width={bar} height={h} fill="#b54438"/><text x={x+bar/2} y={180-h} textAnchor="middle">{moneyText(weeklyMoney(w.cents))}</text></>:<text x={x+bar/2} y="180" textAnchor="middle">—</text>}<text x={x+bar/2} y="211" textAnchor="middle">{w.startDate.slice(5)}</text><text x={x+bar/2} y="229" textAnchor="middle">{w.endDate.slice(5)}</text></g>;})}
      </svg></div>}
      <p>สัปดาห์ที่ไม่มีรายการใช้เครื่องหมาย — ไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง · ช่วงไม่เกิน 366 วัน</p>
      <details><summary>ตารางรายจ่ายรายสัปดาห์</summary><div className="dashboard-table-wrap" tabIndex={0} role="region" aria-label="ตารางรายสัปดาห์"><table><caption>ยอดรายจ่ายตามช่วงและหมวดที่เลือก หน่วยบาท</caption><thead><tr><th scope="col">ช่วงวันที่</th><th scope="col">จำนวนรายการ</th><th scope="col">รายจ่าย</th></tr></thead><tbody>{view.weeks.map(w=><tr key={w.startDate}><th scope="row">{w.startDate} – {w.endDate}</th><td>{w.count||'ไม่มีรายการที่บันทึก'}</td><td>{w.count?moneyText(weeklyMoney(w.cents)):'—'}</td></tr>)}</tbody><tfoot><tr><th scope="row">รวม</th><td>{view.count}</td><td>{moneyText(weeklyMoney(view.total))}</td></tr></tfoot></table></div></details>
    </>}
  </section>;
}
