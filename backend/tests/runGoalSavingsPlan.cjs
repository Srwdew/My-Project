// Fresh disposable PostgreSQL instance only. Never loads .env or connects to existing databases.
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process'),crypto=require('crypto'),assert=require('assert/strict');
const stamp=Date.now(),name='spendsense_goals_plan_test_'+stamp,container='spendsense-goals-plan-test-'+stamp;
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-goals-plan-'));
const hook=path.join(tmp,'no-env.cjs').split(path.sep).join('/');
fs.writeFileSync(hook,"const d=require("+JSON.stringify(require.resolve('dotenv'))+");d.config=()=>({parsed:{}});d.configDotenv=()=>({parsed:{}});");
const run=(cmd,args,options={})=>{const r=cp.spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,...options});if(r.status!==0)throw Error('Command failed: '+cmd+' '+(r.stderr||r.stdout));return r.stdout;};
(async()=>{
 const password=crypto.randomBytes(24).toString('hex');
 run('docker',['run','-d','--name',container,'--label','spendsense.scope=goals-plan-synthetic-test','-e','POSTGRES_DB='+name,'-e','POSTGRES_USER=goal_test','-e','POSTGRES_PASSWORD='+password,'-p','127.0.0.1::5432','postgres:16']);
 const binding=JSON.parse(run('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',container]))['5432/tcp'][0];
 assert.equal(binding.HostIp,'127.0.0.1');
 const url='postgresql://goal_test:'+password+'@127.0.0.1:'+binding.HostPort+'/'+name;
 const {Client}=require('pg');let ready=false;
 for(let i=0;i<60;i++){const c=new Client({connectionString:url});try{await c.connect();assert.equal((await c.query('select current_database() as name')).rows[0].name,name);ready=true;break;}catch{}finally{await c.end().catch(()=>{});}await new Promise(r=>setTimeout(r,500));}
 assert.ok(ready);console.log('Verified isolated database:',name,'container:',container);
 const env={...process.env,DATABASE_URL:url,GOALS_TEST_DATABASE:name,JWT_SECRET:crypto.randomBytes(32).toString('hex'),DOTENV_CONFIG_PATH:path.join(tmp,'absent.env'),NODE_OPTIONS:'--require "'+hook+'"',ANOMALY_EXPERIMENT_COLLECTION_ENABLED:'false'};
 const runNode=args=>{const r=cp.spawnSync(process.execPath,args,{env,stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('Test/build command failed');};
 runNode([require.resolve('prisma/build/index.js'),'migrate','deploy']);
 runNode([require.resolve('prisma/build/index.js'),'migrate','status']);
 runNode(['--import','tsx','--test','--test-concurrency=1','tests/goalSavingsPlan.test.ts','tests/goals.calculations.test.ts','tests/goalFeasibility.test.ts','tests/goalSavingsPlan.database.test.ts','tests/cycleDefaults.database.test.ts']);
 console.log('Synthetic test database retained; no UAT/application database accessed:',name);
})().catch(e=>{console.error(e.message.includes('Command failed')?'Isolated command failed (connection details suppressed)':e.message);process.exitCode=1;});
