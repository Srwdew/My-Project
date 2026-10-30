import express, {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import {
  PasswordResetService,
  RESET_MESSAGE,
  ResetError,
} from "../lib/passwordReset";
import { configuredMailer } from "../lib/passwordResetProviders";
import {
  productionPolicy,
  validateResetOrigin,
  trustedResetProxies,
  resetClientIp,
  ResetConfigError,
} from "../lib/passwordResetConfig";

export function configuredResetService(env: NodeJS.ProcessEnv = process.env) {
  if (env.PASSWORD_RESET_ENABLED === "true") {
    try {
      const production = env.NODE_ENV === "production";
      const allowlist = (env.PASSWORD_RESET_ALLOWED_ORIGINS ?? "")
        .split(",")
        .map((v) => v.trim());
      const origin = validateResetOrigin(
        env.PUBLIC_APP_ORIGIN ?? "",
        allowlist,
        production,
      );
      trustedResetProxies(env.PASSWORD_RESET_TRUSTED_PROXIES, true);
      if ((env.PASSWORD_RESET_LIMITER_KEY ?? "").length < 32)
        throw new ResetConfigError(["PASSWORD_RESET_LIMITER_KEY"]);
      const policy = production ? productionPolicy(env) : undefined;
      // dev-mail: real Gmail/SMTP delivery against the local dev database (explicit opt-in).
      const devMail =
        !production &&
        env.PASSWORD_RESET_MODE === "dev-mail" &&
        ["gmail", "smtp"].includes(env.PASSWORD_RESET_MAIL_PROVIDER ?? "");
      if (
        !production &&
        !devMail &&
        (env.PASSWORD_RESET_MODE !== "local-test" ||
          env.PASSWORD_RESET_POLICY !== "proposal-v1")
      )
        throw new ResetConfigError([
          "PASSWORD_RESET_MODE",
          "PASSWORD_RESET_POLICY",
        ]);
      if (!production && !devMail) {
        const db = new URL(env.DATABASE_URL ?? "");
        if (
          !["127.0.0.1", "localhost", "[::1]"].includes(db.hostname) ||
          !db.pathname.slice(1).startsWith("spendsense_reset_test_") ||
          db.pathname.slice(1) !== env.RESET_TEST_DATABASE
        )
          throw new ResetConfigError(["RESET_TEST_DATABASE"]);
      }
      return new PasswordResetService(prisma, {
        secret: env.PASSWORD_RESET_LIMITER_KEY!,
        origin,
        mailer: configuredMailer(env),
        production,
        allowedOrigins: allowlist,
        ...(policy ? { policy } : {}),
      });
    } catch (error) {
      // Fixed config field names only; no values, credentials or provider exceptions.
      console.error(
        "PASSWORD_RESET_CONFIG_INVALID",
        error instanceof ResetConfigError
          ? error.fields
          : ["PASSWORD_RESET_CONFIGURATION"],
      );
      throw new Error("Password reset enabled with invalid configuration");
    }
  }
  return null; // Default is disabled; legacy MODE alone cannot enable delivery.
}
export function createPasswordResetRouter(
  service: PasswordResetService | null,
  trustedProxies: readonly string[] = [],
) {
  const router = Router();
  router.use(
    ["/auth/forgot-password", "/auth/reset-password"],
    (_req, res, next) => {
      res.set({
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      });
      next();
    },
  );
  router.use(
    ["/auth/forgot-password", "/auth/reset-password"],
    express.json({ limit: "8kb" }),
  );
  const handler = (reset: boolean) => async (req: Request, res: Response) => {
    if (!service)
      return res.status(503).json({ error: "ระบบกู้รหัสผ่านยังไม่เปิดใช้งาน" });
    try {
      const ip = resetClientIp(req, trustedProxies);
      if (reset) {
        const input = z
          .object({
            token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
            newPassword: z
              .string()
              .min(6)
              .refine((s) => Buffer.byteLength(s, "utf8") <= 72),
            confirmPassword: z.string(),
          })
          .strict()
          .refine((s) => s.newPassword === s.confirmPassword)
          .parse(req.body);
        await service.reset(input.token, input.newPassword, ip);
        return res.json({
          message: "เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่",
          logout: true,
        });
      }
      const input = z
        .object({ email: z.string().trim().toLowerCase().email().max(254) })
        .strict()
        .parse(req.body);
      await service.request(input.email, ip);
      return res.status(202).json({ message: RESET_MESSAGE });
    } catch (error) {
      if (error instanceof z.ZodError)
        return res.status(400).json({ error: "กรุณาตรวจข้อมูลที่กรอก" });
      if (error instanceof ResetError) {
        if (error.status === 429)
          res.set("Retry-After", String(service.retryAfterSeconds(reset)));
        return res
          .status(error.status)
          .json({
            error:
              error.status === 429
                ? "ส่งคำขอมากเกินไป กรุณาลองใหม่ภายหลัง"
                : error.status === 400
                  ? "ลิงก์ไม่ถูกต้อง หมดอายุ หรือถูกใช้แล้ว กรุณาขอใหม่"
                  : "ระบบยังไม่พร้อม กรุณาลองใหม่",
          });
      }
      return res.status(503).json({ error: "ระบบยังไม่พร้อม กรุณาลองใหม่" });
    }
  };
  router.post("/auth/forgot-password", handler(false));
  router.post("/auth/reset-password", handler(true));
  router.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      // Parser errors may contain input fragments; do not delegate them to the default logger.
      void error;
      res.status(400).json({ error: "กรุณาตรวจข้อมูลที่กรอก" });
    },
  );
  return router;
}
export const passwordResetRouter = createPasswordResetRouter(
  configuredResetService(),
  trustedResetProxies(process.env.PASSWORD_RESET_TRUSTED_PROXIES),
);
