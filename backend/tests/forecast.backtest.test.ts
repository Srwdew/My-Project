import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateWindow,metrics} from './forecast.benchmark';import {history} from './forecast.fixture';
import {shiftDay} from '../src/lib/expenseForecast';
test('outer future cannot affect readiness, default or tuned parameters; all future categories scored',()=>{
 for(const n of [30,42]){
  const rows=history(n+7,shiftDay('2026-01-01',n+6));
  const cutoff=shiftDay('2026-01-01',n-1);
  const a=evaluateWindow(rows,cutoff,'dev','constant');
  const b=evaluateWindow(rows.map(r=>r.date>cutoff?{...r,amount:'0.00'}:r),cutoff,'dev','constant');
  assert.deepEqual(a.view,b.view);assert(a.points.filter(p=>p.model==='holt').every(p=>p.error==='0.00'));
  assert.equal(metrics(b.points.filter(p=>p.model==='holt').map(p=>p.error)).mae,'100.00');
  const c=evaluateWindow([...rows,{categoryId:'future-only',date:shiftDay(cutoff,1),amount:'25.00',count:1}],cutoff,'dev','constant');
  assert.deepEqual(a.view,c.view);assert.equal(c.points.find(p=>p.model==='holt'&&p.horizon===1)!.actual,'125.00');
 }
});
test('insufficient account origins produce no error points; tuning scores are not outer errors',()=>{
 const a=evaluateWindow(history(29),'2026-09-27','dev','short');assert.equal(a.view.status,'unavailable');assert.deepEqual(a.points,[]);
 const b=evaluateWindow(history(30),'2026-09-27','dev','ready');/* Holt -> Theta switch (selected in 730fd82): the Holt mode now lives on the reference column, not on the production view */assert.equal(b.coverage.parameterMode,'fixed_default');assert.equal(b.view.parameterMode,'inner_validation');
});
