import test from 'node:test';
import assert from 'node:assert/strict';
import { dashboardPeriod } from '../src/lib/dashboard';
import { bangkokToday } from '../src/lib/goalCalculations';
import { moneyText, calendarDays, shiftMonth, validDashboardMonth } from '../../frontend/src/utils/dashboard';
test('Dashboard periods: current, historical leap month and year boundary', () => {
 assert.equal(dashboardPeriod(undefined,'2026-09-19').effectiveEndDate,'2026-09-19');
 assert.equal(dashboardPeriod('2024-02','2026-09-19').calendarEndDate,'2024-02-29');
 assert.equal(dashboardPeriod('2025-02','2026-09-19').effectiveEndDate,'2025-02-28');
 assert.equal(dashboardPeriod('2025-12','2026-01-01').effectiveEndDate,'2025-12-31');
 assert.equal(shiftMonth('2026-01',-1),'2025-12');
});
test('Dashboard rejects future, malformed and duplicate month', () => { for (const input of ['2026-10','2026-00','2026-13','2026-9','0000-01','bad',['2026-09','2026-09']]) assert.throws(()=>dashboardPeriod(input,'2026-09-19')); assert.equal(validDashboardMonth('2026-10','2026-09-19'),false); });
test('Dashboard Bangkok midnight uses a single supplied asOf', () => { assert.equal(bangkokToday(new Date('2026-09-30T16:59:59Z')),'2026-09-30'); assert.equal(bangkokToday(new Date('2026-09-30T17:00:00Z')),'2026-10-01'); });
test('Money strings retain cents beyond JavaScript safe integer', () => { assert.equal(moneyText('9007199254740993.07'),'9,007,199,254,740,993.07'); assert.equal(moneyText('-0.08'),'-0.08'); assert.equal(moneyText('0.00'),'0.00'); });
test('Daily distinguishes a recorded zero side, missing day and future date', () => { const days=calendarDays('2024-02','2024-02-03',[{date:'2024-02-01',transactionCount:1,incomeAmount:'0.00',expenseAmount:'0.08'}]); assert.equal(days.length,29); assert.equal(days[0]!.state,'recorded'); assert.equal(days[0]!.row!.incomeAmount,'0.00'); assert.equal(days[1]!.state,'unrecorded'); assert.equal(days[3]!.state,'future'); assert.equal(days[1]!.row,undefined); });