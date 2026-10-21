import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {PENDING_TRANSACTION_KEY,normalizedTransactionBody,storePendingTransaction,loadPendingTransaction,clearPendingTransaction,definitiveTransactionRejection} from '../../frontend/src/lib/pendingTransaction';
class MemoryStorage{
 data=new Map<string,string>();getItem(k:string){return this.data.get(k)??null;}setItem(k:string,v:string){this.data.set(k,v);}removeItem(k:string){this.data.delete(k);}
}
const draft={categoryId:'category-a',type:'expense' as const,amount:'0007.1',transactionDate:'2024-02-29',transactionTime:null,transactionTimeConfirmed:false as const,paymentMethod:null,description:' ร้านทดสอบ ',note:null};
const request=()=>({key:randomUUID(),createdAt:new Date().toISOString(),body:normalizedTransactionBody(draft)});
test('normalization is exact decimal, whitelist only; receipt image and token are never journaled',async()=>{
 const body=normalizedTransactionBody({...draft,image:'private-image',rawOcr:'private-raw-text'} as any);
 assert.equal(JSON.parse(body).amount,'7.10');assert.equal(JSON.parse(body).description,'ร้านทดสอบ');assert.equal(JSON.parse(body).transactionTimeConfirmed,false);
 const storage=new MemoryStorage(),r={...request(),body};
 await storePendingTransaction('synthetic-session-a',r,()=>true,storage as any);
 assert.deepEqual(await loadPendingTransaction('synthetic-session-a',()=>true,storage as any),r);
 const raw=storage.getItem(PENDING_TRANSACTION_KEY)!;
 for(const secret of ['private-image','private-raw-text','synthetic-session-a'])assert.equal(raw.includes(secret),false);
});
test('reload round trip preserves exact body bytes/key and independent account cannot load it',async()=>{
 const storage=new MemoryStorage(),r=request();
 await storePendingTransaction('a',r,()=>true,storage as any);
 assert.equal((await loadPendingTransaction('a',()=>true,storage as any))!.body,r.body);
 assert.equal((await loadPendingTransaction('a',()=>true,storage as any))!.key,r.key);
 assert.equal(await loadPendingTransaction('b',()=>true,storage as any),null);assert.equal(storage.getItem(PENDING_TRANSACTION_KEY),null);
});
test('session race cannot restore a journal after logout; clear only matching request',async()=>{
 const storage=new MemoryStorage(),r=request();
 await assert.rejects(storePendingTransaction('a',r,()=>false,storage as any));assert.equal(storage.data.size,0);
 await storePendingTransaction('a',r,()=>true,storage as any);
 clearPendingTransaction('different-key',storage as any);assert.equal(storage.data.size,1);
 clearPendingTransaction(r.key,storage as any);assert.equal(storage.data.size,0);
});
test('storage failure and tampering must block replay instead of guessing a fresh request',async()=>{
 const storage=new MemoryStorage(),r=request();
 await assert.rejects(storePendingTransaction('a',r,()=>true,{setItem(){throw Error('Quota exceeded');}} as any));
 await storePendingTransaction('a',r,()=>true,storage as any);
 const raw=JSON.parse(storage.getItem(PENDING_TRANSACTION_KEY)!);raw.body=JSON.stringify({...JSON.parse(raw.body),transactionTimeConfirmed:true});storage.setItem(PENDING_TRANSACTION_KEY,JSON.stringify(raw));
 await assert.rejects(loadPendingTransaction('a',()=>true,storage as any));
});
test('only explicit definitive API rejections clear pending state',()=>{
 assert.equal(definitiveTransactionRejection(409,{code:'IDEMPOTENCY_CONFLICT'}),true);
 assert.equal(definitiveTransactionRejection(400,{code:'INVALID_TRANSACTION'}),true);
 for(const status of [408,429,500,502,503])assert.equal(definitiveTransactionRejection(status,{code:'INVALID_TRANSACTION'}),false);
 assert.equal(definitiveTransactionRejection(400,{}),false);
});
