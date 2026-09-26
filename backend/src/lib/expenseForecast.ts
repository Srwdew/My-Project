import { Prisma } from '@prisma/client';
import { D, FORECAST_RULE, MODEL_VERSION, fitHolt, money, sum } from './holt';

export const shiftDay = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10);
};
const daysBetween = (start: string, end: string) => Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
export type ForecastRow = { categoryId: string; date: string; amount: string; count: number };
export type ForecastInput = { asOfDate: string; rows: ForecastRow[]; categories: { id: string; name: string }[]; budgetAmount: string | null };
export function categorySeries(rows: ForecastRow[], cutoff: string) {
  const start = shiftDay(cutoff, 1 - FORECAST_RULE.windowDays);
  const history = rows.filter(r => r.date >= start && r.date <= cutoff && r.count > 0).sort((a,b) => a.date.localeCompare(b.date));
  const first = history[0]?.date;
  const n = first ? daysBetween(first, cutoff) + 1 : 0;
  const byDate = new Map(history.map(r => [r.date, r]));
  const reasons: string[] = [];
  if (!first) reasons.push('no_expense_history_before_cutoff');
  else {
    if (n < FORECAST_RULE.minDays) reasons.push('insufficient_calendar_history');
    if (history.length < FORECAST_RULE.minExpenseDays) reasons.push('insufficient_expense_days');
    if (!history.some(r => r.date >= shiftDay(cutoff, 1 - FORECAST_RULE.recentDays))) reasons.push('no_recent_expense_records');
  }
  const series = Array.from({length:n}, (_,i) => byDate.get(shiftDay(first!,i))?.amount ?? '0.00');
  return { series, reasons, training: { startDate: first ?? null, endDate: cutoff, calendarDays: n,
    expenseDays: history.length, zeroFilledDays: n - history.length } };
}
export function buildForecast(input: ForecastInput) {
  const { asOfDate, rows, budgetAmount } = input;
  const cutoffDate = shiftDay(asOfDate,-1), forecastDates = Array.from({length:7},(_,i)=>shiftDay(asOfDate,i));
  const previousDates = Array.from({length:7},(_,i)=>shiftDay(cutoffDate,i-6));
  const windowStart = shiftDay(cutoffDate,-179), month = asOfDate.slice(0,7);
  const scopedRows = rows.filter(r=>r.date>=windowStart && r.date<=asOfDate);
  const ids = [...new Set(scopedRows.map(r=>r.categoryId))].sort();
  const names = new Map(input.categories.map(c=>[c.id,c.name]));
  const categories = ids.map(categoryId => {
    const own = scopedRows.filter(r=>r.categoryId===categoryId), byDate = new Map(own.map(r=>[r.date,r]));
    const { series, reasons, training } = categorySeries(own,cutoffDate);
    const fitted = reasons.length ? null : fitHolt(series);
    const previousDaily = previousDates.map(date=>({date,amount:byDate.get(date)?.amount??'0.00',hasExpenseRecords:Boolean(byDate.get(date)?.count)}));
    return { categoryId, categoryName:names.get(categoryId)??'ไม่ระบุหมวด', status:fitted?'available' as const:'unavailable' as const,
      training, parameters:fitted?{alpha:fitted.alpha,betaStar:fitted.betaStar,initialLevel:fitted.initialLevel,initialTrend:fitted.initialTrend,
        validationMAE:fitted.validationMAE,validationRMSE:fitted.validationRMSE}:null,
      clampedDays:fitted?.clampedDays??0,
      daily:fitted?forecastDates.map((date,i)=>({date,amount:fitted.amounts[i]!})):null,
      sevenDayTotal:fitted?money(sum(fitted.amounts)):null,
      previousDaily, previousSevenDayActual:money(sum(previousDaily.map(r=>r.amount))),
      recordedExpenseToday:money(byDate.get(asOfDate)?.amount??0), reasonCodes:reasons };
  });
  const ready = categories.filter(c=>c.daily!==null);
  const status = !ready.length?'unavailable':ready.length===categories.length?'available':'partial';
  const daily = ready.length?forecastDates.map((date,i)=>({date,amount:money(sum(ready.map(c=>c.daily![i]!.amount)))})):null;
  const previousDaily = previousDates.map((date,i)=>({date,amount:money(sum(categories.map(c=>c.previousDaily[i]!.amount))),
    comparableAmount:ready.length?money(sum(ready.map(c=>c.previousDaily[i]!.amount))):null,
    hasExpenseRecords:categories.some(c=>c.previousDaily[i]!.hasExpenseRecords),hasComparableExpenseRecords:ready.some(c=>c.previousDaily[i]!.hasExpenseRecords)}));
  const total = daily?money(sum(daily.map(r=>r.amount))):null;
  const previousComparable = ready.length?money(sum(ready.map(c=>c.previousSevenDayActual))):null;
  const actualMonth = sum(scopedRows.filter(r=>r.date.slice(0,7)===month).map(r=>r.amount));
  const end = new Date(month+'-01T00:00:00Z'); end.setUTCMonth(end.getUTCMonth()+1); end.setUTCDate(0);
  const remainingDays = daysBetween(asOfDate,end.toISOString().slice(0,10))+1, k = Math.min(7,remainingDays);
  const additional = ready.length?sum(ready.map(c=>D.max(new D(c.daily![0]!.amount).minus(c.recordedExpenseToday),0)
    .plus(sum(c.daily!.slice(1,k).map(r=>r.amount))))):null;
  const remaining = budgetAmount===null?null:new D(budgetAmount).minus(actualMonth);
  const allowance = remaining===null?null:D.max(remaining,0).mul(k).div(remainingDays).toDecimalPlaces(2);
  const budgetStatus = remaining===null?null:remaining.lt(0)?'already_over_budget':remaining.isZero()?'budget_exhausted':
    additional===null?'forecast_unavailable':status==='partial'?(additional.gt(allowance!)?'partial_forecast_above_reference':'partial_cannot_conclude'):
    additional.gt(allowance!)?'above_reference':additional.eq(allowance!)?'at_reference':'below_reference';
  return {status,asOfDate,timezone:'Asia/Bangkok',cutoffDate,forecastStartDate:asOfDate,forecastEndDate:forecastDates[6]!,
    horizonDays:7,method:'holt_linear',modelVersion:MODEL_VERSION,aggregation:'sum_available_category_forecasts',
    coverage:{availableCategories:ready.length,unavailableCategories:categories.length-ready.length,
      completeForObservedCategories:categories.length>0&&ready.length===categories.length},
    categories,summary:{scope:status==='available'?'observed_categories':'available_categories_only',daily,
      sevenDayForecastTotal:total,previousSevenDayActualAllCategories:money(sum(previousDaily.map(r=>r.amount))),
      previousSevenDayActualComparableCategories:previousComparable,
      comparablePeriodDifference:total===null?null:money(new D(total).minus(previousComparable!))},
    previousPeriod:{startDate:previousDates[0]!,endDate:cutoffDate,daily:previousDaily},
    budgetComparison:remaining===null?null:{month,budgetAmount,actualMonthExpenseToNow:money(actualMonth),
      remainingAmount:money(remaining),remainingDaysIncludingToday:remainingDays,comparedDays:k,
      referenceAllowance:money(allowance!),predictedAdditionalExpense:additional===null?null:money(additional),
      difference:additional===null?null:money(additional.minus(allowance!)),status:budgetStatus,
      suggestedAdditionalDailyAmount:D.max(remaining,0).div(remainingDays).toDecimalPlaces(2,D.ROUND_DOWN).toFixed(2)},
    reasonCodes:status==='unavailable'?[categories.length?'no_eligible_categories':'no_expense_history']:[],
    warningCodes:['missing_days_assumed_zero','recording_completeness_unverified','v1_thresholds_not_accuracy_guarantee',
      ...(status==='partial'?['partial_category_coverage']:[]),...(categories.some(c=>c.clampedDays)?['negative_forecast_clipped']:[])] };
}
export async function forecastInput(tx: Prisma.TransactionClient,userId:string,asOfDate:string):Promise<ForecastInput> {
  const grouped = await tx.transaction.groupBy({by:['categoryId','transactionDate'],
    where:{userId,type:'expense',transactionDate:{gte:new Date(shiftDay(asOfDate,-180)+'T00:00:00Z'),lte:new Date(asOfDate+'T00:00:00Z')}},
    _sum:{amount:true},_count:{_all:true},orderBy:[{categoryId:'asc'},{transactionDate:'asc'}]});
  const ids=[...new Set(grouped.map(r=>r.categoryId))];
  const categories=await tx.category.findMany({where:{id:{in:ids}},select:{id:true,name:true}});
  const budget=await tx.budget.findUnique({where:{userId_year_month:{userId,year:Number(asOfDate.slice(0,4)),month:Number(asOfDate.slice(5,7))}},select:{amount:true}});
  return {asOfDate,rows:grouped.map(r=>({categoryId:r.categoryId,date:r.transactionDate.toISOString().slice(0,10),
    amount:r._sum.amount!.toFixed(2),count:r._count._all})),categories,budgetAmount:budget?.amount.toFixed(2)??null};
}
