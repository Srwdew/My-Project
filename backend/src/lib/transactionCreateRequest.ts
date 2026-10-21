import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { GoalError, type GoalTx } from './goalWriteTransaction';
export function transactionRequestKey(value:unknown):string|null{
 if(value===undefined)return null; // Existing API consumers remain compatible.
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{16,128}$/.test(value))throw new GoalError(400,'INVALID_IDEMPOTENCY_KEY','Invalid Idempotency-Key');
 return value;
}
export function transactionFingerprint(body:Record<string,unknown>){
 const fields=['categoryId','type','amount','transactionDate','transactionTime','transactionTimeConfirmed','paymentMethod','description','note'];
 return createHash('sha256').update(JSON.stringify(fields.map(k=>[k,body[k]??null]))).digest('hex');
}
export async function replayTransaction(tx:GoalTx,userId:string,key:string|null,fingerprint:string){
 if(!key)return null;
 const receipt=await tx.transactionCreateRequest.findUnique({where:{userId_idempotencyKey:{userId,idempotencyKey:key}}});
 if(receipt&&receipt.requestFingerprint!==fingerprint)throw new GoalError(409,'IDEMPOTENCY_CONFLICT','Key already used with a different payload');
 return receipt;
}
export async function recordTransaction(tx:GoalTx,userId:string,key:string|null,fingerprint:string,body:unknown){
 const response=JSON.parse(JSON.stringify(body)) as Prisma.InputJsonValue;
 if(key)await tx.transactionCreateRequest.create({data:{userId,idempotencyKey:key,requestFingerprint:fingerprint,responseStatus:201,responseBody:response}});
 return response;
}
