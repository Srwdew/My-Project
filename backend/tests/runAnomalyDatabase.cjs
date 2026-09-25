// Isolated databases only. Old migration bytes are copied verbatim to a temporary chain.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{spawnSync}=require('child_process'),{randomBytes,randomUUID}=require('crypto');
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
(async()=>{
 const url=new URL(process.env.DATABASE_URL);
 if(!url.pathname.startsWith('/spendsense_goals_test_'))throw Error('An isolated admin database is required');
 const name='spendsense_goals_test_'+Date.now()+'_'+randomBytes(3).toString('hex');
 const admin=new Client({connectionString:url.toString()});
 try{await admin.connect();await admin.query('CREATE DATABASE "'+name+'"');}finally{await admin.end();}
 url.pathname='/'+name;const env={...process.env,DATABASE_URL:url.toString(),GOALS_TEST_DATABASE:name};
 console.log('Isolated test database:',name);
 const run=args=>{const r=spawnSync(process.execPath,args,{env,stdio:'inherit'});if(r.status)throw Error('Test command failed');};
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-anomaly-migration-'));
 const migrations=path.join(temp,'migrations');fs.mkdirSync(migrations);
 for(const item of fs.readdirSync('prisma/migrations')){
  if(item==='20260923010000_add_transaction_anomaly'||item==='20260924010000_add_anomaly_review')continue;
  fs.cpSync(path.join('prisma/migrations',item),path.join(migrations,item),{recursive:true});
 }
 const config=path.join(temp,'prisma.config.ts');
 fs.writeFileSync(config,'export default {schema:'+JSON.stringify(path.resolve('prisma/schema.prisma'))+',migrations:{path:'+JSON.stringify(migrations)+'},datasource:{url:process.env.DATABASE_URL}};');
 const cli=require.resolve('prisma/build/index.js');
 run([cli,'migrate','deploy','--config',config]);
 const c=new Client({connectionString:url.toString()});const user=randomUUID(),category=randomUUID(),transaction=randomUUID();
 try{
  await c.connect();
  await c.query('INSERT INTO "User" (id,email,"passwordHash") VALUES ($1,$2,$3)',[user,user+'@example.invalid','unusable-synthetic-fixture']);
  await c.query('INSERT INTO "Category" (id,name,type) VALUES ($1,$2,$3)',[category,category,'expense']);
  await c.query('INSERT INTO "Transaction" (id,"userId","categoryId",type,amount,"transactionDate","transactionTime","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())',[transaction,user,category,'expense','0.07','2026-01-01','12:34:00']);
  run([cli,'migrate','deploy']);
  const r=await c.query('SELECT "transactionTimeConfirmed","anomalyRevision","anomalyPending","transactionTime"::text AS time FROM "Transaction" WHERE id=$1',[transaction]);
  assert.deepEqual(r.rows[0],{transactionTimeConfirmed:false,anomalyRevision:0,anomalyPending:false,time:'12:34:00'});
  assert.equal((await c.query('SELECT count(*)::int AS n FROM "AnomalyEvaluation"')).rows[0].n,0);
  console.log('PASS legacy timed transaction remains unconfirmed; no evaluation backfill; full 12 migration chain');
 }finally{await c.end();}
 run(['--import','tsx','--test','--test-concurrency=1','tests/anomaly.test.ts','tests/anomaly.database.test.ts','tests/dashboard.test.ts','tests/dashboard.database.test.ts','tests/settings.database.test.ts','tests/goals.calculations.test.ts','tests/goals.database.test.ts','tests/budgetNotifications.test.ts','tests/notifications.http.test.ts','tests/reconciliation.frontend.test.ts','tests/reconciliation.database.test.ts']);
 console.log('Database and temporary migration fixture retained; no reset/drop performed:',name);
})().catch(e=>{console.error('Test runner failed:',e.code||e.name);process.exitCode=1;});