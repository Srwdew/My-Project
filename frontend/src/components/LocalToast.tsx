import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, X } from 'lucide-react';
import { getToken, useSessionKey } from '../auth';
import './Motion.css';

type Kind = 'success' | 'error';
type Message = { text: string; kind: Kind; session: string; id: number };
const ToastContext = createContext<(text: string, kind: Kind, session: string | null) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const session = useSessionKey();
  const [message, setMessage] = useState<Message | null>(null);
  const serial = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => { setMessage(null); }, [session]);
  const publish = useCallback((text: string, kind: Kind, owner: string | null) => {
    if (owner && owner === getToken()) {
      if (!text) { setMessage(null); return; }
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMessage({ text, kind, session: owner, id: ++serial.current });
    }
  }, []);
  const dismiss = () => {
    const focused = document.activeElement?.closest('.local-toast');
    setMessage(null);
    if (focused && returnFocus.current?.isConnected) returnFocus.current.focus();
  };
  const visible = message?.session === session ? message : null;
  return <ToastContext.Provider value={publish}>
    {children}
    <div className="local-toast-region" aria-label="ผลการดำเนินการ">
      <div role="status" aria-live="polite" aria-atomic="true">{visible?.kind === 'success' &&
        <span key={visible.id} className="toast-announcement">{visible.text}</span>}</div>
      <div role="alert" aria-atomic="true">{visible?.kind === 'error' &&
        <span key={visible.id} className="toast-announcement">{visible.text}</span>}</div>
      {visible && <div key={visible.id} className={'local-toast local-toast-' + visible.kind}>
        {visible.kind === 'success' ? <CheckCircle2 aria-hidden="true" size={20}/> : <CircleAlert aria-hidden="true" size={20}/>}
        <span aria-hidden="true">{visible.text}</span>
        <button type="button" aria-label="ปิดข้อความแจ้งผล" onClick={dismiss}
          onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); dismiss(); } }}>
          <X aria-hidden="true" size={18}/>
        </button>
      </div>}
    </div>
  </ToastContext.Provider>;
}

// Capture the originating session and lifetime across awaited API calls.
// Local UI only: no notification API, storage, timer or browser alert.
export function useToast() {
  const publish = useContext(ToastContext);
  const session = useSessionKey();
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  return useCallback((text: string, kind: Kind = 'error') => {
    if (alive.current && session === getToken()) publish(text, kind, session);
  }, [publish, session]);
}
