import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAlerts, type AlertInput } from '../src/lib/alerts';
import { budgetPace } from '../src/lib/tier0';
import { cycleByPeriod, cycleContextFromProfile } from '../src/lib/cycle';

const nov = cycleByPeriod(cycleContextFromProfile('u', null), 2026, 11);
const quiet = { status: 'within_plan', availableMonthlyAmount: '5000.00', requiredMonthlyAmount: '100.00', shortfall: '0.00', alternatives: null, activeGoalCount: 1 } as AlertInput['savingsPlan'];
const input = (over: Partial<AlertInput> & { today: string; spent: string; budget: string | null }): AlertInput => ({
  pace: budgetPace(nov, over.today, over.spent, over.budget),
  savingsPlan: quiet,
  goalOptions: null,
  goalOptionsUnavailable: null,
  forecastDaily: Array(7).fill('100'),
  recordedToday: '0',
  nextCycle: { days: 31, budget: null },
  anomaly: { ready: true, waitingShifts: 0, items: [] },
  ...over,
});
const tiers = (i: AlertInput) => evaluateAlerts(i).cards.map(c => c.tier);

test('tier 1 fires only with 7 days or fewer left, past the noise filter scaled to the days', () => {
  // 5 days left, forecast 500, filter 66.12
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '2600', budget: '3000' })), [1]); // left 400, over by 100
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '2560', budget: '3000' })), []); // left 440, over by 60
});
test('tier 1 boundary: exactly the filter does not fire', () => {
  const daily = ['92.57', '0', '0', '0', '0', '0', '0'];
  assert.deepEqual(tiers(input({ today: '2026-11-24', spent: '1000', budget: '1000', forecastDaily: daily })), []); // 7 days left, left 0, over by exactly 92.57
  assert.deepEqual(tiers(input({ today: '2026-11-24', spent: '1000', budget: '1000', forecastDaily: ['92.58', '0', '0', '0', '0', '0', '0'] })), [1]);
});
test('8 days left is tier 2 territory, not tier 1', () => {
  assert.deepEqual(tiers(input({ today: '2026-11-23', spent: '2800', budget: '3000' })), [2]); // allowance 175, forecast 700
});
test('over 7 days left stays quiet when within the allowance plus the filter', () => {
  assert.deepEqual(tiers(input({ today: '2026-11-01', spent: '0', budget: '3000' })), []); // allowance 700, forecast 700
});
test('the part after the cycle end uses next cycle budget, never this one', () => {
  const near = { today: '2026-11-28', spent: '0', budget: '9000', forecastDaily: Array(7).fill('200') }; // 3 days left, 4 next
  assert.deepEqual(tiers(input(near)), []); // no next budget: no comparison
  assert.deepEqual(tiers(input({ ...near, nextCycle: { days: 31, budget: '6200' } })), []); // allowance 800, forecast 800
  const fired = evaluateAlerts(input({ ...near, nextCycle: { days: 31, budget: '1550' } })).cards;
  assert.deepEqual(fired.map(c => c.code), ['pace_over_next_cycle']); // allowance 200
});
test('today counts only what it may still add, so spending today is not counted twice', () => {
  const daily = ['500', '0', '0', '0', '0', '0', '0'];
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '900', budget: '1000', forecastDaily: daily, recordedToday: '500' })), []);
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '900', budget: '1000', forecastDaily: daily, recordedToday: '0' })), [1]);
});
test('forecast gate closed or no budget: tiers 1 and 2 stay out', () => {
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '2990', budget: '3000', forecastDaily: null })), []);
  assert.deepEqual(tiers(input({ today: '2026-11-26', spent: '2990', budget: null })), []);
});
test('tier 3 follows the savings plan and carries why options are missing', () => {
  const plan = { ...quiet, status: 'shortfall', shortfall: '900.00' } as AlertInput['savingsPlan'];
  const card = evaluateAlerts(input({ today: '2026-11-01', spent: '0', budget: '3000', savingsPlan: plan, goalOptionsUnavailable: 'several_goals_share_spare_money' })).cards[0]!;
  assert.equal(card.tier, 3);
  assert.equal(card.goalOptionsUnavailable, 'several_goals_share_spare_money');
});
test('tier 4: gate closed shows nothing; at most 3, by amount, then newer date, then id; total stays honest', () => {
  const items = [
    { id: 'c', amount: '50.00', date: '2026-11-02' }, { id: 'b', amount: '90.00', date: '2026-11-01' },
    { id: 'a', amount: '90.00', date: '2026-11-01' }, { id: 'd', amount: '90.00', date: '2026-11-03' },
  ];
  const on = evaluateAlerts(input({ today: '2026-11-05', spent: '0', budget: null, anomaly: { ready: true, waitingShifts: 1, items } }));
  assert.deepEqual(on.cards.map(c => c.id), ['d', 'a', 'b']);
  assert.equal(on.flaggedTotal, 4);
  assert.equal(on.levelShiftsWaiting, 1);
  const off = evaluateAlerts(input({ today: '2026-11-05', spent: '0', budget: null, anomaly: { ready: false, waitingShifts: 1, items } }));
  assert.deepEqual([off.cards.length, off.flaggedTotal, off.levelShiftsWaiting], [0, 0, 0]);
});
test('order is always tier 1 to 4 and no raw forecast number leaves', () => {
  const plan = { ...quiet, status: 'shortfall' } as AlertInput['savingsPlan'];
  const out = evaluateAlerts(input({ today: '2026-11-26', spent: '2600', budget: '3000', forecastDaily: Array(7).fill('123.45'), savingsPlan: plan, anomaly: { ready: true, waitingShifts: 0, items: [{ id: 'x', amount: '1.00', date: '2026-11-02' }] } }));
  assert.deepEqual(out.cards.map(c => c.tier), [1, 3, 4]);
  assert.ok(!JSON.stringify(out).includes('123.45'));
});
