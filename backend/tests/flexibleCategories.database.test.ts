import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/lib/prisma';
import { getFlexibleCategoryIds } from '../src/lib/flexibleCategories';
const db = new URL(process.env.DATABASE_URL!).pathname.slice(1);
if (!db.startsWith('spendsense_goals_test_') || process.env.GOALS_TEST_DATABASE !== db)
    throw Error('Flexible category fixtures require isolated database');
test('Flexible category flags are per user, absent means fixed, and cascade on delete', async () => {
    const user = () => prisma.user.create({ data: { email: randomUUID() + '@example.invalid', passwordHash: 'x' } });
    const a = await user(), b = await user();
    const food = await prisma.category.create({ data: { name: 'flex-food-' + randomUUID(), type: 'expense' } });
    const rent = await prisma.category.create({ data: { name: 'flex-rent-' + randomUUID(), type: 'expense' } });
    const fun = await prisma.category.create({ data: { name: 'flex-fun-' + randomUUID(), type: 'expense' } });
    // New user: no rows, so nothing is flexible.
    assert.deepEqual([...await getFlexibleCategoryIds(prisma, a.id)], []);
    assert.equal(await prisma.userCategoryFlag.count({ where: { userId: a.id } }), 0);
    await prisma.userCategoryFlag.createMany({ data: [
        { userId: a.id, categoryId: food.id, flexible: true },
        { userId: a.id, categoryId: rent.id, flexible: false },
        { userId: a.id, categoryId: fun.id, flexible: true },
    ] });
    assert.deepEqual([...await getFlexibleCategoryIds(prisma, a.id)].sort(), [food.id, fun.id].sort());
    // A's flags never leak to B, even on the shared Category rows.
    assert.deepEqual([...await getFlexibleCategoryIds(prisma, b.id)], []);
    await assert.rejects(prisma.userCategoryFlag.create({ data: { userId: a.id, categoryId: food.id, flexible: false } }), { code: 'P2002' });
    const before = await prisma.userCategoryFlag.findUniqueOrThrow({ where: { userId_categoryId: { userId: a.id, categoryId: rent.id } } });
    await new Promise((r) => setTimeout(r, 10));
    const after = await prisma.userCategoryFlag.update({ where: { id: before.id }, data: { flexible: true } });
    assert.ok(after.updatedAt > before.updatedAt);
    // Deleting a category or a user removes its flags; no orphans.
    await prisma.category.delete({ where: { id: fun.id } });
    assert.deepEqual([...await getFlexibleCategoryIds(prisma, a.id)].sort(), [food.id, rent.id].sort());
    await prisma.user.delete({ where: { id: a.id } });
    assert.equal(await prisma.userCategoryFlag.count({ where: { userId: a.id } }), 0);
    await prisma.category.deleteMany({ where: { id: { in: [food.id, rent.id] } } });
    await prisma.user.delete({ where: { id: b.id } });
});
