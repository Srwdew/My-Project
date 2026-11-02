import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {prisma} from '../src/lib/prisma';
import {app} from '../src/index';
import {withAnomalyLock,anomalyBaseline,checkTransactionAnomaly} from '../src/lib/anomaly';
import {baselineEligibility} from '../src/lib/anomalyReview';
import {submitDecision} from '../src/lib/anomalyDecisions';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_')||db!==process.env.GOALS_TEST_DATABASE)throw Error('Isolated test DB required');
test('dimension decisions, Gate and fallback on real PostgreSQL/HTTP',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 async function user(){const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-only'}});await prisma.anomalyNotificationSetting.create({data:{userId:u.id,enabled:true}});return {...u,userId:u.id,token:jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!)};}
 async function category(){return prisma.category.create({data:{name:randomUUID(),type:'expense'}});}
 async function req(u:Awaited<ReturnType<typeof user>>,path:string,body?:unknown,key?:string){const r=await fetch('http://127.0.0.1:'+address!.port+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+u.token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,body:await r.json() as any,cache:r.headers.get('cache-control')};}
 const a=await user(),b=await user(),cat=await category(),rare=await category();
 await prisma.transaction.createMany({data:Array.from({length:60},(_,i)=>({userId:a.id,categoryId:cat.id,type:'expense' as const,amount:'100',transactionDate:new Date(Date.UTC(2026,5,i+1)),transactionTime:new Date('1970-01-01T12:00:00Z'),transactionTimeConfirmed:true}))});
 const row=await prisma.transaction.create({data:{userId:a.id,categoryId:rare.id,type:'expense',amount:'250',transactionDate:new Date('2026-09-01'),transactionTime:new Date('1970-01-01T12:00:00Z'),transactionTimeConfirmed:true,anomalyPending:true,anomalyRevision:1}});
 await checkTransactionAnomaly(a,row.id);
 const e=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:row.id}}),snapshot=e.snapshot as any;
 await t.test('ready account fallback, self/date exclusion and independently ready dimensions',async()=>{
  assert.equal(snapshot.gate.ready,true);assert.equal(snapshot.gate.count,60);assert.equal(snapshot.scope.amount,'account');assert.equal(snapshot.scope.time,'account');
  assert.equal(snapshot.assessment.amount.status,'flagged');assert.equal(snapshot.assessment.time.status,'not_flagged');assert.equal(snapshot.baseline.n,60);
  const x=await prisma.$transaction(tx=>baselineEligibility(tx,a.id,row.id));assert.equal(x.amountBaselineEligible,false);assert.equal(x.timeBaselineEligible,true);
  const target={...row,id:randomUUID(),transactionDate:new Date('2026-09-02')};const base=await prisma.$transaction(tx=>anomalyBaseline(tx,target,true));
  assert.equal(base.baseline.n,60);assert.equal(base.baseline.timeN,61);assert.equal(base.baseline.timeTotal,61);
 });
 const action=(dimension:'amount'|'time',value:'normal'|'occasional'|'problem',previous:string|null,key=randomUUID())=>req(a,'/anomaly/evaluations/'+e.id+'/decisions',{dimension,action:value,revision:1,expectedDecisionId:previous},key);
 let first:any,second:any;
 await t.test('occasional separate from main; other dimension independent; same-key replay no branching',async()=>{
  const key=randomUUID();first=await action('amount','occasional',null,key);assert.equal(first.status,201);
  assert.deepEqual(await action('amount','occasional',null,key),first);
  assert.equal((await action('amount','normal',null,key)).status,409);
  const x=await prisma.$transaction(tx=>baselineEligibility(tx,a.id,row.id));assert.equal(x.amountBaselineEligible,false);assert.deepEqual(x.amountBaselineReasons,['confirmed_occasional']);assert.equal(x.timeBaselineEligible,true);
  const results=await Promise.all([action('amount','normal',first.body.decision.id),action('amount','problem',first.body.decision.id)]);
  assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);second=results.find(x=>x.status===201)!;
  assert.deepEqual(await action('amount','occasional',null,key),first);
  assert.equal(await prisma.anomalyDecision.count({where:{originalTransactionId:row.id,dimension:'amount'}}),2);
  assert.equal(second.body.decision.supersedesId,first.body.decision.id);
 });
 await t.test('ownership, read-only queue/detail, time decision, durable history and identity constraints',async()=>{
  assert.equal((await req(b,'/anomaly/evaluations/'+e.id+'/decisions')).status,404);
  assert.equal((await req(b,'/anomaly/evaluations/'+e.id+'/decisions',{dimension:'amount',action:'normal',revision:1,expectedDecisionId:null},randomUUID())).status,404);
  const count=await prisma.anomalyDecision.count({where:{userId:a.id}});
  const q=await req(a,'/anomaly/queue?filter=all');assert.equal(q.status,200);assert.equal(q.cache,'private, no-store');assert.ok(q.body.items.some((i:any)=>i.id===e.id));
  assert.equal((await req(b,'/anomaly/queue?filter=all')).body.items.length,0);assert.equal(await prisma.anomalyDecision.count({where:{userId:a.id}}),count);
  assert.equal((await action('time','problem',null)).status,201);
  assert.equal((await prisma.$transaction(tx=>baselineEligibility(tx,a.id,row.id))).timeBaselineEligible,false);
  await assert.rejects(prisma.anomalyDecision.update({where:{id:first.body.decision.id},data:{action:'normal'}}));
  await assert.rejects(prisma.anomalyDecision.delete({where:{id:first.body.decision.id}}));
  await assert.rejects(prisma.anomalyRevision.delete({where:{userId_transactionId_revision:{userId:a.id,transactionId:row.id,revision:1}}}));
  await assert.rejects(prisma.anomalyDecision.create({data:{userId:a.id,evaluationId:e.id,originalTransactionId:row.id,revision:1,dimension:'amount',action:'normal',sequence:3,supersedesId:first.body.decision.id}}));
  const receipt=await prisma.anomalyDecisionRequest.findFirstOrThrow({where:{decisionId:first.body.decision.id}});
  await assert.rejects(prisma.anomalyDecisionRequest.delete({where:{userId_idempotencyKey:{userId:a.id,idempotencyKey:receipt.idempotencyKey}}}));
 });
 await t.test('new revision never inherits decisions; deleted identity/revision/decision evidence retained',async()=>{
  await prisma.transaction.update({where:{id:row.id},data:{amount:'101'}});
  const updated=await prisma.transaction.findUniqueOrThrow({where:{id:row.id}});assert.equal(updated.anomalyRevision,2);
  await checkTransactionAnomaly(a,row.id);
  const next=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:row.id,revision:2}});assert.equal((next.snapshot as any).assessment.amount.status,'not_flagged');
  assert.equal((await prisma.$transaction(tx=>baselineEligibility(tx,a.id,row.id))).amountBaselineEligible,true);
  assert.equal(await prisma.anomalyRevision.count({where:{userId:a.id,transactionId:row.id}}),2);
  await prisma.transaction.delete({where:{id:row.id}});
  assert.equal((await req(a,'/anomaly/evaluations/'+e.id+'/decisions')).body.dimensions.amount.history.length,2);
  assert.equal(await prisma.anomalyIdentity.count({where:{userId:a.id,transactionId:row.id}}),1);
 });
 await t.test('Gate 29/30 count x 29/30 inclusive days, future and other-account rows cannot help',async()=>{
  for(const n of [29,30])for(const days of [29,30]){
   const u=await user(),c=await category();
   await prisma.transaction.createMany({data:Array.from({length:n},(_,i)=>({userId:u.id,categoryId:c.id,type:'expense' as const,amount:'100',transactionDate:new Date(Date.UTC(2026,6,i===n-1?days:1+(i%(days-1))))}))});
   await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'999999',transactionDate:new Date('2027-01-01')}});
   const target=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'10000',transactionDate:new Date('2026-08-01'),anomalyPending:true}});
   await checkTransactionAnomaly(u,target.id);const result=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:target.id}});
   const snap=result.snapshot as any;assert.equal(snap.gate.ready,n===30&&days===30);assert.equal(snap.gate.count,n);assert.equal(snap.gate.inclusiveDays,days);
   if(!snap.gate.ready){assert.equal(snap.scores,null);assert.equal((await req(u,'/anomaly/evaluations/'+result.id+'/decisions',{dimension:'amount',action:'normal',revision:result.revision,expectedDecisionId:null},randomUUID())).status,409);assert.equal(snap.assessment.amount.reasonCode,'global_gate_not_ready');assert.equal(snap.assessment.time.status,'not_evaluated');assert.equal(await prisma.notification.count({where:{userId:u.id}}),0);}
  }
 });
 await t.test('queue has no top-N or age expiry, paginated severity-first and complete',async()=>{
  const u=await user(),c=await category();
  for(let i=0;i<53;i++){
   const r=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'200',transactionDate:new Date('2020-01-01')}});
   await prisma.anomalyEvaluation.create({data:{userId:u.id,originalTransactionId:r.id,revision:0,ruleVersion:'synthetic-queue',outcome:'flagged',snapshot:{transaction:{amount:'200',categoryName:'test',date:'2020-01-01'},assessment:{level:i===52?'review_priority':'review',amount:{status:'flagged'},time:{status:'not_flagged'}}}}});
  }
  const first=(await req(u,'/anomaly/queue?filter=waiting&limit=25')).body;assert.equal(first.total,53);assert.equal(first.items[0].severity,0);
  const all=[...first.items,...(await req(u,'/anomaly/queue?filter=waiting&limit=25&offset=25')).body.items,...(await req(u,'/anomaly/queue?filter=waiting&limit=25&offset=50')).body.items];
  assert.equal(new Set(all.map((i:any)=>i.id)).size,53);
  const beyond=(await req(u,'/anomaly/queue?filter=waiting&offset=100')).body;assert.equal(beyond.total,53);assert.deepEqual(beyond.items,[]);
 });
 await t.test('manual cadence decisions, no automatic matching/floor, immutable lifecycle and restore replay',async()=>{
  const c=await category(),u=await user();
  const r=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'400.07',transactionDate:new Date('2020-01-31'),anomalyRevision:1}});
  const evaluation=await prisma.anomalyEvaluation.create({data:{userId:u.id,originalTransactionId:r.id,revision:1,ruleVersion:'synthetic-manual',outcome:'flagged',snapshot:{transaction:{categoryId:c.id,amount:'400.07',date:'2020-01-31'},assessment:{amount:{status:'flagged'},time:{status:'not_evaluated'}}}}});
  const key=randomUUID(),input={dimension:'amount',action:'recurring',cadence:'monthly',revision:1,expectedDecisionId:null};
  const created=await req(u,'/anomaly/evaluations/'+evaluation.id+'/decisions',input,key);assert.equal(created.status,201);
  assert.deepEqual(await req(u,'/anomaly/evaluations/'+evaluation.id+'/decisions',input,key),created);
  const pid=created.body.decision.patternId;assert.ok(pid);assert.equal(await prisma.anomalyPattern.count({where:{userId:u.id}}),1);
  const view=await req(u,'/anomaly/patterns');assert.equal(view.body.matchingEnabled,false);assert.equal(view.body.absoluteFloorInBaht,null);
  const first=view.body.items[0].current;assert.equal(first.snapshot.referenceMedian,'400.07');assert.equal(first.snapshot.status,'active');
  assert.equal((await prisma.$transaction(tx=>baselineEligibility(tx,u.id,r.id))).amountBaselineEligible,false);
  const expired=await req(u,'/anomaly/patterns/'+pid+'/events',{action:'refresh',expectedEventId:first.id},randomUUID());assert.equal(expired.status,200);assert.equal(expired.body.event.snapshot.status,'expired');
  const restoreKey=randomUUID(),restore={action:'restore',expectedEventId:expired.body.event.id};
  const restored=await req(u,'/anomaly/patterns/'+pid+'/events',restore,restoreKey);assert.equal(restored.body.event.snapshot.status,'active');
  assert.deepEqual(await req(u,'/anomaly/patterns/'+pid+'/events',restore,restoreKey),restored);
  assert.equal((await req(u,'/anomaly/patterns/'+pid+'/events',restore,randomUUID())).status,409);
  assert.equal((await req(b,'/anomaly/patterns/'+pid+'/events',restore,randomUUID())).status,404);
  await assert.rejects(prisma.anomalyPatternEvent.update({where:{id:first.id},data:{kind:'restore'}}));
  await assert.rejects(prisma.anomalyPattern.delete({where:{id:pid}}));
  // A later explicit occurrence never silently moves the reference median.
  const newer=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'900',transactionDate:new Date('2026-10-01')}});
  const ne=await prisma.anomalyEvaluation.create({data:{userId:u.id,originalTransactionId:newer.id,revision:0,ruleVersion:'synthetic-manual',outcome:'flagged',snapshot:{transaction:{categoryId:c.id,amount:'900.00',date:'2026-10-01'},assessment:{amount:{status:'flagged'}}}}});
  assert.equal((await req(u,'/anomaly/evaluations/'+ne.id+'/decisions',{dimension:'amount',action:'recurring',patternId:pid,revision:0,expectedDecisionId:null},randomUUID())).status,201);
  const latest=(await req(u,'/anomaly/patterns')).body.items[0].current;
  assert.equal(latest.snapshot.referenceMedian,'400.07');assert.equal(latest.snapshot.members.length,2);
  assert.equal((await req(u,'/anomaly/patterns')).body.items[0].validOccurrences,2);
  assert.equal((await req(u,'/anomaly/evaluations/'+evaluation.id+'/decisions',{dimension:'amount',action:'problem',revision:1,expectedDecisionId:created.body.decision.id},randomUUID())).status,201);
  assert.equal((await req(u,'/anomaly/patterns')).body.items[0].validOccurrences,1,'problem decision cannot count as a valid occurrence');
 });

 await t.test('baseline membership changes append new evaluation, old snapshot unchanged; edit/delete invalidate later rows',async()=>{
  const u=await user(),c=await category();
  await prisma.transaction.createMany({data:Array.from({length:30},(_,i)=>({userId:u.id,categoryId:c.id,type:'expense' as const,amount:'100',transactionDate:new Date(Date.UTC(2026,6,i+1))}))});
  const earlier=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'250',transactionDate:new Date('2026-08-01'),anomalyPending:true}});
  await checkTransactionAnomaly(u,earlier.id);
  const ev=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:earlier.id}});
  const later=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'200',transactionDate:new Date('2026-08-02'),anomalyPending:true}});
  await checkTransactionAnomaly(u,later.id);
  const original=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:later.id}});
  await withAnomalyLock(u,tx=>submitDecision(tx,u.id,ev.id,randomUUID(),{dimension:'amount',action:'normal',revision:ev.revision,expectedDecisionId:null}));
  assert.equal((await prisma.transaction.findUniqueOrThrow({where:{id:later.id}})).anomalyPending,true);
  await checkTransactionAnomaly(u,later.id);
  const versions=await prisma.anomalyEvaluation.findMany({where:{originalTransactionId:later.id}});
  assert.equal(versions.length,2);assert.notEqual(versions[0]!.ruleVersion,versions[1]!.ruleVersion);
  assert.deepEqual((await prisma.anomalyEvaluation.findUniqueOrThrow({where:{id:original.id}})).snapshot,original.snapshot);
  await prisma.transaction.delete({where:{id:earlier.id}});
  assert.equal((await prisma.transaction.findUniqueOrThrow({where:{id:later.id}})).anomalyPending,true);
  await checkTransactionAnomaly(u,later.id);assert.equal(await prisma.anomalyEvaluation.count({where:{originalTransactionId:later.id}}),3);
 });

 await t.test('chronological bootstrap keeps unscored prefix, excludes self/future and queues every flag beyond fifty',async()=>{
  const u=await user(),c=await category();
  const rows=await prisma.transaction.createManyAndReturn({data:Array.from({length:83},(_,i)=>({userId:u.id,categoryId:c.id,type:'expense' as const,amount:i<30?'100':'1000',transactionDate:new Date(Date.UTC(2025,0,i+1))}))});
  const target=await prisma.transaction.create({data:{userId:u.id,categoryId:c.id,type:'expense',amount:'100',transactionDate:new Date('2025-04-01'),anomalyPending:true}});
  assert.equal(await checkTransactionAnomaly(u,target.id),true);
  assert.equal(await prisma.anomalyEvaluation.count({where:{userId:u.id,outcome:'flagged'}}),53);
  const evaluations=await prisma.anomalyEvaluation.findMany({where:{userId:u.id}});
  for(const e of evaluations){const s=e.snapshot as any;assert.equal(s.window.endExclusive,s.transaction.date);assert.equal(s.baseline.n<84,true);}
  for(const r of rows.filter(r=>r.amount.eq(100))){const e=evaluations.find(e=>e.originalTransactionId===r.id)!;assert.equal((e.snapshot as any).assessment.amount.reasonCode,'global_gate_not_ready');assert.equal((e.snapshot as any).scores,null);}
  const final=evaluations.find(e=>e.originalTransactionId===target.id)!;assert.equal((final.snapshot as any).baseline.n,30);assert.equal(final.outcome,'not_flagged');
  // Before c87661f this asserted total 53. 30 days at 100 then 53 at 1000 is a level shift (ISSUE-ANOM-1), so the queue
  // now shows it once; covered=53 proves no flag was dropped. The expectation changed with the behaviour, not to pass.
  const q=(await req(u,'/anomaly/queue?filter=waiting')).body;assert.equal(q.total,1);assert.equal(q.items.length,0);assert.equal(q.levelShifts.length,1);assert.equal(q.levelShifts[0].covered,53);
 });

});
