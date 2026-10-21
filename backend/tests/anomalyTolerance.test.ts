import test from 'node:test';import assert from 'node:assert/strict';
import {experiment,matches,TOLERANCES,markdown} from '../experiments/anomalyTolerance';
import {syntheticDataset} from '../experiments/anomalyToleranceSynthetic';
import {validateTarget} from '../experiments/anomalyToleranceRead';
test('all five bands use inclusive Decimal bounds on a frozen founding median',()=>{
 for(const t of TOLERANCES){assert.equal(matches(String(100+t),'100',t),true);assert.equal(matches(String(100-t),'100',t),true);assert.equal(matches(String(100+t+.01),'100',t),false);}
 assert.equal(matches('0.105','0.1',5),true);assert.equal(matches('0.10501','0.1',5),false);assert.throws(()=>matches('100','0',5));
});
test('deterministic pair labels count true matches, false matches and false misses',()=>{
 const r=experiment(syntheticDataset());assert.deepEqual(r.patterns[0]!.rows.map(x=>[x.correctMatch,x.falseMatch,x.falseMiss,x.correctRejection,x.samples]),[[1,1,3,3,8],[2,1,2,3,8],[2,2,2,2,8],[3,2,1,2,8],[3,3,1,1,8]]);
 assert.equal(r.automaticMatching,false);assert.equal(r.recommendedTolerance,null);assert.equal(r.conclusion,'ยังสรุปไม่ได้');
});
test('ordinary decisions and another pattern identity are not invented negative labels',()=>{
 const d=syntheticDataset();d.labels=[];d.observations[4]!.action='problem';d.observations[5]!.patternId='other-pattern';d.observations[5]!.action='recurring';
 const p=experiment(d).patterns[0]!;assert.equal(p.negativeSamples,0);assert.equal(p.unknownSamples,4);assert.equal(p.rows[0]!.falseMatch,null);assert.equal(p.status,'insufficient_data');
});
test('append-only stream stays untouched; latest supersession selected once, no retry double counting',()=>{
 const d=syntheticDataset(),original=d.observations[0]!;d.observations.push({...original,id:'superseding',sequence:2,action:'problem',patternId:null});
 const before=JSON.stringify(d);for(const o of d.observations)Object.freeze(o);Object.freeze(d.observations);
 const r=experiment(d);assert.equal(JSON.stringify(d),before);assert.equal(r.patterns[0]!.positiveSamples,3);assert.equal(r.patterns[0]!.unknownSamples,1);
});
test('edited/deleted revisions never inherit decisions; later decision can explicitly qualify new revision',()=>{
 const d=syntheticDataset();d.observations[0]!.currentRevision=2;d.observations[1]!.currentRevision=null;
 let r=experiment(d);assert.equal(r.skipped.oldOrDeletedRevision,2);assert.equal(r.patterns[0]!.positiveSamples,2);
 d.observations.push({...d.observations[0]!,id:'new-revision',evaluation:'new-evaluation',revision:2,currentRevision:2,sequence:1});r=experiment(d);assert.equal(r.patterns[0]!.positiveSamples,3);
});
test('founders, pre-consent, future, time and foreign accounts cannot leak into samples',()=>{
 const d=syntheticDataset();d.observations.push({...d.observations[0]!,transaction:'founder-tx',id:'founder-decision',evaluation:'founder'});
 d.observations[1]!.decidedAt='2026-09-01T00:00:00Z';d.observations[2]!.decidedAt='2026-11-01T00:00:00Z';d.observations[3]!.dimension='time';
 const r=experiment(d);assert.equal(r.patterns[0]!.excludedFounders,1);assert.equal(r.patterns[0]!.positiveSamples,1);
 d.observations.push({...d.observations[0]!,account:'unauthorized'});assert.throws(()=>experiment(d),/authorization/);
});
test('empty/single-class data remains inconclusive; labels tied to old decision cannot migrate',()=>{
 const d=syntheticDataset();d.patterns=[];assert.match(markdown(experiment(d)),/ยังสรุปไม่ได้/);
 const x=syntheticDataset();x.labels[0]!.decisionId='old-decision';assert.equal(experiment(x).patterns[0]!.negativeSamples,3);
});
test('changing later amounts never moves reference; tampered founding median rejected',()=>{
 const d=syntheticDataset();d.observations[0]!.amount='999';assert.equal(experiment(d).patterns[0]!.referenceMedian,'100.00');
 d.patterns[0]!.referenceMedian='101';assert.throws(()=>experiment(d),/founding median/);
});
test('separate account/pattern reports do not pool observations or declare a best range',()=>{
 const d=syntheticDataset();d.accounts.push('synthetic-b');d.patterns.push({...d.patterns[0]!,account:'synthetic-b',id:'pattern-b'});
 const r=experiment(d);assert.equal(r.accounts.length,2);assert.equal(r.patterns[1]!.rows[0]!.samples,0);assert.equal(r.patterns[1]!.status,'insufficient_data');
});
test('reader refuses application databases, remote hosts and absent explicit scope',()=>{
 const scope={database:'spendsense_goals_test_anomaly_dim',host:'127.0.0.1',port:'52810',since:'2026-10-07T00:00:00Z',accounts:['11111111-1111-1111-1111-111111111111'],source:'authorized-test-decisions' as const};
 validateTarget('postgresql://u:p@127.0.0.1:52810/'+scope.database,scope);
 assert.throws(()=>validateTarget('postgresql://u:p@127.0.0.1:5433/SpendSense',scope));
 assert.throws(()=>validateTarget('postgresql://u:p@remote:52810/'+scope.database,{...scope,host:'remote'}));
 assert.throws(()=>validateTarget('postgresql://u:p@127.0.0.1:52810/'+scope.database,{...scope,accounts:[]}));
});
