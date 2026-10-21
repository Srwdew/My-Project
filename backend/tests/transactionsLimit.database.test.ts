import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {app} from '../src/index';
import {prisma} from '../src/lib/prisma';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Isolated database required');
test('transactions optional limit: real PostgreSQL, original contract, query take and ownership',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const users=await Promise.all([0,1,2].map(()=>prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-not-a-login'}})));
 const tokens=users.map(u=>jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!));
 const category=await prisma.category.findFirstOrThrow({where:{type:'expense'}});
 for(const [i,day] of ['2020-01-01','2020-01-02','2020-02-01'].entries())await prisma.transaction.create({data:{userId:users[0]!.id,categoryId:category.id,type:'expense',amount:'0.07',transactionDate:new Date(day+'T00:00:00Z'),createdAt:new Date(Date.UTC(2020,0,1,0,0,i))}});
 await prisma.transaction.create({data:{userId:users[1]!.id,categoryId:category.id,type:'expense',amount:'9.99',transactionDate:new Date('2021-01-01T00:00:00Z')}});
 const original=prisma.transaction.findMany.bind(prisma.transaction);
 const queries:any[]=[];
 (prisma.transaction as any).findMany=async(args:any)=>{queries.push(args);return original(args);};
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{(prisma.transaction as any).findMany=original;await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 async function req(query='',user=0){const r=await fetch('http://127.0.0.1:'+address.port+'/transactions'+query,{headers:user<0?{}:{Authorization:'Bearer '+tokens[user]}});return {status:r.status,body:await r.json() as any};}
 await t.test('without limit returns full original array/category/order and no take',async()=>{
  const r=await req();assert.equal(r.status,200);
  const expected=await original({where:{userId:users[0]!.id},include:{category:true},orderBy:[{transactionDate:'desc'},{createdAt:'desc'}]});
  assert.deepEqual(r.body,JSON.parse(JSON.stringify(expected)));assert.equal(r.body.length,3);assert.equal(Object.hasOwn(queries.at(-1),'take'),false);
 });
 await t.test('limit is passed into real Prisma query; old dates found; month combines',async()=>{
  for(const n of [1,2,100]){const r=await req('?limit='+n);assert.equal(r.status,200);assert.equal(r.body.length,Math.min(n,3));assert.equal(queries.at(-1).take,n);}
  const old=await req('?limit=1');assert.equal(old.body[0].transactionDate.slice(0,10),'2020-02-01');
  const month=await req('?month=2020-01&limit=1');assert.equal(month.status,200);assert.equal(month.body.length,1);assert.equal(month.body[0].transactionDate.slice(0,10),'2020-01-02');assert.equal(queries.at(-1).take,1);assert.ok(queries.at(-1).where.transactionDate);
  assert.equal((await req('?month=2020-01')).body.length,2);
  assert.deepEqual((await req('?month=2019-01&limit=1')).body,[]);
 });
 await t.test('invalid limits reject before transaction query',async()=>{
  for(const q of ['limit=','limit=0','limit=-1','limit=1.5','limit=101','limit=abc','limit=Infinity','limit=1e2','limit=%201','limit=01','limit=999999999999999999999','limit=1&limit=2']){
   const count=queries.length;assert.equal((await req('?'+q)).status,400,q);assert.equal(queries.length,count);
  }
  assert.equal((await req('?month=invalid&limit=1')).status,400);
 });
 await t.test('auth only, foreign user query ignored, empty user remains empty',async()=>{
  assert.equal((await req('?limit=1',-1)).status,401);
  for(const n of [0,1]){const r=await req('?limit=1&userId='+users[1-n]!.id,n);assert.equal(r.status,200);assert.equal(r.body.length,1);assert.equal(r.body[0].userId,users[n]!.id);assert.equal(queries.at(-1).where.userId,users[n]!.id);}
  assert.deepEqual((await req('?limit=1',2)).body,[]);
 });
});
