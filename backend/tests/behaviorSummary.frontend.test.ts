import test from 'node:test';
import assert from 'node:assert/strict';
import { behaviorBanner, type BehaviorSummaryView } from '../../frontend/src/utils/behaviorSummary';

const view = (over: Partial<BehaviorSummaryView['readiness']['current']> = {}, status = 'ready'): BehaviorSummaryView => ({
  status,
  readiness: { current: { ready: true, expenseCount: 40, observedSpanDays: 30, ...over }, comparisonReady: true },
  findings: [],
  facts: {
    summary: { current: { amount: '1000.00', transactionCount: 40, averagePerTransaction: '25.00' }, comparison: { amount: { difference: '100.00' } } },
    categories: [{ categoryName: 'อาหาร', current: { transactionCount: 40, sharePercent: '100.00' } }],
    weekdayDistribution: [],
  },
});

test('banner summary states the comparison and top category from the API', () => {
  const b = behaviorBanner(view());
  assert.equal(b.title, 'ช่วงนี้ใช้จ่ายมากกว่าช่วงก่อน');
  assert.ok(b.text.includes('มากกว่าช่วงก่อน 100.00 บาท'));
  assert.ok(b.text.includes('ส่วนใหญ่ไปที่อาหาร'));
});
test('banner under the gate says how much more to record, never below zero', () => {
  assert.equal(behaviorBanner(view({ ready: false, expenseCount: 12, observedSpanDays: 40 })).text, 'บันทึกรายจ่ายอีก 18 รายการ และให้ครอบคลุมอีก 0 วัน');
  assert.equal(behaviorBanner(view({ ready: false, expenseCount: 0, observedSpanDays: 0 }, 'no_data')).text, 'ยังไม่มีรายจ่ายที่บันทึกในช่วงนี้');
});
