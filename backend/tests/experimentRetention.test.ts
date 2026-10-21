import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,writeFile,readFile,mkdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join,resolve} from 'node:path';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {expiry,deleteArtifact,inventory,type Artifact} from '../experiments/experimentRetentionFiles';
import {cleanup,register} from '../experiments/experimentRetentionCleanup';
import {withdrawExperiment,assertExperimentCollection,replayWithdrawals,purgeStatus,type RetentionTx} from '../src/lib/experimentRetention';
const created=new Date('2026-10-08T00:00:00Z');
test('30 days exact; protected pre-consent; failure/retry; metadata inventory only',async()=>{
 const root=await mkdtemp(join(tmpdir(),'spendsense-retention-'));const p=join(root,'synthetic.dump');await writeFile(p,'synthetic-not-a-backup');
 const a:Artifact={id:'a',path:p,kind:'backup',createdAt:created,state:'present'};
 assert.equal(expiry(created).toISOString(),'2026-11-07T00:00:00.000Z');
 assert.equal((await deleteArtifact(a,[root],new Date(+expiry(created)-1),true)).state,'waiting');
 assert.equal((await deleteArtifact({...a,createdAt:new Date('2026-09-24')},[root],new Date('2027-01-01'),true)).state,'protected');
 assert.equal((await deleteArtifact(a,[],expiry(created),true)).state,'failed');
 assert.equal((await inventory(root)).length,1);
 assert.equal((await deleteArtifact(a,[root],expiry(created),true)).state,'deleted');
 assert.equal((await deleteArtifact(a,[root],expiry(created),true)).state,'deleted');
 const p2=join(root,'report.json');await writeFile(p2,'synthetic');assert.equal((await deleteArtifact({...a,path:p2,kind:'export'},[root],created,true)).state,'deleted');
});
test('isolated PostgreSQL withdrawal, cleanup, replay and disabled admissions',async()=>{
 const url=process.env.RETENTION_TEST_DATABASE_URL??'';const u=new URL(url);if(!['127.0.0.1','localhost'].includes(u.hostname)||!u.pathname.startsWith('/spendsense_goals_test_'))throw Error('Isolated test database required');
 const pool=new Pool({connectionString:url});const root=await mkdtemp(join(tmpdir(),'spendsense-retention-db-'));
 const subject=randomUUID();const fingerprint=async()=>{const result=[];for(const name of ['Transaction','AnomalyEvaluation','AnomalyDecision','AnomalyPatternEvent']){const q=`SELECT md5(COALESCE(string_agg(row_to_json(t)::text,'' ORDER BY id),'')) AS fingerprint FROM public."${name}" t`;result.push((await pool.query(q)).rows);}return result;};const mainBefore=await fingerprint();
 const owner=await pool.query('INSERT INTO public."User"(id,email,"passwordHash","createdAt") VALUES($1,$2,$3,now()) RETURNING id',[subject,subject+'@example.invalid','synthetic-only']);
 async function tx<T>(fn:(t:RetentionTx)=>Promise<T>){const c=await pool.connect();try{await c.query('BEGIN');const t={$queryRawUnsafe:async(q:string,...v:any[])=>(await c.query(q,v)).rows,$executeRawUnsafe:async(q:string,...v:any[])=>{await c.query(q,v);return 0;}} as RetentionTx;const result=await fn(t);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
 try{
  const path=join(root,'synthetic.backup');await writeFile(path,'synthetic');const id=randomUUID();
  await pool.query("INSERT INTO experiment_retention.artifact(id,path,kind,created_at) VALUES($1,$2,'backup',$3)",[id,path,created]);
  await pool.query('INSERT INTO experiment_retention.artifact_subject VALUES($1,$2)',[id,subject]);
  await Promise.all([tx(t=>withdrawExperiment(t,subject)),assert.rejects(tx(t=>assertExperimentCollection(t,subject)),/disabled/)]);
  assert.equal(await tx(t=>purgeStatus(t,subject)),'stopped'); // Uncontrolled copies block completion.
  await pool.query('UPDATE experiment_retention.subject SET inventory_verified=true WHERE user_id=$1',[subject]); // Synthetic verified inventory only.
  assert.equal(await tx(t=>purgeStatus(t,subject)),'waiting_backups');
  await cleanup(pool,[root],true,new Date(+expiry(created)-1));assert.equal(await tx(t=>purgeStatus(t,subject)),'waiting_backups');
  await cleanup(pool,[],true,expiry(created));assert.equal(await tx(t=>purgeStatus(t,subject)),'waiting_backups');
  await cleanup(pool,[root],true,expiry(created));assert.equal(await tx(t=>purgeStatus(t,subject)),'complete');
  await tx(t=>withdrawExperiment(t,subject));assert.equal(await tx(t=>purgeStatus(t,subject)),'complete');
  const restoredUser=randomUUID();await pool.query('INSERT INTO public."User"(id,email,"passwordHash","createdAt") VALUES($1,$2,$3,now())',[restoredUser,restoredUser+'@example.invalid','synthetic-only']);
  await tx(t=>replayWithdrawals(t,[subject,restoredUser]));await assert.rejects(tx(t=>assertExperimentCollection(t,restoredUser)),/disabled/);
  assert.deepEqual(await fingerprint(),mainBefore);
 }finally{await pool.end();}
});

test('withdrawal/export race: real-data export is disabled before reading scope or writing files',async()=>{
 const {main}=await import('../experiments/anomalyToleranceReport');
 const root=await mkdtemp(join(tmpdir(),'spendsense-retention-export-'));
 await assert.rejects(main(['--scope',join(root,'never-read.json'),'--out',join(root,'out')]),/export disabled/);
 assert.equal((await inventory(root)).length,0);
});
test('HTTP close-account withdraws only experiment participation; main history retained',async()=>{
 const express=(await import('express')).default;const bcrypt=(await import('bcrypt')).default;const jwt=(await import('jsonwebtoken')).default;
 const {settingsRouter}=await import('../src/routes/settings');const {prisma}=await import('../src/lib/prisma');
 const password=randomUUID();const user=await prisma.user.create({data:{email:randomUUID()+'@example.invalid',passwordHash:await bcrypt.hash(password,4)}});
 const app=express();app.use(express.json());app.use(settingsRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const address=server.address() as {port:number};const token=jwt.sign({userId:user.id,email:user.email,authVersion:0},process.env.JWT_SECRET!);
 const response=await fetch('http://127.0.0.1:'+address.port+'/auth/close-account',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({currentPassword:password,confirmation:'ปิดบัญชีผู้ใช้'})});
 assert.equal(response.status,200);assert.ok((await prisma.user.findUniqueOrThrow({where:{id:user.id}})).deletedAt);
 const states=await prisma.$queryRawUnsafe<any[]>('SELECT * FROM experiment_retention.subject WHERE user_id=$1',user.id);assert.equal(states.length,1);assert.ok(states[0].database_purged_at);assert.equal(states[0].inventory_verified,false);
 }finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));await prisma.$disconnect();}
});
