import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { PrismaClient, Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { dashboardView } from '../src/lib/dashboard';
import { bangkokToday } from '../src/lib/goalCalculations';
const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db) throw Error('Dashboard requires an explicitly isolated database');
test('Dashboard real HTTP/PostgreSQL and canonical Goals integration', async t => {
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1'); await new Promise<void>(r=>server.once('listening',r)); const addr=server.address(); assert.ok(addr&&typeof addr!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'isolated-dashboard-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const a=await account(),b=await account();
 async function req(path:string,method='GET',body?:unknown,status=200,who=a){const r=await fetch('http://127.0.0.1:'+addr.port+path,{method,headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json','Idempotency-Key':randomUUID()},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json() as any;assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;}
 const view=()=>req('/dashboard?month=2024-02');
 const expense=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),other=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),income=await prisma.category.create({data:{name:randomUUID(),type:'income'}});
 const create=(uid:string,type:'income'|'expense',amount:string,date:string,categoryId=type==='income'?income.id:expense.id)=>prisma.transaction.create({data:{userId:uid,type,amount,transactionDate:new Date(date+'T00:00:00Z'),categoryId,createdAt:new Date('2024-03-01T00:00:00Z')}});
 await t.test('auth, strict query validation and empty month',async()=>{assert.equal((await fetch('http://127.0.0.1:'+addr.port+'/dashboard')).status,401);for(const q of ['month=9999-12','month=2024-13','month=2024-02&month=2024-02','userId='+b.id])await req('/dashboard?'+q,'GET',undefined,400);const d=await view();assert.equal(d.summary.incomeAmount,'0.00');assert.equal(d.summary.transactionCount,0);assert.equal(d.summary.budgetAmount,null);assert.equal(d.summary.budgetRemaining,null);assert.deepEqual(d.daily,[]);assert.deepEqual(d.expenseCategories,[]);});
 const source=await create(a.id,'income','10.00','2024-02-01');
 await t.test('income only and planning income excluded',async()=>{await prisma.profile.create({data:{userId:a.id,income:'9999999'}});const d=await view();assert.equal(d.summary.incomeAmount,'10.00');assert.equal(d.summary.expenseAmount,'0.00');assert.equal(d.summary.netCashFlow,'10.00');});
 await create(a.id,'expense','0.07','2024-02-02');await create(a.id,'expense','0.01','2024-02-02');await create(a.id,'expense','1.00','2024-02-28');const tieA=await create(a.id,'expense','2.00','2024-02-29',other.id),tieB=await create(a.id,'expense','3.00','2024-02-29',other.id);
 await create(a.id,'income','99','2024-03-01');await create(b.id,'expense','999','2024-02-29');
 await t.test('Decimal, category/daily conservation, deterministic latest five, cross-account',async()=>{const d=await view();assert.equal(d.summary.transactionCount,6);assert.equal(d.summary.expenseAmount,'6.08');assert.equal(d.summary.netCashFlow,'3.92');assert.equal(d.expenseCategories.length,2);const sum=(rows:any[],field:string)=>rows.reduce((n,r)=>n.plus(r[field]),new Prisma.Decimal(0)).toFixed(2);assert.equal(sum(d.expenseCategories,'amount'),d.summary.expenseAmount);assert.equal(sum(d.daily,'expenseAmount'),d.summary.expenseAmount);assert.equal(sum(d.daily,'incomeAmount'),d.summary.incomeAmount);assert.equal(d.daily.find((r:any)=>r.date==='2024-02-02').expenseAmount,'0.08');assert.equal(d.recentTransactions.items.length,5);assert.equal(d.recentTransactions.hasMore,true);assert.deepEqual(d.recentTransactions.items.slice(0,2).map((r:any)=>r.id),[tieA.id,tieB.id].sort().reverse());const foreign=await req('/dashboard?month=2024-02','GET',undefined,200,b);assert.equal(foreign.summary.expenseAmount,'999.00');assert.equal(foreign.summary.incomeAmount,'0.00');});
 await t.test('budget is total budget only, equal and negative remaining',async()=>{await prisma.budget.create({data:{userId:a.id,year:2024,month:2,amount:'6.08'}});await prisma.categoryBudget.create({data:{userId:a.id,categoryId:expense.id,year:2024,month:2,amount:'100'}});assert.equal((await view()).summary.budgetRemaining,'0.00');assert.equal((await view()).summary.budgetExceeded,false);await prisma.budget.update({where:{userId_year_month:{userId:a.id,year:2024,month:2}},data:{amount:'5'}});assert.equal((await view()).summary.budgetRemaining,'-1.08');assert.equal((await view()).summary.budgetExceeded,true);});
 await t.test('History month filter is DB scoped; absent month retains all account rows',async()=>{assert.equal((await req('/transactions?month=2024-02')).length,6);assert.equal((await req('/transactions')).length,7);assert.equal((await req('/transactions?month=2024-03')).length,1);await req('/transactions?month=bad','GET',undefined,400);});
 await t.test('current-month cutoff uses Bangkok asOf and excludes future records',async()=>{const today=bangkokToday(),d=new Date(today+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);await create(b.id,'income','1',today);await create(b.id,'income','9999',d.toISOString().slice(0,10));const result=await req('/dashboard','GET',undefined,200,b);assert.equal(result.asOfDate,today);assert.equal(result.period.effectiveEndDate,today);assert.equal(result.goals.asOfDate,today);assert.equal(result.summary.incomeAmount,'1.00');});
 await t.test('canonical allocation, release, correction/replacement and opening revision leave reports unchanged',async()=>{
   const snapshot=(d:any)=>({summary:d.summary,daily:d.daily,categories:d.expenseCategories,recent:d.recentTransactions});
   const before=snapshot(await view());const old=await req('/overview?startDate=2024-02-01&endDate=2024-02-29');
   await req('/goal-funding/opening-balance','POST',{amount:'50',cutoffDate:'2023-01-01',note:'test opening'},201);
   const goal=await req('/goals','POST',{name:'primary',targetAmount:'100',categoryKey:'home'},201);
   await prisma.profile.update({where:{userId:a.id},data:{primaryGoalId:goal.id}});
   const check=async(expected:string)=>{const d=await view();assert.equal(d.goals.allocatedAmount,expected);assert.equal(d.goals.primaryGoal.savedAmount,(await req('/goals/'+goal.id)).savedAmount);assert.deepEqual(snapshot(d),before);};
   assert.equal((await view()).goals.notStartedCount,1);
   const lot=await req('/goals/'+goal.id+'/allocations','POST',{amount:'10',source:{type:'OPENING_BALANCE'}},201);await check('10.00');assert.equal((await view()).goals.activeCount,1);
   await req('/goals/'+goal.id+'/allocation-corrections','POST',{allocationId:lot.entries[0].id,amount:'2',reason:'reverse wrong allocation'},201);await check('8.00');
   await req('/goals/'+goal.id+'/allocation-corrections','POST',{allocationId:lot.entries[0].id,amount:'3',replacementSource:{type:'INCOME_TRANSACTION',transactionId:source.id},reason:'replace source'},201);await check('8.00');
   await req('/goals/'+goal.id+'/releases','POST',{amount:'1',reason:'release'},201);await check('7.00');
   await req('/goal-funding/opening-balance/corrections','POST',{amount:'60',reason:'opening revision'},200);await check('7.00');
   await req('/goals/'+goal.id+'/archive','POST');await check('7.00');assert.equal((await view()).goals.activeCount,0);assert.ok((await view()).goals.primaryGoal.archivedAt);
   await prisma.goal.create({data:{userId:a.id,name:'overdue',categoryKey:'home',targetAmount:'1',targetDate:new Date('2023-01-01T00:00:00Z')}});assert.equal((await view()).goals.overdueCount,1);
   assert.deepEqual(await req('/overview?startDate=2024-02-01&endDate=2024-02-29'),old);
 });
 await t.test('real SQL aggregates ledger/transactions; only latest Transaction query has LIMIT',async()=>{
   const client=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL!}),log:[{emit:'event',level:'query'}]});
   const queries:string[]=[];client.$on('query',e=>queries.push(e.query));
   try { await client.$transaction(tx=>dashboardView(tx,a.id,'2024-02',bangkokToday()),{isolationLevel:'RepeatableRead'}); } finally {await client.$disconnect();}
   const transactionQueries=queries.filter(q=>/FROM\s+"(?:public"\.")?Transaction"/i.test(q));
   assert.equal(transactionQueries.length,4,'three grouped queries and one bounded latest query');
   for(const q of transactionQueries){assert.match(q,/WHERE/i);assert.match(q,/userId/);assert.match(q,/transactionDate/);assert.ok(/GROUP BY/i.test(q)||/LIMIT/i.test(q));}
   const ledger=queries.filter(q=>/FROM\s+"(?:public"\.")?GoalLedgerEntry"/i.test(q));assert.equal(ledger.length,1);assert.match(ledger[0]!,/GROUP BY/);assert.match(ledger[0]!,/userId/);
   console.log('Verified actual SQL: 3 bounded transaction GROUP BY, 1 latest LIMIT, 1 user-scoped ledger GROUP BY; no full-row ledger read.');
 });
});