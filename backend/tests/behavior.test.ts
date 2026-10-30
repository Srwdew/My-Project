import test from 'node:test';
import assert from 'node:assert/strict';
import { behaviorPeriod, shiftDay, dayCount, recurrenceKind, recurrenceWindows, BEHAVIOR_RULE, BEHAVIOR_VERSION, type BehaviorRow } from '../src/lib/behaviorRules';
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
const comparisonFixture=(count:number,amount:string,previousAmount='400')=>[
 ...history(period.previous.startDate,30,'b'),...history(period.current.startDate,30,'b'),
 ...[0,7,14,21,29].map(i=>({categoryId:'a',categoryName:'อาหาร',date:shiftDay(period.previous.startDate,i),bucket:-1,count:2,amount:previousAmount})),
 ...[0,7,14,21,29].map(i=>({categoryId:'a',categoryName:'อาหาร',date:shiftDay(period.current.startDate,i),bucket:-1,count,amount}))
];
test('multi-metric frequency/average/both conditions and equality boundaries',()=>{
 const frequency=buildBehavior(input(comparisonFixture(3,'480')));
 const f=frequency.findings.find(f=>f.categoryId==='a')!;assert.equal(f.ruleId,'category_frequency_up');
 const c=frequency.facts.categories.find(c=>c.categoryId==='a')!;assert.equal(c.current.averagePerTransaction,'160.00');assert.equal(c.comparison!.amount.difference,'400.00');assert.equal(c.comparison!.amount.changePercent,'20.00');
 assert.equal(buildBehavior(input(comparisonFixture(2,'500'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_average_up');
 assert.equal(buildBehavior(input(comparisonFixture(3,'900'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_both_up');
 assert.equal(buildBehavior(input(comparisonFixture(3,'600'))).findings.find(f=>f.categoryId==='a')!.ruleId,'category_frequency_up');
 assert(!buildBehavior(input(comparisonFixture(2,'400'))).findings.some(f=>f.scope==='comparison'&&f.categoryId==='a'));
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
test('recurrence 7±1 days, monthly due ±3, leap month end, duplicates and irregularity',()=>{
 assert.equal(recurrenceKind(['2026-09-01','2026-09-08','2026-09-15','2026-09-22'],[1,1,1,1]),'weekly');
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
 const rec={categoryId:'a',categoryName:'a',amount:'100',dates:['2026-09-01','2026-09-08','2026-09-15','2026-09-22'],counts:[1,1,1,1]};
 assert.equal(buildBehavior({...input([]),recurrences:[rec]}).facts.recurrenceCandidates.length,0);
 const v=buildBehavior({...input(full()),recurrences:Array(51).fill(rec)});assert.equal(v.facts.recurrenceCandidates.length,50);assert.equal(v.facts.recurrence.hasMore,true);
 assert.match(BEHAVIOR_VERSION,/behavior-v3-/);
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
 assert(!tiny.findings.some(f=>f.ruleId==='category_average_up'),'below 100 baht minimum increase');assert.equal(tiny.facts.summary.comparison!.amount.difference,'0.30');
});
test('time dimension 50 percent and 5 day boundaries; not enough confirmed times has reasons',()=>{
 const rows=history(period.current.startDate,30,'a','100',0);rows.forEach((r,i)=>{if(i>=15)r.bucket=1;});
 let v=buildBehavior(input(rows));assert.equal(v.findings.filter(f=>f.ruleId==='confirmed_time_concentration').length,2);
 const n=history(period.current.startDate,30,'a','100',-1);n[0]!.bucket=0;
 v=buildBehavior(input(n));assert(v.facts.timeDistribution.current.reasonCodes.includes('insufficient_confirmed_time_count'));
 const concentrated=history(period.current.startDate,30,'a','100',-1);concentrated.forEach((r,i)=>{if(i<4){r.bucket=0;r.count=30;}});
 v=buildBehavior(input(concentrated));assert(!v.findings.some(f=>f.ruleId==='confirmed_time_concentration'));
});

test('category guard matrix: 4/5 rows and 2/3 days independently in both periods',async t=>{
 const own=(start:string,count:number,days:number,unit:number):BehaviorRow[]=>Array.from({length:days},(_,i)=>{
  const n=i===0?count-days+1:1;
  return {categoryId:'guard',categoryName:'guard',date:shiftDay(start,i),bucket:-1,count:n,amount:String(n*unit)};
 });
 for(const currentCount of [4,5])for(const currentDays of [2,3])
 for(const previousCount of [4,5])for(const previousDays of [2,3]){
  await t.test(`current ${currentCount}/${currentDays}; previous ${previousCount}/${previousDays}`,()=>{
   const v=buildBehavior(input([...full(),...own(period.current.startDate,currentCount,currentDays,200),...own(period.previous.startDate,previousCount,previousDays,100)]));
   assert.equal(v.readiness.comparisonReady,true,'background history keeps period readiness independent');
   const c=v.facts.categories.find(c=>c.categoryId==='guard')!;
   assert.deepEqual([c.current.transactionCount,c.current.distinctDays,c.previous.transactionCount,c.previous.distinctDays],[currentCount,currentDays,previousCount,previousDays]);
   const eligible=currentCount===5&&currentDays===3&&previousCount===5&&previousDays===3;
   assert.equal(c.findingEligible,eligible);
   assert.deepEqual(c.findingReasonCodes,eligible?[]:['insufficient_category_count_or_days']);
   assert.notEqual(c.comparison,null,'facts remain comparable even when category finding is gated');
   assert.equal(v.findings.some(f=>f.categoryId==='guard'),eligible);
  });
 }
});

test('all rolling windows, general 5 distinct days in 30 inclusive; duplicate dates never manufacture days',()=>{
 const window=(offsets:number[])=>recurrenceWindows(offsets.map(d=>shiftDay('2026-01-01',d)),offsets.map(()=>1));
 assert.equal(window([0,2,4,29]).length,0);
 assert.equal(window([0,2,4,6,29])[0]?.kind,'general');
 assert.equal(window([0,2,4,6,30]).length,0);
 assert.equal(window([0,0,2,4,6]).length,0);
 assert.equal(window([0,40,42,44,46,69])[0]?.dates[0],'2026-02-10','later qualifying window found');
 assert.equal(window([0,2,4,6,29,80])[0]?.dates[0],'2026-01-01','early window retained despite later records');
 assert.equal(recurrenceWindows(['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-30'],[2,1,1,1,1])[0]?.kind,'general');
});
test('weekly minimum four 7±1-day occurrences and monthly three due dates ±3 days',()=>{
 const w=(d:string[])=>recurrenceWindows(d,d.map(()=>1));
 assert.equal(w(['2026-01-01','2026-01-08','2026-01-15']).length,0);
 assert.equal(w(['2026-01-01','2026-01-08','2026-01-15','2026-01-22'])[0]?.kind,'weekly');
 assert.equal(w(['2026-01-01','2026-01-08','2026-01-15','2026-01-29']).length,0);
 assert.equal(w(['2026-01-31','2026-02-28']).length,0);
 assert.equal(w(['2026-01-31','2026-02-28','2026-03-31'])[0]?.kind,'monthly');
 assert.equal(w(['2026-01-31','2026-03-31','2026-04-30']).length,0);
 assert.equal(w(['2026-01-01','2026-02-05','2026-03-01']).length,0,'monthly +4 days rejected');
 assert.equal(w(['2026-01-01','2026-02-04','2026-02-26'])[0]?.kind,'monthly','monthly +3/-3 days accepted');
 assert.equal(BEHAVIOR_RULE.weeklyWindow,28);assert.equal(BEHAVIOR_RULE.monthlyWindow,90);
 // Under exact cadence four weekly dates span 22 inclusive days, three monthly dates <=63;
 // 28/29 and 90/91-day spans cannot be valid exact-cadence minimal witnesses.
});
test('recurrence evidence, Global Readiness, confirmed-only time and comparison remain distinct',()=>{
 const dates=['2026-09-01','2026-09-08','2026-09-15','2026-09-22'];
 const transactions=dates.map((date,i)=>({id:'synthetic-'+i,date,amount:'100.00',time:null}));
 const rec={categoryId:'a',categoryName:'a',amount:'100.00',dates,counts:[1,1,1,1],transactions};
 for(const n of [0,29])assert.equal(buildBehavior({...input(history(period.current.startDate,n)),recurrences:[rec]}).facts.recurrenceCandidates.length,0);
 const v=buildBehavior({...input(full()),recurrences:[rec]});
 const candidate=v.facts.recurrenceCandidates[0]!;
 assert.deepEqual(candidate.transactions,transactions);assert.equal(candidate.occurrenceCount,4);
 assert.equal(candidate.startDate,dates[0]);assert.equal(candidate.endDate,dates[3]);
 assert(v.findings.filter(f=>f.ruleId.startsWith('possible_recurrence_')).every(f=>f.scope==='current'));
 assert(!v.findings.some(f=>f.ruleId==='confirmed_time_concentration'));
 const changed=buildBehavior(input(comparisonFixture(3,'480')));
 assert(changed.findings.some(f=>f.scope==='comparison'));
 assert.equal(changed.facts.recurrenceCandidates.length,0,'change alone never creates recurrence');
 assert(changed.findings.filter(f=>f.scope==='comparison').every(f=>f.findingType==='period_change'));
 assert(v.findings.filter(f=>f.ruleId.startsWith('possible_recurrence_')).every(f=>f.findingType==='recurrence'));
});
test('four-hour boundaries match existing Anomaly bucket width, without importing scoring into Behavior',async()=>{
 const {ANOMALY_RULE}=await import('../src/lib/anomalyRules');
 assert.equal(BEHAVIOR_RULE.bucketHours*60,ANOMALY_RULE.bucketMinutes);
});

test('recurrence Global Readiness matrix 29/30 transactions by 29/30 inclusive days',()=>{
 const dates=['2026-09-01','2026-09-08','2026-09-15','2026-09-22'];
 const rec={categoryId:'a',categoryName:'a',amount:'100',dates,counts:[1,1,1,1]};
 for(const count of [29,30])for(const span of [29,30]){
  const rows=[{...history(period.current.startDate,1)[0]!,count:count-1},
    {...history(shiftDay(period.current.startDate,span-1),1)[0]!,count:1}];
  const v=buildBehavior({...input(rows),recurrences:[rec]});
  assert.equal(v.readiness.current.ready,count===30&&span===30);
  assert.equal(v.facts.recurrenceCandidates.length,count===30&&span===30?1:0);
 }
});


test('deduplicate contained recurrence evidence, preserve disjoint and partially overlapping witnesses',()=>{
 const p=behaviorPeriod({startDate:'2026-01-01',endDate:'2026-06-30'},today);
 const make=(kind:'general'|'weekly'|'monthly',dates:string[],amount='100.00',categoryId='a')=>({categoryId,categoryName:categoryId,amount,kind,dates,counts:dates.map(()=>1),transactions:dates.map(date=>({id:categoryId+':'+amount+':'+date,date,amount,time:null}))});
 const weekly=make('weekly',['2026-01-01','2026-01-08','2026-01-15','2026-01-22']);
 const general=make('general',[...weekly.dates,'2026-01-29']);
 const independent=make('general',['2026-03-01','2026-03-03','2026-03-05','2026-03-07','2026-03-09']);
 const partial=make('general',['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05']);
 const monthly=make('monthly',['2026-01-01','2026-02-01','2026-03-01']);
 const build=(recurrences:typeof general[])=>buildBehavior({...input(history(p.current.startDate)),period:p,recurrences});
 const v=build([general,weekly,independent,partial,monthly]);
 assert.deepEqual(v.facts.recurrenceCandidates.map(r=>[r.kind,r.startDate]),[['weekly','2026-01-01'],['general','2026-03-01'],['general','2026-01-01'],['monthly','2026-01-01']]);
 assert.equal(v.findings.filter(f=>f.findingType==='recurrence').length,4);
 assert.deepEqual(v.facts.recurrenceCandidates[0]!.transactions,weekly.transactions,'winning evidence is not merged or inflated');
 assert.equal(build([weekly,general]).facts.recurrenceCandidates.length,1,'input order does not choose winner');
 assert.equal(build([general,{...weekly,amount:'100.01'}]).facts.recurrenceCandidates.length,1,'containment uses transaction evidence, not exact amount');
 assert.equal(build([general,{...weekly,categoryId:'b'}]).facts.recurrenceCandidates.length,2,'different category remains');
});

test('specificity precedence is evidence containment, not group or interval equality',async()=>{
 const {distinctRecurrenceEvidence}=await import('../src/lib/behaviorRules');
 // Predicate contract only: cadence qualification happens BEFORE this helper.
 const w={categoryId:'a',categoryName:'a',amount:'1.00',dates:['2026-01-01'],counts:[1]};
 assert.deepEqual(distinctRecurrenceEvidence([{...w,kind:'general' as const},{...w,kind:'weekly' as const},{...w,kind:'monthly' as const}]).map(r=>r.kind),['monthly']);
 assert.equal(distinctRecurrenceEvidence([{...w,kind:'general' as const},{...w,kind:'weekly' as const,counts:[2]}]).length,2,'all higher evidence must be contained, including counts');
 assert.equal(distinctRecurrenceEvidence([{...w,kind:'general' as const},{...w,kind:'weekly' as const,dates:[]}]).length,2,'empty evidence cannot hide cards');
});

test('deduplication precedes display cap; independent witnesses fill slots and hasMore is accurate',()=>{
 const dates=[0,7,14,21,28].map(d=>shiftDay(period.current.startDate,d));
 const recurrences=Array.from({length:51},(_,i)=>({categoryId:'a',categoryName:'a',amount:String(i+1),dates,counts:[1,1,1,1,1]}));
 for(const n of [50,51]){
  const v=buildBehavior({...input(full()),recurrences:recurrences.slice(0,n)});
  assert.equal(v.facts.recurrenceCandidates.length,50);assert.equal(v.facts.recurrence.hasMore,n===51);
  assert(v.facts.recurrenceCandidates.every(r=>r.kind==='weekly'));
 }
});

test('tiny increase is a fact, not a finding; decreases remain facts; eight finding IDs stay unchanged',()=>{
 const tiny=buildBehavior(input(comparisonFixture(2,'400.01')));
 assert(!tiny.findings.some(f=>f.scope==='comparison'&&f.categoryId==='a'));
 assert.equal(tiny.facts.categories.find(c=>c.categoryId==='a')!.comparison!.amount.difference,'0.05');
 const down=buildBehavior(input(comparisonFixture(2,'399')));
 assert.equal(down.facts.categories.find(c=>c.categoryId==='a')!.comparison!.amount.difference,'-5.00');
 assert(!down.findings.some(f=>f.scope==='comparison'&&f.categoryId==='a'));
 const ids=new Set([3,2,3].flatMap((n,i)=>buildBehavior(input(comparisonFixture(n,['480','500','900'][i]!))).findings.map(f=>f.ruleId)));
 const p=behaviorPeriod({startDate:'2026-01-01',endDate:'2026-06-30'},today);
 const recurrences=[{kind:'general' as const,dates:['2026-01-01','2026-01-02','2026-01-03','2026-01-04','2026-01-05']},{kind:'weekly' as const,dates:['2026-02-01','2026-02-08','2026-02-15','2026-02-22']},{kind:'monthly' as const,dates:['2026-04-15','2026-05-15','2026-06-15']}].map(r=>({...r,categoryId:'a',categoryName:'a',amount:'100',counts:r.dates.map(()=>1)}));
 for(const f of buildBehavior({...input(history(p.current.startDate,30,'a','100',3)),period:p,recurrences}).findings)ids.add(f.ruleId);
 assert.deepEqual([...ids].sort(),['category_average_up','category_both_up','category_dominant_share','category_frequency_up','confirmed_time_concentration','possible_recurrence_general','possible_recurrence_monthly','possible_recurrence_weekly'].sort());
});

test('minimum increase requires both >=5% and >=100 baht, inclusive',()=>{
 const finding=(current:string,previous:string)=>buildBehavior(input(comparisonFixture(2,current,previous))).findings.some(f=>f.scope==='comparison'&&f.categoryId==='a');
 assert.equal(BEHAVIOR_RULE.minimumIncreaseShare,'0.05');assert.equal(BEHAVIOR_RULE.minimumIncreaseAmount,'100');
 assert.equal(finding('420','400'),true,'2000 -> 2100: exactly 100 baht and exactly 5%');
 assert.equal(finding('419.99','400'),false,'99.95 baht');
 assert.equal(finding('4020','4000'),false,'100 baht but only 0.5%');
 assert.equal(finding('110','100'),false,'10% but only 50 baht');
});
test('amount band: every amount within 10% of the group median, inclusive',async()=>{
 const {amountBand}=await import('../src/lib/behaviorRules');
 assert.equal(amountBand(['100','110','90'])!.median.toFixed(2),'100.00');
 assert.equal(amountBand(['100','110.01','95']),null);
 assert.equal(amountBand(['1200','1250','1180'])!.median.toFixed(2),'1200.00');
 assert.equal(amountBand(['100','100','100','121']),null,'even count uses mean of middle two');
 assert.equal(amountBand(['0','0']),null);
});
test('weekly cadence accepts 7±1 days and rejects 5 or 9 days',()=>{
 const w=(offsets:number[])=>recurrenceWindows(offsets.map(d=>shiftDay('2026-01-01',d)),offsets.map(()=>1)).find(x=>x.kind==='weekly');
 assert(w([0,6,14,21]));assert(w([0,8,15,23]));
 assert.equal(w([0,9,16,23]),undefined);assert.equal(w([0,5,12,19]),undefined);
});
test('findRecurrences groups near amounts, rejects ambiguous days, and keeps distinct items apart',async()=>{
 const {findRecurrences}=await import('../src/lib/behaviorRules');
 let n=0;const row=(date:string,amount:string,categoryId='a'):BehaviorRow=>({categoryId,categoryName:categoryId,date,bucket:-1,count:1,amount,transactions:[{id:'t'+String(n++).padStart(3,'0'),date,amount,time:null}]});
 const bills=['2026-01-05','2026-02-07','2026-03-04'].map((d,i)=>row(d,['1200','1250','1180'][i]!));
 let r=findRecurrences(bills);
 assert.deepEqual(r.map(x=>[x.kind,x.amount,x.dates.join()]),[['monthly','1200.00','2026-01-05,2026-02-07,2026-03-04']]);
 assert.equal(findRecurrences([...bills.slice(0,2),row('2026-03-04','1400')]).length,0,'amount outside 10%');
 assert.equal(findRecurrences([...bills.slice(0,2),row('2026-03-09','1180')]).length,0,'date 4 days late');
 const weekly=['2026-01-01','2026-01-08','2026-01-15','2026-01-22'].map(d=>row(d,'55'));
 assert.deepEqual(findRecurrences(weekly).map(x=>x.kind),['weekly']);
 assert.equal(findRecurrences([...weekly,row('2026-01-08','56')]).length,0,'two near amounts on one day are ambiguous');
 r=findRecurrences([...weekly,...['2026-01-02','2026-01-09','2026-01-16','2026-01-23'].map(d=>row(d,'300'))]);
 assert.deepEqual(r.map(x=>x.amount).sort(),['300.00','55.00'],'distinct amount bands stay separate items');
 const long=Array.from({length:12},(_,i)=>row(shiftDay('2026-01-01',i*7),'55'));
 assert.equal(findRecurrences(long).filter(x=>x.kind==='weekly').length,1,'one witness per item and kind');
});
test('integer recurrence band matches the Decimal amountBand at the 10% boundary',async()=>{
 const {findRecurrences,amountBand}=await import('../src/lib/behaviorRules');
 let n=0;const rows=(amounts:string[])=>['2026-01-05','2026-02-05','2026-03-05'].map((date,i)=>({categoryId:'a',categoryName:'a',date,bucket:-1,count:1,amount:amounts[i]!,transactions:[{id:'b'+n++,date,amount:amounts[i]!,time:null}]}));
 for(const amounts of [['90','100','110'],['89.99','100','110'],['100','110.01','95'],['0.09','0.10','0.11'],['999.99','1000','1100']])
  assert.equal(findRecurrences(rows(amounts)).length===1,amountBand(amounts)!==null,amounts.join());
});
test('dominant category: >=40% of selected spend, inclusive; needs category guard; skipped in filtered view',()=>{
 assert.equal(BEHAVIOR_RULE.dominantShare,'0.40');
 // b: 30 x 100 = 3000; a: 5 rows on 5 days, total 2000 => exactly 40%.
 const rows=(aAmount:string,aDays=[0,7,14,21,29])=>[...history(period.current.startDate,30,'b'),...aDays.map(i=>({categoryId:'a',categoryName:'อาหาร',date:shiftDay(period.current.startDate,i),bucket:-1,count:1,amount:aAmount}))];
 const dominant=(r:BehaviorRow[],categoryId:string|null=null)=>buildBehavior({...input(r),period:{...period,categoryId}}).findings.filter(f=>f.ruleId==='category_dominant_share').map(f=>f.categoryId);
 assert.deepEqual(dominant(rows('400')),['b','a'],'a exactly 40%, b 60%');
 assert.deepEqual(dominant(rows('399.99')),['b'],'a just under 40%');
 assert.deepEqual(dominant(rows('1000',[0,0,7,7])),['b'],'a has 4 rows on 2 days: category guard');
 assert.deepEqual(dominant(rows('400'),'a'),[],'filtered view is always 100%');
 assert.deepEqual(dominant(history(period.current.startDate,29)),[],'selected period not ready');
});
