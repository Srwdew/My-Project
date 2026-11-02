import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';
import { buildBehavior, type BehaviorInput } from '../src/lib/behavior';
import { behaviorPeriod } from '../src/lib/behaviorRules';
import { addDays, cycleContextFromProfile, getCurrentCycle, previousCycle } from '../src/lib/cycle';
import { R2 } from '../src/lib/recommendation/rules/r2';
import { R3 } from '../src/lib/recommendation/rules/r3';
import { R4 } from '../src/lib/recommendation/rules/r4';
import { R5 } from '../src/lib/recommendation/rules/r5';
import { R6 } from '../src/lib/recommendation/rules/r6';
import { R7 } from '../src/lib/recommendation/rules/r7';
import { R8 } from '../src/lib/recommendation/rules/r8';
import { R9 } from '../src/lib/recommendation/rules/r9';
import { R1 } from '../src/lib/recommendation/rules/r1';
import { buildForecast } from '../src/lib/expenseForecast';
import { fixtureInput, history } from './forecast.fixture';
import { goalFeasibility } from '../src/lib/goalFeasibility';
import { render } from '../src/lib/recommendation/text';
import { evaluate } from '../src/lib/recommendation/evaluate';
import type { BehaviorView, DaySpend, RecommendationGoal, RuleContext, SpendWindow } from '../src/lib/recommendation/types';
const D = (v: number | string) => new Prisma.Decimal(v);
const cctx = cycleContextFromProfile('u', null);
const ctxAt = (today: string, over: Partial<RuleContext> = {}): RuleContext => {
    const cycle = getCurrentCycle(cctx, today);
    const p1 = previousCycle(cctx, cycle), p2 = previousCycle(cctx, p1), p3 = previousCycle(cctx, p2);
    return {
        userId: 'u', today, cycle, previousCycles: [p1, p2, p3], incomeThisCycle: D(30000), incomeSource: 'transactions',
        spendThisCycle: D(0), readiness: { behavior: true, forecast: true, goals: true }, behavior: null, dailyExpense: new Map(), priorWindows: [], lastCycleCashFlow: null, cashFlowBeforeLast: null, previousCycleByCategory: new Map(),
        forecast: null, goals: [], flexibleCategoryIds: new Set(), profile: { savingRateFloorPercent: null }, ...over,
    };
};
// Every day from `from` for `days` days at `amount` baht, one transaction each.
const fill = (m: Map<string, DaySpend>, from: string, days: number, amount: number) => {
    for (let i = 0; i < days; i++) m.set(addDays(from, i), { amount: D(amount), count: 1 });
    return m;
};

test('R2: spend-to-date over the 3-cycle median of the same days by more than 15%', () => {
    const today = '2026-11-11'; // 10 full days so far (today excluded)
    const daily = (perDay: number) => {
        const m = new Map<string, DaySpend>();
        fill(m, '2026-08-01', 31, 100); fill(m, '2026-09-01', 30, 100); fill(m, '2026-10-01', 31, 100);
        return fill(m, '2026-11-01', 11, perDay); // includes today, which must be ignored
    };
    const [r] = R2.evaluate(ctxAt(today, { dailyExpense: daily(120) }));
    assert.ok(r);
    assert.deepEqual(r.what, { day: 10, spentToDate: '1200', usualToDate: '1000', overPercent: '20' });
    assert.deepEqual(r.action, { reduceBy: '200', remainingDays: 20 });
    assert.equal(r.outcomeValueBaht.toString(), '200');
    assert.equal(r.confidence.itemCount, 10);
    assert.deepEqual((r.inputs as any).window, { startDate: '2026-11-01', endDate: '2026-11-10', days: 10 });
    assert.equal((r.inputs as any).threshold.paceOver, '0.15');
    assert.deepEqual((r.inputs as any).previousCycles.map((p: any) => [p.key, p.amount, p.capped]), [['2026-10', '1000.00', false], ['2026-09', '1000.00', false], ['2026-08', '1000.00', false]]);
    assert.equal(R2.evaluate(ctxAt(today, { dailyExpense: daily(115) })).length, 0); // exactly +15% is not "over 15%"
    assert.equal(R2.evaluate(ctxAt(today, { dailyExpense: daily(116) })).length, 1);
    // Today's spending never counts, however large.
    const spikeToday = daily(100); spikeToday.set(today, { amount: D(99999), count: 1 });
    assert.equal(R2.evaluate(ctxAt(today, { dailyExpense: spikeToday })).length, 0);
    // A previous cycle without any expense: median is meaningless, no trigger.
    const gap = daily(500); for (let i = 0; i < 30; i++) gap.delete(addDays('2026-09-01', i));
    assert.equal(R2.evaluate(ctxAt(today, { dailyExpense: gap })).length, 0);
    assert.equal(R2.evaluate(ctxAt('2026-11-01', { dailyExpense: daily(500) })).length, 0); // first day: nothing to compare
    // Fewer than 7 full days: no pace judgement, however high. 7 days is enough.
    assert.equal(R2.evaluate(ctxAt('2026-11-07', { dailyExpense: daily(300) })).length, 0); // 6 days
    assert.equal(R2.evaluate(ctxAt('2026-11-08', { dailyExpense: daily(300) })).length, 1); // 7 days
    assert.deepEqual(render(r), {
        what: '10 วันแรกของรอบนี้ใช้ไป 1,200 บาท สูงกว่าช่วงเดียวกันของ 3 รอบก่อนที่ 1,000 บาท อยู่ 20%',
        action: 'ถ้า 20 วันที่เหลือใช้น้อยกว่าจังหวะเดิมรวม 200 บาท',
        outcome: 'ยอดทั้งรอบจะกลับมาเท่าจังหวะเดิม',
    });
});

