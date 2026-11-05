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
 await Promise.all(['2026-08-04','2026-08-11','2026-08-18','2026-08-25'].map(d=>create(a.id,repeat.id,'55',d)));
 await t.test('weekly recurrence; a second near amount on one day suppresses the ambiguous group',async()=>{
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

 await t.test('PostgreSQL confirmed-null constraint and exact time bucket boundaries in both periods',async()=>{
  const owner=await account();
  // Use pg to verify the PostgreSQL SQLSTATE and constraint, not a Prisma validation error.
  const {Client}=await import('pg');
  const client=new Client({connectionString:process.env.DATABASE_URL!});
  await client.connect();
  try{
   const source=await create(owner.id,cat.id,'1.00',p.current.startDate);
   await assert.rejects(()=>client.query('UPDATE "Transaction" SET "transactionTimeConfirmed"=true WHERE id=$1',[source.id]),
    (e:any)=>e.code==='23514'&&e.constraint==='transaction_time_confirmed_check');
   const unchanged=await prisma.transaction.findUniqueOrThrow({where:{id:source.id}});
   assert.equal(unchanged.transactionTimeConfirmed,false);assert.equal(unchanged.transactionTime,null);
   // Keep the rejected source outside the measured period without deleting the evidence.
   await prisma.transaction.update({where:{id:source.id},data:{transactionDate:new Date('2020-01-01T00:00:00Z')}});
  }finally{await client.end();}
  const cases=[['03:59',0],['04:00',1],['07:59',1],['08:00',2],['23:59',5],[null,-1]] as const;
  for(const side of ['current','previous'] as const){
   await prisma.transaction.createMany({data:cases.map(([time],i)=>({
    userId:owner.id,categoryId:cat.id,type:'expense' as const,amount:String((i+1)*10),
    transactionDate:new Date(shiftDay(p[side].startDate,i)+'T00:00:00Z'),
    transactionTime:time?new Date('1970-01-01T'+time+':00Z'):null,transactionTimeConfirmed:time!==null
   }))});
  }
  const raw=await prisma.$transaction(tx=>behaviorInput(tx,owner.id,p,'2026-09-26'));
  for(const side of ['current','previous'] as const)for(const [i,[,bucket]] of cases.entries()){
   const row=raw.rows.find(r=>r.date===shiftDay(p[side].startDate,i))!;
   assert.equal(row.bucket,bucket);assert.equal(row.count,1);assert.equal(Number(row.amount),(i+1)*10);
  }
  const response=await req('/behavior'+q,owner);assert.equal(response.status,200);
  for(const side of ['current','previous'] as const){
   const v=response.data.facts.timeDistribution[side];
   assert.equal(v.confirmedCount,5);assert.equal(v.excludedCount,1);assert.equal(v.coveragePercent,'83.33');
   assert.deepEqual(v.buckets.map((b:any)=>b.transactionCount),[1,2,1,0,0,1]);
   assert.deepEqual(v.buckets.map((b:any)=>b.amount),['10.00','50.00','40.00','0.00','0.00','50.00']);
   assert.equal(response.data.facts.summary[side].amount,'210.00','unconfirmed expense stays in financial facts');
  }
 });
 await t.test('PostgreSQL recurrence 50/51 groups, tied counts ordering and hasMore',async()=>{
  const owner=await account(),cats=[await category(),await category()].sort((a,b)=>a.id<b.id?-1:1);
  const groups=Array.from({length:51},(_,i)=>({categoryId:cats[i<25?0:1]!.id,amount:(100*1.25**(i%25)).toFixed(2),days:4}));
  // Amounts are 25% apart, outside the 10% band, so every group stays a distinct item.
  groups[50]!.amount=(100*1.25**25).toFixed(2);
  const insert=async(selected:typeof groups)=>prisma.transaction.createMany({data:[...selected].reverse().flatMap(g=>
   Array.from({length:g.days},(_,i)=>({userId:owner.id,categoryId:g.categoryId,type:'expense' as const,amount:g.amount,transactionDate:new Date(shiftDay(p.current.startDate,i*7)+'T00:00:00Z')})))});
  await create(owner.id,cat.id,'0.01',p.current.endDate); // inclusive 30-day observed span; not a recurring group
  await insert(groups.slice(0,50));
  const key=(r:{categoryId:string|null;amount:string})=>r.categoryId+':'+Number(r.amount).toFixed(2);
  const expected=(selected:typeof groups)=>[...selected].sort((a,b)=>b.days-a.days||(a.categoryId<b.categoryId?-1:a.categoryId>b.categoryId?1:0)||Number(a.amount)-Number(b.amount)).map(key);
  for(const count of [50,51]){
   if(count===51)await insert(groups.slice(50));
   const raw=await prisma.$transaction(tx=>behaviorInput(tx,owner.id,p,'2026-09-26'));
   assert.equal(raw.recurrences.length,count);
   assert.deepEqual(raw.recurrences.map(key),expected(groups.slice(0,count)));
   assert(raw.recurrences.every(r=>r.counts.every(n=>n===1)));
   const response=await req('/behavior'+q,owner);assert.equal(response.status,200);
   assert.equal(response.data.readiness.current.ready,true);
   const facts=response.data.facts;
   assert.equal(facts.recurrenceCandidates.length,50);
   assert.equal(facts.recurrence.hasMore,count===51);assert.equal(facts.recurrence.limit,50);
   assert.deepEqual(facts.recurrenceCandidates.map(key),expected(groups.slice(0,count)).slice(0,50));
   assert(facts.recurrenceCandidates.every((r:any)=>r.kind==='weekly'));
   const again=await req('/behavior'+q,owner);
   assert.deepEqual(again.data.facts.recurrenceCandidates,facts.recurrenceCandidates,'repeat reads preserve tie ordering');
  }
 });


 await t.test('dedup before display cap preserves 51 independent weekly groups and same-group separate windows',async()=>{
  const owner=await account(),c=await category();
  await prisma.transaction.createMany({data:Array.from({length:51},(_,i)=>[0,7,14,21,28].map(d=>({userId:owner.id,categoryId:c.id,type:'expense' as const,amount:(100*1.25**i).toFixed(2),transactionDate:new Date(shiftDay(p.current.startDate,d)+'T00:00:00Z')}))).flat()});
  await create(owner.id,c.id,'0.01',p.current.endDate);
  const raw=await prisma.$transaction(tx=>behaviorInput(tx,owner.id,p,'2026-09-26'));
  assert.equal(raw.recurrences.length,51);assert(raw.recurrences.every(r=>r.kind==='weekly'));
  const v=buildBehavior(raw);assert.equal(v.facts.recurrenceCandidates.length,50);assert.equal(v.facts.recurrence.hasMore,true);
  assert(v.facts.recurrenceCandidates.every(r=>r.transactions.length===4&&r.occurrenceCount===4));
  const independent=await account();
  const period=behaviorPeriod({startDate:'2026-01-01',endDate:'2026-06-30'},'2026-09-26');
  for(let i=0;i<30;i++)await create(independent.id,c.id,String(500+i),shiftDay('2026-01-01',i*2));
  for(const date of ['2026-01-01','2026-01-03','2026-01-05','2026-01-07','2026-01-09','2026-02-01','2026-02-08','2026-02-15','2026-02-22','2026-04-15','2026-05-15','2026-06-15'])await create(independent.id,c.id,'69',date);
  const result=buildBehavior(await prisma.$transaction(tx=>behaviorInput(tx,independent.id,period,'2026-09-26')));
  assert.deepEqual(result.facts.recurrenceCandidates.filter(r=>Number(r.amount)===69).map(r=>r.kind).sort(),['general','monthly','weekly']);
 });
 await t.test('HTTP snapshot stays consistent when atomic CRUD commits between aggregate queries',async()=>{
  const original=prisma.$transaction.bind(prisma);
  for(const cut of [1,2]){
   const owner=await account(),oldCat=await category(),newCat=await category();
   await prisma.transaction.createMany({data:Array.from({length:60},(_,i)=>({userId:owner.id,categoryId:cat.id,type:'expense' as const,amount:'1.00',transactionDate:new Date(shiftDay(p.previous.startDate,i)+'T00:00:00Z')}))});
   const recurring=await Promise.all([0,7,14,21].map(i=>create(owner.id,oldCat.id,'10.00',shiftDay(p.current.startDate,i))));
   const before=await req('/behavior'+q,owner);assert.equal(before.status,200);
   let queries=0,committed=false,isolation:string|undefined;
   // Test-only interception: real SQL runs unchanged; a separate transaction commits at a known query boundary.
   (prisma as any).$transaction=(callback:any,options:any)=>{
    isolation=options?.isolationLevel;
    return original(async tx=>callback(new Proxy(tx,{
     get(target,property){
      if(property!=='$queryRaw')return Reflect.get(target,property);
      return async(...args:any[])=>{
       const result=await (target.$queryRaw as any)(...args);
       queries++;
       if(queries===cut){
        await original(async writer=>{
         await writer.transaction.delete({where:{id:recurring[0]!.id}});
         await writer.transaction.update({where:{id:recurring[1]!.id},data:{amount:'20.00',categoryId:newCat.id}});
         await writer.transaction.createMany({data:[1,8,15,22].map(i=>({userId:owner.id,categoryId:newCat.id,type:'expense' as const,amount:'30.00',transactionDate:new Date(shiftDay(p.current.startDate,i)+'T00:00:00Z')}))});
        });
        committed=true;
       }
       return result;
      };
     }
    })),options);
   };
   let during:Awaited<ReturnType<typeof req>>;
   try{during=await req('/behavior'+q,owner);}finally{(prisma as any).$transaction=original;}
   assert.equal(isolation,'RepeatableRead');assert.equal(queries,2);assert.equal(committed,true);
   assert.equal(during.status,200);assert.deepEqual(during.data,before.data,'both aggregates must retain the pre-CRUD snapshot');
   const after=await req('/behavior'+q,owner);assert.equal(after.status,200);
   assert.equal(after.data.facts.summary.current.amount,'190.00');
   assert.equal(after.data.facts.summary.current.transactionCount,37);
   assert(after.data.categoryOptions.some((c:any)=>c.categoryId===newCat.id));
   assert(!after.data.facts.recurrenceCandidates.some((c:any)=>c.categoryId===oldCat.id));
   assert(after.data.facts.recurrenceCandidates.some((c:any)=>c.categoryId===newCat.id&&c.amount==='30.00'));
   assert.notDeepEqual(after.data,before.data);
  }
 });
 await t.test('a server failure is logged in full and never reaches the client',async()=>{
  const original=prisma.$transaction.bind(prisma);
  Object.defineProperty(prisma,'$transaction',{configurable:true,value:async()=>{throw Error('secret-db-detail');}});
  const logged=t.mock.method(console,'error',()=>{});
  try{
   const r=await req();
   assert.equal(r.status,500);assert(!JSON.stringify(r.data).includes('secret-db-detail'));
   assert(logged.mock.calls.some(c=>String(c.arguments[1]).includes('secret-db-detail')));
  }finally{
   logged.mock.restore();
   Object.defineProperty(prisma,'$transaction',{configurable:true,value:original});
  }
 });
 await t.test('732-day PostgreSQL volume measurements with bounded aggregates at two row densities',async()=>{
  const owner=await account(),categories=await Promise.all(Array.from({length:8},()=>category()));
  const period=behaviorPeriod({startDate:'2024-01-01',endDate:'2024-12-31'},'2026-09-26');
  assert.equal(period.days,366);
  assert.equal(shiftDay(period.previous.startDate,731),period.current.endDate);
  const {Client}=await import('pg'),client=new Client({connectionString:process.env.DATABASE_URL!});
  await client.connect();
  try{
   for(const density of [1,2]){
    // Generate in PostgreSQL, so fixture arrays do not inflate Node memory measurements.
    await client.query(`
     INSERT INTO "Transaction" (id,"userId","categoryId",type,amount,"transactionDate","transactionTime","transactionTimeConfirmed","updatedAt")
     SELECT md5($1 || ':' || $4 || ':' || d || ':' || c || ':' || b),$1,c,'expense',1.25,
      $2::date+d,CASE WHEN b=6 THEN NULL ELSE make_time(b*4,0,0) END,b<>6,now()
     FROM generate_series(0,731) d CROSS JOIN unnest($3::text[]) c CROSS JOIN generate_series(0,6) b
    `,[owner.id,period.previous.startDate,categories.map(c=>c.id),String(density)]);
    const count=await prisma.transaction.count({where:{userId:owner.id}});
    assert.equal(count,732*8*7*density);
    const measurements=[];
    for(let round=0;round<3;round++){
     const memoryBefore=process.memoryUsage(),start=performance.now();
     const raw=await prisma.$transaction(tx=>behaviorInput(tx,owner.id,period,'2026-09-26'),{isolationLevel:'RepeatableRead'});
     const queried=performance.now(),memoryAfterQuery=process.memoryUsage();
     const result=buildBehavior(raw),built=performance.now(),memoryAfterBuild=process.memoryUsage();
     assert.equal(raw.rows.length,732*8*7);assert.equal(raw.categoryOptions.length,8);
     assert(raw.recurrences.length<=51);assert.equal(result.facts.daily.length,366);
     assert.equal(result.facts.summary.current.transactionCount,count/2);
     assert.equal(result.facts.summary.previous.transactionCount,count/2);
     assert.equal(result.facts.summary.current.amount,(count/2*1.25).toFixed(2));
     assert.equal(result.facts.summary.previous.amount,(count/2*1.25).toFixed(2));
     measurements.push({round,queryMs:+(queried-start).toFixed(2),buildMs:+(built-queried).toFixed(2),
      heapBefore:memoryBefore.heapUsed,heapAfterQuery:memoryAfterQuery.heapUsed,heapAfterBuild:memoryAfterBuild.heapUsed,
      rssAfterBuild:memoryAfterBuild.rss,responseBytes:Buffer.byteLength(JSON.stringify(result))});
    }
    const start=performance.now(),response=await req('/behavior?startDate=2024-01-01&endDate=2024-12-31',owner);
    const httpMs=performance.now()-start;assert.equal(response.status,200);
    assert.equal(response.data.facts.summary.current.amount,(count/2*1.25).toFixed(2));
    assert.equal(response.data.periods.days,366);
    assert.equal((await req('/behavior?startDate=2023-12-31&endDate=2024-12-31',owner)).status,400);
    console.log('BEHAVIOR_VOLUME '+JSON.stringify({days:732,categories:8,buckets:7,transactions:count,aggregateRows:40992,httpMs:+httpMs.toFixed(2),measurements}));
   }
  }finally{await client.end();}
 });
 await t.test('rolling general witnesses carry owned in-band transactions, duplicate days and before/after cutoff',async()=>{
  const owner=await account(),foreign=await account(),c=await category();
  const start='2026-01-01',end='2026-03-31';
  for(let i=0;i<30;i++)await create(owner.id,c.id,String(500+i),shiftDay(start,i*2));
  const evidence=[];
  for(const d of ['2026-01-01','2026-01-03','2026-01-05','2026-01-07','2026-01-30'])
    evidence.push(await create(owner.id,c.id,'69.00',d));
  evidence.push(await create(owner.id,c.id,'69.00','2026-01-03'));
  evidence.push(await create(owner.id,c.id,'69.01','2026-01-05')); // within 10% of the median: same item
  for(const offset of [0,2,4,6,30])await create(owner.id,c.id,'90.00',shiftDay(start,offset));
  for(const offset of [0,40,42,44,46,69])await create(owner.id,c.id,'120.00',shiftDay(start,offset));
  const hidden=await create(foreign.id,c.id,'69.00','2026-01-05');
  await create(owner.id,c.id,'69.00','2026-04-01');
  const v=(await req('/behavior?startDate='+start+'&endDate='+end,owner)).data;
  const r=v.facts.recurrenceCandidates.find((r:any)=>r.kind==='general'&&Number(r.amount)===69);
  assert(!v.facts.recurrenceCandidates.some((r:any)=>Number(r.amount)===90),'31-day general witness rejected');
  const late=v.facts.recurrenceCandidates.find((r:any)=>Number(r.amount)===120);
  assert.equal(late.startDate,'2026-02-10');assert.equal(late.endDate,'2026-03-11');
  assert(r);assert.equal(r.distinctDays,5);assert.equal(r.occurrenceCount,7);
  assert.deepEqual(r.transactions.map((t:any)=>t.id).sort(),evidence.map(t=>t.id).sort());
  assert.equal(r.startDate,'2026-01-01');assert.equal(r.endDate,'2026-01-30');
  assert(r.transactions.every((t:any)=>t.time===null&&t.id!==hidden.id&&Number(t.amount)>=69&&Number(t.amount)<=69.01));
  for(const f of v.findings){
    assert(Array.isArray(f.evidence.transactions));assert(f.evidence.startDate);assert(f.evidence.endDate);
  }
 });
 await t.test('SQL aggregates with evidence references, no Goal/Review reads; FK retains category integrity',async()=>{
  const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}),log:[{emit:'event',level:'query'}]});const queries:string[]=[];client.$on('query',e=>queries.push(e.query));
  try{const value=await client.$transaction(tx=>behaviorInput(tx,a.id,p,'2026-09-26'),{isolationLevel:'RepeatableRead'});assert.equal(buildBehavior(value).readiness.comparisonReady,true);}finally{await client.$disconnect();}
  const reads=queries.filter(q=>/FROM "Transaction"/.test(q));assert.equal(reads.length,2);
  for(const q of reads){assert.match(q,/GROUP BY/);assert.match(q,/LEFT JOIN "Category"/);assert.match(q,/"userId"/);assert.match(q,/"transactionDate">=/);assert.match(q,/"transactionDate"</);}
  assert(!queries.some(q=>/GoalLedgerEntry|AnomalyReview/.test(q)));
  await assert.rejects(()=>create(a.id,randomUUID(),'1','2026-08-01'),(e:any)=>e.code==='P2003');
  console.log('BEHAVIOR_SQL: 2 user/expense/date-bounded reads; aggregates include minimal evidence references; recurrence searched in Node; no Goal/Review reads');
 });
});
