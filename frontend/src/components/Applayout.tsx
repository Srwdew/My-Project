import type { ReactNode } from 'react';
import { ToastProvider } from './LocalToast';
import Sidebar from './Sidebar';
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
        <Sidebar />

        <main className="app-content">

          {children}
        </main>
      </div>
    </ToastProvider></ProfileProvider>
  );
}