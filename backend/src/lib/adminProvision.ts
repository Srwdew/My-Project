import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
export class AdminProvisionError extends Error {}
export const provisionInput = z
  .object({
    mode: z.enum(["bootstrap", "rotate", "recover"]),
    targetId: z.string().uuid(),
    targetEmail: z.string().email(),
    previousId: z.string().uuid().optional(),
    previousEmail: z.string().email().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (v.mode === "bootstrap" && (v.previousId || v.previousEmail))
      c.addIssue({
        code: "custom",
        message: "Bootstrap has no previous admin",
      });
    if (
      v.mode !== "bootstrap" &&
      (!v.previousId || !v.previousEmail || v.previousId === v.targetId)
    )
      c.addIssue({
        code: "custom",
        message: "Specify a distinct previous admin ID and email",
      });
  });
export async function provisionAdmin(
  client: PrismaClient,
  raw: unknown,
  execute = false,
) {
  const input = provisionInput.parse(raw);
  return client.$transaction(
    async (tx) => {
      // One global lock serializes bootstrap/rotation/recovery. Row locks also serialize closure/login.
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(174903,1)::text`;
      const ids = [
        input.targetId,
        ...(input.previousId ? [input.previousId] : []),
      ].sort();
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM "User" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`,
      );
      const selection = {
        id: true,
        email: true,
        role: true,
        deletedAt: true,
        authVersion: true,
      } as const;
      const target = await tx.user.findUnique({
        where: { id: input.targetId },
        select: selection,
      });
      if (!target || target.email !== input.targetEmail || target.deletedAt)
        throw new AdminProvisionError(
          "Target account missing, closed, or email confirmation does not match",
        );
      const admins = await tx.user.findMany({
        where: { role: "ADMIN" },
        select: selection,
      });
      const previous = input.previousId
        ? await tx.user.findUnique({
            where: { id: input.previousId },
            select: selection,
          })
        : null;
      let alreadyApplied = false;
      if (input.mode === "bootstrap") {
        if (admins.length === 1 && target.role === "ADMIN")
          alreadyApplied = true;
        else if (admins.length)
          throw new AdminProvisionError(
            "Admin already exists; explicit rotation/recovery required",
          );
      } else {
        if (!previous || previous.email !== input.previousEmail)
          throw new AdminProvisionError(
            "Previous admin identity does not match",
          );
        if (input.mode === "rotate" && previous.deletedAt)
          throw new AdminProvisionError(
            "Previous account is closed; use explicit recovery",
          );
        alreadyApplied =
          previous.role === "USER" &&
          target.role === "ADMIN" &&
          admins.length === 1;
        if (
          !alreadyApplied &&
          (previous.role !== "ADMIN" ||
            target.role !== "USER" ||
            admins.length !== 1 ||
            admins[0]!.id !== previous.id)
        )
          throw new AdminProvisionError(
            "Admin state changed; review current identities before retry",
          );
      }
      if (execute && !alreadyApplied) {
        if (previous)
          await tx.user.update({
            where: { id: previous.id },
            data: { role: "USER", authVersion: { increment: 1 } },
          });
        await tx.user.update({
          where: { id: target.id },
          data: { role: "ADMIN", authVersion: { increment: 1 } },
        });
      }
      return {
        mode: input.mode,
        target: { id: target.id, email: target.email },
        previous: previous ? { id: previous.id, email: previous.email } : null,
        status: alreadyApplied
          ? "already_applied"
          : execute
            ? "applied"
            : "preview",
        impact:
          "Target becomes ADMIN; previous admin becomes USER when specified. Changed accounts must log in again. No financial data is changed.",
      };
    },
    { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 20000 },
  );
}
