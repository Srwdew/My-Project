// ISSUE-ANOM-1: a category whose amount level moved for good. Detection is immutable (AnomalyLevelShift); the
// user's answer is an append-only chain (AnomalyLevelShiftAction). While a shift waits, items keep their flags
// (flagged-unreviewed stays out of every baseline) but the queue and notifications show the shift once.
import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { GoalTx } from "./goalWriteTransaction";
import { GoalError } from "./goalWriteTransaction";
import { ANOMALY_RULE, RULE_VERSION, detectLevelShift, levelShiftStartIndex, type Direction } from "./anomalyRules";

const day = (d: Date) => d.toISOString().slice(0, 10);
export type ShiftState = { id: string; direction: Direction; startDate: string; status: "pending" | "confirmed" | "rejected"; actionId: string | null; actedOn: string | null };

/** Every shift of one category with its current status (latest action wins). */
export async function categoryShifts(tx: GoalTx, userId: string, categoryId: string): Promise<ShiftState[]> {
  const rows = await tx.anomalyLevelShift.findMany({
    where: { userId, categoryId },
    include: { actions: { orderBy: { sequence: "desc" }, take: 1 } },
    orderBy: [{ detectedAt: "asc" }, { id: "asc" }],
  });
  return rows.map((s) => {
    const a = s.actions[0];
    return { id: s.id, direction: s.direction as Direction, startDate: day(s.startDate), status: a ? (a.action as "confirmed" | "rejected") : "pending", actionId: a?.id ?? null, actedOn: a ? day(a.decidedAt) : null };
  });
}
/** A confirmed shift moves the baseline window start for this category (category and account fallback alike). */
export const baselineSince = (shifts: ShiftState[], date: string) =>
  shifts.filter((s) => s.status === "confirmed" && s.startDate <= date).map((s) => s.startDate).sort().pop() ?? null;
/** Per-item notices are held from the shift's start date while an up shift waits for the user. */
export const noticeHeld = (shifts: ShiftState[], date: string) =>
  shifts.some((s) => s.status === "pending" && s.direction === "up" && s.startDate <= date);

/** Runs after a row's evaluation is stored. Reads the latest amount results of the category (current revisions,
 *  amount actually evaluated, date then id) up to this row, and records a shift if one is found. */
export async function detectShift(tx: GoalTx, userId: string, row: { id: string; categoryId: string; transactionDate: Date }, categoryName: string, shifts: ShiftState[]) {
  const recent = await tx.$queryRaw<{ id: string; revision: number; date: Date; direction: string | null }[]>(Prisma.sql`
   SELECT t.id,t."anomalyRevision" AS revision,t."transactionDate" AS date,e.snapshot->>'amountDirection' AS direction
   FROM "Transaction" t JOIN LATERAL (SELECT snapshot FROM "AnomalyEvaluation" ev WHERE ev."userId"=t."userId" AND ev."originalTransactionId"=t.id AND ev.revision=t."anomalyRevision" ORDER BY ev."evaluatedAt" DESC,ev.id DESC LIMIT 1) e ON true
   WHERE t."userId"=${userId} AND t."categoryId"=${row.categoryId} AND t.type='expense'
   AND (t."transactionDate"<${row.transactionDate} OR (t."transactionDate"=${row.transactionDate} AND t.id<=${row.id}))
   AND e.snapshot#>>'{assessment,amount,status}'<>'not_evaluated'
   ORDER BY t."transactionDate" DESC,t.id DESC LIMIT ${ANOMALY_RULE.levelShiftWindow * 4}`);
  const ordered = recent.reverse().map((r) => ({ ...r, date: day(r.date), direction: (r.direction as Direction | null) ?? null }));
  const d = detectLevelShift(ordered.map((r) => r.direction));
  if (!d) return null;
  const same = shifts.filter((s) => s.direction === d);
  if (same.some((s) => s.status === "pending")) return null;
  // Two rejections in a row for this category and direction: stop asking (until reset from settings).
  if (same.length >= 2 && same.slice(-2).every((s) => s.status === "rejected")) return null;
  // After an answer, only results dated after it may detect this direction again.
  const answered = same.map((s) => s.actedOn!).sort().pop();
  const since = answered ? ordered.filter((r) => r.date > answered) : ordered;
  if (detectLevelShift(since.map((r) => r.direction)) !== d) return null;
  const window = since.slice(-ANOMALY_RULE.levelShiftWindow), startDate = since[levelShiftStartIndex(since.map((r) => r.direction), d)]!.date;
  const shift = await tx.anomalyLevelShift.create({
    data: {
      id: randomUUID(), userId, categoryId: row.categoryId, direction: d, startDate: new Date(startDate + "T00:00:00Z"), ruleVersion: RULE_VERSION,
      evidence: { window: ANOMALY_RULE.levelShiftWindow, required: ANOMALY_RULE.levelShiftRequired, transactions: window.map((r) => ({ id: r.id, revision: r.revision, date: r.date, direction: r.direction })) },
    },
  });
  // One notice per up shift; a lower level is shown in the queue only (spending less is not worth an alert).
  if (d === "up")
    await tx.notification.createMany({
      skipDuplicates: true,
      data: [{ userId, type: "transaction_anomaly", eventKey: "anomaly-level-shift:" + shift.id, sourceId: shift.id, title: "ค่าใช้จ่ายขยับเป็นระดับใหม่", message: `ค่าใช้จ่ายหมวด${categoryName.slice(0, 180)}ขยับเป็นระดับใหม่ตั้งแต่ ${startDate} ถ้าใช่ ยืนยันครั้งเดียวในหน้ารายการรอตรวจสอบ ระบบจะเลิกถามทีละรายการ`, link: null }],
    });
  return shift;
}

