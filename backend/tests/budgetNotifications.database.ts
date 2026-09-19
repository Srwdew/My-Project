// Real PostgreSQL verification. All test writes are rolled back; no user data is deleted.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { checkBudgetMonth } from '../src/lib/budgetNotifications';
const rollback = new Error('EXPECTED_TEST_ROLLBACK');
let stage = 'connect and begin transaction';
async function main() {
  try {
    await prisma.$transaction(async tx => {
      stage = 'create rollback-only fixtures';
      const a = await tx.user.create({ data: { email: `notification-test-${randomUUID()}@example.invalid`, passwordHash: 'non-login-test-account' } });
      const b = await tx.user.create({ data: { email: `notification-test-${randomUUID()}@example.invalid`, passwordHash: 'non-login-test-account' } });
      const category = await tx.category.create({ data: { name: `notification-test-${randomUUID()}`, type: 'expense' } });
      stage = 'settings round-trip';
      const values = { enabled: true, notifyNearLimit: true, warningPercent: 80, notifyExceeded: true, totalBudget: true, categoryBudgets: true };
      await tx.budgetNotificationSetting.upsert({ where: { userId: a.id }, create: { userId: a.id, ...values }, update: values });
      const saved = await tx.budgetNotificationSetting.findUnique({ where: { userId: a.id }, select: { enabled: true, notifyNearLimit: true, warningPercent: true, notifyExceeded: true, totalBudget: true, categoryBudgets: true } });
      assert.deepEqual(saved, values);
      stage = 'create budget and expense';
      await tx.budget.create({ data: { userId: a.id, year: 2020, month: 9, amount: '100.00' } });
      const expense = await tx.transaction.create({ data: { userId: a.id, categoryId: category.id, type: 'expense', amount: '80.00', transactionDate: new Date('2020-09-01T00:00:00Z') } });
      stage = 'producer and boundaries';
      await checkBudgetMonth(tx, a.id, { year: 2020, month: 9 });
      stage = 'producer and boundaries';
      await checkBudgetMonth(tx, a.id, { year: 2020, month: 9 });
      assert.equal(await tx.notification.count({ where: { userId: a.id } }), 1);
      await tx.transaction.update({ where: { id: expense.id }, data: { amount: '100.00' } });
      stage = 'producer and boundaries';
      await checkBudgetMonth(tx, a.id, { year: 2020, month: 9 });
      assert.equal(await tx.notification.count({ where: { userId: a.id } }), 1);
      await tx.transaction.update({ where: { id: expense.id }, data: { amount: '100.01' } });
      stage = 'producer and boundaries';
      await checkBudgetMonth(tx, a.id, { year: 2020, month: 9 });
      assert.equal(await tx.notification.count({ where: { userId: a.id } }), 2);
      assert.equal(await tx.notification.count({ where: { userId: b.id } }), 0);
      stage = 'read isolation and timestamps';
      const notice = await tx.notification.findFirstOrThrow({ where: { userId: a.id } });
      const foreignRead = await tx.notification.updateMany({ where: { id: notice.id, userId: b.id, readAt: null }, data: { readAt: new Date() } });
      assert.equal(foreignRead.count, 0);
      const readAt = new Date();
      await tx.notification.updateMany({ where: { userId: a.id, readAt: null }, data: { readAt } });
      assert.equal(await tx.notification.count({ where: { userId: a.id, readAt: null } }), 0);
      await tx.notification.updateMany({ where: { id: notice.id, userId: a.id, readAt: null }, data: { readAt: new Date(readAt.getTime() + 1000) } });
      assert.equal((await tx.notification.findUniqueOrThrow({ where: { id: notice.id } })).readAt?.getTime(), readAt.getTime());
      throw rollback;
    }, { timeout: 20000, maxWait: 3000 });
  } catch (error) {
    if (error !== rollback) throw error;
    console.log('PASS: real DB settings round-trip, producer, deduplication, boundaries, isolation/read timestamps; all writes rolled back.');
  }
}
function signal() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
async function concurrency() {
  stage = 'concurrent PostgreSQL advisory lock and unique index';
  const user = await prisma.user.findFirst({ where: { deletedAt: null }, select: { id: true } });
  if (!user) {
    console.log('SKIP concurrency: no existing active account. No persistent test account created.');
    return;
  }
  for (const mode of ['advisory-lock', 'unique-index'] as const) {
    const ready = signal();
    const release = signal();
    const secondStarted = signal();
    let secondFinished = false;
    const key = `rollback-concurrency-test:${randomUUID()}`;
    const data = { userId: user.id, eventKey: key, type: 'budget_near_limit' as const,
      title: 'Rollback-only test', message: 'Never committed' };
    const ignoreRollback = (error: unknown) => { if (error !== rollback) throw error; };
    const first = prisma.$transaction(async tx => {
      if (mode === 'advisory-lock') {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;
      } else {
        assert.equal((await tx.notification.createMany({ data: [data], skipDuplicates: true })).count, 1);
        assert.equal((await tx.notification.createMany({ data: [data], skipDuplicates: true })).count, 0);
      }
      ready.resolve();
      await release.promise;
      throw rollback;
    }, { timeout: 10000, maxWait: 3000 }).catch(ignoreRollback);
    let second: Promise<void> | undefined;
    try {
      await Promise.race([ready.promise, first.then(() => { throw new Error('first transaction ended before ready'); })]);
      second = prisma.$transaction(async tx => {
        secondStarted.resolve();
        if (mode === 'advisory-lock') {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${user.id}, 0))`;
        } else {
          assert.equal((await tx.notification.createMany({ data: [data], skipDuplicates: true })).count, 1);
        }
        secondFinished = true;
        throw rollback;
      }, { timeout: 10000, maxWait: 3000 }).catch(ignoreRollback);
      await Promise.race([secondStarted.promise, second.then(() => { throw new Error('second ended before starting'); })]);
      await new Promise(resolve => setTimeout(resolve, 200));
      assert.equal(secondFinished, false, `${mode} must block the concurrent transaction`);
      release.resolve();
      await Promise.all([first, second]);
      assert.equal(secondFinished, true);
      assert.equal(await prisma.notification.count({ where: { userId: user.id, eventKey: key } }), 0);
    } finally {
      release.resolve();
      await Promise.allSettled([first, ...(second ? [second] : [])]);
    }
  }
  console.log('PASS: concurrent PostgreSQL advisory lock and unique-index contention; every test write rolled back (no two-commit simulation).');
}
main().then(concurrency).catch((error: unknown) => {
  const code = (error as { code?: unknown })?.code;
  console.error('Failed stage:', stage, 'code:', typeof code === 'string' && /^[A-Z0-9_]+$/.test(code) ? code : 'unclassified');
  console.error('DB verification failed or database unavailable. No credentials printed. Check PostgreSQL/Docker and rerun.');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
