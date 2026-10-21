import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {prisma} from '../src/lib/prisma';import {checkTransactionAnomaly,withAnomalyLock} from '../src/lib/anomaly';import {submitDecision} from '../src/lib/anomalyDecisions';
import {readDataset,type Scope,validateTarget} from '../experiments/anomalyToleranceRead';import {experiment} from '../experiments/anomalyTolerance';
const connection=process.env.DATABASE_URL??'',u=new URL(connection);
if(u.pathname.slice(1)!==process.env.GOALS_TEST_DATABASE||!u.pathname.startsWith('/spendsense_goals_test_'))throw Error('Isolated test database required');
test('real PostgreSQL: append-only decisions/pattern, fixed founding reference, revision isolation and read-only export',async t=>{
 t.after(()=>prisma.$disconnect());const since=new Date(Date.now()-1000).toISOString();
 const user=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-only'}});
 const actor={userId:user.id,authVersion:0},cat=await prisma.category.create({data:{name:'Synthetic tolerance '+randomUUID(),type:'expense'}});
 await prisma.anomalyNotificationSetting.create({data:{userId:user.id,enabled:true}});
 await prisma.transaction.createMany({data:Array.from({length:60},(_,i)=>({userId:user.id,categoryId:cat.id,type:'expense',amount:'100',transactionDate:new Date(Date.UTC(2026,6,i+1))}))});
 async function row(date:string,amount:string){
  const tx=await prisma.transaction.create({data:{userId:user.id,categoryId:cat.id,type:'expense',amount,transactionDate:new Date(date),anomalyPending:true,anomalyRevision:1}});
  await checkTransactionAnomaly(actor,tx.id);const e=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:tx.id,userId:user.id},orderBy:{evaluatedAt:'desc'}});return {tx,e};
 }
 const first=await row('2026-09-15','400');
 const one=await withAnomalyLock(actor,tx=>submitDecision(tx,user.id,first.e.id,randomUUID(),{dimension:'amount',action:'recurring',revision:1,expectedDecisionId:null,cadence:'monthly'}));
 const patternId=one.body.decision.patternId!;
 const second=await row('2026-10-01','460');
 const two=await withAnomalyLock(actor,tx=>submitDecision(tx,user.id,second.e.id,randomUUID(),{dimension:'amount',action:'recurring',revision:1,expectedDecisionId:null,patternId}));
 const event=await prisma.anomalyPatternEvent.findFirstOrThrow({where:{userId:user.id,patternId,sequence:1}});
 await assert.rejects(prisma.anomalyDecision.update({where:{id:two.body.decision.id},data:{action:'normal'}}));
 await assert.rejects(prisma.anomalyDecision.delete({where:{id:two.body.decision.id}}));
 await assert.rejects(prisma.anomalyPatternEvent.update({where:{id:event.id},data:{snapshot:{}}}));
 await assert.rejects(prisma.anomalyPatternEvent.delete({where:{id:event.id}}));
 const scope:Scope={database:u.pathname.slice(1),host:u.hostname,port:u.port,since,accounts:[user.id],source:'authorized-test-decisions'};validateTarget(connection,scope);
 const before=JSON.stringify(await prisma.anomalyDecision.findMany({where:{userId:user.id},orderBy:{id:'asc'}}));
 const report=experiment(await readDataset(connection,scope));assert.equal(report.patterns[0]!.referenceMedian,'400.00');assert.equal(report.patterns[0]!.positiveSamples,1);assert.equal(report.patterns[0]!.rows[2]!.correctMatch,1);assert.equal(report.patterns[0]!.rows[1]!.falseMiss,1);assert.equal(report.patterns[0]!.rows[2]!.falseMatch,null);
 assert.equal(JSON.stringify(await prisma.anomalyDecision.findMany({where:{userId:user.id},orderBy:{id:'asc'}})),before);
 await prisma.transaction.update({where:{id:second.tx.id},data:{amount:'600'}});
 const after=experiment(await readDataset(connection,scope));assert.equal(after.patterns[0]!.positiveSamples,0);assert.equal(after.skipped.oldOrDeletedRevision,1);
 assert.equal(JSON.stringify(await prisma.anomalyDecision.findMany({where:{userId:user.id},orderBy:{id:'asc'}})),before);
 assert.equal(((await prisma.anomalyPatternEvent.findUniqueOrThrow({where:{id:event.id}})).snapshot as any).referenceMedian,'400.00');
 assert.equal(after.automaticMatching,false);
});
