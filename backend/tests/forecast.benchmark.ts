import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildForecast, categorySeries, shiftDay, type ForecastRow } from '../src/lib/expenseForecast';
import { D, sum, money, MODEL_VERSION, FORECAST_RULE } from '../src/lib/holt';

export const PROTOCOL = Object.freeze({ version: 'synthetic-walk-forward-v1', start: '2025-01-01', days: 280,
  seeds: [101, 211, 307, 401, 503], firstCutoffIndex: 179, step: 7, windows: 14,
  scenarios: ['constant', 'trend', 'weekly', 'intermittent', 'spikes', 'level-change', 'lifecycle', 'missing-records'],
  models: ['holt', 'seasonal-naive', 'mean-7'], developmentSeeds: [17],
});
export type Point = { account: string; scenario: string; cutoff: string; model: string; category: string;
  horizon: number; actual: string; prediction: string; error: string };
export function metrics(errors: string[]) {
  return { n: errors.length, mae: errors.length ? money(sum(errors.map(e=>new D(e).abs())).div(errors.length)) : null,
    rmse: errors.length ? money(sum(errors.map(e=>new D(e).pow(2))).div(errors.length).sqrt()) : null };
}
// Integer PRNG only for synthetic fixture construction; money is always integer cents/Decimal.
export function fixture(scenario: string, seed: number): ForecastRow[] {
  let state = seed >>> 0;
  const next = () => (state = (Math.imul(1664525,state)+1013904223) >>> 0);
  const rows: ForecastRow[] = [];
  for (let i=0;i<PROTOCOL.days;i++) {
    const noise = next()%2001-1000;
    let cents = 10000 + seed%100;
    if(scenario==='trend') cents += (seed%3===1 ? 1 : -1)*i*20;
    if(scenario==='weekly') cents += (i%7)*2500 + noise;
    if(scenario==='intermittent') { if(i%3!==0) continue; cents=30000+noise; }
    if(scenario==='spikes') cents += noise + (i%19===seed%19?80000:0);
    if(scenario==='level-change') cents += noise + (i>=210?15000:0);
    if(scenario==='missing-records') { if(next()%100<35) continue; cents+=noise; }
    rows.push({categoryId:'primary',date:shiftDay(PROTOCOL.start,i),amount:new D(cents).div(100).toFixed(2),count:1});
    if(scenario==='lifecycle') {
      if(i>=170 && i<220) rows.push({categoryId:'new-then-stopped',date:shiftDay(PROTOCOL.start,i),amount:'75.07',count:1});
      if(i>=230) rows.push({categoryId:'late',date:shiftDay(PROTOCOL.start,i),amount:'40.01',count:1});
    }
  }
  // Lifecycle account has no eligible primary from its third outer origin onward.
  return scenario==='lifecycle' ? rows.filter(r=>r.categoryId!=='primary'||r.date<=shiftDay(PROTOCOL.start,180)) : rows;
}
export function baseline(series: string[], model: string): string[] {
  assert.ok(series.length>=7);
  const recent=series.slice(-7);
  if(model==='seasonal-naive') return recent.map(v=>money(D.max(v,0)));
  assert.equal(model,'mean-7');
  return Array(7).fill(money(D.max(sum(recent).div(7),0)));
}
export function evaluateWindow(rows: ForecastRow[], cutoff: string, account: string, scenario: string) {
  // Deliberately exclude even today's actual: freeze the origin and prohibit all future input.
  const training=rows.filter(r=>r.date<=cutoff);
  const view=buildForecast({asOfDate:shiftDay(cutoff,1),rows:training,categories:[],budgetAmount:null});
  const eligible=view.categories.filter(c=>c.daily!==null);
  const points: Point[]=[];
  for(const model of PROTOCOL.models) {
    const predictions=new Map(eligible.map(c=>[c.categoryId,model==='holt'?c.daily!.map(d=>d.amount):
      baseline(categorySeries(training.filter(r=>r.categoryId===c.categoryId),cutoff).series,model)]));
    for(let h=1;h<=7;h++) {
      const day=shiftDay(cutoff,h), cats: Point[]=[];
      for(const c of eligible) {
        const actual=money(sum(rows.filter(r=>r.categoryId===c.categoryId&&r.date===day).map(r=>r.amount)));
        const prediction=predictions.get(c.categoryId)![h-1]!;
        cats.push({account,scenario,cutoff,model,category:c.categoryId,horizon:h,actual,prediction,error:money(new D(actual).minus(prediction))});
      }
      points.push(...cats);
      if(cats.length) {
        const actual=money(sum(cats.map(p=>p.actual))),prediction=money(sum(cats.map(p=>p.prediction)));
        if(model==='holt') assert.equal(prediction,view.summary.daily![h-1]!.amount);
        points.push({account,scenario,cutoff,model,category:'ALL',horizon:h,actual,prediction,error:money(new D(actual).minus(prediction))});
      }
    }
  }
  const actualAll=sum(rows.filter(r=>r.date>cutoff&&r.date<=shiftDay(cutoff,7)).map(r=>r.amount));
  const actualEligible=sum(rows.filter(r=>r.date>cutoff&&r.date<=shiftDay(cutoff,7)&&eligible.some(c=>c.categoryId===r.categoryId)).map(r=>r.amount));
  return {points, view, coverage:{account,scenario,cutoff,status:view.status,eligible:eligible.length,observed:view.categories.length,
    zeroFilledDays:eligible.reduce((n,c)=>n+c.training.zeroFilledDays,0),actualAll:money(actualAll),actualEligible:money(actualEligible),
    exclusions:view.categories.filter(c=>!c.daily).map(c=>({category:c.categoryId,reasons:c.reasonCodes}))}};
}

