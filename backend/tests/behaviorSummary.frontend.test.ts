import test from 'node:test';
import assert from 'node:assert/strict';
import { behaviorBanner, DECREASE_AMOUNT, DECREASE_SHARE, type BehaviorSummaryView } from '../../frontend/src/utils/behaviorSummary';
import { R9_MIN_DECREASE_AMOUNT, R9_MIN_DECREASE_SHARE } from '../src/lib/recommendation/config';

type V = BehaviorSummaryView;
const cat = (categoryName: string, amount: string, previous = amount) => ({ categoryName, current: { amount, transactionCount: 10, sharePercent: '50.00' }, previous: { amount: previous } });
const day = (weekday: number, avg: string) => ({ weekday, current: { amount: '100.00', averagePerCalendarOccurrence: avg } });
const view = (over: { categories?: V['facts']['categories']; days?: V['facts']['weekdayDistribution']; findings?: V['findings']; current?: Partial<V['readiness']['current']>; comparisonReady?: boolean; status?: string } = {}): V => ({
  status: over.status ?? 'ready',
  readiness: { current: { ready: true, expenseCount: 40, observedSpanDays: 30, ...over.current }, comparisonReady: over.comparisonReady ?? true },
  findings: over.findings ?? [],
  facts: {
    summary: { current: { amount: '1000.00', transactionCount: 40, averagePerTransaction: '25.00' }, comparison: { amount: { difference: '100.00' } } },
    categories: over.categories ?? [cat('อาหาร', '600.00'), cat('เดินทาง', '400.00')],
    weekdayDistribution: over.days ?? [day(5, '300.00'), day(1, '100.00')],
  },
});
const title = (o?: Parameters<typeof view>[0]) => behaviorBanner(view(o)).title;

test('decrease minimums are the ones R9 uses', () => {
  assert.equal(DECREASE_SHARE, Number(R9_MIN_DECREASE_SHARE));
  assert.equal(DECREASE_AMOUNT, Number(R9_MIN_DECREASE_AMOUNT));
});
test('normal: top category and the highest average weekday, as facts', () => {
  assert.equal(title(), 'ช่วงนี้ใช้จ่ายกับอาหารมากที่สุด เฉลี่ยสูงสุดวันศุกร์');
});
test('one category', () => {
  assert.equal(title({ categories: [cat('อาหาร', '600.00')] }), 'ช่วงนี้รายจ่ายทั้งหมดอยู่ในหมวดอาหาร เฉลี่ยสูงสุดวันศุกร์');
});
test('no weekday data, or several weekdays tied: the day is left out', () => {
  assert.equal(title({ days: [] }), 'ช่วงนี้ใช้จ่ายกับอาหารมากที่สุด');
  assert.equal(title({ days: [day(5, '300.00'), day(1, '300.00')] }), 'ช่วงนี้ใช้จ่ายกับอาหารมากที่สุด');
});
test('tied categories never name one as the most, in the title or the line', () => {
  const two = behaviorBanner(view({ categories: [cat('อาหาร', '500.00'), cat('เดินทาง', '500.00')] }));
  assert.equal(two.title, 'ช่วงนี้ใช้จ่ายกับอาหารและเดินทางเท่ากัน เฉลี่ยสูงสุดวันศุกร์');
  assert.ok(!two.text.includes('ส่วนใหญ่ไปที่'));
  assert.equal(title({ categories: [cat('ก', '300.00'), cat('ข', '300.00'), cat('ค', '300.00')] }), 'ช่วงนี้มีหลายหมวดที่ใช้จ่ายเท่ากัน เฉลี่ยสูงสุดวันศุกร์');
});
test('clear increase comes first', () => {
  const findings = [{ ruleId: 'category_frequency_up', categoryName: 'อาหาร', evidence: { current: { amount: '1', transactionCount: 2, averagePerTransaction: '1.00' }, previous: { amount: '1', transactionCount: 1, averagePerTransaction: '1.00' } } }];
  assert.equal(title({ findings, categories: [cat('อาหาร', '600.00'), cat('เดินทาง', '100.00', '900.00')] }), 'ช่วงนี้ใช้จ่ายมากขึ้น ส่วนใหญ่มาจากอาหารที่ซื้อบ่อยขึ้น');
  assert.equal(title({ findings: findings.map((f) => ({ ...f, ruleId: 'category_both_up' })), categories: [cat('อาหาร', '600.00')] }), 'ช่วงนี้ใช้จ่ายมากขึ้น ส่วนใหญ่มาจากอาหารที่บ่อยขึ้นและแพงขึ้น');
});
test('clear decrease uses R9 test, strict at both limits, largest fall named', () => {
  assert.equal(title({ categories: [cat('อาหาร', '600.00', '800.00'), cat('เดินทาง', '100.00', '900.00')] }), 'ช่วงนี้ใช้จ่ายกับเดินทางลดลง');
  assert.equal(title({ categories: [cat('อาหาร', '900.00', '1000.00')] }), 'ช่วงนี้รายจ่ายทั้งหมดอยู่ในหมวดอาหาร เฉลี่ยสูงสุดวันศุกร์'); // exactly 100 baht is not more than 100
  assert.equal(title({ comparisonReady: false, categories: [cat('เดินทาง', '100.00', '900.00')] }), 'ช่วงนี้รายจ่ายทั้งหมดอยู่ในหมวดเดินทาง เฉลี่ยสูงสุดวันศุกร์');
});
test('cannot compare: the title stays a summary and the note says so', () => {
  const b = behaviorBanner(view({ comparisonReady: false }));
  assert.equal(b.title, 'ช่วงนี้ใช้จ่ายกับอาหารมากที่สุด เฉลี่ยสูงสุดวันศุกร์');
  assert.equal(b.note, 'ยังเทียบช่วงก่อนไม่ได้');
  assert.equal(behaviorBanner(view()).note, null);
});
test('comparison line keeps the exact difference', () => {
  assert.ok(behaviorBanner(view()).text.includes('มากกว่าช่วงก่อน 100.00 บาท'));
});
test('too little data says how much more to record', () => {
  assert.equal(title({ current: { ready: false, expenseCount: 12, observedSpanDays: 10 } }), 'ยังสรุปไม่ได้ บันทึกอีก 18 รายการ ให้ครอบคลุมอีก 20 วัน');
  assert.equal(title({ current: { ready: false, expenseCount: 12, observedSpanDays: 40 } }), 'ยังสรุปไม่ได้ บันทึกอีก 18 รายการ');
  assert.equal(title({ current: { ready: false, expenseCount: 40, observedSpanDays: 10 } }), 'ยังสรุปไม่ได้ ให้ครอบคลุมอีก 20 วัน');
});
test('no expenses has its own message', () => {
  assert.equal(title({ status: 'no_data', current: { ready: false, expenseCount: 0, observedSpanDays: 0 } }), 'ยังไม่มีรายจ่ายที่บันทึกในช่วงนี้');
});
