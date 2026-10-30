import { Prisma } from "@prisma/client";
import { z } from "zod";
import { GoalError } from "./goalWriteTransaction";
import { onlineUserIds } from "./presence";
type Actor = { userId: string; authVersion?: number };
export async function assertAdmin(tx: Prisma.TransactionClient, actor: Actor) {
  const rows = await tx.$queryRaw<
    { role: string; authVersion: number; deletedAt: Date | null }[]
  >(
    Prisma.sql`SELECT role, "authVersion", "deletedAt" FROM "User" WHERE id=${actor.userId} FOR SHARE`,
  );
  const u = rows[0];
  if (!u || u.deletedAt || u.authVersion !== (actor.authVersion ?? 0))
    throw new GoalError(401, "SESSION_REVOKED", "กรุณาเข้าสู่ระบบใหม่");
  if (u.role !== "ADMIN")
    throw new GoalError(403, "ADMIN_REQUIRED", "เฉพาะผู้ดูแลระบบ");
}
export const adminUsersQuery = z
  .object({
    q: z.string().trim().max(120).default(""),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    cursor: z.string().uuid().optional(),
  })
  .strict();
const members = Prisma.sql`u.role='USER' AND u."deletedAt" IS NULL`;
function stats(today: string) {
  return Prisma.sql`SELECT count(*)::int AS n,
    count(*) FILTER (WHERE t.type='expense' AND t."transactionDate"<=${today}::date)::int AS expenses,
    coalesce(max(t."transactionDate") FILTER (WHERE t.type='expense' AND t."transactionDate"<=${today}::date)
      -min(t."transactionDate") FILTER (WHERE t.type='expense' AND t."transactionDate"<=${today}::date)+1,0)::int AS days
    FROM "Transaction" t WHERE t."userId"=u.id`;
}
export async function adminSummary(
  tx: Prisma.TransactionClient,
  today: string,
  online: string[] = onlineUserIds(),
) {
  const rows = await tx.$queryRaw<
    {
      totalMembers: number;
      newMembers: number;
      startedMembers: number;
      activeMembers: number;
      basicReadyMembers: number;
    }[]
  >(Prisma.sql`
    SELECT count(*)::int AS "totalMembers",
      count(*) FILTER (WHERE (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date >= ${today.slice(0, 7) + "-01"}::date
        AND (u."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Bangkok')::date <= ${today}::date)::int AS "newMembers",
      count(*) FILTER (WHERE s.n>0)::int AS "startedMembers",
      count(*) FILTER (WHERE u.id = ANY(${online}::text[]))::int AS "activeMembers",
      count(*) FILTER (WHERE s.expenses>=30 AND s.days>=30)::int AS "basicReadyMembers"
    FROM "User" u CROSS JOIN LATERAL (${stats(today)}) s WHERE ${members}`);
  return {
    asOfDate: today,
    timezone: "Asia/Bangkok",
    readinessLabel: "ความพร้อมข้อมูลพื้นฐาน",
    ...rows[0]!,
  };
}
export async function adminUsers(
  tx: Prisma.TransactionClient,
  query: z.infer<typeof adminUsersQuery>,
  today: string,
) {
  // Escape SQL LIKE metacharacters: search is a literal substring, never executable SQL.
  const needle = "%" + query.q.replace(/[\\%_]/g, "\\$&") + "%";
  const memberNo = Prisma.sql`(SELECT count(*) FROM "User" x WHERE (x."createdAt",x.id)<=(u."createdAt",u.id))::int`;
  // "U-0007" / "u7" finds member number 7 (signup order).
  const code = /^u-?0*(\d{1,9})$/i.exec(query.q)?.[1];
  const byCode = code ? Prisma.sql` OR ${memberNo}=${Number(code)}` : Prisma.empty;
  const match = Prisma.sql`(${query.q}='' OR u.id ILIKE ${needle} OR u.email ILIKE ${needle} OR p."displayName" ILIKE ${needle}${byCode})`;
  let after = Prisma.empty;
  if (query.cursor) {
    const cursor = await tx.$queryRaw<{ id: string; createdAt: Date }[]>(
      Prisma.sql`SELECT u.id,u."createdAt" FROM "User" u LEFT JOIN "Profile" p ON p."userId"=u.id WHERE ${members} AND ${match} AND u.id=${query.cursor}`,
    );
    if (!cursor[0])
      throw new GoalError(
        400,
        "INVALID_CURSOR",
        "ผลค้นหาเปลี่ยนไป กรุณาเริ่มค้นหาใหม่",
      );
    after = Prisma.sql`AND (u."createdAt",u.id)<(${cursor[0].createdAt},${cursor[0].id})`;
  }
  const rows = await tx.$queryRaw<
    {
      id: string;
      memberNo: number;
      displayName: string | null;
      email: string;
      createdAt: Date;
      lastLoginAt: Date | null;
      transactionCount: number;
      basicReadiness: boolean;
    }[]
  >(Prisma.sql`
    WITH selected AS (SELECT u.id,u.email,u."createdAt",u."lastLoginAt",p."displayName"
      FROM "User" u LEFT JOIN "Profile" p ON p."userId"=u.id
      WHERE ${members} AND ${match} ${after}
      ORDER BY u."createdAt" DESC,u.id DESC LIMIT ${query.limit + 1})
    -- Signup order over every User row (admins and closed accounts included) so a number never shifts.
    SELECT u.id,${memberNo} AS "memberNo",u.email,u."displayName",u."createdAt",u."lastLoginAt",s.n AS "transactionCount",
      (s.expenses>=30 AND s.days>=30) AS "basicReadiness"
    FROM selected u CROSS JOIN LATERAL (${stats(today)}) s ORDER BY u."createdAt" DESC,u.id DESC`);
  const hasMore = rows.length > query.limit,
    items = rows.slice(0, query.limit);
  return {
    asOfDate: today,
    items: items.map((r) => ({
      id: r.id,
      memberNo: r.memberNo,
      displayName: r.displayName,
      email: r.email,
      createdAt: r.createdAt.toISOString(),
      lastLoginAt: r.lastLoginAt?.toISOString() ?? null,
      transactionCount: r.transactionCount,
      basicReadiness: r.basicReadiness,
    })),
    hasMore,
    nextCursor: hasMore ? items[items.length - 1]!.id : null,
  };
}
