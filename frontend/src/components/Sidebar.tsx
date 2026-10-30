import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ChartPie, ChevronDown, Ellipsis, LayoutGrid, LogOut, PanelLeftClose, PanelLeftOpen, Settings, SlidersHorizontal, Target, X } from 'lucide-react';
import { removeToken } from '../auth';
import { useProfile } from '../contexts/ProfileContext';
import { NAV_GROUPS, isNavMatch, type NavItem } from './navConfig';
import './Sidebar.css';

const STORAGE_KEY = 'spendsense-sidebar-collapsed';
const FOCUSABLE = 'a[href], button:not([disabled])';
type Mode = 'mobile' | 'tablet' | 'desktop';

const readMode = (): Mode =>
  window.matchMedia('(min-width: 1024px)').matches ? 'desktop'
    : window.matchMedia('(min-width: 768px)').matches ? 'tablet' : 'mobile';

function useMode() {
  const [mode, setMode] = useState(readMode);
  useEffect(() => {
    const queries = ['(min-width: 768px)', '(min-width: 1024px)'].map((q) => window.matchMedia(q));
    const update = () => setMode(readMode());
    queries.forEach((q) => q.addEventListener('change', update));
    return () => queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return mode;
}

function readCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
}

const visibleLinks = (root: HTMLElement, selector: string) =>
  [...root.querySelectorAll<HTMLElement>(selector)].filter((el) => !el.closest('[inert]'));

export default function Sidebar() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { profile, avatarUrl } = useProfile();
  const mode = useMode();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [open, setOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(
    NAV_GROUPS.flatMap((g) => g.items).filter((i) => i.children && isNavMatch(i, pathname)).map((i) => i.to),
  ));
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const touchX = useRef<number | null>(null);

  // Mobile drawer always shows labels; desktop follows the saved preference; tablet expands as an overlay.
  const expanded = mode === 'mobile' || (mode === 'desktop' ? !collapsed : open);
  const overlay = mode !== 'desktop' && open;

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* storage blocked */ }
  }, [collapsed]);

  // Close the overlay when the route or breakpoint changes (adjust-state-during-render pattern).
  const closeKey = `${pathname}|${mode}`;
  const [lastCloseKey, setLastCloseKey] = useState(closeKey);
  if (closeKey !== lastCloseKey) { setLastCloseKey(closeKey); setOpen(false); }

  const toggle = useCallback(() => {
    if (mode === 'desktop') setCollapsed((c) => !c);
    else setOpen((o) => !o);
  }, [mode]);

  const requestExpand = () => (mode === 'desktop' ? setCollapsed(false) : setOpen(true));

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'b') return;
      if ((e.target as Element | null)?.closest?.('input, textarea, [contenteditable="true"]')) return;
      e.preventDefault();
      toggle();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggle]);

  // Overlay: lock body scroll, trap focus, close on Esc, restore focus afterwards.
  useEffect(() => {
    const aside = asideRef.current;
    if (!overlay || !aside) return;
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    aside.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (e.key !== 'Tab') return;
      const items = visibleLinks(aside, FOCUSABLE);
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      previous?.focus();
    };
  }, [overlay]);

  // Sliding highlight follows whichever link carries data-indicator.
  useLayoutEffect(() => {
    const nav = navRef.current;
    const indicator = indicatorRef.current;
    if (!nav || !indicator) return;
    const place = () => {
      const target = nav.querySelector<HTMLElement>('[data-indicator="true"]');
      if (!target) { indicator.style.opacity = '0'; return; }
      const top = target.getBoundingClientRect().top - nav.getBoundingClientRect().top + nav.scrollTop;
      indicator.style.opacity = '1';
      indicator.style.height = `${target.offsetHeight}px`;
      indicator.style.transform = `translateY(${top}px)`;
    };
    place();
    nav.addEventListener('transitionend', place);
    return () => nav.removeEventListener('transitionend', place);
  }, [pathname, openGroups, expanded]);

  const toggleGroup = (to: string) => setOpenGroups((prev) => {
    const next = new Set(prev);
    if (next.has(to)) next.delete(to); else next.add(to);
    return next;
  });

  const onNavKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) || !navRef.current) return;
    const items = visibleLinks(navRef.current, '.sidebar-link');
    const i = items.indexOf(document.activeElement as HTMLElement);
    const n = items.length;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : e.key === 'ArrowDown' ? (i + 1) % n : (i - 1 + n) % n;
    e.preventDefault();
    items[next]?.focus();
  };

  const handleLogout = () => {
    if (!window.dispatchEvent(new Event('spendsense-before-logout', { cancelable: true }))) return;
    removeToken();
    navigate('/login', { replace: true });
  };

  let index = 0;
  const name = profile?.displayName || profile?.email;
  const ToggleIcon = expanded ? PanelLeftClose : PanelLeftOpen;
  const toggleLabel = expanded ? 'ย่อเมนู' : 'ขยายเมนู';

  return (
    <>
      {mode === 'mobile' && <MobileTabBar pathname={pathname} onLogout={handleLogout} />}

      <div className={`sidebar-backdrop${overlay ? ' is-visible' : ''}`} aria-hidden="true" onClick={() => setOpen(false)} />

      <aside
        id="app-sidebar"
        ref={asideRef}
        className={`sidebar ${expanded ? 'is-expanded' : 'is-collapsed'}${overlay ? ' is-open' : ''}`}
        inert={mode === 'mobile' && !open}
        {...(mode === 'mobile' ? { role: 'dialog', 'aria-modal': true, 'aria-label': 'เมนู' } : {})}
        onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (overlay && touchX.current !== null && e.changedTouches[0].clientX - touchX.current < -60) setOpen(false);
          touchX.current = null;
        }}
      >
        <div className="sidebar-header">
          <Brand />
          <button type="button" className="sidebar-icon-button sidebar-close" aria-label="ปิดเมนู" onClick={() => setOpen(false)}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>

        <nav ref={navRef} className="sidebar-nav" aria-label="เมนูหลัก" onKeyDown={onNavKeyDown}>
          <span ref={indicatorRef} className="sidebar-indicator" aria-hidden="true" />
          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.label} label={group.label}>
              {group.items.map((item) => (
                <SidebarItem
                  key={item.to}
                  item={item}
                  index={index++}
                  pathname={pathname}
                  expanded={expanded}
                  groupOpen={openGroups.has(item.to)}
                  onToggleGroup={() => (expanded ? toggleGroup(item.to) : (requestExpand(), setOpenGroups((p) => new Set(p).add(item.to))))}
                />
              ))}
            </SidebarGroup>
          ))}
        </nav>

        <div className="sidebar-footer">
          {name && (
            <div className="sidebar-profile" title={name}>
              {avatarUrl
                ? <img className="sidebar-avatar" src={avatarUrl} alt="" />
                : <span className="sidebar-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>}
              <span className="sidebar-label sidebar-profile-text">
                <strong>{profile?.displayName || 'บัญชีของฉัน'}</strong>
                <small>{profile?.email}</small>
              </span>
            </div>
          )}
          <NavLink to="/settings" className="sidebar-link" data-tooltip="ตั้งค่า">
            <Settings className="sidebar-icon" size={20} aria-hidden="true" />
            <span className="sidebar-label">ตั้งค่า</span>
          </NavLink>
          <SidebarToggle icon={<ToggleIcon className="sidebar-icon" size={20} aria-hidden="true" />} label={toggleLabel} expanded={expanded} onClick={toggle} />
          <button type="button" className="sidebar-link sidebar-logout" data-tooltip="ออกจากระบบ" onClick={handleLogout}>
            <LogOut className="sidebar-icon" size={20} aria-hidden="true" />
            <span className="sidebar-label">ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
}

