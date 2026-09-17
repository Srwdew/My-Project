import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';
import { prisma } from '../src/lib/prisma';
import { app } from '../src/index';
import { D } from '../src/lib/goalCalculations';
const dbName = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!dbName.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== dbName)
    throw new Error('Refusing Goals fixtures outside an explicitly isolated test database');
test('Goals real HTTP / PostgreSQL / committed concurrency', async (t) => {
    process.env.JWT_SECRET = randomUUID();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    t.after(async () => { await new Promise<void>((r, j) => server.close(e => e ? j(e) : r())); await prisma.$disconnect(); });
    const category = await prisma.category.create({ data: { name: 'goals-income-' + randomUUID(), type: 'income' } }), expenseCategory = await prisma.category.create({ data: { name: 'goals-expense-' + randomUUID(), type: 'expense' } });
    const account = async () => { const u = await prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'isolated-goals-test' } }); return { ...u, token: jwt.sign({ userId: u.id, email: u.email }, process.env.JWT_SECRET!) }; };
    const a = await account(), b = await account();
    async function req(path: string, method = 'GET', body?: unknown, status = 200, who = a, key = randomUUID()) {
        const r = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: 'Bearer ' + who.token, 'Content-Type': 'application/json', 'Idempotency-Key': key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
        const data = await r.json() as any;
        assert.equal(r.status, status, method + ' ' + path + ' ' + JSON.stringify(data));
        return data;
    }
    const createGoal = (who = a, name = 'เป้าหมายทดสอบ') => req('/goals', 'POST', { name, targetAmount: '100.00', categoryKey: 'home', targetDate: '2026-12-31' }, 201, who);
    const income = await prisma.transaction.create({ data: { userId: a.id, categoryId: category.id, type: 'income', amount: '100', transactionDate: new Date('2026-09-02T00:00:00Z'), description: 'original income' } });
    await prisma.transaction.create({ data: { userId: a.id, categoryId: expenseCategory.id, type: 'expense', amount: '20', transactionDate: new Date('2026-09-02T00:00:00Z') } });
    const foreignIncome = await prisma.transaction.create({ data: { userId: b.id, categoryId: category.id, type: 'income', amount: '100', transactionDate: new Date('2026-09-02T00:00:00Z') } });
    let goal: any, opening: any, lotIncome: any;
    await t.test('CREATE Goal retry, concurrent retry and key mismatch', async () => {
        const key = randomUUID(), body = { name: 'Retry Goal', targetAmount: '100.00', categoryKey: 'home' };
        const responses = await Promise.all([req('/goals', 'POST', body, 201, a, key), req('/goals', 'POST', body, 201, a, key)]);
        assert.deepEqual(responses[0], responses[1]);
        goal = responses[0];
        assert.equal(await prisma.goal.count({ where: { userId: a.id, name: 'Retry Goal' } }), 1);
        await req('/goals', 'POST', { ...body, name: 'different' }, 409, a, key);
    });
    await t.test('auth, validation and cross-account Goal access', async () => {
        const unauth = await fetch(`http://127.0.0.1:${address.port}/goals`);
        assert.equal(unauth.status, 401);
        await req('/goals', 'POST', { name: 'bad', targetAmount: 10, categoryKey: 'home' }, 400);
        await req('/goals', 'POST', { name: 'bad', targetAmount: '10', categoryKey: 'home', userId: b.id }, 400);
        await req('/goals', 'POST', { name: 'bad', targetAmount: '10', categoryKey: 'home', plannedMonthlyAmount: '0' }, 400);
        await req('/goals/' + goal.id, 'GET', undefined, 404, b);
        await req('/goals/' + goal.id, 'PATCH', { name: 'bad' }, 404, b);
        await req('/goals', 'POST', { name: 'key missing', targetAmount: '10', categoryKey: 'home' }, 400, a, '');
    });
    await t.test('opening create replay and central source uniqueness', async () => {
        const body = { amount: '200.00', cutoffDate: '2026-09-01', note: 'existing savings' }, key = randomUUID();
        opening = await req('/goal-funding/opening-balance', 'POST', body, 201, a, key);
        assert.deepEqual(await req('/goal-funding/opening-balance', 'POST', body, 201, a, key), opening);
        await req('/goal-funding/opening-balance', 'POST', body, 409);
        assert.equal(await prisma.goalOpeningRevision.count({ where: { userId: a.id } }), 1);
    });
    await t.test('allocations preserve existing financial reports; retry no duplicate ledger', async () => {
        const paths = ['/transactions', '/overview?startDate=2026-09-01&endDate=2026-09-30', '/overview/weekly?startDate=2026-09-01&endDate=2026-09-30', '/budget?year=2026&month=9'];
        const before = await Promise.all(paths.map(p => req(p)));
        const body = { amount: '70.00', source: { type: 'OPENING_BALANCE' } }, key = randomUUID();
        const first = await req(`/goals/${goal.id}/allocations`, 'POST', body, 201, a, key);
        assert.deepEqual(await req(`/goals/${goal.id}/allocations`, 'POST', body, 201, a, key), first);
        lotIncome = await req(`/goals/${goal.id}/allocations`, 'POST', { amount: '30.00', source: { type: 'INCOME_TRANSACTION', transactionId: income.id } }, 201);
        assert.equal((await req('/goals/' + goal.id)).savedAmount, '100.00');
        assert.deepEqual(await Promise.all(paths.map(p => req(p))), before);
        assert.equal(await prisma.goalLedgerEntry.count({ where: { userId: a.id, goalId: goal.id, kind: 'ALLOCATE' } }), 2);
    });
    await t.test('source eligibility, archived capacity and cross-account sources', async () => {
        const old = await prisma.transaction.create({ data: { userId: a.id, categoryId: category.id, type: 'income', amount: '100', transactionDate: new Date('2026-09-01T00:00:00Z') } });
        await req(`/goals/${goal.id}/allocations`, 'POST', { amount: '1', source: { type: 'INCOME_TRANSACTION', transactionId: old.id } }, 409);
        await req(`/goals/${goal.id}/allocations`, 'POST', { amount: '1', source: { type: 'INCOME_TRANSACTION', transactionId: foreignIncome.id } }, 404);
        await req(`/goals/${goal.id}/archive`, 'POST', {});
        assert.equal((await req('/goals/' + goal.id)).calculatedStatus, 'completed');
        await req(`/goals/${goal.id}/allocations`, 'POST', { amount: '1', source: { type: 'OPENING_BALANCE' } }, 409);
        const other = await createGoal();
        await req(`/goals/${other.id}/allocations`, 'POST', { amount: '131', source: { type: 'OPENING_BALANCE' } }, 409);
        await req(`/goals/${goal.id}/restore`, 'POST', {});
    });
    await t.test('FIFO spans lots; RELEASE retry preserves rows', async () => {
        const key = randomUUID(), body = { amount: '85', reason: 'FIFO test' };
        const r = await req(`/goals/${goal.id}/releases`, 'POST', body, 201, a, key);
        assert.deepEqual(r.entries.map((x: any) => x.amount), ['70.00', '15.00']);
        assert.deepEqual(await req(`/goals/${goal.id}/releases`, 'POST', body, 201, a, key), r);
        assert.equal((await req('/goals/' + goal.id)).savedAmount, '15.00');
        await req(`/goals/${goal.id}/releases`, 'POST', { amount: '16', reason: 'too much' }, 409);
    });
    await t.test('opening revisions, amount floor, cutoff remains locked after full release', async () => {
        await req('/goal-funding/opening-balance/corrections', 'POST', { cutoffDate: '2026-08-31', reason: 'wrong cutoff' }, 409);
        const body = { amount: '210', reason: 'amount correction' }, key = randomUUID();
        const r = await req('/goal-funding/opening-balance/corrections', 'POST', body, 200, a, key);
        assert.deepEqual(await req('/goal-funding/opening-balance/corrections', 'POST', body, 200, a, key), r);
        assert.equal((await req('/goal-funding/opening-balance/revisions')).data.length, 2);
        const other = await createGoal();
        await req(`/goals/${other.id}/allocations`, 'POST', { amount: '20', source: { type: 'OPENING_BALANCE' } }, 201);
        await req('/goal-funding/opening-balance/corrections', 'POST', { amount: '19', reason: 'below reserved' }, 409);
    });
    const update = { categoryId: category.id, type: 'income', amount: '100', transactionDate: '2026-09-02', description: 'changed description' };
    await t.test('Transaction update/delete guards and immutable snapshots', async () => {
        await req('/transactions/' + income.id, 'DELETE', undefined, 409);
        await req('/transactions/' + income.id, 'PUT', { ...update, amount: '14' }, 409);
        await req('/transactions/' + income.id, 'PUT', { ...update, type: 'expense', categoryId: expenseCategory.id }, 409);
        await req('/transactions/' + income.id, 'PUT', { ...update, transactionDate: '2026-09-01' }, 409);
        await req('/transactions/' + income.id, 'PUT', update);
        const row = await prisma.goalLedgerEntry.findUniqueOrThrow({ where: { id: lotIncome.entries[0].id } });
        assert.equal((row.sourceSnapshot as any).description, 'original income');
    });
    await t.test('DELETE after net zero clears only live source FK and preserves history byte-for-byte', async () => {
        await req(`/goals/${goal.id}/releases`, 'POST', { amount: '15', reason: 'release before deletion' }, 201);
        const before = JSON.stringify({ ledger: await prisma.goalLedgerEntry.findMany({ where: { userId: a.id }, orderBy: { id: 'asc' } }), operations: await prisma.goalOperation.findMany({ where: { userId: a.id }, orderBy: { id: 'asc' } }) });
        await req('/transactions/' + income.id, 'DELETE');
        const source = await prisma.goalFundingSource.findUniqueOrThrow({ where: { userId_sourceKey: { userId: a.id, sourceKey: 'income:' + income.id } } });
        assert.equal(source.transactionId, null);
        assert.equal(source.userId, a.id);
        assert.equal(source.originalTransactionId, income.id);
        assert.equal(JSON.stringify({ ledger: await prisma.goalLedgerEntry.findMany({ where: { userId: a.id }, orderBy: { id: 'asc' } }), operations: await prisma.goalOperation.findMany({ where: { userId: a.id }, orderBy: { id: 'asc' } }) }), before);
        assert.equal((await req('/goals/' + goal.id)).calculatedStatus, 'not_started');
    });
    await t.test('database ownership trigger rejects foreign Transaction even without API', async () => {
        await assert.rejects(prisma.goalFundingSource.create({ data: { userId: a.id, kind: 'INCOME_TRANSACTION', sourceKey: 'income:' + foreignIncome.id, originalTransactionId: foreignIncome.id, transactionId: foreignIncome.id } }));
    });
    await t.test('append-only SQL triggers reject UPDATE and DELETE for all history tables', async () => {
        const client = new Client({ connectionString: process.env.DATABASE_URL });
        await client.connect();
        try {
            for (const table of ['GoalLedgerEntry', 'GoalOperation', 'GoalOpeningRevision']) {
                const { rows } = await client.query(`SELECT id FROM "${table}" LIMIT 1`);
                assert.ok(rows[0]);
                for (const sql of [`UPDATE "${table}" SET id=id WHERE id=$1`, `DELETE FROM "${table}" WHERE id=$1`])
                    await assert.rejects(client.query(sql, [rows[0].id]), (e: any) => e.code === '23514');
            }
        }
        finally {
            await client.end();
        }
    });
    await t.test('correction compensates atomically, preserves source snapshot and original rows', async () => {
        const g = await createGoal();
        const allocation = await req(`/goals/${g.id}/allocations`, 'POST', { amount: '10', source: { type: 'OPENING_BALANCE' } }, 201);
        const id = allocation.entries[0].id;
        const before = await prisma.goalLedgerEntry.count({ where: { userId: a.id, goalId: g.id } });
        await req(`/goals/${g.id}/allocation-corrections`, 'POST', { allocationId: id, amount: '11', reason: 'invalid' }, 409);
        assert.equal(await prisma.goalLedgerEntry.count({ where: { userId: a.id, goalId: g.id } }), before);
        const r = await req(`/goals/${g.id}/allocation-corrections`, 'POST', { allocationId: id, amount: '5', replacementSource: { type: 'OPENING_BALANCE' }, reason: 'correct source' }, 201);
        assert.deepEqual(r.entries.map((x: any) => x.kind), ['RELEASE', 'ALLOCATE']);
        assert.equal(r.goalSavedAmountAfter, '10.00');
    });
    await t.test('computed status filtering before cursor pagination; archive independent', async () => {
        const completed = await createGoal(a, 'completed');
        await req(`/goals/${completed.id}/allocations`, 'POST', { amount: '1', source: { type: 'OPENING_BALANCE' } }, 201);
        await req('/goals/' + completed.id, 'PATCH', { targetAmount: '0.50' });
        await createGoal(a, 'unfunded-one');
        await createGoal(a, 'unfunded-two');
        const first = await req('/goals?status=not_started&limit=1');
        assert.ok(first.nextCursor);
        assert.equal(first.data.length, 1);
        assert.equal(first.data[0].calculatedStatus, 'not_started');
        if (first.nextCursor) {
            const second = await req('/goals?status=not_started&limit=1&cursor=' + first.nextCursor);
            assert.equal(second.data[0].calculatedStatus, 'not_started');
            assert.notEqual(second.data[0].id, first.data[0].id);
        }
        await req(`/goals/${completed.id}/archive`, 'POST', {});
        const stored = await req('/goals?archived=only&status=completed');
        assert.ok(stored.data.some((x: any) => x.id === completed.id));
        assert.equal((await req('/goals/' + completed.id)).overfundedAmount, '0.50');
    });
    await t.test('late opening cutoff rejects already reserved income', async () => {
        const g = await createGoal(b);
        await req(`/goals/${g.id}/allocations`, 'POST', { amount: '10', source: { type: 'INCOME_TRANSACTION', transactionId: foreignIncome.id } }, 201, b);
        await req('/goal-funding/opening-balance', 'POST', { amount: '100', cutoffDate: '2026-09-02', note: 'would overlap' }, 409, b);
    });
    await t.test('committed concurrent allocation from one source never exceeds capacity', async () => {
        const c = await account(), g1 = await createGoal(c), g2 = await createGoal(c);
        await req('/goal-funding/opening-balance', 'POST', { amount: '100', cutoffDate: '2026-09-01', note: 'race' }, 201, c);
        const responses = await Promise.all([g1, g2].map(g => fetch(`http://127.0.0.1:${address.port}/goals/${g.id}/allocations`, { method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ amount: '80', source: { type: 'OPENING_BALANCE' } }) })));
        assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
        const sum = await prisma.goalLedgerEntry.aggregate({ where: { userId: c.id, kind: 'ALLOCATE' }, _sum: { amount: true } });
        assert.equal(sum._sum.amount!.toFixed(2), '80.00');
    });
    await t.test('committed concurrent release cannot double-spend a lot', async () => {
        const c = await account(), g = await createGoal(c);
        await req('/goal-funding/opening-balance', 'POST', { amount: '100', cutoffDate: '2026-09-01', note: 'race' }, 201, c);
        await req(`/goals/${g.id}/allocations`, 'POST', { amount: '100', source: { type: 'OPENING_BALANCE' } }, 201, c);
        const responses = await Promise.all([1, 2].map(() => fetch(`http://127.0.0.1:${address.port}/goals/${g.id}/releases`, { method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, body: JSON.stringify({ amount: '80', reason: 'race' }) })));
        assert.deepEqual(responses.map(r => r.status).sort(), [201, 409]);
        assert.equal((await req('/goals/' + g.id, 'GET', undefined, 200, c)).savedAmount, '20.00');
    });
    await t.test('two independent PostgreSQL connections contend on same user row lock', async () => {
        const c1 = new Client({ connectionString: process.env.DATABASE_URL }), c2 = new Client({ connectionString: process.env.DATABASE_URL });
        await Promise.all([c1.connect(), c2.connect()]);
        try {
            await c1.query('BEGIN');
            await c1.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [a.id]);
            await c2.query('BEGIN');
            await c2.query("SET LOCAL lock_timeout='150ms'");
            await assert.rejects(c2.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE', [a.id]), (e: any) => e.code === '55P03');
            await c2.query('ROLLBACK');
            await c1.query('COMMIT');
        }
        finally {
            await Promise.all([c1.end(), c2.end()]);
        }
    });
});
// Additional races run independently from the scenario above in the same test database.
test('same-key financial concurrency, mutation races and tenant keys', async (t) => {
    process.env.JWT_SECRET = randomUUID();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    // The preceding test disconnects Prisma; Prisma reconnects lazily here.
    t.after(async () => { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); });
    const user = await prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'isolated-test' } }), token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET!);
    async function send(path: string, body: unknown, method = 'POST', key = randomUUID()) { const r = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': key }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() as any }; }
    const goal = (await send('/goals', { name: 'race', targetAmount: '100', categoryKey: 'other' })).body;
    await t.test('concurrent opening/allocate/release retries produce identical result once', async () => {
        const openingKey = randomUUID(), openingBody = { amount: '100', cutoffDate: '2026-09-01', note: 'race' };
        const o = await Promise.all([send('/goal-funding/opening-balance', openingBody, 'POST', openingKey), send('/goal-funding/opening-balance', openingBody, 'POST', openingKey)]);
        assert.equal(o[0].status, 201);
        assert.deepEqual(o[0], o[1]);
        const key = randomUUID(), body = { amount: '80', source: { type: 'OPENING_BALANCE' } };
        const a = await Promise.all([send(`/goals/${goal.id}/allocations`, body, 'POST', key), send(`/goals/${goal.id}/allocations`, body, 'POST', key)]);
        assert.equal(a[0].status, 201);
        assert.deepEqual(a[0], a[1]);
        const releaseKey = randomUUID(), releaseBody = { amount: '80', reason: 'race' };
        const r = await Promise.all([send(`/goals/${goal.id}/releases`, releaseBody, 'POST', releaseKey), send(`/goals/${goal.id}/releases`, releaseBody, 'POST', releaseKey)]);
        assert.equal(r[0].status, 201);
        assert.deepEqual(r[0], r[1]);
        assert.equal(await prisma.goalLedgerEntry.count({ where: { userId: user.id, goalId: goal.id } }), 2);
    });
    await t.test('allocation racing archive has a valid serial outcome', async () => {
        const [a, b] = await Promise.all([send(`/goals/${goal.id}/allocations`, { amount: '1', source: { type: 'OPENING_BALANCE' } }), send(`/goals/${goal.id}/archive`, {})]);
        assert.equal(b.status, 200);
        assert.ok([201, 409].includes(a.status));
        assert.ok((await prisma.goal.findUniqueOrThrow({ where: { id: goal.id } })).archivedAt);
    });
    await t.test('allocation racing income reduction preserves source capacity', async () => {
        await send(`/goals/${goal.id}/restore`, {});
        const cat = await prisma.category.create({ data: { name: randomUUID(), type: 'income' } });
        const income = await prisma.transaction.create({ data: { userId: user.id, categoryId: cat.id, type: 'income', amount: '100', transactionDate: new Date('2026-09-02T00:00:00Z') } });
        const [a, b] = await Promise.all([send(`/goals/${goal.id}/allocations`, { amount: '80', source: { type: 'INCOME_TRANSACTION', transactionId: income.id } }), send('/transactions/' + income.id, { categoryId: cat.id, type: 'income', amount: '50', transactionDate: '2026-09-02' }, 'PUT')]);
        assert.ok((a.status === 201 && b.status === 409) || (a.status === 409 && b.status === 200));
        const source = await prisma.goalFundingSource.findFirst({ where: { userId: user.id, transactionId: income.id } });
        const transaction = await prisma.transaction.findUniqueOrThrow({ where: { id: income.id } });
        if (source) {
            const rows = await prisma.goalLedgerEntry.findMany({ where: { sourceId: source.id } });
            const net = rows.reduce((n, r) => r.kind === 'ALLOCATE' ? n.plus(r.amount) : n.minus(r.amount), new D(0));
            assert.ok(net.lte(transaction.amount));
        }
    });
});
