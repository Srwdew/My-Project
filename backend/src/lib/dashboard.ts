import { Prisma } from '@prisma/client';
import { calculateGoal } from './goalCalculations';
import { netGoalAllocation } from './goalAllocation';
export class DashboardInputError extends Error {}
export function dashboardPeriod(input: unknown, asOfDate: string) {
  const month = input === undefined ? asOfDate.slice(0, 7) : input;
  if (typeof month !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) || month > asOfDate.slice(0, 7)) throw new DashboardInputError('กรุณาเลือกเดือนที่ถูกต้องและไม่เป็นเดือนอนาคต');
  const startDate = month + '-01';
  const next = new Date(startDate + 'T00:00:00Z'); next.setUTCMonth(next.getUTCMonth() + 1);
  const calendarEndDate = new Date(next.getTime() - 86400000).toISOString().slice(0, 10);
  const effectiveEndDate = calendarEndDate < asOfDate ? calendarEndDate : asOfDate;
  return { month, startDate, calendarEndDate, effectiveEndDate, isCurrentMonth: month === asOfDate.slice(0, 7) };
}
export async function dashboardView(tx: Prisma.TransactionClient, userId: string, input: unknown, asOfDate: string) {
  const period = dashboardPeriod(input, asOfDate);
  const where = { userId, transactionDate: { gte: new Date(period.startDate + 'T00:00:00Z'), lte: new Date(period.effectiveEndDate + 'T00:00:00Z') } };
  const types = await tx.transaction.groupBy({ by: ['type'], where, _sum: { amount: true }, _count: { _all: true } });
  const categorySums = await tx.transaction.groupBy({ by: ['categoryId'], where: { ...where, type: 'expense' }, _sum: { amount: true }, _count: { _all: true } });
  const dailySums = await tx.transaction.groupBy({ by: ['transactionDate', 'type'], where, _sum: { amount: true }, _count: { _all: true }, orderBy: { transactionDate: 'asc' } });
  const recent = await tx.transaction.findMany({ where, take: 5, orderBy: [{ transactionDate: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }], select: { id: true, transactionDate: true, transactionTime: true, type: true, amount: true, description: true, categoryId: true, category: { select: { name: true } } } });
  const budget = await tx.budget.findUnique({ where: { userId_year_month: { userId, year: Number(period.month.slice(0, 4)), month: Number(period.month.slice(5)) } }, select: { amount: true } });
  const categories = await tx.category.findMany({ where: { id: { in: categorySums.map(r => r.categoryId) } }, select: { id: true, name: true } });
  const names = new Map(categories.map(c => [c.id, c.name]));
  const income = types.find(r => r.type === 'income'), expense = types.find(r => r.type === 'expense');
  const incomeAmount = income?._sum.amount ?? new Prisma.Decimal(0), expenseAmount = expense?._sum.amount ?? new Prisma.Decimal(0);
  const count = (income?._count._all ?? 0) + (expense?._count._all ?? 0);
  const dailyMap = new Map<string, { date: string; transactionCount: number; incomeAmount: string; expenseAmount: string }>();
  for (const row of dailySums) { const date = row.transactionDate.toISOString().slice(0, 10); const d = dailyMap.get(date) ?? { date, transactionCount: 0, incomeAmount: '0.00', expenseAmount: '0.00' }; d.transactionCount += row._count._all; d[row.type === 'income' ? 'incomeAmount' : 'expenseAmount'] = (row._sum.amount ?? new Prisma.Decimal(0)).toFixed(2); dailyMap.set(date, d); }
  const goalRows = await tx.goal.findMany({ where: { userId }, select: { id: true, name: true, archivedAt: true, targetAmount: true, targetDate: true, plannedMonthlyAmount: true } });
  const ledgerSums = await tx.goalLedgerEntry.groupBy({ by: ['goalId', 'kind'], where: { userId }, _sum: { amount: true } });
  const grouped = new Map<string, typeof ledgerSums>();
  for (const row of ledgerSums) { const group = grouped.get(row.goalId) ?? []; group.push(row); grouped.set(row.goalId, group); }
  const goalViews = goalRows.map(g => ({ ...g, ...calculateGoal(g, netGoalAllocation(grouped.get(g.id) ?? []), asOfDate) }));
  const profile = await tx.profile.findUnique({ where: { userId }, select: { primaryGoalId: true } });
  const primary = goalViews.find(g => g.id === profile?.primaryGoalId);
  const remaining = budget ? budget.amount.minus(expenseAmount) : null;
  return {
    month: period.month, timezone: 'Asia/Bangkok', asOfDate, period,
    summary: { transactionCount: count, incomeTransactionCount: income?._count._all ?? 0, expenseTransactionCount: expense?._count._all ?? 0, incomeAmount: incomeAmount.toFixed(2), expenseAmount: expenseAmount.toFixed(2), netCashFlow: incomeAmount.minus(expenseAmount).toFixed(2), budgetAmount: budget?.amount.toFixed(2) ?? null, budgetRemaining: remaining?.toFixed(2) ?? null, budgetExceeded: remaining?.lt(0) ?? false, hasTransactions: count > 0 },
    expenseCategories: categorySums.sort((a,b) => (b._sum.amount ?? new Prisma.Decimal(0)).cmp(a._sum.amount ?? 0) || a.categoryId.localeCompare(b.categoryId)).map(r => ({ categoryId: r.categoryId, categoryName: names.get(r.categoryId) ?? 'ไม่ระบุหมวด', transactionCount: r._count._all, amount: (r._sum.amount ?? new Prisma.Decimal(0)).toFixed(2), percentage: expenseAmount.gt(0) ? (r._sum.amount ?? new Prisma.Decimal(0)).div(expenseAmount).mul(100).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2) : '0.00' })),
    daily: [...dailyMap.values()],
    recentTransactions: { limit: 5, hasMore: count > 5, items: recent.map(r => ({ id: r.id, date: r.transactionDate.toISOString().slice(0,10), time: r.transactionTime?.toISOString().slice(11,19) ?? null, type: r.type, amount: r.amount.toFixed(2), categoryId: r.categoryId, categoryName: r.category.name, description: r.description })) },
    goals: { scope: 'current', asOfDate, activeCount: goalViews.filter(g => !g.archivedAt && g.calculatedStatus === 'active').length, notStartedCount: goalViews.filter(g => !g.archivedAt && g.calculatedStatus === 'not_started').length, overdueCount: goalViews.filter(g => !g.archivedAt && g.calculatedStatus === 'overdue').length, allocatedAmount: netGoalAllocation(ledgerSums).toFixed(2), allocationScope: 'all_goals_including_archived', primaryGoal: primary ? { id: primary.id, name: primary.name, archivedAt: primary.archivedAt?.toISOString() ?? null, calculatedStatus: primary.calculatedStatus, targetAmount: primary.targetAmount.toFixed(2), savedAmount: primary.savedAmount, remainingAmount: primary.remainingAmount, progressPercent: primary.progressPercent, progressBarPercent: primary.progressBarPercent } : null },
  };
}