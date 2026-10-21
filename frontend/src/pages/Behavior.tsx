import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import UserHeader from '../components/UserHeader';
import { apiFetch } from '../api';
import { getToken, useSessionKey } from '../auth';
import { bangkokDate, moneyText } from '../utils/dashboard';
import './Behavior.css';

type Metric={amount:string;transactionCount:number;distinctDays:number;averagePerTransaction:string|null;sharePercent:string|null};
type Difference={amount:{difference:string;changePercent:string|null};transactionCount:{difference:number;changePercent:string|null};averagePerTransaction:{difference:string;changePercent:string|null}|null;shareDifferencePoints:string|null};
type Readiness={ready:boolean;expenseCount:number;observedSpanDays:number;distinctExpenseDays:number;reasonCodes:string[]};
type Day={date:string;amount:string;transactionCount:number;hasExpenseRecords:boolean};
type Category={categoryId:string|null;categoryName:string;current:Metric;previous:Metric;comparison:Difference|null;findingEligible:boolean;findingReasonCodes:string[]};
type Time={confirmedCount:number;excludedCount:number;coveragePercent:string;ready:boolean;reasonCodes:string[];buckets:(Metric&{bucket:number;startHour:number;endHourExclusive:number})[]};
type Week={calendarOccurrences:number;recordedDays:number;amount:string;transactionCount:number;averagePerCalendarOccurrence:string|null};
type EvidenceRow={id:string;date:string;amount:string;time:string|null};
type Finding={ruleId:string;categoryId:string|null;categoryName:string|null;scope:string;title:string;recommendation:string;evidence:unknown};
type View={asOfDate:string;ruleVersion:string;status:string;periods:{current:{startDate:string;endDate:string};previous:{startDate:string;endDate:string};days:number};
  categoryOptions:{categoryId:string|null;categoryName:string}[];
  readiness:{current:Readiness;previous:Readiness;comparisonReady:boolean;comparisonReasonCodes:string[]};
  facts:{summary:{current:Metric;previous:Metric;comparison:Difference|null};categories:Category[];daily:{dayIndex:number;current:Day;previous:Day}[];
    weekdayDistribution:{weekday:number;current:Week;previous:Week;comparison:{difference:string;changePercent:string|null}|null}[];
    timeDistribution:{current:Time;previous:Time};recurrenceCandidates:{categoryId:string|null;categoryName:string;amount:string;dates:string[];kind:string;transactions?:EvidenceRow[];occurrenceCount?:number;startDate?:string;endDate?:string}[];
    recurrence:{hasMore:boolean;limit:number;reasonCodes:string[]}};
  findings:Finding[];previewFindingCount:number};
const reasons:Record<string,string>={insufficient_expense_count:'รายจ่ายยังไม่ครบ 30 รายการ',insufficient_observed_span:'ระยะจากรายการแรกถึงสุดท้ายยังไม่ครบ 30 วัน',
  insufficient_confirmed_time_count:'เวลาที่ยืนยันยังไม่ครบ 30 รายการ',insufficient_confirmed_time_coverage:'เวลาที่ยืนยันครอบคลุมไม่ถึง 80%',period_not_ready:'ข้อมูลช่วงนี้ยังไม่ผ่านเกณฑ์หลัก',
  current_period_not_ready:'ช่วงปัจจุบันยังไม่พร้อมสรุปแบบแผน',periods_not_ready:'มีช่วงที่ยังไม่พร้อมเปรียบเทียบ',insufficient_category_count_or_days:'รายหมวดยังไม่ครบ 5 รายการใน 3 วันต่อช่วง'};
