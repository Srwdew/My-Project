import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { app } from '../src/index';
import { prisma } from '../src/lib/prisma';
import { bangkokToday } from '../src/lib/goalCalculations';
import { addDays } from '../src/lib/cycle';
const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db)
    throw Error('Recommendation fixtures require isolated database');

// Synthetic user, real database, real HTTP: query → context → rules → rank → log → text.
test('recommendations end to end on a seeded database', async (t) => {
    process.env.JWT_SECRET ??= randomUUID();
    const today = bangkokToday();
    const user = await prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'x' } });
    const other = await prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'x' } });
    const token = (id: string) => jwt.sign({ userId: id, email: 'x' }, process.env.JWT_SECRET!);
    const cat = (name: string, type: 'expense' | 'income') => prisma.category.create({ data: { name: name + '-' + randomUUID(), type } });
    const food = await cat('อาหาร', 'expense'), travel = await cat('เดินทาง', 'expense'), salary = await cat('เงินเดือน', 'income');
    await prisma.profile.create({ data: { userId: user.id } });
    // 150 days of food 100/day and travel 50/day; the last 30 days (to yesterday) food 160/day and travel 30/day.
    const rows = [];
    for (let i = 1; i <= 150; i++) {
        const date = new Date(addDays(today, -i) + 'T00:00:00Z'), recent = i <= 30;
        rows.push({ userId: user.id, categoryId: food.id, type: 'expense' as const, amount: recent ? '160' : '100', transactionDate: date });
        rows.push({ userId: user.id, categoryId: travel.id, type: 'expense' as const, amount: recent ? '30' : '50', transactionDate: date });
    }
    for (let m = 0; m < 6; m++) { // salary on the 1st of this month and the 5 before
        const [y, mo] = today.split('-').map(Number) as [number, number];
        const d = new Date(Date.UTC(y, mo - 1 - m, 1));
        rows.push({ userId: user.id, categoryId: salary.id, type: 'income' as const, amount: '30000', transactionDate: d });
    }
    await prisma.transaction.createMany({ data: rows });
    await prisma.goal.create({ data: { userId: user.id, name: 'ทริปญี่ปุ่น', targetAmount: '100000', targetDate: new Date(addDays(today, 365) + 'T00:00:00Z'), categoryKey: 'travel' } });
    await prisma.userCategoryFlag.create({ data: { userId: user.id, categoryId: food.id, flexible: true } });

    const server = app.listen(0, '127.0.0.1');
    t.after(() => server.close());
    await new Promise((r) => server.once('listening', r));
    const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port; // routes have no /api prefix (Vite strips it)
    const call = (path: string, id = user.id, init: RequestInit = {}) =>
        fetch(base + path, { ...init, headers: { Authorization: 'Bearer ' + token(id), 'Content-Type': 'application/json', ...(init.headers ?? {}) } });

    const first = await call('/recommendations');
    assert.equal(first.status, 200);
    const body = await first.json() as any;
    const all = [...body.shown, ...body.more];
    assert.ok(body.shown.length >= 1 && body.shown.length <= 3);
    assert.deepEqual(body.closedRules, []); // every gate open with this data
    for (const r of all) for (const part of ['what', 'action', 'outcome']) assert.equal(typeof r.text[part], 'string', r.ruleId + ' ' + part);
    const r3 = all.find((r: any) => r.ruleId === 'R3' && r.subject === food.id);
    const r9 = all.find((r: any) => r.ruleId === 'R9' && r.subject === travel.id);
    assert.ok(r3, 'R3 on food: ' + JSON.stringify(all.map((r: any) => r.ruleId + ':' + r.subject)));
    assert.match(r3.text.what, /^หมวด อาหาร-.* เพิ่มขึ้นใน 30 วันที่ผ่านมา จาก 3,000 เป็น 4,800 บาท/);
    assert.equal(r3.text.outcome, 'จะลดลง 1,800 บาท');
    assert.ok(r9, 'R9 on travel');
    assert.match(r9.text.what, /ลดลง 600 บาทจาก 30 วันก่อนหน้า \(จาก 1,500 เป็น 900 บาท\)/);
    console.log('rendered:\n' + all.map((r: any) => `  [${r.ruleId}] ${r.text.what} / ${r.text.action} / ${r.text.outcome}`).join('\n'));

    // Every returned item is logged once; reloading reuses the rows.
    const count = () => prisma.recommendationLog.count({ where: { userId: user.id } });
    assert.equal(await count(), all.length);
    await call('/recommendations');
    assert.equal(await count(), all.length);

    // Provenance comes from the log: the snapshot holds the flags as they were, even after they change.
    await prisma.userCategoryFlag.updateMany({ where: { userId: user.id }, data: { flexible: false } });
    const prov = await (await call('/recommendations/' + r3.id)).json() as any;
    assert.deepEqual(prov.inputs.flexibleCategoryIds, [food.id]);
    assert.deepEqual(prov.text, r3.text);
    assert.equal(prov.inputs.behavior.minimumIncreaseAmount, '100');
    assert.equal(prov.citationTier, 1);
    assert.equal(prov.citationRef, null);

    // Another user can neither read nor act on it.
    assert.equal((await call('/recommendations/' + r3.id, other.id)).status, 404);
    assert.equal((await call('/recommendations/' + r3.id + '/action', other.id, { method: 'POST', body: JSON.stringify({ action: 'dismissed' }) })).status, 404);
    assert.equal((await call('/recommendations/' + r3.id + '/action', user.id, { method: 'POST', body: JSON.stringify({ action: 'maybe' }) })).status, 400);
    assert.equal((await call('/recommendations?userId=x')).status, 400);

    // Dismissed: gone from the next evaluation in this cycle.
    assert.equal((await call('/recommendations/' + r3.id + '/action', user.id, { method: 'POST', body: JSON.stringify({ action: 'dismissed' }) })).status, 200);
    const after = await (await call('/recommendations')).json() as any;
    assert.ok(![...after.shown, ...after.more].some((r: any) => r.ruleId === 'R3' && r.subject === food.id));
    assert.deepEqual(after.silencedByNoFlags, ['R1', 'R7', 'R9']); // flags now all off
    assert.equal((await prisma.recommendationLog.findUnique({ where: { id: r3.id } }))!.userAction, 'dismissed');
});
