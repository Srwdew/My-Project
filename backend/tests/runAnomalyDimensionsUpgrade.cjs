// Upgrade verification on a fresh database inside an already verified isolated test instance.
// No reset/drop, no .env loading. Existing databases are never modified.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),assert=require('assert/strict'),{randomUUID}=require('crypto'),{Client}=require('pg');
(async()=>{
 const url=new URL(process.env.DATABASE_URL);
 if(!url.pathname.startsWith('/spendsense_goals_test_')||url.pathname.slice(1)!==process.env.GOALS_TEST_DATABASE)throw Error('Isolated test database required');
 const name='spendsense_goals_test_anomaly_upgrade_'+Date.now(),admin=new Client({connectionString:url.toString()});
 try{await admin.connect();await admin.query('CREATE DATABASE "'+name+'"');}finally{await admin.end();}
 url.pathname='/'+name;const env={...process.env,DATABASE_URL:url.toString(),GOALS_TEST_DATABASE:name};
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'anomaly-upgrade-')),migrations=path.join(temp,'migrations');fs.mkdirSync(migrations);
 for(const entry of fs.readdirSync('prisma/migrations')){if(entry.startsWith('20261005'))continue;fs.cpSync(path.join('prisma/migrations',entry),path.join(migrations,entry),{recursive:true});}
 const config=path.join(temp,'prisma.config.ts');
 const configFor=dir=>'export default {schema:'+JSON.stringify(path.resolve('prisma/schema.prisma'))+',migrations:{path:'+JSON.stringify(dir)+'},datasource:{url:process.env.DATABASE_URL}};';
 fs.writeFileSync(config,configFor(migrations));
 const migrate=()=>{const r=cp.spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy','--config',config],{env,stdio:'inherit'});if(r.status)throw Error('Migration failed');};
 migrate();
 const db=new Client({connectionString:url.toString()}),user=randomUUID(),category=randomUUID(),transaction=randomUUID(),evaluation=randomUUID(),review=randomUUID();
 try{
  await db.connect();
  await db.query('INSERT INTO "User"(id,email,"passwordHash") VALUES($1,$2,$3)',[user,user+'@example.invalid','synthetic-no-login']);
  await db.query('INSERT INTO "Category"(id,name,type) VALUES($1,$2,$3)',[category,'synthetic '+category,'expense']);
  await db.query('INSERT INTO "Transaction"(id,"userId","categoryId",type,amount,"transactionDate","updatedAt","anomalyRevision") VALUES($1,$2,$3,$4,$5,$6,NOW(),1)',[transaction,user,category,'expense','123.45','2026-09-01']);
  await db.query('INSERT INTO "AnomalyEvaluation"(id,"userId","originalTransactionId",revision,"ruleVersion",outcome,snapshot) VALUES($1,$2,$3,1,$4,$5,$6)',[evaluation,user,transaction,'legacy-synthetic','not_flagged',JSON.stringify({transaction:{amount:'123.45',categoryId:category,date:'2026-09-01'},synthetic:true})]);
  await db.query('INSERT INTO "AnomalyReview"(id,"userId","evaluationId","originalTransactionId",revision,action,sequence) VALUES($1,$2,$3,$4,1,$5,1)',[review,user,evaluation,transaction,'confirmed_normal']);
  await db.query('INSERT INTO "AnomalyReviewRequest"("userId","idempotencyKey","requestFingerprint","reviewId","responseStatus") VALUES($1,$2,$3,$4,201)',[user,randomUUID(),'a'.repeat(64),review]);
  const fingerprint=async()=>{const out={};for(const table of ['User','Transaction','AnomalyEvaluation','AnomalyReview','AnomalyReviewRequest'])out[table]=(await db.query('SELECT md5(jsonb_agg(to_jsonb(t))::text) AS digest FROM "'+table+'" t')).rows[0].digest;return out;};
  const before=await fingerprint();fs.writeFileSync(config,configFor(path.resolve('prisma/migrations')));migrate();assert.deepEqual(await fingerprint(),before);
  const history=(await db.query('SELECT revision,snapshot,provenance FROM "AnomalyRevision"')).rows;
  assert.equal(history.length,1);assert.equal(history[0].revision,1);assert.equal(history[0].snapshot.amount,'123.45');assert.equal(history[0].provenance,'migration_current');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "AnomalyDecision"')).rows[0].n,0);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "AnomalyPattern"')).rows[0].n,0);
  console.log('PASS upgrade 15 -> 18 migrations; legacy user/transaction/evaluation/review/receipt fingerprints unchanged; only current revision backfilled; no fabricated decisions/patterns.');
  console.log('Retained isolated upgrade database:',name);
 }finally{await db.end();}
})().catch(e=>{console.error('Upgrade verification failed:',e.code||e.message);process.exitCode=1;});
