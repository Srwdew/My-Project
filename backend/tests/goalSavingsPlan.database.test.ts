import { assessSavingsPlan } from '../src/lib/goalSavingsPlan';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { goalsRouter } from '../src/routes/goals';
import { forecastRouter } from '../src/routes/forecast';
import { bangkokToday } from '../src/lib/goalCalculations';
import { lastCompletedMonth } from '../src/lib/goalFeasibility';
import { loadCycleContext } from '../src/lib/cycle';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_plan_test_') || process.env.GOALS_TEST_DATABASE!==db) throw Error('Explicit isolated test database required');
test('Existing Goals HTTP endpoints include read-only backend assessment',async t=>{
 const actualDb=await prisma.$queryRaw<{name:string}[]> `SELECT current_database() AS name`;assert.equal(actualDb[0]!.name,db);
 const app=express();app.use(express.json());app.use(goalsRouter);app.use(forecastRouter);
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const address=server.address();assert.ok(address&&typeof address!=='string');
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const a=await account(),b=await account(),today=bangkokToday(),month=today.slice(0,7),period=lastCompletedMonth(await loadCycleContext(prisma,a.id),today);
 const call=async(path:string,body?:unknown,who=a,status=200)=>{const response=await fetch('http://127.0.0.1:'+address.port+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});assert.equal(response.status,status,path);if(status===200)assert.match(response.headers.get('cache-control')??'',/private, no-store/);return response.json() as Promise<any>;};
 const assess=(who=a,assumptions:unknown={})=>prisma.$transaction(tx=>assessSavingsPlan(tx,who.id,today,assumptions),{isolationLevel:'RepeatableRead'});
 await t.test('unauthenticated rejected; empty amounts are null',async()=>{
  assert.equal((await fetch('http://127.0.0.1:'+address.port+'/goals/plan')).status,401);
  const p=(await assess()).plan;assert.equal(p.income,null);assert.equal(p.budgetAmount,null);assert.equal(p.difference,null);assert.equal(p.status,'unavailable');
 });
 await prisma.profile.create({data:{userId:a.id,income:'2000'}});
 await prisma.budget.create({data:{userId:a.id,year:Number(month.slice(0,4)),month:Number(month.slice(5)),amount:'1000'}});
 const expense=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),income=await prisma.category.create({data:{name:randomUUID(),type:'income'}});
 await prisma.categoryBudget.create({data:{userId:a.id,categoryId:expense.id,year:Number(month.slice(0,4)),month:Number(month.slice(5)),amount:'999'}});
 const goal=await prisma.goal.create({data:{userId:a.id,name:'A',targetAmount:'800',targetDate:new Date(today),categoryKey:'other'}});
 await prisma.goal.create({data:{userId:a.id,name:'B',targetAmount:'800',targetDate:new Date(today),categoryKey:'other'}});
 const foreign=await prisma.goal.create({data:{userId:b.id,name:'foreign',targetAmount:'99999',categoryKey:'other'}});
 await prisma.transaction.createMany({data:[{userId:a.id,type:'income',categoryId:income.id,amount:'2000',transactionDate:new Date(period.startDate)},{userId:a.id,type:'expense',categoryId:expense.id,amount:'1200',transactionDate:new Date(period.endDate)},{userId:b.id,type:'income',categoryId:income.id,amount:'99999',transactionDate:new Date(period.startDate)}]});
 const fingerprint=async()=>JSON.stringify(await Promise.all([prisma.user.findMany({orderBy:{id:'asc'}}),prisma.profile.findMany({orderBy:{id:'asc'}}),prisma.transaction.findMany({orderBy:{id:'asc'}}),prisma.goal.findMany({orderBy:{id:'asc'}}),prisma.budget.findMany({orderBy:{id:'asc'}}),prisma.categoryBudget.findMany({orderBy:{id:'asc'}}),prisma.goalLedgerEntry.findMany({orderBy:{id:'asc'}}),prisma.goalOperation.findMany({orderBy:{id:'asc'}}),prisma.notification.findMany({orderBy:{id:'asc'}})]));
 await t.test('UI-only plan routes remain removed; original Goal response adds nested assessment',async()=>{
  assert.equal(goalsRouter.stack.some((l:any)=>l.route?.path==='/goals/plan'||l.route?.path==='/goals/plan/preview'),false);
  const list=await call('/goals');assert.equal('plan' in list,false);assert.equal('forecastSignal' in list,false);assert.ok(list.assessment.plan);assert.ok(list.assessment.forecastSignal);
 });
 const before=await fingerprint();
 await t.test('previous-month actuals unchanged; category budget not doubled; all goals independent of pagination',async()=>{
  const view=await assess();assert.equal(view.cashFlow.period.month,period.month);assert.equal(view.cashFlow.netCashFlow,'800.00');
  assert.equal(view.plan.requiredMonthlyAmount,'1600.00');assert.equal(view.plan.difference,'-600.00');assert.equal(view.plan.budgetAmount,'1000.00');
  const list=await call('/goals?limit=1');assert.equal(list.data.length,1);assert.equal(list.data[0].feasibility.status,'within_observed_cash_flow');
  assert.equal((await assess()).plan.goals.length,2);
 });
 await t.test('preview repeats safely, never trusts foreign id or caller scope/date',async()=>{
  const body={income:'2600',goals:[{id:goal.id,targetDate:today}]};
  assert.equal((await assess(a,body)).plan.difference,'0.00');
  assert.deepEqual(await assess(a,body),await assess(a,body));
  await assert.rejects(assess(a,{goals:[{id:foreign.id,targetAmount:'1'}]}));
  await assert.rejects(assess(a,{userId:b.id}));
  await assert.rejects(assess(a,{asOfDate:'2000-01-01'}));
  const other=await assess(b);assert.equal(other.plan.income,null);assert.equal(other.plan.goals.length,1);
 });
 await t.test('Forecast unavailable remains null and cannot influence plan; reads/preview leave all financial records identical',async()=>{
  const f=await call('/forecast');assert.equal(f.status,'unavailable');assert.equal(f.summary.sevenDayForecastTotal,null);
  const assessment=await assess();assert.equal(assessment.forecastSignal.reason,'unavailable');assert.equal(assessment.forecastSignal.amount,null);
  assert.equal(assessment.plan.difference,'-600.00');assert.equal(await fingerprint(),before);
 });

 await t.test('HTTP account isolation, existing fields and total across pagination/filters',async()=>{
  const list=await call('/goals?limit=1'),detail=await call('/goals/'+goal.id);
  assert.deepEqual(list.assessment,detail.assessment);
  assert.equal(list.assessment.scope,'all_active_goals');assert.equal(list.assessment.plan.requiredMonthlyAmount,'1600.00');
  assert.equal(list.assessment.plan.difference,'-600.00');assert.equal(list.assessment.plan.goals.length,2);
  assert.equal(detail.feasibility.cashFlow.netCashFlow,'800.00');
  assert.equal((await call('/goals?archived=only')).assessment.plan.requiredMonthlyAmount,'1600.00');
  const other=await call('/goals',undefined,b);assert.equal(other.assessment.plan.income,null);
  assert.deepEqual(other.assessment.plan.goals.map((g:any)=>g.id),[foreign.id]);
  await call('/goals/'+goal.id,undefined,b,404);await call('/goals?userId='+b.id,undefined,a,400);
  assert.equal(await fingerprint(),before);
 });
 await t.test('HTTP missing inputs, negative available savings, undated/overdue goals',async()=>{
  await prisma.profile.update({where:{userId:a.id},data:{income:null}});
  let r=(await call('/goals')).assessment.plan;assert.ok(r.reasonCodes.includes('missing_income'));assert.equal(r.difference,null);
  await prisma.profile.update({where:{userId:a.id},data:{income:'0'}});
  await prisma.budget.deleteMany({where:{userId:a.id}});
  r=(await call('/goals')).assessment.plan;assert.ok(r.reasonCodes.includes('missing_total_budget'));assert.equal(r.difference,null);
  await prisma.budget.create({data:{userId:a.id,year:Number(month.slice(0,4)),month:Number(month.slice(5)),amount:'1000'}});
  r=(await call('/goals')).assessment.plan;assert.equal(r.availableMonthlyAmount,'-1000.00');assert.equal(r.shortfall,'2600.00');
  await prisma.goal.update({where:{id:goal.id},data:{targetDate:null}});
  r=(await call('/goals')).assessment.plan;assert.equal(r.requiredMonthlyAmount,null);assert.ok(r.goals.some((g:any)=>g.reason==='no_target_date'));
  await prisma.goal.update({where:{id:goal.id},data:{targetDate:new Date('2000-01-01')}});
  r=(await call('/goals')).assessment.plan;assert.ok(r.goals.some((g:any)=>g.reason==='overdue'));assert.equal(r.difference,null);
 });
 await t.test('HTTP Forecast available and stale; no financial or notification writes',async()=>{
  const c=await account();await prisma.profile.create({data:{userId:c.id,income:'2000'}});
  await prisma.budget.create({data:{userId:c.id,year:Number(month.slice(0,4)),month:Number(month.slice(5)),amount:'1000'}});
  const day=(n:number)=>{const d=new Date(today);d.setUTCDate(d.getUTCDate()+n);return d;};
  await prisma.transaction.createMany({data:Array.from({length:30},(_,i)=>({userId:c.id,type:'expense' as const,categoryId:expense.id,amount:'100',transactionDate:day(i-30)}))});
  const stable=await fingerprint(),available=await call('/goals',undefined,c);
  assert.equal(available.assessment.forecastSignal.reason,'above_reference');assert.ok(Number(available.assessment.forecastSignal.amount)>0);
  assert.equal(await fingerprint(),stable);
  await prisma.transaction.updateMany({where:{userId:c.id},data:{transactionDate:day(-40)}});
  // Preserve 30-day readiness with a second synthetic date, while all data remain stale.
  const last=await prisma.transaction.findFirstOrThrow({where:{userId:c.id}});
  await prisma.transaction.update({where:{id:last.id},data:{transactionDate:day(-70)}});
  const staleSnapshot=await fingerprint(),stale=await call('/goals',undefined,c);
  assert.equal(stale.assessment.forecastSignal.reason,'stale');assert.equal(stale.assessment.forecastSignal.amount,null);
  assert.equal(await fingerprint(),staleSnapshot);
 });
 await t.test('HTTP RepeatableRead keeps original fields and assessment in one snapshot during concurrent edits',async()=>{
  await prisma.profile.update({where:{userId:a.id},data:{income:'2000'}});
  await prisma.goal.update({where:{id:goal.id},data:{targetDate:new Date(today),targetAmount:'800'}});
  const original=prisma.$transaction.bind(prisma);
  let entered=false;
  (prisma as any).$transaction=async (work:any,options:any)=>{
   assert.equal(options.isolationLevel,'RepeatableRead');
   return original(async tx=>{
    const proxy=new Proxy(tx,{get(target,prop){
     if(prop==='profile')return new Proxy(target.profile,{get(model,key){
      if(key==='findUnique')return async (...args:any[])=>{
       const value=await (model.findUnique as any)(...args);
       if(!entered){entered=true;
        await prisma.profile.update({where:{userId:a.id},data:{income:'9999'}});
        await prisma.budget.updateMany({where:{userId:a.id},data:{amount:'8888'}});
        await prisma.goal.update({where:{id:goal.id},data:{targetAmount:'7777'}});
       }return value;
      };
      return Reflect.get(model,key);
     }});
     return Reflect.get(target,prop);
    }});
    return work(proxy);
   },options);
  };
  try{
   const r=await call('/goals');assert.equal(entered,true);
   assert.equal(r.assessment.plan.income,'2000.00');assert.equal(r.assessment.plan.budgetAmount,'1000.00');
   assert.equal(r.assessment.plan.requiredMonthlyAmount,'1600.00');
   assert.equal(r.data.find((g:any)=>g.id===goal.id).targetAmount,'800.00');
  }finally{(prisma as any).$transaction=original;}
  const fresh=await call('/goals');assert.equal(fresh.assessment.plan.income,'9999.00');assert.equal(fresh.assessment.plan.budgetAmount,'8888.00');
 });
});
