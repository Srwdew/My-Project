import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { adminSummary, adminUsers, adminUsersQuery } from '../src/lib/admin';
import { bangkokToday } from '../src/lib/goalCalculations';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);
if(!db.startsWith('spendsense_admin_test_')||process.env.ADMIN_TEST_DATABASE!==db)throw Error('Explicit isolated Admin test database required');
test('Admin PostgreSQL / HTTP / real CLI',async t=>{
 process.env.JWT_SECRET=randomUUID();
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const address=server.address();assert.ok(address&&typeof address!=='string');
 t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const origin='http://127.0.0.1:'+address.port,password='Synthetic-'+randomUUID(),passwordHash=await bcrypt.hash(password,4);
 const account=(extra:any={})=>prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash,...extra}});
 const admin=await account(),member=await account(),closed=await account({deletedAt:new Date()}),next=await account();
 const token=(u:{id:string;email:string;authVersion:number},extra:any={})=>jwt.sign({userId:u.id,email:u.email,authVersion:u.authVersion,...extra},process.env.JWT_SECRET!);
 async function request(p:string,bearer:string|null=token(member),method='GET',body?:unknown,status=200){
  const r=await fetch(origin+p,{method,headers:{...(bearer?{Authorization:'Bearer '+bearer}:{}),'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const data=await r.json();assert.equal(r.status,status,p+' '+JSON.stringify(data));return {data,headers:r.headers};
 }
 async function cli(mode:string,target=admin,previous?:typeof admin,execute=false){
  const url=new URL(process.env.DATABASE_URL!);
  const args=['--import',pathToFileURL(require.resolve('tsx')).href,path.resolve(__dirname,'../src/cli/admin.ts'),'--mode',mode,'--target-id',target.id,'--target-email',target.email,'--database-name',db,'--database-host',url.host];
  if(previous)args.push('--previous-id',previous.id,'--previous-email',previous.email);
  if(execute)args.push('--execute','--confirm',[mode,previous?.id??'none',target.id].join(':'));
  return new Promise<{code:number|null;output:string}>((resolve,reject)=>{const p=spawn(process.execPath,args,{env:process.env,windowsHide:true});let output='';p.stdout.on('data',b=>output+=b);p.stderr.on('data',b=>output+=b);p.on('error',reject);p.on('close',code=>resolve({code,output}));});
 }
 await t.test('CLI bootstrap preview, execute, replay and closed target',async()=>{
  assert.equal((await cli('bootstrap')).code,0);assert.equal((await prisma.user.findUniqueOrThrow({where:{id:admin.id}})).role,'USER');
  assert.equal((await cli('bootstrap',closed,undefined,true)).code,1);
  assert.equal((await cli('bootstrap',{...admin,email:'wrong@example.invalid'},undefined,true)).code,1);
  assert.deepEqual((await Promise.all([cli('bootstrap',admin,undefined,true),cli('bootstrap',admin,undefined,true)])).map(r=>r.code),[0,0]);
  assert.equal((await cli('bootstrap',admin,undefined,true)).code,0);
  const u=await prisma.user.findUniqueOrThrow({where:{id:admin.id}});assert.equal(u.role,'ADMIN');assert.equal(u.authVersion,1);
  assert.equal((await cli('bootstrap',next,undefined,true)).code,1);
 });
 let adminToken='';
 await t.test('login sets lastLoginAt only on success; DB role and Setup behavior',async()=>{
  await request('/auth/login',null,'POST',{email:member.email,password:'incorrect'},401);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).lastLoginAt,null);
  const a=(await request('/auth/login',null,'POST',{email:admin.email,password,role:'USER'})).data;
  assert.equal(a.user.role,'ADMIN');assert.equal(a.showSetup,false);adminToken=a.token;
  const u=await prisma.user.findUniqueOrThrow({where:{id:admin.id}});assert.ok(u.lastLoginAt);assert.equal(u.setupPromptedAt,null);
  const m=(await request('/auth/login',null,'POST',{email:member.email,password})).data;assert.equal(m.user.role,'USER');assert.equal(m.showSetup,true);
  const before=(await prisma.user.findUniqueOrThrow({where:{id:member.id}})).lastLoginAt!.toISOString();
  await request('/auth/login',null,'POST',{email:member.email,password:'bad'},401);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).lastLoginAt!.toISOString(),before);
 });
 await t.test('deny anonymous/member/forged role/unknown admin endpoint and mass assignment',async()=>{
  await request('/admin/summary',null,'GET',undefined,401);
  await request('/admin/users',token(member),'GET',undefined,403);
  await request('/admin/unknown',token(member,{role:'ADMIN'}),'GET',undefined,403);
  await request('/admin/summary',token(closed),'GET',undefined,401);
  await request('/auth/register',null,'POST',{email:randomUUID()+'@example.invalid',password,role:'ADMIN'},400);
  const registered=(await request('/auth/register',null,'POST',{email:randomUUID()+'@example.invalid',password},201)).data;
  const fresh=await prisma.user.findUniqueOrThrow({where:{id:registered.user.id}});assert.equal(fresh.role,'USER');assert.equal(fresh.lastLoginAt,null);
  const settings=(await request('/settings')).data;
  await request('/settings',token(member),'PUT',{displayName:'Member',income:null,paydayDay:null,primaryGoalId:null,budgetMonth:settings.budgetMonth,budgetAmount:null,notifyNearLimit:false,notifyExceeded:false,role:'ADMIN'},400);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:member.id}})).role,'USER');
 });
 const exp=await prisma.category.create({data:{name:randomUUID(),type:'expense'}}),inc=await prisma.category.create({data:{name:randomUUID(),type:'income'}});
 const today=bangkokToday(),shift=(s:string,n:number)=>{const d=new Date(s+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d;};
 const add=(uid:string,type:'income'|'expense',date:Date,amount='123456.78')=>prisma.transaction.create({data:{userId:uid,categoryId:type==='expense'?exp.id:inc.id,type,transactionDate:date,amount,description:'PRIVATE_TRANSACTION_SENTINEL'}});
 await t.test('readiness 29/30 count x 29/30 inclusive days; future and income excluded',async()=>{
  for(const count of [29,30])for(const span of [29,30]){
   const u=await account();await prisma.transaction.createMany({data:Array.from({length:count},(_,i)=>({userId:u.id,categoryId:exp.id,type:'expense' as const,transactionDate:i===0?shift(today,1-span):shift(today,0),amount:'10'}))});
   const result=(await request('/admin/users?q='+u.id,adminToken)).data.items[0];assert.equal(result.basicReadiness,count===30&&span===30);assert.equal(result.transactionCount,count);
  }
  const u=await account();await add(u.id,'expense',shift(today,-40));await prisma.transaction.createMany({data:Array.from({length:29},()=>({userId:u.id,categoryId:exp.id,type:'expense' as const,transactionDate:shift(today,1),amount:'1'}))});await add(u.id,'income',shift(today,0));
  const v=(await request('/admin/users?q='+u.id,adminToken)).data.items[0];assert.equal(v.transactionCount,31);assert.equal(v.basicReadiness,false);
  const deleted=await account();const row=await add(deleted.id,'income',shift(today,0));const before=(await request('/admin/summary',adminToken)).data.startedMembers;await prisma.transaction.delete({where:{id:row.id}});
  assert.equal((await request('/admin/summary',adminToken)).data.startedMembers,before-1);
 });
 await t.test('summary excludes closed/admin; counts only current-month Bangkok signups',async()=>{
  await add(admin.id,'income',shift(today,0));await add(closed.id,'income',shift(today,0));
  const s=(await request('/admin/summary',adminToken));assert.match(s.headers.get('cache-control')!,/private, no-store/);
  assert.equal(s.data.totalMembers,await prisma.user.count({where:{role:'USER',deletedAt:null}}));
  assert.deepEqual((await request('/admin/users?q='+admin.id,adminToken)).data.items,[]);
  assert.deepEqual((await request('/admin/users?q='+closed.id,adminToken)).data.items,[]);
  const old=await account({createdAt:new Date('2001-12-31T16:59:59Z')}),boundary=await account({createdAt:new Date('2001-12-31T17:00:00Z')});
  const result=await prisma.$transaction(tx=>adminSummary(tx,'2002-01-01'));assert.equal(result.newMembers,1);
  assert.ok(old.id&&boundary.id);
  const leap=await account();await prisma.transaction.createMany({data:Array.from({length:30},(_,i)=>({userId:leap.id,categoryId:exp.id,type:'expense' as const,transactionDate:new Date(i===0?'2024-01-31':'2024-02-29'),amount:'1'}))});
  assert.equal((await prisma.$transaction(tx=>adminUsers(tx,adminUsersQuery.parse({q:leap.id}),'2024-02-29'))).items[0]!.basicReadiness,true);
 });
 await t.test('literal search, bounded stable keyset pagination, financial allowlist',async()=>{
  await prisma.profile.create({data:{userId:member.id,displayName:'ค้นหา %_ literal',income:'98765',goal:'PRIVATE_PROFILE_SENTINEL'}});
  await add(member.id,'expense',shift(today,0));
  const goal=await prisma.goal.create({data:{userId:member.id,name:'PRIVATE_GOAL_SENTINEL',targetAmount:'9999',categoryKey:'other'}});
  await prisma.budget.create({data:{userId:member.id,year:2020,month:1,amount:'999'}});
  for(const q of [member.id,member.email,'ค้นหา','%_'])assert.equal((await request('/admin/users?q='+encodeURIComponent(q),adminToken)).data.items[0].id,member.id);
  assert.equal((await request('/admin/users?q='+encodeURIComponent("' OR 1=1 --"),adminToken)).data.items.length,0);
  for(const q of ['limit=0','limit=101','limit=1.5','limit=x','q=x&q=y','userId='+member.id,'cursor='+closed.id])await request('/admin/users?'+q,adminToken,'GET',undefined,400);
  const same=new Date('2010-01-01');for(let i=0;i<4;i++)await account({createdAt:same});
  const ids:string[]=[];let cursor:string|null=null;
  do{const r=(await request('/admin/users?limit=3'+(cursor?'&cursor='+cursor:''),adminToken)).data;assert.ok(r.items.length<=3);for(const item of r.items){assert.deepEqual(Object.keys(item).sort(),['id','displayName','email','createdAt','lastLoginAt','transactionCount','basicReadiness'].sort());ids.push(item.id);}cursor=r.nextCursor;}while(cursor);
  assert.equal(new Set(ids).size,ids.length);assert.equal(ids.length,await prisma.user.count({where:{role:'USER',deletedAt:null}}));
  const body=JSON.stringify((await request('/admin/users?limit=100',adminToken)).data);for(const secret of ['PRIVATE_','amount','passwordHash','authVersion','income','budget','targetAmount'])assert.ok(!body.includes(secret));
  await request('/goals/'+goal.id,adminToken,'GET',undefined,404);
  const txBefore=await prisma.transaction.count(),ledgerBefore=await prisma.goalLedgerEntry.count();
  await request('/admin/summary',adminToken);await request('/admin/users',adminToken);
  assert.equal(await prisma.transaction.count(),txBefore);assert.equal(await prisma.goalLedgerEntry.count(),ledgerBefore);
 });
 await t.test('real CLI concurrent rotation, replay, revoke existing token and recovery from closed admin',async()=>{
  const financialFingerprint=async()=>{
    const result:Record<string,unknown>={};
    for(const table of ['Transaction','Goal','Budget','GoalLedgerEntry','AnomalyEvaluation','AnomalyDecision']){
      result[table]=await prisma.$queryRawUnsafe(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,'[]')) AS hash FROM "${table}" t`);
    }
    return result;
  };
  const financeBefore=await financialFingerprint();
  const third=await account();
  const results=await Promise.all([cli('rotate',next,admin,true),cli('rotate',third,admin,true)]);
  assert.equal(results.filter(r=>r.code===0).length,1);
  const current=await prisma.user.findFirstOrThrow({where:{role:'ADMIN'}});
  const target=current.id===next.id?next:third;
  assert.equal((await cli('rotate',target,admin,true)).code,0);
  assert.equal((await prisma.user.findUniqueOrThrow({where:{id:target.id}})).authVersion,1);
  await request('/admin/summary',adminToken,'GET',undefined,401);
  const demoted=await prisma.user.findUniqueOrThrow({where:{id:admin.id}});
  await request('/admin/summary',token(demoted,{role:'ADMIN'}),'GET',undefined,403);
  await prisma.user.update({where:{id:current.id},data:{deletedAt:new Date(),authVersion:{increment:1}}});
  assert.equal((await cli('rotate',member,target,true)).code,1);
  assert.equal((await cli('recover',member,target,true)).code,0);
  assert.equal((await cli('recover',member,target,true)).code,0);
  const recovered=await prisma.user.findUniqueOrThrow({where:{id:member.id}});assert.equal(recovered.role,'ADMIN');assert.equal(recovered.authVersion,1);
  const old=await prisma.user.findUniqueOrThrow({where:{id:current.id}});assert.equal(old.role,'USER');assert.ok(old.deletedAt);
  assert.deepEqual(await financialFingerprint(),financeBefore);
 });
});