test('R2: a previous cycle shorter than N uses all of it and is marked capped', () => {
    const m = new Map<string, DaySpend>();
    fill(m, '2026-12-01', 31, 100); fill(m, '2027-01-01', 31, 100); fill(m, '2027-02-01', 28, 100); fill(m, '2027-03-01', 30, 200);
    const [r] = R2.evaluate(ctxAt('2027-03-31', { dailyExpense: m })); // N = 30
    assert.ok(r);
    const prev = (r.inputs as any).previousCycles;
    assert.deepEqual(prev.map((p: any) => [p.key, p.capped, p.windowEnd, p.amount]), [['2027-02', true, '2027-02-28', '2800.00'], ['2027-01', false, '2027-01-30', '3000.00'], ['2026-12', false, '2026-12-30', '3000.00']]);
    assert.equal(r.what.usualToDate, '3000');
});

// Synthetic Behavior: 30 days to yesterday vs the 30 before, every transaction confirmed at 12:xx.
const asOf = '2026-11-02';
const behavior = (extraFindings: BehaviorView['findings'] = []): BehaviorView => {
    const period = behaviorPeriod({}, asOf);
    const rows: BehaviorInput['rows'] = [];
    let id = 0;
    const add = (categoryId: string, name: string, from: string, days: number, amount: number, step = 1) => {
        for (let i = 0; i < days; i += step) {
            const date = addDays(from, i);
            rows.push({ categoryId, categoryName: name, date, bucket: 3, count: 1, amount: String(amount), transactions: [{ id: 't' + id++, date, amount: String(amount), time: '12:30' }] } as BehaviorInput['rows'][number]);
        }
    };
    add('food', 'อาหาร', period.previous.startDate, 30, 100); add('food', 'อาหาร', period.current.startDate, 30, 150); // +1,500
    add('travel', 'เดินทาง', period.previous.startDate, 30, 50); add('travel', 'เดินทาง', period.current.startDate, 30, 40); // falls
    add('fun', 'บันเทิง', period.previous.startDate, 30, 100, 6); add('fun', 'บันเทิง', period.current.startDate, 30, 200, 5); // 5→6 items, +700
    const out = buildBehavior({ asOfDate: asOf, period, rows, categoryOptions: [], recurrences: [] });
    return { periods: { current: out.periods.current, previous: out.periods.previous }, findings: [...out.findings, ...extraFindings], categories: out.facts.categories };
};

