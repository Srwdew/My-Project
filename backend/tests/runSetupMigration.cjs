// Separate PostgreSQL databases only; keep fixtures/databases for inspection. Never reset/drop.
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');
const {Client}=require('pg');
const root=path.resolve(__dirname,'..'),migrations=path.join(root,'prisma/migrations'),latest='20261001020000_add_setup_prompted_at';
const base=process.env.DATABASE_URL;
if(!base||!new URL(base).pathname.slice(1).startsWith('spendsense_goals_test_'))throw Error('Explicit isolated DATABASE_URL required');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'spendsense-setup-migration-'));
const names=fs.readdirSync(migrations).filter(n=>fs.existsSync(path.join(migrations,n,'migration.sql'))).sort();
if(names.length!==14||names.at(-1)!==latest)throw Error('Expected exact 14-migration chain');
const byteHashes=Object.fromEntries(names.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.join(migrations,n,'migration.sql'))).digest('hex')]));
async function connect(url){const c=new Client({connectionString:url});await c.connect();return c;}
async function create(label){const name='spendsense_goals_test_setup_'+label+'_'+Date.now();const admin=await connect(base);await admin.query('CREATE DATABASE '+name);await admin.end();const u=new URL(base);u.pathname='/'+name;return {db:name,url:u.toString()};}
function deploy(target,chain){
 const config=path.join(directory,'prisma-'+target.db+'.config.ts');
 fs.writeFileSync(config,'export default '+JSON.stringify({schema:path.join(root,'prisma/schema.prisma'),migrations:{path:chain}}).replace(/}$/,',datasource:{url:process.env.DATABASE_URL}}'));
 const r=cp.spawnSync(process.execPath,[path.join(root,'node_modules/prisma/build/index.js'),'migrate','deploy','--config',config],{cwd:directory,env:{...process.env,DATABASE_URL:target.url},encoding:'utf8'});
 fs.appendFileSync(path.join(directory,'migration.log'),(r.stdout||'')+(r.stderr||''));
 if(r.status!==0)throw Error('Migration deploy failed; private log retained');
}
async function verify(c,count){const rows=(await c.query('select migration_name,checksum from "_prisma_migrations" where finished_at is not null and rolled_back_at is null')).rows;if(rows.length!==count||rows.some(r=>byteHashes[r.migration_name]!==r.checksum))throw Error('Migration history/checksum mismatch');}
async function financialFingerprint(c){
 const h=crypto.createHash('sha256');
 for(const table of ['User','Profile','Transaction','Budget','CategoryBudget','Goal','GoalFundingSource','GoalLedgerEntry','Notification']){
  const rows=(await c.query('select (to_jsonb(t)-\'setupPromptedAt\')::text as data from "'+table+'" t order by (to_jsonb(t)-\'setupPromptedAt\')::text')).rows;
  h.update(JSON.stringify(rows));
 }
 return h.digest('hex');
}
(async()=>{
 const fresh=await create('fresh');deploy(fresh,migrations);let c=await connect(fresh.url);await verify(c,14);
 const freshId=crypto.randomUUID();const newUser=(await c.query('insert into "User" (id,email,"passwordHash") values ($1,$2,$3) returning "setupPromptedAt"',[freshId,freshId+'@example.invalid','synthetic-not-a-login'])).rows[0];
 if(newUser.setupPromptedAt!==null)throw Error('New account must be incomplete');await c.end();console.log('PASS fresh database: 14 migrations/checksums; new account incomplete');
 const upgraded=await create('upgrade'),oldChain=path.join(directory,'old-migrations');fs.mkdirSync(oldChain);
 fs.copyFileSync(path.join(migrations,'migration_lock.toml'),path.join(oldChain,'migration_lock.toml'));
 for(const n of names.slice(0,-1))fs.cpSync(path.join(migrations,n),path.join(oldChain,n),{recursive:true});
 deploy(upgraded,oldChain);c=await connect(upgraded.url);await verify(c,13);
 const uid=crypto.randomUUID();await c.query('insert into "User" (id,email,"passwordHash") values ($1,$2,$3)',[uid,uid+'@example.invalid','synthetic-not-a-login']);
 await c.query('insert into "Profile" (id,"userId","displayName",income,"paydayDay",goal) values ($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),uid,'Existing setup fixture','1234.56',null,'legacy intention']);
 await c.query('insert into "Budget" (id,"userId",year,month,amount,"updatedAt") values ($1,$2,2026,10,500.07,CURRENT_TIMESTAMP)',[crypto.randomUUID(),uid]);
 const before=await financialFingerprint(c);await c.end();deploy(upgraded,migrations);c=await connect(upgraded.url);await verify(c,14);
 if(await financialFingerprint(c)!==before)throw Error('Existing financial data changed');
 if((await c.query('select "setupPromptedAt" from "User" where id=$1',[uid])).rows[0].setupPromptedAt!==null)throw Error('Existing user must be incomplete');
 await c.end();console.log('PASS upgrade 13 -> 14: all checksums match, existing account incomplete, financial fingerprint unchanged');
 for(const n of names)if(crypto.createHash('sha256').update(fs.readFileSync(path.join(migrations,n,'migration.sql'))).digest('hex')!==byteHashes[n])throw Error('Migration bytes changed');
 const runtime=path.join(directory,'runtime.json');fs.writeFileSync(runtime,JSON.stringify({fresh,upgraded,checksums:byteHashes}));
 fs.writeFileSync(path.join(os.tmpdir(),'spendsense-setup-migration-current.txt'),runtime);
 console.log(JSON.stringify({freshDatabase:fresh.db,upgradedDatabase:upgraded.db,runtimeFile:runtime}));
})().catch(e=>{console.error('Setup migration test failed: '+(e.code||e.message));process.exitCode=1;});
