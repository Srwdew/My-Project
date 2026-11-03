import { thaiDate } from "../utils/thaiDate";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { getToken } from '../auth';
import { moneyText } from '../utils/dashboard';
import { extendText } from '../utils/goalDuration';

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
type AlertCard = {
  tier: number; code: string;
  budgetLeft?: string; overBudget?: string; perDay?: string | null; daysLeft?: number; spanDays?: number;
  requiredMonthly?: string; availableMonthly?: string; shortfall?: string; goalCount?: number;
  alternatives?: { budgetReductionAlonePossible: boolean; targetBudget: string | null; targetIncome: string } | null;
  goalOptions?: { extendToMonths: number | null; lowerTargetTo: string | null } | null;
  goalOptionsUnavailable?: string | null;
  id?: string; amount?: string; date?: string; categoryName?: string;
};
type Alerts = { cards: AlertCard[]; flaggedTotal: number; levelShiftsWaiting: number };
const RECORDED_ONLY = 'ประเมินจากรายการที่บันทึก ไม่รวมรายจ่ายที่ยังไม่ได้บันทึก';
const budgetLine = (c: AlertCard) => Number(c.overBudget) > 0
  ? `ใช้เกินงบแล้ว ${moneyText(c.overBudget!)} บาท`
  : `งบเหลือ ${moneyText(c.budgetLeft!)} บาท`;
