// Creates an isolated database; never resets/drops or seeds the user's database.
require('dotenv/config');
const {Client}=require('pg');
const {spawnSync}=require('node:child_process');
const crypto=require('node:crypto');
(async()=>{
 const url=new URL(process.env.DATABASE_URL);
 const name='spendsense_goals_test_'+Date.now()+'_'+crypto.randomBytes(3).toString('hex');
 const admin=new Client({connectionString:url.toString()});
 try {await admin.connect();await admin.query('CREATE DATABASE "'+name+'"');}finally{await admin.end();}
 url.pathname='/'+name;
 const env={...process.env,DATABASE_URL:url.toString(),GOALS_TEST_DATABASE:name};
 console.log('Isolated test database:',name);
 let r=spawnSync(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],{env,stdio:'inherit'});
 if(r.status!==0){process.exitCode=1;return;}
 r=spawnSync(process.execPath,['--import','tsx','--test','tests/goals.calculations.test.ts','tests/goals.database.test.ts'],{env,stdio:'inherit'});
 process.exitCode=r.status??1;
 if(r.status===0){
  r=spawnSync(process.execPath,['--import','tsx','--test','tests/budgetNotifications.test.ts','tests/notifications.http.test.ts','tests/reconciliation.frontend.test.ts','tests/reconciliation.database.test.ts'],{env,stdio:'inherit'});
  process.exitCode=r.status??1;
 }
 console.log('Test database retained for inspection; no existing database modified:',name);
})().catch(e=>{console.error('Test runner failed:',e.code||e.name);process.exitCode=1;});