test('R3: share of the increase uses only increasing categories; Behavior decides what grew', () => {
    const b = behavior();
    assert.deepEqual(b.findings.filter((f) => f.findingType === 'period_change').map((f) => f.categoryId).sort(), ['food', 'fun']);
    const out = R3.evaluate(ctxAt(asOf, { behavior: b }));
    // fun grew too but has only 6 items (< 8): skipped, yet its +700 stays in the divisor.
    assert.deepEqual(out.map((r) => r.subject), ['food']);
    const [r] = out;
    // Raw value in the result; only the rendered text is rounded.
    assert.deepEqual(r!.what, { categoryName: 'อาหาร', windowDays: 30, previousAmount: '3000.00', currentAmount: '4500.00', shareOfIncreasePercent: '68.181818181818181818' });
    assert.equal(r!.outcomeValueBaht.toString(), '1500');
    assert.equal((r!.inputs as any).totalIncreaseAllCategories, '2200.00');
    assert.equal((r!.inputs as any).behavior.minimumIncreaseAmount, '100');
    assert.deepEqual((r!.inputs as any).behavior.window, b.periods);
    assert.deepEqual(render(r!), { what: 'หมวด อาหาร เพิ่มขึ้นใน 30 วันที่ผ่านมา จาก 3,000 เป็น 4,500 บาท คิดเป็น 69% ของยอดที่เพิ่มขึ้นทั้งหมด', action: 'ถ้าหมวดนี้กลับไปอยู่ระดับเดิม', outcome: 'จะลดลง 1,500 บาท' });
    assert.equal(R3.evaluate(ctxAt(asOf, { behavior: null })).length, 0);
});

test('R4: average per occurrence × 1 from Behavior time and recurrence evidence', () => {
    const recurrence = (count: number, listed: number) => ({
        ruleId: 'possible_recurrence_weekly', categoryId: 'food', categoryName: 'อาหาร', title: '', recommendation: '', scope: 'current', findingType: 'recurrence',
        evidence: { transactionCount: count, transactions: Array.from({ length: listed }, (_, i) => ({ id: 'w' + i, date: '2026-10-0' + (i + 1), amount: '149.50', time: null })) },
    }) as unknown as BehaviorView['findings'][number];
    const b = behavior([recurrence(4, 4), { ...recurrence(5, 4), categoryId: 'travel' } as BehaviorView['findings'][number]]);
    const out = R4.evaluate(ctxAt(asOf, { behavior: b }));
    const time = out.find((r) => r.what.kind === 'time')!;
    // Every current transaction is at 12:xx: 30 × 150 + 30 × 40 + 6 × 200 = 6,900 over 66.
    assert.deepEqual([time.what.occurrences, time.what.totalAmount, time.outcome.saveAbout, time.what.startHour], [66, '6900', '104.54545454545454545', 12]);
    assert.equal(time.subject, 'time:12');
    const weekly = out.find((r) => r.what.kind === 'weekly')!;
    assert.deepEqual([weekly.subject, weekly.outcome.saveAbout, weekly.confidence.itemCount], ['food', '149.5', 30]);
    assert.ok(!out.some((r) => r.subject === 'travel')); // evidence lists 4 of 5: skipped
    // Behavior reporting food twice (general 120/time, weekly 149.50/time): one R4 for food, the higher baht, merge recorded.
    const general = { ...recurrence(4, 4), ruleId: 'possible_recurrence_general', evidence: { transactionCount: 3, transactions: Array.from({ length: 3 }, (_, i) => ({ id: 'g' + i, date: '2026-10-1' + i, amount: '120.00', time: null })) } } as unknown as BehaviorView['findings'][number];
    const both = R4.evaluate(ctxAt(asOf, { behavior: behavior([general, recurrence(4, 4)]) })).filter((r) => r.subject === 'food');
    assert.equal(both.length, 1);
    assert.deepEqual([both[0]!.what.kind, both[0]!.outcome.saveAbout, (both[0]!.inputs as any).mergedFindings], ['weekly', '149.5', { count: 1, ruleIds: ['possible_recurrence_general'], saveAbout: ['120'] }]);
    assert.deepEqual(render(weekly), { what: 'หมวด อาหาร มีรายการยอดใกล้เคียงกันซ้ำ 4 ครั้งใน 30 วันที่ผ่านมา รวม 598 บาท', action: 'ถ้าลดลง 1 ครั้งใน 30 วัน', outcome: 'จะลดลงราว 150 บาท' });
    // Under 100 baht a time: dropped by the evaluator's shared minimum (99.99 out, exactly 100 in).
    const priced = (amount: string) => ({ ...recurrence(4, 4), evidence: { transactionCount: 4, transactions: Array.from({ length: 4 }, (_, i) => ({ id: 'p' + i, date: '2026-10-0' + (i + 1), amount, time: null })) } }) as unknown as BehaviorView['findings'][number];
    const weeklyOf = (amount: string) => evaluate(ctxAt(asOf, { behavior: { ...b, findings: [priced(amount)] } }), [R4]);
    assert.deepEqual([weeklyOf('99.99').scored.length, weeklyOf('99.99').belowMinimum.length], [0, 1]);
    assert.equal(weeklyOf('100.00').scored.length, 1);
    assert.equal(render(time).what, 'รายการช่วง 12:00–16:00 เกิดขึ้น 66 ครั้งใน 30 วันที่ผ่านมา รวม 6,900 บาท');
});

