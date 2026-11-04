import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ToastProvider } from './LocalToast';
import AppNav from './AppNav';
import UserHeader from './UserHeader';
import { ProfileProvider } from '../contexts/ProfileContext';

import './Applayout.css';

type AppLayoutProps = {
  children: ReactNode;
};

export default function AppLayout({
  children,
}: AppLayoutProps) {
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
          {children}
        </main>
        <AppNav />
      </div>
    </ToastProvider></ProfileProvider>
  );
}
