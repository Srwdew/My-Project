import { AnomalyReconcileButton } from './AnomalyDetails';
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Bell, BellRing, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';
import { getToken } from '../auth';

type Notice = { id: string; type?: string; title: string; message: string; link: string | null; readAt: string | null; createdAt: string };
type NoticeList = { items: Notice[]; unreadCount: number };

export default function NotificationBell() {
  const [session, setSession] = useState(getToken);
  useEffect(() => {
    const changed = () => setSession(getToken());
    window.addEventListener('spendsense-session', changed);
    window.addEventListener('storage', changed);
    return () => {
      window.removeEventListener('spendsense-session', changed);
      window.removeEventListener('storage', changed);
    };
  }, []);
  return session ? <SessionBell key={session} session={session} /> : null;
}

function SessionBell({ session }: { session: string }) {
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const popoverId = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const request = useRef<AbortController | null>(null);
  const mutation = useRef<AbortController | null>(null);
  const alive = useRef(false);
  const locked = useRef(false);
  const [data, setData] = useState<NoticeList>({ items: [], unreadCount: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retryCheck, setRetryCheck] = useState(false);

  const valid = useCallback(() => alive.current && getToken() === session, [session]);

  const load = useCallback(async (reconcile = false) => {
    if (!valid() || locked.current) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    let checkFailed = false;
    try {
      if (reconcile) {
        try {
          const response = await apiFetch('/notifications/reconcile', { method: 'POST', signal: controller.signal });
          checkFailed = !response.ok;
        } catch {
          checkFailed = true;
        }
      }
      if (!valid() || controller.signal.aborted) return;
      const response = await apiFetch('/notifications', { signal: controller.signal });
      if (!response.ok) throw new Error('โหลดการแจ้งเตือนไม่สำเร็จ');
      const result: NoticeList = await response.json();
      if (valid() && !controller.signal.aborted) {
        setData(result);
        if (reconcile) setRetryCheck(checkFailed);
      }
    } catch {
      if (valid() && !controller.signal.aborted) setError('โหลดการแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      if (valid() && !controller.signal.aborted) setLoading(false);
    }
  }, [valid]);

  useEffect(() => {
    alive.current = true;
    void load(true);
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener('spendsense-data-changed', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      alive.current = false;
      request.current?.abort();
      mutation.current?.abort();
      window.clearInterval(timer);
      window.removeEventListener('spendsense-data-changed', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    };
    const focusOutside = (event: FocusEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    document.addEventListener('focusin', focusOutside);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focusOutside);
    };
  }, [open]);

  async function read(item?: Notice) {
    if (!valid() || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError('');
    request.current?.abort();
    const controller = new AbortController();
    mutation.current = controller;
    try {
      if (!item?.readAt) {
        const response = await apiFetch(item ? `/notifications/${encodeURIComponent(item.id)}/read` : '/notifications/read-all', {
          method: 'PATCH', signal: controller.signal,
        });
        if (!response.ok) throw new Error();
      }
      if (!valid() || controller.signal.aborted) return;
      locked.current = false;
      await load();
      if (valid() && !controller.signal.aborted && item) {

        close();
        // Only internal paths; reject protocol-relative and backslash URLs.
        if (item.type === 'transaction_anomaly') navigate('/anomaly');
        else if (item.link?.startsWith('/') && !item.link.startsWith('//') && !item.link.includes(String.fromCharCode(92))) navigate(item.link);
      }
    } catch {
      if (valid() && !controller.signal.aborted) setError('ทำเครื่องหมายว่าอ่านแล้วไม่สำเร็จ กรุณาลองอีกครั้ง');
    } finally {
      locked.current = false;
      if (valid()) { setBusy(false); setLoading(false); }
    }
  }

  return <div ref={root} className="notification-root">
    <button ref={trigger} type="button" className={'user-header-notification' + (data.unreadCount > 0 ? ' has-unread' : '') + (open ? ' is-open' : '')} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popoverId : undefined}
      aria-label={`การแจ้งเตือน ยังไม่อ่าน ${data.unreadCount} รายการ`}
      onClick={() => { if (open) close(); else { setOpen(true); void load(true); } }}>
      <Bell className="notification-bell-icon" size={18} strokeWidth={1.8} />
      {data.unreadCount > 0 && <span key={data.unreadCount} className="notification-badge">{data.unreadCount > 99 ? '99+' : data.unreadCount}</span>}
    </button>
    {open && <div ref={dialog} id={popoverId} role="dialog" className="notification-dialog" aria-label="การแจ้งเตือนล่าสุด 30 รายการ">
      <div className="notification-heading">
        <span className="notification-heading-icon" aria-hidden="true"><BellRing size={18} strokeWidth={2} /></span>
        <div className="notification-heading-text"><h2>การแจ้งเตือนล่าสุด 30 รายการ</h2>
          <p aria-live="polite" className="notification-summary">ยังไม่อ่านทั้งหมด {data.unreadCount} รายการ</p></div>
        <button type="button" className="notification-close" onClick={close} aria-label="ปิดการแจ้งเตือน"><X size={18} strokeWidth={2.2} /></button>
      </div>
      <div className="notification-actions"><AnomalyReconcileButton onDone={()=>void load()} />
        <button type="button" disabled={busy || loading || data.unreadCount === 0} onClick={() => void read()}>อ่านทั้งหมด</button>
      </div>
      {loading && <p role="status">กำลังโหลด...</p>}
      {error && <p role="alert">{error}</p>}
      {retryCheck && <p role="alert">ตรวจงบซ้ำไม่สำเร็จ รายการด้านล่างเป็นประวัติที่โหลดได้ กรุณาปิดแล้วเปิดการแจ้งเตือนอีกครั้ง</p>}
      {!loading && !error && data.items.length === 0 && <div className="notification-empty"><span aria-hidden="true"><Bell size={26} strokeWidth={1.6} /></span><p>ยังไม่มีการแจ้งเตือน</p></div>}

      <ul className="notification-list">{data.items.map((item, i) => <li key={item.id} style={{ '--i': Math.min(i, 10) } as CSSProperties}>
        <button type="button" disabled={busy} aria-busy={busy} className={item.readAt ? 'notification-item' : 'notification-item unread'} onClick={() => void read(item)}>
          <strong>{!item.readAt && <span className="notification-unread">ยังไม่อ่าน · </span>}{item.title}</strong>
          <span>{item.message}</span>
          <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</time>
        </button>
      </li>)}</ul>
    </div>}
  </div>;
}
