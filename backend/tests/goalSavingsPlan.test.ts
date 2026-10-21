import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSavingsPlan, planPreviewSchema } from '../src/lib/goalSavingsPlan';
import { forecastGoalSignal, type GoalForecast } from '../src/lib/goalForecastSignal';
const today='2026-10-13';
const g=(id='a',targetAmount='800')=>({id,name:id,targetAmount,targetDate:'2026-10-31',savedAmount:'0.00',archivedAt:null});
test('all goals combined may fail even when each fits; exact alternatives and no mutation',()=>{
 const goals=[g(),g('b')],original=JSON.stringify(goals);
 assert.equal(calculateSavingsPlan([g()],'2000','1000',today).status,'within_plan');
 const p=calculateSavingsPlan(goals,'2000','1000',today);
 assert.equal(p.requiredMonthlyAmount,'1600.00');assert.equal(p.difference,'-600.00');
 assert.deepEqual(p.alternatives,{reduceBudgetBy:'600.00',increaseIncomeBy:'600.00',budgetReductionAlonePossible:true,targetBudget:'400.00',targetIncome:'2600.00'});
 assert.equal(calculateSavingsPlan(goals,'2000','1000',today,{income:'2600',goals:[]}).difference,'0.00');
 assert.equal(calculateSavingsPlan(goals,'2000','1000',today,{budgetAmount:'400',goals:[]}).status,'within_plan');
 assert.equal(JSON.stringify(goals),original);
});
test('Decimal cents rounded upward per goal before sum; month/leap boundaries and funded/archived exclusion',()=>{
 const rows=[{...g(),targetAmount:'0.07',savedAmount:'0.01',targetDate:'2024-02-29'}, {...g('b'),targetAmount:'0.01',targetDate:'2024-02-29'}, {...g('c'),savedAmount:'800'}, {...g('d'),archivedAt:'2024-01-01'}];
 const p=calculateSavingsPlan(rows,'0.10','0.01','2023-12-31');assert.equal(p.requiredMonthlyAmount,'0.03');assert.equal(p.difference,'0.06');assert.equal(p.activeGoalCount,2);
 assert.equal(calculateSavingsPlan([{...g(),targetDate:'2024-02-29'}],'800','0','2024-02-29').status,'within_plan');
 assert.equal(calculateSavingsPlan([{...g(),targetDate:'2024-02-29'}],'800','0','2024-03-01').status,'unavailable');
});
test('zero is real; negative cash, missing values and no active goals cannot masquerade as passing',()=>{
 assert.equal(calculateSavingsPlan([g()],'0','0',today).shortfall,'800.00');
 const negative=calculateSavingsPlan([g()],'100','1000',today);assert.equal(negative.availableMonthlyAmount,'-900.00');assert.equal(negative.shortfall,'1700.00');assert.equal(negative.alternatives?.budgetReductionAlonePossible,false);assert.equal(negative.alternatives?.targetBudget,null);
 for(const [income,budget] of [[null,'0'],['0',null],[null,null]]) {const p=calculateSavingsPlan([g()],income!,budget!,today);assert.equal(p.status,'unavailable');assert.equal(p.difference,null);}
 assert.equal(calculateSavingsPlan([],'1000','0',today).requiredMonthlyAmount,null);
});
test('missing or overdue goal blocks full assessment; what-if date and target reuse Goal formula',()=>{
 for(const targetDate of [null,'2026-10-12']) {
  const goals=[g(),{...g('b'),targetDate}];const p=calculateSavingsPlan(goals,'2000','1000',today);
  assert.equal(p.status,'unavailable');assert.equal(p.requiredMonthlyAmount,null);assert.equal(p.alternatives,null);
  const preview=calculateSavingsPlan(goals,'2000','1000',today,{goals:[{id:'b',targetAmount:'400',targetDate:'2026-11-30'}]});
  assert.equal(preview.requiredMonthlyAmount,'1000.00');assert.equal(preview.status,'within_plan');
 }
 assert.throws(()=>calculateSavingsPlan([g()],'1','0',today,{goals:[{id:'foreign'}]}));
});
test('strict preview validation rejects owner injection, invalid date, negative money and duplicate goals',()=>{
 for(const value of [{userId:'other'},{income:'-1'},{goals:[{id:'f'}]},{goals:[{id:'123e4567-e89b-12d3-a456-426614174000',targetDate:'2026-02-30'}]}]) assert.equal(planPreviewSchema.safeParse(value).success,false);
 const item={id:'123e4567-e89b-12d3-a456-426614174000'};
 assert.equal(planPreviewSchema.safeParse({goals:[item,item]}).success,false);
});
const forecast=():GoalForecast=>({status:'available',asOfDate:'2024-02-28',forecastStartDate:'2024-02-28',forecastEndDate:'2024-03-05',warningCodes:[],summary:{sevenDayForecastTotal:'999.00'},budgetComparison:{month:'2024-02',budgetAmount:'1000.00',comparedDays:2,difference:'20.00',predictedAdditionalExpense:'100.00',referenceAllowance:'80.00',status:'above_reference'}});
test('Forecast signal uses existing difference and compared days only, including leap/month crossing',()=>{
 const f=forecast(),p=forecastGoalSignal(f,'2024-02','1000.00','2024-02-28');assert.deepEqual(p,{reason:'above_reference',amount:'20.00',endDate:'2024-02-29'});
 f.budgetComparison!.difference='0.00';assert.equal(forecastGoalSignal(f,'2024-02','1000.00','2024-02-28').reason,'no_signal');
});
test('Forecast unavailable/stale/null/mismatched date or budget never becomes a zero signal',()=>{
 const cases=[{...forecast(),status:'unavailable' as const},{...forecast(),summary:{sevenDayForecastTotal:null}},{...forecast(),warningCodes:['stale_expense_history']},{...forecast(),budgetComparison:null},{...forecast(),asOfDate:'2024-02-27'},{...forecast(),budgetComparison:{...forecast().budgetComparison!,difference:null}},{...forecast(),budgetComparison:{...forecast().budgetComparison!,month:'2024-03'}}];
 for(const f of cases){const r=forecastGoalSignal(f,'2024-02','1000.00','2024-02-28');assert.equal(r.amount,null);assert.notEqual(r.reason,'no_signal');}
 assert.equal(forecastGoalSignal(forecast(),'2024-02','999.00','2024-02-28').reason,'period_mismatch');
});

test('Forecast contract rejects mismatched horizon and compared-day count',()=>{
 for(const f of [{...forecast(),forecastEndDate:'2024-03-06'},{...forecast(),budgetComparison:{...forecast().budgetComparison!,comparedDays:7}}]){
  assert.deepEqual(forecastGoalSignal(f,'2024-02','1000.00','2024-02-28'),{reason:'period_mismatch',amount:null,endDate:null});
 }
});
