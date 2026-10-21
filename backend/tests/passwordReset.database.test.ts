import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac,randomBytes,randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import express from 'express';
import cors from 'cors';
import { Prisma } from '@prisma/client';
import { prisma } from '../src/lib/prisma';
import { app as mainApp } from '../src/index';
import { PasswordResetService,RESET_MESSAGE,RESET_POLICY,tokenHash } from '../src/lib/passwordReset';
import { localResetMailer } from '../src/lib/passwordResetMail';
import { configuredResetService,createPasswordResetRouter } from '../src/routes/passwordReset';
import { startLocalResetSink } from './localResetSink';
const target=new URL(process.env.DATABASE_URL!);
if(!['127.0.0.1','localhost'].includes(target.hostname)||!target.pathname.slice(1).startsWith('spendsense_reset_test_')||process.env.RESET_TEST_DATABASE!==target.pathname.slice(1))throw Error('Isolated reset database required');
test('Password reset: real PostgreSQL, HTTP and local in-memory mail',async t=>{
  process.env.JWT_SECRET=randomBytes(48).toString('hex');
  const sink=await startLocalResetSink(),secret=randomBytes(32).toString('hex');
  const config={secret,origin:'http://localhost:5173',mailer:localResetMailer(sink.url)};
  const service=new PasswordResetService(prisma,config);
  const app=express();app.use(cors());app.use(createPasswordResetRouter(service));app.use(mainApp);
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();assert.ok(address&&typeof address!=='string');const base='http://127.0.0.1:'+address.port;
  t.after(async()=>{await service.drain();await new Promise<void>(r=>server.close(()=>r()));await sink.close();await prisma.$disconnect();});
  const password='Test-'+randomUUID(),next='Next-'+randomUUID(),hash=await bcrypt.hash(password,4);
  const account=(extra:any={})=>prisma.user.create({data:{email:randomUUID()+'@example.test',passwordHash:hash,...extra}});
  async function http(route:string,body?:unknown,auth?:string) {
    const response=await fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:response.status,body:await response.json() as any,headers:response.headers};
  }
  const rawFor=(email:string)=>new URL(sink.messages.findLast(m=>m.to===email)!.resetUrl).hash.slice('#token='.length);
  async function issue(u:{email:string}) {await service.request(u.email,randomUUID());await service.drain();return rawFor(u.email);}
  const rows=()=>prisma.$queryRaw<any[]>`SELECT * FROM "PasswordResetToken"`;
  const body=(token:string)=>({token,newPassword:next,confirmPassword:next});
  await t.test('default/production/application targets fail closed; external mail URLs rejected',()=>{
    assert.equal(configuredResetService({}),null);
    for(const patch of [{NODE_ENV:'production'},{DATABASE_URL:'postgresql://unused@localhost/application'},{PASSWORD_RESET_POLICY:'unknown'}])assert.equal(configuredResetService({...process.env,PASSWORD_RESET_MODE:'local-test',...patch}),null);
    for(const url of ['https://example.test/messages','http://localhost/messages','http://127.0.0.1/messages?token=x','http://user:secret@127.0.0.1/messages'])assert.throws(()=>localResetMailer(url));
  });
  await t.test('enabled factory validates config without sending mail; disabled remains closed',()=>{
    const configured={...process.env,PASSWORD_RESET_ENABLED:'true',PASSWORD_RESET_MODE:'local-test',PASSWORD_RESET_POLICY:'proposal-v1',
      PUBLIC_APP_ORIGIN:config.origin,PASSWORD_RESET_ALLOWED_ORIGINS:config.origin,PASSWORD_RESET_TRUSTED_PROXIES:'none',
      PASSWORD_RESET_LIMITER_KEY:secret,PASSWORD_RESET_SINK_URL:sink.url,PASSWORD_RESET_MAIL_PROVIDER:'local'};
    assert.ok(configuredResetService(configured));
    const log=console.error,logs:unknown[][]=[];console.error=(...args)=>{logs.push(args);};
    try {
      assert.throws(()=>configuredResetService({...configured,PUBLIC_APP_ORIGIN:'https://evil.example.test'}));
      assert.throws(()=>configuredResetService({...configured,NODE_ENV:'production'}));
    }finally{console.error=log;}
    assert.ok(!JSON.stringify(logs).includes(secret));assert.ok(!JSON.stringify(logs).includes('evil.example.test'));
    assert.equal(configuredResetService({...configured,PASSWORD_RESET_ENABLED:'false'}),null);
  });
  await t.test('existing/missing/closed responses identical; normalized email; async mail; hash only and 15 minute TTL',async()=>{
    const u=await account(),closed=await account({deletedAt:new Date()});
    const responses=[];
    for(const email of [u.email.toUpperCase()+' ',randomUUID()+'@example.test',closed.email])responses.push(await http('/auth/forgot-password',{email}));
    for(const r of responses){assert.equal(r.status,202);assert.deepEqual(r.body,{message:RESET_MESSAGE});assert.equal(r.headers.get('cache-control'),'no-store');}
    await service.drain();const raw=rawFor(u.email),all=await rows(),record=all.find(r=>r.userId===u.id);
    assert.equal(record.tokenHash,tokenHash(raw));assert.equal(record.expiresAt-record.createdAt,RESET_POLICY.ttlMs);
    assert.ok(!JSON.stringify(all).includes(raw),'Database must not contain raw token');
    assert.equal(sink.messages.filter(m=>m.to===closed.email).length,0);
    const before=await prisma.user.findUniqueOrThrow({where:{id:u.id}});assert.equal(before.passwordHash,hash);assert.equal(before.authVersion,0);
    const repeated=await http('/auth/forgot-password',{email:u.email});assert.equal(repeated.status,202);
    await service.drain();assert.equal(sink.messages.filter(m=>m.to===u.email).length,1);
  });
  await t.test('Host headers cannot change reset origin; no-referrer response',async()=>{
    const u=await account();
    const r=await fetch(base+'/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json','Host':'evil.example.test','X-Forwarded-Host':'evil.example.test'},body:JSON.stringify({email:u.email})});
    assert.equal(r.status,202);assert.equal(r.headers.get('referrer-policy'),'no-referrer');
    await service.drain();assert.equal(new URL(sink.messages.find(m=>m.to===u.email)!.resetUrl).origin,config.origin);
  });
  await t.test('reset waits for account lock; concurrent closure/password change invalidates old token',async()=>{
    for(const closed of [false,true]){
      const u=await account(),raw=await issue(u);
      let acquired!:()=>void,release!:()=>void;
      const locked=new Promise<void>(r=>acquired=r),gate=new Promise<void>(r=>release=r);
      const mutation=prisma.$transaction(async tx=>{
        await tx.$queryRaw(Prisma.sql`SELECT id FROM "User" WHERE id=${u.id} FOR UPDATE`);
        acquired();await gate;
        await tx.user.update({where:{id:u.id},data:{authVersion:{increment:1},...(closed?{deletedAt:new Date()}:{passwordHash:hash})}});
      });
      await locked;const reset=service.reset(raw,next,randomUUID());
      release();await mutation;
      await assert.rejects(reset,(e:any)=>e.code==='INVALID_RESET_TOKEN');
      assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).passwordHash,hash);
    }
  });
  await t.test('single use; old session revoked, new login works; role/lastLoginAt/financial rows unchanged',async()=>{
    const u=await account({role:'ADMIN'}),raw=await issue(u);
    const old=jwt.sign({userId:u.id,email:u.email,authVersion:0},process.env.JWT_SECRET!);
    const category=await prisma.category.create({data:{name:randomUUID(),type:'expense'}});
    await prisma.transaction.create({data:{userId:u.id,categoryId:category.id,type:'expense',amount:'123.45',transactionDate:new Date('2026-01-01T00:00:00Z')}});
    await prisma.budget.create({data:{userId:u.id,year:2026,month:1,amount:'900.50'}});
    const write=async(route:string,data:unknown)=>{
      const r=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+old,'Idempotency-Key':randomUUID()},body:JSON.stringify(data)});
      assert.ok(r.ok,'Synthetic goal fixture must succeed');return r.json() as Promise<any>;
    };
    const goal=await write('/goals',{name:'Synthetic reset invariant',targetAmount:'1000.00',categoryKey:'other'});
    await write('/goal-funding/opening-balance',{amount:'500.00',cutoffDate:'2026-01-01',note:'Synthetic fixture'});
    await write('/goals/'+goal.id+'/allocations',{amount:'100.00',source:{type:'OPENING_BALANCE'}});
    assert.equal(await prisma.goalLedgerEntry.count({where:{userId:u.id}}),1);
    const fingerprint=()=>prisma.$queryRaw<any[]>`SELECT
      (SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM "Transaction" t) AS transactions,
      (SELECT jsonb_agg(to_jsonb(g) ORDER BY id) FROM "Goal" g) AS goals,
      (SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM "Budget" b) AS budgets,
      (SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM "GoalLedgerEntry" l) AS ledger`;
    const snapshot=await fingerprint();
    assert.equal((await http('/auth/reset-password',body(raw))).status,200);
    assert.equal((await http('/auth/reset-password',body(raw))).status,400);
    const after=await prisma.user.findUniqueOrThrow({where:{id:u.id}});assert.equal(after.authVersion,1);assert.equal(after.role,'ADMIN');assert.equal(after.lastLoginAt,null);
    assert.equal((await http('/auth/me',undefined,old)).status,401);
    assert.equal((await http('/auth/login',{email:u.email,password})).status,401);
    assert.equal((await http('/auth/login',{email:u.email,password:next})).status,200);
    assert.deepEqual(await fingerprint(),snapshot);
  });
  await t.test('concurrent use: exactly one reset succeeds',async()=>{
    const u=await account(),raw=await issue(u);
    const results=await Promise.all([http('/auth/reset-password',body(raw)),http('/auth/reset-password',body(raw))]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).authVersion,1);
  });
  await t.test('expiry, revocation, closed user and password-version changes invalidate tokens',async()=>{
    for(const scenario of ['expiry','revocation','closed','version']){
      const u=await account(),raw=await issue(u),h=tokenHash(raw);
      if(scenario==='expiry')await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "createdAt"=CURRENT_TIMESTAMP-interval '16 minutes',"expiresAt"=CURRENT_TIMESTAMP-interval '1 minute' WHERE "tokenHash"=${h}`;
      if(scenario==='revocation')await prisma.$executeRaw`UPDATE "PasswordResetToken" SET "revokedAt"=CURRENT_TIMESTAMP WHERE "tokenHash"=${h}`;
      if(scenario==='closed')await prisma.user.update({where:{id:u.id},data:{deletedAt:new Date(),authVersion:{increment:1}}});
      if(scenario==='version')await prisma.user.update({where:{id:u.id},data:{authVersion:{increment:1}}});
      assert.equal((await http('/auth/reset-password',body(raw))).status,400);
      assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).passwordHash,hash);
    }
  });
  await t.test('database failure rolls back consumption and password; retry remains possible',async()=>{
    const u=await account(),raw=await issue(u);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION reset_test_block() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${u.id}' THEN RAISE EXCEPTION 'synthetic reset failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe('CREATE TRIGGER reset_test_block BEFORE UPDATE ON "User" FOR EACH ROW EXECUTE FUNCTION reset_test_block()');
    try {assert.equal((await http('/auth/reset-password',body(raw))).status,503);}
    finally {await prisma.$executeRawUnsafe('DROP TRIGGER reset_test_block ON "User"');await prisma.$executeRawUnsafe('DROP FUNCTION reset_test_block()');}
    const record=(await rows()).find(r=>r.tokenHash===tokenHash(raw));assert.equal(record.usedAt,null);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).authVersion,0);
    assert.equal((await http('/auth/reset-password',body(raw))).status,200);
  });
  await t.test('mail delivery failure gives neutral response, revokes token and logs no message content',async()=>{
    const u=await account(),logs:unknown[][]=[],warn=console.warn;console.warn=(...args)=>{logs.push(args);};sink.setFailure(true);
    try {
      assert.equal((await http('/auth/forgot-password',{email:u.email})).status,202);await service.drain();
      assert.deepEqual(logs,[['PASSWORD_RESET_DELIVERY_FAILED']]);assert.equal(sink.messages.filter(m=>m.to===u.email).length,0);
      assert.ok((await rows()).find(r=>r.userId===u.id).revokedAt);
    }finally{console.warn=warn;sink.setFailure(false);}
  });
  await t.test('validation rejects malformed token, mismatch, bcrypt truncation and role injection',async()=>{
    const u=await account(),raw=await issue(u);
    for(const input of [{...body(raw),token:'bad'},{...body(raw),confirmPassword:'mismatch'},{token:raw,newPassword:'ก'.repeat(25),confirmPassword:'ก'.repeat(25)},{...body(raw),role:'ADMIN'}])assert.equal((await http('/auth/reset-password',input)).status,400);
    assert.equal((await prisma.user.findUniqueOrThrow({where:{id:u.id}})).passwordHash,hash);
  });
  await t.test('IP limiter is atomic and survives service restart',async()=>{
    const ip=randomUUID();
    const restartConfig={...config,policy:{...RESET_POLICY,requestIp:{limit:20,windowMs:2147483000}}}; // Test-only long window avoids a 15-minute rollover during child startup.
    const worker=new PasswordResetService(prisma,restartConfig);
    const second=new PasswordResetService(prisma,restartConfig);
    const results=await Promise.allSettled(Array.from({length:25},(_,i)=>(i%2?second:worker).request(randomUUID()+'@example.test',ip)));
    await second.drain();
    assert.equal(results.filter(r=>r.status==='fulfilled').length,20);assert.equal(results.filter(r=>r.status==='rejected').length,5);
    const restarted=new PasswordResetService(prisma,restartConfig);
    await assert.rejects(restarted.request(randomUUID()+'@example.test',ip),(e:any)=>e.status===429);
    const {spawnSync}=await import('node:child_process');
    const {pathToFileURL}=await import('node:url');
    const source=JSON.stringify(require.resolve('../src/lib/passwordReset')),client=JSON.stringify(require.resolve('../src/lib/prisma'));
    const child=spawnSync(process.execPath,['--import',pathToFileURL(require.resolve('tsx')).href,'-e',
      'const {PasswordResetService,RESET_POLICY}=require('+source+');const {prisma}=require('+client+');(async()=>{try{const s=new PasswordResetService(prisma,{secret:process.env.RESET_RESTART_KEY,policy:{...RESET_POLICY,requestIp:{limit:20,windowMs:2147483000}},origin:"http://localhost:5173",mailer:{send:async()=>{}}});try{await s.request("restart@example.test",process.env.RESET_RESTART_IP);process.exitCode=2}catch(e){if(e.status!==429)process.exitCode=3}}finally{await prisma.$disconnect()}})().catch(()=>{process.exitCode=4})'],
      {env:{...process.env,RESET_RESTART_KEY:secret,RESET_RESTART_IP:ip},encoding:'utf8',windowsHide:true});
    assert.equal(child.status,0,'Independent process must observe shared persisted rate limit');
    await worker.drain();
  });
  await t.test('malformed JSON is redacted and body size is bounded',async()=>{
    const response=await fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:'{bad secret'});
    assert.equal(response.status,400);assert.ok(!(await response.text()).includes('secret'));
    const oversized=await fetch(base+'/auth/reset-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'x'.repeat(9000)})});
    assert.equal(oversized.status,400);assert.ok((await oversized.text()).length<300);
  });
  await t.test('browser: real mail/reset, explicit submit, repeat protection, mobile and keyboard',async()=>{
    const u=await account();const {verifyResetBrowser}=require('./passwordReset.browser.cjs');
    await verifyResetBrowser({base,email:u.email,password:next,tokenFor:rawFor,drain:()=>service.drain()});
    const after=await prisma.user.findUniqueOrThrow({where:{id:u.id}});assert.equal(after.authVersion,1);assert.ok(await bcrypt.compare(next,after.passwordHash));
  });

  await t.test('email hour cap remains after minute windows; only five deliveries',async()=>{
    const u=await account();
    const subject=createHmac('sha256',secret).update('email\0'+u.email).digest('hex');
    for(let i=0;i<6;i++){
      // Move past minute throttling without waiting an hour; only this synthetic limiter row is removed.
      await prisma.$executeRaw`DELETE FROM "PasswordResetRateLimit" WHERE scope='email-minute' AND "subjectHash"=${subject}`;
      await service.request(u.email,randomUUID());await service.drain();
    }
    assert.equal(sink.messages.filter(m=>m.to===u.email).length,5);
    const tokens=(await rows()).filter(r=>r.userId===u.id);
    assert.equal(tokens.length,5);
    const first=new URL(sink.messages.find(m=>m.to===u.email)!.resetUrl).hash.slice(7);
    await service.reset(first,next,randomUUID());
    const terminal=(await rows()).filter(r=>r.userId===u.id);
    assert.equal(terminal.filter(r=>r.usedAt!==null).length,1);
    assert.equal(terminal.filter(r=>r.revokedAt!==null).length,4);
  });
  await t.test('reset IP cap rejects attempt 31 even with distinct token hashes',async()=>{
    const ip=randomUUID();
    for(let i=0;i<30;i++)await assert.rejects(service.reset(randomBytes(32).toString('base64url'),next,ip),(e:any)=>e.status===400);
    await assert.rejects(service.reset(randomBytes(32).toString('base64url'),next,ip),(e:any)=>e.status===429);
  });
  await t.test('forwarding headers do not bypass request IP quota',async()=>{
    const subject=createHmac('sha256',secret).update('ip\0'+'127.0.0.1').digest('hex');
    // Express loopback can be IPv4 or IPv4-mapped; saturate the rows actually created by HTTP requests.
    await prisma.$executeRaw`UPDATE "PasswordResetRateLimit" SET hits=20 WHERE scope='request-ip' AND "subjectHash" IN
      (${subject},${createHmac('sha256',secret).update('ip\0'+'::ffff:127.0.0.1').digest('hex')})`;
    const r=await fetch(base+'/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json','X-Forwarded-For':'203.0.113.99'},body:JSON.stringify({email:randomUUID()+'@example.test'})});
    assert.equal(r.status,429);
  });
  await t.test('token limiter counts retries independent of source IP; no plaintext limiter subjects',async()=>{
    const raw=randomBytes(32).toString('base64url');
    for(let i=0;i<5;i++)await assert.rejects(service.reset(raw,next,randomUUID()),(e:any)=>e.status===400);
    await assert.rejects(service.reset(raw,next,randomUUID()),(e:any)=>e.status===429);
    const limits=await prisma.$queryRaw<{subjectHash:string}[]>`SELECT "subjectHash" FROM "PasswordResetRateLimit"`;
    assert.ok(limits.every(r=>/^[0-9a-f]{64}$/.test(r.subjectHash)));
  });
});