// Three prior 30-day windows; food/travel/fun amounts per window.
const windows = (food: number[], travel = [1000, 1000, 1000], fun = [500, 500, 500]): SpendWindow[] => food.map((f, i) => ({
    startDate: addDays('2026-10-03', -30 * (i + 1)), endDate: addDays('2026-10-02', -30 * i),
    total: D(f + travel[i]! + fun[i]!), byCategory: new Map([['food', D(f)], ['travel', D(travel[i]!)], ['fun', D(fun[i]!)]]),
}));

test('R5: Behavior decides dominance; usual share is the median of the 3 prior windows', () => {
    const b = behavior();
    assert.ok(b.findings.some((f) => f.ruleId === 'category_dominant_share' && f.categoryId === 'food')); // 4,500 of 6,900
    // food share in prior windows: 3000/4500, 1000/2500, 2000/3500 → 66.7%, 40%, 57.1% → median 57.14%
    const [r] = R5.evaluate(ctxAt(asOf, { behavior: b, priorWindows: windows([3000, 1000, 2000]) }));
    assert.ok(r);
    assert.deepEqual([r.subject, Number(r.what.sharePercent).toFixed(4), Number(r.what.usualSharePercent).toFixed(4)], ['food', '65.2174', '57.1429']);
    // (4500/6900 − 2000/3500) × 6900 = 4500 − 3942.857… = 557.142857… kept raw
    assert.equal(Number(r.outcome.reduceBy).toFixed(4), '557.1429');
    assert.deepEqual((r.inputs as any).baselineWindows.map((w: any) => w.category), ['3000.00', '1000.00', '2000.00']);
    assert.deepEqual(render(r), { what: 'ใน 30 วันที่ผ่านมา หมวด อาหาร คิดเป็น 65% ของรายจ่ายทั้งหมด ปกติอยู่ที่ราว 57%', action: 'ถ้าหมวดนี้กลับไปอยู่ที่สัดส่วนปกติ', outcome: 'จะลดลงราว 557 บาท' });
    // Large share that is the user's own usual: no advice.
    assert.equal(R5.evaluate(ctxAt(asOf, { behavior: b, priorWindows: windows([9000, 9000, 9000]) })).length, 0);
    // A prior window with no spending: no usual share, no advice.
    const empty = windows([3000, 1000, 2000]); empty[2] = { ...empty[2]!, total: D(0), byCategory: new Map() };
    assert.equal(R5.evaluate(ctxAt(asOf, { behavior: b, priorWindows: empty })).length, 0);
    assert.equal(R5.evaluate(ctxAt(asOf, { behavior: b, priorWindows: windows([3000, 1000]) })).length, 0);
});

