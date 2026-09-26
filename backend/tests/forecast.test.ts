import test from 'node:test';
import assert from 'node:assert/strict';
import { D, MODEL_VERSION, initialize, holt, fitHolt, sum } from '../src/lib/holt';
import { buildForecast, categorySeries, shiftDay, type ForecastRow } from '../src/lib/expenseForecast';
const history=(n=42,cat='a',end='2026-09-27',value='100.00'):ForecastRow[]=>Array.from({length:n},(_,i)=>({categoryId:cat,date:shiftDay(end,i-n+1),amount:value,count:1}));
test('Holt OLS initialization and exact linear trend, clipping only output',()=>{
 const values=Array.from({length:42},(_,i)=>String((i+1)*10));const initial=initialize(values);
 assert.equal(initial.level.toString(),'70');assert.equal(initial.trend.toString(),'10');
 assert.deepEqual(holt(values,'0.4','0.2').amounts,['430.00','440.00','450.00','460.00','470.00','480.00','490.00']);
 const decline=Array.from({length:42},(_,i)=>String(42-i));assert.equal(holt(decline,'0.5','0.5').clampedDays,6);
 assert.deepEqual(holt(decline,'0.5','0.5').amounts,Array(7).fill('0.00'));
});
test('deterministic grid ties, Decimal cents, version and forbidden short tuning',()=>{
 const fit=fitHolt(Array(42).fill('0.08'));assert.equal(fit.alpha,'0.0');assert.equal(fit.betaStar,'0.0');
 assert.deepEqual(fit.amounts,Array(7).fill('0.08'));assert.deepEqual(fit,fitHolt(Array(42).fill('0.08')));
 assert.match(MODEL_VERSION,/holt-category-v1-/);assert.throws(()=>fitHolt(Array(41).fill('1')));
});
test('category minima, no future zero, missing zero carries explicit metadata',()=>{
 assert.ok(categorySeries(history(41),'2026-09-27').reasons.includes('insufficient_calendar_history'));
 const sparse=history().filter((_,i)=>i===0||i>=30);assert.equal(sparse.length,13);
 assert.ok(categorySeries(sparse,'2026-09-27').reasons.includes('insufficient_expense_days'));
 const enough=history().filter((_,i)=>i===0||i>=29);const s=categorySeries(enough,'2026-09-27');assert.deepEqual(s.reasons,[]);assert.equal(s.training.zeroFilledDays,28);
 assert.ok(categorySeries(history(42,'a','2026-09-19'),'2026-09-27').reasons.includes('no_recent_expense_records'));
 assert.equal(categorySeries([...history(),{categoryId:'a',date:'2026-09-28',amount:'9999',count:1}],'2026-09-27').series.length,42);
});
test('partial conservation and same-category previous period, unavailable never zero',()=>{
 const input={asOfDate:'2026-09-28',rows:[...history(),...history(5,'b')],categories:[{id:'a',name:'A'},{id:'b',name:'B'}],budgetAmount:null};
 const v=buildForecast(input);assert.equal(v.status,'partial');assert.equal(v.summary.sevenDayForecastTotal,'700.00');
 assert.equal(v.summary.previousSevenDayActualAllCategories,'1200.00');assert.equal(v.summary.previousSevenDayActualComparableCategories,'700.00');
 assert.equal(v.summary.comparablePeriodDifference,'0.00');assert.equal(v.categories[1]!.daily,null);
 assert.equal(sum(v.summary.daily!.map(r=>r.amount)).toFixed(2),v.summary.sevenDayForecastTotal);
 const none=buildForecast({...input,rows:history(5)});assert.equal(none.status,'unavailable');assert.equal(none.summary.sevenDayForecastTotal,null);assert.equal(none.summary.daily,null);
 assert.equal(buildForecast({...input,rows:[]}).status,'unavailable');
});
test('month boundary keeps seven days, subtracts today per category and handles budget states',()=>{
 const rows=[...history(),...history(42,'b'),{categoryId:'a',date:'2026-09-28',amount:'500',count:1}];
 const base={asOfDate:'2026-09-28',rows,categories:[],budgetAmount:'10000'};
 const v=buildForecast(base);assert.equal(v.forecastEndDate,'2026-10-04');assert.equal(v.budgetComparison!.comparedDays,3);
 assert.equal(v.budgetComparison!.predictedAdditionalExpense,'500.00'); // A 0+200, B 100+200, not max(combined-today,0)
 assert.equal(v.budgetComparison!.actualMonthExpenseToNow,'5900.00');assert.equal(v.budgetComparison!.suggestedAdditionalDailyAmount,'1366.66');
 assert.equal(buildForecast({...base,budgetAmount:'1'}).budgetComparison!.status,'already_over_budget');
 assert.equal(buildForecast({...base,budgetAmount:'5900'}).budgetComparison!.status,'budget_exhausted');
 assert.equal(buildForecast({...base,budgetAmount:null}).budgetComparison,null);
 assert.equal(buildForecast({...base,rows:[...history(),...history(5,'b')],budgetAmount:'100000'}).budgetComparison!.status,'partial_cannot_conclude');
});
test('leap/year dates and 180-day bound',()=>{
 assert.equal(shiftDay('2024-02-28',1),'2024-02-29');assert.equal(shiftDay('2025-02-28',1),'2025-03-01');
 assert.equal(shiftDay('2026-12-31',1),'2027-01-01');
 assert.equal(categorySeries(history(220),'2026-09-27').training.calendarDays,180);
 const v=buildForecast({asOfDate:'2024-02-29',rows:history(42,'a','2024-02-28'),categories:[],budgetAmount:'5000'});
 assert.equal(v.budgetComparison!.comparedDays,1);assert.equal(v.forecastEndDate,'2024-03-06');
});
test('rounded category sums are conserved without binary floating accumulation',()=>{
 const v=buildForecast({asOfDate:'2026-09-28',rows:[...history(42,'a','2026-09-27','0.07'),...history(42,'b','2026-09-27','0.01')],categories:[],budgetAmount:null});
 assert.equal(v.summary.sevenDayForecastTotal,'0.56');assert(v.summary.daily!.every(r=>r.amount==='0.08'));
 assert.equal(sum(v.categories.map(c=>c.sevenDayTotal!)).toFixed(2),'0.56');
 assert.equal(new D(v.summary.sevenDayForecastTotal!).isFinite(),true);
});

test('partial actual chart distinguishes records only in an unavailable category',()=>{
 const rows=history().filter((_,i)=>i%3===0);
 rows.push({categoryId:'b',date:'2026-09-27',amount:'1.00',count:1});
 const v=buildForecast({asOfDate:'2026-09-28',rows,categories:[],budgetAmount:null});
 assert.equal(v.status,'partial');
 const last=v.previousPeriod.daily[6]!;
 assert.equal(last.hasExpenseRecords,true);assert.equal(last.hasComparableExpenseRecords,false);assert.equal(last.comparableAmount,'0.00');
});
