import { thaiDate } from "../utils/thaiDate";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { getToken, useSessionKey } from '../auth';
import { bangkokDate } from '../utils/dashboard';
import { behaviorBanner, type BehaviorSummaryView } from '../utils/behaviorSummary';
import { todayCard, unlockRows, type TodayInput } from '../utils/todayCard';
import '../pages/Overview.css';

function useReadOnlySummary<T>(path: string, session: string | null, refreshKey = '') {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision(n => n + 1);
    window.addEventListener('spendsense-data-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => { window.removeEventListener('spendsense-data-changed', refresh); window.removeEventListener('focus', refresh); };
  }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setData(null); setError(false); setLoading(Boolean(session));
    if (session) void (async () => {
      try {
        const response = await apiFetch(path, { signal: controller.signal });
        if (!response.ok) throw Error();
        const value = await response.json() as T;
        if (active && getToken() === session) setData(value);
      } catch { if (active && !controller.signal.aborted && getToken() === session) setError(true); }
      finally { if (active && getToken() === session) setLoading(false); }
    })();
    return () => { active = false; controller.abort(); };
  }, [path, session, revision, refreshKey]);
  return { data, loading, error, retry: () => setRevision(n => n + 1) };
}
// One /behavior request for Overview: the banner (same function as the Behavior page) and the comparison box share it.
export function useBehavior(session: string | null, today: string) {
  const summary = useReadOnlySummary<BehaviorSummary>('/behavior', session, today);
  const data = summary.data;
  return { ...summary, banner: data?.facts && data.readiness ? { ...behaviorBanner(data), periods: data.periods } : null };
}
type BehaviorSummary = Omit<BehaviorSummaryView, 'findings'> & {
  periods: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  findings: (BehaviorSummaryView['findings'][number] & { title: string; recommendation: string })[];
};
const BEHAVIOR_MIN = 30; // BEHAVIOR_RULE minimumCount and minimumSpan: both 30
type AlertsSummary = TodayInput & { forecastReadiness: { ready: boolean; transactionCount: number; observedSpanDays: number; moreExpensesNeeded: number; moreDaysNeeded: number } };
export const useAlerts = (session: string | null, today: string) => useReadOnlySummary<AlertsSummary>('/alerts', session, today);

export function TodayCard({ alerts }: { alerts: ReturnType<typeof useAlerts> }) {
  if (!alerts.data) return null;
  const c = todayCard(alerts.data);
  return <section className="today-card" aria-label="สถานะวันนี้">
    <div>
      <span className={'today-status today-' + c.tone}>{c.status}</span>
      <p>{c.text}</p>
      {c.recordedNote && <small>นับจากรายการที่บันทึก</small>}
    </div>
    <Link className="today-action" to={c.to}>{c.action}</Link>
  </section>;
}

