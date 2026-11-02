import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import jwt from 'jsonwebtoken';
import {prisma} from '../src/lib/prisma';import {app} from '../src/index';
const db=new URL(process.env.DATABASE_URL!).pathname.slice(1);if(!db.startsWith('spendsense_goals_test_')||process.env.GOALS_TEST_DATABASE!==db)throw Error('Isolated anomaly database required');

// ISSUE-ANOM-1 over real HTTP/PostgreSQL: 90 days near 100 baht, then 10 days at 250 baht in one category.
const day=(i:number)=>new Date(Date.UTC(2026,4,1+i));
const SHIFT_AT=90,DAYS=100;
test('level shift: one notice, one queue entry, confirm writes per-item decisions, append-only',async t=>{
 process.env.JWT_SECRET=randomUUID();const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const addr=server.address();assert.ok(addr&&typeof addr!=='string');t.after(async()=>{await new Promise<void>(r=>server.close(()=>r()));await prisma.$disconnect();});
 const account=async()=>{const u=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:'synthetic-no-login'}});await prisma.anomalyNotificationSetting.create({data:{userId:u.id,enabled:true}});return {...u,token:jwt.sign({userId:u.id,email:u.email,authVersion:u.authVersion},process.env.JWT_SECRET!)};};
 async function req(who:{token:string},path:string,method='GET',body?:unknown,status=200){const r=await fetch('http://127.0.0.1:'+addr.port+path,{method,headers:{Authorization:'Bearer '+who.token,'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const v=await r.json() as any;assert.equal(r.status,status,path+' '+JSON.stringify(v));return v;}
 async function seed(who:{id:string},categoryId:string,from:number,to:number,amount:(i:number)=>string){for(let i=from;i<to;i++)await prisma.transaction.create({data:{userId:who.id,type:'expense',categoryId,amount:amount(i),transactionDate:day(i),anomalyRevision:1,anomalyPending:true}});}
 async function reconcile(who:{token:string}){let cursor:string|undefined;for(;;){const r=await req(who,'/notifications/anomaly/reconcile','POST',{limit:50,...(cursor?{cursor}:{})});if(!r.hasMore)break;cursor=r.nextCursor;}}
 const notices=async(userId:string)=>{const n=await prisma.notification.findMany({where:{userId,type:'transaction_anomaly'}});return {items:n.filter(x=>x.eventKey.startsWith('transaction-anomaly:')).length,shifts:n.filter(x=>x.eventKey.startsWith('anomaly-level-shift:')).length};};
 const level=(i:number)=>i<SHIFT_AT?String(95+(i*7)%11):'250';
 const a=await account(),b=await account();
 const cat=await prisma.category.create({data:{name:'เดินทาง-'+randomUUID(),type:'expense'}});
 await seed(a,cat.id,0,DAYS,level);await reconcile(a);

 await t.test('detects one up shift starting on the first high day',async()=>{
  const s=await prisma.anomalyLevelShift.findMany({where:{userId:a.id}});
  assert.equal(s.length,1);assert.equal(s[0]!.direction,'up');assert.equal(s[0]!.startDate.toISOString().slice(0,10),day(SHIFT_AT).toISOString().slice(0,10));
  const ev=s[0]!.evidence as any;assert.equal(ev.transactions.length,7);assert.ok(ev.transactions.filter((x:any)=>x.direction==='up').length>=5);
 });
 await t.test('notices: 4 per-item before detection, then one shift notice; nothing per item afterwards',async()=>{
  assert.deepEqual(await notices(a.id),{items:4,shifts:1});
  assert.equal(await prisma.anomalyEvaluation.count({where:{userId:a.id,outcome:'flagged'}}),10,'every high item is still flagged');
  const n=await prisma.notification.findFirstOrThrow({where:{userId:a.id,eventKey:{startsWith:'anomaly-level-shift:'}}});
  console.log('LEVEL_SHIFT_NOTICE',JSON.stringify({title:n.title,message:n.message}));
  assert.match(n.message,/รายการที่ควรตรวจสอบ/,'says where to answer');assert.equal(n.link,'/anomaly','opens the queue');assert.doesNotMatch(n.message,/MAD|z-score|\d{4}-\d{2}-\d{2}/,'no statistics, no ISO date');
 });
 let shiftId='';
 await t.test('queue shows the shift once instead of 10 items',async()=>{
  const q=await req(a,'/anomaly/queue?filter=waiting');
  assert.equal(q.items.length,0);assert.equal(q.levelShifts.length,1);assert.equal(q.total,1);assert.equal(q.levelShifts[0].covered,10);shiftId=q.levelShifts[0].id;
 });
 await t.test('detections and actions are append-only',async()=>{
  await assert.rejects(prisma.anomalyLevelShift.update({where:{id:shiftId},data:{direction:'down'}}));
  await assert.rejects(prisma.anomalyLevelShift.delete({where:{id:shiftId}}));
  await assert.rejects(prisma.anomalyLevelShiftAction.create({data:{userId:a.id,levelShiftId:shiftId,action:'confirmed',sequence:2}}),'sequence must follow the chain');
  await req(b,`/anomaly/level-shifts/${shiftId}/action`,'POST',{action:'confirmed',expectedActionId:null},404);
 });
 await t.test('confirm: one normal decision per flagged item, tied to its revision and the shift; queue empties',async()=>{
  const r=await req(a,`/anomaly/level-shifts/${shiftId}/action`,'POST',{action:'confirmed',expectedActionId:null},201);
  assert.equal(r.decided,10);
  const d=await prisma.anomalyDecision.findMany({where:{userId:a.id}});assert.equal(d.length,10);assert.ok(d.every(x=>x.action==='normal'&&x.dimension==='amount'&&x.levelShiftId===shiftId&&x.revision===1));
  await req(a,`/anomaly/level-shifts/${shiftId}/action`,'POST',{action:'rejected',expectedActionId:null},409);
  await assert.rejects(prisma.anomalyLevelShiftAction.update({where:{id:r.action.id},data:{action:'rejected'}}));
  const q=await req(a,'/anomaly/queue?filter=waiting');assert.equal(q.total,0);assert.equal(q.levelShifts.length,0);
 });
 await t.test('after confirm, a new item at the new level is not flagged and sends nothing',async()=>{
  await seed(a,cat.id,DAYS,DAYS+1,()=>'250');await reconcile(a);
  const t2=await prisma.transaction.findFirstOrThrow({where:{userId:a.id,transactionDate:day(DAYS)}});
  const e=await prisma.anomalyEvaluation.findFirstOrThrow({where:{originalTransactionId:t2.id}});assert.notEqual(e.outcome,'flagged');
  assert.deepEqual(await notices(a.id),{items:4,shifts:1});
 });
 await t.test('reject: items return to the queue one by one, no notices sent after the fact',async()=>{
  const cb=await prisma.category.create({data:{name:'เดินทาง-'+randomUUID(),type:'expense'}});
  await seed(b,cb.id,0,DAYS,level);await reconcile(b);
  const before=await notices(b.id);assert.deepEqual(before,{items:4,shifts:1});
  const id=(await req(b,'/anomaly/queue?filter=waiting')).levelShifts[0].id;
  await req(b,`/anomaly/level-shifts/${id}/action`,'POST',{action:'rejected',expectedActionId:null},201);
  const q=await req(b,'/anomaly/queue?filter=waiting');assert.equal(q.levelShifts.length,0);assert.equal(q.items.length,10);
  assert.deepEqual(await notices(b.id),before);
  assert.equal(await prisma.anomalyDecision.count({where:{userId:b.id}}),0);
 });
 await t.test('two rejections in a row are listed for Settings, and reopening lifts the block',async()=>{
  assert.deepEqual((await req(b,'/anomaly/level-shifts/blocked')).items,[],'one rejection is not a block');
  const first=await prisma.anomalyLevelShift.findFirstOrThrow({where:{userId:b.id},include:{actions:true}});
  await req(b,`/anomaly/level-shifts/${first.id}/action`,'POST',{action:'reopened',expectedActionId:first.actions[0]!.id},201);
  await req(b,`/anomaly/level-shifts/${first.id}/action`,'POST',{action:'rejected',expectedActionId:(await prisma.anomalyLevelShiftAction.findFirstOrThrow({where:{levelShiftId:first.id,sequence:2}})).id},201);
  // A second shift for the same category and direction, rejected as well (detections are written by the system only).
  const second=await prisma.anomalyLevelShift.create({data:{userId:b.id,categoryId:first.categoryId,direction:'up',startDate:day(DAYS+5),ruleVersion:first.ruleVersion,evidence:{synthetic:true}}});
  await req(b,`/anomaly/level-shifts/${second.id}/action`,'POST',{action:'rejected',expectedActionId:null},201);
  const list=(await req(b,'/anomaly/level-shifts/blocked')).items;assert.equal(list.length,1);assert.equal(list[0].id,second.id);assert.equal(list[0].direction,'up');
  await req(a,'/anomaly/level-shifts/blocked').then(r=>assert.deepEqual(r.items,[]),'owner only');
  await req(b,`/anomaly/level-shifts/${shiftId}/action`,'POST',{action:'reopened',expectedActionId:null},404);
  await req(a,`/anomaly/level-shifts/${shiftId}/action`,'POST',{action:'reopened',expectedActionId:(await prisma.anomalyLevelShiftAction.findFirstOrThrow({where:{levelShiftId:shiftId}})).id},409);
  await req(b,`/anomaly/level-shifts/${second.id}/action`,'POST',{action:'reopened',expectedActionId:list[0].actionId},201);
  assert.deepEqual((await req(b,'/anomaly/level-shifts/blocked')).items,[]);
 });
});
