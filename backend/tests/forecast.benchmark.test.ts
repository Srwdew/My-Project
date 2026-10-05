import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,baseline,metrics,evaluateWindow,PROTOCOL} from './forecast.benchmark';
import {history} from './forecast.fixture';import {money,sum} from '../src/lib/holt';
test('MAE/RMSE, zero and no points; weekly signed error differs from daily absolute error',()=>{
 assert.deepEqual(metrics(['3','-4']),{n:2,mae:'3.50',rmse:'3.54'});assert.deepEqual(metrics([]),{n:0,mae:null,rmse:null});
 assert.equal(metrics([money(sum(['3','-4']))]).mae,'1.00');assert.equal(metrics(['0']).rmse,'0.00');
});
test('baselines round total daily series; weekly totals can differ by cents after rounding',()=>{
 const v=['0.07','0.01','0','0','0','0','0'];
 assert.equal(money(sum(baseline(v,'seasonal-naive'))),'0.08');assert.equal(money(sum(baseline(v,'mean-7'))),'0.07');
 assert.deepEqual(baseline(Array(7).fill('0.075'),'mean-7'),Array(7).fill('0.08'));
});
test('deterministic synthetic fixtures and separate seeds; shared account-origin eligibility',()=>{
 for(const s of PROTOCOL.scenarios)assert.deepEqual(fixture(s,17),fixture(s,17));
 assert(PROTOCOL.seeds.every(s=>!PROTOCOL.developmentSeeds.includes(s)));
 const a=evaluateWindow(history(30),'2026-09-27','dev','constant');
 for(const m of PROTOCOL.models)assert.equal(a.points.filter(p=>p.model===m).length,7);
 const b=evaluateWindow(history(29),'2026-09-27','dev','constant');assert.deepEqual(b.points,[]);
});