export function UnlockProgress({ alerts, behavior }: { alerts: ReturnType<typeof useAlerts>; behavior: ReturnType<typeof useBehavior> }) {
  const f = alerts.data?.forecastReadiness, b = behavior.data?.readiness?.current;
  if (!f || !b) return null;
  const rows = unlockRows(
    { ready: f.ready, count: f.transactionCount, days: f.observedSpanDays, moreCount: f.moreExpensesNeeded, moreDays: f.moreDaysNeeded },
    { ready: b.ready, count: b.expenseCount, days: b.observedSpanDays, moreCount: Math.max(0, BEHAVIOR_MIN - b.expenseCount), moreDays: Math.max(0, BEHAVIOR_MIN - b.observedSpanDays) },
  );
  if (!rows.length) return null;
  return <section className="unlock-progress" aria-label="ความคืบหน้าก่อนเริ่มวิเคราะห์">
    <h2>อีกนิดเดียว ระบบจะเริ่มวิเคราะห์ให้</h2>
    {rows.map((r) => <div className="unlock-row" key={r.name}>
      <div><span>{r.name}</span><b className={r.ready ? 'today-status today-ok' : 'today-status today-info'}>{r.ready ? 'พร้อมแล้ว' : 'ยังขาด'}</b></div>
      <div className="unlock-bar" role="progressbar" aria-label={r.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={r.percent}><i style={{ width: r.percent + '%' }} /></div>
      {r.text && <small>{r.text}</small>}
    </div>)}
  </section>;
}
// Same /behavior answer as the Behavior page, so the two pages cannot disagree. Nothing is calculated here.
export function BehaviorOverview({ behavior }: { behavior: ReturnType<typeof useBehavior> }) {
  const { data, loading, error, retry } = behavior;
  const current = data?.readiness?.current;
  const findings = data?.readiness?.comparisonReady ? (data.findings ?? []).slice(0, 3) : [];
  return <div className="dashboard-guidance" data-testid="overview-behavior">
    {loading && <p role="status">กำลังโหลดสรุปพฤติกรรม...</p>}
    {error && <div role="alert"><p>โหลดพฤติกรรมไม่สำเร็จ</p><button onClick={retry}>ลองโหลดพฤติกรรมอีกครั้ง</button></div>}
    {data && current && <>
      <p className="dashboard-section-note">ช่วง {thaiDate(data.periods.current.startDate)} ถึง {thaiDate(data.periods.current.endDate)} เทียบ {thaiDate(data.periods.previous.startDate)} ถึง {thaiDate(data.periods.previous.endDate)} · ไม่ใช่เดือนที่เลือกด้านบน</p>
      {!current.ready
        ? <p role="status">ยังสรุปพฤติกรรมไม่ได้: บันทึกรายจ่ายอีก {Math.max(0, BEHAVIOR_MIN - current.expenseCount)} รายการ และให้ครอบคลุมอีก {Math.max(0, BEHAVIOR_MIN - current.observedSpanDays)} วัน</p>
        : !data.readiness.comparisonReady
          ? <p role="status">ยังเทียบกับช่วงก่อนไม่ได้: ข้อมูลช่วงก่อนหน้ายังไม่ถึงเกณฑ์</p>
          : findings.length
            ? <ul className="rec-list">{findings.map((f) => <li key={f.ruleId + f.title} className="rec-item"><strong>{f.title}</strong><p>{f.recommendation}</p></li>)}</ul>
            : <p>ข้อมูลผ่านเกณฑ์ แต่ยังไม่มีข้อค้นพบตามกติกาปัจจุบัน</p>}
      <p className="dashboard-section-note">วันที่ไม่มีรายการไม่ได้ยืนยันว่าไม่มีการใช้จ่ายจริง เกณฑ์ 30 รายการและระยะ 30 วันไม่ยืนยันข้อมูลครบหรือมีนัยสำคัญทางสถิติ{findings.length ? ' คำแนะนำอ้างข้อมูลที่พบ ไม่ได้พิสูจน์สาเหตุหรือแรงจูงใจ' : ''}{findings.some((f) => f.ruleId.startsWith('possible_recurrence_')) ? ' รูปแบบซ้ำเป็นหลักฐานในช่วงที่เลือก ไม่ยืนยันว่าเกิดซ้ำต่อเนื่องจนถึงปัจจุบันหรือเป็นบิลเดียวกัน' : ''}</p>
    </>}
    <Link className="dashboard-text-link" to="/behavior">ดูรายละเอียดและหลักฐานพฤติกรรม</Link>
  </div>;
}
export function AnomalyOverview({ session }: { session: string | null }) {
  const { data, loading, error, retry } = useReadOnlySummary<{ total: number; pendingEvaluation: number }>('/anomaly/queue?filter=waiting&limit=1', session);
  return <div className="dashboard-guidance" data-testid="overview-anomaly">
    {loading && <p role="status">กำลังโหลดคิวรอตรวจสอบ...</p>}
    {error && <div role="alert"><p>โหลดคิวไม่สำเร็จ</p><button onClick={retry}>ลองโหลดคิวอีกครั้ง</button></div>}
    {data && <><p><strong>{data.total} รายการรอตัดสิน</strong></p><p>{data.total === 0 ? 'ไม่มีรายการที่รอคำตัดสิน' : 'เปิดคิวเพื่อตรวจเหตุผลและตัดสินแต่ละรายการ'}</p>
      {data.pendingEvaluation > 0 && <p>อีก {data.pendingEvaluation} รายการรอระบบประเมิน ยังไม่ใช่รายการที่รอตัดสิน</p>}</>}
    <p className="dashboard-section-note">คิวปัจจุบันทุกเดือนของบัญชี · นับธุรกรรม ไม่ใช่จำนวนมิติ · การดูหน้านี้ไม่บันทึกคำตัดสิน</p>
    <Link className="dashboard-text-link" to="/anomaly?filter=waiting">เปิดคิวรอตรวจสอบ</Link>
  </div>;
}
type RecText = { what: string; action: string; outcome: string };
type Rec = { id: string; ruleId: string; subject: string | null; text: RecText; supersededBy: { ruleId: string; subject: string | null } | null };
type Gate = { moreExpensesNeeded: number; moreDaysNeeded: number };
type Recommendations = {
  shown: Rec[]; more: Rec[]; silencedByNoFlags: string[];
  closedRules: { ruleId: string; closedSources: ('behavior' | 'forecast' | 'goals')[] }[];
  readiness: { behavior: Gate; forecast: Gate; goals: { activeGoals: number; hasIncomeThisCycle: boolean } };
};
type Provenance = { text: RecText; shownAt: string; dataRange: { kind: 'window' | 'cycle' | 'month' | 'forecast'; startDate: string; endDate: string } | null; citationTier: number };
// The dates each rule was computed from, labelled so a 30-day window is never mistaken for the cycle.
const rangeLabel: Record<NonNullable<Provenance['dataRange']>['kind'], string> = {
  window: 'ข้อมูล 30 วันที่ผ่านมา', cycle: 'ข้อมูลรอบนี้', month: 'ข้อมูลเดือนที่จบแล้ว', forecast: 'ช่วงที่คาดการณ์',
};

function RecommendationSource({ id }: { id: string }) {
  const [data, setData] = useState<Provenance | null>(null), [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try { const r = await apiFetch('/recommendations/' + id); if (!r.ok) throw Error(); const v = await r.json() as Provenance; if (active) setData(v); }
      catch { if (active) setError(true); }
    })();
    return () => { active = false; };
  }, [id]);
  if (error) return <p role="alert" className="rec-source">โหลดที่มาไม่สำเร็จ</p>;
  if (!data) return <p role="status" className="rec-source">กำลังโหลดที่มา...</p>;
  // Everything here comes from the saved record of this recommendation, not from today's data.
  return <div className="rec-source">
    {data.dataRange && <p><strong>{rangeLabel[data.dataRange.kind]}</strong> {thaiDate(data.dataRange.startDate)} ถึง {thaiDate(data.dataRange.endDate)}</p>}
    <p>{data.citationTier === 1 ? 'คำนวณจากรายการที่คุณบันทึกไว้เองทั้งหมด ไม่ได้เทียบกับคนอื่น' : ''}</p>
    <p>ตัวเลขนี้คำนวณไว้เมื่อ {thaiDate(data.shownAt.slice(0, 10))} และจะไม่เปลี่ยนตามข้อมูลที่แก้ภายหลัง</p>
  </div>;
}

