import {PrismaClient,Prisma} from '@prisma/client';
import {PrismaPg} from '@prisma/adapter-pg';
import type {Dataset,Observation,Pattern} from './anomalyTolerance';
export type Scope={database:string;host:string;port:string;since:string;accounts:string[];source:'authorized-test-decisions'};
export function validateTarget(connection:string,scope:Scope){
 const u=new URL(connection);
 if(scope.source!=='authorized-test-decisions'||!/^spendsense_goals_test_[a-z0-9_]+$/.test(scope.database)||!['127.0.0.1','localhost'].includes(scope.host)||u.hostname!==scope.host||u.port!==scope.port||u.pathname!=='/'+scope.database)throw Error('Refusing non-allowlisted isolated test database');
 if(!scope.accounts.length||new Set(scope.accounts).size!==scope.accounts.length||scope.accounts.some(id=>! /^[0-9a-f-]{36}$/i.test(id))||!Number.isFinite(Date.parse(scope.since)))throw Error('Explicit accounts and consent cutoff required');
}
export async function readDataset(connection:string,scope:Scope):Promise<Dataset>{
 validateTarget(connection,scope);
 const prisma=new PrismaClient({adapter:new PrismaPg({connectionString:connection})});
 try{return await prisma.$transaction(async tx=>{
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
  const meta=await tx.$queryRaw<{name:string;asOf:Date}[]>`SELECT current_database() AS name,transaction_timestamp() AS "asOf"`;
  if(meta[0]?.name!==scope.database)throw Error('Database identity mismatch');const asOf=meta[0]!.asOf;
  if(new Date(scope.since)>asOf)throw Error('Consent cutoff is in the future');
  const owners=await tx.user.findMany({where:{id:{in:scope.accounts},deletedAt:null},select:{id:true}});if(owners.length!==scope.accounts.length)throw Error('Authorized account missing');
  const decisions=await tx.anomalyDecision.findMany({where:{userId:{in:scope.accounts},decidedAt:{gte:new Date(scope.since),lte:asOf}},include:{evaluation:{select:{snapshot:true}}}});
  const live=await tx.transaction.findMany({where:{userId:{in:scope.accounts},id:{in:decisions.map(d=>d.originalTransactionId)}},select:{id:true,userId:true,anomalyRevision:true,type:true}});
  const events=await tx.anomalyPatternEvent.findMany({where:{userId:{in:scope.accounts},kind:'create',sequence:1,createdAt:{gte:new Date(scope.since),lte:asOf}},select:{userId:true,patternId:true,snapshot:true,createdAt:true}});
  const observations:Observation[]=decisions.map(d=>{
   const snapshot=d.evaluation.snapshot as any,t=snapshot?.transaction;
   if(!t?.categoryId||!t?.amount)throw Error('Incomplete decision snapshot');
   return {account:d.userId,transaction:d.originalTransactionId,revision:d.revision,currentRevision:live.find(t=>t.id===d.originalTransactionId&&t.userId===d.userId&&t.type==='expense')?.anomalyRevision??null,category:t.categoryId,dimension:d.dimension as 'amount'|'time',evaluation:d.evaluationId,amount:t.amount,action:d.action,patternId:d.patternId,decidedAt:d.decidedAt.toISOString(),sequence:d.sequence,id:d.id};
  });
  const patterns:Pattern[]=events.map(e=>{
   const s=e.snapshot as any;if(s.matchingEnabled!==false||s.absoluteFloorInBaht!==null||!Array.isArray(s.members))throw Error('Unsupported pattern reference');
   for(const member of s.members){if(!decisions.some(d=>d.userId===e.userId&&d.patternId===e.patternId&&d.evaluationId===member.evaluationId&&d.revision===member.revision&&d.dimension===s.dimension&&d.action==='recurring'))throw Error('Unconfirmed or pre-consent founding reference');}
   return {account:e.userId,id:e.patternId,category:s.categoryId,dimension:s.dimension,createdAt:e.createdAt.toISOString(),referenceMedian:s.referenceMedian,founderEvaluations:s.members.map((m:any)=>m.evaluationId),founderAmounts:s.members.map((m:any)=>m.amount)};
  });
  return {source:scope.source,since:scope.since,asOf:asOf.toISOString(),accounts:scope.accounts,patterns,observations,labels:[]};
 },{isolationLevel:Prisma.TransactionIsolationLevel.RepeatableRead,timeout:30000});}finally{await prisma.$disconnect();}
}
