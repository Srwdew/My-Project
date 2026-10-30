import jwt from "jsonwebtoken";
import { requiresSetup } from "./setupRequirement";
import { prisma } from "./prisma";
import { GoalError } from "./goalWriteTransaction";
export async function finishLogin(
  verified: {
    id: string;
    email: string;
    passwordHash: string;
    authVersion: number;
  },
  secret: string,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${verified.id} FOR UPDATE`;
    const u = await tx.user.findUnique({
      where: { id: verified.id },
      select: {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
        passwordHash: true,
        authVersion: true,
        setupCompletedAt: true,
        setupPromptedAt: true,
      },
    });
    if (
      !u ||
      u.deletedAt ||
      u.authVersion !== verified.authVersion ||
      u.passwordHash !== verified.passwordHash
    )
      throw new GoalError(401, "LOGIN_CHANGED", "กรุณาเข้าสู่ระบบใหม่");
    const token = jwt.sign(
      { userId: u.id, email: u.email, authVersion: u.authVersion },
      secret,
      { expiresIn: "7d" },
    );
    const showSetup = requiresSetup(u);
    await tx.$executeRaw`UPDATE "User" SET "lastLoginAt"=GREATEST(COALESCE("lastLoginAt",'-infinity'::timestamp),clock_timestamp() AT TIME ZONE 'UTC') WHERE id=${u.id}`;
    if (showSetup && !u.setupPromptedAt)
      await tx.user.update({
        where: { id: u.id },
        data: { setupPromptedAt: new Date() },
      });
    return {
      showSetup,
      message: "Login successful",
      token,
      user: { id: u.id, email: u.email, role: u.role },
    };
  });
}