function RecommendationItem({ rec, onAction }: { rec: Rec; onAction: (id: string, action: 'followed' | 'dismissed') => void }) {
  const [open, setOpen] = useState(false);
  return <li className="rec-item">
    <p className="rec-what">{rec.text.what}</p>
    <p className="rec-action">{rec.text.action} <strong>{rec.text.outcome}</strong></p>
    {rec.supersededBy && <p className="rec-note">เรื่องเดียวกับคำแนะนำอีกข้อของหมวดนี้ ตัวเลขเป็นก้อนเดียวกัน ไม่ควรบวกรวม</p>}
    <div className="rec-buttons">
      <button type="button" onClick={() => onAction(rec.id, 'followed')}>จะลองทำ</button>
      <button type="button" onClick={() => onAction(rec.id, 'dismissed')}>ไม่ต้องแนะนำข้อนี้</button>
      <button type="button" className="rec-link" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? 'ซ่อนที่มา' : 'ดูที่มา'}</button>
    </div>
    {open && <RecommendationSource id={rec.id} />}
  </li>;
}

// The engine still ranks and suppresses across all rules; each page only shows its own, at most 3 before "more".
export function PageRecommendations({ rules }: { rules: string[] }) {
  const session = useSessionKey(), today = bangkokDate();
  const { data, loading, error, retry } = useReadOnlySummary<Recommendations>('/recommendations', session, today);
  const [showAll, setShowAll] = useState(false), [failed, setFailed] = useState(false);
  const act = async (id: string, action: 'followed' | 'dismissed') => {
    setFailed(false);
    try { const r = await apiFetch('/recommendations/' + id + '/action', { method: 'POST', body: JSON.stringify({ action }) }); if (!r.ok) throw Error(); retry(); }
    catch { setFailed(true); }
  };
  const gates = data ? [...new Set(data.closedRules.filter((r) => rules.includes(r.ruleId)).flatMap((r) => r.closedSources))] : [];
  const mine = data ? [...data.shown, ...data.more].filter((r) => rules.includes(r.ruleId)) : [];
  const shown = mine.slice(0, 3), more = mine.slice(3);
  const silenced = data ? data.silencedByNoFlags.filter((r) => rules.includes(r)) : [];
  return <section className="dashboard-page rec-panel" aria-labelledby={'rec-title-' + rules[0]}><h2 id={'rec-title-' + rules[0]}>คำแนะนำสำหรับคุณ</h2><div className="dashboard-guidance" data-testid="page-recommendations">
    {loading && <p role="status">กำลังโหลดคำแนะนำ...</p>}
    {error && <div role="alert"><p>โหลดคำแนะนำไม่สำเร็จ</p><button onClick={retry}>ลองโหลดอีกครั้ง</button></div>}
    {failed && <p role="alert">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
    {data && <>
      {/* Comes first: without flags the most urgent rule (running short in the next 7 days) cannot speak. */}
      {silenced.length > 0 && <div className="rec-invite">
        <strong>บอกเราก่อนว่าหมวดไหนลดได้</strong>
        <p>คำแนะนำบางข้อ เช่น การเตือนเมื่อเงินอาจไม่พอใน 7 วันข้างหน้า ต้องรู้ก่อนว่าหมวดไหนลดได้ เราจะไม่เสนอให้ลดค่าใช้จ่ายจำเป็นอย่างค่าเช่า ตอนนี้ยังไม่มีหมวดที่ถูกเลือกไว้</p>
        <Link className="dashboard-text-link" to="/settings#flexible-categories">เลือกหมวดที่ลดได้</Link>
      </div>}
      {shown.length > 0 ? <ul className="rec-list">{shown.map((r) => <RecommendationItem key={r.id} rec={r} onAction={act} />)}</ul>
        : !silenced.length && <p>{gates.length ? 'ยังมีข้อมูลไม่พอสำหรับคำแนะนำบางส่วน' : 'ตอนนี้ยังไม่มีคำแนะนำ'}</p>}
      {gates.includes('behavior') && <p className="dashboard-section-note">คำแนะนำจากพฤติกรรม: บันทึกรายจ่ายอีก {data.readiness.behavior.moreExpensesNeeded} รายการ และใช้งานอีก {data.readiness.behavior.moreDaysNeeded} วัน</p>}
      {gates.includes('forecast') && <p className="dashboard-section-note">คำแนะนำจากการพยากรณ์: บันทึกรายจ่ายอีก {data.readiness.forecast.moreExpensesNeeded} รายการ และใช้งานอีก {data.readiness.forecast.moreDaysNeeded} วัน</p>}
      {gates.includes('goals') && <p className="dashboard-section-note">คำแนะนำเรื่องเป้าหมาย: {data.readiness.goals.activeGoals ? 'ยังไม่มีรายได้ในรอบนี้' : 'ตั้งเป้าหมายอย่างน้อย 1 รายการ'}</p>}
      {more.length > 0 && <>
        <button type="button" className="rec-link" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'ซ่อนคำแนะนำอื่น' : `ดูคำแนะนำอื่นอีก ${more.length} ข้อ`}</button>
        {showAll && <ul className="rec-list">{more.map((r) => <RecommendationItem key={r.id} rec={r} onAction={act} />)}</ul>}
      </>}
    </>}
  </div></section>;
}
