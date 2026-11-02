import { Prisma } from "@prisma/client";

// The one place R1, R7 and R9 learn which categories the user said can be cut.
// No flag row means a fixed category, so a new user gets an empty set and those rules stay silent.
// Flags have no history (only updatedAt), so this is the user's current choice, not the choice at some past cycle.
// TODO(recommendation step 6): when this set is empty, the UI must invite the user to flag cuttable
// categories instead of showing nothing from R1/R7/R9.
export async function getFlexibleCategoryIds(
  db: Prisma.TransactionClient,
  userId: string,
): Promise<Set<string>> {
  const rows = await db.userCategoryFlag.findMany({
    where: { userId, flexible: true },
    select: { categoryId: true },
  });
  return new Set(rows.map((r) => r.categoryId));
}
