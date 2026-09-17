import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
export class GoalError extends Error {
    constructor(public status: number, public code: string, message: string) { super(message); }
}
export type GoalTx = Prisma.TransactionClient;
export async function withGoalLock<T>(userId: string, work: (tx: GoalTx) => Promise<T>): Promise<T> {
    for (let attempt = 0;; attempt++) {
        try {
            return await prisma.$transaction(async (tx) => {
                const rows = await tx.$queryRaw<{
                    id: string;
                }[]> `SELECT id FROM "User" WHERE id=${userId} AND "deletedAt" IS NULL FOR UPDATE`;
                if (!rows.length)
                    throw new GoalError(401, 'UNAUTHENTICATED', 'บัญชีไม่พร้อมใช้งาน');
                return work(tx);
            }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 10000, timeout: 20000 });
        }
        catch (e) {
            if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2034') {
                if (attempt < 2)
                    continue;
                throw new GoalError(503, 'RETRYABLE_TRANSACTION_FAILURE', 'กรุณาลองใหม่ด้วยคำขอเดิม');
            }
            throw e;
        }
    }
}
export async function sourceNet(tx: GoalTx, userId: string, sourceId: string) {
    const rows = await tx.goalLedgerEntry.groupBy({ by: ['kind'], where: { userId, sourceId }, _sum: { amount: true } });
    return rows.reduce((sum, row) => row.kind === 'ALLOCATE' ? sum.plus(row._sum.amount ?? 0) : sum.minus(row._sum.amount ?? 0), new Prisma.Decimal(0));
}
export async function guardFundingTransaction(tx: GoalTx, userId: string, id: string, next?: {
    type: string;
    amount: Prisma.Decimal.Value;
    transactionDate: Date;
}) {
    const source = await tx.goalFundingSource.findFirst({ where: { userId, transactionId: id } });
    if (!source)
        return;
    const net = await sourceNet(tx, userId, source.id);
    if (net.isZero())
        return;
    if (!next || next.type !== 'income')
        throw new GoalError(409, 'TRANSACTION_HAS_ALLOCATIONS', 'กรุณาคืนเงินที่จัดสรรจากรายการนี้ก่อนลบหรือเปลี่ยนเป็นรายจ่าย');
    if (new Prisma.Decimal(next.amount).lt(net))
        throw new GoalError(409, 'TRANSACTION_BELOW_ALLOCATED', `รายการนี้ถูกจัดสรรอยู่ ${net.toFixed(2)} บาท`);
    const opening = await tx.goalFundingSource.findUnique({ where: { userId_sourceKey: { userId, sourceKey: 'opening' } } });
    if (opening?.cutoffDate && next.transactionDate <= opening.cutoffDate)
        throw new GoalError(409, 'SOURCE_INELIGIBLE', 'วันที่ต้องอยู่หลังวันตัดยอดเงินตั้งต้น');
}
