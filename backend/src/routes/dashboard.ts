import { Router } from 'express';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { bangkokToday } from '../lib/goalCalculations';
import { DashboardInputError, dashboardPeriod, dashboardView } from '../lib/dashboard';
export const dashboardRouter = Router();
dashboardRouter.get('/dashboard', authMiddleware, async (req: AuthRequest, res) => {
  res.set('Cache-Control', 'private, no-store');
  try {
    if (Object.keys(req.query).some(k => k !== 'month')) throw new DashboardInputError('รับเฉพาะ month ไม่รับ userId');
    const asOfDate = bangkokToday();
    dashboardPeriod(req.query.month, asOfDate);
    return res.json(await prisma.$transaction(tx => dashboardView(tx, req.user!.userId, req.query.month, asOfDate), { isolationLevel: 'RepeatableRead' }));
  } catch (e) { return res.status(e instanceof DashboardInputError ? 400 : 500).json({ error: e instanceof DashboardInputError ? e.message : 'โหลด Dashboard ไม่สำเร็จ กรุณาลองใหม่' }); }
});