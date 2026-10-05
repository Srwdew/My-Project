import test from 'node:test';
import assert from 'node:assert/strict';
import { D,MODEL_VERSION,initialize,holt,fitHolt,sum } from '../src/lib/holt';
import { buildForecast,totalSeries,shiftDay } from '../src/lib/expenseForecast';
import {fixtureInput,history} from './forecast.fixture';
test('Holt OLS, linear trend, output clipping and deterministic tuning',()=>{
 const values=Array.from({length:42},(_,i)=>String((i+1)*10));
 assert.equal(initialize(values).level.toString(),'70');
 assert.deepEqual(holt(values,'0.4','0.2').amounts,['430.00','440.00','450.00','460.00','470.00','480.00','490.00']);
 assert.deepEqual(holt(Array.from({length:42},(_,i)=>String(42-i)),'0.5','0.5').amounts,Array(7).fill('0.00'));
 assert.deepEqual(fitHolt(Array(42).fill('0.08')),fitHolt(Array(42).fill('0.08')));
 assert.throws(()=>fitHolt(Array(41).fill('1')));assert.match(MODEL_VERSION,/holt-total-v2-/);
});
test('29/30 transactions x 29/30 inclusive observed days; last expense not cutoff',async t=>{
 for(const count of [29,30])for(const span of [29,30])await t.test(count+'/'+span,()=>{
  const rows=[{date:'2026-08-01',amount:'1.00',count:count-1},{date:shiftDay('2026-08-01',span-1),amount:'1.00',count:1}];
  const v=buildForecast(fixtureInput(rows,'2026-09-01'));
  assert.equal(v.readiness.ready,count===30&&span===30);
  assert.equal(v.readiness.observedSpanDays,span);assert.equal(v.readiness.transactionCount,count);
  assert.equal(v.summary.daily===null,!v.readiness.ready);assert.equal(v.summary.sevenDayForecastTotal===null,!v.readiness.ready);
 });
});
test('today/future never unlock readiness or change fit; current actual is separate',()=>{
 const past=history(29),today={date:'2026-09-28',amount:'999.00',count:100};
 const a=buildForecast(fixtureInput(past,'2026-09-28')),b=buildForecast(fixtureInput([...past,today,{...today,date:'2026-10-01'}],'2026-09-28'));
 assert.deepEqual(a.readiness,b.readiness);assert.equal(b.status,'unavailable');
 assert.equal(b.recordedExpenseToday,'999.00');
});
test('fixed 30/41 and tuned 42 days; sparse/stale warnings, lifetime history outside training window',()=>{
 for(const n of [30,41,42]){
  const v=buildForecast(fixtureInput(history(n),'2026-09-28'));
  assert.equal(v.parameterMode,n<42?'fixed_default':'inner_validation');
  assert.equal(v.summary.sevenDayForecastTotal,'700.00');
  if(n<42){assert.equal(v.parameters!.alpha,'0.2');assert.equal(v.parameters!.betaStar,'0.1');assert.equal(v.parameters!.validationMAE,null);}
 }
 const sparse=buildForecast(fixtureInput([{date:'2026-08-01',amount:'100',count:29},{date:'2026-08-30',amount:'1',count:1}],'2026-09-28'));
 assert.equal(sparse.status,'available');assert(sparse.warningCodes.includes('long_recording_gap'));assert(sparse.warningCodes.includes('stale_expense_history'));
 const old=buildForecast(fixtureInput(history(30,'2020-01-30'),'2026-09-28'));
 assert.equal(old.training.calendarDays,180);assert.equal(old.training.zeroFilledDays,180);assert.equal(old.status,'available');
 assert.equal(old.readiness.lastExpenseDate,'2020-01-30');
});
test('aggregate before Holt; category relabel/new sparse category cannot cause partial or leaks',()=>{
 const rows=history().flatMap(r=>[{...r,categoryId:'a',amount:'0.07'},{...r,categoryId:'b',amount:'0.01'}]);
 const a=buildForecast(fixtureInput(rows,'2026-09-28'));
 const b=buildForecast(fixtureInput(rows.map((r,i)=>({...r,categoryId:'new-'+i})),'2026-09-28'));
 assert.deepEqual(a,b);assert.equal(a.status,'available');
 assert.equal(a.summary.sevenDayForecastTotal,'0.56');assert(a.summary.daily!.every(d=>d.amount==='0.08'));
 assert.equal(sum(a.summary.daily!.map(d=>d.amount)).toFixed(2),a.summary.sevenDayForecastTotal);
 for(const key of ['categories','coverage'])assert(!Object.hasOwn(a,key));
 assert.equal(a.aggregation,'daily_expense_total_before_holt');
 assert.deepEqual(a.summary.daily!.map(d=>d.amount),holt(Array(30).fill('0.08'),'0.2','0.1').amounts);
 assert.equal(new D(a.summary.sevenDayForecastTotal!).isFinite(),true);
});
test('budget uses TOTAL today residual, no budget/exhausted/over, cross month and leap year',()=>{
 const rows=[...history().map(r=>({...r,amount:'200.00'})),{date:'2026-09-28',amount:'500.00',count:1}];
 const v=buildForecast(fixtureInput(rows,'2026-09-28','10000'));
 assert.equal(v.forecastStartDate,'2026-09-28');assert.equal(v.forecastEndDate,'2026-10-04');
 assert.equal(v.budgetComparison!.comparedDays,3);assert.equal(v.budgetComparison!.predictedAdditionalExpense,'400.00');
 assert.equal(v.budgetComparison!.actualMonthExpenseToNow,'5900.00');
 assert.equal(v.budgetComparison!.suggestedAdditionalDailyAmount,'1366.66');
 assert.equal(buildForecast(fixtureInput(rows,'2026-09-28')).budgetComparison,null);
 assert.equal(buildForecast(fixtureInput(rows,'2026-09-28','5900')).budgetComparison!.status,'budget_exhausted');
 assert.equal(buildForecast(fixtureInput(rows,'2026-09-28','1')).budgetComparison!.status,'already_over_budget');
 const leap=buildForecast(fixtureInput(history(30,'2024-02-28'),'2024-02-29','9999'));
 assert.equal(leap.forecastEndDate,'2024-03-06');assert.equal(leap.budgetComparison!.comparedDays,1);
 assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
});
test('empty null output and historical zeros are labelled, never future training zeros',()=>{
 const empty=buildForecast(fixtureInput([],'2026-09-28'));
 assert.equal(empty.summary.daily,null);assert.equal(empty.parameters,null);assert.equal(empty.parameterMode,null);
 const rows=history();rows.splice(5,1);
 const s=totalSeries([...rows,{date:'2026-09-29',amount:'1000',count:1}],'2026-09-27',rows[0]!.date);
 assert.equal(s.series.length,30);assert.equal(s.series[5],'0.00');assert.equal(s.training.zeroFilledDays,1);
});

test('budget total actual today below/equal/above forecast and exact reference statuses',()=>{
 const base=history();
 const make=(actual:string,budget:string)=>buildForecast(fixtureInput([...base,{date:'2026-09-28',amount:actual,count:1}],'2026-09-28',budget));
 for(const [actual,extra] of [['20','280.00'],['100','200.00'],['150','200.00']]){
  assert.equal(make(actual!,'9999').budgetComparison!.predictedAdditionalExpense,extra);
 }
 // September historical expense 2700, actual today20; remaining3 days, reference=remaining.
 assert.equal(make('20','3000').budgetComparison!.status,'at_reference');
 assert.equal(make('20','2999').budgetComparison!.status,'above_reference');
 assert.equal(make('20','3001').budgetComparison!.status,'below_reference');
 const unavailable=buildForecast(fixtureInput([],'2026-09-28','100'));
 assert.equal(unavailable.budgetComparison!.status,'forecast_unavailable');
 assert.equal(unavailable.budgetComparison!.predictedAdditionalExpense,null);
});
