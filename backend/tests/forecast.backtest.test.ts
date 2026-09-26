import test from 'node:test';
import assert from 'node:assert/strict';
import { buildForecast, shiftDay, type ForecastRow } from '../src/lib/expenseForecast';
import { D, sum, MODEL_VERSION } from '../src/lib/holt';
function evaluate(rows:ForecastRow[],cutoff:string){
 const input=rows.filter(r=>r.date<=cutoff);
 const view=buildForecast({asOfDate:shiftDay(cutoff,1),rows:input,categories:[],budgetAmount:null});
 const eligible=new Set(view.categories.filter(c=>c.daily).map(c=>c.categoryId));
 const errors=(view.summary.daily??[]).map(day=>sum(rows.filter(r=>r.date===day.date&&eligible.has(r.categoryId)).map(r=>r.amount)).minus(day.amount));
 return {view,eligible:[...eligible],mae:errors.length?sum(errors.map(e=>e.abs())).div(errors.length).toFixed(2):null,
  rmse:errors.length?sum(errors.map(e=>e.pow(2))).div(errors.length).sqrt().toFixed(2):null};
}
test('nested chronological backtest freezes cutoff eligibility; changing future cannot tune model',()=>{
 const rows:ForecastRow[]=Array.from({length:63},(_,i)=>({categoryId:'a',date:shiftDay('2026-01-01',i),amount:'100.00',count:1}));
 rows.push({categoryId:'new-after-cutoff',date:'2026-02-12',amount:'99999',count:1});
 const cutoffs=['2026-02-11','2026-02-18','2026-02-25'];const report=[];
 for(const cutoff of cutoffs){const r=evaluate(rows,cutoff);assert.equal(r.mae,'0.00');assert.equal(r.rmse,'0.00');assert.deepEqual(r.eligible,['a']);report.push({cutoff,horizon:7,eligible:r.eligible.length,observed:r.view.categories.length,mae:r.mae,rmse:r.rmse});}
 const altered=rows.map(r=>r.date>'2026-02-11'?{...r,amount:'0.00'}:r);
 const a=evaluate(rows,'2026-02-11'),b=evaluate(altered,'2026-02-11');
 assert.deepEqual(a.view,b.view);assert.equal(b.mae,'100.00');assert.equal(b.rmse,'100.00'); // zero actual is valid, no percentage division
 console.log('SYNTHETIC_BACKTEST',JSON.stringify({modelVersion:MODEL_VERSION,syntheticAccounts:1,windows:report}));
});
test('declining series can forecast zero; sparse categories report coverage rather than cherry-pick accuracy',()=>{
 const rows:ForecastRow[]=Array.from({length:49},(_,i)=>({categoryId:'trend',date:shiftDay('2026-01-01',i),amount:String(Math.max(42-i,0)),count:i<42?1:0}));
 rows.push({categoryId:'sparse',date:'2026-02-10',amount:'0.07',count:1});
 const r=evaluate(rows,'2026-02-11');assert.equal(r.view.status,'partial');assert.equal(r.view.coverage.unavailableCategories,1);
 assert.equal(r.mae,'0.00');assert.equal(r.rmse,'0.00');assert.equal(new D(r.mae!).isFinite(),true);
});

test('synthetic weekly variation and sparse coverage: report MAE/RMSE, not claimed accuracy',()=>{
 const rows:ForecastRow[]=[];
 for(let i=0;i<84;i++){
  const date=shiftDay('2026-01-01',i);
  rows.push({categoryId:'daily',date,amount:String(80+(i%7)*15+(i%13===0?200:0)),count:1});
  if(i%3===0) rows.push({categoryId:'occasional',date,amount:'150.07',count:1});
 }
 rows.push({categoryId:'new',date:'2026-02-20',amount:'10000.00',count:1});
 const windows=[];
 for(const day of [41,48,55,62]){
  const cutoff=shiftDay('2026-01-01',day),r=evaluate(rows,cutoff);
  assert.ok(new D(r.mae!).gt(0));assert.ok(new D(r.rmse!).gte(r.mae!));
  assert.ok(!r.eligible.includes('new'));
  windows.push({cutoff,horizon:7,eligibleCategories:r.eligible.length,observedCategories:r.view.categories.length,mae:r.mae,rmse:r.rmse,
   zeroFilledDays:r.view.categories.filter(c=>c.daily).reduce((n,c)=>n+c.training.zeroFilledDays,0)});
 }
 console.log('SYNTHETIC_VARIABLE_BACKTEST',JSON.stringify({syntheticAccounts:1,modelVersion:MODEL_VERSION,windows}));
});
