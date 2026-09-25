import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {Client} from 'pg';
import {prisma} from '../src/lib/prisma';
import {app} from '../src/index';
import {anomalyBaseline,withAnomalyLock} from '../src/lib/anomaly';
import {baselineEligibility,submitReview} from '../src/lib/anomalyReview';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_')||db!==process.env.GOALS_TEST_DATABASE)throw Error('Isolated review database required');

test('Anomaly review HTTP, PostgreSQL eligibility and committed concurrency',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const user=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'unusable-synthetic'}});return {...u,userId:u.id,token:jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!)};};
 const a=await user(),b=await user();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 async function req(path:string,method='GET',body?:unknown,who=a,key?:string){const response=await fetch('http://127.0.0.1:'+address.port+path,{method,headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:response.status,body:await response.json() as any};}
 const review=(id:string,revision:number,action:string,sequence:number,key=randomUUID(),who=a)=>req('/anomaly/evaluations/'+id+'/reviews','POST',{action,revision,expectedReviewSequence:sequence},who,key);
 async function fixture(outcome:string|null='flagged',confirmed=true,reason='amount_modified_z'){
  const category=await prisma.category.create({data:{name:randomUUID(),type:'expense'}});
  const row=await prisma.transaction.create({data:{userId:a.id,categoryId:category.id,type:'expense',amount:'0.07',transactionDate:new Date('2026-09-01'),transactionTime:confirmed?new Date('1970-01-01T12:00:00Z'):null,transactionTimeConfirmed:confirmed,anomalyRevision:1}});
  const evaluation=outcome?await prisma.anomalyEvaluation.create({data:{userId:a.id,originalTransactionId:row.id,revision:1,ruleVersion:'synthetic-review-v1',outcome,snapshot:{assessment:{amount:{reasonCode:reason}},synthetic:true}}}):null;
  const target=await prisma.transaction.create({data:{userId:a.id,categoryId:category.id,type:'expense',amount:'1.00',transactionDate:new Date('2026-09-20')}});
  return {row,evaluation,target};
 }
 async function check(f:Awaited<ReturnType<typeof fixture>>,amount:boolean,time:boolean){
  const eligibility=await prisma.$transaction(tx=>baselineEligibility(tx,a.id,f.row.id));
  assert.equal(eligibility.amountBaselineEligible,amount);assert.equal(eligibility.timeBaselineEligible,time);
  const baseline=await prisma.$transaction(tx=>anomalyBaseline(tx,f.target));
  assert.equal(baseline.baseline.n,amount?1:0);assert.equal(baseline.baseline.timeN,time?1:0);
 }
 await t.test('pending, cold start, nonflagged and unconfirmed time use the same DB eligibility as detail',async()=>{
  const legacy=await fixture(null,false);await check(legacy,true,false);
  const pending=await fixture(null,true);await prisma.transaction.update({where:{id:pending.row.id},data:{anomalyPending:true}});await check(pending,false,false);
  await check(await fixture('not_flagged'),true,true);
  await check(await fixture('not_evaluated',false,'amount_insufficient_history'),true,false);
  await check(await fixture('not_evaluated',false,'amount_zero_iqr_nonconstant'),false,false);
 });
 await t.test('flagged review lifecycle, notification read does not review, immutable snapshots',async()=>{
  const f=await fixture();await check(f,false,false);
  const n=await prisma.notification.create({data:{userId:a.id,type:'transaction_anomaly',title:'synthetic',message:'synthetic',sourceId:f.evaluation!.id,eventKey:'transaction-anomaly:'+f.row.id}});
  const snapshot=JSON.stringify(f.evaluation!.snapshot);
  assert.equal((await req('/notifications/'+n.id+'/read','PATCH')).status,200);await check(f,false,false);
  assert.equal((await req('/notifications/'+n.id+'/anomaly')).body.reviewState,'unreviewed');
  assert.equal((await review(f.evaluation!.id,1,'confirmed_normal',0)).status,201);await check(f,true,true);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',1)).status,201);await check(f,false,false);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_normal',2)).status,201);await check(f,true,true);
  assert.equal(JSON.stringify((await prisma.anomalyEvaluation.findUniqueOrThrow({where:{id:f.evaluation!.id}})).snapshot),snapshot);
  assert.equal((await prisma.notification.findUniqueOrThrow({where:{id:n.id}})).message,'synthetic');
  const detail=(await req('/notifications/'+n.id+'/anomaly')).body;assert.equal(detail.reviewState,'confirmed_normal');assert.equal(detail.currentRevision,1);assert.equal(detail.reviewHistory.items.length,3);
 });
 await t.test('problem overrides nonflagged; normal cannot invent confirmed time',async()=>{
  const f=await fixture('not_flagged',false);await check(f,true,false);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',0)).status,201);await check(f,false,false);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_normal',1)).status,201);await check(f,true,false);
 });
 await t.test('idempotency persists no-op keys through later changes and validates payload',async()=>{
  const f=await fixture(),key=randomUUID(),noOpKey=randomUUID();
  const first=await review(f.evaluation!.id,1,'confirmed_normal',0,key);assert.equal(first.status,201);
  assert.deepEqual(await review(f.evaluation!.id,1,'confirmed_normal',0,key),first);
  const noOp=await review(f.evaluation!.id,1,'confirmed_normal',0,noOpKey);assert.equal(noOp.status,200);assert.equal(noOp.body.review.id,first.body.review.id);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',1)).status,201);
  assert.deepEqual(await review(f.evaluation!.id,1,'confirmed_normal',0,noOpKey),noOp);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',0,key)).status,409);
  assert.equal((await review(f.evaluation!.id,2,'confirmed_normal',0,key)).status,409);
  const other=await fixture();assert.equal((await review(other.evaluation!.id,1,'confirmed_normal',0,key)).status,409);
  assert.equal(await prisma.anomalyReview.count({where:{originalTransactionId:f.row.id}}),2);await check(f,false,false);
 });
 await t.test('concurrent opposite actions conflict; concurrent duplicate action and key append once',async()=>{
  const f=await fixture();const responses=await Promise.all([review(f.evaluation!.id,1,'confirmed_normal',0),review(f.evaluation!.id,1,'confirmed_problem',0)]);
  assert.deepEqual(responses.map(x=>x.status).sort(),[201,409]);assert.equal(await prisma.anomalyReview.count({where:{originalTransactionId:f.row.id}}),1);
  const same=await fixture(),key=randomUUID();const results=await Promise.all([review(same.evaluation!.id,1,'confirmed_normal',0,key),review(same.evaluation!.id,1,'confirmed_normal',0,key)]);assert.deepEqual(results[0],results[1]);
  assert.equal(await prisma.anomalyReview.count({where:{originalTransactionId:same.row.id}}),1);
 });
 await t.test('append-only triggers, identity, ownership, validation and cursor pagination',async()=>{
  const f=await fixture();const first=await review(f.evaluation!.id,1,'confirmed_normal',0);const id=first.body.review.id;
  await assert.rejects(prisma.anomalyReview.update({where:{id},data:{action:'confirmed_problem'}}));await assert.rejects(prisma.anomalyReview.delete({where:{id}}));
  const receipt=await prisma.anomalyReviewRequest.findFirstOrThrow({where:{reviewId:id}});
  await assert.rejects(prisma.anomalyReviewRequest.update({where:{userId_idempotencyKey:{userId:a.id,idempotencyKey:receipt.idempotencyKey}},data:{responseStatus:200}}));
  await assert.rejects(prisma.anomalyReviewRequest.delete({where:{userId_idempotencyKey:{userId:a.id,idempotencyKey:receipt.idempotencyKey}}}));
  await assert.rejects(prisma.anomalyReview.create({data:{userId:b.id,evaluationId:f.evaluation!.id,originalTransactionId:f.row.id,revision:1,action:'confirmed_normal',sequence:1}}));
  await assert.rejects(prisma.anomalyReview.create({data:{userId:a.id,evaluationId:f.evaluation!.id,originalTransactionId:randomUUID(),revision:1,action:'confirmed_problem',sequence:2}}));
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',1,randomUUID(),b)).status,404);
  assert.equal((await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews','GET',undefined,b)).status,404);
  assert.equal((await review(f.evaluation!.id,2,'confirmed_problem',1)).status,409);
  assert.equal((await review(f.evaluation!.id,1,'confirmed_normal',900)).status,409);
  assert.equal((await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews','POST',{action:'confirmed_normal',revision:1,expectedReviewSequence:1,userId:a.id},a,randomUUID())).status,400);
  assert.equal((await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews','POST',{action:'confirmed_normal',revision:1,expectedReviewSequence:1})).status,400);
  await review(f.evaluation!.id,1,'confirmed_problem',1);await review(f.evaluation!.id,1,'confirmed_normal',2);
  const page=(await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews?limit=1')).body;assert.equal(page.reviewHistory.items[0].sequence,3);assert.equal(page.reviewHistory.nextCursor,3);
  const next=(await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews?limit=1&cursor=3')).body;assert.equal(next.reviewHistory.items[0].sequence,2);
 });
 await t.test('real Transaction edit resets review scope, nonflagged returns automatically, flagged waits',async()=>{
  const cat=await prisma.category.create({data:{name:randomUUID(),type:'expense'}});
  await prisma.anomalyNotificationSetting.upsert({where:{userId:a.id},create:{userId:a.id,enabled:true},update:{enabled:true}});
  await prisma.transaction.createMany({data:Array.from({length:30},(_,i)=>({userId:a.id,categoryId:cat.id,type:'expense' as const,amount:'100',transactionDate:new Date(Date.UTC(2026,7,i+1))}))});
  const input={type:'expense',categoryId:cat.id,amount:'250',transactionDate:'2026-09-01',transactionTime:null};
  const created=await req('/transactions','POST',input);assert.equal(created.status,201);const id=created.body.id;
  const old=(await req('/transactions/'+id+'/anomaly')).body.latestEvaluation;assert.equal(old.outcome,'flagged');await review(old.id,1,'confirmed_problem',0);
  assert.equal((await req('/transactions/'+id,'PUT',{...input,amount:'100'})).status,200);
  const next=(await req('/transactions/'+id+'/anomaly')).body;assert.equal(next.latestEvaluation.outcome,'not_flagged');assert.equal(next.currentRevision,2);assert.equal(next.amountBaselineEligible,true);
  await review(old.id,1,'confirmed_normal',1);assert.equal((await req('/transactions/'+id+'/anomaly')).body.amountBaselineEligible,true);
  await req('/transactions/'+id,'PUT',{...input,amount:'400'});const last=(await req('/transactions/'+id+'/anomaly')).body;assert.equal(last.latestEvaluation.revision,3);assert.equal(last.amountBaselineEligible,false);
  assert.equal((await req('/anomaly/evaluations/'+last.latestEvaluation.id+'/reviews')).body.reviewState,'unreviewed');
  await review(old.id,1,'confirmed_problem',2);await review(old.id,1,'confirmed_normal',3);
  assert.equal((await req('/transactions/'+id+'/anomaly')).body.amountBaselineEligible,false);
  assert.equal(await prisma.notification.count({where:{userId:a.id,eventKey:'transaction-anomaly:'+id}}),1);
 });
 await t.test('deleted source retains evidence and can be reviewed; income excluded',async()=>{
  const f=await fixture();await review(f.evaluation!.id,1,'confirmed_normal',0);
  await prisma.transaction.update({where:{id:f.row.id},data:{type:'income'}});await check(f,false,false);
  await prisma.transaction.delete({where:{id:f.row.id}});
  assert.equal((await review(f.evaluation!.id,1,'confirmed_problem',1)).status,201);await check(f,false,false);
  assert.equal((await req('/anomaly/evaluations/'+f.evaluation!.id+'/reviews')).body.reviewHistory.items.length,2);
 });
 await t.test('authVersion checked after waiting for user lock, no review after revocation',async()=>{
  const c=await user();const category=await prisma.category.create({data:{name:randomUUID(),type:'expense'}});const row=await prisma.transaction.create({data:{userId:c.id,categoryId:category.id,type:'expense',amount:'1',transactionDate:new Date('2026-09-01')}});
  const e=await prisma.anomalyEvaluation.create({data:{userId:c.id,originalTransactionId:row.id,revision:0,ruleVersion:'synthetic',outcome:'not_flagged',snapshot:{}}});
  const lock=new Client({connectionString:process.env.DATABASE_URL});await lock.connect();try{await lock.query('BEGIN');await lock.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[c.id]);
   const attempt=withAnomalyLock(c,tx=>submitReview(tx,c.id,e.id,randomUUID(),{action:'confirmed_problem',revision:0,expectedReviewSequence:0}));const rejected=assert.rejects(attempt);
   let waited=false;
   for(let i=0;i<200;i++){
    const waiting=await lock.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE%'");
    if(waiting.rows[0].n>0){waited=true;break;}
    await new Promise(r=>setTimeout(r,10));
   }
   assert.equal(waited,true,'another connection must actually wait on the user lock');
   await lock.query('UPDATE "User" SET "authVersion"=1 WHERE id=$1',[c.id]);await lock.query('COMMIT');await rejected;
  }finally{await lock.end();}
  assert.equal(await prisma.anomalyReview.count({where:{userId:c.id}}),0);
 });
});