const cash=(v:string|null)=>v===null?'—':moneyText(v)+' บาท';
const percent=(v:string|null)=>v===null?'—':v+'%';
const shift=(date:string,n:number)=>{const d=new Date(date+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
function Table({caption,children}:{caption:string;children:ReactNode}){return <div className="behavior-table" role="region" aria-label={caption} tabIndex={0}><table><caption>{caption}</caption>{children}</table></div>;}
function Ready({label,value}:{label:string;value:Readiness}){return <div className="behavior-readiness-item"><div className="behavior-readiness-heading"><strong>{label}</strong><span className={'behavior-status-tag '+(value.ready?'is-ready':'is-insufficient')}>{value.ready?'ผ่านเกณฑ์':'ยังสรุปแบบแผนไม่ได้'}</span></div><p>{value.expenseCount} รายการ · ระยะข้อมูล {value.observedSpanDays} วัน · วันที่มีรายการ {value.distinctExpenseDays} วัน</p>{value.reasonCodes.length>0&&<p className="behavior-readiness-reasons">{value.reasonCodes.map(r=>reasons[r]??r).join(' · ')}</p>}</div>;}
function CategoryLabel({name}:{name:string}){return name.length>70?<details className="behavior-full-name"><summary><span>{name}</span><small>ดูชื่อหมวดเต็ม</small></summary><p>{name}</p></details>:<span>{name}</span>;}

export default function Behavior(){
  const session=useSessionKey(),[today,setToday]=useState(bangkokDate);
  useEffect(()=>{const tick=()=>setToday(bangkokDate());const timer=window.setInterval(tick,30000);window.addEventListener('focus',tick);return()=>{clearInterval(timer);window.removeEventListener('focus',tick);};},[]);
  return <BehaviorBody key={session+':'+today} session={session} today={today}/>;
}
function BehaviorBody({session,today}:{session:string|null;today:string}){
  const [params,setParams]=useSearchParams(),query=params.toString(),yesterday=shift(today,-1);
  const start=params.get('startDate')??shift(yesterday,-29),end=params.get('endDate')??yesterday,category=params.get('categoryId')??'';
  const preset=end===yesterday?[7,30,90].find(n=>start===shift(yesterday,1-n))?.toString()??'custom':'custom';
  const [custom,setCustom]=useState(preset==='custom'),[draftStart,setDraftStart]=useState(start),[draftEnd,setDraftEnd]=useState(end);
  const [snapshot,setSnapshot]=useState<{query:string;view:View}|null>(null),[options,setOptions]=useState<View['categoryOptions']>([]);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true),[revision,setRevision]=useState(0),[showAll,setShowAll]=useState(false);
  useEffect(()=>{setDraftStart(start);setDraftEnd(end);if(preset==='custom')setCustom(true);},[start,end,preset]);
  const realDay=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
  const validDraft=realDay(draftStart)&&realDay(draftEnd)&&draftStart<=draftEnd&&draftEnd<=yesterday&&(Date.parse(draftEnd)-Date.parse(draftStart))/86400000<366;
  const applyDates=(a:string,b:string)=>{if(realDay(a)&&realDay(b)&&a<=b&&b<=yesterday&&(Date.parse(b)-Date.parse(a))/86400000<366){const next=new URLSearchParams(params);next.set('startDate',a);next.set('endDate',b);setParams(next);}};
  const selectPeriod=(value:string)=>{if(value==='custom'){setCustom(true);return;}setCustom(false);applyDates(shift(yesterday,1-Number(value)),yesterday);};
  const selectCategory=(value:string)=>{const next=new URLSearchParams(params);if(value)next.set('categoryId',value);else next.delete('categoryId');setParams(next);};
  useEffect(()=>{const refresh=()=>setRevision(v=>v+1);window.addEventListener('spendsense-data-changed',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('spendsense-data-changed',refresh);window.removeEventListener('focus',refresh);};},[]);
  useEffect(()=>{
    let active=true;const controller=new AbortController();setLoading(true);setError('');setShowAll(false);
    if(!session){setLoading(false);return()=>{active=false;controller.abort();};}
    void(async()=>{try{
      const response=await apiFetch('/behavior'+(query?'?'+query:''),{signal:controller.signal});
      if(!response.ok){const result=await response.json().catch(()=>({}));throw Error(result.error??'โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่');}
      const view=await response.json() as View;
      if(active&&!controller.signal.aborted&&getToken()===session){setSnapshot({query,view});setOptions(view.categoryOptions);}
    }catch(e){if(active&&!controller.signal.aborted&&getToken()===session)setError(e instanceof Error?e.message:'โหลดข้อมูลไม่สำเร็จ');}
    finally{if(active&&!controller.signal.aborted&&getToken()===session)setLoading(false);}})();
    return()=>{active=false;controller.abort();};
  },[session,query,revision]);
  const data=validDraft&&snapshot?.query===query?snapshot.view:null;
  const ready=data?.readiness.comparisonReady??false,summary=data?.facts.summary,featured=data?.findings.find(f=>f.ruleId.startsWith('possible_recurrence_'));
  const findings=data?.findings.filter(f=>!f.ruleId.startsWith('possible_recurrence_')).slice(0,showAll?undefined:data.previewFindingCount)??[];
  const adviceFindings=[...findings,...(data?.findings.filter(f=>f.ruleId.startsWith('possible_recurrence_')).slice(0,1)??[])];
  const daily=data?.facts.daily??[];
  const max=Math.max(1,...daily.flatMap(d=>ready?[Number(d.current.amount),Number(d.previous.amount)]:[Number(d.current.amount)]));
  const x=(i:number)=>38+(daily.length<=1?0:i*550/(daily.length-1)),y=(v:string)=>175-Number(v)/max*145;
  const draw=(side:'current'|'previous')=>{
    let connected=false;const segments=daily.map((d,i)=>{if(!d[side].hasExpenseRecords){connected=false;return '';}const point=(connected?'L':'M')+x(i)+' '+y(d[side].amount);connected=true;return point;}).join(' ');
    const color=side==='current'?'#328277':'#d39a3c';
    return <g><path d={segments} fill="none" stroke={color} strokeWidth="2" strokeDasharray={side==='previous'?'5 4':undefined}/>{daily.map((d,i)=>d[side].hasExpenseRecords?<circle key={d.dayIndex} cx={x(i)} cy={y(d[side].amount)} r="2.5" fill={color}/>:<path key={d.dayIndex} d={'M'+(x(i)-2)+' '+(side==='current'?184:191)+' l4 4 m-4 0 l4 -4'} stroke={color}/>)}</g>;
  };
  const time=data?.facts.timeDistribution.current;
  return <div className="behavior-page">
    <header className="behavior-header compact-page-toolbar"><h1 className="page-heading-accessible">การวิเคราะห์พฤติกรรมการใช้จ่าย</h1><UserHeader/></header>
    <section className="behavior-hero" aria-label="สรุปข้อสังเกตรูปแบบซ้ำ">
      <div><p className="behavior-eyebrow">ข้อสังเกตจากรายการย้อนหลัง{data&&<span>ช่วงที่เลือก {data.periods.current.startDate}–{data.periods.current.endDate}</span>}</p>
        <h2>{!data?(loading?'กำลังอ่านข้อมูลการใช้จ่าย':error?'ยังโหลดข้อมูลไม่สำเร็จ':'เลือกช่วงวันเต็มที่ต้องการดู'):!data.readiness.current.ready?'ยังสรุปแบบแผนการใช้จ่ายไม่ได้':featured?(featured.categoryName?featured.categoryName+' — ':'')+featured.title:'ยังไม่พบรูปแบบเด่นตามกฎที่กำหนด'}</h2>
        {data?<p>{featured&&data.readiness.current.ready?<><Evidence finding={featured}/><span className="behavior-history-note">เป็นหลักฐานในช่วงที่ระบุ ไม่ยืนยันว่าเกิดซ้ำต่อเนื่องจนถึงปัจจุบัน</span></>:data.status==='no_data'?'ยังไม่มีรายจ่ายที่บันทึกในช่วงนี้':data.readiness.current.ready?'แสดงข้อเท็จจริงด้านล่าง โดยไม่สรุปสาเหตุหรือแรงจูงใจ':'ต้องมีอย่างน้อย 30 รายการและระยะจากรายการแรกถึงสุดท้าย 30 วัน ดูเหตุผลของแต่ละช่วงด้านล่าง'}</p>:<p>ระบบอ่านและคำนวณให้อัตโนมัติ ไม่สร้างหรือแก้ไขธุรกรรม</p>}
      </div><svg className="behavior-hero-icon" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="47" fill="#dae2e9"/><circle cx="50" cy="36" r="12" fill="#20364c"/><path d="M25 73v-8c0-12 11-19 25-19s25 7 25 19v8Z" fill="#20364c"/></svg>
    </section>
    <div className="behavior-state" aria-live="polite">
      {loading&&<p role="status">กำลังอัปเดตผลจากตัวกรองที่เลือก...</p>}
      {!validDraft&&<p role="alert">เลือกวันที่จริงให้ครบ เริ่มไม่เกินสิ้นสุด ช่วงไม่เกิน 366 วัน และสิ้นสุดไม่เกิน {yesterday}</p>}
      {error&&<div role="alert"><span>{error}</span> <button type="button" onClick={()=>setRevision(v=>v+1)}>ลองใหม่</button></div>}
    </div>
    <div className="behavior-report" aria-busy={loading} data-scope={query}>
      <section className="behavior-kpis" aria-label="สรุปรายจ่าย">
        <article><span>ยอดรายจ่ายรวม</span><strong>{summary?cash(summary.current.amount):'—'}</strong>{ready&&<small className="behavior-change">ส่วนต่าง {cash(summary!.comparison!.amount.difference)} ({percent(summary!.comparison!.amount.changePercent)})</small>}</article>
        <article><span>จำนวนรายการ</span><strong>{summary?summary.current.transactionCount.toLocaleString('th-TH'):'—'}</strong><small>รายการรายจ่ายที่บันทึก</small></article>
        <article><span>ค่าใช้จ่ายเฉลี่ยต่อครั้ง</span><strong>{summary?cash(summary.current.averagePerTransaction):'—'}</strong><small>ยอดรายจ่าย ÷ จำนวนรายการ</small></article>
        <article><span>หมวดที่มียอดสูงสุด</span><div className="behavior-category-name">{summary?.current.transactionCount?<CategoryLabel name={data!.facts.categories[0]?.categoryName??'ไม่ระบุหมวด'}/>:<strong>ยังไม่มีรายการ</strong>}</div><small>{summary?.current.transactionCount?percent(data!.facts.categories[0]?.current.sharePercent??null):'—'}</small></article>
      </section>
      {data&&<section className="behavior-readiness" aria-label="ความพร้อมข้อมูล"><Ready label="ช่วงที่เลือก" value={data.readiness.current}/><Ready label="ช่วงก่อนหน้า" value={data.readiness.previous}/></section>}
      <div className="behavior-main-grid">
        <section className="behavior-panel behavior-chart-panel">
          <div className="behavior-panel-heading"><h2>กราฟค่าใช้จ่ายตามช่วงเวลา</h2>
            <div className="behavior-controls" role="group" aria-label="ตัวกรองพฤติกรรม">
              <label><span className="behavior-sr-only">หมวด</span><select name="categoryId" aria-label="เลือกหมวด" value={category} onChange={e=>selectCategory(e.target.value)}><option value="">ทุกหมวด</option>{category&&!options.some(c=>(c.categoryId??'uncategorized')===category)&&<option value={category}>หมวดที่เลือก</option>}{options.map(c=><option key={c.categoryId??'uncategorized'} value={c.categoryId??'uncategorized'}>{c.categoryName}</option>)}</select></label>
              <label><span className="behavior-sr-only">ช่วงเวลา</span><select name="period" aria-label="เลือกช่วงเวลา" value={custom?'custom':preset} onChange={e=>selectPeriod(e.target.value)}><option value="7">7 วันเต็มล่าสุด</option><option value="30">30 วันเต็มล่าสุด</option><option value="90">90 วันเต็มล่าสุด</option><option value="custom">กำหนดช่วงเอง</option></select></label>
              {custom&&<div className="behavior-custom-dates"><label>เริ่มต้น<input name="startDate" type="date" max={yesterday} value={draftStart} onChange={e=>{setDraftStart(e.target.value);applyDates(e.target.value,draftEnd);}}/></label><label>สิ้นสุด<input name="endDate" type="date" max={yesterday} min={draftStart} value={draftEnd} onChange={e=>{setDraftEnd(e.target.value);applyDates(draftStart,e.target.value);}}/></label></div>}
            </div>
          </div>
          <p className="behavior-caption">ข้อมูลถึงเมื่อวาน ({yesterday}) ตาม Asia/Bangkok · เปลี่ยนตัวกรองแล้วอัปเดตอัตโนมัติ</p>
          {data&&<p className="behavior-period-label">ช่วงที่เลือก {data.periods.current.startDate}–{data.periods.current.endDate}<br/>ก่อนหน้า {data.periods.previous.startDate}–{data.periods.previous.endDate} · ช่วงละ {data.periods.days} วัน</p>}
          {summary?.current.transactionCount?<><svg className="behavior-chart" viewBox="0 0 620 225" role="img" aria-label="ยอดรายจ่ายตามลำดับวันในช่วง อ่านวันที่จริงและยอดในตารางด้านล่าง"><line x1="38" y1="175" x2="590" y2="175" stroke="#ccd8dc"/>{draw('current')}{ready&&draw('previous')}<text x="30" y="218">วันที่ 1</text><text x="500" y="218">วันที่ {data!.periods.days}</text></svg><p className="behavior-legend"><span>● ช่วงที่เลือก</span>{ready&&<span>◌ ก่อนหน้า (เส้นประ)</span>}<span>× ไม่มีรายการ ไม่ใช่ศูนย์ที่ยืนยันแล้ว</span></p></>:<div className="behavior-chart-empty">{loading?'กำลังโหลดกราฟ':error?'โหลดกราฟไม่สำเร็จ':'ไม่มีรายจ่ายที่บันทึกสำหรับกราฟช่วงนี้'}</div>}
          {data&&<details className="behavior-daily-details"><summary>ตารางข้อมูลกราฟและวันที่จริง</summary><Table caption="จับคู่ตามลำดับวัน ไม่ใช่วันที่ปฏิทินเดียวกัน"><thead><tr><th scope="col">วันลำดับ</th><th scope="col">ปัจจุบัน</th><th scope="col">ก่อนหน้า</th></tr></thead><tbody>{daily.map(d=><tr key={d.dayIndex}><th scope="row">{d.dayIndex}</th>{(['current','previous'] as const).map(side=><td key={side}>{d[side].date}<br/>{d[side].hasExpenseRecords?cash(d[side].amount)+' · '+d[side].transactionCount+' รายการ':'ไม่มีรายการที่บันทึก'}</td>)}</tr>)}</tbody></Table></details>}
        </section>
        <section className="behavior-panel behavior-category-panel"><div className="behavior-panel-heading"><h2>หมวดที่มีสัดส่วนและการเปลี่ยนแปลงเด่น</h2><span className="behavior-scope-label">ใช้ตัวกรองเดียวกับกราฟ</span></div>
          {data?<Table caption="สัดส่วนปัจจุบันและการเปลี่ยนแปลงยอดตามตัวกรอง"><thead><tr><th scope="col">หมวด / ยอด</th><th scope="col">สัดส่วน</th><th scope="col">เปลี่ยนแปลงจากช่วงก่อน</th></tr></thead><tbody>{data.facts.categories.map((c,i)=><tr key={c.categoryId??'uncategorized'}><th scope="row"><span className={'behavior-category-dot dot-'+i%4} aria-hidden="true">▥</span><CategoryLabel name={c.categoryName}/><small>{cash(c.current.amount)}</small></th><td>{percent(c.current.sharePercent)}</td><td>{ready&&c.comparison?<div className="behavior-change"><span className={c.comparison.amount.difference.startsWith('-')?'change-down':'change-up'}>{cash(c.comparison.amount.difference)}<br/>{percent(c.comparison.amount.changePercent)}</span><small>สัดส่วนต่าง {c.comparison.shareDifferencePoints??'—'} จุดเปอร์เซ็นต์</small></div>:<span>ยังเปรียบเทียบไม่ได้</span>}</td></tr>)}</tbody></Table>:<p>{loading?'กำลังโหลดรายหมวด':'ยังไม่มีข้อมูลรายหมวด'}</p>}
          {data&&!data.facts.categories.length&&<p>ไม่มีรายการรายจ่ายในทั้งสองช่วง</p>}
          {!ready&&data&&<p className="behavior-note">ซ่อนส่วนต่างและเปอร์เซ็นต์เปลี่ยนแปลง เพราะช่วงใดช่วงหนึ่งยังไม่พร้อม</p>}
        </section>
        <section className="behavior-panel behavior-findings"><h2>ลักษณะรายการที่พบ</h2>
        {data?(<section className="behavior-recurrences" aria-label="รูปแบบที่เกิดซ้ำ"><h3>รูปแบบที่เกิดซ้ำ <span className="behavior-count-tag">{data.facts.recurrenceCandidates.length}{data.facts.recurrence.hasMore?'+':''} กลุ่ม</span></h3><p className="behavior-caption">หลักฐานย้อนหลังในช่วงที่เลือก ไม่ใช่การยืนยันว่ารายการยังเกิดอยู่ในปัจจุบัน</p>
          <details className="behavior-recurrence-rules"><summary>เกณฑ์และขอบเขตหลักฐาน</summary>
          <p>ตรวจทุกหน้าต่างในช่วงที่เลือก: ทั่วไป 5 วันที่ไม่ซ้ำใน 30 วัน; รายสัปดาห์ 4 ครั้งใน 28 วันห่างตรง 7 วัน; รายเดือน 3 ครั้งใน 90 วัน ในเดือนติดกันวันเดียวกันหรือสิ้นเดือน</p>
          <p>จับคู่เฉพาะหมวดและยอดเท่ากันพอดี เกณฑ์ยอดใกล้กันยังรอยืนยัน แสดงช่วงหลักฐานแรกที่ผ่านของแต่ละกลุ่มและประเภท ไม่ยืนยันว่าเป็นบิลเดียวกันหรืออธิบายสาเหตุ</p>
          </details>
          {data.facts.recurrence.reasonCodes.map(r=><p key={r}>{reasons[r]??r}</p>)}
          {data.facts.categories.filter(c=>c.current.transactionCount>0&&!data.facts.recurrenceCandidates.some(r=>r.categoryId===c.categoryId)).map(c=><p key={c.categoryId??'uncategorized'}>{c.categoryName}: {data.facts.recurrence.hasMore?'ยังไม่แสดงหลักฐานหมวดนี้ในกลุ่มแรก ไม่สามารถสรุปจากรายการที่จำกัดไว้':'หลักฐานยังไม่เพียงพอสำหรับรูปแบบซ้ำตามเกณฑ์ที่กำหนด'}</p>)}
          {data.facts.recurrenceCandidates.map((r,i)=><article className="behavior-pattern-card" id={'behavior-recurrence-'+i} tabIndex={-1} key={i}><div className="behavior-pattern-heading"><h4>{r.categoryName}</h4><span className="behavior-pattern-kind">{r.kind==='weekly'?'รายสัปดาห์':r.kind==='monthly'?'รายเดือน':'ทั่วไป'}</span></div>
            <p className="behavior-pattern-amount">{cash(r.amount)} <span>ต่อรายการในหลักฐาน</span></p>
            <dl className="behavior-pattern-facts"><div><dt>จำนวนครั้ง</dt><dd>{r.occurrenceCount??r.dates.length} ครั้ง · {r.dates.length} วันที่ไม่ซ้ำ</dd></div><div><dt>ช่วงหลักฐาน</dt><dd>{r.startDate??r.dates[0]}–{r.endDate??r.dates[r.dates.length-1]}</dd></div><div><dt>พบล่าสุดในหลักฐานนี้</dt><dd>{r.endDate??r.dates[r.dates.length-1]}</dd></div></dl>
            <EvidenceTransactions evidence={r}/>
          </article>)}
          {data.facts.recurrence.hasMore&&<p>แสดง {data.facts.recurrence.limit} กลุ่มแรก ไม่ใช่ทั้งหมด</p>}
        </section>):<p>{loading?'กำลังอ่านรูปแบบจากข้อมูล':error?'โหลดรูปแบบไม่สำเร็จ':'ยังไม่มีข้อมูลรูปแบบ'}</p>}
        <div className="behavior-comparison-heading"><h3>การเปลี่ยนแปลงเทียบช่วงก่อนและข้อสังเกตเวลา</h3><p className="behavior-caption">การเปลี่ยนแปลงเพียงอย่างเดียวไม่ยืนยันว่าเป็นรูปแบบที่เกิดซ้ำ</p></div>
          {findings.length?<ol>{findings.map((f,i)=><li key={f.ruleId+':'+i} id={'behavior-evidence-'+i} tabIndex={-1}><strong>{f.categoryName?f.categoryName+' — ':''}{f.title}</strong><p><strong>{f.scope==='comparison'?'การเปลี่ยนแปลงเทียบช่วงก่อน':'ข้อสังเกตช่วงเวลา'}</strong></p><p><Evidence finding={f}/></p><EvidenceTransactions evidence={f.evidence}/></li>)}</ol>:<p>{!data?'กำลังรอข้อมูล':data.readiness.current.ready?'ยังไม่พบข้อสังเกตที่ผ่านเกณฑ์':'ยังสรุปแบบแผนไม่ได้ ดูจำนวนรายการและช่วงข้อมูลด้านล่าง'}</p>}
          {data&&data.findings.filter(f=>!f.ruleId.startsWith('possible_recurrence_')).length>data.previewFindingCount&&<button type="button" onClick={()=>setShowAll(v=>!v)}>{showAll?'แสดงเฉพาะข้อค้นพบเด่น':'ดูข้อค้นพบและคำแนะนำทั้งหมด'}</button>}
          <p className="behavior-caption">พิจารณาหลายตัวชี้วัดร่วมกัน ไม่ใช้รายการเดียวตัดสิน</p>
        </section>
        <section className="behavior-panel behavior-advice"><h2>คำแนะนำ</h2>
          {adviceFindings.length?<ol>{adviceFindings.map((f,i)=>{const target=f.ruleId.startsWith('possible_recurrence_')?'behavior-recurrence-0':'behavior-evidence-'+i;return <li key={f.ruleId+':'+i}><p>{f.recommendation}</p><a href={'#'+target} onClick={()=>document.getElementById(target)?.focus()}>ดูหลักฐานข้อ {i+1}{f.categoryName?' · '+f.categoryName:''}</a></li>;})}</ol>:<p>ตรวจความครบถ้วนของรายการที่บันทึกก่อน ยังไม่มีข้อค้นพบเพียงพอสำหรับคำแนะนำเฉพาะรูปแบบ</p>}
          <p className="behavior-caption">คำแนะนำอ้างข้อมูลที่พบ ไม่ได้พิสูจน์สาเหตุหรือแรงจูงใจ</p>
        </section>
      </div>
      {data&&<section className="behavior-panel behavior-method"><h2>ขอบเขตข้อมูลและหลักฐานเพิ่มเติม</h2>
        <p className="behavior-note">วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง เกณฑ์ 30 รายการและระยะ 30 วันไม่ยืนยันข้อมูลครบหรือมีนัยสำคัญทางสถิติ{!ready?' ยังเปรียบเทียบแบบแผนไม่ได้ จึงงดข้อค้นพบเปรียบเทียบ':''}</p>
        <details><summary>ตัวชี้วัดรายหมวดและเหตุผลที่ไม่สรุป</summary><Table caption="จำนวนรายการและค่าเฉลี่ยจริงทั้งสองช่วง"><thead><tr><th>หมวด</th><th>ปัจจุบัน</th><th>ก่อนหน้า</th></tr></thead><tbody>{data.facts.categories.map(c=><tr key={c.categoryId??'uncategorized'}><th>{c.categoryName}<small>{c.findingEligible?'':('หลักฐานยังไม่เพียงพอสำหรับข้อสรุปเปรียบเทียบ · '+c.findingReasonCodes.map(r=>reasons[r]??r).join(' · '))}</small></th>{(['current','previous'] as const).map(side=><td key={side}>{cash(c[side].amount)} · {c[side].transactionCount} รายการ<br/>เฉลี่ย {cash(c[side].averagePerTransaction)}</td>)}</tr>)}</tbody></Table></details>
        <details><summary>วันในสัปดาห์ — จำนวนวันและค่าเฉลี่ย</summary><p>หารด้วยจำนวนครั้งที่วันนั้นเกิดในช่วง รวมวันที่ไม่มีรายการ ไม่ใช้ยอดรวมเพียงอย่างเดียวสรุปว่าวันใดใช้มากกว่า</p><Table caption="จำนวนวันปฏิทิน ยอด และเฉลี่ยต่อวันประเภทนั้น"><thead><tr><th>วัน</th><th>ปัจจุบัน</th><th>ก่อนหน้า</th></tr></thead><tbody>{data.facts.weekdayDistribution.map(w=><tr key={w.weekday}><th>{['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'][w.weekday-1]}</th>{(['current','previous'] as const).map(side=><td key={side}>{w[side].calendarOccurrences} วัน ({w[side].recordedDays} วันที่มีรายการ)<br/>{cash(w[side].amount)} · เฉลี่ย {cash(w[side].averagePerCalendarOccurrence)}</td>)}</tr>)}</tbody></Table></details>
        <details><summary>เวลาที่ยืนยันและ coverage</summary><p>ใช้ Bangkok wall-clock ที่ผู้ใช้ยืนยัน ไม่ใช้ createdAt</p>{(['current','previous'] as const).map(side=><div key={side}><strong>{side==='current'?'ปัจจุบัน':'ก่อนหน้า'}</strong><p>ยืนยัน {data.facts.timeDistribution[side].confirmedCount} รายการ · ไม่ใช้เวลา {data.facts.timeDistribution[side].excludedCount} · coverage {data.facts.timeDistribution[side].coveragePercent}%</p>{data.facts.timeDistribution[side].reasonCodes.map(r=><p key={r}>{reasons[r]??r}</p>)}</div>)}<Table caption="เวลาที่ยืนยันในช่วงปัจจุบัน"><thead><tr><th>เวลา</th><th>จำนวน / สัดส่วน</th><th>ยอด / วันที่พบ</th></tr></thead><tbody>{time!.buckets.map(b=><tr key={b.bucket}><th>{String(b.startHour).padStart(2,'0')}:00–{String(b.endHourExclusive-1).padStart(2,'0')}:59</th><td>{b.transactionCount} / {percent(b.sharePercent)}</td><td>{cash(b.amount)} / {b.distinctDays} วัน</td></tr>)}</tbody></Table></details>

        <details><summary>สูตรและกฎปัจจุบัน</summary><p>ยอด/ค่าเฉลี่ยเป็น Decimal เกณฑ์หลักอย่างน้อย 30 รายการและระยะวันแรกถึงวันสุดท้ายรวมปลายช่วง 30 วัน; หมวดต้องมี 5 รายการใน 3 วันต่อช่วงจึงสรุปเปรียบเทียบ</p><p>เวลา: ยืนยัน 30 รายการ coverage80% bucket4ชั่วโมงมี50%ของรายการยืนยันกระจาย5วัน ยังไม่ใช่หลักประกันความแม่นยำ</p><p>รวมรายจ่ายที่ถูก Anomaly flag/review ขณะ Transaction ยังอยู่ ไม่รวมเงิน Goals หรือ Profile income และไม่สร้าง Forecast</p><p>Rule: {data.ruleVersion} · วันอ่านข้อมูล {data.asOfDate}</p></details>
      </section>}
      <p className="behavior-footer"><Link to="/overview">กลับภาพรวมรายเดือน</Link> · วิเคราะห์จากธุรกรรมที่บันทึก โดยไม่มี scheduler เบื้องหลัง</p>
    </div>
  </div>;
}
function Evidence({finding:f}:{finding:Finding}){
  const e=f.evidence as {current?:Metric;previous?:Metric;comparison?:Difference;shareIncreased?:boolean;coveragePercent?:string;confirmedCount?:number;bucket?:Metric;startDate?:string;endDate?:string;occurrenceCount?:number};
  if(e.current&&e.previous)return <>ยอด {cash(e.previous.amount)} → {cash(e.current.amount)} · จำนวน {e.previous.transactionCount} → {e.current.transactionCount} · เฉลี่ย {cash(e.previous.averagePerTransaction)} → {cash(e.current.averagePerTransaction)}{e.shareIncreased&&<> · สัดส่วน {percent(e.previous.sharePercent)} → {percent(e.current.sharePercent)}</>}</>;
  if(e.startDate&&e.endDate&&f.ruleId.startsWith('possible_recurrence_'))return <>{e.occurrenceCount} ครั้ง · ช่วงหลักฐาน {e.startDate}–{e.endDate} · พบล่าสุดในหลักฐานนี้ {e.endDate}</>;
  if(e.bucket)return <>{e.bucket.transactionCount} จาก {e.confirmedCount} รายการที่ยืนยันเวลา พบ {e.bucket.distinctDays} วัน · coverage {e.coveragePercent}%</>;
  return <>ดูหมวด ยอด และวันที่ใน “รูปแบบที่เกิดซ้ำ” ด้านล่าง</>;
}

function EvidenceTransactions({evidence}:{evidence:unknown}){
  const [shown,setShown]=useState(20);
  const e=evidence as {transactions?:EvidenceRow[];transactionCount?:number;startDate?:string;endDate?:string};
  const rows=e.transactions??[];
  return <details className="behavior-evidence-details"><summary>ดูรายการธุรกรรมที่ใช้เป็นหลักฐาน ({rows.length} รายการ)</summary>
    {e.startDate&&<p>ช่วง {e.startDate}–{e.endDate}{e.transactionCount!==undefined?' · '+e.transactionCount+' ครั้ง':''}</p>}
    <p>ข้อมูล ณ ตอนอ่านผลวิเคราะห์ เวลาแสดงเฉพาะที่ผู้ใช้ยืนยันแล้ว</p>
    {!rows.length?<p>ยังไม่มีรายละเอียดหลักฐานในผลที่โหลด กรุณาโหลดข้อมูลใหม่</p>:<Table caption="รายการหลักฐานจากข้อมูลย้อนหลัง"><thead><tr><th>รหัสรายการ</th><th>วันที่</th><th>เวลาที่ยืนยัน</th><th>ยอด</th></tr></thead><tbody>{rows.slice(0,shown).map(r=><tr key={r.id}><td style={{overflowWrap:'anywhere'}}>{r.id}</td><td>{r.date}</td><td>{r.time??'ไม่ยืนยัน/ไม่มีเวลา'}</td><td>{cash(r.amount)}</td></tr>)}</tbody></Table>}
    {shown<rows.length&&<button type="button" onClick={()=>setShown(n=>n+20)}>ดูรายการเพิ่มเติม</button>}
  </details>;
}
