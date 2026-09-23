import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { apiFetch } from '../api';
import { getToken, useSessionKey } from '../auth';
import UserHeader from '../components/UserHeader';
import DashboardDaily from '../components/DashboardDaily';
import { bangkokDate, moneyText, shiftMonth, validDashboardMonth, type DailyAmount } from '../utils/dashboard';
import './Overview.css';
type Dashboard = {
  month: string; asOfDate: string; period: { startDate: string; effectiveEndDate: string; calendarEndDate: string; isCurrentMonth: boolean };
  summary: { transactionCount: number; incomeAmount: string; expenseAmount: string; netCashFlow: string; budgetAmount: string | null; budgetRemaining: string | null; budgetExceeded: boolean; hasTransactions: boolean };
  expenseCategories: { categoryId: string; categoryName: string; amount: string; percentage: string; transactionCount: number }[];
  daily: DailyAmount[];
  recentTransactions: { hasMore: boolean; items: { id: string; date: string; type: 'income' | 'expense'; amount: string; categoryName: string; description: string | null }[] };
  goals: { asOfDate: string; activeCount: number; notStartedCount: number; overdueCount: number; allocatedAmount: string; primaryGoal: { id: string; name: string; archivedAt: string | null; calculatedStatus: string; targetAmount: string; savedAmount: string; remainingAmount: string; progressPercent: string; progressBarPercent: string } | null };
};
const statuses: Record<string, string> = { active: 'กำลังออม', not_started: 'ยังไม่มีเงินจัดสรร', overdue: 'เลยกำหนด', completed: 'ครบเป้าหมาย' };
export default function Overview() {
  const session = useSessionKey(); const [params, setParams] = useSearchParams(); const [today, setToday] = useState(bangkokDate);
  useEffect(() => { const update = () => setToday(bangkokDate()); const timer = window.setInterval(update, 30000); window.addEventListener('focus', update); return () => { clearInterval(timer); window.removeEventListener('focus', update); }; }, []);
  const values = params.getAll('month'), month = values[0] ?? today.slice(0, 7);
  const valid = values.length <= 1 && validDashboardMonth(month, today);
  return <OverviewMonth key={`${session}:${month}:${today}:${valid}`} session={session} month={month} today={today} valid={valid} setMonth={m => setParams({ month: m })} />;
}
function OverviewMonth({ session, month, today, valid, setMonth }: { session: string | null; month: string; today: string; valid: boolean; setMonth: (m: string) => void }) {
  const [data, setData] = useState<Dashboard | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { const update = () => setRevision(v => v + 1); window.addEventListener('spendsense-data-changed', update); return () => window.removeEventListener('spendsense-data-changed', update); }, []);
  useEffect(() => {
    const controller = new AbortController(); let active = true; setData(null); setError(''); setLoading(true);
    if (!valid || !session) { setLoading(false); return () => { active = false; controller.abort(); }; }
    void (async () => { try { const r = await apiFetch('/dashboard?month=' + encodeURIComponent(month), { signal: controller.signal }); if (!r.ok) throw Error(); const result = await r.json() as Dashboard; if (active && getToken() === session && result.month === month) setData(result); }
      catch { if (active && !controller.signal.aborted && getToken() === session) setError('โหลด Dashboard ไม่สำเร็จ กรุณาลองใหม่'); }
      finally { if (active && getToken() === session) setLoading(false); } })();
    return () => { active = false; controller.abort(); };
  }, [session, month, valid, revision]);
  const g = data?.goals.primaryGoal;
  return <div className="overview-page dashboard-page"><header className="overview-header"><div><h1>ภาพรวมทางการเงิน</h1><p>ยอดจริงจากธุรกรรมที่คุณบันทึก</p></div><UserHeader /></header>
    <nav className="dashboard-month" aria-label="เลือกเดือน"><button disabled={!valid || month === '0001-01'} onClick={() => setMonth(shiftMonth(month, -1))}>เดือนก่อน</button><label>เดือน <input aria-label="เดือน" type="month" min="0001-01" max={today.slice(0,7)} value={valid ? month : ''} onChange={e => { if (e.target.value) setMonth(e.target.value); }} /></label><button disabled={!valid || month >= today.slice(0,7)} onClick={() => setMonth(shiftMonth(month, 1))}>เดือนถัดไป</button></nav>
    {!valid && <div role="alert"><p>กรุณาเลือกเดือนที่ถูกต้องและไม่เป็นเดือนอนาคต</p><button onClick={() => setMonth(today.slice(0,7))}>กลับเดือนปัจจุบัน</button></div>}
    {loading && valid && <p role="status">กำลังโหลด Dashboard...</p>}
    {error && <div role="alert"><p>{error}</p><button onClick={() => setRevision(v => v + 1)}>ลองใหม่</button></div>}
    {data && <><p>รายการที่บันทึก {data.period.startDate} ถึง {data.period.effectiveEndDate} (Asia/Bangkok) · {data.summary.transactionCount} รายการ</p>
      {!data.summary.hasTransactions && <div className="dashboard-empty" role="status">ยังไม่มีรายการในเดือนนี้ ยอดจากรายการที่บันทึกเป็น 0.00 บาท ไม่ได้ยืนยันว่าไม่มีรายรับหรือรายจ่ายจริง <Link to="/transactions/add">เพิ่มธุรกรรม</Link></div>}
      <div className="dashboard-cards">{[['รายรับจริง', data.summary.incomeAmount], ['รายจ่ายจริง', data.summary.expenseAmount], ['กระแสเงินสดสุทธิ', data.summary.netCashFlow], ['งบคงเหลือ', data.summary.budgetRemaining]].map(([label, value]) => <section key={label} className={'dashboard-panel' + (label === 'งบคงเหลือ' && data.summary.budgetExceeded ? ' dashboard-exceeded' : '')}><h2>{label}</h2><strong className="dashboard-money">{value === null ? 'ยังไม่ได้ตั้งงบ' : moneyText(value!)}{value !== null && <small> บาท</small>}</strong>{label === 'งบคงเหลือ' && <p>{data.summary.budgetExceeded ? 'เกินงบที่ตั้งไว้' : data.summary.budgetAmount === null ? 'ตั้งงบรวมเพื่อดูงบคงเหลือ' : `งบรวม ${moneyText(data.summary.budgetAmount)} บาท`} <Link to={'/budget?month=' + month}>ดูงบประมาณ</Link></p>}</section>)}</div>
      <p className="dashboard-note">กระแสเงินสดไม่ใช่ยอดคงเหลือธนาคาร ไม่รวมรายรับวางแผนหรือเงินจัดสรร Goals</p>
      <div className="dashboard-grid"><DashboardDaily month={month} asOfDate={data.asOfDate} daily={data.daily} /><section className="dashboard-panel"><h2>รายจ่ายตามหมวด</h2>{!data.expenseCategories.length ? <p>ยังไม่มีรายจ่ายที่บันทึกในเดือนนี้</p> : <ul className="dashboard-categories">{data.expenseCategories.map(c => <li key={c.categoryId}><span>{c.categoryName}</span><strong>{moneyText(c.amount)} บาท ({c.percentage}%)</strong><div className="dashboard-bar" aria-hidden="true"><span style={{ width: `${Math.min(100, Number(c.percentage))}%` }} /></div></li>)}</ul>}<p>รวมทุกหมวด แม้ไม่ได้ตั้งงบรายหมวด เปอร์เซ็นต์หลังปัดอาจรวมไม่เท่ากับ 100%</p></section></div>
      <div className="dashboard-grid"><section className="dashboard-panel"><h2>ธุรกรรมล่าสุดของเดือน</h2>{!data.recentTransactions.items.length ? <p>ยังไม่มีรายการ</p> : <ul className="dashboard-transactions">{data.recentTransactions.items.map(t => <li key={t.id}><div><time>{t.date}</time> · {t.categoryName}<p>{t.description || 'ไม่มีคำอธิบาย'}</p></div><strong>{t.type === 'income' ? 'รายรับ +' : 'รายจ่าย −'}{moneyText(t.amount)} บาท</strong></li>)}</ul>}<Link to={'/transactions?month=' + month}>ดูประวัติของเดือนนี้{data.recentTransactions.hasMore ? 'ทั้งหมด' : ''}</Link></section>
      <section className="dashboard-panel"><h2>Goals — สถานะปัจจุบัน</h2><p>ณ {data.goals.asOfDate} ไม่ใช่สถานะย้อนหลังของเดือนที่เลือก</p><dl className="dashboard-goal-counts"><div><dt>กำลังออม</dt><dd>{data.goals.activeCount}</dd></div><div><dt>ยังไม่มีเงินจัดสรร</dt><dd>{data.goals.notStartedCount}</dd></div><div><dt>เลยกำหนด</dt><dd>{data.goals.overdueCount}</dd></div></dl><p>เงินที่จัดสรรอยู่ <strong>{moneyText(data.goals.allocatedAmount)} บาท</strong></p><p>รวมทุกเป้าหมาย รวมเป้าหมายครบแล้วและเก็บถาวรที่ยังมีเงินจัดสรร</p>
      {g ? <div><h3>เป้าหมายหลัก: {g.name}</h3><p>{g.archivedAt ? 'เก็บถาวรแล้ว · ' : ''}{statuses[g.calculatedStatus]}</p><p>จัดสรร {moneyText(g.savedAmount)} / {moneyText(g.targetAmount)} บาท ({g.progressPercent}%)</p><div className="dashboard-bar" aria-hidden="true"><span style={{ width: `${Number(g.progressBarPercent)}%` }} /></div><p>ต้องการอีก {moneyText(g.remainingAmount)} บาท</p></div> : <p>ยังไม่ได้เลือกเป้าหมายหลัก <Link to="/settings">เลือกใน Settings</Link></p>}<Link to="/goals">ไปหน้า Goals</Link></section></div>
    </>}
  </div>;
}