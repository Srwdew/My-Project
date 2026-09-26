// Run only against caller-selected isolated test databases. Never reset/drop.
require('dotenv').config({quiet:true});
const {Client}=require('pg'),{spawnSync}=require('child_process'),{randomBytes,createHash}=require('crypto'),fs=require('fs'),assert=require('assert/strict');
(async()=>{
 const url=new URL(process.env.DATABASE_URL);
 if(!url.pathname.startsWith('/spendsense_goals_test_'))throw Error('Isolated test database required');
 const upgrade=process.env.ANOMALY_REVIEW_UPGRADE==='1';
 const c=new Client({connectionString:url.toString()});await c.connect();
 const oldState={};
 const fingerprint=async(db)=>{const out={};for(const table of ['Transaction','AnomalyEvaluation','Notification','GoalLedgerEntry'])out[table]=(await db.query('SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY id)::text,\'\')) AS digest FROM "'+table+'" t')).rows[0].digest;return out;};
 try{
  if(upgrade){
   const rows=(await c.query('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows;
   assert.equal(rows.length,11,'Upgrade requires the retained 11-migration database');
   for(const row of rows)assert.equal(createHash('sha256').update(fs.readFileSync('prisma/migrations/'+row.migration_name+'/migration.sql')).digest('hex'),row.checksum,'Applied migration bytes changed');
   Object.assign(oldState,await fingerprint(c));
  }else{const name='spendsense_goals_test_'+Date.now()+'_'+randomBytes(3).toString('hex');await c.query('CREATE DATABASE "'+name+'"');url.pathname='/'+name;}
 }finally{await c.end();}
 const env={...process.env,DATABASE_URL:url.toString(),GOALS_TEST_DATABASE:url.pathname.slice(1)};
 const run=args=>{const r=spawnSync(process.execPath,args,{env,stdio:'inherit'});if(r.status)throw Error('Verification command failed');};
 run([require.resolve('prisma/build/index.js'),'migrate','deploy']);
 const verify=new Client({connectionString:url.toString()});try{await verify.connect();assert.equal((await verify.query('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL')).rows[0].n,12);if(upgrade)assert.deepEqual(await fingerprint(verify),oldState);}finally{await verify.end();}
 console.log(upgrade?'PASS retained database 11 -> 12; prior records unchanged':'PASS empty database -> 12 migrations');
 const tests=['tests/forecast.test.ts','tests/forecast.backtest.test.ts','tests/forecast.database.test.ts','tests/anomalyReview.database.test.ts','tests/anomaly.test.ts','tests/anomaly.database.test.ts'];
 if(!upgrade)tests.push('tests/dashboard.test.ts','tests/dashboard.database.test.ts','tests/settings.database.test.ts','tests/goals.calculations.test.ts','tests/goals.database.test.ts','tests/budgetNotifications.test.ts','tests/notifications.http.test.ts','tests/reconciliation.frontend.test.ts','tests/reconciliation.database.test.ts');
 run(['--import','tsx','--test','--test-concurrency=1',...tests]);
 console.log('Test database retained:',url.pathname.slice(1));
})().catch(e=>{console.error('Review verification failed:',e.code||e.name);process.exitCode=1;});