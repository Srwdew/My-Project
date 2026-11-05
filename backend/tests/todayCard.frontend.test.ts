import test from 'node:test';
import assert from 'node:assert/strict';
import { missingText, todayCard, unlockHeading, unlockRows, type Pace } from '../../frontend/src/utils/todayCard';
import { BEHAVIOR_RULE } from '../src/lib/behaviorRules';
import { progressWithToday } from '../src/lib/unlockProgress';

const pace = (o: Partial<Pace> = {}): Pace => ({ daysLeft: 12, spent: '8000.00', cycleBudget: '20000.00', budgetLeft: '5040.00', overBudget: '0.00', perDay: '420', paceGap: '-10.00', ...o });
const card = (o: Partial<Pace> = {}, today = '50.00', count = 40) => todayCard({ pace: pace(o), recordedExpenseToday: today, paceNoticeMinimum: BEHAVIOR_RULE.minimumIncreaseAmount, forecastReadiness: { transactionCount: count } });

test('normal', () => {
  const c = card();
  assert.equal(c.status, 'ตามงบ');
  assert.equal(c.text, 'งบที่เหลือใช้ได้เฉลี่ยวันละ 420 บาท อีก 12 วัน');
  assert.equal(c.to, '/budget');
});
test('faster than plan names the gap', () => {
  assert.equal(card({ paceGap: '1250.00', perDay: '320' }).text, 'เร็วกว่าแผน 1,250 บาท งบที่เหลือใช้ได้เฉลี่ยวันละ 320 บาท อีก 12 วัน');
});
test('faster than plan needs more than 100 baht', () => {
  assert.equal(card({ paceGap: '100.00' }).status, 'ตามงบ');
  assert.equal(card({ paceGap: '100.01' }).status, 'ใช้เร็วกว่าแผน');
});
test('nothing recorded today leads to adding it', () => {
  const c = card({}, '0.00');
  assert.equal(c.action, 'บันทึกรายจ่ายวันนี้');
  assert.equal(c.to, '/transactions/add');
});
test('over budget beats nothing recorded today', () => {
  assert.equal(card({ overBudget: '1250.00', budgetLeft: '0.00', perDay: null }, '0.00').text, 'ใช้เกินงบรอบนี้ 1,250 บาท อีก 12 วันจะเริ่มรอบใหม่');
});
test('no budget', () => {
  const c = card({ cycleBudget: null, budgetLeft: null, overBudget: null, perDay: null, paceGap: null, spent: '8420.00' });
  assert.equal(c.action, 'ตั้งงบ');
  assert.ok(c.text.includes('8,420 บาท'));
});
test('under one baht a day never says per day', () => {
  const c = card({ budgetLeft: '12.00', perDay: null, daysLeft: 20 });
  assert.equal(c.text, 'งบเหลือ 12 บาท อีก 20 วัน');
  assert.equal(card({ budgetLeft: '0.00', perDay: null }).text, 'ใช้งบครบพอดี อีก 12 วันจะเริ่มรอบใหม่');
});
test('new account comes first, even without a budget', () => {
  const c = card({ cycleBudget: null, spent: '0.00' }, '0.00', 0);
  assert.equal(c.action, 'บันทึกรายจ่ายรายการแรก');
  assert.equal(c.recordedNote, false);
});
test('first expense today is not a new account', () => {
  assert.notEqual(card({ cycleBudget: null, spent: '50.00' }, '50.00', 0).status, 'เริ่มต้น');
});

const gate = (count: number, days: number, ready = false) => ({ ready, count, days, moreCount: Math.max(0, 30 - count), moreDays: Math.max(0, 30 - days) });
test('same numbers merge into one row and use the less complete side', () => {
  const r = unlockRows(gate(12, 10), gate(12, 10));
  assert.equal(r.length, 1);
  assert.equal(r[0]!.percent, 33);
  assert.equal(r[0]!.text, 'ขาดอีก 18 รายการ และอีก 20 วัน');
});
test('different numbers split', () => {
  const r = unlockRows(gate(18, 40), gate(30, 40, true));
  assert.deepEqual(r.map((x) => x.ready), [true, false]);
  assert.equal(r[1]!.text, 'ขาดอีก 12 รายการ');
});
test('heading follows the row furthest from done, at each stage edge', () => {
  const at = (percent: number) => unlockHeading([{ name: 'ก', ready: false, percent, text: '' }]);
  assert.equal(at(0), 'เริ่มบันทึกเพื่อให้ระบบวิเคราะห์ได้');
  assert.equal(at(1), 'เริ่มสะสมข้อมูลแล้ว');
  assert.equal(at(49), 'เริ่มสะสมข้อมูลแล้ว');
  assert.equal(at(50), 'ผ่านครึ่งทางแล้ว');
  assert.equal(at(89), 'ผ่านครึ่งทางแล้ว');
  assert.equal(at(90), 'ใกล้ครบแล้ว');
  assert.equal(unlockHeading([{ name: 'ก', ready: true, percent: 100, text: '' }, { name: 'ข', ready: false, percent: 10, text: '' }]), 'เริ่มสะสมข้อมูลแล้ว');
});
test('missing text leaves out what is already met', () => {
  assert.equal(missingText(0, 20), 'ขาดอีก 20 วัน');
  assert.equal(missingText(3, 0), 'ขาดอีก 3 รายการ');
});
test('today fills the display but the real gate is closed: no date promised, never 100%', () => {
  const full = { ready: false, count: 30, days: 30, moreCount: 0, moreDays: 0 };
  const [row] = unlockRows(full, full);
  assert.equal(row!.text, 'ครบตามจำนวนแล้ว ระบบจะเริ่มวิเคราะห์เมื่อข้อมูลพร้อม');
  assert.equal(row!.percent, 99);
  assert.equal(row!.ready, false);
  assert.equal(unlockHeading([row!]), 'ครบแล้ว');
  assert.equal(unlockHeading([row!, { name: 'ข', ready: false, percent: 95, text: 'ขาดอีก 1 รายการ' }]), 'ใกล้ครบแล้ว');
});
test('display adds today without touching the real count', () => {
  const g = { minCount: 30, minSpan: 30 };
  assert.deepEqual(progressWithToday({ ...g, count: 0, span: 0, firstDate: null }, 1, '2026-11-05'), { expenseCount: 1, observedSpanDays: 1, moreExpensesNeeded: 29, moreDaysNeeded: 29 });
  assert.deepEqual(progressWithToday({ ...g, count: 2, span: 2, firstDate: '2026-11-01' }, 1, '2026-11-05'), { expenseCount: 3, observedSpanDays: 5, moreExpensesNeeded: 27, moreDaysNeeded: 25 });
  assert.deepEqual(progressWithToday({ ...g, count: 2, span: 2, firstDate: '2026-11-01' }, 0, '2026-11-05'), { expenseCount: 2, observedSpanDays: 2, moreExpensesNeeded: 28, moreDaysNeeded: 28 });
});
test('bar is not full until the gate opens', () => {
  assert.ok(unlockRows(gate(29, 40), gate(40, 40, true))[1]!.percent < 100);
});
test('forecast open means a returning account: nothing on Overview', () => {
  assert.deepEqual(unlockRows(gate(40, 40, true), gate(3, 5)), []);
});
