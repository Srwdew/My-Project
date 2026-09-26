import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { bangkokToday } from '../lib/goalCalculations';
import { forecastInput, buildForecast } from '../lib/expenseForecast';
export const forecastRouter=Router();
forecastRouter.get('/forecast',authMiddleware,async(req:AuthRequest,res)=>{
  res.set('Cache-Control','private, no-store');
  if(Object.keys(req.query).length) return res.status(400).json({code:'UNSUPPORTED_QUERY',error:'ไม่รับ userId วันตัดข้อมูล หรือช่วงเวลาจาก client'});
  try{
    const asOfDate=bangkokToday();
    const input=await prisma.$transaction(tx=>forecastInput(tx,req.user!.userId,asOfDate),{isolationLevel:'RepeatableRead'});
    return res.json(buildForecast(input));
  }catch{return res.status(500).json({code:'FORECAST_FAILED',error:'โหลดประมาณการไม่สำเร็จ กรุณาลองใหม่'});}
});
