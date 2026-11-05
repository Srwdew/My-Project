import test from 'node:test';
import assert from 'node:assert/strict';
import { mondayRange, mondaySummary } from '../../frontend/src/utils/mondaySummary';

const MONDAY = '2026-11-02';
const week = (startDate: string, totalExpense: number, transactionCount: number, categories: [string, number][] = []) => ({
  weekNumber: 1, startDate, endDate: startDate, totalExpense, transactionCount,
  categories: categories.map(([name, amount]) => ({ categoryId: name, name, amount, transactionCount: 1 })),
});
const LAST = '2026-10-26', PREV = '2026-10-19';

test('only Mondays ask for data: the two closed weeks before today', () => {
  assert.deepEqual(mondayRange(MONDAY), { startDate: PREV, endDate: '2026-11-01' });
  assert.equal(mondayRange('2026-11-05'), null);
});
test('facts with a comparison and the top category', () => {
  const s = mondaySummary({ weeks: [week(PREV, 2850, 10), week(LAST, 3250, 18, [['เดินทาง', 700], ['อาหาร', 1600]])] }, MONDAY)!;
  assert.equal(s.total, 'ใช้ไป 3,250 บาท จาก 18 รายการ');
  assert.equal(s.comparison, 'มากกว่าสัปดาห์ก่อน 400 บาท');
  assert.equal(s.top, 'ใช้กับอาหารมากที่สุด 1,600 บาท');
});
test('less and equal are stated plainly', () => {
  assert.equal(mondaySummary({ weeks: [week(PREV, 500, 2), week(LAST, 300.5, 1)] }, MONDAY)!.comparison, 'น้อยกว่าสัปดาห์ก่อน 199.5 บาท');
  assert.equal(mondaySummary({ weeks: [week(PREV, 300, 2), week(LAST, 300, 1)] }, MONDAY)!.comparison, 'เท่ากับสัปดาห์ก่อน');
});
test('an empty previous week is not a zero to compare with', () => {
  assert.equal(mondaySummary({ weeks: [week(PREV, 0, 0), week(LAST, 300, 1)] }, MONDAY)!.comparison, null);
  assert.equal(mondaySummary({ weeks: [week(LAST, 300, 1)] }, MONDAY)!.comparison, null);
});
test('no entries last week: no card', () => {
  assert.equal(mondaySummary({ weeks: [week(PREV, 500, 2), week(LAST, 0, 0)] }, MONDAY), null);
  assert.equal(mondaySummary({ weeks: [] }, MONDAY), null);
});
test('tied categories name none', () => {
  assert.equal(mondaySummary({ weeks: [week(LAST, 200, 2, [['ก', 100], ['ข', 100]])] }, MONDAY)!.top, null);
  assert.equal(mondaySummary({ weeks: [week(LAST, 100, 1, [['ก', 100]])] }, MONDAY)!.top, 'ใช้กับกมากที่สุด 100 บาท');
});
