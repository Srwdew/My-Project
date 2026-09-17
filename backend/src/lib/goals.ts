import { randomUUID, createHash } from 'node:crypto';
import { Prisma, type Goal, type GoalOperationKind, type GoalFundingSource, type GoalLedgerEntry } from '@prisma/client';
import { D, bangkokToday, dateKey, calculateGoal, type SourceInput } from './goalCalculations';
import { withGoalLock, sourceNet, GoalError, type GoalTx } from './goalWriteTransaction';
export { GoalError } from './goalWriteTransaction';
const json = (x: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(x));
function canonical(x: unknown): unknown { if (Array.isArray(x))
    return x.map(canonical); if (x && typeof x === 'object')
    return Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)])); return x; }
export async function runOperation(userId: string, key: string, kind: GoalOperationKind, payload: unknown, work: (tx: GoalTx, opId: string, now: Date) => Promise<{
    status: number;
    body: unknown;
    reason?: string | undefined;
    correctsOperationId?: string;
    save: () => Promise<void>;
}>) {
    if (!/^[A-Za-z0-9_-]{8,100}$/.test(key))
        throw new GoalError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'กรุณาส่ง Idempotency-Key ความยาว 8–100 ตัวอักษร');
    const hash = createHash('sha256').update(JSON.stringify(canonical({ kind, payload }))).digest('hex');
    return withGoalLock(userId, async (tx) => {
        const old = await tx.goalOperation.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } } });
        if (old) {
            if (old.requestHash !== hash)
                throw new GoalError(409, 'IDEMPOTENCY_KEY_REUSED', 'คำขอเดิมถูกใช้กับข้อมูลที่ต่างกัน');
            return { status: old.responseStatus, body: old.responseBody };
        }
        const id = randomUUID(), now = new Date();
        const result = await work(tx, id, now);
        const body = json(result.body);
        // All IDs, timestamps and replay data exist before this single INSERT.
        await tx.goalOperation.create({ data: { id, userId, idempotencyKey: key, kind, requestHash: hash, responseStatus: result.status, responseBody: body, createdAt: now, ...(result.reason ? { reason: result.reason } : {}), ...(result.correctsOperationId ? { correctsOperationId: result.correctsOperationId } : {}) } });
        await result.save();
        return { status: result.status, body };
    });
}
export async function getGoal(tx: GoalTx, userId: string, id: string) {
    const goal = await tx.goal.findFirst({ where: { id, userId } });
    if (!goal)
        throw new GoalError(404, 'GOAL_NOT_FOUND', 'ไม่พบเป้าหมาย');
    return goal;
}
export async function goalSaved(tx: GoalTx, userId: string, goalId: string) {
    const rows = await tx.goalLedgerEntry.groupBy({ by: ['kind'], where: { userId, goalId }, _sum: { amount: true } });
    return rows.reduce((n, r) => r.kind === 'ALLOCATE' ? n.plus(r._sum.amount ?? 0) : n.minus(r._sum.amount ?? 0), new D(0));
}
export function goalView(goal: Goal, saved: Prisma.Decimal.Value, today = bangkokToday()) {
    return { ...goal, targetAmount: goal.targetAmount.toFixed(2), targetDate: goal.targetDate ? dateKey(goal.targetDate) : null, plannedMonthlyAmount: goal.plannedMonthlyAmount?.toFixed(2) ?? null, ...calculateGoal(goal, saved, today) };
}
export async function sourceView(tx: GoalTx, userId: string, source: GoalFundingSource) {
    const net = await sourceNet(tx, userId, source.id);
    return { ...source, openingAmount: source.openingAmount?.toFixed(2) ?? null, cutoffDate: source.cutoffDate ? dateKey(source.cutoffDate) : null, netAllocated: net.toFixed(2), availableAmount: new D(source.openingAmount ?? 0).minus(net).toFixed(2), cutoffLocked: await tx.goalLedgerEntry.count({ where: { userId, sourceId: source.id } }) > 0 };
}
async function eligibleSource(tx: GoalTx, userId: string, input: SourceInput) {
    const opening = await tx.goalFundingSource.findUnique({ where: { userId_sourceKey: { userId, sourceKey: 'opening' } } });
    if (input.type === 'OPENING_BALANCE') {
        if (!opening)
            throw new GoalError(404, 'SOURCE_NOT_FOUND', 'กรุณาตั้งค่าเงินตั้งต้นก่อน');
        const revision = await tx.goalOpeningRevision.findFirst({ where: { userId, sourceId: opening.id }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        return { source: opening, capacity: new D(opening.openingAmount!), snapshot: json({ version: 1, sourceType: opening.kind, sourceKey: opening.sourceKey, revisionId: revision?.id ?? null, sourceAmount: opening.openingAmount!.toFixed(2), sourceDate: dateKey(opening.cutoffDate!), description: opening.note, note: opening.note }) };
    }
    const income = await tx.transaction.findFirst({ where: { id: input.transactionId, userId } });
    if (!income)
        throw new GoalError(404, 'SOURCE_NOT_FOUND', 'ไม่พบรายการต้นทาง');
    if (income.type !== 'income' || (opening?.cutoffDate && income.transactionDate <= opening.cutoffDate) || dateKey(income.transactionDate) > bangkokToday())
        throw new GoalError(409, 'SOURCE_INELIGIBLE', 'รายการต้องเป็นรายรับจริงหลังวันตัดยอดเงินตั้งต้น');
    const sourceKey = 'income:' + income.id;
    const source = await tx.goalFundingSource.upsert({ where: { userId_sourceKey: { userId, sourceKey } }, create: { userId, kind: 'INCOME_TRANSACTION', sourceKey, originalTransactionId: income.id, transactionId: income.id }, update: {} });
    return { source, capacity: income.amount, snapshot: json({ version: 1, sourceType: source.kind, sourceKey, transactionId: income.id, transactionType: income.type, sourceAmount: income.amount.toFixed(2), sourceDate: dateKey(income.transactionDate), description: income.description, note: income.note }) };
}
export async function openingMutation(tx: GoalTx, userId: string, opId: string, now: Date, input: {
    amount?: string | undefined;
    cutoffDate?: string | undefined;
    note?: string | undefined;
    reason?: string | undefined;
}, create: boolean) {
    const old = await tx.goalFundingSource.findUnique({ where: { userId_sourceKey: { userId, sourceKey: 'opening' } } });
    if (create && old)
        throw new GoalError(409, 'OPENING_ALREADY_EXISTS', 'ตั้งค่าเงินตั้งต้นแล้ว กรุณาใช้การแก้ไขพร้อมเหตุผล');
    if (!create && !old)
        throw new GoalError(404, 'SOURCE_NOT_FOUND', 'ยังไม่มีเงินตั้งต้น');
    const amount = new D(input.amount ?? old!.openingAmount!), cutoff = new Date((input.cutoffDate ?? dateKey(old!.cutoffDate!)) + 'T00:00:00Z'), note = input.note ?? old!.note!;
    if (dateKey(cutoff) > bangkokToday(now))
        throw new GoalError(400, 'VALIDATION_ERROR', 'วันตัดยอดต้องไม่อยู่ในอนาคต');
    const net = old ? await sourceNet(tx, userId, old.id) : new D(0);
    if (amount.lt(net))
        throw new GoalError(409, 'OPENING_BELOW_ALLOCATED', `เงินตั้งต้นต้องไม่น้อยกว่า ${net.toFixed(2)} บาท`);
    const used = old ? await tx.goalLedgerEntry.count({ where: { userId, sourceId: old.id } }) > 0 : false;
    if (old && used && dateKey(old.cutoffDate!) !== dateKey(cutoff))
        throw new GoalError(409, 'OPENING_CUTOFF_LOCKED', 'วันตัดยอดถูกล็อกหลังมีประวัติจัดสรรแล้ว');
    if (!old || dateKey(old.cutoffDate!) !== dateKey(cutoff)) {
        const affected = await tx.goalFundingSource.findMany({ where: { userId, kind: 'INCOME_TRANSACTION', transaction: { transactionDate: { lte: cutoff } } } });
        for (const source of affected)
            if ((await sourceNet(tx, userId, source.id)).gt(0))
                throw new GoalError(409, 'CUTOFF_CONFLICTS_WITH_ALLOCATIONS', 'มีรายรับก่อนวันตัดยอดที่ยังถูกจัดสรร กรุณาคืนเงินก่อน');
    }
    const sourceId = old?.id ?? randomUUID(), revisionId = randomUUID();
    const body = { id: sourceId, openingAmount: amount.toFixed(2), cutoffDate: dateKey(cutoff), note, netAllocated: net.toFixed(2), availableAmount: amount.minus(net).toFixed(2), cutoffLocked: used, revisionId, operationId: opId };
    return { status: create ? 201 : 200, body, reason: input.reason ?? 'ตั้งค่าเงินตั้งต้น', save: async () => {
            await tx.goalFundingSource.upsert({ where: { userId_sourceKey: { userId, sourceKey: 'opening' } }, create: { id: sourceId, userId, sourceKey: 'opening', kind: 'OPENING_BALANCE', openingAmount: amount, cutoffDate: cutoff, note, createdAt: now, updatedAt: now }, update: { openingAmount: amount, cutoffDate: cutoff, note, updatedAt: now } });
            await tx.goalOpeningRevision.create({ data: { id: revisionId, userId, sourceId, operationId: opId, beforeAmount: old?.openingAmount ?? null, afterAmount: amount, beforeCutoffDate: old?.cutoffDate ?? null, afterCutoffDate: cutoff, beforeNote: old?.note ?? null, afterNote: note, reason: input.reason ?? 'ตั้งค่าเงินตั้งต้น', createdAt: now } });
        } };
}
type EntryInput = Prisma.GoalLedgerEntryUncheckedCreateInput;
export async function financialMutation(tx: GoalTx, userId: string, goalId: string, opId: string, now: Date, kind: 'ALLOCATE' | 'RELEASE' | 'CORRECT_ALLOCATION', input: {
    amount: string;
    source?: SourceInput | undefined;
    replacementSource?: SourceInput | undefined;
    allocationId?: string | undefined;
    reason?: string | undefined;
}) {
    const goal = await getGoal(tx, userId, goalId), saved = await goalSaved(tx, userId, goalId), amount = new D(input.amount);
    const entries: EntryInput[] = [];
    let delta = new D(0), correctsOperationId: string | undefined;
    function release(lot: GoalLedgerEntry, n: Prisma.Decimal) {
        entries.push({ id: randomUUID(), userId, goalId, sourceId: lot.sourceId, operationId: opId, sequence: entries.length + 1, kind: 'RELEASE', amount: n, allocationId: lot.id, sourceSnapshot: lot.sourceSnapshot as Prisma.InputJsonValue, createdAt: now });
        delta = delta.minus(n);
    }
    if (kind !== 'ALLOCATE') {
        const lots = await tx.goalLedgerEntry.findMany({ where: { userId, goalId, kind: 'ALLOCATE', ...(kind === 'CORRECT_ALLOCATION' ? { id: input.allocationId! } : {}) }, include: { releases: true }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
        if (kind === 'CORRECT_ALLOCATION' && !lots.length)
            throw new GoalError(404, 'ALLOCATION_NOT_FOUND', 'ไม่พบการจัดสรร');
        let left = amount;
        for (const lot of lots) {
            const available = lot.releases.reduce((v, r) => v.minus(r.amount), new D(lot.amount));
            const take = D.min(available, left);
            if (take.gt(0))
                release(lot, take);
            left = left.minus(take);
            if (kind === 'CORRECT_ALLOCATION')
                correctsOperationId = lot.operationId;
            if (left.isZero())
                break;
        }
        if (left.gt(0))
            throw new GoalError(409, 'RELEASE_EXCEEDS_SAVED', 'ยอดที่ต้องการคืนมากกว่ายอดที่ยังจัดสรรอยู่');
    }
    const allocateSource = kind === 'ALLOCATE' ? input.source : input.replacementSource;
    if (allocateSource) {
        if (goal.archivedAt)
            throw new GoalError(409, 'GOAL_ARCHIVED', 'กรุณาคืนเป้าหมายจากคลังก่อนจัดสรรเพิ่ม');
        const { source, capacity, snapshot } = await eligibleSource(tx, userId, allocateSource);
        const released = entries.filter(e => e.sourceId === source.id).reduce((n, e) => n.plus(String(e.amount)), new D(0));
        const available = capacity.minus(await sourceNet(tx, userId, source.id)).plus(released);
        if (amount.gt(available))
            throw new GoalError(409, 'SOURCE_INSUFFICIENT', `แหล่งเงินนี้เหลือให้จัดสรร ${available.toFixed(2)} บาท`);
        entries.push({ id: randomUUID(), userId, goalId, sourceId: source.id, operationId: opId, sequence: entries.length + 1, kind: 'ALLOCATE', amount, allocationId: null, sourceSnapshot: snapshot, createdAt: now });
        delta = delta.plus(amount);
    }
    const body = { operationId: opId, kind, entries: entries.map(e => ({ ...e, amount: new D(String(e.amount)).toFixed(2) })), goalSavedAmountAfter: saved.plus(delta).toFixed(2), createdAt: now.toISOString() };
    return { status: 201, body, ...(input.reason ? { reason: input.reason } : {}), ...(correctsOperationId ? { correctsOperationId } : {}), save: async () => { for (const entry of entries)
            await tx.goalLedgerEntry.create({ data: entry }); } };
}
