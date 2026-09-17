import test from 'node:test';
import assert from 'node:assert/strict';
import { getBangkokTodayKey, getTransactionDateLabel } from '../../frontend/src/utils/transactionStatus';
import { getPresetRange, validateRange } from '../../frontend/src/utils/overviewPeriod';

for (const timezone of ['UTC','America/Los_Angeles','Asia/Bangkok']) {
  test(`History date labels use Bangkok calendar when browser timezone is ${timezone}`, () => {
    const original=process.env.TZ;
    process.env.TZ=timezone;
    try {
      const now=new Date('2026-09-16T17:30:00Z');
      assert.equal(getBangkokTodayKey(now),'2026-09-17');
      assert.match(getTransactionDateLabel('2026-09-17',now),/^วันนี้ - 17/);
      assert.match(getTransactionDateLabel('2026-09-16',now),/^เมื่อวาน - 16/);
      assert.match(getTransactionDateLabel('2024-02-29',now),/^29/);
      assert.match(getTransactionDateLabel('2025-12-31',new Date('2025-12-31T17:00:00Z')),/^เมื่อวาน/);
      assert.match(getTransactionDateLabel('2024-02-29',new Date('2024-02-29T17:00:00Z')),/^เมื่อวาน/);
    } finally { if(original===undefined) delete process.env.TZ; else process.env.TZ=original; }
  });
}
test('Overview presets follow Bangkok month/year boundary and leap February', t => {
  t.mock.timers.enable({apis:['Date'],now:new Date('2024-02-29T17:00:00Z')});
  assert.deepEqual(getPresetRange('this_month'),{startDate:'2024-03-01',endDate:'2024-03-01'});
  assert.deepEqual(getPresetRange('last_month'),{startDate:'2024-02-01',endDate:'2024-02-29'});
  t.mock.timers.setTime(new Date('2023-12-31T17:00:00Z').getTime());
  assert.deepEqual(getPresetRange('this_year'),{startDate:'2024-01-01',endDate:'2024-01-01'});
  assert.deepEqual(getPresetRange('last_3_months'),{startDate:'2023-11-01',endDate:'2024-01-01'});
  assert.deepEqual(getPresetRange('last_6_months'),{startDate:'2023-08-01',endDate:'2024-01-01'});
});
test('Custom range validates real days and the shared 366-day Weekly limit', () => {
  assert.equal(validateRange({startDate:'2024-01-01',endDate:'2024-12-31'}),'');
  assert.notEqual(validateRange({startDate:'2023-02-29',endDate:'2023-03-01'}),'');
  assert.notEqual(validateRange({startDate:'2024-02-01',endDate:'2024-01-31'}),'');
  assert.notEqual(validateRange({startDate:'2023-12-31',endDate:'2024-12-31'}),'');
});
