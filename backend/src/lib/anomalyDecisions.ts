import { bangkokToday } from "./goalCalculations";
import { globalGate } from "./anomalyRules";
import { manualPattern } from "./anomalyPatterns";
import { coveredByShift, pendingShifts } from "./anomalyLevelShift";
import type { Cadence } from "./anomalyPatternPolicy";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { GoalError, type GoalTx } from "./goalWriteTransaction";
export type DecisionInput = {
  dimension: "amount" | "time";
  action: "normal" | "occasional" | "problem" | "recurring";
  cadence?: Cadence | undefined;
  patternId?: string | undefined;
  revision: number;
  expectedDecisionId: string | null;
};
export async function decisionView(
  tx: GoalTx,
  userId: string,
  evaluationId: string,
) {
  const e = await tx.anomalyEvaluation.findFirst({
    where: { id: evaluationId, userId },
  });
  if (!e) throw new GoalError(404, "NOT_FOUND", "ไม่พบข้อมูล");
  const history = await tx.anomalyDecision.findMany({
    where: {
      userId,
      originalTransactionId: e.originalTransactionId,
      revision: e.revision,
    },
    orderBy: [{ dimension: "asc" }, { sequence: "desc" }],
  });
  const legacy = await tx.anomalyReview.findMany({
    where: {
      userId,
      originalTransactionId: e.originalTransactionId,
      revision: e.revision,
    },
    orderBy: { sequence: "desc" },
  });
  return {
    evaluationId,
    revision: e.revision,
    dimensions: Object.fromEntries(
      ["amount", "time"].map((d) => [
        d,
        {
          current: history.find((h) => h.dimension === d) ?? null,
          history: history.filter((h) => h.dimension === d),
        },
      ]),
    ),
    legacyHistory: legacy,
    legacyState: legacy[0]?.action ?? null,
  };
}
export async function submitDecision(
  tx: GoalTx,
  userId: string,
  evaluationId: string,
  key: string,
  input: DecisionInput,
) {
  const fingerprint = createHash("sha256")
    .update(JSON.stringify({ evaluationId, ...input }))
    .digest("hex");
  const receipt = await tx.anomalyDecisionRequest.findUnique({
    where: { userId_idempotencyKey: { userId, idempotencyKey: key } },
    include: { decision: true },
  });
  if (receipt) {
    if (receipt.fingerprint !== fingerprint)
      throw new GoalError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "คำขอเดิมใช้ข้อมูลต่างกัน",
      );
    return { status: receipt.status, body: { decision: receipt.decision } };
  }
  const e = await tx.anomalyEvaluation.findFirst({
    where: { id: evaluationId, userId },
  });
  if (!e) throw new GoalError(404, "NOT_FOUND", "ไม่พบข้อมูล");
  if ((e.snapshot as any)?.gate?.ready === false)
    throw new GoalError(
      409,
      "GLOBAL_GATE_NOT_READY",
      "ยังไม่ผ่านเกณฑ์เริ่มตรวจ ไม่รับคำตัดสินของ evaluation นี้",
    );
  if (e.revision !== input.revision)
    throw new GoalError(
      409,
      "REVISION_CONFLICT",
      "revision ไม่ตรงกับผลที่กำลังดู",
    );
  const where = {
    userId,
    originalTransactionId: e.originalTransactionId,
    revision: e.revision,
    dimension: input.dimension,
  };
  const previous = await tx.anomalyDecision.findFirst({
    where,
    orderBy: { sequence: "desc" },
  });
  if ((previous?.id ?? null) !== input.expectedDecisionId)
    throw new GoalError(
      409,
      "DECISION_CONFLICT",
      "มีคำตัดสินใหม่แล้ว โปรดโหลดประวัติก่อนยืนยัน",
    );
  const samePattern =
    input.action !== "recurring" || input.patternId === previous?.patternId;
  const status = previous?.action === input.action && samePattern ? 200 : 201;
  const patternId =
    input.action === "recurring"
      ? status === 200
        ? previous!.patternId
        : await manualPattern(
            tx,
            userId,
            e,
            input.dimension,
            input.cadence,
            input.patternId,
          )
      : null;
  const decision =
    status === 200
      ? previous!
      : await tx.anomalyDecision.create({
          data: {
            id: randomUUID(),
            ...where,
            evaluationId,
            patternId,
            action: input.action,
            sequence: (previous?.sequence ?? 0) + 1,
            supersedesId: previous?.id ?? null,
          },
        });
  await tx.anomalyDecisionRequest.create({
    data: {
      userId,
      idempotencyKey: key,
      fingerprint,
      decisionId: decision.id,
      status,
    },
  });
  return { status, body: { decision } };
}
export async function anomalyQueue(
  tx: GoalTx,
  userId: string,
  filter: string,
  offset: number,
  limit: number,
) {
  // All current flags stay queryable. Pagination limits responses, never the stored queue.
  const result = await tx.$queryRaw<
    { total: number; items: any[] }[]
  >(Prisma.sql`
 WITH queue AS (
 SELECT e.id,e.revision,e."originalTransactionId",e."evaluatedAt",e.snapshot,
 CASE WHEN e.snapshot#>>'{assessment,level}'='review_priority' THEN 0 ELSE 1 END AS severity,
 EXISTS(SELECT 1 FROM unnest(ARRAY['amount','time']) AS dim(name)
 WHERE e.snapshot#>>ARRAY['assessment',dim.name,'status']='flagged'
 AND NOT EXISTS(SELECT 1 FROM "AnomalyDecision" d WHERE d."userId"=e."userId" AND d."originalTransactionId"=e."originalTransactionId" AND d.revision=e.revision AND d.dimension=dim.name)
 AND NOT EXISTS(SELECT 1 FROM "AnomalyReview" r WHERE r."userId"=e."userId" AND r."originalTransactionId"=e."originalTransactionId" AND r.revision=e.revision)) AS waiting
 FROM "Transaction" t JOIN LATERAL (SELECT * FROM "AnomalyEvaluation" ev WHERE ev."userId"=t."userId" AND ev."originalTransactionId"=t.id AND ev.revision=t."anomalyRevision" ORDER BY ev."evaluatedAt" DESC,ev.id DESC LIMIT 1) e ON true
 WHERE t."userId"=${userId} AND t.type='expense' AND NOT t."anomalyPending" AND e.outcome='flagged'
 AND NOT (${coveredByShift} AND coalesce(e.snapshot#>>'{assessment,time,status}','')<>'flagged')
 ), filtered AS (SELECT * FROM queue WHERE (${filter}<>'waiting' OR waiting)
 AND (${filter} NOT IN ('amount','time') OR snapshot#>>ARRAY['assessment',${filter},'status']='flagged'))
 SELECT (SELECT count(*)::int FROM filtered) AS total,coalesce((SELECT jsonb_agg(page ORDER BY page.severity,page."evaluatedAt",page.id) FROM (SELECT * FROM filtered ORDER BY severity,"evaluatedAt",id OFFSET ${offset} LIMIT ${limit}) page),'[]'::jsonb) AS items`);
  const rows = result[0]?.items ?? [];
  const count = await tx.$queryRaw<{ pending: number }[]>(
    Prisma.sql`SELECT count(*)::int AS pending FROM "Transaction" WHERE "userId"=${userId} AND "anomalyPending"`,
  );
  const today = bangkokToday(),
    cutoff = new Date(today + "T00:00:00Z");
  const g = (
    await tx.$queryRaw<{ n: number; days: number }[]>(
      Prisma.sql`SELECT count(*)::int AS n,coalesce(max("transactionDate")-min("transactionDate")+1,0)::int AS days FROM "Transaction" WHERE "userId"=${userId} AND type='expense' AND "transactionDate"<${cutoff}`,
    )
  )[0]!;
  const enabled = Boolean(
    (await tx.anomalyNotificationSetting.findUnique({ where: { userId } }))
      ?.enabled,
  );
  // A waiting shift stands in for the amount flags it covers: one queue entry instead of one per item.
  const levelShifts =
    filter === "time"
      ? []
      : (await pendingShifts(tx, userId)).map((s) => ({
          ...s,
          startDate: s.startDate.toISOString().slice(0, 10),
        }));
  return {
    levelShifts,
    readiness: {
      asOfDate: today,
      count: g.n,
      inclusiveDays: g.days,
      ready: globalGate(g.n, g.days),
      enabled,
    },
    items: rows,
    total: (result[0]?.total ?? 0) + levelShifts.length,
    offset,
    limit,
    pendingEvaluation: count[0]?.pending ?? 0,
    policy: {
      pushDelivery: false,
      patternMatching: false,
      patternBlocker: "absolute_floor_unresolved",
    },
  };
}
