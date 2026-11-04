import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ToastProvider } from './LocalToast';
import AppNav from './AppNav';
import ErrorBoundary from './ErrorBoundary';
import UserHeader from './UserHeader';
import { ProfileProvider } from '../contexts/ProfileContext';

import './Applayout.css';

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({
  children,
}: AppLayoutProps) {
  const { pathname } = useLocation();
  return (
    <ProfileProvider><ToastProvider>
      <div className="app-layout">
        <main className="app-content">
          <div className="app-topbar">
            <Link to="/overview" className="app-brand" aria-label="KebTang หน้าภาพรวม">
              <img src="/logo.svg" alt="" width="36" height="36" />
              <span>KebTang</span>
            </Link>
            <UserHeader />
          </div>
          <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
        </main>
        <AppNav />
      </div>
    </ToastProvider></ProfileProvider>
  );
}
