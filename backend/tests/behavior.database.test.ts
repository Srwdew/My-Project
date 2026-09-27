import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { behaviorInput,buildBehavior } from '../src/lib/behavior';
import { behaviorPeriod,shiftDay } from '../src/lib/behaviorRules';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('ISOLATED_BEHAVIOR_DATABASE_REQUIRED');

test('Behavior real HTTP/PostgreSQL query/auth/conservation/CRUD with synthetic owned accounts',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const a=await account(),b=await account();
 const category=async()=>prisma.category.create({data:{name:randomUUID(),type:'expense'}});
 const cat=await category(),repeat=await category(),minor=await category(),income=await prisma.category.create({data:{name:randomUUID(),type:'income'}});
 const q='?startDate=2026-08-01&endDate=2026-08-30',p=behaviorPeriod({startDate:'2026-08-01',endDate:'2026-08-30'},'2026-09-26');
 const req=async(path='/behavior'+q,who=a,method='GET',body?:unknown)=>{const r=await fetch('http://127.0.0.1:'+addr.port+path,{method,headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json() as any};};
 await t.test('auth validation empty and foreign parameters rejected',async()=>{
  assert.equal((await fetch('http://127.0.0.1:'+addr.port+'/behavior')).status,401);
  for(const suffix of ['&userId='+b.id,'&startDate=2026-08-01','&categoryId=a','&extra=x'])assert.equal((await req('/behavior'+q+suffix)).status,400);
  assert.equal((await req('/behavior?startDate=2026-02-30&endDate=2026-03-01')).status,400);
  const v=await req();assert.equal(v.status,200);assert.equal(v.cache,'private, no-store');assert.equal(v.data.status,'no_data');assert.equal(v.data.facts.summary.comparison,null);
 });
 await prisma.transaction.createMany({data:Array.from({length:60},(_,i)=>({userId:a.id,categoryId:cat.id,type:'expense' as const,amount:'100.00',transactionDate:new Date(shiftDay(p.previous.startDate,i)+'T00:00:00Z'),transactionTime:new Date('1970-01-01T12:00:00Z'),transactionTimeConfirmed:true}))});
 const create=(userId:string,categoryId:string,amount:string,date:string,type:'expense'|'income'='expense')=>prisma.transaction.create({data:{userId,categoryId,type,amount,transactionDate:new Date(date+'T00:00:00Z')}});
 await create(b.id,cat.id,'999999','2026-08-01');await create(a.id,income.id,'999999','2026-08-01','income');await create(a.id,cat.id,'999999','2026-08-31');await create(a.id,cat.id,'999999','2026-07-01');
 await prisma.profile.create({data:{userId:a.id,income:'999999'}});
 await t.test('only scoped expenses, both ready, exact daily/category totals and confirmed time',async()=>{
  const v=(await req()).data;assert.equal(v.status,'comparable');assert.equal(v.facts.summary.current.amount,'3000.00');assert.equal(v.facts.summary.previous.amount,'3000.00');
  assert.equal(v.facts.summary.current.transactionCount,30);assert.equal(v.facts.timeDistribution.current.coveragePercent,'100.00');
  assert.equal(v.facts.daily.length,30);assert.equal(v.facts.daily[0].current.date,'2026-08-01');assert.equal(v.facts.daily[0].previous.date,'2026-07-02');
  assert.equal((await req('/behavior'+q,b)).data.readiness.comparisonReady,false);
 });
 const cents=await create(a.id,minor.id,'0.07','2026-08-01');await create(a.id,minor.id,'0.01','2026-08-01');
 await t.test('minor category recalculates readiness; cents; no manufactured comparison',async()=>{
  const v=(await req('/behavior'+q+'&categoryId='+minor.id)).data;assert.equal(v.facts.summary.current.amount,'0.08');assert.equal(v.readiness.current.ready,false);
  assert.equal(v.facts.summary.comparison,null);assert(v.facts.categories.every((c:any)=>c.comparison===null));assert(!v.findings.some((f:any)=>f.scope==='comparison'));
  assert.equal((await req('/behavior'+q+'&categoryId=uncategorized')).data.status,'no_data');
  assert.equal((await req('/behavior'+q+'&categoryId='+randomUUID())).data.status,'no_data');
 });
 await Promise.all(['2026-08-04','2026-08-11','2026-08-18'].map(d=>create(a.id,repeat.id,'55',d)));
 await t.test('SQL exact recurrence; duplicates suppress ambiguous recurring group',async()=>{
  let v=(await req()).data;assert(v.facts.recurrenceCandidates.some((r:any)=>r.categoryId===repeat.id&&r.kind==='weekly'));
  await create(a.id,repeat.id,'55','2026-08-11');v=(await req()).data;assert(!v.facts.recurrenceCandidates.some((r:any)=>r.categoryId===repeat.id));
 });
 await t.test('CRUD refresh with category/type/date changes and cross-account denial',async()=>{
  assert.equal((await req('/transactions/'+cents.id,b,'DELETE')).status,404);
  assert.equal((await req('/transactions/'+cents.id,a,'PUT',{categoryId:cat.id,type:'expense',amount:'0.08',transactionDate:'2026-07-20',transactionTime:null})).status,200);
  let v=(await req()).data;assert.equal(v.facts.summary.previous.amount,'3000.08');
  assert.equal((await req('/transactions/'+cents.id,a,'PUT',{categoryId:income.id,type:'income',amount:'0.08',transactionDate:'2026-07-20',transactionTime:null})).status,200);
  assert.equal((await req()).data.facts.summary.previous.amount,'3000.00');
  assert.equal((await req('/transactions/'+cents.id,a,'DELETE')).status,200);
 });
 await t.test('flagged/pending/confirmed_problem still included; GET changes no financial records',async()=>{
  const row=await prisma.transaction.findFirstOrThrow({where:{userId:a.id,categoryId:cat.id,transactionDate:new Date('2026-08-01T00:00:00Z')}});
  const before=(await req()).data.facts.summary.current.amount;
  await prisma.transaction.update({where:{id:row.id},data:{anomalyPending:true}});
  const evaluation=await prisma.anomalyEvaluation.create({data:{userId:a.id,originalTransactionId:row.id,revision:row.anomalyRevision,ruleVersion:'behavior-synthetic-invariance',outcome:'flagged',snapshot:{}}});
  await prisma.anomalyReview.create({data:{userId:a.id,originalTransactionId:row.id,evaluationId:evaluation.id,revision:row.anomalyRevision,action:'confirmed_problem',sequence:1}});
  const counts=async()=>[await prisma.transaction.count(),await prisma.notification.count(),await prisma.budget.count(),await prisma.goalLedgerEntry.count(),await prisma.anomalyEvaluation.count()];
  const prior=await counts();assert.equal((await req()).data.facts.summary.current.amount,before);assert.deepEqual(await counts(),prior);
 });

 await t.test('PostgreSQL monthly/leap/end-of-month recurrence and unconfirmed time omitted',async()=>{
  const monthly=await category();
  await Promise.all(['2024-01-31','2024-02-29','2024-03-31'].map(d=>create(a.id,monthly.id,'20',d)));
  const r=await req('/behavior?startDate=2024-01-01&endDate=2024-03-31');
  assert.equal(r.status,200); // Main readiness gates candidates despite a raw three-row cadence.
  assert.equal(r.data.facts.recurrenceCandidates.length,0);
  await prisma.transaction.createMany({data:Array.from({length:30},(_,i)=>({userId:a.id,categoryId:cat.id,type:'expense' as const,amount:'1.00',transactionDate:new Date(shiftDay('2024-01-01',i)+'T00:00:00Z')}))});
  const v=(await req('/behavior?startDate=2024-01-01&endDate=2024-03-31')).data;
  assert(v.facts.recurrenceCandidates.some((r:any)=>r.categoryId===monthly.id&&r.kind==='monthly'));
  assert.equal(v.facts.timeDistribution.current.confirmedCount,0);
  assert.equal(v.facts.summary.current.amount,'90.00');
 });
 await t.test('bounded SQL aggregates, no raw history/Goal/Review reads; FK retains category integrity',async()=>{
  const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}),log:[{emit:'event',level:'query'}]});const queries:string[]=[];client.$on('query',e=>queries.push(e.query));
  try{const value=await client.$transaction(tx=>behaviorInput(tx,a.id,p,'2026-09-26'),{isolationLevel:'RepeatableRead'});assert.equal(buildBehavior(value).readiness.comparisonReady,true);}finally{await client.$disconnect();}
  const reads=queries.filter(q=>/FROM "Transaction"/.test(q));assert.equal(reads.length,3);
  for(const q of reads){assert.match(q,/GROUP BY/);assert.match(q,/LEFT JOIN "Category"/);assert.match(q,/"userId"/);assert.match(q,/"transactionDate">=/);assert.match(q,/"transactionDate"</);}
  assert.match(reads[2]!,/LIMIT/);assert(!queries.some(q=>/GoalLedgerEntry|AnomalyReview/.test(q)));
  await assert.rejects(()=>create(a.id,randomUUID(),'1','2026-08-01'),(e:any)=>e.code==='P2003');
  console.log('BEHAVIOR_SQL: 3 user/expense/date-bounded aggregates; orphan fallback LEFT JOIN; recurrence LIMIT51; no raw transaction history');
 });
});