// Mobile bottom tabs; routes without a tab (behavior, forecast, anomaly) light up "เพิ่มเติม".
const MOBILE_TABS: NavItem[] = [
  { label: 'ภาพรวม', icon: LayoutGrid, to: '/overview' },
  { label: 'ธุรกรรม', icon: ArrowLeftRight, to: '/transactions' },
  { label: 'งบ', icon: ChartPie, to: '/budget' },
  { label: 'เป้าหมาย', icon: Target, to: '/goals' },
  { label: 'ตั้งค่า', icon: SlidersHorizontal, to: '/settings' },
];

// Everything in the sidebar that has no tab of its own.
const MORE_ITEMS = NAV_GROUPS.flatMap((g) => g.items).filter((i) => !i.children && !MOBILE_TABS.some((t) => t.to === i.to));

function MobileTabBar({ pathname, onLogout }: { pathname: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const found = MOBILE_TABS.findIndex((t) => isNavMatch(t, pathname));
  const active = open || found < 0 ? MOBILE_TABS.length : found;

  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) { setLastPath(pathname); setOpen(false); }

  useEffect(() => {
    if (!open) return;
    rootRef.current?.querySelector<HTMLElement>('.mobile-more a, .mobile-more button')?.focus();
    const onDown = (e: PointerEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div ref={rootRef}>
    {open && (
      <div className="mobile-more" id="mobile-more" role="menu" aria-label="เมนูเพิ่มเติม">
        {MORE_ITEMS.map((item, i) => {
          const Icon = item.icon;
          return (
            <NavLink key={item.to} to={item.to} role="menuitem" className="mobile-more-item" style={{ '--i': i } as CSSProperties}>
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
        <button type="button" role="menuitem" className="mobile-more-item is-logout" style={{ '--i': MORE_ITEMS.length } as CSSProperties} onClick={onLogout}>
          <LogOut size={20} aria-hidden="true" />
          <span>ออกจากระบบ</span>
        </button>
      </div>
    )}
    <nav className="mobile-tabbar" aria-label="เมนูหลักมือถือ" style={{ '--active': active } as CSSProperties}>
      <span className="mobile-tabbar-indicator" aria-hidden="true">
        {/* Keyed so the droplet squish replays on every tab change. */}
        <i key={active} className="mobile-tabbar-drop" />
      </span>
      {MOBILE_TABS.map((t, i) => {
        const Icon = t.icon;
        return (
          <NavLink key={t.to} to={t.to} className={`mobile-tab${i === active ? ' is-active' : ''}`} aria-current={i === active ? 'page' : undefined}>
            <Icon className="mobile-tab-icon" size={22} aria-hidden="true" />
            <span>{t.label}</span>
          </NavLink>
        );
      })}
      <button type="button" className={`mobile-tab${active === MOBILE_TABS.length ? ' is-active' : ''}`} aria-expanded={open} aria-controls="mobile-more" aria-haspopup="menu" onClick={() => setOpen((o) => !o)}>
        <Ellipsis className="mobile-tab-icon" size={22} aria-hidden="true" />
        <span>เพิ่มเติม</span>
      </button>
    </nav>
    </div>
  );
}

function Brand() {
  return (
    <div className="sidebar-brand">
      <img className="logo-box" src="/logo-light.svg" alt="" width="48" height="48" />
      <span className="sidebar-label">KebTang</span>
    </div>
  );
}

export function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="sidebar-section">
      <p className="sidebar-section-label sidebar-label">{label}</p>
      <ul className="sidebar-list">{children}</ul>
    </div>
  );
}

export function SidebarToggle({ icon, label, expanded, onClick }: { icon: ReactNode; label: string; expanded: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className="sidebar-link sidebar-collapse"
      data-tooltip={`${label} (Ctrl+B)`}
      aria-expanded={expanded}
      aria-controls="app-sidebar"
      aria-keyshortcuts="Control+B Meta+B"
      onClick={onClick}
    >
      {icon}
      <span className="sidebar-label">{label}</span>
    </button>
  );
}

type SidebarItemProps = {
  item: NavItem;
  index: number;
  pathname: string;
  expanded: boolean;
  groupOpen?: boolean;
  onToggleGroup?: () => void;
};

export function SidebarItem({ item, index, pathname, expanded, groupOpen = false, onToggleGroup }: SidebarItemProps) {
  const Icon = item.icon;
  const style = { '--i': index } as CSSProperties;

  if (!item.children) {
    return (
      <li style={style}>
        <NavLink to={item.to} end={item.end} className="sidebar-link" data-indicator={isNavMatch(item, pathname)} data-tooltip={item.label}>
          <Icon className="sidebar-icon" size={20} aria-hidden="true" />
          <span className="sidebar-label">{item.label}</span>
        </NavLink>
      </li>
    );
  }

  const showChildren = expanded && groupOpen;
  const childActive = item.children.some((c) => isNavMatch(c, pathname));
  const submenuId = `submenu-${item.to.replace(/\W/g, '')}`;

  return (
    <li style={style}>
      <button
        type="button"
        className={`sidebar-link${isNavMatch(item, pathname) ? ' is-parent-active' : ''}`}
        aria-expanded={showChildren}
        aria-controls={submenuId}
        data-indicator={isNavMatch(item, pathname) && !(showChildren && childActive)}
        data-tooltip={item.label}
        onClick={onToggleGroup}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowRight' && !showChildren) || (e.key === 'ArrowLeft' && showChildren)) { e.preventDefault(); onToggleGroup?.(); }
        }}
      >
        <Icon className="sidebar-icon" size={20} aria-hidden="true" />
        <span className="sidebar-label">{item.label}</span>
        <ChevronDown className="sidebar-chevron sidebar-label" size={16} aria-hidden="true" />
      </button>
      <div id={submenuId} className={`sidebar-submenu${showChildren ? ' is-open' : ''}`} inert={!showChildren}>
        <ul className="sidebar-list">
          {item.children.map((child) => (
            <SidebarItem key={child.to} item={child} index={0} pathname={pathname} expanded={expanded} />
          ))}
        </ul>
      </div>
    </li>
  );
}
