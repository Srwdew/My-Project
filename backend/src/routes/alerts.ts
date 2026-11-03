import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { bangkokToday } from "../lib/goalCalculations";
import { loadAlerts } from "../lib/alerts";

export const alertsRouter = Router();
alertsRouter.get("/alerts", authMiddleware, async (req: AuthRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  if (Object.keys(req.query).length) return res.status(400).json({ code: "UNSUPPORTED_QUERY", error: "ไม่รับ query parameters" });
  try {
    return res.json(await prisma.$transaction((tx) => loadAlerts(tx, req.user!.userId, bangkokToday()), { isolationLevel: "RepeatableRead" }));
  } catch {
    return res.status(500).json({ code: "ALERTS_FAILED", error: "โหลดสถานะไม่สำเร็จ กรุณาลองใหม่" });
  }
});
