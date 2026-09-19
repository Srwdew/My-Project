// Real HTTP routing/auth/validation with an in-memory Prisma double, NOT a real DB test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';

test('HTTP settings, CRUD hooks, notification ownership, read timestamps and latest 30', async t => {
  const originals: (() => void)[] = [];
  function mock(object: any, name: string, value: any) {
    const original = object[name]; object[name] = value;
    originals.push(() => { object[name] = original; });
  }
  const secret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  const tokens = Object.fromEntries(['a', 'b'].map(userId => [userId, jwt.sign({ userId, email: `${userId}@example.invalid` }, process.env.JWT_SECRET!)]));
  const settings = new Map<string, any>();
  const defaults = { enabled: false, warningPercent: 80, notifyNearLimit: false, notifyExceeded: false, totalBudget: true, categoryBudgets: true };
  const notices = Array.from({ length: 42 }, (_, i) => ({ id: `a-${i}`, userId: 'a', readAt: null as Date | null, createdAt: new Date(2020, 0, i + 1) }));
  notices.push({ id: 'b-1', userId: 'b', readAt: null, createdAt: new Date() });
  const transactions: any[] = [];
  const checked: string[] = [];
  let failCheck = false;
  const errors = console.error;
  mock(prisma.user, 'findFirst', async ({ where }: any) => ({ id: where.id, email: `${where.id}@example.invalid` }));
  mock(prisma.category, 'findFirst', async () => ({ id: 'food', type: 'expense' }));
  mock(prisma.category, 'findUnique', async () => ({ id: 'food', type: 'expense' }));
  mock(prisma.budgetNotificationSetting, 'findUnique', async ({ where }: any) => settings.get(where.userId) ?? null);
  mock(prisma.budgetNotificationSetting, 'upsert', async ({ where, update }: any) => { settings.set(where.userId, update); return update; });
  mock(prisma.budget, 'findUnique', async ({ where }: any) => { const p = where.userId_year_month; checked.push(`${p.userId}:${p.year}-${p.month}`); return null; });
  mock(prisma.categoryBudget, 'findMany', async () => []);
  mock(prisma.budget, 'findMany', async () => [{ year: 2020, month: 3 }, { year: 2020, month: 9 }]);
  mock(prisma.budget, 'upsert', async ({ create }: any) => ({ id: 'budget', ...create }));
  mock(prisma.categoryBudget, 'upsert', async ({ create }: any) => ({ id: 'category-budget', ...create, amount: { toNumber: () => Number(create.amount) } }));
  mock(prisma.categoryBudget, 'deleteMany', async () => ({ count: 1 }));
  mock(prisma.transaction, 'groupBy', async () => []);
  mock(prisma, '$executeRaw', async () => {});
  mock(prisma, '$queryRaw', async () => [{id:'test-user-lock'}]);
  mock(prisma.goalFundingSource, 'findFirst', async () => null);
  mock(prisma, '$transaction', async (argument: any, options?: any) => {
    if (Array.isArray(argument)) return Promise.all(argument);
    if (failCheck && options?.timeout !== 20000) throw new Error('simulated producer failure');
    return argument(prisma);
  });
  mock(prisma.transaction, 'create', async ({ data }: any) => { const row = { id: randomUUID(), ...data }; transactions.push(row); return row; });
  mock(prisma.transaction, 'findFirst', async ({ where }: any) => transactions.find(row => row.id === where.id && row.userId === where.userId) ?? null);
  mock(prisma.transaction, 'update', async ({ where, data }: any) => { const i = transactions.findIndex(row => row.id === where.id); transactions[i] = { ...transactions[i], ...data }; return transactions[i]; });
  mock(prisma.transaction, 'delete', async ({ where }: any) => { const i = transactions.findIndex(row => row.id === where.id); return transactions.splice(i, 1)[0]; });
  const matches = (row: any, where: any) => Object.entries(where).every(([key, value]) => row[key] === value);
  mock(prisma.notification, 'findMany', async ({ where, take }: any) => notices.filter(n => matches(n, where)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, take));
  mock(prisma.notification, 'count', async ({ where }: any) => notices.filter(n => matches(n, where)).length);
  mock(prisma.notification, 'findFirst', async ({ where }: any) => notices.find(n => matches(n, where)) ?? null);
  mock(prisma.notification, 'updateMany', async ({ where, data }: any) => { const rows = notices.filter(n => matches(n, where)); rows.forEach(n => Object.assign(n, data)); return { count: rows.length }; });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  async function request(path: string, method = 'GET', body?: unknown, user = 'a') {
    return fetch(`http://127.0.0.1:${address.port}${path}`, { method,
      headers: { Authorization: `Bearer ${tokens[user]}`, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  }
  try {
    await t.test('settings default, validation, round-trip, userId cannot be spoofed', async () => {
      assert.deepEqual(await (await request('/notification-settings/budget')).json(), defaults);
      assert.equal((await request('/notification-settings/budget', 'PUT', { ...defaults, warningPercent: 80.5 })).status, 400);
      assert.equal((await request('/notification-settings/budget', 'PUT', { ...defaults, enabled: 'true' })).status, 400);
      assert.equal((await request('/notification-settings/budget', 'PUT', { ...defaults, enabled: true, totalBudget: false, categoryBudgets: false })).status, 400);
      const values = { ...defaults, enabled: true, notifyNearLimit: true, notifyExceeded: true, warningPercent: 90 };
      assert.equal((await request('/notification-settings/budget', 'PUT', { ...values, userId: 'b' })).status, 200);
      assert.deepEqual(await (await request('/notification-settings/budget')).json(), values);
      assert.deepEqual(await (await request('/notification-settings/budget', 'GET', undefined, 'b')).json(), defaults);
      assert.equal(checked.length, 1); // Settings immediately checks Bangkok current month.
    });
    await t.test('transaction create/move/delete checks affected months and rejects future dates', async () => {
      checked.length = 0;
      const body = { categoryId: 'food', type: 'expense', amount: '80.00', transactionDate: '2020-03-01' };
      const created = await request('/transactions', 'POST', body);
      assert.equal(created.status, 201);
      const row = await created.json() as any;
      assert.deepEqual(checked, ['a:2020-3']);
      checked.length = 0;
      assert.equal((await request(`/transactions/${row.id}`, 'PUT', { ...body, transactionDate: '2020-09-01' })).status, 200);
      assert.deepEqual(checked, ['a:2020-3', 'a:2020-9']);
      assert.equal((await request(`/transactions/${row.id}`, 'PUT', { ...body, transactionDate: '9999-01-01' })).status, 400);
      assert.equal((await request('/transactions', 'POST', { ...body, transactionDate: '9999-01-01' })).status, 400);
      checked.length = 0;
      assert.equal((await request(`/transactions/${row.id}`, 'DELETE')).status, 200);
      assert.deepEqual(checked, ['a:2020-9']);
    });
    await t.test('total/category budget writes and cancellation check target month', async () => {
      checked.length = 0;
      const body = { year: 2020, month: 9, amount: '100.00' };
      assert.equal((await request('/budget', 'PUT', body)).status, 200);
      assert.equal((await request('/budget/categories/food', 'PUT', body)).status, 200);
      assert.equal((await request('/budget/categories/food?year=2020&month=9', 'DELETE')).status, 200);
      assert.deepEqual(checked, ['a:2020-9', 'a:2020-9', 'a:2020-9']);
    });
    await t.test('reconcile retries retained historical months and reports failure separately', async () => {
      checked.length = 0;
      assert.equal((await request('/notifications/reconcile', 'POST')).status, 200);
      assert.ok(checked.includes('a:2020-3'));
      assert.ok(checked.includes('a:2020-9'));
      failCheck = true; console.error = () => {};
      assert.equal((await request('/notifications/reconcile', 'POST')).status, 503);
      failCheck = false; console.error = errors;
      assert.equal((await request('/notifications/reconcile', 'POST')).status, 200);
    });
    await t.test('committed transaction returns success when producer fails', async () => {
      failCheck = true; console.error = () => {};
      const response = await request('/transactions', 'POST', { categoryId: 'food', type: 'expense', amount: '80', transactionDate: '2020-09-01' });
      assert.equal(response.status, 201);
      assert.equal(transactions.length, 1);
      failCheck = false; console.error = errors;
    });
    await t.test('latest 30, full unread count, ownership and first-read timestamp', async () => {
      const result = await (await request('/notifications')).json() as any;
      assert.equal(result.items.length, 30);
      assert.equal(result.unreadCount, 42);
      assert.ok(result.items.every((n: any) => n.userId === 'a'));
      assert.equal((await request('/notifications/b-1/read', 'PATCH')).status, 404);
      assert.equal((await request('/notifications/a-0/read', 'PATCH')).status, 200);
      const first = notices[0]!.readAt;
      assert.ok(first);
      assert.equal((await request('/notifications/a-0/read', 'PATCH')).status, 200);
      assert.equal(notices[0]!.readAt, first);
      assert.equal((await (await request('/notifications')).json() as any).unreadCount, 41);
      assert.equal((await request('/notifications/read-all', 'PATCH')).status, 200);
      assert.equal((await (await request('/notifications')).json() as any).unreadCount, 0);
      assert.equal((await (await request('/notifications', 'GET', undefined, 'b')).json() as any).unreadCount, 1);
    });
  } finally {
    originals.reverse().forEach(restore => restore());
    console.error = errors;
    if (secret === undefined) delete process.env.JWT_SECRET; else process.env.JWT_SECRET = secret;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await prisma.$disconnect();
  }
});
