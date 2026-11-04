import test from 'node:test';
import assert from 'node:assert/strict';
import { budgetPace, goalOptions } from '../src/lib/tier0';
import { cycleByPeriod, cycleContextFromProfile } from '../src/lib/cycle';
import { extendText } from '../src/lib/alertNotifications';

const nov = cycleByPeriod(cycleContextFromProfile('u', null), 2026, 11); // 30 days

test('days left and elapsed count today, at both ends of the cycle', () => {
  assert.deepEqual([budgetPace(nov, '2026-11-01', 0, null).elapsed, budgetPace(nov, '2026-11-01', 0, null).daysLeft], [1, 30]);
  assert.deepEqual([budgetPace(nov, '2026-11-30', 0, null).elapsed, budgetPace(nov, '2026-11-30', 0, null).daysLeft], [30, 1]);
});
test('design example: 800 left over 5 days is 160 a day', () => {
  const p = budgetPace(nov, '2026-11-26', '200', '1000');
  assert.equal(p.budgetLeft, '800.00');
  assert.equal(p.perDay, '160');
});
test('perDay rounds down, never up past the ceiling', () => {
  const p = budgetPace(nov, '2026-11-03', '221.50', '12345.50');
  assert.equal(p.budgetLeft, '12124.00');
  assert.equal(p.perDay, '433'); // 433.00 exactly from 28 days; next case proves the floor
  assert.equal(budgetPace(nov, '2026-11-28', '0', '1000').perDay, '333'); // 333.33
  assert.equal(budgetPace(nov, '2026-11-29', '0', '1999').perDay, '999'); // 999.50
});
test('over budget shows the overage and no per-day figure', () => {
  const p = budgetPace(nov, '2026-11-10', '1200.25', '1000');
  assert.equal(p.overBudget, '200.25');
  assert.equal(p.budgetLeft, '0.00');
  assert.equal(p.perDay, null);
});
test('less than one baht a day has no per-day figure', () => {
  assert.equal(budgetPace(nov, '2026-11-01', '999.50', '1000').perDay, null);
  assert.equal(budgetPace(nov, '2026-11-01', '1000', '1000').overBudget, '0.00');
});
test('pace gap: positive is faster than plan, zero is on plan', () => {
  const on = budgetPace(nov, '2026-11-15', '1500', '3000');
  assert.deepEqual([on.expectedSpent, on.paceGap], ['1500.00', '0.00']);
  assert.equal(budgetPace(nov, '2026-11-15', '1600', '3000').paceGap, '100.00');
  assert.equal(budgetPace(nov, '2026-11-15', '1400', '3000').paceGap, '-100.00');
});
test('no budget gives no budget figures, spending still counts', () => {
  const p = budgetPace(nov, '2026-11-15', '50', null);
  assert.equal(p.spent, '50.00');
  for (const k of ['cycleBudget', 'budgetLeft', 'overBudget', 'perDay', 'expectedSpent', 'paceGap'] as const) assert.equal(p[k], null);
});
test('a date outside the cycle is refused', () => {
  assert.throws(() => budgetPace(nov, '2026-12-01', 0, '1000'), /TODAY_OUTSIDE_CYCLE/);
});
test('goal options follow 3.4: extend rounds up, target = saved + available x months', () => {
  assert.deepEqual(goalOptions({ targetAmount: '10000', savedAmount: '1000', monthsRemaining: 3 }, '2000'), { extendToMonths: 5, lowerTargetTo: '7000.00' });
  assert.deepEqual(goalOptions({ targetAmount: '10000', savedAmount: '0', monthsRemaining: null }, '3000'), { extendToMonths: 4, lowerTargetTo: null });
});
test('extend text: years and months, and past 50 years says extending alone is not enough', () => {
  assert.equal(extendText(5), 'ยืดเวลาเป็น 5 เดือน');
  assert.equal(extendText(24), 'ยืดเวลาเป็น 2 ปี');
  assert.equal(extendText(600), 'ยืดเวลาเป็น 50 ปี');
  assert.equal(extendText(601), 'ยืดเวลาอย่างเดียวไม่พอสำหรับเป้านี้');
});
test('goal options need money to spare', () => {
  for (const a of ['0', '-500']) assert.deepEqual(goalOptions({ targetAmount: '100', savedAmount: '0', monthsRemaining: 2 }, a), { extendToMonths: null, lowerTargetTo: null });
});
