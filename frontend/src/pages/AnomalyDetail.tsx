import { thaiDate } from "../utils/thaiDate";
import AnomalyBaselineSummary from "../components/AnomalyBaselineSummary";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import UserHeader from "../components/UserHeader";
import AnomalyReviewPanel from "../components/AnomalyReviewPanel";
import { apiFetch } from "../api";
import { getToken, useSessionKey } from "../auth";
import {
  assessmentLabel,
  explanation,
  eligibilityExplanation,
  evaluationChoices,
  currentAssessmentLabel,
  amountFormula,
  type AnomalyDetail as Detail,
  type Evaluation,
} from "../utils/anomalyPresentation";
import "./AnomalyDetail.css";

type Source = {
  amount: string;
  description: string | null;
  transactionDate: string;
  transactionTime: string | null;
  category?: { name: string } | null;
  type: string;
};
export default function AnomalyDetailPage() {
  const { notificationId, transactionId } = useParams();
  const session = useSessionKey();
  const id = notificationId ?? transactionId;
  const valid =
    !!id &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
  const path = notificationId
    ? "/notifications/" + notificationId + "/anomaly"
    : "/transactions/" + transactionId + "/anomaly";
  return (
    <main className="anomaly-page">
      <header className="anomaly-page-header compact-page-toolbar">
        <div>
          <Link to="/transactions">ธุรกรรม</Link>
          <h1 className="page-heading-accessible">
            รายละเอียดรายการที่ควรตรวจสอบ
          </h1>
        </div>
        <UserHeader />
      </header>
      {valid ? (
        <DetailBody
          key={session + path}
          path={path}
          session={session}
          transactionId={transactionId}
          fromNotice={!!notificationId}
        />
      ) : (
        <p role="alert">รหัสรายการไม่ถูกต้อง</p>
      )}
    </main>
  );
}
function DetailBody({
  path,
  session,
  transactionId,
  fromNotice,
}: {
  path: string;
  session: string | null;
  transactionId?: string;
  fromNotice: boolean;
}) {
  const [data, setData] = useState<Detail | null>(null),
    [source, setSource] = useState<Source | null>(null),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0),
    [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setData(null);
    setSource(null);
    setError("");
    void (async () => {
      try {
        const response = await apiFetch(path, { signal: controller.signal });
        if (!response.ok)
          throw Error(
            response.status === 404
              ? "ไม่พบรายการหรือคุณไม่มีสิทธิ์เข้าถึง"
              : response.status === 401
                ? "กรุณาเข้าสู่ระบบใหม่"
                : "โหลดรายละเอียดไม่สำเร็จ",
          );
        const detail: Detail = await response.json();
        let record: Source | null = null;
        if (
          transactionId &&
          !detail.latestEvaluation &&
          detail.sourceState !== "deleted"
        ) {
          const r = await apiFetch("/transactions/" + transactionId, {
            signal: controller.signal,
          });
          if (!r.ok) throw Error("โหลดข้อมูลต้นทางไม่สำเร็จ");
          record = await r.json();
        }
        if (active && !controller.signal.aborted && getToken() === session) {
          setData(detail);
          setSource(record);
        }
      } catch (e) {
        if (active && !controller.signal.aborted && getToken() === session)
          setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ");
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [path, session, transactionId, reload]);
  if (error)
    return (
      <section className="anomaly-card" role="alert">
        <p>{error}</p>
        <button onClick={() => setReload((n) => n + 1)}>ลองใหม่</button>
      </section>
    );
  if (!data)
    return (
      <section className="anomaly-card" role="status">
        กำลังโหลดรายละเอียด...
      </section>
    );
  const choices = evaluationChoices(data);
  const viewed =
    choices.find((e) => e.id === selected) ??
    (fromNotice ? data.notificationSnapshot : data.latestEvaluation) ??
    choices[0] ??
    null;
  const refresh = () => setReload((n) => n + 1);
  return (
    <>
      <section className="anomaly-card anomaly-current">
        <h2>สถานะรายการปัจจุบัน</h2>
        <strong>{currentAssessmentLabel(data)}</strong>
        <p>Revision ปัจจุบัน: {data.currentRevision ?? "ไม่มีต้นทางแล้ว"}</p>
        {data.pending && (
          <p>
            ผลที่เก็บไว้ด้านล่างเป็นประวัติ ยังไม่ใช่ผลของการประเมินที่กำลังรอ
          </p>
        )}
        {data.sourceState === "modified" && (
          <p>ธุรกรรมเปลี่ยนจากตอนแจ้งเตือนแล้ว</p>
        )}
        {data.sourceState === "deleted" && (
          <p>
            ยังดู snapshot และยืนยัน revision เดิมเป็นหลักฐานได้ แต่ไม่มีผลต่อ
            baseline
          </p>
        )}
        {!data.pending &&
          !data.latestAppliesToCurrent &&
          data.sourceState !== "deleted" && (
            <p>
              ยังไม่มีผลที่ใช้กับรายการปัจจุบัน
              อาจยังไม่เคยตรวจหรือเปลี่ยนประเภทแล้ว
            </p>
          )}
        {data.transactionLink &&
          /^\/transactions\/[0-9a-f-]+\/edit$/i.test(data.transactionLink) && (
            <Link to={data.transactionLink}>เปิดรายการต้นทาง</Link>
          )}
        <button type="button" onClick={refresh}>
          โหลดสถานะล่าสุด
        </button>
      </section>
      {choices.length > 1 && (
        <section className="anomaly-comparison" aria-label="เลือกผลประเมิน">
          {choices.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={viewed?.id === e.id}
              onClick={() => setSelected(e.id)}
            >
              <strong>
                {e.id === data.notificationSnapshot?.id
                  ? "ผลตอนแจ้งเตือน"
                  : "ผลประเมินล่าสุด"}
              </strong>
              <span>revision {e.revision}</span>
              <span>
                จำนวนเงิน: {assessmentLabel(e.snapshot.assessment.amount)}
              </span>
              <span>เวลา: {assessmentLabel(e.snapshot.assessment.time)}</span>
            </button>
          ))}
        </section>
      )}
      {viewed ? (
        <section
          className="anomaly-card anomaly-viewed"
          aria-label={"ผลประเมิน revision " + viewed.revision}
        >
          <h2>
            {choices.length === 1 &&
            data.notificationSnapshot &&
            data.latestEvaluation
              ? "ผลตอนแจ้งเตือนและผลล่าสุดเป็น evaluation เดียวกัน"
              : viewed.id === data.notificationSnapshot?.id
                ? "ผลตอนแจ้งเตือน"
                : "ผลประเมินล่าสุด"}
          </h2>
          <p className="anomaly-revision">
            กำลังดู revision {viewed.revision}
            {viewed.revision !== data.currentRevision
              ? " · หลักฐาน revision เดิม"
              : ""}
          </p>
          <div className="anomaly-transaction">
            <strong>{viewed.snapshot.transaction.amount} บาท</strong>
            <span>{viewed.snapshot.transaction.categoryName}</span>
            <span>
              {thaiDate(viewed.snapshot.transaction.date)} ·{" "}
              {viewed.snapshot.transaction.time ?? "ไม่ระบุเวลา"} (เวลาไทย)
            </span>
          </div>
          <AnomalyBaselineSummary snapshot={viewed.snapshot} />
          <div className="anomaly-dimensions">
            <DimensionCard evaluation={viewed} dimension="amount" />
            <DimensionCard evaluation={viewed} dimension="time" />
          </div>
          <details className="anomaly-method">
            <summary>วิธีตรวจ จำนวนประวัติ และเวอร์ชันกฎ</summary>
            <Method evaluation={viewed} />
          </details>
          {viewed.snapshot.gate?.ready === false ? (
            <p>ยังไม่ผ่านเกณฑ์เริ่มตรวจ จึงยังไม่ขอคำตัดสิน</p>
          ) : (
            <AnomalyReviewPanel
              key={session + ":" + viewed.id + ":" + reload}
              evaluationId={viewed.id}
              revision={viewed.revision}
              onDone={refresh}
              explicitRevision
            />
          )}
        </section>
      ) : (
        <section className="anomaly-card">
          <h2>{data.pending ? "รอประเมิน" : "ยังไม่ตรวจ"}</h2>
          {source && (
            <div className="anomaly-transaction">
              <strong>{source.amount} บาท</strong>
              <span>{source.category?.name ?? "ไม่ระบุหมวด"}</span>
              <span>
                {source.transactionDate.slice(0, 10)} ·{" "}
                {source.transactionTime?.slice(11, 16) || "ไม่ระบุเวลา"}{" "}
                (เวลาไทย) · {source.type === "expense" ? "รายจ่าย" : "รายรับ"}
              </span>
              {source.description && <p>{source.description}</p>}
            </div>
          )}
          <p>ยังไม่มี evaluation จึงไม่มีผลรายด้านหรือ revision ให้ยืนยัน</p>
        </section>
      )}
      <section className="anomaly-card">
        <h2>สิทธิ์เป็นข้อมูลอ้างอิงของรายการปัจจุบัน</h2>
        <p>ส่วนนี้อ้างอิง revision ปัจจุบัน ไม่ใช่ snapshot ที่เลือกด้านบน</p>
        <p>
          จำนวนเงิน:{" "}
          <strong>
            {data.amountBaselineEligible ? "ใช้ได้" : "ใช้ไม่ได้"}
          </strong>{" "}
          ·{" "}
          {data.amountBaselineReasons
            .map((r) => eligibilityExplanation[r] ?? r)
            .join(" · ")}
        </p>
        <p>
          เวลา:{" "}
          <strong>{data.timeBaselineEligible ? "ใช้ได้" : "ใช้ไม่ได้"}</strong>{" "}
          ·{" "}
          {data.timeBaselineReasons
            .map((r) => eligibilityExplanation[r] ?? r)
            .join(" · ")}
        </p>
      </section>
    </>
  );
}
function DimensionCard({
  evaluation: e,
  dimension,
}: {
  evaluation: Evaluation;
  dimension: "amount" | "time";
}) {
  const s = e.snapshot,
    d = s.assessment[dimension],
    b = s.baseline;
  return (
    <section className={"anomaly-dimension " + d.status}>
      <h3>{dimension === "amount" ? "จำนวนเงิน" : "เวลาเกิดรายการ"}</h3>
      <strong>{assessmentLabel(d)}</strong>
      <p>{explanation[d.reasonCode] ?? "ไม่มีคำอธิบายสำหรับกฎเวอร์ชันนี้"}</p>
      {dimension === "amount" && b.median !== null && (
        <p>
          ยอดรายการ {s.transaction.amount} บาท · ค่ากลางประวัติ {b.median} บาท
        </p>
      )}
      {dimension === "time" && (
        <p>
          {s.transaction.timeConfirmed
            ? "ผู้ใช้ยืนยันเวลาแล้ว"
            : "ไม่มีเวลาที่ยืนยัน"}
        </p>
      )}
    </section>
  );
}
function Method({ evaluation: e }: { evaluation: Evaluation }) {
  const s = e.snapshot,
    b = s.baseline,
    r = s.rules,
    formula = amountFormula(e);
  return (
    <div>
      <p>
        ประวัติตามขอบเขต baseline ที่แสดงด้านบน ตั้งแต่ {thaiDate(s.window.startDate)}{" "}
        ถึงก่อน {thaiDate(s.window.endExclusive)}
      </p>
      <p>
        จำนวนเงิน: {b.n} รายการ · {b.days} วันที่มีรายการ · span {b.span} วัน;
        ขั้นต่ำ {r.amountMin} / {r.amountDays} / {r.amountSpan}
      </p>
      {formula && (
        <>
          <p className="anomaly-formula">{formula}</p>
          <p>
            Median {b.median ?? "—"} · MAD {b.mad ?? "—"} · Q1 {b.q1 ?? "—"} ·
            Q3 {b.q3 ?? "—"}
          </p>
          <p>เท่ากับขอบเกณฑ์ยังไม่ถือว่าพบสัญญาณ</p>
        </>
      )}
      <p>
        เวลา: {b.timeN} รายการ · {b.timeDays} วันที่มีเวลา · span {b.timeSpan}{" "}
        วัน; ขั้นต่ำ {r.timeMin} / {r.timeDays} / {r.timeSpan}; coverage ขั้นต่ำ{" "}
        {Number(r.timeCoverage) * 100}%
      </p>
      {s.assessment.time.reasonCode === "time_rare_frequency" && (
        <p>
          ช่วงเดียวกัน {b.bucketCount}/{b.timeN} รายการ · รอบเวลา{" "}
          {b.nearbyCount}/{b.timeN} รายการ; ความถี่ bucket 4 ชั่วโมง
          และช่วงรอบเวลา −2 ถึงก่อน +2 ชั่วโมง ต้องต่ำกว่า{" "}
          {Number(r.rareFrequency) * 100}% ทั้งคู่
        </p>
      )}
      <p>
        Reason: {s.assessment.amount.reasonCode} /{" "}
        {s.assessment.time.reasonCode}
      </p>
      <p>Rule version: {e.ruleVersion}</p>
      <p>
        ประเมินเมื่อ{" "}
        {new Date(e.evaluatedAt).toLocaleString("th-TH", {
          timeZone: "Asia/Bangkok",
        })}
      </p>
    </div>
  );
}
