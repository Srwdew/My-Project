// Dedicated ephemeral-port PostgreSQL container; no .env or application database access.
// Database/container are retained for inspection; this runner never resets/drops them.
const cp=require('child_process'),crypto=require('crypto'),path=require('path');
const cwd=path.resolve(__dirname,'..');
function run(cmd,args,env=process.env){const r=cp.spawnSync(cmd,args,{cwd,env,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(cmd+' failed (exit '+r.status+')');return r.stdout.trim();}
(async()=>{
 const suffix=Date.now()+'_'+crypto.randomBytes(3).toString('hex');
 const name='spendsense-ocr-hardening-'+suffix.replaceAll('_','-'),db='spendsense_goals_test_ocr_hardening_'+suffix;
 const password=crypto.randomBytes(24).toString('hex');
 run('docker',['run','-d','--name',name,'-e','POSTGRES_USER=category_test','-e','POSTGRES_PASSWORD','-e','POSTGRES_DB='+db,'-p','127.0.0.1::5432','postgres:16'],{...process.env,POSTGRES_PASSWORD:password});
 let ready=false;
 for(let i=0;i<60;i++){const r=cp.spawnSync('docker',['exec',name,'pg_isready','-U','category_test','-d',db],{stdio:'ignore',windowsHide:true});if(r.status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}
 if(!ready)throw Error('Isolated PostgreSQL readiness timed out');
 const port=JSON.parse(run('docker',['inspect',name]))[0].NetworkSettings.Ports['5432/tcp'][0].HostPort;
 const env={...process.env,DATABASE_URL:'postgresql://category_test:'+password+'@127.0.0.1:'+port+'/'+db,GOALS_TEST_DATABASE:db,JWT_SECRET:crypto.randomBytes(32).toString('hex')};
 console.log('Dedicated test container:',name);
 // Do not print migrate output: Prisma may print connection configuration.
 run(process.execPath,[require.resolve('prisma/build/index.js'),'migrate','deploy'],env);
 console.log('Migration deploy passed on empty isolated database (15 migration directories).');
 const args=['--import','tsx','tests/ocrHardening.browser.cjs'];
 const r=cp.spawnSync(process.execPath,args,{cwd,env,encoding:'utf8',windowsHide:true});
 const output=((r.stdout||'')+(r.stderr||'')).split(env.DATABASE_URL).join('[REDACTED_DATABASE_URL]').split(password).join('[REDACTED]');
 process.stdout.write(output);if(r.status!==0)process.exitCode=r.status||1;
 console.log('Test container retained; no application connection, reset or drop.');
})().catch(e=>{console.error(e.message);process.exitCode=1;});
