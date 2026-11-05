import { Router } from "express";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { bangkokToday } from "../lib/goalCalculations";
import { BEHAVIOR_RULE, behaviorPeriod, BehaviorInputError } from "../lib/behaviorRules";
import { addDays, utcDate } from "../lib/cycle";
import { progressWithToday } from "../lib/unlockProgress";
import { behaviorInput, buildBehavior } from "../lib/behavior";
export const behaviorRouter = Router();
behaviorRouter.get(
  "/behavior",
  authMiddleware,
  async (req: AuthRequest, res) => {
    res.set("Cache-Control", "private, no-store");
    try {
      const asOfDate = bangkokToday(),
        period = behaviorPeriod(req.query, asOfDate);
      const { input, todayCount } = await prisma.$transaction(
        async (tx) => ({
          input: await behaviorInput(tx, req.user!.userId, period, asOfDate),
          todayCount: await tx.transaction.count({
            where: { userId: req.user!.userId, type: "expense", transactionDate: utcDate(asOfDate), ...(period.categoryId ? { categoryId: period.categoryId } : {}) },
          }),
        }),
        { isolationLevel: "RepeatableRead" },
      );
      const behavior = buildBehavior(input);
      const c = behavior.readiness.current;
      // Only a period ending yesterday continues into today; an older chosen range keeps its own numbers.
      const progress = progressWithToday(
        { count: c.expenseCount, span: c.observedSpanDays, firstDate: behavior.facts.summary.current.firstDate, minCount: BEHAVIOR_RULE.minimumCount, minSpan: BEHAVIOR_RULE.minimumSpan },
        period.current.endDate === addDays(asOfDate, -1) ? todayCount : 0,
        asOfDate,
      );
      return res.json({ ...behavior, progress });
    } catch (e) {
      return res
        .status(e instanceof BehaviorInputError ? 400 : 500)
        .json({
          code:
            e instanceof BehaviorInputError
              ? "INVALID_BEHAVIOR_QUERY"
              : "BEHAVIOR_FAILED",
          error:
            e instanceof BehaviorInputError
              ? e.message
              : "โหลดข้อมูลพฤติกรรมไม่สำเร็จ กรุณาลองใหม่",
        });
    }
  },
);
