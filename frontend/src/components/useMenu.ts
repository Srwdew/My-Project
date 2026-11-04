import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useLocation } from 'react-router-dom';

const items = (root: HTMLElement | null) => [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];

// Popup menu behaviour shared by the analysis button and the account button (WAI-ARIA menu button pattern).
export function useMenu() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusOnOpen = useRef<'first' | 'last' | null>(null);

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false); }

  useEffect(() => {
    if (!open) return;
    const list = items(rootRef.current);
    if (focusOnOpen.current) list[focusOnOpen.current === 'first' ? 0 : list.length - 1]?.focus();
    focusOnOpen.current = null;
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const triggerProps = {
    ref: triggerRef,
    'aria-haspopup': 'menu' as const,
    'aria-expanded': open,
    // detail 0 means Enter or Space, so the keyboard user lands inside the menu.
    onClick: (e: MouseEvent) => { if (!open && e.detail === 0) focusOnOpen.current = 'first'; setOpen(!open); },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      if (open) { const list = items(rootRef.current); list[e.key === 'ArrowDown' ? 0 : list.length - 1]?.focus(); return; }
      focusOnOpen.current = e.key === 'ArrowDown' ? 'first' : 'last';
      setOpen(true);
    },
  };

  const rootProps = {
    ref: rootRef,
    onKeyDown: (e: KeyboardEvent) => {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); triggerRef.current?.focus(); return; }
      if (e.key === 'Tab') { setOpen(false); return; }
    },
  };

  const menuProps = {
    role: 'menu' as const,
    // A click on the page already open, or a navigation the unsaved-changes prompt cancelled, must still close it.
    onClick: (e: MouseEvent) => { if ((e.target as Element).closest('[role="menuitem"]')) setOpen(false); },
    onKeyDown: (e: KeyboardEvent) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const list = items(rootRef.current);
      const i = list.indexOf(document.activeElement as HTMLElement);
      const n = list.length;
      list[e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n]?.focus();
    },
  };

  return { open, triggerProps, rootProps, menuProps };
}
