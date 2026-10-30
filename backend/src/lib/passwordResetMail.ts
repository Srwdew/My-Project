export type ResetMail = { to: string; resetUrl: string; expiresInMinutes: 15 };
export interface ResetMailer {
  send(message: ResetMail): Promise<void>;
}
// Production adapters are in passwordResetProviders; this adapter remains loopback-only.
export function localResetMailer(endpoint: string): ResetMailer {
  const url = new URL(endpoint);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/messages"
  )
    throw new Error("Invalid local mail sink");
  return {
    async send(message) {
      const response = await fetch(url, {
        method: "POST",
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error("Local mail delivery failed");
    },
  };
}
