import test from 'node:test';
import assert from 'node:assert/strict';
import { todayCard, type Pace } from '../../frontend/src/utils/todayCard';

const pace = (o: Partial<Pace> = {}): Pace => ({ daysLeft: 12, spent: '8000.00', cycleBudget: '20000.00', budgetLeft: '5040.00', overBudget: '0.00', perDay: '420', paceGap: '-10.00', ...o });
const card = (o: Partial<Pace> = {}, today = '50.00', count = 40) => todayCard({ pace: pace(o), recordedExpenseToday: today, forecastReadiness: { transactionCount: count } });

test('normal', () => {
  const c = card();
  assert.equal(c.status, 'ตามงบ');
  assert.equal(c.text, 'งบที่เหลือใช้ได้เฉลี่ยวันละ 420 บาท อีก 12 วัน');
  assert.equal(c.to, '/budget');
});
test('faster than plan names the gap', () => {
  assert.equal(card({ paceGap: '1250.00', perDay: '320' }).text, 'เร็วกว่าแผน 1,250 บาท งบที่เหลือใช้ได้เฉลี่ยวันละ 320 บาท อีก 12 วัน');
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
