import { thaiDate } from "../utils/thaiDate";
import { categoryAppearance } from "../utils/categoryAppearance";
import { useEffect,useId,useState,type CSSProperties } from 'react';
import Dropdown,{TagIcon} from './Dropdown';
import DatePill from './DatePill';
import { apiFetch } from '../api';
import { getToken } from '../auth';
import { moneyText } from '../utils/dashboard';
import { validateRange } from '../utils/overviewPeriod';
import { addDays,defaultWeekRange,isMonday,isSunday,lastClosedSunday,weeklyMoney,weeklyView,type WeeklyResponse } from '../utils/weeklyExpenses';
import './WeeklyExpenses.css';

const monthShort=new Intl.DateTimeFormat('th-TH',{timeZone:'UTC',month:'short'});
const mon=(d:string)=>monthShort.format(new Date(d+'T00:00:00Z'));
// "2026-10-19","2026-10-25" -> "19–25 ต.ค."; spans across months keep both month names.
const weekLabel=(a:string,b:string)=>a===b?`${+a.slice(8)} ${mon(a)}`:mon(a)===mon(b)?`${+a.slice(8)}–${+b.slice(8)} ${mon(b)}`:`${+a.slice(8)} ${mon(a)}–${+b.slice(8)} ${mon(b)}`;
// Whole baht drop ".00" to keep chart labels short; fractions stay exact.
const short=(cents:bigint)=>{const t=moneyText(weeklyMoney(cents));return t.endsWith('.00')?t.slice(0,-3):t;};
const niceStep=(v:number)=>{const p=10**Math.floor(Math.log10(v)),n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p;};
// Phone axis labels drop the month ("19–25"); the month goes once under the chart.
const dayRange=(a:string,b:string)=>a===b?`${+a.slice(8)}`:`${+a.slice(8)}–${+b.slice(8)}`;
const beYear=(d:string)=>+d.slice(0,4)+543;
const monthCaption=(a:string,b:string)=>mon(a)===mon(b)&&a.slice(0,4)===b.slice(0,4)?`${mon(a)} ${beYear(a)}`:`${mon(a)} ${beYear(a)} – ${mon(b)} ${beYear(b)}`;
const NARROW='(max-width: 600px)';
function useNarrow(){
  const [narrow,setNarrow]=useState(()=>window.matchMedia(NARROW).matches);
  useEffect(()=>{const q=window.matchMedia(NARROW),on=()=>setNarrow(q.matches);q.addEventListener('change',on);return()=>q.removeEventListener('change',on);},[]);
  return narrow;
}

