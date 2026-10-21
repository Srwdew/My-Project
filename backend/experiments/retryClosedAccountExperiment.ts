import {readFile} from 'node:fs/promises';
import {PrismaClient} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import {validateTarget,type Scope} from './anomalyToleranceRead';
import {pendingClosedAccountExperiments,retryClosedAccountExperiment} from '../src/lib/closedAccountExperiment';

// Explicit invocation only. No .env loading, scheduler, file deletion or global account scan.
export async function main(args:string[]){
 if(![2,3].includes(args.length)||args[0]!=='--scope'||(args[2]&&args[2]!=='--execute'))throw Error('--scope FILE [--execute]');
 const scope=JSON.parse(await readFile(args[1]!,'utf8')) as Scope;
 const url=process.env.DATABASE_URL??'';validateTarget(url,scope);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url})});
 try{
  const identity=await db.$queryRawUnsafe<{name:string}[]>('SELECT current_database() AS name');
  if(identity[0]?.name!==scope.database)throw Error('Database identity mismatch');
  const jobs=await pendingClosedAccountExperiments(db,scope.accounts);
  if(args[2]!=='--execute'){console.log(JSON.stringify({pending:jobs.length,dryRun:true}));return;}
  let databasePurged=0,stillPending=0;
  for(const row of jobs){const result=await retryClosedAccountExperiment(db,row.id);if(result.retryPending)stillPending++;else databasePurged++;}
  console.log(JSON.stringify({attempted:jobs.length,databasePurged,stillPending,collectionEnabled:false,automaticMatching:false}));
 }finally{await db.$disconnect();}
}
if(require.main===module)void main(process.argv.slice(2)).catch(()=>{console.error('Maintenance retry refused or failed; no completion claimed');process.exitCode=1;});
