import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/index';
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from '../src/lib/defaultCategories';

const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_categories_') || process.env.GOALS_TEST_DATABASE !== db)
  throw Error('Dedicated categories test database required');

test('default categories: fresh concurrent signup, replay, existing users and isolation', async t => {
  process.env.JWT_SECRET = randomUUID();
  const password = randomUUID();
  assert.equal(await prisma.category.count(), 0, 'requires freshly migrated test database');
  const legacy = await prisma.user.create({data:{email:'legacy-'+randomUUID()+'@example.invalid',passwordHash:'test-only-not-login'}});
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const base='http://127.0.0.1:'+address.port;
  t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
  const req=async(path:string,method='GET',body?:unknown,token?:string)=>{
    const r=await fetch(base+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:r.status,body:await r.json() as any};
  };
  const email=()=>randomUUID()+'@example.invalid';
  const emails=Array.from({length:4},email);
  await t.test('concurrent different-account signup commits one shared catalog',async()=>{
    const results=await Promise.all(emails.map(email=>req('/auth/register','POST',{email,password})));
    assert.deepEqual(results.map(r=>r.status),[201,201,201,201]);
    assert.equal(await prisma.category.count(),DEFAULT_CATEGORIES.length);
    for(const c of DEFAULT_CATEGORIES)assert.equal(await prisma.category.count({where:c}),1);
    assert.equal(await prisma.transaction.count(),0);
    assert.equal(await prisma.goal.count(),0);
    assert.equal(await prisma.budget.count(),0);
    assert.equal(await prisma.notification.count(),0);
    assert.deepEqual(await prisma.user.findUnique({where:{id:legacy.id}}),legacy);
  });
  const catalog=await prisma.category.findMany({orderBy:{id:'asc'}});
  await t.test('repeated and concurrent initialization preserves IDs and existing custom rows',async()=>{
    const custom=await prisma.category.create({data:{name:'Existing custom category',type:'expense'}});
    await Promise.all(Array.from({length:4},()=>prisma.$transaction(tx=>ensureDefaultCategories(tx))));
    assert.deepEqual(await prisma.category.findMany({where:{id:{in:catalog.map(c=>c.id)}},orderBy:{id:'asc'}}),catalog);
    assert.deepEqual(await prisma.category.findUnique({where:{id:custom.id}}),custom);
    assert.equal(await prisma.category.count(),DEFAULT_CATEGORIES.length+1);
  });
  await t.test('same-email concurrent signup returns one 201 and one 409',async()=>{
    const same=email();const result=await Promise.all([1,2].map(()=>req('/auth/register','POST',{email:same,password})));
    assert.deepEqual(result.map(r=>r.status).sort(),[201,409]);
    assert.equal(await prisma.user.count({where:{email:same}}),1);
  });
  await t.test('rollback cannot leave a partial new account or category write',async()=>{
    const id=randomUUID();
    await assert.rejects(prisma.$transaction(async tx=>{
      await tx.user.create({data:{id,email:email(),passwordHash:'test-only'}});
      await ensureDefaultCategories(tx);
      throw Error('intentional rollback');
    }),/intentional rollback/);
    assert.equal(await prisma.user.count({where:{id}}),0);
    assert.equal(await prisma.category.count(),DEFAULT_CATEGORIES.length+1);
  });
  await t.test('shared category IDs work for both accounts but transaction ownership remains isolated',async()=>{
    const a=await req('/auth/login','POST',{email:emails[0],password});
    const b=await req('/auth/login','POST',{email:emails[1],password});
    assert.equal(a.status,200);assert.equal(b.status,200);
    const ca=await req('/categories','GET',undefined,a.body.token),cb=await req('/categories','GET',undefined,b.body.token);
    assert.deepEqual(ca.body,cb.body);
    const category=catalog.find(c=>c.type==='expense')!;
    const created=await req('/transactions','POST',{categoryId:category.id,type:'expense',amount:'0.07',transactionDate:'2026-01-01'},a.body.token);
    assert.equal(created.status,201);
    assert.equal((await req('/transactions/'+created.body.id,'GET',undefined,a.body.token)).status,200);
    assert.equal((await req('/transactions/'+created.body.id,'GET',undefined,b.body.token)).status,404);
    const before=await prisma.transaction.findUnique({where:{id:created.body.id}});
    assert.equal((await req('/auth/register','POST',{email:email(),password})).status,201);
    assert.deepEqual(await prisma.transaction.findUnique({where:{id:created.body.id}}),before);
    const mismatch=await req('/transactions','POST',{categoryId:category.id,type:'income',amount:'1.00',transactionDate:'2026-01-01'},b.body.token);
    assert.equal(mismatch.status,400);
  });
});