export function roundingAudit(points: Point[]) {
  const groups=new Map<string,Point[]>();
  for(const p of points.filter(p=>p.model!=='holt')) {
    const key=[p.account,p.cutoff,p.category].join('|');
    groups.set(key,[...(groups.get(key)??[]),p]);
  }
  const comparisons=[...groups].map(([key,rows])=>{
    const totals=PROTOCOL.models.slice(1).map(model=>{
      const own=rows.filter(p=>p.model===model);assert.equal(own.length,7);
      return {model,prediction:money(sum(own.map(p=>p.prediction))),error:money(sum(own.map(p=>p.error)))};
    });
    return {scope:key.endsWith('|ALL')?'aggregate':'category',delta:new D(totals[1]!.prediction).minus(totals[0]!.prediction),totals};
  });
  return {counts:['category','aggregate'].map(scope=>{
    const own=comparisons.filter(p=>p.scope===scope);
    return {scope,compared:own.length,equal:own.filter(p=>p.delta.isZero()).length,different:own.filter(p=>!p.delta.isZero()).length,
      maxAbsoluteDifference:money(own.reduce((m,p)=>D.max(m,p.delta.abs()),new D(0)))};
  }),scores:PROTOCOL.models.slice(1).map(model=>{
    const errors=comparisons.filter(p=>p.scope==='aggregate').map(p=>new D(p.totals.find(t=>t.model===model)!.error));
    return {model,mae:errors.length?sum(errors.map(e=>e.abs())).div(errors.length).toFixed(12):null,
      rmse:errors.length?sum(errors.map(e=>e.pow(2))).div(errors.length).sqrt().toFixed(12):null};
  })};
}

