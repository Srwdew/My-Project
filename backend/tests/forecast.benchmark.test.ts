import test from 'node:test';
import assert from 'node:assert/strict';
import { baseline, evaluateWindow, fixture, metrics, PROTOCOL, roundingAudit, type Point } from './forecast.benchmark';
import { shiftDay, type ForecastRow } from '../src/lib/expenseForecast';
import { sum, money } from '../src/lib/holt';
test('pooled errors, weekly signed cancellation, zero actual and unavailable metrics',()=>{
 assert.deepEqual(metrics(['3.00','-4.00']),{n:2,mae:'3.50',rmse:'3.54'});
 assert.deepEqual(metrics([]),{n:0,mae:null,rmse:null});
 assert.equal(metrics([money(sum(['3.00','-4.00']))]).mae,'1.00');
 assert.deepEqual(metrics(['0.00']),{n:1,mae:'0.00',rmse:'0.00'});
});
test('baselines use correct order and Decimal HALF_UP cents',()=>{
 const v=['0.07','0.01','0.00','0.00','0.00','0.00','0.00'];
 assert.deepEqual(baseline(v,'seasonal-naive'),v);
 assert.deepEqual(baseline(v,'mean-7'),Array(7).fill('0.01'));
 assert.deepEqual(baseline(Array(7).fill('0.075'),'mean-7'),Array(7).fill('0.08'));
});
test('deterministic fixtures and unavailable lifecycle produce no fake zero errors',()=>{
 for(const s of PROTOCOL.scenarios) assert.deepEqual(fixture(s,17),fixture(s,17));
 assert.ok(PROTOCOL.seeds.every(s=>!PROTOCOL.developmentSeeds.includes(s)));
 const r=evaluateWindow(fixture('lifecycle',17),shiftDay(PROTOCOL.start,249),'dev','lifecycle');
 assert.equal(r.view.status,'unavailable');assert.equal(r.view.summary.daily,null);assert.deepEqual(r.points,[]);
});
test('equal eligibility, future invariance and rounded category totals',()=>{
 const rows:ForecastRow[]=Array.from({length:63},(_,i)=>['a','b'].map(categoryId=>({categoryId,date:shiftDay('2024-01-01',i),amount:money((i%7)+1),count:1}))).flat();
 rows.push({categoryId:'sparse',date:'2024-02-10',amount:'999.00',count:1});
 const a=evaluateWindow(rows,'2024-02-11','dev','weekly');
 const b=evaluateWindow(rows.map(r=>r.date>'2024-02-11'?{...r,amount:'1234.00'}:r).concat([{categoryId:'future',date:'2024-02-12',amount:'90000.00',count:1}]),'2024-02-11','dev','weekly');
 assert.deepEqual(a.view,b.view);assert.equal(a.view.status,'partial');
 assert.deepEqual(a.points.map(({actual,error,...p})=>p),b.points.map(({actual,error,...p})=>p));
 assert.ok(a.points.filter(p=>p.model==='seasonal-naive').every(p=>p.error==='0.00'));
 for(const m of PROTOCOL.models) for(let h=1;h<=7;h++) {
  const p=a.points.filter(p=>p.model===m&&p.horizon===h);
  assert.deepEqual(p.map(p=>p.category),['a','b','ALL']);
  assert.equal(money(sum(p.filter(p=>p.category!=='ALL').map(p=>p.prediction))),p.find(p=>p.category==='ALL')!.prediction);
 }
});

test('seven-day totals equal before rounding but can differ after category/day rounding',()=>{
 const exact=['0.07','0.00','0.00','0.00','0.00','0.00','0.00'];
 const nonexact=['0.07','0.01','0.00','0.00','0.00','0.00','0.00'];
 assert.equal(money(sum(baseline(exact,'seasonal-naive'))),money(sum(baseline(exact,'mean-7'))));
 assert.equal(money(sum(baseline(nonexact,'seasonal-naive'))),'0.08');
 assert.equal(money(sum(baseline(nonexact,'mean-7'))),'0.07');
 const points:Point[]=PROTOCOL.models.slice(1).flatMap(model=>baseline(nonexact,model).flatMap((prediction,i)=>['a','ALL'].map(category=>({account:'dev',scenario:'cents',cutoff:'2024-01-07',model,category,horizon:i+1,actual:'0.00',prediction,error:'-'+prediction}))));
 const audit=roundingAudit(points);
 assert.deepEqual(audit.counts.map(r=>[r.compared,r.equal,r.different,r.maxAbsoluteDifference]),[[1,0,1,'0.01'],[1,0,1,'0.01']]);
 assert.deepEqual(audit.scores.map(r=>r.mae),['0.080000000000','0.070000000000']);
});
