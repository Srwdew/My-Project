import { patternView, patternOperation } from "../lib/anomalyPatterns";
import {
  anomalyQueue,
  decisionView,
  submitDecision,
} from "../lib/anomalyDecisions";
import { reviewView, submitReview } from "../lib/anomalyReview";
import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import {
  withAnomalyLock,
  reconcileAnomalies,
  anomalyDetail,
} from "../lib/anomaly";
import { GoalError } from "../lib/goalWriteTransaction";
export const anomalyRouter = Router();
const handle =
  (fn: (req: AuthRequest, res: any) => Promise<unknown>) =>
  async (req: AuthRequest, res: any) => {
    res.set("Cache-Control", "private, no-store");
    try {
      await fn(req, res);
    } catch (e) {
      if (!(e instanceof GoalError) && !(e instanceof z.ZodError)) {
        const code = (e as { code?: unknown })?.code;
        console.error(
          "[anomaly] request failed",
          typeof code === "string" && /^[A-Z0-9_]{1,32}$/.test(code)
            ? code
            : "UNCLASSIFIED",
        );
      }
      res
        .status(
          e instanceof GoalError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 503,
        )
        .json({
          error:
            e instanceof GoalError
              ? e.message
              : "ตรวจรายการไม่สำเร็จ กรุณาลองใหม่",
        });
    }
  };
anomalyRouter.post(
  "/notifications/anomaly/reconcile",
  authMiddleware,
  handle(async (req, res) => {
    if (Object.keys(req.query).length)
      throw new GoalError(400, "INVALID_QUERY", "ไม่รับ query parameters");
    const input = z
      .object({
        limit: z.number().int().min(1).max(50).default(10),
        cursor: z.string().uuid().optional(),
      })
      .strict()
      .parse(req.body ?? {});
    res.json(await reconcileAnomalies(req.user!, input.limit, input.cursor));
  }),
);
anomalyRouter.get(
  "/transactions/:id/anomaly",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json(
      await withAnomalyLock(req.user!, async (tx) => {
        if (
          !(await tx.transaction.findFirst({
            where: { id, userId: req.user!.userId },
            select: { id: true },
          }))
        )
          throw new GoalError(404, "NOT_FOUND", "ไม่พบข้อมูล");
        return anomalyDetail(tx, req.user!.userId, id);
      }),
    );
  }),
);
anomalyRouter.get(
  "/notifications/:id/anomaly",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json(
      await withAnomalyLock(req.user!, async (tx) => {
        const notice = await tx.notification.findFirst({
          where: { id, userId: req.user!.userId, type: "transaction_anomaly" },
        });
        const evaluation = notice?.sourceId
          ? await tx.anomalyEvaluation.findFirst({
              where: { id: notice.sourceId, userId: req.user!.userId },
            })
          : null;
        if (!evaluation) throw new GoalError(404, "NOT_FOUND", "ไม่พบข้อมูล");
        return anomalyDetail(
          tx,
          req.user!.userId,
          evaluation.originalTransactionId,
          evaluation.id,
        );
      }),
    );
  }),
);
anomalyRouter.post(
  "/anomaly/evaluations/:id/reviews",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      key = z.string().uuid().parse(req.get("Idempotency-Key"));
    if (Object.keys(req.query).length)
      throw new GoalError(400, "INVALID_QUERY", "ไม่รับ query parameters");
    const input = z
      .object({
        action: z.enum(["confirmed_normal", "confirmed_problem"]),
        revision: z.number().int().min(0).max(2147483647),
        expectedReviewSequence: z.number().int().min(0).max(2147483646),
      })
      .strict()
      .parse(req.body);
    const result = await withAnomalyLock(req.user!, (tx) =>
      submitReview(tx, req.user!.userId, id, key, input),
    );
    res.status(result.status).json(result.body);
  }),
);
anomalyRouter.get(
  "/anomaly/evaluations/:id/reviews",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(50).default(10),
        cursor: z.coerce.number().int().min(1).max(2147483647).optional(),
      })
      .strict()
      .parse(req.query);
    res.json(
      await withAnomalyLock(req.user!, (tx) =>
        reviewView(tx, req.user!.userId, id, query.limit, query.cursor),
      ),
    );
  }),
);
anomalyRouter.get(
  "/anomaly/queue",
  authMiddleware,
  handle(async (req, res) => {
    const q = z
      .object({
        filter: z.enum(["all", "waiting", "amount", "time"]).default("waiting"),
        offset: z.coerce.number().int().min(0).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(25),
      })
      .strict()
      .parse(req.query);
    res.json(
      await withAnomalyLock(req.user!, (tx) =>
        anomalyQueue(tx, req.user!.userId, q.filter, q.offset, q.limit),
      ),
    );
  }),
);
anomalyRouter.get(
  "/anomaly/evaluations/:id/decisions",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    res.json(
      await withAnomalyLock(req.user!, (tx) =>
        decisionView(tx, req.user!.userId, id),
      ),
    );
  }),
);
anomalyRouter.post(
  "/anomaly/evaluations/:id/decisions",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      key = z.string().uuid().parse(req.get("Idempotency-Key"));
    const input = z
      .object({
        dimension: z.enum(["amount", "time"]),
        action: z.enum(["normal", "occasional", "problem", "recurring"]),
        cadence: z
          .enum([
            "weekly",
            "fortnightly",
            "monthly",
            "quarterly",
            "half_yearly",
            "yearly",
          ])
          .optional(),
        patternId: z.string().uuid().optional(),
        revision: z.number().int().min(0).max(2147483647),
        expectedDecisionId: z.string().uuid().nullable(),
      })
      .strict()
      .parse(req.body);
    if (input.action !== "recurring" && (input.cadence || input.patternId))
      throw new GoalError(
        400,
        "INVALID_PATTERN",
        "กรุณาเลือกรอบใหม่หรือรูปแบบเดิมอย่างใดอย่างหนึ่ง เฉพาะคำตัดสินตามรอบ",
      );
    if (
      input.action === "recurring" &&
      Boolean(input.cadence) === Boolean(input.patternId)
    )
      throw new GoalError(
        400,
        "INVALID_PATTERN",
        "กรุณาเลือกรอบใหม่หรือรูปแบบเดิมอย่างใดอย่างหนึ่ง เฉพาะคำตัดสินตามรอบ",
      );
    const r = await withAnomalyLock(req.user!, (tx) =>
      submitDecision(tx, req.user!.userId, id, key, input),
    );
    res.status(r.status).json(r.body);
  }),
);

anomalyRouter.get(
  "/anomaly/patterns",
  authMiddleware,
  handle(async (req, res) => {
    res.json(
      await withAnomalyLock(req.user!, (tx) =>
        patternView(tx, req.user!.userId),
      ),
    );
  }),
);
anomalyRouter.post(
  "/anomaly/patterns/:id/events",
  authMiddleware,
  handle(async (req, res) => {
    const id = z.string().uuid().parse(req.params.id),
      key = z.string().uuid().parse(req.get("Idempotency-Key"));
    const input = z
      .object({
        action: z.enum(["refresh", "restore"]),
        expectedEventId: z.string().uuid(),
      })
      .strict()
      .parse(req.body);
    res.json({
      event: await withAnomalyLock(req.user!, (tx) =>
        patternOperation(tx, req.user!.userId, id, key, input),
      ),
    });
  }),
);
