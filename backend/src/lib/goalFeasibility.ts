import { Prisma } from '@prisma/client';
import { calculateGoal } from './goalCalculations';

export function lastCompletedMonth(today: string) {
  const end = new Date(today.slice(0, 7) + '-01T00:00:00Z');
  end.setUTCDate(0);
  const endDate = end.toISOString().slice(0, 10);
  return { month: endDate.slice(0, 7), startDate: endDate.slice(0, 7) + '-01', endDate };
}
export async function goalCashFlow(tx: Prisma.TransactionClient, userId: string, today: string) {
  const period = lastCompletedMonth(today);
  const rows = await tx.transaction.groupBy({
    by: ['type'], where: { userId, transactionDate: { gte: new Date(period.startDate + 'T00:00:00Z'), lte: new Date(period.endDate + 'T00:00:00Z') } },
    _sum: { amount: true }, _count: { _all: true },
  });
  const income = rows.find(r => r.type === 'income'), expense = rows.find(r => r.type === 'expense');
  const incomeAmount = income?._sum.amount ?? new Prisma.Decimal(0);
  const expenseAmount = expense?._sum.amount ?? new Prisma.Decimal(0);
  return { period, incomeAmount: incomeAmount.toFixed(2), expenseAmount: expenseAmount.toFixed(2), netCashFlow: incomeAmount.minus(expenseAmount).toFixed(2),
    transactionCount: rows.reduce((n, r) => n + r._count._all, 0) };
}
export function goalFeasibility(goal: Pick<ReturnType<typeof calculateGoal>, 'requiredMonthlyAmount' | 'calculatedStatus'> & { archivedAt: unknown; targetDate: unknown }, cashFlow: Awaited<ReturnType<typeof goalCashFlow>>) {
  const required = goal.requiredMonthlyAmount;
  let status: string;
  if (goal.archivedAt) status = 'archived';
  else if (goal.calculatedStatus === 'completed') status = 'completed';
  else if (!goal.targetDate) status = 'no_target_date';
  else if (goal.calculatedStatus === 'overdue') status = 'overdue';
  else if (cashFlow.transactionCount === 0) status = 'no_transactions';
  else if (new Prisma.Decimal(cashFlow.incomeAmount).isZero()) status = 'no_income';
  else if (new Prisma.Decimal(cashFlow.netCashFlow).lte(0)) status = 'non_positive_cash_flow';
  else if (required === null) status = 'unavailable';
  else status = new Prisma.Decimal(required).gt(cashFlow.netCashFlow) ? 'exceeds_observed_cash_flow' : 'within_observed_cash_flow';
  return { policy: 'last-completed-calendar-month-v1', status, requiredMonthlyAmount: required, cashFlow };
}
