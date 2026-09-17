import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { House, Plane, GraduationCap, Shield, Target, Pencil, LayoutGrid, List, Plus, X } from 'lucide-react';
import UserHeader from '../components/UserHeader';
import { apiFetch } from '../api';
import { getToken } from '../auth';
import './Goals.css';
type Goal = {
    id: string;
    name: string;
    targetAmount: string;
    targetDate: string | null;
    plannedMonthlyAmount: string | null;
    categoryKey: string;
    note: string | null;
    archivedAt: string | null;
    savedAmount: string;
    remainingAmount: string;
    overfundedAmount: string;
    progressPercent: string;
    progressBarPercent: string;
    monthsRemaining: number | null;
    requiredMonthlyAmount: string | null;
    calculatedStatus: string;
    warnings: string[];
};
type Opening = {
    id: string;
    openingAmount: string;
    cutoffDate: string;
    note: string;
    availableAmount: string;
    netAllocated: string;
    cutoffLocked: boolean;
};
type Income = {
    id: string;
    transactionDate: string;
    description: string | null;
    availableAmount: string;
    eligible: boolean;
};
type Entry = {
    id: string;
    kind: string;
    amount: string;
    createdAt: string;
    allocationId: string | null;
    sourceSnapshot: {
        sourceType: string;
        description?: string;
        sourceDate?: string;
    };
    operation: {
        reason: string | null;
        kind: string;
    };
};
type Mode = 'create' | 'edit' | 'opening' | 'allocate' | 'release' | 'history' | 'correct';
type Modal = {
    mode: Mode;
    goal?: Goal;
};
const categories = { home: { label: 'บ้าน / รถ', Icon: House }, travel: { label: 'ท่องเที่ยว', Icon: Plane }, education: { label: 'การศึกษา', Icon: GraduationCap }, emergency: { label: 'เงินสำรอง', Icon: Shield }, other: { label: 'อื่น ๆ', Icon: Target } };
const statusLabels: Record<string, string> = { active: 'กำลังดำเนินการ', completed: 'ครบเป้าหมาย', overdue: 'เลยกำหนด', not_started: 'ยังไม่มีเงินจัดสรร' };
const money = (v: string) => new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v));
const dateLabel = (v: string | null) => v ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(v + 'T00:00:00Z')) : 'ไม่กำหนด';
function ownerFromToken(token: string | null) { try {
    return String(JSON.parse(atob(token!.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/'))).userId ?? '');
}
catch {
    return '';
} }
function todayKey() { const p = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); return ['year', 'month', 'day'].map(k => p.find(x => x.type === k)!.value).join('-'); }
async function request<T>(path: string, options: RequestInit = {}): Promise<T> { const r = await apiFetch(path, options); const body = await r.json(); if (!r.ok)
    throw new Error(typeof body.error === 'string' ? body.error : body.error?.message ?? 'ไม่สามารถดำเนินการได้'); return body; }
export default function Goals() {
    const [session, setSession] = useState(getToken);
    useEffect(() => { const changed = () => setSession(getToken()); window.addEventListener('spendsense-session', changed); return () => window.removeEventListener('spendsense-session', changed); }, []);
    return <GoalsSession key={session ?? 'signed-out'} session={session}/>;
}
function GoalsSession({ session }: {
    session: string | null;
}) {
    const owner = ownerFromToken(session);
    const [goals, setGoals] = useState<Goal[]>([]), [cursor, setCursor] = useState<string | null>(null), [status, setStatus] = useState(''), [archived, setArchived] = useState('exclude');
    const [view, setView] = useState<'card' | 'list'>('card'), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
    const [modal, setModal] = useState<Modal | null>(null), [opening, setOpening] = useState<Opening | null>(null), [incomes, setIncomes] = useState<Income[]>([]), [entries, setEntries] = useState<Entry[]>([]);
    const [modalLoading, setModalLoading] = useState(false), [modalError, setModalError] = useState(''), [busy, setBusy] = useState(false), [modalReload, setModalReload] = useState(0);
    const dialog = useRef<HTMLDialogElement>(null), pending = useRef<{
        signature: string;
        key: string;
    } | null>(null), actionBusy = useRef(false), epoch = useRef(0), listGeneration = useRef(0);
    const [modalReady, setModalReady] = useState(false);
    useEffect(() => { epoch.current++; setGoals([]); setModal(null); setOpening(null); setEntries([]); setIncomes([]); pending.current = null; actionBusy.current = false; setBusy(false); try {
        setView(localStorage.getItem('spendsense-goals-view:' + owner) === 'list' ? 'list' : 'card');
    }
    catch {
        setView('card');
    } }, [session, owner]);
    function changeView(v: 'card' | 'list') { setView(v); if (owner)
        try {
            localStorage.setItem('spendsense-goals-view:' + owner, v);
        }
        catch { /* Storage may be disabled. */ } }
    useEffect(() => {
        const controller = new AbortController();
        listGeneration.current++;
        setLoading(true);
        setError('');
        setGoals([]);
        setCursor(null);
        request<{
            data: Goal[];
            nextCursor: string | null;
        }>(`/goals?archived=${archived}${status ? '&status=' + status : ''}`, { signal: controller.signal }).then(data => { if (getToken() === session && !controller.signal.aborted) {
            setGoals(data.data);
            setCursor(data.nextCursor);
        } }).catch(e => { if (!controller.signal.aborted)
            setError(e.message); }).finally(() => { if (!controller.signal.aborted)
            setLoading(false); });
        return () => controller.abort();
    }, [session, status, archived, revision]);
    useEffect(() => { if (modal && !dialog.current?.open)
        dialog.current?.showModal(); if (!modal)
        dialog.current?.close(); }, [modal]);
    useEffect(() => {
        if (!modal)
            return;
        const controller = new AbortController();
        setModalError('');
        setModalLoading(true);
        setModalReady(false);
        setEntries([]);
        setIncomes([]);
        const load = async () => {
            if (['opening', 'allocate', 'correct'].includes(modal.mode)) {
                const data = await request<{
                    data: Opening | null;
                }>('/goal-funding/opening-balance', { signal: controller.signal });
                if (!controller.signal.aborted && getToken() === session)
                    setOpening(data.data);
            }
            if (['allocate', 'correct'].includes(modal.mode)) {
                const all: Income[] = [];
                let next: string | null = null;
                do {
                    const data: {
                        data: Income[];
                        nextCursor: string | null;
                    } = await request('/goal-funding/incomes?limit=100' + (next ? '&cursor=' + next : ''), { signal: controller.signal });
                    all.push(...data.data);
                    next = data.nextCursor;
                } while (next);
                if (!controller.signal.aborted && getToken() === session)
                    setIncomes(all.filter(x => x.eligible));
            }
            if (['history', 'correct'].includes(modal.mode) && modal.goal) {
                const all: Entry[] = [];
                let next: string | null = null;
                do {
                    const data: {
                        data: Entry[];
                        nextCursor: string | null;
                    } = await request(`/goals/${modal.goal.id}/ledger?limit=100` + (next ? '&cursor=' + next : ''), { signal: controller.signal });
                    all.push(...data.data);
                    next = data.nextCursor;
                } while (next);
                if (!controller.signal.aborted && getToken() === session)
                    setEntries(all);
            }
        };
        void load().then(() => { if (!controller.signal.aborted)
            setModalReady(true); }).catch(e => { if (!controller.signal.aborted)
            setModalError(e.message); }).finally(() => { if (!controller.signal.aborted)
            setModalLoading(false); });
        return () => controller.abort();
    }, [modal, modalReload, session]);
    function open(mode: Mode, goal?: Goal) { pending.current = null; setModalError(''); setModalLoading(true); setModal(goal ? { mode, goal } : { mode }); }
    function close() { if (!actionBusy.current) {
        setModal(null);
        pending.current = null;
    } }
    async function more() { if (!cursor || loading)
        return; const captured = epoch.current, generation = listGeneration.current; setLoading(true); setError(''); try {
        const data = await request<{
            data: Goal[];
            nextCursor: string | null;
        }>(`/goals?archived=${archived}${status ? '&status=' + status : ''}&cursor=${cursor}`);
        if (captured === epoch.current && generation === listGeneration.current && getToken() === session) {
            setGoals(g => [...g, ...data.data]);
            setCursor(data.nextCursor);
        }
    }
    catch (e) {
        if (captured === epoch.current && generation === listGeneration.current)
            setError((e as Error).message);
    }
    finally {
        if (captured === epoch.current && generation === listGeneration.current)
            setLoading(false);
    } }
    async function archive(goal: Goal) { if (actionBusy.current)
        return; actionBusy.current = true; setBusy(true); const captured = epoch.current; try {
        await request(`/goals/${goal.id}/${goal.archivedAt ? 'restore' : 'archive'}`, { method: 'POST', body: '{}' });
        if (captured === epoch.current)
            setRevision(x => x + 1);
    }
    catch (e) {
        if (captured === epoch.current)
            setError((e as Error).message);
    }
    finally {
        if (captured === epoch.current) {
            actionBusy.current = false;
            setBusy(false);
        }
    } }
    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (!modal || actionBusy.current)
            return;
        const f = new FormData(event.currentTarget), v = (k: string) => String(f.get(k) ?? '').trim();
        let path = '', method = 'POST', body: Record<string, unknown> = {};
        const g = modal.goal;
        if (modal.mode === 'create' || modal.mode === 'edit') {
            path = g ? '/goals/' + g.id : '/goals';
            method = g ? 'PATCH' : 'POST';
            body = { name: v('name'), targetAmount: v('targetAmount'), targetDate: v('targetDate') || null, plannedMonthlyAmount: v('plannedMonthlyAmount') || null, categoryKey: v('categoryKey'), note: v('note') || null };
        }
        if (modal.mode === 'opening') {
            path = '/goal-funding/opening-balance' + (opening ? '/corrections' : '');
            body = { amount: v('amount'), cutoffDate: opening?.cutoffLocked ? opening.cutoffDate : v('cutoffDate'), note: v('note'), ...(opening ? { reason: v('reason') } : {}) };
        }
        const source = () => v('source') === 'opening' ? { type: 'OPENING_BALANCE' } : { type: 'INCOME_TRANSACTION', transactionId: v('source') };
        if (modal.mode === 'allocate') {
            path = `/goals/${g!.id}/allocations`;
            body = { amount: v('amount'), source: source() };
        }
        if (modal.mode === 'release') {
            path = `/goals/${g!.id}/releases`;
            body = { amount: v('amount'), reason: v('reason') };
        }
        if (modal.mode === 'correct') {
            path = `/goals/${g!.id}/allocation-corrections`;
            body = { allocationId: v('allocationId'), amount: v('amount'), reason: v('reason'), ...(v('source') ? { replacementSource: source() } : {}) };
        }
        const signature = JSON.stringify({ path, method, body });
        if (pending.current?.signature !== signature)
            pending.current = { signature, key: crypto.randomUUID() };
        const captured = epoch.current;
        actionBusy.current = true;
        setBusy(true);
        setModalError('');
        try {
            await request(path, { method, body: JSON.stringify(body), headers: { 'Idempotency-Key': pending.current.key } });
            if (captured === epoch.current && getToken() === session) {
                pending.current = null;
                setModal(null);
                setRevision(x => x + 1);
            }
        }
        catch (e) {
            if (captured === epoch.current)
                setModalError((e as Error).message);
        }
        finally {
            if (captured === epoch.current) {
                actionBusy.current = false;
                setBusy(false);
            }
        }
    }
    const titles: Record<Mode, string> = { create: 'สร้างเป้าหมายใหม่', edit: 'แก้ไขเป้าหมาย', opening: 'เงินออมตั้งต้น', allocate: 'จัดสรรเงินเข้าเป้าหมาย', release: 'คืนเงินจากเป้าหมาย', history: 'ประวัติการจัดสรร', correct: 'แก้ไขการจัดสรรด้วยรายการชดเชย' };
    const g = modal?.goal;
    return <div className="goals-page">
  <header className="goals-header"><div><h1>เป้าหมายการออมเงิน</h1><p>ติดตามเป้าหมายการออมเงินของคุณ</p></div><button className="goals-primary" onClick={() => open('create')}><Plus size={18}/>สร้างเป้าหมายใหม่</button><UserHeader /></header>
  <section className="goals-panel" aria-label="เป้าหมายของคุณ"><div className="goals-toolbar"><h2>เป้าหมายของคุณ</h2><label>สถานะ <select value={status} onChange={e => setStatus(e.target.value)}><option value="">ทั้งหมด</option>{Object.entries(statusLabels).map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select></label><label>คลัง <select value={archived} onChange={e => setArchived(e.target.value)}><option value="exclude">ใช้งานอยู่</option><option value="only">จัดเก็บแล้ว</option><option value="include">ทั้งหมด</option></select></label><div className="goals-view" role="group" aria-label="มุมมอง"><button aria-pressed={view === 'card'} onClick={() => changeView('card')}><LayoutGrid size={18}/>การ์ด</button><button aria-pressed={view === 'list'} onClick={() => changeView('list')}><List size={18}/>รายการ</button></div></div>
   <div className="goals-funding-note"><button onClick={() => open('opening')}>ตั้งค่า / แก้ไขเงินออมตั้งต้น</button><span>การจัดสรรเป็นการกันเงินไว้ ไม่เปลี่ยนรายรับ รายจ่าย หรืองบประมาณ และไม่ใช่ยอดเงินสดคงเหลือ</span></div>
   {error && <div role="alert" className="goals-error">{error} <button onClick={() => setRevision(x => x + 1)}>ลองใหม่</button></div>}
   {loading && !goals.length && <p role="status">กำลังโหลดเป้าหมาย…</p>}
   {!loading && !error && !goals.length && <div className="goals-empty"><Target size={44}/><h3>ยังไม่มีเป้าหมายในรายการนี้</h3><p>สร้างเป้าหมาย แล้วเลือกแหล่งเงินจริงเพื่อเริ่มจัดสรร</p><button onClick={() => open('create')}>สร้างเป้าหมายใหม่</button></div>}
   <div className={'goals-items goals-' + view}>{goals.map(goal => {
            const category = categories[goal.categoryKey as keyof typeof categories] ?? categories.other, Icon = category.Icon;
            return <article className={'goal-card goal-' + goal.categoryKey} key={goal.id}>
    <div className="goal-heading"><span className="goal-icon"><Icon size={36}/></span><div><span className={'goal-status ' + goal.calculatedStatus}>{statusLabels[goal.calculatedStatus]}</span>{goal.archivedAt && <span className="goal-status">จัดเก็บแล้ว</span>}<h3>{goal.name}</h3><p>เป้าหมาย: {money(goal.targetAmount)} บาท</p></div><button className="goal-edit" aria-label={'แก้ไข ' + goal.name} onClick={() => open('edit', goal)}><Pencil size={18}/></button></div>
    <div className="goal-progress"><progress max="100" value={goal.progressBarPercent} aria-label={'ความคืบหน้า ' + goal.name}/><strong>{goal.progressPercent}%</strong></div>
    <dl className="goal-figures"><div><dt>ออมแล้ว</dt><dd>{money(goal.savedAmount)} <small>บาท</small></dd></div><div><dt>ต้องการอีก</dt><dd>{money(goal.remainingAmount)} <small>บาท</small></dd></div><div><dt>กำหนดเสร็จ</dt><dd>{dateLabel(goal.targetDate)}</dd></div></dl>
    <div className={'goal-plan ' + (goal.warnings.length ? 'goal-warning' : '')}>
     {goal.requiredMonthlyAmount !== null ? <><strong>ต้องจัดสรรเฉลี่ยอีก {money(goal.requiredMonthlyAmount)} บาท/เดือน</strong><span>{goal.monthsRemaining !== null ? `นับ ${goal.monthsRemaining} เดือนปฏิทิน รวมเดือนปัจจุบัน` : 'ครบเป้าหมายแล้ว'}</span></> : <strong>{goal.calculatedStatus === 'overdue' ? 'เลยกำหนดแล้ว ยังขาด ' + money(goal.remainingAmount) + ' บาท' : 'เพิ่มวันกำหนดเสร็จเพื่อคำนวณยอดต่อเดือน'}</strong>}
     {goal.plannedMonthlyAmount && <span>แผนปัจจุบัน {money(goal.plannedMonthlyAmount)} บาท/เดือน</span>}{goal.warnings.includes('PLAN_INSUFFICIENT') && <span>แผนรายเดือนยังไม่เพียงพอต่อเป้าหมาย</span>}{goal.overfundedAmount !== '0.00' && <span>เกินเป้าหมาย {money(goal.overfundedAmount)} บาท — เลือกคืนเงินได้</span>}
    </div><div className="goal-actions"><button disabled={!!goal.archivedAt || busy} onClick={() => open('allocate', goal)}>จัดสรรเงิน</button><button disabled={goal.savedAmount === '0.00' || busy} onClick={() => open('release', goal)}>คืนเงิน</button><button onClick={() => open('history', goal)}>ประวัติ</button><button disabled={busy} onClick={() => void archive(goal)}>{goal.archivedAt ? 'คืนจากคลัง' : 'จัดเก็บ'}</button></div>
   </article>;
        })}</div>{cursor && <button className="goals-more" disabled={loading} onClick={() => void more()}>{loading ? 'กำลังโหลด…' : 'โหลดเพิ่มเติม'}</button>}
  </section>
  <dialog ref={dialog} className="goals-dialog" onCancel={e => { e.preventDefault(); close(); }} onClose={() => { if (!actionBusy.current)
        setModal(null); }} aria-labelledby="goal-dialog-title">
   {modal && <><div className="goals-dialog-header"><h2 id="goal-dialog-title">{titles[modal.mode]}</h2><button aria-label="ปิด" disabled={busy} onClick={close}><X /></button></div>
   {modalError && <div className="goals-error" role="alert">{modalError} <button disabled={busy} onClick={() => setModalReload(x => x + 1)}>โหลดข้อมูลใหม่</button></div>}
   {modalLoading ? <p role="status">กำลังโหลด…</p> : !modalReady ? <p role="status">ยังโหลดข้อมูลไม่สำเร็จ กรุณากดลองใหม่</p> : modal.mode === 'history' ? <><p>ยอดนี้เป็นประวัติ ณ เวลาบันทึก</p>{entries.length === 0 ? <p>ยังไม่มีการจัดสรร</p> : <ol className="goal-history">{entries.map(e => <li key={e.id}><strong>{e.kind === 'ALLOCATE' ? 'จัดสรรเข้า' : 'คืนออก'} {money(e.amount)} บาท</strong><span>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(new Date(e.createdAt))}</span><span>{e.sourceSnapshot.sourceType === 'OPENING_BALANCE' ? 'เงินออมตั้งต้น' : e.sourceSnapshot.description || 'รายรับ'}</span>{e.operation.reason && <span>{e.operation.reason}</span>}</li>)}</ol>}<button onClick={() => open('correct', g)}>แก้รายการผิดด้วยรายการชดเชย</button></> : <form key={modal.mode + (g?.id ?? '') + modalReload} onSubmit={e => void submit(e)}>
    {(modal.mode === 'create' || modal.mode === 'edit') && <><label>ชื่อเป้าหมาย<input name="name" required maxLength={120} defaultValue={g?.name} autoFocus/></label><label>ยอดเป้าหมาย (บาท)<input name="targetAmount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={g?.targetAmount}/></label><label>ประเภท<select name="categoryKey" defaultValue={g?.categoryKey ?? 'other'}>{Object.entries(categories).map(([k, c]) => <option value={k} key={k}>{c.label}</option>)}</select></label><label>กำหนดเสร็จ (ไม่บังคับ)<input type="date" name="targetDate" defaultValue={g?.targetDate ?? ''}/></label><label>แผนจัดสรรต่อเดือน (ไม่บังคับ)<input name="plannedMonthlyAmount" inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={g?.plannedMonthlyAmount ?? ''}/></label><label>หมายเหตุ<textarea name="note" maxLength={1000} defaultValue={g?.note ?? ''}/></label></>}
    {modal.mode === 'opening' && <><p>ยอดเงินที่มีอยู่ ณ สิ้นวันตัดยอดตามเวลาไทย รายรับก่อนหรือเท่ากับวันนั้นจะใช้จัดสรรซ้ำไม่ได้</p><label>จำนวนเงิน (บาท)<input name="amount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={opening?.openingAmount} autoFocus/></label><label>วันตัดยอด<input name="cutoffDate" type="date" required max={todayKey()} disabled={opening?.cutoffLocked} defaultValue={opening?.cutoffDate ?? todayKey()}/></label>{opening?.cutoffLocked && <p>วันตัดยอดถูกล็อกเพราะมีประวัติการจัดสรรแล้ว</p>}<label>ที่มา / หมายเหตุ<textarea name="note" required maxLength={1000} defaultValue={opening?.note}/></label>{opening && <label>เหตุผลที่แก้ไข<textarea name="reason" required maxLength={1000}/></label>}</>}
    {(modal.mode === 'allocate' || modal.mode === 'correct') && <label>แหล่งเงิน{modal.mode === 'correct' ? 'ทดแทน (ไม่เลือก = คืนเงินอย่างเดียว)' : ''}<select name="source" required={modal.mode === 'allocate'} defaultValue=""><option value="">เลือกแหล่งเงิน</option>{opening && <option value="opening">เงินตั้งต้น — เหลือ {money(opening.availableAmount)} บาท</option>}{incomes.map(i => <option value={i.id} key={i.id}>{dateLabel(i.transactionDate)} {i.description || 'รายรับ'} — เหลือ {money(i.availableAmount)} บาท</option>)}</select></label>}
    {modal.mode === 'correct' && <label>รายการจัดสรรที่ต้องการแก้<select name="allocationId" required><option value="">เลือกรายการต้นทาง</option>{entries.filter(e => e.kind === 'ALLOCATE').map(e => <option value={e.id} key={e.id}>{new Date(e.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} — {money(e.amount)} บาท</option>)}</select></label>}
    {['allocate', 'release', 'correct'].includes(modal.mode) && <><p>เป้าหมาย: {g?.name} · ออมแล้ว {money(g?.savedAmount ?? '0')} บาท</p><label>จำนวนเงิน (บาท)<input name="amount" required inputMode="decimal" pattern="[0-9]{1,10}([.][0-9]{1,2})?" defaultValue={modal.mode === 'release' && g?.overfundedAmount !== '0.00' ? g?.overfundedAmount : undefined}/></label>{modal.mode !== 'allocate' && <label>เหตุผล<textarea name="reason" required maxLength={1000}/></label>}{modal.mode === 'release' && <p>ระบบคืนเงินจากรายการจัดสรรเก่าก่อน (FIFO)</p>}</>}
    <div className="goals-dialog-actions"><button type="button" disabled={busy} onClick={close}>ยกเลิก</button><button className="goals-primary" disabled={busy || modalLoading} type="submit">{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button></div>
   </form>}</>}
  </dialog>
 </div>;
}
