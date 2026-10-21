import {refreshPatternStates} from './anomalyPatterns';
import { eligibilityJoins, amountExclusion, timeExclusion, baselineEligibility, reviewView } from './anomalyReview';
import { Prisma, type Transaction } from '@prisma/client';
import { randomUUID, createHash } from 'node:crypto';
import { withGoalLock, GoalError, type GoalTx } from './goalWriteTransaction';
import { ANOMALY_RULE, RULE_VERSION, screenExpense, amountReady, timeReady, globalGate, dimensionEvidence, type Baseline } from './anomalyRules';
import { bangkokToday } from './goalCalculations';
export type Actor={userId:string;authVersion?:number};
export async function assertAnomalyActor(tx:GoalTx,actor:Actor){const u=await tx.user.findFirst({where:{id:actor.userId,deletedAt:null},select:{authVersion:true}});if(!u||u.authVersion!==(actor.authVersion??0))throw new GoalError(401,'SESSION_REVOKED','กรุณาเข้าสู่ระบบใหม่');}
export const withAnomalyLock=<T>(actor:Actor,fn:(tx:GoalTx)=>Promise<T>)=>withGoalLock(actor.userId,async tx=>{await assertAnomalyActor(tx,actor);return fn(tx);});
export function confirmedTime(input:unknown,time:Date|null,date:Date,current?:Transaction){
 if(input!==undefined&&typeof input!=='boolean')throw new GoalError(400,'INVALID_TIME_CONFIRMATION','กรุณาระบุการยืนยันเวลาเป็น boolean');
 if(input===true&&!time)throw new GoalError(400,'TIME_REQUIRED','ต้องระบุเวลาก่อนยืนยัน');
 return input===undefined?Boolean(current?.transactionTimeConfirmed&&current.transactionTime?.getTime()===time?.getTime()&&current.transactionDate.getTime()===date.getTime()):input;
}
export async function anomalyWriteFields(tx:GoalTx,userId:string,next:{type:string;categoryId:string;amount:Prisma.Decimal.Value;transactionDate:Date;transactionTime:Date|null;transactionTimeConfirmed:boolean;paymentMethod?:string|null;description?:string|null;note?:string|null},current?:Transaction){
 const changed=!current||current.type!==next.type||current.categoryId!==next.categoryId||!current.amount.eq(next.amount)||current.transactionDate.getTime()!==next.transactionDate.getTime()||current.transactionTime?.getTime()!==next.transactionTime?.getTime()||current.transactionTimeConfirmed!==next.transactionTimeConfirmed||(current.paymentMethod??null)!==(next.paymentMethod??null)||(current.description??null)!==(next.description??null)||(current.note??null)!==(next.note??null);
 if(!changed)return {anomalyRevision:current!.anomalyRevision,anomalyPending:current!.anomalyPending};
 const setting=await tx.anomalyNotificationSetting.findUnique({where:{userId}});
 return {anomalyRevision:(current?.anomalyRevision??0)+1,anomalyPending:next.type==='expense'&&Boolean(setting?.enabled)};
}
export async function anomalyBaseline(tx:GoalTx,row:Transaction,account=false){
 const end=row.transactionDate,start=new Date(end);start.setUTCDate(start.getUTCDate()-ANOMALY_RULE.windowDays);
 const minute=row.transactionTime?row.transactionTime.getUTCHours()*60+row.transactionTime.getUTCMinutes():0;

 const sql=Prisma.sql`WITH eligible AS (
 SELECT t.amount,t."transactionDate" AS day,
 t.id||':'||t."anomalyRevision"::text||':'||coalesce(e.id,'')||':'||coalesce(da.id,'')||':'||coalesce(dt.id,'')||':'||coalesce(r.action,'') AS version_part,
 ${amountExclusion} IS NULL AS amount_ok,${timeExclusion} IS NULL AS time_ok,
 CASE WHEN t."transactionTimeConfirmed" AND t."transactionTime" IS NOT NULL AND ${timeExclusion} IS NULL THEN (extract(hour from t."transactionTime")::int*60+extract(minute from t."transactionTime")::int) END AS minute
 FROM "Transaction" t ${eligibilityJoins} WHERE t."userId"=${row.userId} AND (${account} OR t."categoryId"=${row.categoryId}) AND t.type='expense' AND t.id<>${row.id} AND t."transactionDate">=${start} AND t."transactionDate"<${end}
 ), agg AS (
 SELECT md5(coalesce(string_agg(version_part,',' ORDER BY version_part),'')) AS "membershipVersion",array_agg(amount ORDER BY amount) FILTER(WHERE amount_ok) AS a,count(*) FILTER(WHERE amount_ok)::int AS n,
 count(DISTINCT day) FILTER(WHERE amount_ok)::int AS days,coalesce(max(day) FILTER(WHERE amount_ok)-min(day) FILTER(WHERE amount_ok),0)::int AS span,
 count(*) FILTER(WHERE time_ok)::int AS "timeTotal",count(minute)::int AS "timeN",
 count(DISTINCT day) FILTER(WHERE minute IS NOT NULL)::int AS "timeDays",coalesce(max(day) FILTER(WHERE minute IS NOT NULL)-min(day) FILTER(WHERE minute IS NOT NULL),0)::int AS "timeSpan",
 count(*) FILTER(WHERE minute/${ANOMALY_RULE.bucketMinutes}=${Math.floor(minute/ANOMALY_RULE.bucketMinutes)})::int AS "bucketCount",
 count(*) FILTER(WHERE mod(minute-${minute}+1440+${ANOMALY_RULE.neighborhoodMinutes},1440)<${ANOMALY_RULE.neighborhoodMinutes*2})::int AS "nearbyCount" FROM eligible
 ), med AS(SELECT *,anomaly_numeric_median(a) AS median FROM agg)
 SELECT "membershipVersion",n,days,span,"timeTotal","timeN","timeDays","timeSpan","bucketCount","nearbyCount",median,
 anomaly_numeric_median(ARRAY(SELECT abs(x-median) FROM unnest(a) x ORDER BY abs(x-median))) AS mad,
 anomaly_numeric_median(a[1:n/2]) AS q1,anomaly_numeric_median(a[(n+1)/2+1:n]) AS q3,a[1] AS min,a[n] AS max FROM med`;
 const raw=(await tx.$queryRaw<any[]>(sql))[0];
 const b:Baseline={...raw};for(const k of ['median','mad','q1','q3','min','max'] as const)b[k]=raw[k]===null?null:String(raw[k]);
 return {baseline:b,window:{startDate:start.toISOString().slice(0,10),endExclusive:end.toISOString().slice(0,10)}};
}
export async function evaluatePending(tx:GoalTx,actor:Actor,id:string,asOfDate:string){
 await assertAnomalyActor(tx,actor);
 const row=await tx.transaction.findFirst({where:{id,userId:actor.userId},include:{category:{select:{name:true}}}});
 if(!row||!row.anomalyPending)return 'cancelled';
 const setting=await tx.anomalyNotificationSetting.findUnique({where:{userId:actor.userId}});
 if(!setting?.enabled||row.type!=='expense'){await tx.transaction.update({where:{id},data:{anomalyPending:false}});return 'cancelled';}

 const gateRow=(await tx.$queryRaw<{n:number;days:number}[]>(Prisma.sql`SELECT count(*)::int AS n,coalesce(max("transactionDate")-min("transactionDate")+1,0)::int AS days FROM "Transaction" WHERE "userId"=${actor.userId} AND type='expense' AND id<>${id} AND "transactionDate"<${row.transactionDate}`))[0]!;
 const gate={ready:globalGate(gateRow.n,gateRow.days),count:gateRow.n,inclusiveDays:gateRow.days};
 const category=await anomalyBaseline(tx,row);
 const account=gate.ready&&(!amountReady(category.baseline)||!timeReady(category.baseline))?await anomalyBaseline(tx,row,true):null;
 const money=amountReady(category.baseline)?category.baseline:account?.baseline??category.baseline;
 const timing=timeReady(category.baseline)?category.baseline:account?.baseline??category.baseline;
 const baseline={...money,timeMembershipVersion:timing.membershipVersion??null,timeTotal:timing.timeTotal??timing.n,timeN:timing.timeN,timeDays:timing.timeDays,timeSpan:timing.timeSpan,bucketCount:timing.bucketCount,nearbyCount:timing.nearbyCount};
 const window=category.window;
 const scope={amount:amountReady(category.baseline)?'category':'account',time:timeReady(category.baseline)?'category':'account'};
 const assessment=gate.ready?screenExpense(row.amount.toFixed(2),Boolean(row.transactionTimeConfirmed&&row.transactionTime),baseline):{amount:{status:'not_evaluated',reasonCode:'global_gate_not_ready'},time:{status:'not_evaluated',reasonCode:'global_gate_not_ready'},outcome:'not_evaluated',level:null};
 const snapshot={gate,scope,baselineVersion:createHash('sha256').update(JSON.stringify({baseline,scope})).digest('hex').slice(0,24),decisionProtocol:'dimension-v2',scores:gate.ready?{amount:{modifiedZ:assessment.amount.reasonCode==='amount_modified_z'?dimensionEvidence(row.amount.toFixed(2),baseline).amount.modifiedZ:null},time:assessment.time.reasonCode==='time_rare_frequency'?dimensionEvidence(row.amount.toFixed(2),baseline).time:{bucketFrequency:null,nearbyFrequency:null}}:null,transaction:{id:row.id,categoryId:row.categoryId,categoryName:row.category.name.slice(0,180),type:row.type,amount:row.amount.toFixed(2),date:row.transactionDate.toISOString().slice(0,10),time:row.transactionTime?.toISOString().slice(11,16)??null,timeConfirmed:row.transactionTimeConfirmed},asOfDate,window,baseline,rules:ANOMALY_RULE,assessment};
 const key={userId:actor.userId,originalTransactionId:id,revision:row.anomalyRevision,ruleVersion:RULE_VERSION+'-'+createHash('sha256').update(JSON.stringify({baseline,scope,gate})).digest('hex').slice(0,12)};
 let evaluation=await tx.anomalyEvaluation.findUnique({where:{userId_originalTransactionId_revision_ruleVersion:key}});
 if(!evaluation)evaluation=await tx.anomalyEvaluation.create({data:{...key,id:randomUUID(),outcome:assessment.outcome,snapshot:snapshot as unknown as Prisma.InputJsonValue}});
 if(evaluation.outcome==='flagged'){
  const reasons=[];
  if(assessment.amount.status==='flagged')reasons.push(`ยอด ${row.amount.toFixed(2)} บาท ค่ากลางประวัติ ${baseline.median} บาท (${assessment.amount.reasonCode})`);
  if(assessment.time.status==='flagged')reasons.push(`เวลา ${snapshot.transaction.time} พบช่วงนี้ ${baseline.bucketCount}/${baseline.timeN} รายการที่ยืนยันเวลา`);
  await tx.notification.createMany({skipDuplicates:true,data:[{userId:actor.userId,type:'transaction_anomaly',eventKey:'transaction-anomaly:'+id,sourceId:evaluation.id,title:assessment.level==='review_priority'?'รายการที่ควรตรวจสอบเป็นพิเศษ':'รายการที่ควรตรวจสอบ',message:`หมวด ${snapshot.transaction.categoryName}: ${reasons.join('; ')} จากประวัติหมวดเดียวกัน ${baseline.n} รายการ ย้อนหลัง ${ANOMALY_RULE.windowDays} วันก่อนวันรายการ เป็นสัญญาณทางสถิติ ไม่ใช่การยืนยันว่ารายการผิด`,link:null}]});
 }
 await tx.transaction.update({where:{id},data:{anomalyPending:false}});return 'evaluated';
}