const goal = (id: string, name: string, target: number, saved: number, targetDate: string | null, required: string | null, left: number): RecommendationGoal => ({
    id, name, targetAmount: D(target), savedAmount: D(saved), targetDate,
    feasibility: goalFeasibility({ requiredMonthlyAmount: required, calculatedStatus: 'active', archivedAt: null, targetDate },
        { period: { month: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31' }, incomeAmount: '20000.00', expenseAmount: (20000 - left).toFixed(2), netCashFlow: left.toFixed(2), transactionCount: 42 }),
});

test('R6: every goal whose existing feasibility status is exceeds_observed_cash_flow, one result each', () => {
    const trip = goal('g1', 'ทริปญี่ปุ่น', 30000, 12000, '2027-03-31', '5000.00', 3200);
    const phone = goal('g2', 'โทรศัพท์', 20000, 5000, '2027-01-31', '7500.00', 3200);
    const fine = goal('g3', 'ฉุกเฉิน', 10000, 1000, '2027-06-30', '1500.00', 3200);
    assert.deepEqual([trip, phone, fine].map((g) => g.feasibility.status), ['exceeds_observed_cash_flow', 'exceeds_observed_cash_flow', 'within_observed_cash_flow']);
    const out = R6.evaluate(ctxAt(asOf, { goals: [trip, phone, fine] }));
    assert.deepEqual(out.map((r) => [r.subject, r.action.addPerMonth]), [['g1', '1800.00'], ['g2', '4300.00']]);
    assert.equal((out[0]!.inputs as any).feasibility.policy, 'last-completed-calendar-month-v1');
    assert.deepEqual(render(out[0]!), {
        what: 'เป้า ทริปญี่ปุ่น ต้องเก็บเดือนละ 5,000 บาท แต่เดือน ต.ค. 2569 มีเงินเหลือจริง 3,200 บาท',
        action: 'ถ้าเงินเหลือต่อเดือนเพิ่มขึ้นอีก 1,800 บาท',
        outcome: 'จะเก็บส่วนที่เหลือ 18,000 บาท ได้ทันวันที่ 31 มี.ค. 2570',
    });
    // Money left ≤ 0 has its own status (non_positive_cash_flow), which belongs to R8, not R6.
    assert.equal(R6.evaluate(ctxAt(asOf, { goals: [goal('g4', 'x', 10000, 0, '2027-06-30', '2000.00', -500)] })).length, 0);
});

test('R7: cut a flexible category back to its usual level; nearest-dated goal; must save at least one cycle', () => {
    const b = behavior();
    const trip = goal('g1', 'ทริปญี่ปุ่น', 30000, 12000, '2027-03-31', '5000.00', 3000);
    const later = goal('g2', 'รถ', 200000, 0, '2030-01-01', '3000.00', 3000);
    const base = { behavior: b, priorWindows: windows([3000, 3000, 3500]), goals: [later, trip] };
    // No flagged categories: silent, as agreed.
    assert.equal(R7.evaluate(ctxAt(asOf, base)).length, 0);
    const out = R7.evaluate(ctxAt(asOf, { ...base, flexibleCategoryIds: new Set(['food', 'travel']) }));
    // food 4,500 vs usual 3,000 → cut 1,500. 18,000 left at 3,000/cycle = 6 cycles; at 4,500 = 4. travel fell: no cut.
    assert.deepEqual(out.map((r) => [r.subject, r.action.reduceBy, r.action.sliderDefault, r.outcome.cyclesSooner]), [['food', '1500', '3000', 2]]);
    assert.equal((out[0]!.inputs as any).goal.id, 'g1'); // nearest target date
    assert.deepEqual(render(out[0]!), {
        what: 'ใน 30 วันที่ผ่านมา หมวด อาหาร ใช้ไป 4,500 บาท ปกติอยู่ที่ 3,000 บาท',
        action: 'ถ้าลดหมวดนี้ลง 1,500 บาท ให้กลับไปเท่าปกติ',
        outcome: 'เป้า ทริปญี่ปุ่น จะถึงเร็วขึ้นราว 2 รอบ (จาก 6 เหลือ 4 รอบ)',
    });
    // A cut too small to save a whole cycle: 18,000 at 3,000 = 6 cycles, at 3,100 = 5.8 → still 6.
    assert.equal(R7.evaluate(ctxAt(asOf, { ...base, priorWindows: windows([4400, 4400, 4400]), flexibleCategoryIds: new Set(['food']) })).length, 0);
    // No money left last month: R7 cannot simulate; that is R8's case.
    assert.equal(R7.evaluate(ctxAt(asOf, { ...base, goals: [goal('g1', 'x', 30000, 0, '2027-03-31', '5000.00', 0)], flexibleCategoryIds: new Set(['food']) })).length, 0);
    // Undated goals only: the one with least remaining.
    const a = goal('a', 'A', 50000, 0, null, null, 3000), z = goal('z', 'Z', 9000, 0, null, null, 3000);
    assert.equal((R7.evaluate(ctxAt(asOf, { ...base, goals: [a, z], flexibleCategoryIds: new Set(['food']) }))[0]!.inputs as any).goal.id, 'z');
});

const cashFlow = (income: number, expense: number) => ({
    period: { month: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31' },
    incomeAmount: income.toFixed(2), expenseAmount: expense.toFixed(2), netCashFlow: (income - expense).toFixed(2), transactionCount: 40,
});

test('R8: current-cycle overspend now; last completed month against the user floor (strict), or negative when no floor', () => {
    // Current cycle: spent 21,500 of 20,000 income by the 20th.
    const now = R8.evaluate(ctxAt('2026-11-20', { incomeThisCycle: D(20000), spendThisCycle: D(21500) }));
    assert.deepEqual(now.map((r) => [r.subject, r.what.over, r.action.remainingDays]), [['current', '1500', 11]]);
    assert.deepEqual(render(now[0]!), {
        what: 'รอบนี้ถึงวันนี้ใช้ไป 21,500 บาท มากกว่ารายได้ของรอบ 20,000 บาท อยู่ 1,500 บาท',
        action: 'ถ้า 11 วันที่เหลือใช้น้อยลงรวม 1,500 บาท',
        outcome: 'รายจ่ายรอบนี้จะไม่เกินรายได้ 20,000 บาท',
    });
    // Last month saved 4% (800 of 20,000); floor 10% → spend 1,200 less to reach it.
    const floor = (pct: number | null) => ({ profile: { savingRateFloorPercent: pct === null ? null : D(pct) } });
    const [low] = R8.evaluate(ctxAt(asOf, { lastCycleCashFlow: cashFlow(20000, 19200), ...floor(10) }));
    assert.deepEqual([low!.subject, low!.what.kind, low!.what.ratePercent, low!.action.spendLessPerMonth], ['last', 'below_floor', '4.00', '1200']);
    assert.equal((low!.inputs as any).savingRate.percent, '4.00'); // the dashboard's own savingRate()
    assert.deepEqual(render(low!), {
        what: 'เดือน ต.ค. 2569 ออมได้ 4% ของรายได้ ต่ำกว่าเกณฑ์ที่คุณตั้งไว้ 10%',
        action: 'ถ้าใช้น้อยลงเดือนละ 1,200 บาท',
        outcome: 'อัตราออมจะถึง 10% ตามที่ตั้งไว้',
    });
    assert.equal(R8.evaluate(ctxAt(asOf, { lastCycleCashFlow: cashFlow(20000, 18000), ...floor(10) })).length, 0); // exactly 10%: strict
    assert.equal(R8.evaluate(ctxAt(asOf, { lastCycleCashFlow: cashFlow(20000, 19200), ...floor(null) })).length, 0); // no floor, positive
    const [neg] = R8.evaluate(ctxAt(asOf, { lastCycleCashFlow: cashFlow(20000, 21000), ...floor(null) }));
    assert.deepEqual([neg!.what.kind, neg!.action.spendLessPerMonth, neg!.outcome.targetPercent], ['last_negative', '1000', '0']);
    assert.deepEqual(render(neg!), { what: 'เดือน ต.ค. 2569 ใช้จ่ายมากกว่ารายได้ 1,000 บาท', action: 'ถ้าใช้น้อยลงเดือนละ 1,000 บาท', outcome: 'รายจ่ายต่อเดือนจะไม่เกินรายได้' });
    assert.equal(R8.evaluate(ctxAt(asOf, { lastCycleCashFlow: cashFlow(0, 500) })).length, 0); // no income: savingRate gives no rate
});

test('R9: a category fell by more than 5% and more than 100 baht (strict); cycles sooner for one goal when computable', () => {
    const b = behavior(); // travel 1,500 → 1,200
    const goalAt = (remaining: number, left: number) => goal('g1', 'ทริปญี่ปุ่น', remaining, 0, '2027-03-31', '1000.00', left);
    const [r] = R9.evaluate(ctxAt(asOf, { behavior: b, goals: [goalAt(9000, 2900)] }));
    assert.deepEqual([r!.subject, r!.what.decrease, r!.outcome.cyclesSooner], ['travel', '300', 1]); // ceil(9000/2900)=4 → ceil(9000/3200)=3
    assert.deepEqual(render(r!), {
        what: 'ใน 30 วันที่ผ่านมา หมวด เดินทาง ลดลง 300 บาทจาก 30 วันก่อนหน้า (จาก 1,500 เป็น 1,200 บาท)',
        action: 'ถ้ารักษาระดับนี้ไว้',
        outcome: 'จะเก็บเงินได้เพิ่มราว 300 บาทต่อรอบ และเป้า ทริปญี่ปุ่น จะถึงเร็วขึ้นราว 1 รอบ',
    });
    // Not a whole cycle sooner: the goal part is left out rather than saying "0 รอบ".
    const [r0] = R9.evaluate(ctxAt(asOf, { behavior: b, goals: [goalAt(12000, 3000)] }));
    assert.equal(render(r0!).outcome, 'จะเก็บเงินได้เพิ่มราว 300 บาทต่อรอบ');
    // Boundaries: exactly 5% and exactly 100 baht do not count.
    const only = (prev: string, cur: string): BehaviorView => ({ ...b, findings: [], categories: [{ ...b.categories.find((c) => c.categoryId === 'travel')!, previous: { ...b.categories[0]!.previous, amount: prev }, current: { ...b.categories[0]!.current, amount: cur } }] });
    assert.equal(R9.evaluate(ctxAt(asOf, { behavior: only('2000.00', '1900.00'), goals: [goalAt(9000, 2900)] })).length, 0);
    assert.equal(R9.evaluate(ctxAt(asOf, { behavior: only('2000.00', '1899.99'), goals: [goalAt(9000, 2900)] })).length, 1);
    assert.equal(R9.evaluate(ctxAt(asOf, { behavior: only('1000.00', '900.00'), goals: [goalAt(9000, 2900)] })).length, 0); // 10% but exactly 100
    // Saving rate: last completed month 15% vs 11% the month before (+4 points, 800 baht more saved).
    const rateCtx = (beforeExpense: number) => ctxAt(asOf, { behavior: null, goals: [goalAt(9000, 3000)], lastCycleCashFlow: cashFlow(20000, 17000), cashFlowBeforeLast: { ...cashFlow(20000, beforeExpense), period: { month: '2026-09', startDate: '2026-09-01', endDate: '2026-09-30' } } });
    const [s] = R9.evaluate(rateCtx(17800));
    assert.deepEqual([s!.subject, s!.what.ratePercent, s!.what.improvedPoints, s!.outcome.savedMore, s!.outcome.cyclesSooner], ['saving_rate', '15.00', '4', '800', 2]); // ceil(9000/2200)=5 → ceil(9000/3000)=3
    assert.deepEqual(render(s!), {
        what: 'เดือน ต.ค. 2569 ออมได้ 15% ของรายได้ ดีขึ้น 4 จุดจากเดือน ก.ย. 2569',
        action: 'ถ้ารักษาระดับนี้ไว้',
        outcome: 'จะเก็บเงินได้เพิ่มราว 800 บาทต่อเดือน และเป้า ทริปญี่ปุ่น จะถึงเร็วขึ้นราว 2 รอบ',
    });
    assert.equal(R9.evaluate(rateCtx(17400)).length, 0); // exactly +2 points: strict
    assert.equal(R9.evaluate(rateCtx(17410)).length, 1); // 12.95% before → +2.05 points
    assert.equal(render(R9.evaluate(rateCtx(17410))[0]!).what, 'เดือน ต.ค. 2569 ออมได้ 15% ของรายได้ ดีขึ้น 3 จุดจากเดือน ก.ย. 2569'); // 2.05 shown as 3: over the threshold, rounded up
});

test('R1: next 7 days vs income − spending so far; total cut across flexible categories; top flexible category by last cycle actuals', () => {
    const base = {
        incomeThisCycle: D(20000), spendThisCycle: D(18900), flexibleCategoryIds: new Set(['food', 'fun']),
        forecast: { horizonDays: 7, total: D(3000), byCategory: null, interval: null },
        previousCycleByCategory: new Map([['food', { name: 'อาหาร', amount: D(8300) }], ['fun', { name: 'บันเทิง', amount: D(1200) }], ['rent', { name: 'ค่าเช่า', amount: D(9000) }]]),
    };
    const [r] = R1.evaluate(ctxAt('2026-11-20', base));
    assert.deepEqual([r!.what.shortfall, r!.action.topFlexibleCategoryName, r!.action.topFlexibleAmount], ['1900', 'อาหาร', '8300']); // rent is not flexible
    assert.deepEqual([r!.confidence.forecastFactor, (r!.inputs as any).forecastFactorFallback, (r!.inputs as any).forecast.level, (r!.inputs as any).left.budgetUsed], [1, true, 'total_only_not_per_category', false]);
    assert.deepEqual(render(r!), {
        what: 'ใน 7 วันข้างหน้าคาดว่าจะใช้เกินเงินที่เหลืออยู่ 1,900 บาท',
        action: 'หมวดยืดหยุ่นที่ใช้มากที่สุดในรอบก่อนคือ อาหาร ที่ 8,300 บาท',
        outcome: 'ถ้าลดรายจ่ายในหมวดยืดหยุ่นรวมกันได้ 1,900 บาท จะไม่ใช้เกินเงินที่เหลือในรอบนี้',
    });
    // Forecast figures are rounded to the hundred on screen; the raw value stays in the result.
    const [odd] = R1.evaluate(ctxAt('2026-11-20', { ...base, forecast: { ...base.forecast, total: D(2950) } }));
    assert.equal(odd!.what.shortfall, '1850');
    assert.equal(render(odd!).what, 'ใน 7 วันข้างหน้าคาดว่าจะใช้เกินเงินที่เหลืออยู่ 1,900 บาท');
    // Interval width lowers confidence: 1 − (3600 − 2400) ÷ 3000 = 0.6.
    const [wide] = R1.evaluate(ctxAt('2026-11-20', { ...base, forecast: { ...base.forecast, interval: { low: D(2400), high: D(3600) } } }));
    assert.equal(wide!.confidence.forecastFactor, 0.6);
    assert.equal((wide!.inputs as any).forecastFactorFallback, false);
    assert.equal(R1.evaluate(ctxAt('2026-11-20', { ...base, spendThisCycle: D(17000) })).length, 0); // 3,000 left covers it
    assert.equal(R1.evaluate(ctxAt('2026-11-20', { ...base, flexibleCategoryIds: new Set() })).length, 0);
    assert.equal(R1.evaluate(ctxAt('2026-11-20', { ...base, incomeSource: 'none' })).length, 0);
});

test('R1 still fires on real Theta output (the reason median-7 was rejected); no interval → factor 1 fallback; hundreds on screen', () => {
    // Same mapping as recommendation/context.ts: Theta daily amounts summed, no interval.
    const out = buildForecast(fixtureInput(history(60, '2026-11-19', '137.00'), '2026-11-20'));
    const total = out.summary.daily!.reduce((s, d) => s.plus(d.amount), D(0));
    assert.equal(total.toString(), '959'); // flat 137/day -> Theta 7 × 137
    const [r] = R1.evaluate(ctxAt('2026-11-20', {
        incomeThisCycle: D(20000), spendThisCycle: D(19500), flexibleCategoryIds: new Set(['food']),
        forecast: { horizonDays: 7, total, byCategory: null, interval: null },
        previousCycleByCategory: new Map([['food', { name: 'อาหาร', amount: D(8300) }]]),
    }));
    assert.ok(r, 'R1 triggers');
    assert.deepEqual([r!.what.shortfall, r!.confidence.forecastFactor, (r!.inputs as any).forecastFactorFallback], ['459', 1, true]);
    assert.equal(render(r!).what, 'ใน 7 วันข้างหน้าคาดว่าจะใช้เกินเงินที่เหลืออยู่ 500 บาท');
});

test('R3 records increasing categories it skipped, still counted in the divisor', () => {
    const [r] = R3.evaluate(ctxAt(asOf, { behavior: behavior() }));
    assert.deepEqual((r!.inputs as any).skippedIncreasingCategories, { count: 1, totalIncrease: '700.00', categories: [{ id: 'fun', name: 'บันเทิง', transactionCount: 6 }] });
});
