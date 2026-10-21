import {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {CONSENT_CUTOFF} from '../src/lib/experimentRetention';
import {randomUUID} from 'node:crypto';
import {realpath,lstat} from 'node:fs/promises';
import {resolve} from 'node:path';
import {deleteArtifact,inventory,type Artifact} from './experimentRetentionFiles';
import {validateTarget,type Scope} from './anomalyToleranceRead';
export async function cleanup(pool:Pool,roots:string[],execute=false,now=new Date()){
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(18082026,30)');
 const rows=await c.query("SELECT a.*,EXISTS(SELECT 1 FROM experiment_retention.artifact_subject m JOIN experiment_retention.subject s ON s.user_id=m.user_id WHERE m.artifact_id=a.id) AS withdrawn FROM experiment_retention.artifact a WHERE state<>'deleted' ORDER BY created_at,id FOR UPDATE");
 const results=[];for(const row of rows.rows){const a:Artifact={id:row.id,path:row.path,kind:row.kind,createdAt:row.created_at,state:row.state};
  if(!execute){results.push({id:a.id,state:'dry_run'});continue;}
  const r=await deleteArtifact(a,roots,now,row.withdrawn);
  if(r.state==='deleted')await c.query("UPDATE experiment_retention.artifact SET state='deleted',deleted_at=$2,error_code=NULL WHERE id=$1",[a.id,now]);
  else if(r.state==='failed')await c.query("UPDATE experiment_retention.artifact SET state='failed',error_code=$2 WHERE id=$1",[a.id,r.errorCode]);
  results.push({id:a.id,...r});
 }await c.query('COMMIT');return results;
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function register(pool:Pool,root:string,items:{path:string;kind:'backup'|'export';createdAt:string;accounts:string[]}[],allowed:string[]){
 const base=await realpath(root);const discovered=new Set((await inventory(base)).map(x=>x.path));
 const c=await pool.connect();try{await c.query('BEGIN');await c.query('SELECT pg_advisory_xact_lock(18082026,30)');
 for(const item of items){
  const date=new Date(item.createdAt);if(!Number.isFinite(+date)||+date<+CONSENT_CUTOFF||+date>Date.now())throw Error('Protected or invalid creation date');
  if(!['backup','export'].includes(item.kind)||!item.accounts.length||item.accounts.some(x=>!allowed.includes(x)))throw Error('Invalid scope');
  const path=resolve(item.path);if(!discovered.has(path))throw Error('Unmanaged artifact');
  const id=randomUUID();await c.query('INSERT INTO experiment_retention.artifact(id,path,kind,created_at) VALUES($1,$2,$3,$4)',[id,path,item.kind,date]);
  for(const owner of [...new Set(item.accounts)])await c.query('INSERT INTO experiment_retention.artifact_subject VALUES($1,$2)',[id,owner]);
 }await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
export async function main(args:string[]){
 if(args[0]==='inventory'&&args.length===2){console.log(JSON.stringify(await inventory(args[1]!),null,2));return;}
 if(args[0]==='register'&&args.length===4){
 const scope=JSON.parse(await readFile(args[1]!,'utf8')) as Scope;const connection=process.env.DATABASE_URL??'';validateTarget(connection,scope);
 const manifest=JSON.parse(await readFile(args[3]!,'utf8'));const pool=new Pool({connectionString:connection});
 try{await register(pool,args[2]!,manifest,scope.accounts);}finally{await pool.end();}return;
 }
 if(args[0]!=='cleanup'||![3,4].includes(args.length)||(args[3]&&args[3]!=='--execute'))throw Error('inventory ROOT | cleanup SCOPE_JSON ROOT [--execute]');
 const scope=JSON.parse(await readFile(args[1]!,'utf8')) as Scope,connection=process.env.DATABASE_URL??'';
 validateTarget(connection,scope);
 const root=await realpath(resolve(args[2]!));
 // Manual cleaner only targets the explicitly reviewed root; no recursive directory deletion.
 const pool=new Pool({connectionString:connection});try{console.log(JSON.stringify(await cleanup(pool,[root],args[3]==='--execute')));}finally{await pool.end();}
}
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Retention operation refused/failed; no completion claimed');process.exitCode=1;});
