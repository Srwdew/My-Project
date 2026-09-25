import { reviewView, submitReview } from '../lib/anomalyReview';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware,type AuthRequest } from '../middleware/auth';
import { withAnomalyLock,reconcileAnomalies,anomalyDetail } from '../lib/anomaly';
import { GoalError } from '../lib/goalWriteTransaction';
export const anomalyRouter=Router();
const handle=(fn:(req:AuthRequest,res:any)=>Promise<unknown>)=>async(req:AuthRequest,res:any)=>{res.set('Cache-Control','private, no-store');try{await fn(req,res);}catch(e){res.status(e instanceof GoalError?e.status:e instanceof z.ZodError?400:503).json({error:e instanceof GoalError?e.message:'ตรวจรายการไม่สำเร็จ กรุณาลองใหม่'});}};
anomalyRouter.post('/notifications/anomaly/reconcile',authMiddleware,handle(async(req,res)=>{if(Object.keys(req.query).length)throw new GoalError(400,'INVALID_QUERY','ไม่รับ query parameters');const input=z.object({limit:z.number().int().min(1).max(50).default(10),cursor:z.string().uuid().optional()}).strict().parse(req.body??{});res.json(await reconcileAnomalies(req.user!,input.limit,input.cursor));}));
anomalyRouter.get('/transactions/:id/anomaly',authMiddleware,handle(async(req,res)=>{const id=z.string().uuid().parse(req.params.id);res.json(await withAnomalyLock(req.user!,async tx=>{if(!await tx.transaction.findFirst({where:{id,userId:req.user!.userId},select:{id:true}}))throw new GoalError(404,'NOT_FOUND','ไม่พบรายการ');return anomalyDetail(tx,req.user!.userId,id);}));}));
anomalyRouter.get('/notifications/:id/anomaly',authMiddleware,handle(async(req,res)=>{const id=z.string().uuid().parse(req.params.id);res.json(await withAnomalyLock(req.user!,async tx=>{const notice=await tx.notification.findFirst({where:{id,userId:req.user!.userId,type:'transaction_anomaly'}});const evaluation=notice?.sourceId?await tx.anomalyEvaluation.findFirst({where:{id:notice.sourceId,userId:req.user!.userId}}):null;if(!evaluation)throw new GoalError(404,'NOT_FOUND','ไม่พบผลตรวจ');return anomalyDetail(tx,req.user!.userId,evaluation.originalTransactionId,evaluation.id);}));}));
anomalyRouter.post('/anomaly/evaluations/:id/reviews',authMiddleware,handle(async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id),key=z.string().uuid().parse(req.get('Idempotency-Key'));
 if(Object.keys(req.query).length)throw new GoalError(400,'INVALID_QUERY','ไม่รับ query parameters');
 const input=z.object({action:z.enum(['confirmed_normal','confirmed_problem']),revision:z.number().int().min(0).max(2147483647),expectedReviewSequence:z.number().int().min(0).max(2147483646)}).strict().parse(req.body);
 const result=await withAnomalyLock(req.user!,tx=>submitReview(tx,req.user!.userId,id,key,input));res.status(result.status).json(result.body);
}));
anomalyRouter.get('/anomaly/evaluations/:id/reviews',authMiddleware,handle(async(req,res)=>{
 const id=z.string().uuid().parse(req.params.id);
 const query=z.object({limit:z.coerce.number().int().min(1).max(50).default(10),cursor:z.coerce.number().int().min(1).max(2147483647).optional()}).strict().parse(req.query);
 res.json(await withAnomalyLock(req.user!,tx=>reviewView(tx,req.user!.userId,id,query.limit,query.cursor)));
}));