import { Prisma } from '@prisma/client';
// Canonical net of ledger entries, including releases/reallocations written by corrections.
export function netGoalAllocation(rows: { kind: string; _sum: { amount: Prisma.Decimal | null } }[]) {
  return rows.reduce((sum, row) => row.kind === 'ALLOCATE' ? sum.plus(row._sum.amount ?? 0) : sum.minus(row._sum.amount ?? 0), new Prisma.Decimal(0));
}