async function bootstrapReady(tx:GoalTx,userId:string,cutoff:Date){
 const r=(await tx.$queryRaw<{n:number;days:number}[]>(Prisma.sql`SELECT count(*)::int AS n,coalesce(max("transactionDate")-min("transactionDate")+1,0)::int AS days FROM "Transaction" WHERE "userId"=${userId} AND type='expense' AND "transactionDate"<${cutoff}`))[0]!;
 return globalGate(r.n,r.days);
}
async function bootstrapBefore(tx:GoalTx,actor:Actor,cutoff:Date,asOfDate:string){
 if(!await bootstrapReady(tx,actor.userId,cutoff))return false;
 const rows=await tx.$queryRaw<{id:string;anomalyPending:boolean}[]>(Prisma.sql`
 SELECT t.id,t."anomalyPending" FROM "Transaction" t
 WHERE t."userId"=${actor.userId} AND t.type='expense' AND t."transactionDate"<${cutoff}
 AND (t."anomalyPending" OR NOT EXISTS(SELECT 1 FROM "AnomalyEvaluation" e WHERE e."userId"=t."userId" AND e."originalTransactionId"=t.id AND e.revision=t."anomalyRevision" AND e."ruleVersion" LIKE ${RULE_VERSION+'-%'}))
 ORDER BY t."transactionDate",t.id LIMIT 101`);
 for(const row of rows.slice(0,100)){
  if(!row.anomalyPending)await tx.transaction.update({where:{id:row.id},data:{anomalyPending:true}});
  await evaluatePending(tx,actor,row.id,asOfDate);
 }
 return rows.length>100;
}
export async function checkTransactionAnomaly(actor:Actor,id:string){
 try{const asOfDate=bangkokToday();await withAnomalyLock(actor,async tx=>{
  const row=await tx.transaction.findFirst({where:{id,userId:actor.userId}});
  const enabled=await tx.anomalyNotificationSetting.findUnique({where:{userId:actor.userId}});
  if(row?.anomalyPending&&row.type==='expense'&&enabled?.enabled&&await bootstrapBefore(tx,actor,row.transactionDate,asOfDate))return;
  await evaluatePending(tx,actor,id,asOfDate);
 });return true;}catch{console.error('Anomaly evaluation deferred; reconcile required');return false;}
}
export async function reconcileAnomalies(actor:Actor,limit:number,cursor?:string){
 const asOfDate=bangkokToday();return withAnomalyLock(actor,async tx=>{
  await refreshPatternStates(tx,actor.userId,asOfDate);
  const cutoff=new Date(asOfDate+'T00:00:00Z');cutoff.setUTCDate(cutoff.getUTCDate()+1);
  const setting=await tx.anomalyNotificationSetting.findUnique({where:{userId:actor.userId}});
  const bootstrap=Boolean(setting?.enabled)&&await bootstrapReady(tx,actor.userId,cutoff);
  const after=cursor?await tx.transaction.findFirst({where:{id:cursor,userId:actor.userId},select:{transactionDate:true,id:true}}):null;
  const rows=await tx.$queryRaw<{id:string;anomalyPending:boolean}[]>(Prisma.sql`
   SELECT t.id,t."anomalyPending" FROM "Transaction" t WHERE t."userId"=${actor.userId}
   AND (t."anomalyPending" OR (${bootstrap} AND t.type='expense' AND t."transactionDate"<${cutoff} AND NOT EXISTS(SELECT 1 FROM "AnomalyEvaluation" e WHERE e."userId"=t."userId" AND e."originalTransactionId"=t.id AND e.revision=t."anomalyRevision" AND e."ruleVersion" LIKE ${RULE_VERSION+'-%'})))
   AND (${after===null} OR t."transactionDate">${after?.transactionDate??cutoff} OR (t."transactionDate"=${after?.transactionDate??cutoff} AND t.id>${after?.id??''}))
   ORDER BY t."transactionDate",t.id LIMIT ${limit+1}`);
  const batch=rows.slice(0,limit);let evaluated=0;
  for(const row of batch){if(!row.anomalyPending)await tx.transaction.update({where:{id:row.id},data:{anomalyPending:true}});if(await evaluatePending(tx,actor,row.id,asOfDate)==='evaluated')evaluated++;}
  return {processed:batch.length,evaluated,hasMore:rows.length>limit,nextCursor:rows.length>limit?batch[batch.length-1]!.id:null,asOfDate,bootstrapPolicy:'chronological-prior-dates-unscored-prefix-v1'};
 });
}
export async function anomalyDetail(tx:GoalTx,userId:string,transactionId:string,notificationEvaluationId?:string){
 const current=await tx.transaction.findFirst({where:{id:transactionId,userId},select:{id:true,anomalyRevision:true,anomalyPending:true,type:true}});
 const latestEvaluation=await tx.anomalyEvaluation.findFirst({where:{userId,originalTransactionId:transactionId},orderBy:[{revision:'desc'},{evaluatedAt:'desc'}]});
 const notice=await tx.notification.findUnique({where:{userId_eventKey:{userId,eventKey:'transaction-anomaly:'+transactionId}}});
 const snapshotId=notificationEvaluationId??notice?.sourceId;
 const notificationSnapshot=snapshotId?await tx.anomalyEvaluation.findFirst({where:{id:snapshotId,userId,originalTransactionId:transactionId}}):null;
 const viewed=notificationEvaluationId?notificationSnapshot:latestEvaluation;
 const review=viewed?await reviewView(tx,userId,viewed.id):{evaluationId:null,reviewState:'unreviewed',reviewSequence:0,reviewHistory:{items:[],hasMore:false,nextCursor:null}};
 return {...review,...await baselineEligibility(tx,userId,transactionId),sourceState:!current?'deleted':notificationSnapshot&&notificationSnapshot.revision!==current.anomalyRevision?'modified':'unchanged',currentRevision:current?.anomalyRevision??null,pending:current?.anomalyPending??false,notificationSnapshot,latestEvaluation,latestAppliesToCurrent:Boolean(current&&latestEvaluation&&current.type==='expense'&&latestEvaluation.revision===current.anomalyRevision),transactionLink:current?'/transactions/'+current.id+'/edit':null};
}