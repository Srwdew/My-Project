import { Router } from "express";
import { z } from "zod";
import { authMiddleware, type AuthRequest } from "../middleware/auth";
import { prisma } from "../lib/prisma";
import { bangkokToday } from "../lib/goalCalculations";
import {
  adminSummary,
  adminUsers,
  adminUsersQuery,
  assertAdmin,
} from "../lib/admin";
import { GoalError } from "../lib/goalWriteTransaction";
export const adminRouter = Router();
adminRouter.use(
  "/admin",
  (req, res, next) => {
    res.set("Cache-Control", "private, no-store");
    next();
  },
  authMiddleware,
  async (req: AuthRequest, res, next) => {
    try {
      const u = await prisma.user.findUnique({
        where: { id: req.user!.userId },
        select: { role: true, deletedAt: true, authVersion: true },
      });
      if (!u || u.deletedAt || u.authVersion !== (req.user!.authVersion ?? 0))
        return res.status(401).json({ error: "Session revoked" });
      if (u.role !== "ADMIN")
        return res.status(403).json({ error: "เฉพาะผู้ดูแลระบบ" });
      next();
    } catch {
      res.status(503).json({ error: "ตรวจสิทธิ์ไม่สำเร็จ" });
    }
  },
);
for (const route of ["summary", "users"] as const)
  adminRouter.get("/admin/" + route, async (req: AuthRequest, res) => {
    try {
      const q =
        route === "users"
          ? adminUsersQuery.parse(req.query)
          : z.object({}).strict().parse(req.query);
      const today = bangkokToday();
      const result = await prisma.$transaction(
        async (tx) => {
          await assertAdmin(tx, req.user!);
          return route === "summary"
            ? adminSummary(tx, today)
            : adminUsers(tx, adminUsersQuery.parse(q), today);
        },
        { isolationLevel: "RepeatableRead" },
      );
      res.json(result);
    } catch (e) {
      res
        .status(
          e instanceof GoalError
            ? e.status
            : e instanceof z.ZodError
              ? 400
              : 503,
        )
        .json({
          error:
            e instanceof GoalError
              ? e.message
              : e instanceof z.ZodError
                ? "คำค้นหรือการแบ่งหน้าไม่ถูกต้อง"
                : "โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่",
        });
    }
  });
