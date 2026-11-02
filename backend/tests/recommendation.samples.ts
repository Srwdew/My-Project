// Prints the rendered text of each rule for normal and edge cases (synthetic data). Run: node --import tsx tests/recommendation.samples.ts
import { Prisma } from '@prisma/client';
import { addDays, cycleContextFromProfile, getCurrentCycle, previousCycle } from '../src/lib/cycle';
import { R2 } from '../src/lib/recommendation/rules/r2';
import { R4 } from '../src/lib/recommendation/rules/r4';
import { R8 } from '../src/lib/recommendation/rules/r8';
import { R1 } from '../src/lib/recommendation/rules/r1';
import { render } from '../src/lib/recommendation/text';
import type { BehaviorView, DaySpend, RuleContext, RuleResult } from '../src/lib/recommendation/types';
const D = (v: number | string) => new Prisma.Decimal(v);
const cctx = cycleContextFromProfile('u', null);
const ctxAt = (today: string, over: Partial<RuleContext>): RuleContext => {
    const cycle = getCurrentCycle(cctx, today), p1 = previousCycle(cctx, cycle), p2 = previousCycle(cctx, p1), p3 = previousCycle(cctx, p2);
    return { userId: 'u', today, cycle, previousCycles: [p1, p2, p3], incomeThisCycle: D(30000), incomeSource: 'transactions', spendThisCycle: D(0),
        readiness: { behavior: true, forecast: true, goals: true }, behavior: null, dailyExpense: new Map(), priorWindows: [], lastCycleCashFlow: null, cashFlowBeforeLast: null, previousCycleByCategory: new Map(), forecast: null, goals: [],
        flexibleCategoryIds: new Set(), profile: { savingRateFloorPercent: null }, ...over };
};
const show = (label: string, rs: readonly RuleResult[]) => {
    console.log('— ' + label);
    if (!rs.length) console.log('  (ไม่ทริกเกอร์)');
    for (const r of rs) { const t = render(r); console.log('  ' + t.what + '\n  ' + t.action + '\n  ' + t.outcome); }
};
const daily = (perDay: number, prevPerDay = 100) => {
    const m = new Map<string, DaySpend>();
    for (const [from, days] of [['2026-08-01', 31], ['2026-09-01', 30], ['2026-10-01', 31]] as const)
        for (let i = 0; i < days; i++) m.set(addDays(from, i), { amount: D(prevPerDay), count: 1 });
    for (let i = 0; i < 10; i++) m.set(addDays('2026-11-01', i), { amount: D(perDay), count: 1 });
    return m;
};
show('R2 ปกติ (เกิน 20%)', R2.evaluate(ctxAt('2026-11-11', { dailyExpense: daily(120) })));
show('R2 เกินนิดเดียว (15.3%, ยอดน้อย)', R2.evaluate(ctxAt('2026-11-11', { dailyExpense: daily(11.53, 10) })));
show('R2 เกินมาก (ต้นรอบใช้หนัก 3 เท่า)', R2.evaluate(ctxAt('2026-11-03', { dailyExpense: daily(300) })));
const finding = (ruleId: string, extra: object, evidence: object) =>
    ({ ruleId, categoryId: 'coffee', categoryName: 'กาแฟ', title: '', recommendation: '', scope: 'current', findingType: ruleId.startsWith('possible') ? 'recurrence' : 'time_observation', ...extra, evidence }) as unknown as BehaviorView['findings'][number];
const tx = (n: number, amount: string) => ({ transactionCount: n, transactions: Array.from({ length: n }, (_, i) => ({ id: String(i), date: '2026-10-1' + (i % 10), amount, time: null })) });
const b: BehaviorView = {
    periods: { current: { startDate: '2026-10-03', endDate: '2026-11-01' }, previous: { startDate: '2026-09-03', endDate: '2026-10-02' } },
    categories: [{ categoryId: 'coffee', categoryName: 'กาแฟ', current: { amount: '900.00', transactionCount: 12 }, previous: { amount: '800.00', transactionCount: 11 } }] as unknown as BehaviorView['categories'],
    findings: [
        finding('possible_recurrence_weekly', {}, tx(4, '189.50')),
        finding('possible_recurrence_general', {}, tx(9, '3.25')), // under 100 baht a time: suppressed
        finding('confirmed_time_concentration', { categoryId: null, categoryName: null }, { ...tx(31, '145.50'), bucket: { startHour: 20, endHourExclusive: 24 } }),
    ],
};
show('R4 รายการซ้ำ 189.50 / ซ้ำ 3.25 (ถูกตัด) / ช่วงเวลา 145.50', R4.evaluate(ctxAt('2026-11-02', { behavior: b })));
const cf = (income: number, expense: number) => ({ period: { month: '2026-10', startDate: '2026-10-01', endDate: '2026-10-31' }, incomeAmount: income.toFixed(2), expenseAmount: expense.toFixed(2), netCashFlow: (income - expense).toFixed(2), transactionCount: 40 });
show('R8 รอบนี้ใช้เกินรายได้', R8.evaluate(ctxAt('2026-11-20', { incomeThisCycle: D(20000), spendThisCycle: D(21480.75) })));
show('R8 เดือนก่อนต่ำกว่าเกณฑ์ 10% (ออมได้ 4.35%)', R8.evaluate(ctxAt('2026-11-02', { lastCycleCashFlow: cf(23000, 22000), profile: { savingRateFloorPercent: D(10) } })));
show('R8 เดือนก่อนติดลบ ไม่ได้ตั้งเกณฑ์', R8.evaluate(ctxAt('2026-11-02', { lastCycleCashFlow: cf(20000, 21237.4) })));
show('R1 (พยากรณ์ 2,950 เหลือ 1,100.50)', R1.evaluate(ctxAt('2026-11-20', {
    incomeThisCycle: D(20000), spendThisCycle: D('18899.50'), flexibleCategoryIds: new Set(['food']),
    forecast: { horizonDays: 7, total: D(2950), byCategory: null, interval: null },
    previousCycleByCategory: new Map([['food', { name: 'อาหาร', amount: D('8312.25') }]]),
})));
