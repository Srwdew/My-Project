import { NavLink, useLocation } from 'react-router-dom';
import { ChartColumn, Plus } from 'lucide-react';
import { ADD_TRANSACTION_PATH, ANALYSIS_ITEMS, NAV_ITEMS, isNavMatch, type NavItem } from './navConfig';
import { useMenu } from './useMenu';
import './AppNav.css';

function Label({ label, short }: Pick<NavItem, 'label' | 'short'>) {
  return (
    <span className="app-nav-label">
      {short ? <><span className="app-nav-long">{label}</span><span className="app-nav-short">{short}</span></> : label}
    </span>
  );
}

export default function AppNav() {
  const { pathname } = useLocation();
  const { open, triggerProps, rootProps, menuProps } = useMenu();
  const analysisPage = ANALYSIS_ITEMS.find((item) => isNavMatch(item, pathname));

  return (
    <nav className="app-nav" aria-label="เมนูหลัก">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = isNavMatch(item, pathname);
        return (
          <NavLink key={item.to} to={item.to} end={false} aria-label={item.label} aria-current={active ? 'page' : undefined} className={() => `app-nav-item${active ? ' is-active' : ''}`}>
            <Icon size={20} aria-hidden="true" />
            <Label label={item.label} short={item.short} />
          </NavLink>
        );
      })}

      <div className="app-nav-group" {...rootProps}>
        {open && (
          <div className="app-menu app-nav-menu" aria-label="วิเคราะห์" {...menuProps}>
            {ANALYSIS_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} role="menuitem" className="app-menu-item">
                  <Icon size={20} aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        )}
        <button
          type="button"
          className={`app-nav-item${analysisPage ? ' is-active' : ''}${open ? ' is-open' : ''}`}
          aria-label={analysisPage ? `วิเคราะห์ อยู่ที่หน้า${analysisPage.label}` : 'วิเคราะห์'}
          {...triggerProps}
        >
          <ChartColumn size={20} aria-hidden="true" />
          <Label label="วิเคราะห์" />
        </button>
      </div>

      <span className="app-nav-divider" aria-hidden="true" />
      <NavLink to={ADD_TRANSACTION_PATH} className="app-nav-add" aria-label="เพิ่มรายการ">
        <Plus size={22} aria-hidden="true" />
      </NavLink>
    </nav>
  );
}
