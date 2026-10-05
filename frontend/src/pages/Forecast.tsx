import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import { apiFetch } from '../api';
import { getToken, useSessionKey } from '../auth';
import { bangkokDate, moneyText } from '../utils/dashboard';
import './Forecast.css';

type Day={date:string;amount:string};
type View={status:'available'|'unavailable';asOfDate:string;cutoffDate:string;forecastStartDate:string;forecastEndDate:string;modelVersion:string;
 readiness:{transactionCount:number;observedSpanDays:number;lastExpenseDate:string|null;reasonCodes:string[]};
 training:{calendarDays:number;expenseDays:number;zeroFilledDays:number;longestGapDays:number};
 parameterMode:'fixed_default'|'inner_validation'|null;warningCodes:string[];clampedDays:number;
 summary:{daily:Day[]|null;sevenDayForecastTotal:string|null;previousSevenDayActual:string;periodDifference:string|null};
 previousPeriod:{startDate:string;endDate:string;daily:(Day&{hasExpenseRecords:boolean})[]};
 budgetComparison:null|{month:string;budgetAmount:string;actualMonthExpenseToNow:string;remainingAmount:string;remainingDaysIncludingToday:number;comparedDays:number;referenceAllowance:string;predictedAdditionalExpense:string|null;difference:string|null;status:string;suggestedAdditionalDailyAmount:string}};
