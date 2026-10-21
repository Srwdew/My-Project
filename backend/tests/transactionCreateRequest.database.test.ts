import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import jwt from 'jsonwebtoken';
import {app} from '../src/index';
import {prisma} from '../src/lib/prisma';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_goals_test_ocr_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Isolated OCR test database required');
test('durable transaction creation: real HTTP and committed PostgreSQL concurrency',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const users=await Promise.all([0,1].map(()=>prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic'}})));
 const tokens=users.map(u=>jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!));
 const c=await prisma.category.create({data:{name:'OCR-'+randomUUID(),type:'expense'}});
 const body={categoryId:c.id,type:'expense',amount:'0.07',transactionDate:'2024-02-29',transactionTime:'12:03',transactionTimeConfirmed:false,description:'Synthetic receipt'};
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const a=server.address();assert.ok(a&&typeof a!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 async function post(key:string|undefined,b=body,user=0){const r=await fetch('http://127.0.0.1:'+a.port+'/transactions',{method:'POST',headers:{'Content-Type':'application/json',...(user<0?{}:{Authorization:'Bearer '+tokens[user]}),...(key?{'Idempotency-Key':key}:{})},body:JSON.stringify(b)});return {status:r.status,body:await r.json() as any};}
 const key=randomUUID();
 const first=await post(key);assert.equal(first.status,201);assert.equal(first.body.amount,'0.07');assert.equal(first.body.transactionTimeConfirmed,false);
 await t.test('retry after committed write and simultaneous retries return exact response once',async()=>{
  const rows=await Promise.all(Array.from({length:8},()=>post(key)));
  for(const row of rows)assert.deepEqual(row,first);
  assert.equal(await prisma.transaction.count({where:{userId:users[0]!.id}}),1);
  const concurrentKey=randomUUID();const created=await Promise.all(Array.from({length:8},()=>post(concurrentKey)));
  assert.ok(created.every(x=>x.status===201&&x.body.id===created[0]!.body.id));
  assert.equal(await prisma.transaction.count({where:{userId:users[0]!.id}}),2);
  const connections=await prisma.$queryRaw<{n:bigint}[]>`SELECT count(*) AS n FROM pg_stat_activity WHERE datname=current_database() AND backend_type='client backend'`;
  assert.ok(Number(connections[0]!.n)>1,'multiple real PostgreSQL connections');
 });
 await t.test('same key different payload conflicts; separate users do not collide',async()=>{
  assert.equal((await post(key,{...body,amount:'0.08'})).status,409);
  const foreign=await post(key,body,1);assert.equal(foreign.status,201);assert.notEqual(foreign.body.id,first.body.id);
  assert.equal((await post(key,body,-1)).status,401);
 });
 await t.test('validation rollback does not consume key; legacy no-key remains compatible',async()=>{
  const k=randomUUID();assert.equal((await post(k,{...body,amount:'-1'})).status,400);
  assert.equal(await prisma.transactionCreateRequest.count({where:{userId:users[0]!.id,idempotencyKey:k}}),0);
  assert.equal((await post(k)).status,201);assert.equal((await post(undefined)).status,201);
  assert.equal((await post('bad')).status,400);
 });
 await t.test('receipt survives source changes/deletion and database reconnect',async()=>{
  await prisma.transaction.update({where:{id:first.body.id},data:{description:'Changed'}});
  assert.deepEqual(await post(key),first);
  await prisma.transaction.delete({where:{id:first.body.id}});
  await prisma.$disconnect();
  assert.deepEqual(await post(key),first);
  await assert.rejects(prisma.transactionCreateRequest.update({where:{userId_idempotencyKey:{userId:users[0]!.id,idempotencyKey:key}},data:{responseStatus:200}}));
  await assert.rejects(prisma.transactionCreateRequest.delete({where:{userId_idempotencyKey:{userId:users[0]!.id,idempotencyKey:key}}}));
 });
 await t.test('authVersion revoked after initial request prevents replay',async()=>{
  await prisma.user.update({where:{id:users[0]!.id},data:{authVersion:1}});
  assert.equal((await post(key)).status,401);
 });
});
