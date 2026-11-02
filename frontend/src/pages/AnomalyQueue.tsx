import { thaiDate } from "../utils/thaiDate";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Hourglass, ShieldCheck, ShieldOff } from "lucide-react";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import AnomalyDetails from "../components/AnomalyDetails";
import "./AnomalyQueue.css";
type Item = {
  id: string;
  revision: number;
  originalTransactionId: string;
  severity: number;
  waiting: boolean;
  snapshot: {
    transaction: {
      amount: string;
      categoryName: string;
      date: string;
      time?: string | null;
    };
    scope?: { amount: string; time: string };
    assessment: { amount: { status: string }; time: { status: string } };
  };
};
type Queue = {
  readiness: {
    asOfDate: string;
    count: number;
    inclusiveDays: number;
    ready: boolean;
    enabled: boolean;
  };
  items: Item[];
  total: number;
  offset: number;
  limit: number;
  pendingEvaluation: number;
  levelShifts?: LevelShift[];
};
type LevelShift = {
  id: string;
  categoryName: string;
  direction: "up" | "down";
  startDate: string;
  covered: number;
};
// ISSUE-ANOM-1: one question for a whole category instead of one per item. The text says what each answer does
// to the covered items, so nothing changes silently.
function LevelShiftCard({ shift, onDone }: { shift: LevelShift; onDone: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const up = shift.direction === "up";
  const answer = async (action: "confirmed" | "rejected") => {
    setBusy(true);
    setError("");
    try {
      const r = await apiFetch("/anomaly/level-shifts/" + shift.id + "/action", {
        method: "POST",
        body: JSON.stringify({ action, expectedActionId: null }),
      });
      if (!r.ok) throw Error();
      window.dispatchEvent(new Event("spendsense-anomaly-decision"));
      onDone();
    } catch {
      setError("บันทึกคำตอบไม่สำเร็จ กรุณาลองใหม่");
      setBusy(false);
    }
  };
  return (
    <article className="anomaly-shift" aria-labelledby={"shift-" + shift.id}>
      <h2 id={"shift-" + shift.id}>
        ค่าใช้จ่ายหมวด{shift.categoryName}{" "}
        {up ? "สูงขึ้นเป็นระดับใหม่หรือไม่" : "ลดลงเป็นระดับใหม่หรือไม่"}
      </h2>
      <p>
        ตั้งแต่ {thaiDate(shift.startDate)} รายการในหมวดนี้
        {up ? "สูงกว่าเดิม" : "ต่ำกว่าเดิม"}ติดกันหลายรายการ
        {up
          ? ` ระบบจึงรวม ${shift.covered} รายการไว้เป็นเรื่องเดียว แทนการถามทีละรายการ`
          : " เช่น อาจยกเลิกรายจ่ายประจำบางอย่าง"}
      </p>
      <dl className="anomaly-shift-outcomes">
        <dt>ถ้าตอบว่าใช่</dt>
        <dd>
          {up
            ? `ทั้ง ${shift.covered} รายการจะถูกบันทึกว่า "ปกติ" ทีละรายการ (ดูได้ในประวัติของแต่ละรายการ) และระบบจะใช้ระดับใหม่นี้เป็นค่าปกติของหมวด`
            : "ระบบจะใช้ระดับที่ลดลงนี้เป็นค่าปกติของหมวด ไม่มีรายการใดถูกเปลี่ยน"}
        </dd>
        <dt>ถ้าตอบว่าไม่ใช่</dt>
        <dd>
          {up
            ? `ทั้ง ${shift.covered} รายการจะกลับมาให้ตรวจทีละรายการในหน้านี้ ไม่มีการแจ้งเตือนเพิ่ม`
            : "ระบบใช้ค่าปกติเดิมต่อ"}
        </dd>
      </dl>
      <div className="anomaly-shift-buttons">
        <button disabled={busy} onClick={() => void answer("confirmed")}>
          ใช่ เป็นระดับใหม่
        </button>
        <button disabled={busy} onClick={() => void answer("rejected")}>
          ไม่ใช่
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </article>
  );
}
export default function AnomalyQueue() {
  const session = useSessionKey();
  return <QueueBody key={session} session={session} />;
}
function QueueBody({ session }: { session: string | null }) {
  const detailRef = useRef<HTMLElement | null>(null);
  const choose = (id: string) => {
    setSelected(id);
    if (window.matchMedia("(max-width: 800px)").matches)
      requestAnimationFrame(() => {
        detailRef.current?.focus();
        detailRef.current?.scrollIntoView({
          block: "start",
          behavior: "smooth",
        });
      });
  };
  const [filter, setFilter] = useState("waiting"),
    [offset, setOffset] = useState(0),
    [reload, setReload] = useState(0),
    [data, setData] = useState<Queue | null>(null),
    [selected, setSelected] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const c = new AbortController();
    setError("");
    void (async () => {
      try {
        const r = await apiFetch(
          "/anomaly/queue?filter=" + filter + "&offset=" + offset,
          { signal: c.signal },
        );
        if (!r.ok) throw Error();
        const d = await r.json();
        if (active && getToken() === session) {
          if (!d.items.length && offset > 0 && d.total <= offset) {
            setOffset(
              Math.max(0, Math.floor(Math.max(0, d.total - 1) / 25) * 25),
            );
            return;
          }
          setData(d);
          setSelected((previous) =>
            d.items.some((i: Item) => i.originalTransactionId === previous)
              ? previous
              : (d.items[0]?.originalTransactionId ?? null),
          );
        }
      } catch {
        if (active && !c.signal.aborted && getToken() === session)
          setError("โหลดรายการไม่สำเร็จ");
      }
    })();
    return () => {
      active = false;
      c.abort();
    };
  }, [session, filter, offset, reload]);
  useEffect(() => {
    const update = () => setReload((n) => n + 1);
    window.addEventListener("spendsense-anomaly-decision", update);
    return () =>
      window.removeEventListener("spendsense-anomaly-decision", update);
  }, []);
  return (
    <main className="anomaly-queue">
      <header className="compact-page-toolbar">
        <h1 className="page-heading-accessible">รายการที่ควรตรวจสอบ</h1>
      </header>
      <nav aria-label="ตัวกรองรายการ">
        {[
          ["all", "ทั้งหมด"],
          ["waiting", "รอตรวจสอบ"],
          ["amount", "ยอดสูงกว่ารูปแบบเดิม"],
          ["time", "ช่วงเวลาที่พบน้อย"],
        ].map(([v, label]) => (
          <button
            key={v}
            aria-pressed={filter === v}
            onClick={() => {
              if (v === filter) return;
              setData(null);
              setSelected(null);
              setFilter(v);
              setOffset(0);
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      <button
        className="anomaly-refresh"
        onClick={() => setReload((n) => n + 1)}
      >
        โหลดสถานะล่าสุด
      </button>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setReload((n) => n + 1)}>ลองใหม่</button>
        </p>
      ) : !data ? (
        <p role="status">กำลังโหลดรายการ...</p>
      ) : (
        <>
          <p className="anomaly-queue-count" role="status">
            {data.total} รายการในตัวกรองนี้ · รอระบบประเมิน{" "}
            {data.pendingEvaluation} รายการ
          </p>
          {!!data.levelShifts?.length && (
            <section className="anomaly-shifts" aria-label="ค่าใช้จ่ายที่อาจขยับเป็นระดับใหม่">
              {data.levelShifts.map((s) => (
                <LevelShiftCard key={s.id} shift={s} onDone={() => setReload((n) => n + 1)} />
              ))}
            </section>
          )}
          {!data.items.length && data.levelShifts?.length ? null : !data.items.length ? (
            <section className="anomaly-empty" aria-label="รายการตามความสำคัญ">
              <span
                className={
                  "anomaly-empty-icon" +
                  (!data.readiness.enabled || !data.readiness.ready ? " is-pending" : "")
                }
                aria-hidden="true"
              >
                {!data.readiness.enabled ? (
                  <ShieldOff size={34} strokeWidth={1.6} />
                ) : !data.readiness.ready ? (
                  <Hourglass size={34} strokeWidth={1.6} />
                ) : (
                  <ShieldCheck size={34} strokeWidth={1.6} />
                )}
              </span>
              <h2 role="status">
                {filter === "waiting"
                  ? "ไม่มีรายการรอตรวจสอบ"
                  : "ไม่มีรายการในตัวกรองนี้"}
              </h2>
              {!data.readiness.enabled ? (
                <>
                  <p>การตรวจอัตโนมัติยังปิดอยู่ ระบบจึงยังไม่คัดรายการที่ผิดปกติ</p>
                  <Link className="anomaly-empty-cta" to="/settings">
                    เปิดการตรวจใน Settings
                  </Link>
                </>
              ) : !data.readiness.ready ? (
                <>
                  <p>ข้อมูลยังไม่พอให้ระบบเริ่มตรวจ ต้องมีรายจ่ายอย่างน้อย 30 รายการ ครอบคลุม 30 วัน</p>
                  <div className="anomaly-empty-progress">
                    {[
                      ["รายการ", data.readiness.count],
                      ["วัน", data.readiness.inclusiveDays],
                    ].map(([label, n]) => (
                      <div key={label}>
                        <span>
                          {label} <b>{Math.min(Number(n), 30)}/30</b>
                        </span>
                        <span className="anomaly-empty-bar">
                          <span style={{ width: (Math.min(Number(n), 30) / 30) * 100 + "%" }} />
                        </span>
                      </div>
                    ))}
                  </div>
                  <Link className="anomaly-empty-cta" to="/transactions/add">
                    บันทึกรายการ
                  </Link>
                </>
              ) : (
                <>
                  <p>
                    {filter === "waiting"
                      ? "ทุกรายการที่ระบบพบได้รับการตรวจแล้ว ไม่มีอะไรค้างอยู่"
                      : "ยังไม่พบรายการที่ตรงกับตัวกรองนี้ ลองดูตัวกรองอื่น"}
                    {data.pendingEvaluation > 0 &&
                      " · รอระบบประเมินอีก " + data.pendingEvaluation + " รายการ"}
                  </p>
                  {filter !== "all" && (
                    <button
                      className="anomaly-empty-cta"
                      onClick={() => {
                        setData(null);
                        setSelected(null);
                        setFilter("all");
                        setOffset(0);
                      }}
                    >
                      ดูทั้งหมด
                    </button>
                  )}
                </>
              )}
            </section>
          ) : (
          <div className="anomaly-queue-grid">
            <section aria-label="รายการตามความสำคัญ">
              {(
                <ul className="anomaly-transaction-list">
                  {data.items.map((i) => (
                    <li key={i.id}>
                      <p className="anomaly-list-date">
                        {thaiDate(i.snapshot.transaction.date)}
                      </p>
                      <button
                        className={
                          "anomaly-transaction-row " +
                          (i.severity === 0 ? "priority" : "attention")
                        }
                        aria-pressed={selected === i.originalTransactionId}
                        aria-controls="anomaly-selected-detail"
                        onClick={() => choose(i.originalTransactionId)}
                      >
                        <span className="anomaly-row-name">
                          <span
                            className="anomaly-severity-dot"
                            aria-hidden="true"
                          />
                          {i.snapshot.transaction.categoryName}
                        </span>
                        <strong className="anomaly-row-amount">
                          {Number(i.snapshot.transaction.amount).toLocaleString(
                            "th-TH",
                            {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            },
                          )}{" "}
                          <small>บาท</small>
                        </strong>
                        <span className="anomaly-row-status">
                          {i.waiting ? "รอตรวจสอบ" : "ตัดสินแล้ว"} ·{" "}
                          {i.severity === 0
                            ? "ควรตรวจสอบเป็นพิเศษ"
                            : "ควรตรวจสอบ"}
                        </span>
                        <span className="anomaly-row-time">
                          {i.snapshot.transaction.time ?? "ไม่ระบุเวลา"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="anomaly-actions">
                <button
                  disabled={offset === 0}
                  onClick={() => setOffset((n) => Math.max(0, n - 25))}
                >
                  ก่อนหน้า
                </button>
                <button
                  disabled={offset + 25 >= data.total}
                  onClick={() => setOffset((n) => n + 25)}
                >
                  ถัดไป
                </button>
              </div>
            </section>
            <aside
              id="anomaly-selected-detail"
              ref={detailRef}
              tabIndex={-1}
              aria-label="รายละเอียดรายการที่เลือก"
            >
              <button
                className="anomaly-back-to-list"
                onClick={() => {
                  const row = document.querySelector<HTMLButtonElement>(
                    '.anomaly-transaction-row[aria-pressed="true"]',
                  );
                  row?.focus();
                  row?.scrollIntoView({ block: "center" });
                }}
              >
                กลับไปรายการ
              </button>
              {selected ? (
                <>
                  <Link
                    className="anomaly-edit-source"
                    to={"/transactions/" + selected + "/edit"}
                  >
                    แก้หมวดหรือข้อมูลก่อนตัดสิน
                  </Link>
                  <AnomalyDetails
                    expanded
                    key={selected}
                    path={"/transactions/" + selected + "/anomaly"}
                  />
                </>
              ) : (
                <p>เลือกรายการเพื่อดูเหตุผลและหลักฐาน</p>
              )}
            </aside>
          </div>
          )}
        </>
      )}
    </main>
  );
}
