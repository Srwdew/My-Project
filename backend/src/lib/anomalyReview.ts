import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { GoalError, type GoalTx } from './goalWriteTransaction';

// Both reads use the current transaction revision, never a lifetime flagged marker.
export const eligibilityJoins = Prisma.sql`
 LEFT JOIN LATERAL (SELECT outcome,snapshot FROM "AnomalyEvaluation" WHERE "userId"=t."userId" AND "originalTransactionId"=t.id AND revision=t."anomalyRevision" ORDER BY "evaluatedAt" DESC,id DESC LIMIT 1) e ON true
 LEFT JOIN LATERAL (SELECT action FROM "AnomalyReview" WHERE "userId"=t."userId" AND "originalTransactionId"=t.id AND revision=t."anomalyRevision" ORDER BY sequence DESC LIMIT 1) r ON true`;
export const amountExclusion = Prisma.sql`anomaly_amount_exclusion(t."anomalyPending",t.type::text,e.outcome,e.snapshot#>>'{assessment,amount,reasonCode}',r.action)`;
export async function baselineEligibility(tx:GoalTx,userId:string,id:string){
 const rows=await tx.$queryRaw<{reason:string|null;confirmed:boolean;hasTime:boolean;outcome:string|null;reviewAction:string|null}[]>(Prisma.sql`SELECT ${amountExclusion} AS reason,e.outcome,r.action AS "reviewAction",t."transactionTimeConfirmed" AS confirmed,t."transactionTime" IS NOT NULL AS "hasTime" FROM "Transaction" t ${eligibilityJoins} WHERE t."userId"=${userId} AND t.id=${id}`);
 const row=rows[0],reason=row?row.reason:'transaction_deleted';
 const amountEligible=reason===null;
 const amountReasons=reason?[reason]:[row!.reviewAction==='confirmed_normal'?'confirmed_normal':row!.outcome===null?'no_evaluation_history':row!.outcome==='not_evaluated'?'insufficient_history_allowed':'current_not_flagged'];
 const timeEligible=amountEligible&&row!.confirmed&&row!.hasTime;
 const timeReasons=timeEligible?['confirmed_time_available']:[...(reason?[reason]:[]),...(row&&!row.confirmed?['time_not_confirmed']:[]),...(row&&!row.hasTime?['time_missing']:[])];
 return {amountBaselineEligible:amountEligible,amountBaselineReasons:amountReasons,timeBaselineEligible:timeEligible,timeBaselineReasons:timeReasons};
}
export async function reviewView(tx:GoalTx,userId:string,evaluationId:string,limit=10,beforeSequence?:number){
 const evaluation=await tx.anomalyEvaluation.findFirst({where:{id:evaluationId,userId}});
 if(!evaluation)throw new GoalError(404,'NOT_FOUND','ไม่พบผลตรวจ');
 const where={userId,originalTransactionId:evaluation.originalTransactionId,revision:evaluation.revision};
 const latest=await tx.anomalyReview.findFirst({where,orderBy:{sequence:'desc'}});
 const rows=await tx.anomalyReview.findMany({where:{...where,...(beforeSequence?{sequence:{lt:beforeSequence}}:{})},orderBy:{sequence:'desc'},take:limit+1});
 const items=rows.slice(0,limit);
 return {evaluationId,revision:evaluation.revision,reviewState:latest?.action??'unreviewed',reviewSequence:latest?.sequence??0,reviewHistory:{items,hasMore:rows.length>limit,nextCursor:rows.length>limit?items[items.length-1]!.sequence:null}};
}
export type ReviewInput={action:'confirmed_normal'|'confirmed_problem';revision:number;expectedReviewSequence:number};
export async function submitReview(tx:GoalTx,userId:string,evaluationId:string,key:string,input:ReviewInput){
 const fingerprint=createHash('sha256').update(JSON.stringify({evaluationId,action:input.action,revision:input.revision,expectedReviewSequence:input.expectedReviewSequence})).digest('hex');
 const receipt=await tx.anomalyReviewRequest.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:key}},include:{review:true}});
 if(receipt){if(receipt.requestFingerprint!==fingerprint)throw new GoalError(409,'IDEMPOTENCY_CONFLICT','คำขอนี้ใช้ key เดิมกับข้อมูลต่างกัน');return {status:receipt.responseStatus,body:{review:receipt.review}};}
 const evaluation=await tx.anomalyEvaluation.findFirst({where:{id:evaluationId,userId}});
 if(!evaluation)throw new GoalError(404,'NOT_FOUND','ไม่พบผลตรวจ');
 if(evaluation.revision!==input.revision)throw new GoalError(409,'REVISION_CONFLICT','revision ไม่ตรงกับผลตรวจ กรุณาโหลดใหม่');
 const identity={userId,originalTransactionId:evaluation.originalTransactionId,revision:evaluation.revision};
 const latest=await tx.anomalyReview.findFirst({where:identity,orderBy:{sequence:'desc'}});
 if(input.expectedReviewSequence>(latest?.sequence??0))throw new GoalError(409,'REVIEW_SEQUENCE_CONFLICT','sequence ไม่ตรงกับฐานข้อมูล');
 // A retry of the current action is a no-op. Its receipt is still persisted for later replay.
 if(latest?.action===input.action){
  await tx.anomalyReviewRequest.create({data:{userId,idempotencyKey:key,requestFingerprint:fingerprint,reviewId:latest.id,responseStatus:200}});
  return {status:200,body:{review:latest}};
 }
 if((latest?.sequence??0)!==input.expectedReviewSequence)throw new GoalError(409,'REVIEW_SEQUENCE_CONFLICT','มีผลยืนยันใหม่แล้ว กรุณาโหลดใหม่ก่อนเปลี่ยนคำยืนยัน');
 const review=await tx.anomalyReview.create({data:{...identity,evaluationId,action:input.action,sequence:(latest?.sequence??0)+1}});
 await tx.anomalyReviewRequest.create({data:{userId,idempotencyKey:key,requestFingerprint:fingerprint,reviewId:review.id,responseStatus:201}});
 return {status:201,body:{review}};
}