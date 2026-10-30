// C3 research harness: Holt trained with vs without amount-anomaly rows. Synthetic only, no database.
import {createHash} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildForecast,shiftDay} from '../src/lib/expenseForecast';
import {D,sum,money,MODEL_VERSION} from '../src/lib/holt';
import {ANOMALY_RULE,screenExpense,amountReady,globalGate,type Baseline} from '../src/lib/anomalyRules';
import {fixtureInput,type Sample} from './forecast.fixture';
import {fixture,PROTOCOL} from './forecast.benchmark';

const days=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
type Dec=InstanceType<typeof D>;
const median=(a:Dec[])=>a.length?(a.length%2?a[a.length>>1]!:a[a.length/2-1]!.plus(a[a.length/2]!).div(2)):null;
// In-memory mirror of anomalyBaseline's amount part (prior dates only, 180-day window); synthetic rows carry no time or user decisions.
export function amountBaseline(prior:Sample[]):Baseline{
 const a=prior.map(r=>new D(r.amount)).sort((x,y)=>x.comparedTo(y)),n=a.length,m=median(a),ds=prior.map(r=>r.date).sort();
 return {n,days:new Set(ds).size,span:n?days(ds[0]!,ds.at(-1)!):0,median:m?.toString()??null,
  mad:m?median(a.map(x=>x.minus(m).abs()).sort((x,y)=>x.comparedTo(y)))!.toString():null,
  q1:median(a.slice(0,n>>1))?.toString()??null,q3:median(a.slice((n+1)>>1))?.toString()??null,
  min:n?a[0]!.toString():null,max:n?a[n-1]!.toString():null,timeN:0,timeDays:0,timeSpan:0,bucketCount:0,nearbyCount:0};
}
/** Indexes of rows the locked amount screen would flag, each judged only on earlier dates (same order as evaluatePending). */
export function flagAnomalies(rows:Sample[]){
 const flagged=new Set<number>();
 rows.forEach((r,i)=>{
  const before=rows.filter(o=>o.date<r.date);
  if(!globalGate(before.length,before.length?days(before[0]!.date,before.at(-1)!.date)+1:0))return;
  // Like anomaly_dimension_exclusion: earlier flagged rows nobody reviewed leave the baseline; the global gate still counts them.
  const window=rows.filter((o,j)=>o.date<r.date&&!flagged.has(j)&&o.date>=shiftDay(r.date,-ANOMALY_RULE.windowDays));
  const cat=amountBaseline(window.filter(o=>o.categoryId===r.categoryId));
  const b=amountReady(cat)?cat:amountBaseline(window);
  if(screenExpense(r.amount,false,b).amount.status==='flagged')flagged.add(i);
 });
 return flagged;
}
type Point={scenario:string;variant:string;horizon:number;actual:string;error:string};
export function run(){
 const points:Point[]=[];let flaggedRows=0,totalRows=0;const perScenario=new Map<string,number>();
 for(const scenario of PROTOCOL.scenarios)for(const seed of PROTOCOL.seeds){
  const rows=fixture(scenario,seed),flags=flagAnomalies(rows),clean=rows.filter((_,i)=>!flags.has(i));
  flaggedRows+=flags.size;totalRows+=rows.length;perScenario.set(scenario,(perScenario.get(scenario)??0)+flags.size);
  for(let w=0;w<PROTOCOL.windows;w++){
   const cutoff=shiftDay(PROTOCOL.start,PROTOCOL.firstCutoffIndex+w*PROTOCOL.step),asOf=shiftDay(cutoff,1);
   const all=fixtureInput(rows.filter(r=>r.date<=cutoff),asOf);
   // Readiness stays on every recorded expense; only the training series drops flagged rows.
   const variants={included:all,excluded:{...all,rows:fixtureInput(clean.filter(r=>r.date<=cutoff),asOf).rows}};
   for(const [variant,input] of Object.entries(variants)){
    const view=buildForecast(input);if(!view.summary.daily)continue;
    for(let h=1;h<=7;h++){
     // Actuals always include anomalies: the user still spent that money.
     const actual=money(sum(rows.filter(r=>r.date===shiftDay(cutoff,h)).map(r=>r.amount)));
     points.push({scenario,variant,horizon:h,actual,error:money(new D(actual).minus(view.summary.daily[h-1]!.amount))});
    }
   }
  }
 }
 return {points,flaggedRows,totalRows,perScenario};
}
export function score(p:Point[]){
 const pos=p.filter(x=>new D(x.actual).gt(0));
 return {n:p.length,mae:p.length?money(sum(p.map(x=>new D(x.error).abs())).div(p.length)):null,
  rmse:p.length?money(sum(p.map(x=>new D(x.error).pow(2))).div(p.length).sqrt()):null,
  mapeN:pos.length,mape:pos.length?sum(pos.map(x=>new D(x.error).abs().div(x.actual))).div(pos.length).mul(100).toFixed(1):null};
}
if(require.main===module){
 const r=run(),row=(label:string,p:Point[])=>{const a=score(p.filter(x=>x.variant==='included')),b=score(p.filter(x=>x.variant==='excluded'));return `| ${label} | ${a.n} | ${a.mae} | ${b.mae} | ${a.rmse} | ${b.rmse} | ${a.mape}% | ${b.mape}% | ${a.mapeN} |`;};
 const head='| ขอบเขต | จุด | MAE (ก) | MAE (ข) | RMSE (ก) | RMSE (ข) | MAPE (ก) | MAPE (ข) | จุดที่ใช้คิด MAPE |\n|---|---|---|---|---|---|---|---|---|';
 const report=['# Forecast: รวม vs คัดรายการผิดปกติออกจาก Holt (synthetic backtest)',
  '> **ข้อจำกัดสำคัญ:** backtest ทั้งหมดใช้ข้อมูลสังเคราะห์ที่สร้างขึ้นเอง ยังไม่ใช่ dataset ที่อ้างอิงได้ จึงยังไม่ตอบข้อกำหนดเรื่อง dataset อ้างอิง ตัวเลขใช้ได้แค่เทียบสองวิธีบนสถานการณ์ที่จำลองไว้ ไม่ได้บอกความแม่นยำกับผู้ใช้จริง และไม่ได้อ้างนัยสำคัญทางสถิติ',
 'สร้างจาก `node --import tsx tests/forecast.anomalyExclusion.ts --report` ใน backend ข้อมูลสังเคราะห์ล้วน ไม่ใช้ฐานข้อมูลหรือข้อมูลผู้ใช้ '+MODEL_VERSION+' protocol เดียวกับ FORECAST_TOTAL_BACKTEST_REPORT.md',
  '(ก) = ฝึกด้วยรายจ่ายทั้งหมด (พฤติกรรมปัจจุบัน) · (ข) = ตัดแถวที่ amount screen ของ ANOMALY_RULE (ค่าล็อก ไม่แก้) flag ออกก่อนฝึก · actual ทุกจุดรวมรายการผิดปกติเสมอ · MAPE คิดเฉพาะวันที่ actual > 0',
  'ไฟล์นี้สร้างใหม่ทั้งไฟล์ทุกครั้งที่รัน --report ส่วนอ่านผลอยู่ใน docs/FINANCIAL_PROFILE_DESIGN.md ข้อ 4.2 · baseline ตัดแถวที่ flag แล้วยังไม่มีคนตัดสินออก ตาม anomaly_dimension_exclusion · fixture มีรายการเดียวต่อวัน การตัด spike จึงตัดทั้งวัน ผล (ข) ของ spikes จึงเป็นค่าระมัดระวัง',
  `แถวที่ถูก flag: ${r.flaggedRows} จาก ${r.totalRows} (${[...r.perScenario].map(([s,n])=>s+'='+n).join(', ')})`,
  'Points SHA256: '+createHash('sha256').update(JSON.stringify(r.points)).digest('hex'),
  head,row('รวมทุก scenario',r.points),...PROTOCOL.scenarios.map(s=>row(s,r.points.filter(p=>p.scenario===s)))].join('\n\n')+'\n';
 if(process.argv.includes('--report'))writeFileSync(resolve(__dirname,'../../docs/FORECAST_ANOMALY_EXCLUSION_BACKTEST.md'),report);
 console.log(report);
}