function table(headers:string[], rows:(string|number|null)[][]) {
  return ['| '+headers.join(' | ')+' |','| '+headers.map(()=> '---').join(' | ')+' |',...rows.map(r=>'| '+r.map(v=>v??'null').join(' | ')+' |')].join('\n');
}
export function runBenchmark(progress:(s:string)=>void=()=>{}) {
  const points:Point[]=[],coverage:ReturnType<typeof evaluateWindow>['coverage'][]=[];
  const fixtureHash=createHash('sha256');
  for(const scenario of PROTOCOL.scenarios) for(const seed of PROTOCOL.seeds) {
    const account=scenario+'-'+seed,rows=fixture(scenario,seed);fixtureHash.update(JSON.stringify({account,rows}));
    for(let w=0;w<PROTOCOL.windows;w++) {
      const cutoff=shiftDay(PROTOCOL.start,PROTOCOL.firstCutoffIndex+w*PROTOCOL.step);
      const result=evaluateWindow(rows,cutoff,account,scenario);points.push(...result.points);coverage.push(result.coverage);
    }
    progress(account);
  }
  return {points,coverage,fixtureHash:fixtureHash.digest('hex')};
}
export function renderReport(result:ReturnType<typeof runBenchmark>) {
  const {points,coverage}=result;
  const audit=roundingAudit(points);
  const daily=points.filter(p=>p.category==='ALL');
  const sevenDay=new Map<string,string[]>();
  for(const p of points) {const k=[p.account,p.cutoff,p.model,p.category].join('|');sevenDay.set(k,[...(sevenDay.get(k)??[]),p.error]);}
  const metricRow=(label:string,selected:Point[])=> {const m=metrics(selected.map(p=>p.error));return [label,m.n,m.mae,m.rmse];};
  const totals=PROTOCOL.models.map(model=>{const errors=[...sevenDay].filter(([k])=>k.endsWith('|'+model+'|ALL')).map(([,e])=>money(sum(e)));const m=metrics(errors);return [model,m.n,m.mae,m.rmse];});
  const sourceHash=createHash('sha256').update(readFileSync(resolve(__dirname,'../src/lib/holt.ts'))).update(readFileSync(resolve(__dirname,'../src/lib/expenseForecast.ts'))).digest('hex');
  const sections=[`# Forecast research benchmark - 28 September 2026 (Asia/Bangkok)

MAE/RMSE are research evaluation metrics, NOT a requirement for the application to display accuracy scores. No UI, API, model, threshold, dependency or migration changes are made by this benchmark.

## Reproduce

From backend: \`npx tsx tests/forecast.benchmark.ts --report\`.
Tests: \`npx tsx --test tests/forecast.benchmark.test.ts tests/forecast.backtest.test.ts tests/forecast.test.ts\`.
Pure in-memory synthetic data; no PrismaClient, database connection, environment loading, user data or application database. The imported production core uses Prisma.Decimal only.

Model: ${MODEL_VERSION}
Protocol: ${JSON.stringify(PROTOCOL)}
Production rule: ${JSON.stringify(FORECAST_RULE)}
Fixture SHA256: ${result.fixtureHash}
Core bytes SHA256 (holt.ts then expenseForecast.ts): ${sourceHash}
Point-result SHA256: ${createHash('sha256').update(JSON.stringify(points)).digest('hex')}

## Frozen protocol

40 synthetic account scenarios, 280 calendar days from 2025-01-01. Each has 14 outer origins, day indices 179,186,...,270 (0-based); test days cutoff+1 through cutoff+7. Maximum rolling training window is 180 days. Final two generated days are unused. Outer test blocks do not overlap, but training windows, horizons, categories and successive forecasts remain dependent: 560 windows and forecast-point counts are NOT independent sample sizes. No confidence intervals or real-user accuracy claims.

Constant, alternating rising/falling trend, weekly pattern, intermittent every third day, spikes, level change, new/stopped categories, and missing-record scenarios use integer PRNG/cents with the exact generator in tests/forecast.benchmark.ts. Final seeds 101/211/307/401/503 were fixed before scoring. Seed 17 is reserved for development/unit checks and excluded from reported results. These are engineering fixtures, not a representative population or a statistical sample-size justification.

Holt directly calls buildForecast. Eligibility uses only cutoff history: 42 calendar days inclusive of first recorded expense, at least 14 expense dates and a record in the latest seven complete days. Identical eligible categories for all models; never select by observed errors. For each origin, Holt tunes 121 alpha/beta pairs on inner cutoffs n-21,n-14,n-7, minimizing rounded/clipped MAE then MSE with ascending alpha/beta ties, then refits all training. Inner validation scores are NOT outer test scores. No outer-test tuning. Earlier outer outcomes may enter later training only after they are in the past.

Seasonal naive: forecast horizon h is training value T+h-7. Mean-7: every horizon is mean of last seven training days. No additional tuning. All methods use the same zero-filled series after first record, clamp predictions at zero, and round each category/day HALF_UP to cents before aggregation, exactly as displayed by production. No future zeros enter training. Missing records in training and actual scoring mean recorded expense zero, NOT proof of zero real spending. Missing-record fixtures evaluate recorded expenses only; latent unrecorded spending is not assessed.

Error = actual - prediction. MAE = sum(abs(error))/N; RMSE = sqrt(sum(error^2)/N). Money uses Decimal precision 40. Tables round final metrics to cents; RMSE is pooled from raw squared errors, never averaged from subgroup RMSE. Seven-day error is sum(actual seven days) - sum(prediction seven days), not mean daily absolute error. No MAPE division by zero.

Unavailable windows have no prediction and no error points (metrics null if N=0), never a predicted zero. Partial windows score only cutoff-eligible categories, including actual of that same set even if later activity changes. Actual coverage is retrospective and cannot feed eligibility/tuning. Full actual may include new categories not observed at cutoff.

## Daily aggregate errors (THB; eligible categories only)
`,table(['Model','Points','MAE','RMSE'],PROTOCOL.models.map(m=>metricRow(m,daily.filter(p=>p.model===m)))),
'## Seven-day aggregate total errors (THB)',table(['Model','Windows with forecast','MAE','RMSE'],totals),
'## Audit of seven-day baseline totals after category/day rounding',
'Let S_c be the sum of the last seven recorded daily values for category c (nonnegative cent amounts), and R be HALF_UP rounding to cents. Seasonal naive total = S_c. Mean-7 total = 7 * R(S_c / 7). Before rounding both equal S_c; after rounding the difference is 7 * R(S_c / 7) - S_c. It is zero exactly when the integer-cent sum is divisible by 7; otherwise it can be up to 0.03 THB per category. Aggregate differences are sums of these category differences. Equal displayed MAE/RMSE at two decimals do NOT imply identical forecasts or exact scores.',
table(['Scope','Compared origins','Identical rounded totals','Different rounded totals','Maximum absolute difference THB'],audit.counts.map(r=>[r.scope,r.compared,r.equal,r.different,r.maxAbsoluteDifference])),
table(['Model','Seven-day MAE (12 decimals)','Seven-day RMSE (12 decimals)'],audit.scores.map(r=>[r.model,r.mae,r.rmse])),
'## Daily aggregate errors by horizon (THB)',table(['Model / horizon','Points','MAE','RMSE'],PROTOCOL.models.flatMap(m=>Array.from({length:7},(_,i)=>metricRow(m+' / '+(i+1),daily.filter(p=>p.model===m&&p.horizon===i+1))))),
'## Daily aggregate errors by scenario (THB)',table(['Scenario / model','Points','MAE','RMSE'],PROTOCOL.scenarios.flatMap(s=>PROTOCOL.models.map(m=>metricRow(s+' / '+m,daily.filter(p=>p.scenario===s&&p.model===m))))),
'## Category daily errors by synthetic account (THB)',table(['Account / category / model','Points','MAE','RMSE'],[...new Set(points.filter(p=>p.category!=='ALL').map(p=>[p.account,p.category,p.model].join(' / ')))].map(k=>metricRow(k,points.filter(p=>[p.account,p.category,p.model].join(' / ')===k)))),
'## Category seven-day total errors (THB)',table(['Account / category / model','Windows','MAE','RMSE'],[...new Set(points.filter(p=>p.category!=='ALL').map(p=>[p.account,p.category,p.model].join(' / ')))].map(label=>{const [account,category,model]=label.split(' / ');const errors=[...sevenDay].filter(([k])=>k.startsWith(account+'|')&&k.endsWith('|'+model+'|'+category)).map(([,e])=>money(sum(e)));const m=metrics(errors);return [label,m.n,m.mae,m.rmse];})),
'## Category daily errors by horizon (pooled across accounts; THB)',table(['Category / model / horizon','Points','MAE','RMSE'],[...new Set(points.filter(p=>p.category!=='ALL').map(p=>[p.category,p.model,p.horizon].join(' / ')))].map(k=>metricRow(k,points.filter(p=>[p.category,p.model,p.horizon].join(' / ')===k)))),
'## Coverage (separate from errors)',table(['Scenario','Available / partial / unavailable','Eligible / observed category-origins','Zero-filled training days (repeated origins)','Eligible actual / all actual THB'],PROTOCOL.scenarios.map(s=>{const c=coverage.filter(c=>c.scenario===s);return [s,['available','partial','unavailable'].map(status=>c.filter(c=>c.status===status).length).join(' / '),c.reduce((n,c)=>n+c.eligible,0)+' / '+c.reduce((n,c)=>n+c.observed,0),c.reduce((n,c)=>n+c.zeroFilledDays,0),money(sum(c.map(c=>c.actualEligible)))+' / '+money(sum(c.map(c=>c.actualAll)))];})),
'## Per-origin coverage and exclusions (lifecycle scenario)',table(['Account / cutoff','Status','Eligible / observed','Excluded category: reasons'],coverage.filter(c=>c.scenario==='lifecycle').map(c=>[c.account+' / '+c.cutoff,c.status,c.eligible+' / '+c.observed,c.exclusions.map(e=>e.category+': '+e.reasons.join(', ')).join('; ')||'none'])),
`## Interpretation and limits

These deterministic synthetic comparisons are research/engineering evidence only. In this synthetic benchmark Mean-7 has lower pooled daily and seven-day aggregate MAE/RMSE than Holt (daily 47.76/96.63 versus 51.07/116.14; seven-day 167.62/307.34 versus 232.11/538.50 THB). This does not establish superiority on every scenario or real user data. Holt is NOT superior to the baselines in these pooled results. Seasonal naive performs best on the weekly-pattern scenario. Seasonal naive and mean-7 seven-day totals are algebraically equal before rounding, since both sum the last seven values; cent rounding can cause small differences. Different structures favor different baselines; pooled THB errors weight high-spend scenarios more heavily. Do not select categories, change production thresholds or claim Holt superiority based on this suite. Keep all scenarios including weak results. No new model-selection behavior was introduced in the app. This v1 benchmark has at most one eligible category per account/origin; therefore aggregate-error cancellation between simultaneous categories is not empirically evaluated here. The separate two-category regression verifies arithmetic conservation only. A future frozen benchmark should add simultaneous category structures before drawing conclusions about multi-category error cancellation.

The original forecast.backtest.test.ts remains a separate eight-window/three-scenario regression and future-counterfactual check, not added to this benchmark's sample counts. User browser acceptance on 26 September 2026 validates functionality, not forecast accuracy. This benchmark was executed by the AI against synthetic fixtures only. It does not assess actual user behavior, prospective accuracy, recording completeness, uncertainty intervals or real revision history. Frozen generated histories contain no edits/deletes; future authorized studies need versioned snapshots to avoid hindsight reconstruction.

Method checks cover benchmark formulas, equal eligibility, null unavailable output, future invariance, production rounded-total reconciliation and deterministic fixtures. No database or browser acceptance is needed for this isolated harness; no database/HTTP/browser tests were performed as part of this benchmark.
`];
  return sections.join('\n\n').trimEnd()+'\n';
}
if(process.argv.includes('--report')) {
  const result=runBenchmark(account=>console.log('Completed synthetic account:',account));
  writeFileSync(resolve(__dirname,'../../FORECAST_BACKTEST_REPORT.md'),renderReport(result),'utf8');
  console.log(JSON.stringify({model:MODEL_VERSION,windows:result.coverage.length,points:result.points.length,fixtureHash:result.fixtureHash}));
}
