import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import express from 'express';import bcrypt from 'bcrypt';import jwt from 'jsonwebtoken';
import {spawn} from 'node:child_process';import {mkdtemp,writeFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';
import {PrismaClient} from '@prisma/client';import {PrismaPg} from '@prisma/adapter-pg';
import {prisma} from '../src/lib/prisma';import {settingsRouter} from '../src/routes/settings';
import {retryClosedAccountExperiment,pendingClosedAccountExperiments} from '../src/lib/closedAccountExperiment';
import {EXPERIMENT_COLLECTION_ENABLED,AUTOMATIC_AMOUNT_MATCHING} from '../src/lib/experimentRetention';
const url=new URL(process.env.DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(url.hostname)||url.pathname!=='/'+process.env.GOALS_TEST_DATABASE||!url.pathname.startsWith('/spendsense_goals_test_'))throw Error('Isolated test database required');
test('closed account retention: actual PostgreSQL and HTTP, new synthetic accounts only',async t=>{
 const observer=new PrismaClient({adapter:new PrismaPg({connectionString:url.toString()})});
 const app=express();app.use(express.json());app.use(settingsRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const origin='http://127.0.0.1:'+(server.address() as any).port;
 const existing=await observer.$queryRawUnsafe<any[]>('SELECT * FROM experiment_retention.subject ORDER BY user_id');
 const existingArtifacts=await observer.$queryRawUnsafe<any[]>('SELECT * FROM experiment_retention.artifact ORDER BY id');
 const history=async()=>{const hashes=[];for(const table of ['Transaction','AnomalyEvaluation','AnomalyDecision','AnomalyPatternEvent'])hashes.push(await observer.$queryRawUnsafe('SELECT md5(COALESCE(string_agg(row_to_json(t)::text,\'\' ORDER BY id),\'\')) AS fingerprint FROM public."'+table+'" t'));return hashes;};
 const mainBefore=await history();
 const original=prisma.$transaction.bind(prisma);
 async function account(){const password=randomUUID();const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:await bcrypt.hash(password,4)}});return {...u,password,token:jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!)};}
 async function close(a:Awaited<ReturnType<typeof account>>,password:string=a.password){const response=await fetch(origin+'/auth/close-account',{method:'POST',headers:{Authorization:'Bearer '+a.token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:password,confirmation:'ปิดบัญชีผู้ใช้'})});return {status:response.status,body:await response.json() as any};}
 const state=(id:string)=>observer.$queryRawUnsafe<any[]>('SELECT * FROM experiment_retention.subject WHERE user_id=$1',id);
 try{
  await t.test('wrong password leaves account and retention unchanged',async()=>{
   const a=await account(),before=await observer.user.findUniqueOrThrow({where:{id:a.id}});
   assert.equal((await close(a,'wrong-password')).status,400);assert.deepEqual(await observer.user.findUniqueOrThrow({where:{id:a.id}}),before);assert.equal((await state(a.id)).length,0);
  });
  await t.test('success closes account first, revokes session and separately records DB purge',async()=>{
   const a=await account();const r=await close(a);assert.equal(r.status,200);assert.equal(r.body.logout,true);assert.equal(r.body.experimentPurge.retryPending,false);
   const after=await observer.user.findUniqueOrThrow({where:{id:a.id}});assert.ok(after.deletedAt);assert.equal(after.authVersion,1);assert.ok((await state(a.id))[0].database_purged_at);
   assert.equal((await fetch(origin+'/settings',{headers:{Authorization:'Bearer '+a.token}})).status,401);
  });
  let failedAccount:Awaited<ReturnType<typeof account>>;
  await t.test('real SQL failure rolls back only maintenance; HTTP closure still succeeds',async()=>{
   const a=failedAccount=await account();
   (prisma as any).$transaction=(work:any,options:any)=>original(async tx=>work(new Proxy(tx,{get(target,key){
    if(key==='$executeRawUnsafe')return async(sql:string,...args:any[])=>{
     if(sql.startsWith('INSERT INTO experiment_retention.subject')&&args[0]===a.id){
      const committed=await observer.user.findUniqueOrThrow({where:{id:a.id}});assert.ok(committed.deletedAt);assert.equal(committed.authVersion,1);
      await target.$executeRawUnsafe(sql,...args);return target.$executeRawUnsafe('SELECT 1/0');
     }return target.$executeRawUnsafe(sql,...args);
    };return Reflect.get(target,key);
   }})),options);
   try{const r=await close(a);assert.equal(r.status,200);assert.equal(r.body.logout,true);assert.equal(r.body.experimentPurge.retryPending,true);}
   finally{(prisma as any).$transaction=original;}
   assert.equal((await state(a.id)).length,0);assert.ok((await pendingClosedAccountExperiments(observer,[a.id])).some(x=>x.id===a.id));
   assert.equal((await fetch(origin+'/settings',{headers:{Authorization:'Bearer '+a.token}})).status,401);
  });
  await t.test('new process discovers durable pending job and repeated retry is idempotent',async()=>{
   const a=failedAccount!;const dir=await mkdtemp(join(tmpdir(),'spendsense-close-retry-'));const scope=join(dir,'scope.json');
   await writeFile(scope,JSON.stringify({source:'authorized-test-decisions',database:url.pathname.slice(1),host:url.hostname,port:url.port,since:'2026-10-07T14:22:28.000Z',accounts:[a.id]}));
   const result=await new Promise<{code:number|null;output:string}>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx','experiments/retryClosedAccountExperiment.ts','--scope',scope,'--execute'],{cwd:process.cwd(),env:process.env,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);child.on('error',reject);child.on('exit',code=>resolve({code,output}));});
   assert.equal(result.code,0);assert.equal(JSON.parse(result.output.trim()).databasePurged,1);assert.equal((await pendingClosedAccountExperiments(observer,[a.id])).length,0);
   const before=await state(a.id);assert.equal((await retryClosedAccountExperiment(observer,a.id)).retryPending,false);assert.deepEqual(await state(a.id),before);
  });
  await t.test('overlapping maintenance skips locked account and never duplicates work',async()=>{
   const a=await account();await observer.user.update({where:{id:a.id},data:{deletedAt:new Date(),authVersion:{increment:1}}});
   let unlock!:()=>void,entered!:()=>void;const gate=new Promise<void>(r=>unlock=r),started=new Promise<void>(r=>entered=r);
   const holding=observer.$transaction(async tx=>{await tx.$queryRawUnsafe('SELECT id FROM public."User" WHERE id=$1 FOR UPDATE',a.id);entered();await gate;},{timeout:10000});
   await started;try{assert.equal((await retryClosedAccountExperiment(prisma,a.id)).retryPending,true);assert.equal((await state(a.id)).length,0);}finally{unlock();await holding;}
   const results=await Promise.all([retryClosedAccountExperiment(prisma,a.id),retryClosedAccountExperiment(observer,a.id)]);
   assert.ok(results.some(r=>!r.retryPending));assert.equal((await state(a.id)).length,1);const before=await state(a.id);await retryClosedAccountExperiment(prisma,a.id);assert.deepEqual(await state(a.id),before);
  });
  await t.test('active account cannot be purged; main history and pre-existing backlog unchanged',async()=>{
   const a=await account();assert.equal((await retryClosedAccountExperiment(observer,a.id)).retryPending,true);assert.equal((await state(a.id)).length,0);
   assert.deepEqual(await history(),mainBefore);
   const ids=existing.map(x=>x.user_id);const after=await observer.$queryRawUnsafe<any[]>('SELECT * FROM experiment_retention.subject WHERE user_id=ANY($1::text[]) ORDER BY user_id',ids);assert.deepEqual(after,existing);
   assert.deepEqual(await observer.$queryRawUnsafe('SELECT * FROM experiment_retention.artifact ORDER BY id'),existingArtifacts);
   assert.equal(EXPERIMENT_COLLECTION_ENABLED,false);assert.equal(AUTOMATIC_AMOUNT_MATCHING,false);
  });
 }finally{(prisma as any).$transaction=original;await new Promise<void>(r=>server.close(()=>r()));await observer.$disconnect();await prisma.$disconnect();}
});
