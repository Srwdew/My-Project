import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { loadAlerts } from '../src/lib/alerts';
import { addDays } from '../src/lib/cycle';
import { bangkokToday } from '../src/lib/goalCalculations';

const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db) throw Error('ISOLATED_ALERTS_DATABASE_REQUIRED');

test('Alerts on real PostgreSQL and HTTP', async t => {
  process.env.JWT_SECRET = randomUUID();
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(r => server.once('listening', r));
  const addr = server.address();
  assert.ok(addr && typeof addr !== 'string');
  t.after(async () => { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); });
  const user = () => prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'synthetic-no-login' } });
  const [a, b] = [await user(), await user()];
  const token = (u: { id: string; email: string }) => jwt.sign({ userId: u.id, email: u.email }, process.env.JWT_SECRET!);
  const get = async (path: string, who = a) => { const r = await fetch('http://127.0.0.1:' + addr.port + path, { headers: { Authorization: 'Bearer ' + token(who) } }); return { status: r.status, body: await r.json() as any, cache: r.headers.get('cache-control') }; };
  const today = bangkokToday();
  const cat = await prisma.category.create({ data: { name: randomUUID(), type: 'expense' } });
  const at = (d: string) => new Date(d + 'T00:00:00Z');

  await t.test('auth, no query accepted, empty account has no cards', async () => {
    assert.equal((await fetch('http://127.0.0.1:' + addr.port + '/alerts')).status, 401);
    assert.equal((await get('/alerts?userId=' + b.id)).status, 400);
    const r = await get('/alerts');
    assert.equal(r.status, 200);
    assert.equal(r.cache, 'private, no-store');
    assert.deepEqual(r.body.cards, []);
    assert.deepEqual(r.body.gates, { forecast: false, anomaly: false, budget: false });
  });

  await prisma.transaction.createMany({ data: Array.from({ length: 40 }, (_, i) => ({ userId: a.id, categoryId: cat.id, type: 'expense' as const, amount: '100.00', transactionDate: at(addDays(today, i - 40)) })) });
  const flagged = await prisma.transaction.create({ data: { userId: a.id, categoryId: cat.id, type: 'expense', amount: '777.00', transactionDate: at(today) } });
  const other = await prisma.transaction.create({ data: { userId: b.id, categoryId: cat.id, type: 'expense', amount: '888.00', transactionDate: at(today) } });
  const flag = (userId: string, id: string) => prisma.anomalyEvaluation.create({ data: { userId, originalTransactionId: id, revision: 0, ruleVersion: 'test', outcome: 'flagged', snapshot: { assessment: { level: 'review_priority', amount: { status: 'flagged' }, time: { status: 'not_flagged' } } } } });
  await flag(a.id, flagged.id);
  await flag(b.id, other.id);

  await t.test('gates open, own flagged item only, no forecast number in the response', async () => {
    const { body } = await get('/alerts');
    assert.equal(body.gates.forecast, true);
    assert.equal(body.gates.anomaly, true);
    const tier4 = body.cards.filter((c: any) => c.tier === 4);
    assert.deepEqual(tier4.map((c: any) => c.id), [flagged.id]);
    assert.equal(tier4[0].categoryName, cat.name);
    assert.equal(body.flaggedTotal, 1);
    assert.ok(!('summary' in body));
  });
  await t.test('a decided item leaves the list', async () => {
    const evaluation = await prisma.anomalyEvaluation.findFirstOrThrow({ where: { userId: a.id, originalTransactionId: flagged.id } });
    await prisma.anomalyDecision.create({ data: { userId: a.id, evaluationId: evaluation.id, originalTransactionId: flagged.id, revision: 0, dimension: 'amount', action: 'occasional', sequence: 1 } });
    const out = await prisma.$transaction(tx => loadAlerts(tx, a.id, today));
    assert.equal(out.flaggedTotal, 0);
  });
  await t.test('reading writes nothing', async () => {
    const before = await prisma.transaction.count();
    await get('/alerts');
    assert.equal(await prisma.transaction.count(), before);
  });
});
