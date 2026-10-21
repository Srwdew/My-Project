import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../api';
import { getToken } from '../auth';

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
type BehaviorSummary = {
  periods: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  readiness: { current: { ready: boolean; expenseCount: number; observedSpanDays: number }; previous: { ready: boolean }; comparisonReady: boolean };
  findings: { ruleId: string; title: string; recommendation: string }[];
};
export function BehaviorOverview({ session, today }: { session: string | null; today: string }) {
  const { data, loading, error, retry } = useReadOnlySummary<BehaviorSummary>('/behavior', session, today);
  const ready = data?.readiness.current.ready && data.readiness.comparisonReady;
  const finding = ready ? data?.findings[0] : undefined;
  return <div className="dashboard-guidance" data-testid="overview-behavior">
    {loading && <p role="status">กำลังโหลดสรุปพฤติกรรม...</p>}
    {error && <div role="alert"><p>โหลดพฤติกรรมไม่สำเร็จ</p><button onClick={retry}>ลองโหลดพฤติกรรมอีกครั้ง</button></div>}
    {data && <>
      <p className="dashboard-section-note">ช่วงพฤติกรรม {data.periods.current.startDate} ถึง {data.periods.current.endDate} เทียบ {data.periods.previous.startDate} ถึง {data.periods.previous.endDate} · ใช้ช่วงเดิม 30 วันถึงเมื่อวาน ไม่ใช่เดือนที่เลือกด้านบน</p>
      {!ready ? <><p role="status">ข้อมูลยังไม่พร้อมสรุปการเปลี่ยนแปลง</p><p>ช่วงปัจจุบัน {data.readiness.current.expenseCount} รายการ ครอบคลุม {data.readiness.current.observedSpanDays} วัน · ต้องผ่านเกณฑ์ทั้งช่วงปัจจุบันและช่วงก่อนหน้า ดูเหตุผลเพิ่มเติมในหน้าพฤติกรรม</p></> :
        finding ? <><strong>{finding.title}</strong><p>{finding.recommendation}</p></> : <p>ข้อมูลผ่านเกณฑ์ แต่ยังไม่มีข้อค้นพบตามกติกาปัจจุบัน</p>}
    </>}
    <Link className="dashboard-text-link" to="/behavior">ดูรายละเอียดและหลักฐานพฤติกรรม</Link>
  </div>;
}