export default function WeeklyExpenses({month,today,session}:{month:string;today:string;session:string|null}){
  // Only full Monday–Sunday weeks that have already ended; default is the last 4 of the chosen month.
  const closed=lastClosedSunday(today),initial=defaultWeekRange(month,today);
  const [start,setStart]=useState(initial.start),[end,setEnd]=useState(initial.end),[category,setCategory]=useState('');
  const [data,setData]=useState<{key:string;value:WeeklyResponse}|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  const [picked,setPicked]=useState(''),[focus,setFocus]=useState('');
  const clip=useId(),narrow=useNarrow();
  const key=start+':'+end,validation=validateRange({startDate:start,endDate:end})||(end>closed?'เลือกได้เฉพาะสัปดาห์ที่จบแล้ว':'')||(!isMonday(start)||!isSunday(end)?'ช่วงต้องเริ่มวันจันทร์และจบวันอาทิตย์ (ครบ 7 วันต่อสัปดาห์)':'');
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
  const colorOf=(name:string)=>categoryAppearance(name).color;
  const categoryName=options.find(([id])=>id===category)?.[1]??'';
  // Per-week segments, largest at the bottom; a filter leaves one segment.
  const segments=(w:NonNullable<typeof view>['weeks'][number])=>category?(w.count?[{id:category,name:categoryName,amount:Number(w.cents)/100}]:[]):[...w.categories].filter(c=>c.amount>0).sort((a,b)=>b.amount-a.amount).map(c=>({id:c.categoryId,name:c.name,amount:c.amount}));
  const legend=view?(category?options.filter(([id])=>id===category):options.filter(([id])=>view.weeks.some(w=>w.categories.some(c=>c.categoryId===id&&c.amount>0)))):[];
  const weeks=view?.weeks??[];
  const max=Math.max(0,...weeks.map(w=>Number(w.cents)/100));
  const step=niceStep((max||1)/3),top=Math.ceil((max||1)/step)*step;
  const ticks=Array.from({length:Math.round(top/step)+1},(_,i)=>i*step);
  const selected=weeks.find(w=>w.startDate===picked)??weeks.reduce<typeof weeks[number]|undefined>((m,w)=>!m||w.cents>m.cents?w:m,undefined);
  const average=weeks.length?Number(view!.total)/100/weeks.length:0;
  // Whole-range totals per category for the phone "รวมทั้งช่วง" list (tap to highlight in the chart).
  const totals=view&&!category?options.map(([id,name])=>({id,name,amount:view.weeks.reduce((s,w)=>s+(w.categories.find(c=>c.categoryId===id)?.amount??0),0)})).filter(t=>t.amount>0).sort((a,b)=>b.amount-a.amount):[];
  const grand=totals.reduce((s,t)=>s+t.amount,0)||1;
  const W=narrow?Math.max(320,weeks.length*64):Math.max(560,weeks.length*112),H=200,left=narrow?34:48,right=narrow?4:12,base=164,plot=128,slot=(W-left-right)/Math.max(1,weeks.length),bar=Math.min(narrow?44:76,slot*.62);
  const y=(v:number)=>base-v/top*plot;
  return <section id="weekly-expenses" className="dashboard-panel weekly-expenses" aria-label="รายจ่ายย้อนหลังรายสัปดาห์" aria-busy={loading}>
    <header className="weekly-head"><h2><span className="weekly-eyebrow">รายจ่าย</span> ย้อนหลังรายสัปดาห์</h2></header>
    <div className="weekly-controls">
      <div className="weekly-range">
        <DatePill label="วันเริ่มต้นรายสัปดาห์ (วันจันทร์)" value={start} min="1900-01-01" max={addDays(closed,-6)} allow={isMonday} onChange={v=>{setStart(v);if(end<addDays(v,6))setEnd(addDays(v,6));}}/>
        <span className="weekly-arrow" aria-hidden="true">→</span>
        <DatePill label="วันสิ้นสุดรายสัปดาห์ (วันอาทิตย์)" value={end} min={addDays(start,6)} max={closed} allow={isSunday} onChange={setEnd}/>
      </div>
      <Dropdown className="weekly-dropdown dropdown-pill" aria-label="หมวดรายจ่ายรายสัปดาห์" value={category} onChange={setCategory} icon={<TagIcon/>} options={[{value:'',label:'ทุกหมวด'},...(category&&!options.some(([id])=>id===category)?[{value:category,label:'หมวดที่เลือก — ไม่มีรายการในช่วงนี้'}]:[]),...options.map(([id,name])=>({value:id,label:name,color:colorOf(name)}))]}/>
    </div>
    {validation&&<p role="alert">{validation}</p>}
    {loading&&<p role="status">กำลังโหลดรายจ่ายรายสัปดาห์...</p>}
    {error&&<div role="alert"><p>{error}</p><button type="button" onClick={()=>setRevision(n=>n+1)}>ลองใหม่รายสัปดาห์</button></div>}
    {view&&<>
      <div className="weekly-summary">
        <p className="weekly-total"><span>ยอดรวมช่วง {thaiDate(start)} ถึง {thaiDate(end)}</span><strong key={key+category} className="weekly-pop">{moneyText(weeklyMoney(view.total))}<small> ฿</small></strong></p>
        <dl className="weekly-stats"><div><dt>รายการ</dt><dd>{view.count}</dd></div><div><dt>เฉลี่ย/สัปดาห์</dt><dd>{Math.round(average).toLocaleString('th-TH')}<small> ฿</small></dd></div></dl>
        <p className="weekly-meta">{view.count} รายการ · เฉลี่ย <b>{Math.round(average).toLocaleString('th-TH')} ฿</b> ต่อสัปดาห์</p>
      </div>
      {!view.count?<p role="status" className="weekly-empty">ไม่มีรายจ่ายในช่วงและหมวดที่เลือก</p>:<>
        {selected&&!narrow&&<div className="weekly-detail" aria-live="polite"><p key={selected.startDate+category} className="weekly-pop"><strong>{weekLabel(selected.startDate,selected.endDate)}</strong> รวม <b>{short(selected.cents)} ฿</b></p><ul>{segments(selected).map(s=><li key={s.id}><i aria-hidden="true" style={{background:colorOf(s.name)}}/>{s.name} <b>{short(BigInt(Math.round(s.amount*100)))}</b></li>)}</ul></div>}
        {narrow&&<h3 className="weekly-chart-title">รายจ่ายแต่ละสัปดาห์ (บาท)</h3>}
        <div className="weekly-scroll" tabIndex={0} role="region" aria-label="กราฟรายสัปดาห์ เลื่อนแนวนอนได้"><svg key={key+category+(narrow?'n':'w')} className="weekly-chart" style={{minWidth:W}} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="กราฟแท่งรายจ่ายรายสัปดาห์ เรียงจากเก่าไปใหม่ ยอดแต่ละสัปดาห์แสดงบนแท่ง">
          {narrow&&selected&&(()=>{const i=weeks.indexOf(selected);return <rect className="weekly-column" x={left+i*slot+4} y={8} width={slot-8} height={base+34} rx={12}/>;})()}
          {ticks.map(t=><g key={t}><line className={t?'weekly-grid':'weekly-base'} x1={left} x2={W-right} y1={y(t)} y2={y(t)}/><text className="weekly-tick" x={left-(narrow?6:10)} y={y(t)+4} textAnchor="end">{t.toLocaleString('th-TH')}</text></g>)}
          {weeks.map((w,i)=>{const x=left+i*slot+(slot-bar)/2,cx=x+bar/2,h=Number(w.cents)/100/top*plot,active=w===selected;let acc=0;
            return <g key={w.startDate} className={'weekly-bar'+(active?' is-active':'')} style={{'--i':i} as CSSProperties} onClick={()=>setPicked(w.startDate)}><title>{weekLabel(w.startDate,w.endDate)+': '+weeklyMoney(w.cents)+' บาท'}</title>
              {w.count?<><clipPath id={clip+i}><rect x={x} y={base-h} width={bar} height={h} rx={Math.min(7,h/2)}/></clipPath>
                <g clipPath={`url(#${clip+i})`}>{segments(w).map(s=>{const sh=s.amount/(Number(w.cents)/100)*h;acc+=sh;return <rect key={s.id} className={focus&&focus!==s.id?'is-dimmed':''} x={x} y={base-acc} width={bar} height={Math.max(0,sh-(acc<h-.5&&sh>4?2:0))} fill={colorOf(s.name)}/>;})}</g>
                <text className="weekly-value" x={cx} y={base-h-10} textAnchor="middle">{short(w.cents)}</text></>
              :<><rect className="weekly-none" x={x} y={base-6} width={bar} height={6} rx={2}/><text className="weekly-value" x={cx} y={base-16} textAnchor="middle">—</text></>}
              <text className="weekly-label" x={cx} y={base+24} textAnchor="middle">{narrow?dayRange(w.startDate,w.endDate):weekLabel(w.startDate,w.endDate)}</text></g>;})}
        </svg></div>
        {narrow&&<p className="weekly-month">{monthCaption(start,end)}</p>}
        {narrow&&selected&&<div className="weekly-week" aria-live="polite" key={selected.startDate+category}>
          <p><strong>{weekLabel(selected.startDate,selected.endDate)}</strong><b>{short(selected.cents)} ฿</b></p>
          <ul>{segments(selected).map(s=><li key={s.id}><i aria-hidden="true" style={{background:colorOf(s.name)}}/><span>{s.name}</span><b>{short(BigInt(Math.round(s.amount*100)))}</b></li>)}</ul>
        </div>}
        {narrow&&totals.length>0&&<div className="weekly-totals">
          <p>รวมทั้งช่วง · แตะเพื่อเน้นในกราฟ</p>
          <ul>{totals.map(t=><li key={t.id}><button type="button" aria-pressed={focus===t.id} onClick={()=>setFocus(f=>f===t.id?'':t.id)}><i aria-hidden="true" style={{background:colorOf(t.name)}}/><span>{t.name}</span><b>{short(BigInt(Math.round(t.amount*100)))}</b><small>{Math.round(t.amount/grand*100)}%</small></button></li>)}</ul>
        </div>}
        <div className="weekly-weeks" role="group" aria-label="เลือกสัปดาห์เพื่อดูรายละเอียด">{weeks.map(w=><button type="button" key={w.startDate} aria-pressed={w===selected} onClick={()=>setPicked(w.startDate)}>{weekLabel(w.startDate,w.endDate)}</button>)}</div>
        {!narrow&&<ul className="weekly-legend" aria-label="สีตามหมวดหมู่">{legend.map(([id,name])=><li key={id}><i aria-hidden="true" style={{background:colorOf(name)}}/>{name}</li>)}</ul>}
      </>}
    </>}
  </section>;
}
