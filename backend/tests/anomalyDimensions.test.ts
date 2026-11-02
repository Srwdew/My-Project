import test from 'node:test';import assert from 'node:assert/strict';
import {globalGate,amountReady,timeReady,screenExpense,type Baseline} from '../src/lib/anomalyRules';
const b:Baseline={n:30,days:10,span:28,median:'100',mad:'10',q1:'90',q3:'110',min:'80',max:'120',timeTotal:75,timeN:60,timeDays:20,timeSpan:42,bucketCount:0,nearbyCount:0};
test('Anomaly gate uses inclusive days, dimension span uses exclusive day difference',()=>{for(const n of [29,30])for(const days of [29,30])assert.equal(globalGate(n,days),n===30&&days===30);assert.equal(amountReady(b),true);/* ISSUE-ANOM-1 stage 2: amount minimum 30/10/28 -> 10/5/14, boundaries moved with it */assert.equal(amountReady({...b,n:10,days:5,span:14}),true);assert.equal(amountReady({...b,span:13}),false);assert.equal(amountReady({...b,days:4}),false);assert.equal(amountReady({...b,n:9}),false);});
test('time coverage denominator belongs to time dimension, not amount baseline',()=>{assert.equal(timeReady({...b,n:1}),true);assert.equal(timeReady({...b,timeTotal:76}),false);assert.equal(timeReady({...b,timeN:59}),false);assert.equal(timeReady({...b,timeDays:19}),false);assert.equal(timeReady({...b,timeSpan:41}),false);assert.equal(screenExpense('100',true,{...b,n:1000}).time.status,'flagged');});
import {cadenceCandidates,dueDate,patternStatus,withinCadence} from '../src/lib/anomalyPatternPolicy';
test('cadence grace windows, anchored month-end and leap-year handling',()=>{
 assert.equal(dueDate('2024-01-31','monthly',1),'2024-02-29');assert.equal(dueDate('2024-01-31','monthly',2),'2024-03-31');
 assert.equal(dueDate('2024-02-29','yearly',1),'2025-02-28');
 for(const [cadence,anchor,inside,outside] of [['weekly','2026-01-01','2026-01-10','2026-01-11'],['fortnightly','2026-01-01','2026-01-18','2026-01-19'],['monthly','2026-01-01','2026-02-06','2026-02-07'],['quarterly','2026-01-01','2026-04-08','2026-04-09'],['half_yearly','2026-01-01','2026-07-11','2026-07-12'],['yearly','2026-01-01','2027-01-15','2027-01-16']] as const){assert.equal(withinCadence(anchor,inside,cadence),true);assert.equal(withinCadence(anchor,outside,cadence),false);}
 assert.deepEqual(cadenceCandidates(['2026-01-01','2026-01-08','2026-01-15']),['weekly']);
 assert.deepEqual(cadenceCandidates(['2026-01-01','2026-01-08']),[]);
 assert.equal(patternStatus('2026-01-01','weekly','2026-01-16'),'active');
 assert.equal(patternStatus('2026-01-01','weekly','2026-01-18'),'paused');
 assert.equal(patternStatus('2026-01-01','weekly','2026-01-31'),'paused');
 assert.equal(patternStatus('2026-01-01','weekly','2026-02-01'),'expired');
 assert.equal(patternStatus('2026-01-01','yearly','2026-12-31'),'active');
});

import {withinPatternAmount,irregularCandidate} from '../src/lib/anomalyPatternPolicy';
test('amount matching stays disabled without floor; fixed reference never drifts',()=>{
 assert.equal(withinPatternAmount('115','100',null),null);assert.equal(withinPatternAmount('115','100','5'),true);assert.equal(withinPatternAmount('115.01','100','5'),false);
 assert.equal(withinPatternAmount('0.07','0.08','0.01'),true);
 assert.throws(()=>withinPatternAmount('100','100','-1'));
 const dates=['2026-01-01','2026-01-03','2026-01-28','2026-02-02','2026-03-20'];
 const rows=dates.map((date,i)=>({transactionId:String(i),revision:1,categoryId:'cat',amount:'100',date,confirmedValid:true}));
 assert.equal(irregularCandidate(rows,'cat','100',null,'2026-03-20').enabled,false);
 assert.equal(irregularCandidate(rows.slice(0,3),'cat','100','5','2026-03-20').candidate,true);
 assert.equal(irregularCandidate(rows.slice(0,4),'cat','100','5','2026-03-20').offer,false);
 assert.equal(irregularCandidate(rows,'cat','100','5','2026-03-20').offer,true);
 assert.equal(irregularCandidate([...rows,{...rows[0]!,revision:2,confirmedValid:false}],'cat','100','5','2026-03-20').count,4);
});

test('monthly pattern keeps original day after a short-month occurrence; two intervals each meet cadence',()=>{
 assert.equal(patternStatus('2026-01-31','monthly','2026-04-05','2026-02-28'),'active');
 assert.deepEqual(cadenceCandidates(['2026-01-01','2026-01-10','2026-01-19']),['weekly']);
 assert.deepEqual(cadenceCandidates(['2026-01-01','2026-01-10','2026-01-14']),[]);
});