/** The user's answer. Confirming an up shift writes `normal` for the amount dimension of each still-undecided
 *  flagged item since the start, one decision per item tied to its own revision and to this shift. */
export async function levelShiftAction(tx: GoalTx, userId: string, id: string, action: "confirmed" | "rejected", expectedActionId: string | null) {
  const shift = await tx.anomalyLevelShift.findFirst({ where: { id, userId }, include: { actions: { orderBy: { sequence: "desc" }, take: 1 } } });
  if (!shift) throw new GoalError(404, "NOT_FOUND", "ไม่พบข้อมูล");
  const previous = shift.actions[0] ?? null;
  if ((previous?.id ?? null) !== expectedActionId) throw new GoalError(409, "DECISION_CONFLICT", "มีคำตอบใหม่แล้ว โปรดโหลดใหม่ก่อนยืนยัน");
  if (previous?.action === action) return { status: 200, action: previous, decided: 0 };
  const created = await tx.anomalyLevelShiftAction.create({ data: { id: randomUUID(), userId, levelShiftId: id, action, sequence: (previous?.sequence ?? 0) + 1, supersedesId: previous?.id ?? null } });
  let decided = 0;
  if (action === "confirmed" && shift.direction === "up") {
    const items = await tx.$queryRaw<{ evaluationId: string; id: string; revision: number }[]>(Prisma.sql`
     SELECT e.id AS "evaluationId",t.id,t."anomalyRevision" AS revision FROM "Transaction" t
     JOIN LATERAL (SELECT * FROM "AnomalyEvaluation" ev WHERE ev."userId"=t."userId" AND ev."originalTransactionId"=t.id AND ev.revision=t."anomalyRevision" ORDER BY ev."evaluatedAt" DESC,ev.id DESC LIMIT 1) e ON true
     WHERE t."userId"=${userId} AND t."categoryId"=${shift.categoryId} AND t.type='expense' AND NOT t."anomalyPending" AND t."transactionDate">=${shift.startDate}
     AND e.snapshot#>>'{assessment,amount,status}'='flagged'
     AND NOT EXISTS(SELECT 1 FROM "AnomalyDecision" d WHERE d."userId"=t."userId" AND d."originalTransactionId"=t.id AND d.revision=t."anomalyRevision" AND d.dimension='amount')
     ORDER BY t."transactionDate",t.id`);
    for (const it of items) {
      await tx.anomalyDecision.create({ data: { id: randomUUID(), userId, evaluationId: it.evaluationId, originalTransactionId: it.id, revision: it.revision, dimension: "amount", action: "normal", sequence: 1, supersedesId: null, levelShiftId: id } });
      decided++;
    }
  }
  return { status: 201, action: created, decided };
}

/** Shifts waiting for the user, with how many flagged items each one stands for in the queue. */
export async function pendingShifts(tx: GoalTx, userId: string) {
  return tx.$queryRaw<{ id: string; categoryId: string; categoryName: string; direction: string; startDate: Date; detectedAt: Date; covered: number }[]>(Prisma.sql`
   SELECT s.id,s."categoryId",c.name AS "categoryName",s.direction,s."startDate",s."detectedAt",
   (SELECT count(*)::int FROM "Transaction" t JOIN LATERAL (SELECT snapshot FROM "AnomalyEvaluation" ev WHERE ev."userId"=t."userId" AND ev."originalTransactionId"=t.id AND ev.revision=t."anomalyRevision" ORDER BY ev."evaluatedAt" DESC,ev.id DESC LIMIT 1) e ON true
    WHERE s.direction='up' AND t."userId"=s."userId" AND t."categoryId"=s."categoryId" AND t."transactionDate">=s."startDate" AND e.snapshot#>>'{assessment,amount,status}'='flagged') AS covered
   FROM "AnomalyLevelShift" s JOIN "Category" c ON c.id=s."categoryId"
   WHERE s."userId"=${userId} AND NOT EXISTS(SELECT 1 FROM "AnomalyLevelShiftAction" a WHERE a."userId"=s."userId" AND a."levelShiftId"=s.id)
   ORDER BY s."detectedAt",s.id`);
}
/** SQL condition: this queue row's amount flag is represented by a waiting up shift (time flags still show). */
export const coveredByShift = Prisma.sql`EXISTS(SELECT 1 FROM "AnomalyLevelShift" s WHERE s."userId"=t."userId" AND s."categoryId"=t."categoryId" AND s.direction='up' AND t."transactionDate">=s."startDate"
 AND NOT EXISTS(SELECT 1 FROM "AnomalyLevelShiftAction" a WHERE a."userId"=s."userId" AND a."levelShiftId"=s.id))`;
