import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getToken, useSessionKey } from "../auth";
import { apiFetch } from "../api";
import Guide from "./Guide";
export default function PublicHome() {
  const session = useSessionKey();
  return session ? <MemberHome key={session} session={session} /> : <Guide />;
}
function MemberHome({ session }: { session: string }) {
  const [target, setTarget] = useState<string | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    setTarget(null);
    void (async () => {
      try {
        const response = await apiFetch("/auth/me", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw Error();
        const account = await response.json();
        if (controller.signal.aborted || getToken() !== session) return;
        if (
          !["USER", "ADMIN"].includes(account.role) ||
          typeof account.showSetup !== "boolean"
        )
          throw Error();
        setTarget(
          account.role === "ADMIN"
            ? "/admin"
            : account.showSetup
              ? "/setup"
              : "/overview",
        );
      } catch {
        if (!controller.signal.aborted && getToken() === session)
          setError(true);
      }
    })();
    return () => controller.abort();
  }, [session, retry]);
  if (target) return <Navigate to={target} replace />;
  return (
    <main className="login-page">
      <section className="login-card" aria-label="ตรวจสอบบัญชี">
        {error ? (
          <div role="alert">
            <p>ตรวจสอบบัญชีไม่สำเร็จ กรุณาลองใหม่</p>
            <button type="button" onClick={() => setRetry((n) => n + 1)}>
              ลองใหม่
            </button>
          </div>
        ) : (
          <p role="status">กำลังตรวจสอบบัญชี…</p>
        )}
      </section>
    </main>
  );
}
