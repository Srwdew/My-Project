// Real Express HTTP + PostgreSQL: endpoints called without a month must answer the backend's current cycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/index';
import { bangkokToday } from '../src/lib/goalCalculations';
import { ensureDefaultCategories } from '../src/lib/defaultCategories';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Explicit isolated test DB required');
// Independent oracle (phase 1 = calendar month), deliberately not computed through cycle.ts.
const shift=(m:string,n:number)=>{const d=new Date(m+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7);};
test('no-month /dashboard, /budget, /budget/categories answer the current cycle',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const get=async(path:string,who:{token:string},status=200)=>{const r=await fetch('http://127.0.0.1:'+address.port+path,{headers:{Authorization:'Bearer '+who.token}});assert.equal(r.status,status,path);return r.json() as Promise<any>;};
 const today=bangkokToday(),cur=today.slice(0,7),prev=shift(cur,-1),[y,m]=cur.split('-').map(Number) as [number,number];
 await ensureDefaultCategories(prisma);
 const travel=await prisma.category.findUniqueOrThrow({where:{name_type:{name:'การเดินทาง',type:'expense'}}});
 const a=await account(),b=await account();
 await prisma.budget.create({data:{userId:a.id,year:y,month:m,amount:'1000'}});
 await prisma.categoryBudget.create({data:{userId:a.id,categoryId:travel.id,year:y,month:m,amount:'300'}});
 await prisma.transaction.create({data:{userId:a.id,type:'expense',amount:'120.00',categoryId:travel.id,transactionDate:new Date(today+'T00:00:00Z')}});
 // Previous month must not leak into the default (current) answer.
 await prisma.transaction.create({data:{userId:a.id,type:'expense',amount:'50.00',categoryId:travel.id,transactionDate:new Date(prev+'-01T00:00:00Z')}});

 const dash=await get('/dashboard',a);
 assert.equal(dash.month,cur);
 assert.deepEqual([dash.period.currentMonth,dash.period.previousMonth,dash.period.nextMonth,dash.period.isCurrentMonth],[cur,prev,null,true]);
 assert.equal(dash.summary.expenseAmount,'120.00');assert.equal(dash.summary.budgetAmount,'1000.00');
 const past=await get('/dashboard?month='+prev,a);
 assert.deepEqual([past.period.currentMonth,past.period.previousMonth,past.period.nextMonth,past.period.isCurrentMonth],[cur,shift(cur,-2),cur,false]);
 assert.equal(past.summary.expenseAmount,'50.00');
 await get('/dashboard?month='+shift(cur,1),a,400);

 const budget=await get('/budget',a),explicit=await get(`/budget?year=${y}&month=${m}`,a);
 assert.deepEqual([budget.year,budget.month,budget.budgetAmount,budget.totalExpense],[y,m,1000,120]);
 assert.deepEqual(budget,explicit,'no-month /budget must equal the explicit current month');
 const cats=await get('/budget/categories',a),explicitCats=await get(`/budget/categories?year=${y}&month=${m}`,a);
 assert.deepEqual(cats,explicitCats,'no-month /budget/categories must equal the explicit current month');
 const travelRow=cats.items.find((i:any)=>i.categoryId===travel.id);
 assert.equal(Number(travelRow.expenseAmount),120);assert.equal(Number(travelRow.budgetAmount),300);
 // Only "both absent" means current; a half-specified period is still rejected.
 await get(`/budget?year=${y}`,a,400);await get(`/budget/categories?month=${m}`,a,400);
 // Another user's default answer is their own empty cycle.
 const other=await get('/budget',b);assert.deepEqual([other.year,other.month,other.budgetAmount,other.totalExpense],[y,m,null,0]);
 assert.equal((await get('/dashboard',b)).summary.expenseAmount,'0.00');
 assert.equal(bangkokToday(),today,'Bangkok date changed mid-test; rerun');
});
