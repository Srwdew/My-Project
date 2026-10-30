import { thaiDate } from "../utils/thaiDate";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LogOut, Search } from "lucide-react";
import { apiFetch } from "../api";
import { getToken, removeToken, useSessionKey } from "../auth";
import "./Admin.css";
type Member = {
  id: string;
  memberNo?: number;
  displayName: string | null;
  email: string;
  createdAt: string;
  lastLoginAt: string | null;
  transactionCount: number;
  basicReadiness: boolean;
};
type Summary = {
  asOfDate: string;
  totalMembers: number;
  newMembers: number;
  startedMembers: number;
  activeMembers?: number;
  basicReadyMembers: number;
};
type Page = {
  asOfDate: string;
  items: Member[];
  nextCursor: string | null;
  hasMore: boolean;
};
const date = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("th-TH", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Bangkok",
      }).format(new Date(v))
    : "ยังไม่มีข้อมูล";
const memberCode = (u: Member) =>
  u.memberNo ? "U-" + String(u.memberNo).padStart(4, "0") : "—";
export default function Admin() {
  const session = useSessionKey();
  return <AdminSession key={session ?? "none"} session={session} />;
}
function AdminSession({ session }: { session: string | null }) {
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState(""),
    [cursor, setCursor] = useState<string | null>(null),
    [history, setHistory] = useState<(string | null)[]>([]);
  const [data, setData] = useState<{ summary: Summary; page: Page } | null>(
      null,
    ),
    [error, setError] = useState(""),
    [forbidden, setForbidden] = useState(false),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((n) => n + 1);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);
  useEffect(() => {
    const c = new AbortController();
    let active = true;
    setData(null);
    setError("");
    setForbidden(false);
    setLoading(true);
    void (async () => {
      try {
        const responses = await Promise.all([
          apiFetch("/admin/summary", { signal: c.signal }),
          apiFetch(
            "/admin/users?" +
              new URLSearchParams({
                q: query,
                limit: "25",
                ...(cursor ? { cursor } : {}),
              }),
            { signal: c.signal },
          ),
        ]);
        if (!active || getToken() !== session) return;
        if (responses.some((r) => r.status === 403)) {
          setForbidden(true);
          return;
        }
        if (responses.some((r) => !r.ok))
          throw Error(
            "โหลดข้อมูลผู้ดูแลไม่สำเร็จ กรุณาลองใหม่ หรือเริ่มค้นหาใหม่",
          );
        const [summary, page] = await Promise.all(
          responses.map((r) => r.json()),
        );
        if (active && getToken() === session) setData({ summary, page });
      } catch (e) {
        if (active && !c.signal.aborted && getToken() === session)
          setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      } finally {
        if (active && getToken() === session) setLoading(false);
      }
    })();
    return () => {
      active = false;
      c.abort();
    };
  }, [session, query, cursor, revision]);
  const search = (e: FormEvent) => {
    e.preventDefault();
    setCursor(null);
    setHistory([]);
    setQuery(draft.trim());
    setRevision((n) => n + 1);
  };
  return (
    <main className="admin-page">
      <header className="admin-head">
        <div>
          <h1>ภาพรวมสมาชิกสำหรับผู้ดูแล</h1>
          <p className="admin-sub">
            แสดงเฉพาะข้อมูลสถานะสมาชิก ไม่แสดงยอดเงินหรือรายละเอียดการเงิน
          </p>
        </div>
        <button className="admin-logout" onClick={() => removeToken()}>
          <LogOut size={16} aria-hidden="true" /> ออกจากระบบ
        </button>
      </header>
      {forbidden ? (
        <section className="admin-forbidden" role="alert">
          <h2>403 — ไม่มีสิทธิ์เข้าถึง</h2>
          <p>หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</p>
          <Link to="/overview">กลับหน้าภาพรวม</Link>
        </section>
      ) : (
        <>
          {loading && (
            <p className="admin-status" role="status">
              กำลังโหลดข้อมูลสมาชิก...
            </p>
          )}
          {error && (
            <div className="admin-error" role="alert">
              <p>{error}</p>
              <button onClick={() => setRevision((n) => n + 1)}>ลองใหม่</button>
              <button
                onClick={() => {
                  setCursor(null);
                  setHistory([]);
                  setRevision((n) => n + 1);
                }}
              >
                เริ่มค้นหาใหม่
              </button>
            </div>
          )}
          {data && (
            <section className="admin-summary" aria-label="สรุปสมาชิก">
              {(
                [
                  ["สมาชิกทั้งหมด", data.summary.totalMembers],
                  ["สมาชิกใหม่เดือนปัจจุบัน", data.summary.newMembers],
                  ["สมาชิกออนไลน์ตอนนี้", data.summary.activeMembers ?? 0],
                  ["ผ่านความพร้อมข้อมูลพื้นฐาน", data.summary.basicReadyMembers],
                ] as const
              ).map(([label, value], i) => {
                const total = data.summary.totalMembers,
                  share = total ? Math.round((value / total) * 100) : 0;
                return (
                  <article key={label} className={"is-c" + i}>
                    <h2>{label}</h2>
                    <strong>
                      {value.toLocaleString("th-TH")} <small>คน</small>
                    </strong>
                    {i === 0 ? (
                      <p>บัญชีสมาชิกที่ยังเปิดใช้งาน</p>
                    ) : (
                      <>
                        <span className="admin-kpi-bar" aria-hidden="true">
                          <span style={{ width: share + "%" }} />
                        </span>
                        <p>{share}% ของสมาชิกทั้งหมด</p>
                      </>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          <section className="admin-panel" aria-label="สมาชิก">
            <div className="admin-panel-head">
              <div>
                <h2>รายชื่อสมาชิก</h2>
                {data && (
                  <p>
                    สรุปถึง {thaiDate(data.summary.asOfDate)} ตาม Asia/Bangkok ·
                    ไม่รวมบัญชีปิดแล้วและบัญชี Admin
                  </p>
                )}
              </div>
              <form className="admin-search" onSubmit={search} role="search">
                <label>
                  <Search size={16} aria-hidden="true" />
                  <input
                    aria-label="ค้นหาชื่อ อีเมล หรือ ID"
                    placeholder="ค้นหาชื่อ อีเมล หรือ ID"
                    value={draft}
                    maxLength={120}
                    onChange={(e) => setDraft(e.target.value)}
                  />
                </label>
                <button>ค้นหา</button>
              </form>
            </div>
            {data &&
              (!data.page.items.length ? (
                <p className="admin-empty" role="status">
                  ไม่พบสมาชิก
                </p>
              ) : (
                <div
                  className="admin-table"
                  role="region"
                  aria-label="รายชื่อสมาชิก"
                  tabIndex={0}
                >
                  <table>
                    <caption>ข้อมูลสมาชิกที่อนุญาตให้ผู้ดูแลตรวจสอบ</caption>
                    <thead>
                      <tr>
                        {[
                          "รหัสผู้ใช้",
                          "สมาชิก",
                          "วันสมัคร",
                          "เข้าใช้ล่าสุด",
                          "ธุรกรรม",
                          "ความพร้อมข้อมูลพื้นฐาน",
                        ].map((h) => (
                          <th key={h} scope="col">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.page.items.map((u) => (
                        <tr key={u.id}>
                          <td>
                            <span className="admin-code" title={u.id}>
                              {memberCode(u)}
                            </span>
                          </td>
                          <td>
                            <div className="admin-member">
                              <span className="admin-avatar" aria-hidden="true">
                                {(u.displayName ?? u.email)
                                  .charAt(0)
                                  .toUpperCase()}
                              </span>
                              <span>
                                <b>{u.displayName ?? "ไม่ได้ระบุชื่อ"}</b>
                                <small>{u.email}</small>
                              </span>
                            </div>
                          </td>
                          <td>{date(u.createdAt)}</td>
                          <td>{date(u.lastLoginAt)}</td>
                          <td className="admin-num">
                            {u.transactionCount.toLocaleString("th-TH")}
                          </td>
                          <td>
                            <span
                              className={
                                "admin-pill" +
                                (u.basicReadiness ? " is-ready" : "")
                              }
                            >
                              {u.basicReadiness
                                ? "พร้อมข้อมูลพื้นฐาน"
                                : "ยังไม่พร้อม"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            {data && (
              <div className="admin-panel-foot">
                <p>
                  ความพร้อมข้อมูลพื้นฐาน: รายจ่ายอย่างน้อย 30 รายการ ครอบคลุม 30
                  วันรวมวันแรกและวันสุดท้าย ถึงวันที่{" "}
                  {thaiDate(data.page.asOfDate)} ไม่ได้หมายความว่าทุกโมดูลพร้อมวิเคราะห์
                </p>
                <nav aria-label="แบ่งหน้าสมาชิก">
                  <button
                    disabled={!history.length}
                    onClick={() => {
                      setCursor(history[history.length - 1] ?? null);
                      setHistory((h) => h.slice(0, -1));
                    }}
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    disabled={!data.page.hasMore}
                    onClick={() => {
                      setHistory((h) => [...h, cursor]);
                      setCursor(data.page.nextCursor);
                    }}
                  >
                    ถัดไป
                  </button>
                </nav>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
