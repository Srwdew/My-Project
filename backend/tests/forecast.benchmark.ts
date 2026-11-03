
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {buildForecast,totalSeries,shiftDay} from '../src/lib/expenseForecast';
import {D,sum,money,MODEL_VERSION,FORECAST_RULE,holtReference} from '../src/lib/holt';
import {fixtureInput,type Sample} from './forecast.fixture';
export const PROTOCOL=Object.freeze({version:'total-walk-forward-v2',start:'2025-01-01',days:280,
 seeds:[607,701,809],developmentSeeds:[17],firstCutoffIndex:29,step:14,windows:18,
 scenarios:['constant','trend','weekly','intermittent','spikes','level-change','lifecycle','missing-records'],
 models:['holt','theta','seasonal-naive','mean-7']});
export type Point={account:string;scenario:string;cutoff:string;model:string;parameterMode:string;horizon:number;actual:string;prediction:string;error:string};
export function metrics(errors:string[]){
 return {n:errors.length,mae:errors.length?money(sum(errors.map(e=>new D(e).abs())).div(errors.length)):null,
 rmse:errors.length?money(sum(errors.map(e=>new D(e).pow(2))).div(errors.length).sqrt()):null};
}
export function fixture(scenario:string,seed:number):Sample[]{
 let state=seed>>>0;const next=()=>state=(Math.imul(1664525,state)+1013904223)>>>0;const rows:Sample[]=[];
 for(let i=0;i<PROTOCOL.days;i++){
  const noise=next()%2001-1000;let cents=10000+seed%100;
  if(scenario==='trend')cents+=(seed%3===1?1:-1)*i*20;
  if(scenario==='weekly')cents+=(i%7)*2500+noise;
  if(scenario==='intermittent'){if(i%3!==0)continue;cents=30000+noise;}
  if(scenario==='spikes')cents+=noise+(i%19===seed%19?80000:0);
  if(scenario==='level-change')cents+=noise+(i>=150?15000:0);
  if(scenario==='missing-records'){if(next()%100<35)continue;cents+=noise;}
  if(scenario!=='lifecycle'||i<=180)rows.push({categoryId:'primary',date:shiftDay(PROTOCOL.start,i),amount:new D(cents).div(100).toFixed(2),count:1});
  // Simultaneous categories are actual fixture rows, never separate forecasting models.
  if(scenario==='lifecycle'&&i>=60&&i<220)rows.push({categoryId:'new',date:shiftDay(PROTOCOL.start,i),amount:'75.07',count:1});
  if(scenario==='lifecycle'&&i>=230)rows.push({categoryId:'late',date:shiftDay(PROTOCOL.start,i),amount:'40.01',count:1});
 }
 return rows;
}
export function baseline(series:string[],model:string):string[]{
 assert(series.length>=7);const recent=series.slice(-7);
 if(model==='seasonal-naive')return recent.map(v=>money(D.max(v,0)));
 assert.equal(model,'mean-7');return Array(7).fill(money(D.max(sum(recent).div(7),0)));
}
export function evaluateWindow(rows:Sample[],cutoff:string,account:string,scenario:string){
 const input=fixtureInput(rows.filter(r=>r.date<=cutoff),shiftDay(cutoff,1));
 // Production moved to Theta; this synthetic benchmark documents Holt, so 'holt' is the retired Holt reference, gated by buildForecast.
 const view=buildForecast(input),points:Point[]=[];let holtMode:string|null=null;
 if(view.summary.daily){
  const series=totalSeries(input.rows,cutoff,input.history.firstDate).series,ref=holtReference(series);holtMode=ref.mode;
  for(const model of PROTOCOL.models){
   // 'theta' is production buildForecast output itself (D-10 recompute, after 730fd82), not a second implementation.
   const forecasts=model==='holt'?ref.amounts:model==='theta'?view.summary.daily.map(d=>d.amount):baseline(series,model);
   for(let h=1;h<=7;h++){
    const actual=money(sum(rows.filter(r=>r.date===shiftDay(cutoff,h)).map(r=>r.amount))),prediction=forecasts[h-1]!;
    points.push({account,scenario,cutoff,model,parameterMode:ref.mode,horizon:h,actual,prediction,error:money(new D(actual).minus(prediction))});
   }
  }
 }
 return {view,points,coverage:{account,scenario,cutoff,status:view.status,parameterMode:holtMode,transactionCount:view.readiness.transactionCount,
 observedSpanDays:view.readiness.observedSpanDays,zeroFilledDays:view.training.zeroFilledDays,reasons:view.reasonCodes}};
}
export function runBenchmark(progress:(s:string)=>void=()=>{}){
 const points:Point[]=[],coverage:ReturnType<typeof evaluateWindow>['coverage'][]=[];const digest=createHash('sha256');
 for(const scenario of PROTOCOL.scenarios)for(const seed of PROTOCOL.seeds){
  const account=scenario+'-'+seed,rows=fixture(scenario,seed);digest.update(JSON.stringify({account,rows}));
  for(let w=0;w<PROTOCOL.windows;w++){
   const r=evaluateWindow(rows,shiftDay(PROTOCOL.start,PROTOCOL.firstCutoffIndex+w*PROTOCOL.step),account,scenario);
   points.push(...r.points);coverage.push(r.coverage);
  }progress(account);
 }
 return {points,coverage,fixtureHash:digest.digest('hex')};
}
const table=(headers:string[],rows:(string|number|null)[][])=>['| '+headers.join(' | ')+' |','| '+headers.map(()=>'---').join(' | ')+' |',...rows.map(r=>'| '+r.map(v=>v??'null').join(' | ')+' |')].join('\n');
export function renderReport(r:ReturnType<typeof runBenchmark>){
 const weekly=(points:Point[])=>{const groups=new Map<string,string[]>();for(const p of points){const key=p.account+'|'+p.cutoff+'|'+p.model;groups.set(key,[...(groups.get(key)??[]),p.error]);}return [...groups.values()].map(e=>{assert.equal(e.length,7);return money(sum(e));});};
 const scores=(points:Point[])=>{const m=metrics(points.map(p=>p.error)),w=metrics(weekly(points));return [m.n,m.mae,m.rmse,w.n,w.mae,w.rmse];};
 const coreHash=createHash('sha256').update(readFileSync(resolve(__dirname,'../src/lib/holt.ts'))).update(readFileSync(resolve(__dirname,'../src/lib/expenseForecast.ts'))).digest('hex');
 return [
 '# Forecast TOTAL model synthetic benchmark',
 'This report belongs only to '+MODEL_VERSION+'. The category-v1 results remain in FORECAST_BACKTEST_REPORT.md and are not evidence for this model.',
 'Synthetic engineering evidence only. No user data, database, or application connection. MAE/RMSE are research metrics, not UI accuracy scores.',
 'Protocol: '+JSON.stringify(PROTOCOL),'Rule: '+JSON.stringify(FORECAST_RULE),'Fixture SHA256: '+r.fixtureHash,'Core SHA256: '+coreHash,
 'Point SHA256: '+createHash('sha256').update(JSON.stringify(r.points)).digest('hex'),
 '## Frozen methodology',
 'Fixed alpha=0.2, beta*=0.1 are engineering defaults frozen before this benchmark, not optimized using its outcomes or claimed optimal. At 42 training days use the existing 121-pair grid with inner cuts n-21,n-14,n-7 (earliest training 21 days), rounded/clipped MAE then MSE then ascending alpha/beta ties. Fit again through cutoff. Shorter ready histories use defaults without personal validation scores.',
 'Readiness is lifetime expense count >=30 and inclusive first-to-last observed span >=30, evaluated using cutoff data only. PostgreSQL production groups all categories per date; the in-memory harness performs equivalent Decimal aggregation. Maximum training window 180 days; no future data/zeros. All models use the same account-origin readiness and score all actual expenses, including newly appearing categories.',
 'Outer origins start at day index29, step14, 18 origins per account; test horizons1-7 never tune that origin. Later training may contain earlier outcomes only once past. Seeds607/701/809 were frozen before running this total benchmark; development seed17 is excluded. Model policies were not changed from these scores.',
 'MAE=mean(abs(actual-prediction)); RMSE=sqrt(mean(error^2)); weekly error=sum(actual)-sum(prediction). Daily forecasts clip at0 and HALF_UP cents before summation. No MAPE. Unavailable origins have null forecasts and no error points, not zero errors.',
 '## Pooled errors (THB)',
 table(['Model','Daily points','MAE','RMSE','7-day origins','7-day MAE','7-day RMSE'],PROTOCOL.models.map(m=>[m,...scores(r.points.filter(p=>p.model===m))])),
 "In this frozen synthetic run Mean-7 has lower pooled daily MAE/RMSE and seven-day MAE/RMSE than Holt; Holt is not superior to the baselines. Seasonal naive and Mean-7 have the same displayed seven-day scores here, not necessarily identical rounded predictions: before rounding both sum to S=sum(last7); after daily rounding Mean-7 sums to 7*round(S/7,2), while Seasonal naive sums the seven observed cents. Their totals may differ by up to0.03 THB, as the regression fixture S=0.08 (0.08 versus0.07) demonstrates. Displayed score equality is not proof of pointwise equality.",
 '## Horizon errors (THB)',
 table(['Model','Horizon','Points','MAE','RMSE'],PROTOCOL.models.flatMap(m=>Array.from({length:7},(_,i)=>{const x=metrics(r.points.filter(p=>p.model===m&&p.horizon===i+1).map(p=>p.error));return [m,i+1,x.n,x.mae,x.rmse];}))),
 '## Parameter-mode errors (including baselines on identical origins)',
 table(['Mode','Model','Daily points','MAE','RMSE','7-day origins','7-day MAE','7-day RMSE'],['fixed_default','inner_validation'].flatMap(mode=>PROTOCOL.models.map(m=>[mode,m,...scores(r.points.filter(p=>p.model===m&&p.parameterMode===mode))]))),
 '## Scenario errors',
 table(['Scenario','Model','Daily points','MAE','RMSE','7-day origins','7-day MAE','7-day RMSE'],PROTOCOL.scenarios.flatMap(s=>PROTOCOL.models.map(m=>[s,m,...scores(r.points.filter(p=>p.scenario===s&&p.model===m))]))),
 '## Coverage separate from error',
 table(['Scenario','Available','Unavailable','Fixed','Tuned'],PROTOCOL.scenarios.map(s=>{const c=r.coverage.filter(c=>c.scenario===s);return [s,c.filter(c=>c.status==='available').length,c.filter(c=>c.status==='unavailable').length,c.filter(c=>c.parameterMode==='fixed_default').length,c.filter(c=>c.parameterMode==='inner_validation').length];})),
 '## Limits',
 'Windows/training histories/forecast points are dependent, not independent sample sizes. No real-user accuracy or statistical significance claim. Zero-filled missing records score recorded spending, not latent unrecorded spending. No revision-history reconstruction or prospective evaluation. Only a few fixed-mode origins exist; no reliable personal accuracy claim from30 days. No policy/model changes based on outer scores. Baselines can outperform Holt; report all scenarios.',
 'Reproduce from backend: node --import tsx tests/forecast.benchmark.ts --report. Report is written only with --report.'
 ].join('\n\n')+'\n';
}
if(require.main===module){const started=performance.now();const r=runBenchmark(s=>console.log('BENCHMARK '+s));const report=renderReport(r);if(process.argv.includes('--report'))writeFileSync(resolve(__dirname,'../../FORECAST_TOTAL_BACKTEST_REPORT.md'),report);console.log('TOTAL_BENCHMARK '+JSON.stringify({modelVersion:MODEL_VERSION,origins:r.coverage.length,points:r.points.length,elapsedMs:Math.round(performance.now()-started)}));}
