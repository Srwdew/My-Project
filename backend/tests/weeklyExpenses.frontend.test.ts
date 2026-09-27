import test from 'node:test';
import assert from 'node:assert/strict';
import {weeklyView,weeklyMoney,weeklyCents,type WeeklyResponse} from '../../frontend/src/utils/weeklyExpenses';
const data:WeeklyResponse={period:{startDate:'2024-02-29',endDate:'2024-03-04',dayCount:5},totalExpense:.08,transactionCount:2,weeks:[
 {weekNumber:2,startDate:'2024-03-04',endDate:'2024-03-04',totalExpense:.01,transactionCount:1,categories:[{categoryId:'b',name:'B',amount:.01,transactionCount:1}]},
 {weekNumber:1,startDate:'2024-02-29',endDate:'2024-03-03',totalExpense:.07,transactionCount:1,categories:[{categoryId:'a',name:'A',amount:.07,transactionCount:1}]}
]};
test('weekly graph conserves cents and chronological clipped boundaries',()=>{const v=weeklyView(data);assert.equal(weeklyMoney(v.total),'0.08');assert.equal(v.count,2);assert.deepEqual(v.weeks.map(w=>w.startDate),['2024-02-29','2024-03-04']);assert.equal(v.weeks[0]!.endDate,'2024-03-03');});
test('category filter uses only requested category, preserves empty weeks and excludes others',()=>{const a=weeklyView(data,'a'),b=weeklyView(data,'b'),none=weeklyView(data,'other');assert.equal(a.total,7n);assert.equal(a.count,1);assert.equal(a.weeks[1]!.count,0);assert.equal(a.total+b.total,weeklyView(data).total);assert.equal(none.count,0);assert.equal(none.total,0n);assert.equal(none.options.length,2);});
test('empty response and unsafe legacy numeric values are explicit',()=>{assert.equal(weeklyView({...data,weeks:[]}).count,0);assert.equal(weeklyCents(.29),29n);assert.throws(()=>weeklyCents(Number.MAX_SAFE_INTEGER));assert.throws(()=>weeklyCents(NaN));});
