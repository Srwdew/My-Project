import { Router, type Request, type Response, type NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authMiddleware, type AuthRequest } from '../middleware/auth';
import { D, bangkokToday, dateKey, goalSchema, sourceSchema, moneySchema, openingMoneySchema, dateSchema, reasonSchema } from '../lib/goalCalculations';
import { runOperation, getGoal, goalSaved, goalView, sourceView, openingMutation, financialMutation, GoalError } from '../lib/goals';
import { withGoalLock, sourceNet } from '../lib/goalWriteTransaction';
export const goalsRouter = Router();
goalsRouter.use(['/goals', '/goal-funding'], authMiddleware);
const user = (r: Request) => (r as AuthRequest).user!.userId;
const id = (r: Request) => z.string().uuid().parse(r.params.id);
const key = (r: Request) => r.header('Idempotency-Key') ?? '';
const handle = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => { void fn(req, res).catch(next); };
const read = <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
const paging = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30), cursor: z.string().uuid().optional() });
function page<T extends {
    id: string;
}>(items: T[], query: {
    limit: number;
    cursor?: string | undefined;
}) {
    const position = query.cursor ? items.findIndex(x => x.id === query.cursor) : -1;
    if (query.cursor && position < 0)
        throw new GoalError(400, 'INVALID_CURSOR', 'รายการเปลี่ยนไป กรุณาโหลดใหม่');
    const result = items.slice(position + 1, position + 1 + query.limit);
    return { data: result, nextCursor: position + 1 + query.limit < items.length ? result[result.length - 1]!.id : null };
}
goalsRouter.get('/goals', handle(async (req, res) => {
    const q = paging.extend({ status: z.enum(['active', 'completed', 'overdue', 'not_started']).optional(), archived: z.enum(['exclude', 'only', 'include']).default('exclude') }).strict().parse(req.query);
    const today = bangkokToday();
    res.json(await read(async (tx) => {
        const goals = await tx.goal.findMany({ where: { userId: user(req), ...(q.archived === 'exclude' ? { archivedAt: null } : q.archived === 'only' ? { archivedAt: { not: null } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
        const views = [];
        for (const goal of goals) {
            const view = goalView(goal, await goalSaved(tx, user(req), goal.id), today);
            if (!q.status || view.calculatedStatus === q.status)
                views.push(view);
        }
        // Computed filtering intentionally precedes cursor slicing.
        return { ...page(views, q), asOfDate: today };
    }));
}));
goalsRouter.post('/goals', handle(async (req, res) => {
    const input = goalSchema.parse(req.body), uid = user(req);
    const result = await runOperation(uid, key(req), 'CREATE_GOAL', input, async (tx, operationId, now) => {
        const goal = { id: randomUUID(), userId: uid, name: input.name, targetAmount: new D(input.targetAmount), targetDate: input.targetDate ? new Date(input.targetDate + 'T00:00:00Z') : null, plannedMonthlyAmount: input.plannedMonthlyAmount ? new D(input.plannedMonthlyAmount) : null, categoryKey: input.categoryKey, note: input.note ?? null, archivedAt: null, createdAt: now, updatedAt: now };
        return { status: 201, body: { ...goalView(goal, 0, bangkokToday(now)), operationId }, save: async () => { await tx.goal.create({ data: goal }); } };
    });
    res.status(result.status).json(result.body);
}));
goalsRouter.get('/goals/:id', handle(async (req, res) => res.json(await read(async (tx) => goalView(await getGoal(tx, user(req), id(req)), await goalSaved(tx, user(req), id(req)))))));
goalsRouter.patch('/goals/:id', handle(async (req, res) => {
    const input = goalSchema.partial().refine(x => Object.keys(x).length > 0).parse(req.body), uid = user(req), gid = id(req);
    res.json(await withGoalLock(uid, async (tx) => {
        await getGoal(tx, uid, gid);
        const { targetDate, plannedMonthlyAmount, ...rest } = input;
        const goal = await tx.goal.update({ where: { userId_id: { userId: uid, id: gid } }, data: { ...(rest.name !== undefined ? { name: rest.name } : {}), ...(rest.targetAmount !== undefined ? { targetAmount: rest.targetAmount } : {}), ...(rest.categoryKey !== undefined ? { categoryKey: rest.categoryKey } : {}), ...(rest.note !== undefined ? { note: rest.note } : {}), ...(targetDate !== undefined ? { targetDate: targetDate ? new Date(targetDate + 'T00:00:00Z') : null } : {}), ...(plannedMonthlyAmount !== undefined ? { plannedMonthlyAmount } : {}) } });
        return goalView(goal, await goalSaved(tx, uid, gid));
    }));
}));
for (const action of ['archive', 'restore'] as const)
    goalsRouter.post('/goals/:id/' + action, handle(async (req, res) => {
        const uid = user(req), gid = id(req);
        z.object({}).strict().parse(req.body ?? {});
        res.json(await withGoalLock(uid, async (tx) => { const old = await getGoal(tx, uid, gid); const goal = await tx.goal.update({ where: { userId_id: { userId: uid, id: gid } }, data: { archivedAt: action === 'archive' ? (old.archivedAt ?? new Date()) : null } }); return goalView(goal, await goalSaved(tx, uid, gid)); }));
    }));
goalsRouter.get('/goals/:id/ledger', handle(async (req, res) => {
    const uid = user(req), gid = id(req), q = paging.strict().parse(req.query);
    res.json(await read(async (tx) => { await getGoal(tx, uid, gid); const rows = await tx.goalLedgerEntry.findMany({ where: { userId: uid, goalId: gid }, include: { operation: { select: { reason: true, kind: true } } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }); return page(rows.map(r => ({ ...r, amount: r.amount.toFixed(2) })), q); }));
}));
const openingSchema = z.object({ amount: openingMoneySchema, cutoffDate: dateSchema, note: reasonSchema }).strict();
goalsRouter.get('/goal-funding/opening-balance', handle(async (req, res) => res.json(await read(async (tx) => { const source = await tx.goalFundingSource.findUnique({ where: { userId_sourceKey: { userId: user(req), sourceKey: 'opening' } } }); return { data: source ? await sourceView(tx, user(req), source) : null }; }))));
for (const create of [true, false])
    goalsRouter.post('/goal-funding/opening-balance' + (create ? '' : '/corrections'), handle(async (req, res) => {
        const input = create ? openingSchema.parse(req.body) : openingSchema.partial().extend({ reason: reasonSchema }).refine(x => x.amount !== undefined || x.cutoffDate !== undefined || x.note !== undefined).parse(req.body);
        const uid = user(req), result = await runOperation(uid, key(req), create ? 'CREATE_OPENING_BALANCE' : 'CORRECT_OPENING_BALANCE', input, (tx, op, now) => openingMutation(tx, uid, op, now, input, create));
        res.status(result.status).json(result.body);
    }));
goalsRouter.get('/goal-funding/opening-balance/revisions', handle(async (req, res) => {
    const q = paging.strict().parse(req.query);
    const rows = await prisma.goalOpeningRevision.findMany({ where: { userId: user(req) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    res.json(page(rows.map(r => ({ ...r, beforeAmount: r.beforeAmount?.toFixed(2) ?? null, afterAmount: r.afterAmount.toFixed(2), beforeCutoffDate: r.beforeCutoffDate ? dateKey(r.beforeCutoffDate) : null, afterCutoffDate: dateKey(r.afterCutoffDate) })), q));
}));
goalsRouter.get('/goal-funding/incomes', handle(async (req, res) => {
    const q = paging.strict().parse(req.query), uid = user(req);
    res.json(await read(async (tx) => {
        const opening = await tx.goalFundingSource.findUnique({ where: { userId_sourceKey: { userId: uid, sourceKey: 'opening' } } });
        const rows = await tx.transaction.findMany({ where: { userId: uid, type: 'income' }, include: { goalFundingSource: true }, orderBy: [{ transactionDate: 'desc' }, { id: 'desc' }] });
        const data = [];
        for (const row of rows) {
            const net = row.goalFundingSource ? await sourceNet(tx, uid, row.goalFundingSource.id) : new D(0);
            const eligible = (!opening?.cutoffDate || row.transactionDate > opening.cutoffDate) && dateKey(row.transactionDate) <= bangkokToday();
            data.push({ id: row.id, transactionId: row.id, transactionDate: dateKey(row.transactionDate), description: row.description, capacity: row.amount.toFixed(2), netAllocated: net.toFixed(2), availableAmount: eligible ? row.amount.minus(net).toFixed(2) : '0.00', eligible, ineligibleReason: eligible ? null : 'วันที่ไม่อยู่ในช่วงที่ใช้จัดสรรได้' });
        }
        return page(data, q);
    }));
}));
const financialSchemas = {
    allocations: z.object({ amount: moneySchema, source: sourceSchema, reason: reasonSchema.optional() }).strict(),
    releases: z.object({ amount: moneySchema, reason: reasonSchema }).strict(),
    'allocation-corrections': z.object({ amount: moneySchema, allocationId: z.string().uuid(), replacementSource: sourceSchema.optional(), reason: reasonSchema }).strict(),
};
for (const action of ['allocations', 'releases', 'allocation-corrections'] as const)
    goalsRouter.post('/goals/:id/' + action, handle(async (req, res) => {
        const input = financialSchemas[action].parse(req.body), uid = user(req), gid = id(req), kind = action === 'allocations' ? 'ALLOCATE' : action === 'releases' ? 'RELEASE' : 'CORRECT_ALLOCATION';
        const result = await runOperation(uid, key(req), kind, { goalId: gid, ...input }, (tx, op, now) => financialMutation(tx, uid, gid, op, now, kind, input));
        res.status(result.status).json(result.body);
    }));
goalsRouter.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof z.ZodError)
        return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'กรุณาตรวจสอบข้อมูล', details: err.issues } });
    if (err instanceof GoalError)
        return res.status(err.status).json({ error: { code: err.code, message: err.message } });
    console.error('Goals request failed', err instanceof Prisma.PrismaClientKnownRequestError ? err.code : err instanceof Error ? err.name : 'Unknown');
    return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่ด้วยคำขอเดิม' } });
});
