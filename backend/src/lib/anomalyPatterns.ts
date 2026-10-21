import {Prisma} from '@prisma/client';
import {createHash,randomUUID} from 'node:crypto';
import {GoalError,type GoalTx} from './goalWriteTransaction';
import {bangkokToday} from './goalCalculations';
import {patternStatus,type Cadence} from './anomalyPatternPolicy';
export type PatternSnapshot={status:'active'|'paused'|'expired';cadence:Cadence;categoryId:string;dimension:'amount'|'time';referenceMedian:string;anchor:string;lastOccurrenceDate:string;members:{evaluationId:string;revision:number;amount:string;date:string}[];matchingEnabled:false;absoluteFloorInBaht:null};
export async function manualPattern(tx:GoalTx,userId:string,evaluation:any,dimension:'amount'|'time',cadence:Cadence|undefined,patternId?:string){
 const current=await tx.transaction.findFirst({where:{id:evaluation.originalTransactionId,userId,anomalyRevision:evaluation.revision,type:'expense'}});
 const t=(evaluation.snapshot as any)?.transaction;
 if(!current||!t?.categoryId||!t?.date||!t?.amount)throw new GoalError(409,'PATTERN_CURRENT_SOURCE_REQUIRED',"ใช้รูปแบบกับ revision ปัจจุบันที่มีข้อมูลต้นทางครบเท่านั้น");
 const member={evaluationId:evaluation.id,revision:evaluation.revision,amount:t.amount,date:t.date};
 if(patternId){
  const p=await tx.anomalyPatternEvent.findFirst({where:{userId,patternId},orderBy:{sequence:'desc'}});
  if(!p)throw new GoalError(404,'NOT_FOUND',"ไม่พบข้อมูล");
  const s=p.snapshot as unknown as PatternSnapshot;
  if(s.categoryId!==t.categoryId||s.dimension!==dimension)throw new GoalError(409,'PATTERN_SCOPE_MISMATCH',"รูปแบบต้องเป็นหมวดและมิติเดียวกัน");
  if(s.status==='expired')throw new GoalError(409,'PATTERN_EXPIRED',"กรุณากู้คืนรูปแบบก่อนยืนยัน occurrence");
  if(s.members.some(m=>m.evaluationId===evaluation.id))return patternId;
  const snapshot={...s,status:'active',lastOccurrenceDate:t.date>s.lastOccurrenceDate?t.date:s.lastOccurrenceDate,members:[...s.members,member]};
  await tx.anomalyPatternEvent.create({data:{userId,patternId,sequence:p.sequence+1,supersedesId:p.id,kind:'occurrence',snapshot}});
  return patternId;
 }
 if(!cadence)throw new GoalError(400,'CADENCE_REQUIRED',"กรุณาเลือกรอบ");
 const id=randomUUID();await tx.anomalyPattern.create({data:{id,userId}});
 const snapshot:PatternSnapshot={status:'active',cadence,categoryId:t.categoryId,dimension,referenceMedian:new Prisma.Decimal(t.amount).toFixed(2),anchor:t.date,lastOccurrenceDate:t.date,members:[member],matchingEnabled:false,absoluteFloorInBaht:null};
 await tx.anomalyPatternEvent.create({data:{userId,patternId:id,sequence:1,kind:'create',snapshot:snapshot as unknown as Prisma.InputJsonValue}});
 return id;
}
export async function patternView(tx:GoalTx,userId:string){
 const patterns=await tx.anomalyPattern.findMany({where:{userId},include:{events:{orderBy:{sequence:'desc'}}},orderBy:{createdAt:'desc'}});

 const current=await tx.$queryRaw<{patternId:string|null;action:string}[]>(Prisma.sql`SELECT DISTINCT ON (d."originalTransactionId",d.revision,d.dimension) d."patternId",d.action FROM "AnomalyDecision" d JOIN "Transaction" t ON t.id=d."originalTransactionId" AND t."userId"=d."userId" AND t."anomalyRevision"=d.revision WHERE d."userId"=${userId} ORDER BY d."originalTransactionId",d.revision,d.dimension,d.sequence DESC`);
 return {matchingEnabled:false,absoluteFloorInBaht:null,items:patterns.map(p=>({...p,current:p.events[0]??null,validOccurrences:current.filter(d=>d.patternId===p.id&&d.action==='recurring').length}))};

}
export async function patternOperation(tx:GoalTx,userId:string,patternId:string,key:string,input:{action:'refresh'|'restore';expectedEventId:string}){
 const fingerprint=createHash('sha256').update(JSON.stringify({patternId,...input})).digest('hex');
 const receipt=await tx.anomalyPatternRequest.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:key}},include:{event:true}});
 if(receipt){if(receipt.fingerprint!==fingerprint)throw new GoalError(409,'IDEMPOTENCY_CONFLICT',"คำขอเดิมใช้ข้อมูลต่างกัน");return receipt.event;}
 const current=await tx.anomalyPatternEvent.findFirst({where:{userId,patternId},orderBy:{sequence:'desc'}});
 if(!current)throw new GoalError(404,'NOT_FOUND',"ไม่พบข้อมูล");
 if(current.id!==input.expectedEventId)throw new GoalError(409,'PATTERN_CONFLICT',"สถานะรูปแบบเปลี่ยนแล้ว กรุณาโหลดใหม่");
 const s=current.snapshot as unknown as PatternSnapshot,today=bangkokToday();
 if(input.action==='restore'&&s.status!=='expired')throw new GoalError(409,'PATTERN_NOT_EXPIRED',"กู้คืนได้เฉพาะรูปแบบที่หมดอายุ");
 const status=input.action==='restore'?'active':s.status==='expired'?'expired':patternStatus(s.anchor,s.cadence,today,s.lastOccurrenceDate);
 const snapshot=input.action==='restore'?{...s,status,anchor:today}:{...s,status};
 const event=status===s.status?current:await tx.anomalyPatternEvent.create({data:{userId,patternId,sequence:current.sequence+1,supersedesId:current.id,kind:input.action==='restore'?'restore':'lifecycle',snapshot:snapshot as unknown as Prisma.InputJsonValue}});
 await tx.anomalyPatternRequest.create({data:{userId,idempotencyKey:key,fingerprint,eventId:event.id}});
 return event;
}

export async function refreshPatternStates(tx:GoalTx,userId:string,asOf:string){
 const patterns=await tx.anomalyPattern.findMany({where:{userId},include:{events:{orderBy:{sequence:'desc'},take:1}}});
 for(const p of patterns){
  const current=p.events[0];if(!current)continue;
  const s=current.snapshot as unknown as PatternSnapshot;
  if(s.status==='expired')continue;
  const status=patternStatus(s.anchor,s.cadence,asOf,s.lastOccurrenceDate);
  if(status!==s.status)await tx.anomalyPatternEvent.create({data:{userId,patternId:p.id,sequence:current.sequence+1,supersedesId:current.id,kind:'lifecycle',snapshot:{...s,status} as unknown as Prisma.InputJsonValue}});
 }
}
