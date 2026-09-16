import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { checkBudgetMonth, checkBudgetNotifications, currentBudgetPeriod, eventKey, noticeType, transactionPeriod } from '../src/lib/budgetNotifications';
import { prisma } from '../src/lib/prisma';
const D = (n: string | number) => new Prisma.Decimal(n);
const period = { year: 2020, month: 9 };

for (const [spent, percent, exceeded, prior, expected] of [
  ['79.99', 80, true, false, null],
  ['80.00', 80, true, false, 'budget_near_limit'],
  ['100.00', 80, true, false, 'budget_near_limit'],
  ['100.01', 80, true, false, 'budget_exceeded'],
  ['100.01', 80, false, false, 'budget_near_limit'],
  ['99.99', 100, true, false, null],
  ['100.00', 100, true, false, 'budget_near_limit'],
  ['80.00', 80, true, true, null],
  ['110.00', 80, false, true, null],
] as const) {
  test(`boundary ${spent}, threshold ${percent}, exceeded ${exceeded}, prior ${prior}`, () => {
    assert.equal(noticeType(D(spent), D(100), percent, exceeded, prior), expected);
  });
}
test('decimal precision, zero budget and Bangkok month boundary', () => {
  assert.equal(noticeType(D('0.07').plus('0.01'), D('0.10'), 80, true, false), 'budget_near_limit');
  assert.equal(noticeType(D(100), D(0), 80, true, false), null);
  assert.deepEqual(currentBudgetPeriod(new Date('2026-09-30T16:59:59Z')), { year: 2026, month: 9 });
  assert.deepEqual(currentBudgetPeriod(new Date('2026-09-30T17:00:00Z')), { year: 2026, month: 10 });
  assert.deepEqual(transactionPeriod(new Date('2026-09-30T00:00:00Z')), { year: 2026, month: 9 });
});

