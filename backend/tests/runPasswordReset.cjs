// Creates only new isolated test resources. Does not read .env or delete existing data.
const cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const {pathToFileURL}=require('url');
const backend=path.resolve(__dirname,'..'),root=path.resolve(backend,'..');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-reset-test-'));
const suffix=Date.now()+'_'+crypto.randomBytes(3).toString('hex');
const container='spendsense-reset-test-'+suffix.replaceAll('_','-');
const password=crypto.randomBytes(32).toString('hex');
const run=(cmd,args,options={})=>{
 const r=cp.spawnSync(cmd,args,{encoding:'utf8',windowsHide:true,maxBuffer:10000000,...options});
 if(r.status!==0)throw Error('Test setup command failed');return r.stdout;
};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 run('docker',['ps','--format','{{.Names}}']);
 run('docker',['run','-d','--name',container,'-e','POSTGRES_USER=reset_test','-e','POSTGRES_PASSWORD','-p','127.0.0.1::5432','postgres:16'],
   {env:{...process.env,POSTGRES_PASSWORD:password}});
 const port=run('docker',['port',container,'5432/tcp']).trim().split(':').pop();
 const {Client}=require('pg');
 const connection=database=>'postgresql://reset_test:'+password+'@127.0.0.1:'+port+'/'+database;
 let admin=null;
 for(let i=0;i<90;i++){
  const candidate=new Client({connectionString:connection('postgres'),connectionTimeoutMillis:1000});
  try {await candidate.connect();await candidate.query('SELECT 1');admin=candidate;break;}
  catch{await candidate.end().catch(()=>{});await delay(500);}
 }
 if(!admin)throw Error('Isolated PostgreSQL did not become ready');
 const config=path.join(temp,'prisma.config.ts'),migrations=path.join(backend,'prisma/migrations');
 const prisma=require.resolve('prisma/build/index.js'),tsx=pathToFileURL(require.resolve('tsx')).href;
 const writeConfig=dir=>fs.writeFileSync(config,'export default {schema:'+JSON.stringify(path.join(backend,'prisma/schema.prisma'))+',migrations:{path:'+JSON.stringify(dir)+'},datasource:{url:process.env.DATABASE_URL}};');
 const suites=[['reset','passwordReset.database.test.ts']];
 if(process.argv.includes('--with-regressions'))suites.push(['admin','admin.database.test.ts'],['goals','settings.database.test.ts']);
 let failed=false;
 try {
  for(const [family,file] of suites){
   const database='spendsense_'+family+'_test_'+suffix;
   await admin.query('CREATE DATABASE "'+database+'"');
   const env={...process.env,DATABASE_URL:connection(database)+'?schema=public',RESET_TEST_DATABASE:database,ADMIN_TEST_DATABASE:database,GOALS_TEST_DATABASE:database,
     NODE_ENV:'test',PASSWORD_RESET_MODE:'disabled',DOTENV_CONFIG_PATH:path.join(temp,'absent.env')};
   const client=new Client({connectionString:env.DATABASE_URL});await client.connect();
   const target=await client.query('SELECT current_database() AS name');
   if(target.rows[0].name!==database)throw Error('Unexpected database');
   if(family==='reset'){
    const prior=path.join(temp,'prior');fs.mkdirSync(prior);
    for(const entry of fs.readdirSync(migrations,{withFileTypes:true})){
      if(entry.isDirectory()&&entry.name>='20261009020000_add_password_reset')continue;
      fs.cpSync(path.join(migrations,entry.name),path.join(prior,entry.name),{recursive:true});
    }
    writeConfig(prior);run(process.execPath,[prisma,'migrate','deploy','--config',config],{cwd:temp,env});
    await client.query('INSERT INTO "User" (id,email,"passwordHash") VALUES ($1,$2,$3)',
      ['reset-upgrade-sentinel','sentinel@example.test','disabled-synthetic-not-a-password-hash']);
    const before=await client.query('SELECT row_to_json(u) AS row FROM "User" u WHERE id=$1',['reset-upgrade-sentinel']);
    writeConfig(migrations);run(process.execPath,[prisma,'migrate','deploy','--config',config],{cwd:temp,env});
    const after=await client.query('SELECT row_to_json(u) AS row FROM "User" u WHERE id=$1',['reset-upgrade-sentinel']);
    if(JSON.stringify(before.rows)!==JSON.stringify(after.rows))throw Error('Additive upgrade changed old row');
    console.log('PASS additive upgrade: existing User unchanged');
   }else{
    writeConfig(migrations);run(process.execPath,[prisma,'migrate','deploy','--config',config],{cwd:temp,env});
   }
   const status=await client.query('SELECT count(*)::int AS migrations,count(*) FILTER (WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)::int AS pending FROM "_prisma_migrations"');
   await client.end();
   console.log('ISOLATED_TARGET',JSON.stringify({container,host:'127.0.0.1:'+port,database,...status.rows[0]}));
   const migrationStatus=run(process.execPath,[prisma,'migrate','status','--config',config],{cwd:temp,env});
   if(!migrationStatus.includes('up to date'))throw Error('Migration status not current');
   if(family==='reset'){
    run(process.execPath,[prisma,'generate','--config',config],{cwd:temp,env});
    const build=cp.spawnSync(process.execPath,[require.resolve('typescript/bin/tsc')],{cwd:backend,env,encoding:'utf8'});
    console.log('BACKEND_BUILD',build.status);if(build.status!==0){process.stdout.write(build.stdout);throw Error('Backend build failed');}
   }
   const result=cp.spawnSync(process.execPath,['--import',tsx,'--test',path.join(backend,'tests',file)],
     {cwd:temp,env,encoding:'utf8',windowsHide:true,maxBuffer:10000000});
   process.stdout.write(result.stdout);process.stdout.write(result.stderr);
   console.log('TEST_EXIT',file,result.status);
   if(result.status!==0)failed=true;
  }
 } finally {await admin.end();}
 console.log('Test resources retained; no reset/drop or application database access.');
 process.exitCode=failed?1:0;
})().catch(()=>{
 console.error('Isolated reset test setup failed; sensitive connection/error details suppressed.');
 process.exitCode=1;
});
