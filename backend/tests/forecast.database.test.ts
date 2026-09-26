import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { forecastInput,buildForecast,shiftDay } from '../src/lib/expenseForecast';
import { bangkokToday } from '../src/lib/goalCalculations';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('ISOLATED_FORECAST_DATABASE_REQUIRED');
test('Forecast HTTP/PostgreSQL ownership, query shape, no mutation and CRUD',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const a=await account(),b=await account(),today=bangkokToday();
 const cat=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),other=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),income=await prisma.category.create({data:{name:randomUUID(),type:'income'}});
 const req=async(path='/forecast',who=a,method='GET',body?:unknown)=>{const r=await fetch('http://127.0.0.1:'+addr.port+path,{method,headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {status:r.status,cache:r.headers.get('cache-control'),data:await r.json() as any};};
 await t.test('HTTP auth/strict query/empty forecast',async()=>{
  assert.equal((await fetch('http://127.0.0.1:'+addr.port+'/forecast')).status,401);
  for(const q of ['userId='+b.id,'cutoffDate=2024-01-01','month=2024-01','horizon=7'])assert.equal((await req('/forecast?'+q)).status,400);
  const v=await req();assert.equal(v.data.status,'unavailable');assert.equal(v.data.summary.sevenDayForecastTotal,null);assert.equal(v.cache,'private, no-store');
 });
 const create=(userId:string,categoryId:string,amount:string,date:string,type:'expense'|'income'='expense')=>prisma.transaction.create({data:{userId,categoryId,type,amount,transactionDate:new Date(date+'T00:00:00Z')}});
 await prisma.transaction.createMany({data:Array.from({length:42},(_,i)=>({userId:a.id,categoryId:cat.id,type:'expense' as const,amount:'100.00',transactionDate:new Date(shiftDay(today,i-42)+'T00:00:00Z')}))});
 await create(b.id,cat.id,'999999',shiftDay(today,-1));await create(a.id,income.id,'999999',today,'income');
 await prisma.profile.create({data:{userId:a.id,income:'999999'}});await create(a.id,cat.id,'999999',shiftDay(today,1));
 await t.test('own expense only, future excluded, no write, exact aggregation',async()=>{
  const before={transactions:await prisma.transaction.count(),evaluations:await prisma.anomalyEvaluation.count(),notifications:await prisma.notification.count(),budgets:await prisma.budget.count()};
  const v=(await req()).data;assert.equal(v.status,'available');assert.equal(v.summary.sevenDayForecastTotal,'700.00');assert.equal(v.budgetComparison,null);
  assert.equal((await req('/forecast',b)).data.status,'unavailable');
  assert.deepEqual({transactions:await prisma.transaction.count(),evaluations:await prisma.anomalyEvaluation.count(),notifications:await prisma.notification.count(),budgets:await prisma.budget.count()},before);
 });
 const todayRow=await create(a.id,other.id,'0.07',today);
 await t.test('partial new category, budget lookup, live today and no double subtraction',async()=>{
  await prisma.budget.create({data:{userId:a.id,year:Number(today.slice(0,4)),month:Number(today.slice(5,7)),amount:'99999'}});
  const v=(await req()).data;assert.equal(v.status,'partial');assert.equal(v.budgetComparison.status,'partial_cannot_conclude');assert.equal(v.categories.find((c:any)=>c.categoryId===other.id).daily,null);
  assert.equal(v.summary.previousSevenDayActualComparableCategories,'700.00');
 });
 await t.test('actual Transaction update category/type/date and delete refresh forecast',async()=>{
  const edit=await req('/transactions/'+todayRow.id,a,'PUT',{categoryId:cat.id,type:'expense',amount:'0.08',transactionDate:shiftDay(today,-1),transactionTime:null});
  assert.equal(edit.status,200);let v=(await req()).data;assert.equal(v.coverage.unavailableCategories,0);
  const change=await req('/transactions/'+todayRow.id,a,'PUT',{categoryId:income.id,type:'income',amount:'0.08',transactionDate:today,transactionTime:null});assert.equal(change.status,200);
  assert.equal((await req()).data.summary.sevenDayForecastTotal,'700.00');
  assert.equal((await req('/transactions/'+todayRow.id,a,'DELETE')).status,200);
 });
 await t.test('review states do not remove genuine expense; SQL is bounded category/day aggregate',async()=>{
  const row=await prisma.transaction.findFirstOrThrow({where:{userId:a.id,type:'expense',transactionDate:{lt:new Date(today+'T00:00:00Z')}}});
  const evaluation=await prisma.anomalyEvaluation.create({data:{userId:a.id,originalTransactionId:row.id,revision:row.anomalyRevision,ruleVersion:'synthetic-forecast-invariance',outcome:'flagged',snapshot:{}}});
  await prisma.anomalyReview.create({data:{userId:a.id,originalTransactionId:row.id,evaluationId:evaluation.id,revision:row.anomalyRevision,action:'confirmed_problem',sequence:1}});
  assert.equal((await req()).data.summary.sevenDayForecastTotal,'700.00');
  const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}),log:[{emit:'event',level:'query'}]});const queries:string[]=[];client.$on('query',e=>queries.push(e.query));
  try{const input=await client.$transaction(tx=>forecastInput(tx,a.id,today),{isolationLevel:'RepeatableRead'});assert.equal(buildForecast(input).summary.sevenDayForecastTotal,'700.00');}finally{await client.$disconnect();}
  const reads=queries.filter(q=>/FROM\s+"(?:public"\.")?Transaction"/i.test(q));assert.equal(reads.length,1);assert.match(reads[0]!,/GROUP BY/);assert.match(reads[0]!,/userId/);assert.match(reads[0]!,/transactionDate/);assert.match(reads[0]!,/type/);
  assert(!queries.some(q=>/GoalLedgerEntry|AnomalyReview/.test(q)));
  console.log('FORECAST_SQL: one user/type/date-filtered category/day GROUP BY; no full-row history or ledger read');
 });
});