function fixture() {
  const settings = { enabled: true, warningPercent: 80, notifyExceeded: true, totalBudget: true, categoryBudgets: true };
  const budgets = [{ id: 'total-a', userId: 'a', ...period, amount: D(100) }, { id: 'total-b', userId: 'b', ...period, amount: D(100) }];
  const categories = [{ id: 'cat-budget', userId: 'a', ...period, categoryId: 'food', amount: D(50), category: { name: 'อาหาร' } }];
  const transactions = [
    { userId: 'a', categoryId: 'food', type: 'expense', date: new Date('2020-09-01Z'), amount: D(80) },
    { userId: 'b', categoryId: 'food', type: 'expense', date: new Date('2020-09-01Z'), amount: D(900) },
    { userId: 'a', categoryId: 'food', type: 'income', date: new Date('2020-09-01Z'), amount: D(9000) },
    { userId: 'a', categoryId: 'food', type: 'expense', date: new Date('2020-10-01Z'), amount: D(9000) },
  ];
  const notifications: any[] = [];
  let lockCount = 0;
  const tx = {
    $executeRaw: async () => { lockCount++; },
    budgetNotificationSetting: { findUnique: async () => settings },
    budget: { findUnique: async ({ where }: any) => budgets.find(b => Object.entries(where.userId_year_month).every(([k, v]) => (b as any)[k] === v)) ?? null },
    categoryBudget: { findMany: async ({ where }: any) => categories.filter(b => Object.entries(where).every(([k, v]) => (b as any)[k] === v)) },
    transaction: { groupBy: async ({ where }: any) => {
      const sums = new Map<string, Prisma.Decimal>();
      for (const t of transactions) if (t.userId === where.userId && t.type === where.type && t.date >= where.transactionDate.gte && t.date < where.transactionDate.lt) {
        sums.set(t.categoryId, (sums.get(t.categoryId) ?? D(0)).plus(t.amount));
      }
      return [...sums].map(([categoryId, amount]) => ({ categoryId, _sum: { amount } }));
    } },
    notification: {
      findUnique: async ({ where }: any) => notifications.find(n => n.userId === where.userId_eventKey.userId && n.eventKey === where.userId_eventKey.eventKey) ?? null,
      createMany: async ({ data, skipDuplicates }: any) => {
        assert.equal(skipDuplicates, true);
        for (const row of data) if (!notifications.some(n => n.userId === row.userId && n.eventKey === row.eventKey)) notifications.push({ id: String(notifications.length), ...row });
      },
    },
  } as unknown as Prisma.TransactionClient;
  return { tx, settings, budgets, transactions, notifications, locks: () => lockCount };
}
test('producer filters account/type/month, separates scopes and preserves snapshots on edits', async () => {
  const f = fixture();
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 2);
  const total = f.notifications.find(n => n.sourceId === 'total-a');
  assert.equal(total.type, 'budget_near_limit');
  assert.match(total.message, /80.00 บาท/);
  assert.equal(total.link, '/budget?month=2020-09');
  const category = f.notifications.find(n => n.sourceId === 'cat-budget');
  assert.equal(category.type, 'budget_exceeded');
  const snapshot = category.message;
  f.transactions[0]!.amount = D(110);
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 3);
  f.transactions[0]!.amount = D(90);
  f.settings.warningPercent = 10;
  f.budgets[0]!.amount = D(1000);
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 3);
  assert.equal(category.message, snapshot);
  await checkBudgetMonth(f.tx, 'b', period);
  assert.equal(f.notifications.filter(n => n.userId === 'b').length, 1);
  assert.equal(f.notifications.find(n => n.userId === 'b').type, 'budget_exceeded');
  assert.equal(f.locks(), 4);
});
test('immediate exceeded suppresses near forever; disabling exceeded permits truthful warning', async () => {
  const f = fixture();
  f.transactions[0]!.amount = D(110);
  await checkBudgetMonth(f.tx, 'a', period);
  assert.ok(f.notifications.every(n => n.type === 'budget_exceeded'));
  f.transactions[0]!.amount = D(90);
  f.settings.notifyExceeded = false;
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 2);
  const g = fixture();
  g.transactions[0]!.amount = D(110);
  g.settings.notifyExceeded = false;
  await checkBudgetMonth(g.tx, 'a', period);
  assert.ok(g.notifications.every(n => n.type === 'budget_near_limit'));
  assert.match(g.notifications[0].message, /เกินงบ 10.00 บาท/);
});
test('disabled and scope toggles, future month, stable event key', async () => {
  const f = fixture();
  f.settings.enabled = false;
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 0);
  f.settings.enabled = true;
  f.settings.totalBudget = false;
  await checkBudgetMonth(f.tx, 'a', period);
  assert.equal(f.notifications.length, 1);
  assert.equal(f.notifications[0].sourceId, 'cat-budget');
  await checkBudgetMonth(f.tx, 'a', { year: 9999, month: 12 });
  assert.equal(f.notifications.length, 1);
  assert.equal(eventKey(period, 'total', 'budget_exceeded'), 'budget:2020-09:total:budget_exceeded');
});
test('failed notification transaction is contained, remaining months checked and periods deduplicated', async () => {
  const original = prisma.$transaction;
  const originalError = console.error;
  let calls = 0;
  try {
    (prisma as any).$transaction = async () => { calls++; if (calls === 1) throw new Error('simulated failure'); };
    console.error = () => {};
    assert.equal(await checkBudgetNotifications('a', [period, period, { year: 2020, month: 10 }]), false);
    assert.equal(calls, 2);
  } finally { prisma.$transaction = original; console.error = originalError; }
});

test('concurrent producers share a user lock and stable unique key (transaction double)', async () => {
  const f = fixture();
  f.settings.categoryBudgets = false;
  f.transactions[0]!.amount = D(110);
  const original = prisma.$transaction;
  let tail: Promise<void> = Promise.resolve();
  let acquired = 0;
  let held = 0;
  try {
    (prisma as any).$transaction = async (callback: any) => {
      let release: (() => void) | undefined;
      const tx = { ...f.tx, $executeRaw: async (_query: TemplateStringsArray, userId: string) => {
        assert.equal(userId, 'a');
        const previous = tail;
        tail = new Promise<void>(resolve => { release = resolve; });
        await previous;
        acquired++;
        held++;
        assert.equal(held, 1);
      } };
      try { return await callback(tx); }
      finally { held--; release?.(); }
    };
    const results = await Promise.all(Array.from({ length: 25 }, () => checkBudgetNotifications('a', [period])));
    assert.ok(results.every(Boolean));
    assert.equal(acquired, 25);
    assert.equal(f.notifications.length, 1);
    assert.equal(f.notifications[0].type, 'budget_exceeded');
    f.transactions[0]!.amount = D(90);
    await Promise.all(Array.from({ length: 10 }, () => checkBudgetNotifications('a', [period])));
    assert.equal(f.notifications.length, 1);
  } finally { prisma.$transaction = original; }
});
