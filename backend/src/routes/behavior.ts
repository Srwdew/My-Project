import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { bangkokToday } from '../lib/goalCalculations';
import { behaviorPeriod, BehaviorInputError } from '../lib/behaviorRules';
import { behaviorInput, buildBehavior } from '../lib/behavior';
export const behaviorRouter=Router();
behaviorRouter.get('/behavior',authMiddleware,async(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  try{
    const asOfDate=bangkokToday(),period=behaviorPeriod(req.query,asOfDate);
    const input=await prisma.$transaction(tx=>behaviorInput(tx,req.user!.userId,period,asOfDate),{isolationLevel:'RepeatableRead'});
    return res.json(buildBehavior(input));
  }catch(e){
    return res.status(e instanceof BehaviorInputError?400:500).json({code:e instanceof BehaviorInputError?'INVALID_BEHAVIOR_QUERY':'BEHAVIOR_FAILED',error:e instanceof BehaviorInputError?e.message:'โหลดข้อมูลพฤติกรรมไม่สำเร็จ กรุณาลองใหม่'});
  }
});
