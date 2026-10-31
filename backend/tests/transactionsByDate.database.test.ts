// Real Express HTTP + PostgreSQL: /transactions?date= returns exact calendar days for the receipt duplicate check.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/index';
import { ensureDefaultCategories } from '../src/lib/defaultCategories';
import { duplicateCheckDates, duplicateCheckPath, findDuplicates } from '../../frontend/src/lib/receiptBatch';
import { cycleProbe } from '../src/lib/cycle';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Explicit isolated test DB required');
test('/transactions?date= returns only the requested days, for the owner, and validates input',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});return {...u,token:jwt.sign({userId:u.id,email:u.email},process.env.JWT_SECRET!)};};
 const get=async(path:string,who:{token:string},status=200)=>{const r=await fetch('http://127.0.0.1:'+address.port+path,{headers:{Authorization:'Bearer '+who.token}});const body=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(body).slice(0,200));return body as any;};
 await ensureDefaultCategories(prisma);
 const food=await prisma.category.findUniqueOrThrow({where:{name_type:{name:'อาหารและเครื่องดื่ม',type:'expense'}}});
 const a=await account(),b=await account();
 const add=(who:{id:string},date:string,amount:string,time?:string)=>prisma.transaction.create({data:{userId:who.id,type:'expense',amount,categoryId:food.id,transactionDate:new Date(date+'T00:00:00Z'),transactionTime:time?new Date('1970-01-01T'+time+':00Z'):null}});
 // A payday on the 25th would split 24 and 26 into different cycles; the day query must not care.
 await add(a,'2026-10-24','120.00','09:30');await add(a,'2026-10-25','999.00');await add(a,'2026-10-26','80.00');await add(a,'2026-11-03','5.00');
 await add(b,'2026-10-24','120.00','09:30');

 // Phase 2 blocker, test 3 part 1: from here on any use of cycle.ts or loadCycleContext throws (and is counted),
 // so the ?date= route, its validation and the frontend helpers must work without ever touching cycle logic.
 let cycleUses=0;cycleProbe.onUse=()=>{cycleUses++;throw Error('CYCLE_TOUCHED_BY_DATE_PATH');};
 t.after(()=>{cycleProbe.onUse=null;});
 const both=await get('/transactions?date=2026-10-24&date=2026-10-26',a);
 assert.deepEqual(both.map((x:any)=>[x.transactionDate.slice(0,10),x.amount]).sort(),[['2026-10-24','120'],['2026-10-26','80']].sort());
 assert.ok(both.every((x:any)=>x.userId===a.id),'never another user\'s rows');
 assert.equal((await get('/transactions?date=2026-10-24',b)).length,1);
 assert.deepEqual(await get('/transactions?date=2026-10-27',a),[]);

 // End to end with the real frontend helpers: slips on both sides of the would-be payday are flagged.
 const slips=[{id:'s1',fields:{amount:'120',transactionDate:'2026-10-24',transactionTime:'09:30',description:'',categoryId:food.id}},
  {id:'s2',fields:{amount:'80.00',transactionDate:'2026-10-26',transactionTime:'',description:'',categoryId:food.id}},
  {id:'s3',fields:{amount:'81',transactionDate:'2026-10-26',transactionTime:'',description:'',categoryId:food.id}}];
 const path=duplicateCheckPath(duplicateCheckDates(slips,'2026-11-30'));
 assert.equal(path,'/transactions?date=2026-10-24&date=2026-10-26');
 assert.deepEqual([...findDuplicates(slips,await get(path,a)).keys()],['s1','s2']);

 for(const bad of ['date=2026-02-30','date=2026-13-01','date=26-10-24','date=2026-10-24&date=2026-10-24','date=2026-10-24&month=2026-10',
  Array.from({length:11},(_,i)=>'date=2026-10-'+String(i+1).padStart(2,'0')).join('&')])
  await get('/transactions?'+bad,a,400);
 assert.equal((await get('/transactions?'+Array.from({length:10},(_,i)=>'date=2026-10-'+String(i+20).padStart(2,'0')).join('&'),a)).length,3);
 assert.equal(cycleUses,0,'the duplicate-check path must never touch cycle.ts');
 // Control: the trap is live, so a cycle-based request in the same window does fail.
 await get('/transactions?month=2026-10',a,500);
 assert.ok(cycleUses>0,'trap must catch real cycle use');
 cycleProbe.onUse=null;
});
