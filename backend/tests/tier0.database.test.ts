import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { loadTier0 } from '../src/lib/tier0';
import { buildForecast, forecastInput } from '../src/lib/expenseForecast';
import { dashboardView } from '../src/lib/dashboard';
import { D } from '../src/lib/goalCalculations';

const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db) throw Error('ISOLATED_TIER0_DATABASE_REQUIRED');

const today = '2026-11-15';
const at = (date: string) => new Date(date + 'T00:00:00Z');

test('Tier 0 on real PostgreSQL: own spending in the cycle only, agrees with the forecast budget figure', async t => {
  t.after(() => prisma.$disconnect());
  const user = () => prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'synthetic-no-login' } });
  const [a, b] = [await user(), await user()];
  const expense = await prisma.category.create({ data: { name: randomUUID(), type: 'expense' } });
  const income = await prisma.category.create({ data: { name: randomUUID(), type: 'income' } });
  const row = (userId: string, categoryId: string, type: 'expense' | 'income', amount: string, date: string) => ({ userId, categoryId, type, amount, transactionDate: at(date) });
  await prisma.transaction.createMany({
    data: [
      row(a.id, expense.id, 'expense', '100.25', '2026-11-01'),
      row(a.id, expense.id, 'expense', '50.00', today),
      row(a.id, expense.id, 'expense', '9000.00', '2026-10-31'), // previous cycle
      row(a.id, expense.id, 'expense', '7000.00', '2026-11-16'), // tomorrow
      row(a.id, income.id, 'income', '8000.00', '2026-11-02'), // not spending
      row(b.id, expense.id, 'expense', '5000.00', today), // another account
    ],
  });
  await prisma.budget.create({ data: { userId: a.id, year: 2026, month: 11, amount: '3000.00' } });
  await prisma.profile.create({ data: { userId: a.id, income: '4000.00' } });

  await t.test('spending and budget figures', async () => {
    const { pace, cycle } = await prisma.$transaction(tx => loadTier0(tx, a.id, today));
    assert.equal(cycle.key, '2026-11');
    assert.equal(pace.spent, '150.25');
    assert.equal(pace.budgetLeft, '2849.75');
    assert.equal(pace.daysLeft, 16);
    assert.equal(pace.perDay, '178');
    assert.equal(pace.expectedSpent, '1500.00');
    assert.equal(pace.paceGap, '-1349.75');
  });
  await t.test('same remaining budget as the Forecast page shows', async () => {
    const { pace } = await prisma.$transaction(tx => loadTier0(tx, a.id, today));
    const forecast = buildForecast(await prisma.$transaction(tx => forecastInput(tx, a.id, today)));
    assert.equal(forecast.budgetComparison!.remainingAmount, pace.budgetLeft);
  });
  await t.test('same remaining budget as the Overview summary card, including over budget', async () => {
    const compare = async (userId: string) => {
      const { pace } = await prisma.$transaction(tx => loadTier0(tx, userId, today));
      const view = await prisma.$transaction(tx => dashboardView(tx, userId, '2026-11', today));
      return { pace, remaining: new D(view.summary.budgetRemaining!) };
    };
    const within = await compare(a.id);
    assert.equal(within.remaining.toFixed(2), within.pace.budgetLeft); // tomorrow's 7,000 is out of both
    await prisma.budget.create({ data: { userId: b.id, year: 2026, month: 11, amount: '4000.00' } });
    const over = await compare(b.id);
    assert.equal(over.pace.budgetLeft, '0.00');
    assert.equal(over.remaining.neg().toFixed(2), over.pace.overBudget);
    await prisma.budget.delete({ where: { userId_year_month: { userId: b.id, year: 2026, month: 11 } } });
  });
  await t.test('no budget and no goals: nothing invented', async () => {
    const { pace, savingsPlan } = await prisma.$transaction(tx => loadTier0(tx, b.id, today));
    assert.equal(pace.spent, '5000.00');
    assert.equal(pace.perDay, null);
    assert.equal(savingsPlan.status, 'unavailable');
  });
  await t.test('goal shortfall reuses the existing savings plan (D-13)', async () => {
    await prisma.goal.create({ data: { userId: a.id, name: 'g', targetAmount: '60000.00', targetDate: at('2027-05-31'), categoryKey: 'other' } });
    const one = await prisma.$transaction(tx => loadTier0(tx, a.id, today));
    assert.equal(one.savingsPlan.availableMonthlyAmount, '1000.00');
    assert.equal(one.savingsPlan.status, 'shortfall');
    assert.ok(one.savingsPlan.alternatives);
    assert.equal(one.goalOptions?.extendToMonths, 60);
    assert.equal(one.goalOptionsUnavailable, null);
  });
  await t.test('several goals: no per-goal options, and it says why, reduce budget and raise income stay', async () => {
    await prisma.goal.create({ data: { userId: a.id, name: 'h', targetAmount: '30000.00', targetDate: at('2027-05-31'), categoryKey: 'other' } });
    const many = await prisma.$transaction(tx => loadTier0(tx, a.id, today));
    assert.equal(many.goalOptions, null);
    assert.equal(many.goalOptionsUnavailable, 'several_goals_share_spare_money');
    assert.ok(many.savingsPlan.alternatives);
  });
});