const reasons:Record<string,string>={insufficient_expense_count:'มีรายจ่ายก่อนวันตัดข้อมูลไม่ครบ 30 รายการ',insufficient_observed_span:'วันแรกถึงวันสุดท้ายของรายจ่ายยังไม่ครอบคลุม 30 วัน'};
const budgetMessages:Record<string,string>={
  already_over_budget:'เกินงบแล้วจากยอดรายจ่ายจริง',budget_exhausted:'ใช้งบครบแล้ว',
  forecast_unavailable:'ยังเทียบประมาณการกับวงเงินไม่ได้',
  above_reference:'รายจ่ายที่คาดเพิ่มสูงกว่าวงเงินอ้างอิง',at_reference:'รายจ่ายที่คาดเพิ่มเท่ากับวงเงินอ้างอิง',
  below_reference:'รายจ่ายที่คาดเพิ่มต่ำกว่าวงเงินอ้างอิงสำหรับช่วงนี้ ไม่ใช่การรับประกันว่าจะอยู่ในงบ',
};
const cash=(v:string|null)=>v===null?'ยังพยากรณ์ไม่ได้':moneyText(v)+' บาท';
export default function Forecast(){
  const session=useSessionKey();const [today,setToday]=useState(bangkokDate);
  useEffect(()=>{const tick=()=>setToday(bangkokDate());const timer=window.setInterval(tick,30000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);};},[]);
  return <ForecastSession key={session+':'+today} session={session} today={today}/>;
}
function ForecastSession({session,today}:{session:string|null;today:string}){
  const [data,setData]=useState<View|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('spendsense-data-changed',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('spendsense-data-changed',refresh);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>{
    const controller=new AbortController();let active=true;setError('');setLoading(true);
    if(!session){setLoading(false);return()=>{active=false;controller.abort();};}
    void(async()=>{try{const r=await apiFetch('/forecast',{signal:controller.signal});if(!r.ok)throw Error();
      const view=await r.json() as View;
      if(active&&!controller.signal.aborted&&getToken()===session){setData(view);}
    }catch{if(active&&!controller.signal.aborted&&getToken()===session)setError('โหลดประมาณการไม่สำเร็จ กรุณาลองใหม่');}
    finally{if(active&&getToken()===session)setLoading(false);}})();
    return()=>{active=false;controller.abort();};
  },[session,today,revision]);
  const plotted=data?data.previousPeriod.daily.map(d=>({...d,value:d.amount})):[];
  const projected=data?.summary.daily;
  const chart=[...plotted.map(d=>({date:d.date,value:d.value,forecast:false,missing:!d.hasExpenseRecords})),...(projected??[]).map(d=>({date:d.date,value:d.amount,forecast:true,missing:false}))];
  // Numbers are only SVG coordinates; all amounts/totals come from server Decimal strings.
  const max=Math.max(1,...chart.map(d=>Number(d.value??0)));
  const line=(forecast:boolean)=>chart.map((d,i)=>d.forecast===forecast&&d.value!==null?(20+i*40)+','+(155-Number(d.value)/max*130):null).filter(Boolean).join(' ');
  const b=data?.budgetComparison;
  return <div className="forecast-page"><header className="forecast-header"><div><h1>พยากรณ์ค่าใช้จ่าย</h1><p>ประมาณการยอดรายจ่ายรวมรายวันด้วย Holt ไม่ใช่รายจ่ายจริง</p></div><UserHeader/></header>
    <Link to="/overview">กลับภาพรวมรายเดือน</Link>
    {loading&&<p role="status">กำลังคำนวณประมาณการ...</p>}
    {error&&<div role="alert"><p>{error}</p><button onClick={()=>setRevision(v=>v+1)}>ลองใหม่</button></div>}
    {data&&<><p>ประมาณการ 7 วัน: <strong>{data.forecastStartDate} ถึง {data.forecastEndDate}</strong> · ใช้ข้อมูลถึง {data.cutoffDate} (Asia/Bangkok)</p>
      <aside className="forecast-warning">วันที่ไม่มี Transaction ในช่วงอ้างอิงถูกเติมเป็น 0 เพื่อคำนวณ Holt ไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง การบันทึกไม่ครบอาจทำให้ประมาณการคลาดเคลื่อน</aside>
      {data.status==='unavailable'&&<section className="forecast-panel"><h2>ยังพยากรณ์ไม่ได้</h2><p>{data.readiness.reasonCodes.map(r=>reasons[r]??r).join(' · ')}</p><p>ตรวจว่าบันทึกรายการจริงครบหรือไม่ และสะสมประวัติให้เพียงพอ ไม่จำเป็นต้องสร้างรายการสมมติ</p><Link to="/transactions">ตรวจประวัติธุรกรรม</Link></section>}
<p>รายจ่ายสะสมถึงวันตัดข้อมูล {data.readiness.transactionCount} รายการ · ครอบคลุม {data.readiness.observedSpanDays} วัน · รายการล่าสุด {data.readiness.lastExpenseDate??'ยังไม่มี'}</p>
      {data.warningCodes.includes('stale_expense_history')&&<p className="forecast-warning">ข้อมูลรายจ่ายล่าสุดห่างจากวันตัดข้อมูลอย่างน้อย 7 วัน ประมาณการอาจไม่สะท้อนการใช้จ่ายปัจจุบัน</p>}
      {data.warningCodes.includes('long_recording_gap')&&<p className="forecast-warning">มีช่วงไม่มีรายการบันทึกต่อเนื่อง {data.training.longestGapDays} วัน ไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง</p>}
      <div className="forecast-cards">
        <section className="forecast-panel"><h2>ประมาณการรวม 7 วัน</h2><strong>{cash(data.summary.sevenDayForecastTotal)}</strong></section>
        <section className="forecast-panel"><h2>ยอดจริง 7 วันก่อนหน้า</h2><strong>{cash(data.summary.previousSevenDayActual)}</strong><p>{data.previousPeriod.startDate} ถึง {data.previousPeriod.endDate}</p></section>
        <section className="forecast-panel"><h2>ส่วนต่างจากช่วงก่อนหน้า</h2><strong>{data.summary.periodDifference===null?'ยังเปรียบเทียบไม่ได้':cash(data.summary.periodDifference)}</strong><p>เปรียบเทียบรายจ่ายรวม จำนวนวันเท่ากัน 7 วัน</p></section>
      </div>
      {data.summary.daily&&<section className="forecast-panel"><h2>Actual และ Forecast</h2>
        <svg viewBox="0 0 560 190" role="img" aria-label="รายจ่ายย้อนหลังเส้นทึบ และประมาณการเส้นประ มีข้อมูลละเอียดในตารางด้านล่าง">
          <line x1="280" y1="10" x2="280" y2="160" stroke="#64748b" strokeDasharray="3 3"/>
          <polyline points={line(false)} fill="none" stroke="#176b62" strokeWidth="3"/>
          <polyline points={line(true)} fill="none" stroke="#925800" strokeWidth="3" strokeDasharray="7 5"/>
          {chart.map((d,i)=>d.value!==null&&<circle key={d.date} cx={20+i*40} cy={155-Number(d.value)/max*130} r="4" fill={d.missing?'white':d.forecast?'#925800':'#176b62'} stroke="#334155"/>)}
          <text x="20" y="180">Actual 7 วัน</text><text x="300" y="180">Forecast 7 วัน</text>
        </svg>
        <p>เส้นทึบ: ยอดที่บันทึก · วงกลมโปร่ง: ไม่มีรายการ · เส้นประ: ประมาณการ</p>
        <details><summary>เปิดตารางข้อมูลกราฟ</summary><div className="forecast-table" tabIndex={0} role="region" aria-label="ข้อมูลกราฟ"><table><caption>ยอดรายวันและสถานะข้อมูล</caption><thead><tr><th scope="col">วันที่</th><th scope="col">ประเภท</th><th scope="col">จำนวนเงิน (บาท)</th></tr></thead><tbody>{chart.map(d=><tr key={d.date}><th scope="row">{d.date}</th><td>{d.forecast?'ประมาณการ':d.missing?'ไม่มีรายการที่บันทึก':'ยอดจริงที่บันทึก'}</td><td>{d.value===null?'—':moneyText(d.value)}</td></tr>)}</tbody></table></div></details>
      </section>}
      <section className="forecast-panel"><h2>วงเงินอ้างอิงและคำแนะนำ</h2>{!b?<p>ยังไม่ได้ตั้งงบรวม จึงไม่มีการเทียบวงเงิน <Link to={'/budget?month='+data.asOfDate.slice(0,7)}>ตั้งงบประมาณ</Link></p>:<>
        <h3>{budgetMessages[b.status]}</h3><p>ใช้จริงเดือนนี้ {cash(b.actualMonthExpenseToNow)} · งบคงเหลือ {cash(b.remainingAmount)}</p>
        <p>วงเงินอ้างอิง {cash(b.referenceAllowance)} สำหรับ {b.comparedDays} วันในเดือน {b.month} จากวันที่เหลือ {b.remainingDaysIncludingToday} วันรวมวันนี้</p>
        <p>รายจ่ายที่คาดเพิ่มในช่วงเทียบงบ {cash(b.predictedAdditionalExpense)} · ส่วนต่าง {b.difference===null?'ยังเปรียบเทียบไม่ได้':cash(b.difference)}</p>
        <p>วงเงินเพิ่มเติมเฉลี่ยไม่เกิน {cash(b.suggestedAdditionalDailyAmount)} ต่อวัน รวมวันนี้</p>
        <p>หักยอดจริงรวมวันนี้จากประมาณการรวมวันนี้แล้ว ไม่นับซ้ำ ไม่รวมวันเดือนถัดไปในการเทียบงบ และไม่รับประกันว่าจะเพียงพอต่อภาระจ่ายที่ยังไม่ได้บันทึก</p></>}</section>
<details className="forecast-panel"><summary>วิธีคำนวณและข้อจำกัด</summary><p>รวมรายจ่ายทุกหมวดต่อวันก่อนใช้ Holt linear trend หนึ่งชุด ใช้ประวัติไม่เกิน 180 วันถึงเมื่อวาน ไม่รวมรายรับ Profile หรือเงิน Goals และไม่ตัดรายจ่ายตาม anomaly review</p><p>เริ่มเมื่อมีรายจ่ายสะสม 30 รายการและวันแรกถึงวันสุดท้ายครอบคลุม 30 วันรวมวันต้นและปลาย เกณฑ์นี้ไม่ใช่หลักประกันความแม่นยำ</p><p>โหมดพารามิเตอร์: {data.parameterMode==='fixed_default'?'ค่าเริ่มต้นคงที่':data.parameterMode==='inner_validation'?'เลือกจากข้อมูลย้อนหลังด้วย inner validation':'ยังไม่พยากรณ์'} · ใช้ข้อมูล {data.training.calendarDays} วัน เติมศูนย์ {data.training.zeroFilledDays} วัน</p><p>ค่าพยากรณ์ติดลบปรับเป็นศูนย์ {data.clampedDays} วัน ไม่รับประกันว่าจะอยู่ในงบทั้งเดือน</p><p>Model: {data.modelVersion}</p></details>
    </>}
  </div>;
}
