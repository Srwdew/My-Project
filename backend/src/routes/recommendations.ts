import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { bangkokToday } from "../lib/goalCalculations";
import { recommendationProvenance, runRecommendations } from "../lib/recommendation/service";

export const recommendationsRouter = Router();
const fail = (res: import("express").Response) =>
  res.status(500).json({ code: "RECOMMENDATIONS_FAILED", error: "โหลดคำแนะนำไม่สำเร็จ กรุณาลองใหม่" });

recommendationsRouter.get("/recommendations", authMiddleware, async (req: AuthRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  if (Object.keys(req.query).length)
    return res.status(400).json({ code: "UNSUPPORTED_QUERY", error: "ไม่รับ userId หรือวันที่จาก client" });
  try {
    return res.json(await runRecommendations(req.user!.userId, bangkokToday()));
  } catch {
    return fail(res);
  }
});

recommendationsRouter.get("/recommendations/:id", authMiddleware, async (req: AuthRequest, res) => {
  res.set("Cache-Control", "private, no-store");
  try {
    const p = await recommendationProvenance(req.user!.userId, String(req.params.id));
    return p ? res.json(p) : res.status(404).json({ code: "NOT_FOUND", error: "ไม่พบคำแนะนำนี้" });
  } catch {
    return fail(res);
  }
});

const actionSchema = z.object({ action: z.enum(["followed", "dismissed", "ignored"]) }).strict();
recommendationsRouter.post("/recommendations/:id/action", authMiddleware, async (req: AuthRequest, res) => {
  const body = actionSchema.safeParse(req.body);
  if (!body.success) return res.status(400).json({ code: "INVALID_ACTION", error: "action ต้องเป็น followed, dismissed หรือ ignored" });
  try {
    // Scoped to the caller's own rows: another user's id updates nothing and reads as not found.
    const { count } = await prisma.recommendationLog.updateMany({ where: { id: String(req.params.id), userId: req.user!.userId }, data: { userAction: body.data.action } });
    return count ? res.json({ id: req.params.id, userAction: body.data.action }) : res.status(404).json({ code: "NOT_FOUND", error: "ไม่พบคำแนะนำนี้" });
  } catch {
    return fail(res);
  }
});
