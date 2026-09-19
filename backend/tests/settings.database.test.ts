import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { currentBudgetPeriod, noticeType } from '../src/lib/budgetNotifications';
import { paydayDate, settingsInput } from '../src/routes/settings';
const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db)
    throw Error('Settings fixtures require isolated database');
test('Settings calculations and validation', () => {
    assert.equal(paydayDate(2024, 2, 31).toISOString().slice(0, 10), '2024-02-29');
    assert.equal(paydayDate(2025, 2, 31).toISOString().slice(0, 10), '2025-02-28');
    assert.equal(paydayDate(2025, 12, 31).toISOString().slice(0, 10), '2025-12-31');
    assert.equal(noticeType(new Prisma.Decimal(80), new Prisma.Decimal(100), 80, true, false, false), null);
    assert.equal(noticeType(new Prisma.Decimal(101), new Prisma.Decimal(100), 80, true, false, false), 'budget_exceeded');
    assert.equal(noticeType(new Prisma.Decimal(101), new Prisma.Decimal(100), 80, false, false, true), 'budget_near_limit');
    assert.equal(noticeType(new Prisma.Decimal(101), new Prisma.Decimal(100), 80, false, true, true), null);
});
test('Settings real HTTP, atomic saves, avatars and session revocation', async (t) => {
    process.env.JWT_SECRET = randomUUID();
    const secret = process.env.JWT_SECRET;
    const password = randomUUID();
    const account = async () => { const user = await prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: await bcrypt.hash(password, 4) } }); return { ...user, token: jwt.sign({ userId: user.id, email: user.email }, secret) }; };
    const a = await account(), b = await account();
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>(r => server.once('listening', r));
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;
    t.after(async () => { await new Promise<void>(r => server.close(() => r())); await prisma.$disconnect(); });
    async function req(route: string, method = 'GET', body?: unknown, status = 200, token = a.token) { const r = await fetch(base + route, { method, headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'Idempotency-Key': randomUUID() }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); assert.equal(r.status, status, method + ' ' + route); return r.json() as Promise<any>; }
    const initial = await req('/settings');
    const period = currentBudgetPeriod();
    let draft = { displayName: 'ชื่อสำหรับทดสอบ', income: '0.08', paydayDay: 31, primaryGoalId: null as string | null, budgetMonth: initial.budgetMonth, budgetAmount: '100.00' as string | null, notifyNearLimit: false, notifyExceeded: true };
    const localGoal = await prisma.goal.create({ data: { userId: a.id, name: 'Goal', categoryKey: 'home', targetAmount: '100' } });
    const foreignGoal = await prisma.goal.create({ data: { userId: b.id, name: 'Foreign', categoryKey: 'home', targetAmount: '100' } });
    await t.test('defaults, authorization and decimal strings', async () => { assert.equal(initial.income, null); assert.equal(initial.budgetAmount, null); assert.equal(initial.primaryGoalId, null); assert.equal(initial.notifications.enabled, false); assert.equal(initial.notifications.notifyExceeded, false); assert.equal((await fetch(base + '/settings')).status, 401); const saved = await req('/settings', 'PUT', draft); assert.equal(saved.income, '0.08'); assert.equal(saved.paydayDay, 31); assert.equal((await req('/profile')).displayName, draft.displayName); assert.equal((await req('/settings', 'GET', undefined, 200, b.token)).income, null); });
    await t.test('validation and no partial write', async () => {
        for (const change of [{ income: 1 }, { income: '0.001' }, { income: '-1' }, { income: '10000000000' }, { paydayDay: 0 }, { paydayDay: 32 }, { paydayDay: 1.5 }, { budgetAmount: '0' }, { userId: b.id }, { primaryGoalId: foreignGoal.id }])
            await req('/settings', 'PUT', { ...draft, displayName: 'MUST NOT SAVE', ...change }, 400);
        await req('/settings', 'PUT', { ...draft, budgetMonth: '1900-01' }, 409);
        assert.equal((await req('/profile')).displayName, draft.displayName);
        await prisma.budgetNotificationSetting.update({ where: { userId: a.id }, data: { enabled: false, notifyExceeded: false, notifyNearLimit: false, totalBudget: false, categoryBudgets: false } });
        await req('/settings', 'PUT', { ...draft, displayName: 'ROLLBACK', budgetAmount: '999' }, 400);
        assert.equal((await req('/settings')).budgetAmount, '100.00');
        assert.equal((await req('/profile')).displayName, draft.displayName);
        await prisma.budgetNotificationSetting.update({ where: { userId: a.id }, data: { totalBudget: true, categoryBudgets: true } });
    });
    await t.test('Budget and Profile APIs share persisted values; preserve warning and scopes', async () => {
        await req('/budget', 'PUT', { ...period, amount: '123.45' });
        assert.equal((await req('/settings')).budgetAmount, '123.45');
        await req('/profile', 'PUT', { displayName: 'From Profile' });
        assert.equal((await req('/settings')).displayName, 'From Profile');
        await req('/notification-settings/budget', 'PUT', { enabled: true, notifyNearLimit: true, notifyExceeded: false, warningPercent: 91, totalBudget: true, categoryBudgets: false });
        const saved = await req('/settings', 'PUT', draft);
        assert.equal(saved.notifications.warningPercent, 91);
        assert.equal(saved.notifications.categoryBudgets, false);
        assert.equal((await req('/budget?year=' + period.year + '&month=' + period.month)).budgetAmount, 100);
    });
    await t.test('primary Goal ownership, archive unavailable, legacy text preserved, database FK', async () => { await prisma.profile.update({ where: { userId: a.id }, data: { goal: 'legacy planning text' } }); draft = { ...draft, primaryGoalId: localGoal.id }; await req('/settings', 'PUT', draft); await prisma.goal.update({ where: { id: localGoal.id }, data: { archivedAt: new Date() } }); const data = await req('/settings'); assert.equal(data.primaryGoal.id, localGoal.id); assert.ok(data.primaryGoal.archivedAt); assert.ok(!data.goals.some((g: any) => g.id === localGoal.id)); await req('/settings', 'PUT', draft); assert.equal((await req('/settings')).legacyGoal, 'legacy planning text'); await assert.rejects(prisma.profile.create({ data: { userId: b.id, primaryGoalId: localGoal.id } }), (e: any) => e.code === 'P2003'); draft = { ...draft, primaryGoalId: null }; await req('/settings', 'PUT', draft); await req('/settings', 'PUT', { ...draft, primaryGoalId: localGoal.id }, 400); });
    await t.test('actual producer honors near off / exceeded on; Settings creates no income transactions', async () => { const c = await prisma.category.create({ data: { name: randomUUID(), type: 'expense' } }); const before = await prisma.transaction.count({ where: { userId: a.id } }); await req('/settings', 'PUT', draft); assert.equal(await prisma.transaction.count({ where: { userId: a.id } }), before); const row = await prisma.transaction.create({ data: { userId: a.id, categoryId: c.id, type: 'expense', amount: '95', transactionDate: new Date(Date.UTC(period.year, period.month - 1, 1)) } }); await req('/settings', 'PUT', draft); assert.equal(await prisma.notification.count({ where: { userId: a.id } }), 0); await prisma.transaction.update({ where: { id: row.id }, data: { amount: '101' } }); await req('/settings', 'PUT', draft); const notices = await prisma.notification.findMany({ where: { userId: a.id } }); assert.equal(notices.length, 1); assert.equal(notices[0]!.type, 'budget_exceeded'); await req('/settings', 'PUT', { ...draft, notifyNearLimit: true, notifyExceeded: false }); assert.equal(await prisma.notification.count({ where: { userId: a.id } }), 1); });
    await t.test('avatar MIME/signature/size/auth, isolated reads and delete', async () => {
        const png = Buffer.alloc(33);
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
        png.write('IHDR', 12);
        const jpeg = Buffer.from([255, 216, 255, 224, 255, 217]);
        const webp = Buffer.alloc(20);
        webp.write('RIFF');
        webp.writeUInt32LE(12, 4);
        webp.write('WEBP', 8);
        webp.write('VP8L', 12);
        for (const [mime, bytes] of [['image/png', png], ['image/jpeg', jpeg], ['image/webp', webp]] as const) {
            const r = await fetch(base + '/profile/avatar', { method: 'PUT', headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': mime }, body: bytes });
            assert.equal(r.status, 200);
            const get = await fetch(base + '/profile/avatar', { headers: { Authorization: 'Bearer ' + a.token } });
            assert.equal(get.headers.get('content-type'), mime);
            assert.deepEqual(Buffer.from(await get.arrayBuffer()), bytes);
        }
        for (const [mime, bytes, status] of [['image/svg+xml', Buffer.from('<svg/>'), 400], ['image/png', jpeg, 400], ['image/png', Buffer.alloc(1048577), 413]] as const) {
            assert.equal((await fetch(base + '/profile/avatar', { method: 'PUT', headers: { Authorization: 'Bearer ' + a.token, 'Content-Type': mime }, body: bytes })).status, status);
        }
        assert.equal((await fetch(base + '/profile/avatar')).status, 401);
        assert.equal((await fetch(base + '/profile/avatar', { headers: { Authorization: 'Bearer ' + b.token } })).status, 404);
        await req('/profile/avatar', 'DELETE');
        assert.equal((await fetch(base + '/profile/avatar', { headers: { Authorization: 'Bearer ' + a.token } })).status, 404);
    });
    await t.test('nulls clear optional settings without creating transactions', async () => { const s = await req('/settings', 'PUT', { ...draft, income: null, paydayDay: null, budgetAmount: null, primaryGoalId: null, notifyExceeded: false, notifyNearLimit: false }); assert.equal(s.income, null); assert.equal(s.paydayDay, null); assert.equal(s.budgetAmount, null); assert.equal(s.notifications.enabled, false); });
    await t.test('password verifies current password, revokes legacy/v0 tokens, new login has version', async () => {
        const next = randomUUID();
        await req('/auth/change-password', 'POST', { currentPassword: 'wrong', newPassword: next, confirmPassword: next }, 400);
        await req('/auth/change-password', 'POST', { currentPassword: password, newPassword: 'short', confirmPassword: 'short' }, 400);
        await req('/auth/change-password', 'POST', { currentPassword: password, newPassword: next, confirmPassword: 'mismatch' }, 400);
        await req('/auth/change-password', 'POST', { currentPassword: password, newPassword: next, confirmPassword: next });
        await req('/settings', 'GET', undefined, 401);
        await req('/auth/login', 'POST', { email: a.email, password }, 401);
        const login = await req('/auth/login', 'POST', { email: a.email, password: next });
        assert.equal((jwt.decode(login.token) as any).authVersion, 1);
        await req('/settings', 'GET', undefined, 200, login.token);
        await req('/auth/close-account', 'POST', { currentPassword: next, confirmation: 'wrong' }, 400, login.token);
        await req('/auth/close-account', 'POST', { currentPassword: 'wrong', confirmation: 'ปิดบัญชีผู้ใช้' }, 400, login.token);
        const preservedGoal = await req('/goals', 'POST', { name: 'Preserve history', categoryKey: 'home', targetAmount: '100.00' }, 201, login.token);
        await req('/goal-funding/opening-balance', 'POST', { amount: '20.00', cutoffDate: '2020-01-01', note: 'isolated test' }, 201, login.token);
        await req('/goals/' + preservedGoal.id + '/allocations', 'POST', { amount: '10.00', source: { type: 'OPENING_BALANCE' } }, 201, login.token);
        const ledgerBefore = await prisma.goalLedgerEntry.findMany({ where: { userId: a.id } });
        const operationsBefore = await prisma.goalOperation.findMany({ where: { userId: a.id } });
        const before = await prisma.transaction.count({ where: { userId: a.id } });
        await req('/auth/close-account', 'POST', { currentPassword: next, confirmation: 'ปิดบัญชีผู้ใช้' }, 200, login.token);
        await req('/settings', 'GET', undefined, 401, login.token);
        await req('/auth/login', 'POST', { email: a.email, password: next }, 401);
        assert.equal(await prisma.transaction.count({ where: { userId: a.id } }), before);
        assert.ok(await prisma.goal.findUnique({ where: { id: localGoal.id } }));
        const closed = await prisma.user.findUniqueOrThrow({ where: { id: a.id } });
        assert.ok(closed.deletedAt);
        assert.equal(closed.authVersion, 2);
        assert.deepEqual(await prisma.goalLedgerEntry.findMany({ where: { userId: a.id } }), ledgerBefore);
        assert.deepEqual(await prisma.goalOperation.findMany({ where: { userId: a.id } }), operationsBefore);
        await req('/settings', 'GET', undefined, 200, b.token);
    });
    assert.ok(settingsInput.safeParse(draft).success);
});