function AlertItem({ card: c }: { card: AlertCard }) {
  if (c.tier === 1) return <li className="alert-card alert-tier-1">
    <strong>งบอาจไม่พอถึงสิ้นเดือน</strong>
    <p>{budgetLine(c)} อีก {c.daysLeft} วันถึงสิ้นเดือน{c.perDay ? ` ใช้ได้วันละ ${c.perDay} บาท` : ''}</p>
    <small>{RECORDED_ONLY}</small> <Link to="/budget">ดูงบประมาณ</Link>
  </li>;
  if (c.code === 'pace_over_next_cycle') return <li className="alert-card alert-tier-2">
    <strong>ต้นเดือนหน้าอาจใช้เร็วกว่างบ</strong>
    <p>เทียบ {c.spanDays} วันแรกของเดือนหน้ากับงบเดือนหน้าที่ตั้งไว้</p>
    <small>{RECORDED_ONLY}</small> <Link to="/budget">ดูงบประมาณ</Link>
  </li>;
  if (c.tier === 2) return <li className="alert-card alert-tier-2">
    <strong>7 วันข้างหน้าอาจใช้เร็วกว่างบ</strong>
    <p>{budgetLine(c)}{c.perDay ? ` เฉลี่ยใช้ได้วันละ ${c.perDay} บาท จนถึงสิ้นเดือน` : ''}</p>
    <small>{RECORDED_ONLY}</small> <Link to="/budget">ดูงบประมาณ</Link>
  </li>;
  if (c.tier === 3) {
    const available = Number(c.availableMonthly), alt = c.alternatives, one = c.goalOptions;
    return <li className="alert-card alert-tier-3">
      <strong>เป้าออมรวมสูงกว่าเงินที่เหลือตามแผน</strong>
      <p>ต้องออมรวม {moneyText(c.requiredMonthly!)} บาท/เดือน {available < 0
        ? `รายได้ที่ตั้งไว้น้อยกว่างบ ${moneyText(String(-available))} บาท/เดือน`
        : `ตามรายได้และงบที่ตั้งไว้เหลือ ${moneyText(c.availableMonthly!)} บาท/เดือน`} ขาด {moneyText(c.shortfall!)} บาท/เดือน</p>
      <ul className="alert-options">
        {alt?.budgetReductionAlonePossible && alt.targetBudget && <li>ลดงบเหลือ {moneyText(alt.targetBudget)} บาท</li>}
        {alt && <li>เพิ่มรายได้เป็น {moneyText(alt.targetIncome)} บาท</li>}
        {one?.extendToMonths != null && <li>{extendText(one.extendToMonths)}</li>}
        {one?.lowerTargetTo != null && <li>ลดยอดเป้าเหลือ {moneyText(one.lowerTargetTo)} บาท</li>}
      </ul>
      {c.goalOptionsUnavailable && <small>มีหลายเป้าที่ใช้เงินเหลือก้อนเดียวกัน จึงยังคำนวณยืดเวลาหรือลดยอดแยกรายเป้าไม่ได้</small>}
      <small>เงินที่เก็บเข้าเป้าหมายไม่ต้องบันทึกเป็นรายจ่าย</small> <Link to="/goals">ดูเป้าหมาย</Link>
    </li>;
  }
  return <li className="alert-card alert-tier-4">
    <strong>รายการนี้รอคุณตรวจ</strong>
    <p>{c.categoryName} {moneyText(c.amount!)} บาท วันที่ {thaiDate(c.date)} ต่างจากแบบที่เคยบันทึก</p>
    <small>{RECORDED_ONLY}</small>
  </li>;
}
export function AlertsOverview({ session, today }: { session: string | null; today: string }) {
  const { data, error, retry } = useReadOnlySummary<Alerts>('/alerts', session, today);
  const waiting = data ? data.flaggedTotal + data.levelShiftsWaiting : 0;
  if (error) return <section className="dashboard-alerts" role="alert"><p>โหลดสถานะงบและเป้าหมายไม่สำเร็จ</p><button onClick={retry}>ลองโหลดอีกครั้ง</button></section>;
  if (!data || (!data.cards.length && !waiting)) return null;
  return <section className="dashboard-alerts" data-testid="overview-alerts" aria-labelledby="overview-alerts-title">
    <h2 id="overview-alerts-title">สถานะงบและเป้าหมาย</h2>
    <ul className="alert-list">{data.cards.map((c) => <AlertItem key={c.id ?? c.code} card={c} />)}</ul>
    {waiting > 0 && <Link className="dashboard-text-link" to="/anomaly?filter=waiting">ดูทั้งหมด {waiting} รายการ</Link>}
  </section>;
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

export function RecommendationsOverview({ session, today }: { session: string | null; today: string }) {
  const { data, loading, error, retry } = useReadOnlySummary<Recommendations>('/recommendations', session, today);
  const [showAll, setShowAll] = useState(false), [failed, setFailed] = useState(false);
  const act = async (id: string, action: 'followed' | 'dismissed') => {
    setFailed(false);
    try { const r = await apiFetch('/recommendations/' + id + '/action', { method: 'POST', body: JSON.stringify({ action }) }); if (!r.ok) throw Error(); retry(); }
    catch { setFailed(true); }
  };
  const gates = data ? [...new Set(data.closedRules.flatMap((r) => r.closedSources))] : [];
  return <div className="dashboard-guidance" data-testid="overview-recommendations">
    {loading && <p role="status">กำลังโหลดคำแนะนำ...</p>}
    {error && <div role="alert"><p>โหลดคำแนะนำไม่สำเร็จ</p><button onClick={retry}>ลองโหลดอีกครั้ง</button></div>}
    {failed && <p role="alert">บันทึกไม่สำเร็จ กรุณาลองใหม่</p>}
    {data && <>
      {/* Comes first: without flags the most urgent rule (running short in the next 7 days) cannot speak. */}
      {data.silencedByNoFlags.length > 0 && <div className="rec-invite">
        <strong>บอกเราก่อนว่าหมวดไหนลดได้</strong>
        <p>คำแนะนำบางข้อ เช่น การเตือนเมื่อเงินอาจไม่พอใน 7 วันข้างหน้า ต้องรู้ก่อนว่าหมวดไหนลดได้ เราจะไม่เสนอให้ลดค่าใช้จ่ายจำเป็นอย่างค่าเช่า ตอนนี้ยังไม่มีหมวดที่ถูกเลือกไว้</p>
      </div>}
      {data.shown.length > 0 ? <ul className="rec-list">{data.shown.map((r) => <RecommendationItem key={r.id} rec={r} onAction={act} />)}</ul>
        : !data.silencedByNoFlags.length && <p>{gates.length ? 'ยังมีข้อมูลไม่พอสำหรับคำแนะนำบางส่วน' : 'ตอนนี้ยังไม่มีคำแนะนำ'}</p>}
      {gates.includes('behavior') && <p className="dashboard-section-note">คำแนะนำจากพฤติกรรม: บันทึกรายจ่ายอีก {data.readiness.behavior.moreExpensesNeeded} รายการ และใช้งานอีก {data.readiness.behavior.moreDaysNeeded} วัน</p>}
      {gates.includes('forecast') && <p className="dashboard-section-note">คำแนะนำจากการพยากรณ์: บันทึกรายจ่ายอีก {data.readiness.forecast.moreExpensesNeeded} รายการ และใช้งานอีก {data.readiness.forecast.moreDaysNeeded} วัน</p>}
      {gates.includes('goals') && <p className="dashboard-section-note">คำแนะนำเรื่องเป้าหมาย: {data.readiness.goals.activeGoals ? 'ยังไม่มีรายได้ในรอบนี้' : 'ตั้งเป้าหมายอย่างน้อย 1 รายการ'}</p>}
      {data.more.length > 0 && <>
        <button type="button" className="rec-link" aria-expanded={showAll} onClick={() => setShowAll(!showAll)}>{showAll ? 'ซ่อนคำแนะนำอื่น' : `ดูคำแนะนำอื่นอีก ${data.more.length} ข้อ`}</button>
        {showAll && <ul className="rec-list">{data.more.map((r) => <RecommendationItem key={r.id} rec={r} onAction={act} />)}</ul>}
      </>}
    </>}
    <Link className="dashboard-text-link" to="/behavior">ดูรายละเอียดและหลักฐานพฤติกรรม</Link>
  </div>;
}
