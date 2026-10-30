import nodemailer from "nodemailer";
import { z } from "zod";
import {
  localResetMailer,
  type ResetMail,
  type ResetMailer,
} from "./passwordResetMail";
import { ResetConfigError } from "./passwordResetConfig";
export type ProviderDependencies = {
  fetch?: typeof fetch;
  transport?: typeof nodemailer.createTransport;
};
const mailbox = (value: string) =>
  z.string().email().max(254).safeParse(value).success &&
  !/[\r\n<>]/.test(value);
const SUBJECT = "ตั้งรหัสผ่าน SpendSense ใหม่ / Reset your SpendSense password";
const body = (m: ResetMail) =>
  "กดลิงก์นี้เพื่อตั้งรหัสผ่าน SpendSense ใหม่ ลิงก์ใช้ได้ครั้งเดียวภายใน 15 นาที\r\n" +
  "Use this link to reset your SpendSense password within 15 minutes.\r\n\r\n" +
  m.resetUrl +
  "\r\n\r\nหากคุณไม่ได้ขอเปลี่ยนรหัสผ่าน ไม่ต้องทำอะไร รหัสผ่านเดิมยังใช้ได้\r\n" +
  "If you did not request this, ignore this email.";
export function configuredMailer(
  env: NodeJS.ProcessEnv,
  deps: ProviderDependencies = {},
): ResetMailer {
  const provider = env.PASSWORD_RESET_MAIL_PROVIDER ?? "local";
  if (provider === "local") {
    if (env.NODE_ENV === "production")
      throw new ResetConfigError(["PASSWORD_RESET_MAIL_PROVIDER"]);
    return localResetMailer(env.PASSWORD_RESET_SINK_URL ?? "");
  }
  if (!["gmail", "smtp"].includes(provider))
    throw new ResetConfigError(["PASSWORD_RESET_MAIL_PROVIDER"]);
  // Development/tests cannot send externally unless the developer opts in with PASSWORD_RESET_MODE=dev-mail.
  if (env.NODE_ENV !== "production" && env.PASSWORD_RESET_MODE !== "dev-mail")
    throw new ResetConfigError(["PASSWORD_RESET_MAIL_PROVIDER"]);
  const from = env.PASSWORD_RESET_FROM ?? "";
  if (!mailbox(from)) throw new ResetConfigError(["PASSWORD_RESET_FROM"]);
  const requireValue = (key: string) => {
    const v = env[key];
    if (!v || /[\r\n]/.test(v)) throw new ResetConfigError([key]);
    return v;
  };
  if (provider === "gmail") {
    const clientId = requireValue("GMAIL_CLIENT_ID"),
      clientSecret = requireValue("GMAIL_CLIENT_SECRET"),
      refreshToken = requireValue("GMAIL_REFRESH_TOKEN");
    const request = deps.fetch ?? fetch;
    return {
      async send(message) {
        try {
          if (!mailbox(message.to)) throw Error();
          const auth = await request("https://oauth2.googleapis.com/token", {
            method: "POST",
            redirect: "error",
            signal: AbortSignal.timeout(10000),
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: refreshToken,
            }),
          });
          if (!auth.ok) throw Error();
          const data = (await auth.json()) as { access_token?: string };
          if (!data.access_token || /[\r\n]/.test(data.access_token))
            throw Error();
          const mime = [
            "From: " + from,
            "To: " + message.to,
            "Subject: =?UTF-8?B?" + Buffer.from(SUBJECT).toString("base64") + "?=",
            "MIME-Version: 1.0",
            "Content-Type: text/plain; charset=UTF-8",
            "Content-Transfer-Encoding: base64",
            "",
            Buffer.from(body(message))
              .toString("base64")
              .match(/.{1,76}/g)!
              .join("\r\n"),
          ].join("\r\n");
          const sent = await request(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(10000),
              headers: {
                Authorization: "Bearer " + data.access_token,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                raw: Buffer.from(mime).toString("base64url"),
              }),
            },
          );
          if (!sent.ok) throw Error();
        } catch {
          throw new Error("PASSWORD_RESET_MAIL_FAILED");
        }
      },
    };
  }
  const host = requireValue("SMTP_HOST"),
    port = Number(requireValue("SMTP_PORT")),
    user = requireValue("SMTP_USER"),
    pass = requireValue("SMTP_PASSWORD");
  if (
    !/^[a-zA-Z0-9.-]+$/.test(host) ||
    host.startsWith(".") ||
    ![465, 587].includes(port)
  )
    throw new ResetConfigError(["SMTP_HOST", "SMTP_PORT"]);
  const transport = (deps.transport ?? nodemailer.createTransport)({
    host,
    port,
    secure: port === 465,
    requireTLS: true,
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    auth: { user, pass },
    pool: false,
    logger: false,
    debug: false,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
  return {
    async send(message) {
      try {
        if (!mailbox(message.to)) throw Error();
        const info = await transport.sendMail({
          from,
          to: message.to,
          subject: SUBJECT,
          text: body(message),
          disableFileAccess: true,
          disableUrlAccess: true,
        });
        if (info.rejected?.length || !info.accepted?.length) throw Error();
      } catch {
        throw new Error("PASSWORD_RESET_MAIL_FAILED");
      }
    },
  };
}
// No retries/fallback: an uncertain SMTP/Gmail timeout may already have delivered the message.
