import type { Prisma } from "@prisma/client";

// Category is a shared catalog (unique name/type), not owned by a User.
// Do not rename/delete existing rows or import the local demo seed.
export const DEFAULT_CATEGORIES = [
  ...[
    "อาหารและเครื่องดื่ม",
    "การเดินทาง",
    "ช็อปปิ้ง",
    "ความบันเทิง",
    "สุขภาพ",
    "การศึกษา",
    "อื่นๆ",
  ].map((name) => ({ name, type: "expense" as const })),
  ...[
    "เงินเดือน",
    "ธุรกิจ/ฟรีแลนซ์",
    "โบนัส/ค่าคอมมิชชัน",
    "ของขวัญ/เงินที่ได้รับ",
    "รายรับอื่น ๆ",
  ].map((name) => ({
    name,
    type: "income" as const,
  })),
];
// Position in DEFAULT_CATEGORIES, or -1 for legacy catalog rows that stay in the DB but are hidden in the UI.
export function defaultCategoryRank(category: { name: string; type: string }) {
  return DEFAULT_CATEGORIES.findIndex(
    (c) => c.name === category.name && c.type === category.type,
  );
}
export const OTHER_EXPENSE_CATEGORY = "อื่นๆ";
export async function ensureDefaultCategories(tx: Prisma.TransactionClient) {
  // PostgreSQL ON CONFLICT DO NOTHING uses Category(name,type)'s unique index.
  await tx.category.createMany({
    data: DEFAULT_CATEGORIES,
    skipDuplicates: true,
  });
}
