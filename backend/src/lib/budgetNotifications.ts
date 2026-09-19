import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export type Period = { year: number; month: number };
export function currentBudgetPeriod(now = new Date()): Period {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: 'numeric',
  }).formatToParts(now);
  return {
    year: Number(parts.find(p => p.type === 'year')!.value),
    month: Number(parts.find(p => p.type === 'month')!.value),
  };
}
export function transactionPeriod(date: Date): Period {
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
export function noticeType(spent: Prisma.Decimal, budget: Prisma.Decimal,
  warningPercent: number, notifyExceeded: boolean, exceededBefore: boolean, notifyNearLimit = true) {
  if (budget.lte(0)) return null;
  if (spent.gt(budget) && notifyExceeded) return 'budget_exceeded' as const;
  if (notifyNearLimit && !exceededBefore && spent.mul(100).gte(budget.mul(warningPercent))) {
    return 'budget_near_limit' as const;
  }
  return null;
}
export function eventKey(period: Period, scope: string, type: string) {
  return `budget:${period.year}-${String(period.month).padStart(2, '0')}:${scope}:${type}`;
}

// All producers lock the same user before reading settings, totals and history.
// PostgreSQL READ COMMITTED sees the preceding producer's committed events after waiting.
export async function checkBudgetMonth(tx: Prisma.TransactionClient, userId: string, period: Period) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
  const setting = await tx.budgetNotificationSetting.findUnique({ where: { userId } });
  if (!setting?.enabled) return;
  const current = currentBudgetPeriod();
  if (period.year * 12 + period.month > current.year * 12 + current.month) return;
  const start = new Date(`${period.year}-${String(period.month).padStart(2, '0')}-01T00:00:00.000Z`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  const where = { userId, ...period };
  const total = setting.totalBudget ? await tx.budget.findUnique({ where: { userId_year_month: where } }) : null;
  const categories = setting.categoryBudgets ? await tx.categoryBudget.findMany({
    where, include: { category: { select: { name: true } } },
  }) : [];
  const expenses = await tx.transaction.groupBy({
    by: ['categoryId'], where: { userId, type: 'expense', transactionDate: { gte: start, lt: end } },
    _sum: { amount: true },
  });
  const sum = expenses.reduce((value, row) => value.plus(row._sum.amount ?? 0), new Prisma.Decimal(0));
  const scopes = [
    ...(total ? [{ id: total.id, scope: 'total', name: 'งบรวม', amount: total.amount, spent: sum }] : []),
    ...categories.map(b => ({ id: b.id, scope: `category:${b.categoryId}`,
      name: `งบหมวด ${b.category.name}`.slice(0, 180), amount: b.amount,
      spent: expenses.find(e => e.categoryId === b.categoryId)?._sum.amount ?? new Prisma.Decimal(0) })),
  ];
  for (const scope of scopes) {
    const exceededKey = eventKey(period, scope.scope, 'budget_exceeded');
    const exceeded = await tx.notification.findUnique({
      where: { userId_eventKey: { userId, eventKey: exceededKey } }, select: { id: true },
    });
    const type = noticeType(scope.spent, scope.amount, setting.warningPercent, setting.notifyExceeded, Boolean(exceeded), setting.notifyNearLimit ?? true);
    if (!type) continue;
    const over = scope.spent.gt(scope.amount);
    // Immutable snapshot. A warning can truthfully describe spending above budget when exceeded is disabled.
    const message = `${scope.name} เดือน ${String(period.month).padStart(2, '0')}/${period.year} ใช้ไป ${scope.spent.toFixed(2)} บาท จากงบ ${scope.amount.toFixed(2)} บาท (${scope.spent.div(scope.amount).mul(100).toFixed(2)}%)${over ? ` เกินงบ ${scope.spent.minus(scope.amount).toFixed(2)} บาท` : ''} ถึงเกณฑ์แจ้งเตือน ${setting.warningPercent}%`;
    await tx.notification.createMany({ skipDuplicates: true, data: [{
      userId, type, eventKey: eventKey(period, scope.scope, type),
      title: type === 'budget_exceeded' ? 'ใช้จ่ายเกินงบประมาณ' : 'ยอดใช้จ่ายถึงเกณฑ์แจ้งเตือน',
      message, sourceId: scope.id,
      link: `/budget?month=${period.year}-${String(period.month).padStart(2, '0')}`,
    }] });
  }
}

export async function checkBudgetNotifications(userId: string, periods: Period[]) {
  const unique = new Map(periods.map(p => [`${p.year}-${p.month}`, p]));
  let succeeded = true;
  for (const period of unique.values()) {
    try {
      await prisma.$transaction(tx => checkBudgetMonth(tx, userId, period), {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 3000, timeout: 10000,
      });
    } catch {
      // Never turn a committed CRUD operation into a failed HTTP response; no DB credentials in logs.
      console.error('Budget notification check failed; reconcile required', { userId, ...period });
      succeeded = false;
    }
  }
  return succeeded;
}

// Re-scan retained budget months, including historical months, after a restart or failed check.
// This reconstructs current totals, not transient totals that changed during an outage.
export async function reconcileBudgetNotifications(userId: string) {
  const [totals, categories] = await Promise.all([
    prisma.budget.findMany({ where: { userId }, select: { year: true, month: true } }),
    prisma.categoryBudget.findMany({ where: { userId }, select: { year: true, month: true }, distinct: ['year', 'month'] }),
  ]);
  return checkBudgetNotifications(userId, [...totals, ...categories, currentBudgetPeriod()]);
}
