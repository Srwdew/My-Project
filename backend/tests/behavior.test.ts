import test from 'node:test';
import assert from 'node:assert/strict';
import { behaviorPeriod, shiftDay, dayCount, recurrenceKind, BEHAVIOR_VERSION, type BehaviorRow } from '../src/lib/behaviorRules';
import { buildBehavior, type BehaviorInput } from '../src/lib/behavior';
const today='2026-09-26',period=behaviorPeriod({},today);
const history=(start:string,n=30,categoryId:string|null='a',amount='100.00',bucket=-1):BehaviorRow[]=>Array.from({length:n},(_,i)=>({categoryId,categoryName:categoryId??'ไม่ระบุหมวด',date:shiftDay(start,i),bucket,count:1,amount}));
const input=(rows:BehaviorRow[]):BehaviorInput=>({asOfDate:today,period,rows,categoryOptions:[],recurrences:[]});
const full=()=>[...history(period.previous.startDate),...history(period.current.startDate)];
test('Behavior equal preceding full days; strict validation, leap, year and Bangkok cutoff contract',()=>{
 assert.deepEqual(period.current,{startDate:'2026-08-27',endDate:'2026-09-25'});
 assert.deepEqual(period.previous,{startDate:'2026-07-28',endDate:'2026-08-26'});
 for(const q of [{startDate:'2026-02-30',endDate:'2026-03-02'},{startDate:'2026-09-25',endDate:today},{userId:'bad'},{startDate:['2026-01-01']},{categoryId:['a']},{categoryId:'bad'}, {startDate:'2024-01-01',endDate:'2026-01-01'}, {startDate:'0001-01-01',endDate:'0001-01-02'}])assert.throws(()=>behaviorPeriod(q,today));
 const leap=behaviorPeriod({startDate:'2024-02-01',endDate:'2024-02-29'},today);assert.equal(leap.days,29);assert.equal(dayCount(leap.previous.startDate,leap.previous.endDate),29);
 assert.equal(behaviorPeriod({},'2027-01-01').current.endDate,'2026-12-31');
});
test('30 count AND inclusive observed span; selected empty days cannot make data ready',()=>{
 const oneDay=history(period.current.startDate,1);oneDay[0]!.count=30;
 assert.equal(buildBehavior(input(oneDay)).readiness.current.ready,false);
 assert.equal(buildBehavior(input(history(period.current.startDate,29))).readiness.current.ready,false);
 const sparse=history(period.current.startDate,1);sparse[0]!.count=29;sparse.push({...sparse[0]!,count:1,date:period.current.endDate});
 const v=buildBehavior(input(sparse));assert.equal(v.readiness.current.ready,true);assert.equal(v.readiness.current.distinctExpenseDays,2);
});
test('no data/one side: all deltas hidden including categories, average and weekday',()=>{
 for(const rows of [[],history(period.current.startDate),history(period.previous.startDate)]){
 const v=buildBehavior(input(rows));assert.equal(v.readiness.comparisonReady,false);assert.equal(v.facts.summary.comparison,null);
 assert(v.facts.categories.every(c=>c.comparison===null));assert(v.facts.weekdayDistribution.every(w=>w.comparison===null));assert(!v.findings.some(f=>f.scope==='comparison'));
 }
});
test('Decimal conservation, missing categories grouped and expense days separate from recorded zero',()=>{
 const rows=[...history(period.current.startDate,30,null,'0.07'),...history(period.current.startDate,30,'b','0.01'),...history(period.previous.startDate)];
 const v=buildBehavior(input(rows));assert.equal(v.facts.summary.current.amount,'2.40');
 assert.equal(v.facts.categories.find(c=>c.categoryId===null)!.current.amount,'2.10');
 assert.equal(v.facts.daily[0]!.current.amount,'0.08');
 const gaps=buildBehavior(input([{...rows[0]!,amount:'0.00'}]));assert.equal(gaps.facts.daily[0]!.current.hasExpenseRecords,true);assert.equal(gaps.facts.daily[1]!.current.hasExpenseRecords,false);
});
test('ordinal chart preserves actual dates; weekday denominators count calendar occurrences',()=>{
 const v=buildBehavior(input(full()));assert.equal(v.facts.daily[0]!.dayIndex,1);
 assert.notEqual(v.facts.daily[0]!.current.date,v.facts.daily[0]!.previous.date);
 assert.equal(v.facts.weekdayDistribution.reduce((s,w)=>s+w.current.calendarOccurrences,0),30);
 assert.equal(v.facts.weekdayDistribution.reduce((s,w)=>s+w.previous.calendarOccurrences,0),30);
 assert(v.facts.weekdayDistribution.some(w=>w.current.calendarOccurrences!==w.previous.calendarOccurrences));
 assert(v.facts.weekdayDistribution.every(w=>w.current.averagePerCalendarOccurrence==='100.00'&&w.previous.averagePerCalendarOccurrence==='100.00'));
});
const comparisonFixture=(count:number,amount:string)=>[
 ...history(period.previous.startDate,30,'b'),...history(period.current.startDate,30,'b'),
 ...[0,7,14,21,29].map(i=>({categoryId:'a',categoryName:'อาหาร',date:shiftDay(period.previous.startDate,i),bucket:-1,count:2,amount:'400'})),
 ...[0,7,14,21,29].map(i=>({categoryId:'a',categoryName:'อาหาร',date:shiftDay(period.current.startDate,i),bucket:-1,count,amount}))
];
test('multi-metric frequency/average/both conditions and equality boundaries',()=>{
 const frequency=buildBehavior(input(comparisonFixture(3,'480')));
 const f=frequency.findings.find(f=>f.categoryId==='a')!;assert.equal(f.ruleId,'category_frequency_up');
 const c=frequency.facts.categories.find(c=>c.categoryId==='a')!;assert.equal(c.current.averagePerTransaction,'160.00');assert.equal(c.comparison!.amount.difference,'400.00');assert.equal(c.comparison!.amount.changePercent,'20.00');
 assert.equal(buildBehavior(input(comparisonFixture(2,'500'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_average_up');
 assert.equal(buildBehavior(input(comparisonFixture(3,'900'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_both_up');
 assert.equal(buildBehavior(input(comparisonFixture(3,'600'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_frequency_up');
 assert(!buildBehavior(input(comparisonFixture(2,'400'))).findings.some(f=>f.categoryId==='a'));
});
test('category guard prevents single large transaction conclusions; zero denominator null',()=>{
 const rows=full();rows.push({categoryId:'new',categoryName:'ใหม่',date:period.current.startDate,bucket:-1,count:1,amount:'999999'});
 const v=buildBehavior(input(rows));assert(!v.findings.some(f=>f.categoryId==='new'));assert.equal(v.facts.categories[0]!.comparison!.amount.changePercent,null);
 const filtered=buildBehavior({...input(rows),period:{...period,categoryId:'new'}});assert.equal(filtered.readiness.current.ready,false);assert.equal(filtered.facts.summary.current.transactionCount,1);
});
test('time coverage, confirmed sample minimum, >=50% bucket over >=5 distinct days',()=>{
 const rows=history(period.current.startDate,30,'a','100',3);
 let v=buildBehavior(input(rows));assert.equal(v.facts.timeDistribution.current.coveragePercent,'100.00');assert(v.findings.some(f=>f.ruleId==='confirmed_time_concentration'));
 rows.push({...rows[0]!,bucket:-1,count:8,amount:'800'});v=buildBehavior(input(rows));assert.equal(v.facts.timeDistribution.current.ready,false);assert(!v.findings.some(f=>f.ruleId==='confirmed_time_concentration'));
 const boundary=history(period.current.startDate,30,'a','100',3);boundary.push({...boundary[0]!,bucket:0,count:2,amount:'200'},{...boundary[0]!,bucket:-1,count:8,amount:'800'});
 assert.equal(buildBehavior(input(boundary)).facts.timeDistribution.current.coveragePercent,'80.00');
 assert.equal(buildBehavior(input(boundary)).facts.timeDistribution.current.ready,true);
 assert.equal(buildBehavior(input(history(period.current.startDate))).facts.timeDistribution.current.confirmedCount,0);
 assert.equal(buildBehavior(input(history(period.current.startDate))).facts.summary.current.amount,'3000.00');
});
test('strict recurrence exact 7 days, consecutive months, leap month end, duplicates and irregularity',()=>{
 assert.equal(recurrenceKind(['2026-09-04','2026-09-11','2026-09-18'],[1,1,1]),'weekly');
 assert.equal(recurrenceKind(['2024-01-31','2024-02-29','2024-03-31'],[1,1,1]),'monthly');
 assert.equal(recurrenceKind(['2026-01-15','2026-02-15','2026-03-15'],[1,1,1]),'monthly');
 for(const [dates,counts] of [
 [['2026-09-04','2026-09-12','2026-09-18'],[1,1,1]],
 [['2026-09-04','2026-09-11','2026-09-18'],[1,2,1]],
 [['2026-01-15','2026-03-15','2026-04-15'],[1,1,1]],
 [['2026-01-15','2026-02-15'],[1,1]]
 ] as [string[],number[]][])assert.equal(recurrenceKind(dates,counts),null);
});
test('recurrence results gated by current readiness, bounded and deterministic',()=>{
 const rec={categoryId:'a',categoryName:'a',amount:'100',dates:['2026-09-04','2026-09-11','2026-09-18'],counts:[1,1,1]};
 assert.equal(buildBehavior({...input([]),recurrences:[rec]}).facts.recurrenceCandidates.length,0);
 const v=buildBehavior({...input(full()),recurrences:Array(51).fill(rec)});assert.equal(v.facts.recurrenceCandidates.length,50);assert.equal(v.facts.recurrence.hasMore,true);
 assert.match(BEHAVIOR_VERSION,/behavior-v1-/);
});

test('Bangkok midnight changes last complete day only at local midnight',async()=>{
 const {bangkokToday}=await import('../src/lib/goalCalculations');
 assert.equal(behaviorPeriod({},bangkokToday(new Date('2026-09-25T16:59:59Z'))).current.endDate,'2026-09-24');
 assert.equal(behaviorPeriod({},bangkokToday(new Date('2026-09-25T17:00:00Z'))).current.endDate,'2026-09-25');
});
test('guard boundaries and unrounded average/share comparisons',()=>{
 const v=buildBehavior(input(comparisonFixture(3,'480'))),f=v.findings.find(f=>f.categoryId==='a')!;
 assert.equal((f.evidence as any).shareIncreased,true);
 const rows=comparisonFixture(3,'480').map(r=>r.categoryId==='a'?{...r,date:period.current.startDate}:r);
 assert(!buildBehavior(input(rows)).findings.some(f=>f.categoryId==='a'));
 const tiny=buildBehavior(input([...history(period.previous.startDate,30,'a','0.07'),...history(period.current.startDate,30,'a','0.08')]));
 assert(tiny.findings.some(f=>f.ruleId==='category_average_up'));assert.equal(tiny.facts.summary.comparison!.amount.difference,'0.30');
});
test('time dimension 50 percent and 5 day boundaries; not enough confirmed times has reasons',()=>{
 const rows=history(period.current.startDate,30,'a','100',0);rows.forEach((r,i)=>{if(i>=15)r.bucket=1;});
 let v=buildBehavior(input(rows));assert.equal(v.findings.filter(f=>f.ruleId==='confirmed_time_concentration').length,2);
 const n=history(period.current.startDate,30,'a','100',-1);n[0]!.bucket=0;
 v=buildBehavior(input(n));assert(v.facts.timeDistribution.current.reasonCodes.includes('insufficient_confirmed_time_count'));
 const concentrated=history(period.current.startDate,30,'a','100',-1);concentrated.forEach((r,i)=>{if(i<4){r.bucket=0;r.count=30;}});
 v=buildBehavior(input(concentrated));assert(!v.findings.some(f=>f.ruleId==='confirmed_time_concentration'));
});
