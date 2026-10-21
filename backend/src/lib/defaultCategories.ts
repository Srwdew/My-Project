import type { Prisma } from '@prisma/client';

// Category is a shared catalog (unique name/type), not owned by a User.
// Do not rename/delete existing rows or import the local demo seed.
export const DEFAULT_CATEGORIES = [
  ...['อาหารและเครื่องดื่ม', 'การเดินทาง', 'ช็อปปิ้ง', 'ความบันเทิง', 'สุขภาพ', 'การศึกษา', 'อื่นๆ']
    .map(name => ({ name, type: 'expense' as const })),
  ...['เงินเดือน', 'รายรับอื่น ๆ'].map(name => ({ name, type: 'income' as const })),
];
export async function ensureDefaultCategories(tx: Prisma.TransactionClient) {
  // PostgreSQL ON CONFLICT DO NOTHING uses Category(name,type)'s unique index.
  await tx.category.createMany({ data: DEFAULT_CATEGORIES, skipDuplicates: true });
}
