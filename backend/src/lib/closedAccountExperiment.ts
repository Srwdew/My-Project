import type {PrismaClient} from '@prisma/client';
import {retentionInstalled,purgeStatus,withdrawExperiment} from './experimentRetention';

export type ClosedExperimentResult={
 status:'stopped'|'waiting_backups'|'complete';
 retryPending:boolean;
};
const pending=():ClosedExperimentResult=>({status:'stopped',retryPending:true});

// User.deletedAt is the durable work marker. No dependence on the original HTTP process.
export async function retryClosedAccountExperiment(db:PrismaClient,userId:string):Promise<ClosedExperimentResult>{
 try{
  return await db.$transaction(async tx=>{
   await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '3000ms'");
   await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '500ms'");
   const closed=await tx.$queryRawUnsafe<{id:string}[]>(
    'SELECT id FROM public."User" WHERE id=$1 AND "deletedAt" IS NOT NULL FOR UPDATE SKIP LOCKED',userId);
   if(!closed.length)return pending(); // Busy/open/missing: never purge an active account.
   const lock=await tx.$queryRawUnsafe<{locked:boolean}[]>('SELECT pg_try_advisory_xact_lock(18082026,30) AS locked');
   if(!lock[0]?.locked||!await retentionInstalled(tx))return pending();
   const existing=await tx.$queryRawUnsafe<{database_purged_at:Date|null}[]>(
    'SELECT database_purged_at FROM experiment_retention.subject WHERE user_id=$1',userId);
   if(existing[0]?.database_purged_at)return {status:await purgeStatus(tx,userId),retryPending:false};
   const result=await withdrawExperiment(tx,userId);
   return {status:result.status,retryPending:!result.installed};
  },{maxWait:1000,timeout:5000});
 }catch{
  // Failure cannot roll back account closure. Missing/null database_purged_at remains discoverable.
  // Do not log connection errors, account identifiers or payloads.
  return pending();
 }
}

export async function pendingClosedAccountExperiments(db:PrismaClient,accountScope:readonly string[]){
 if(!accountScope.length||accountScope.length>1000||accountScope.some(id=>! /^[0-9a-f-]{36}$/i.test(id)))throw Error('Explicit bounded account scope required');
 return db.$transaction(async tx=>{
  if(!await retentionInstalled(tx))return tx.$queryRawUnsafe<{id:string}[]>(
   'SELECT id FROM public."User" WHERE "deletedAt" IS NOT NULL AND id=ANY($1::text[]) ORDER BY id',[...accountScope]);
  return tx.$queryRawUnsafe<{id:string}[]>(
   'SELECT u.id FROM public."User" u LEFT JOIN experiment_retention.subject s ON s.user_id=u.id WHERE u."deletedAt" IS NOT NULL AND u.id=ANY($1::text[]) AND s.database_purged_at IS NULL ORDER BY u.id',[...accountScope]);
 });
}
