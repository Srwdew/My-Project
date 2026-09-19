import { z } from 'zod';
import { type Prisma } from '@prisma/client';
export const displayNameInput = z.string().trim().min(1).max(80);
// Shared by the existing Profile API and atomic Settings transaction.
export function saveProfile(tx: Pick<Prisma.TransactionClient, 'profile'>, userId: string, input: {
    displayName: string;
    income?: string | null;
    paydayDay?: number | null;
    primaryGoalId?: string | null;
}) {
    const data = { ...input, displayName: displayNameInput.parse(input.displayName) };
    return tx.profile.upsert({ where: { userId }, create: { userId, ...data }, update: data, select: { displayName: true } });
}
