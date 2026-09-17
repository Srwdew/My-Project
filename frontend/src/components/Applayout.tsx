import type { ReactNode } from 'react';
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
    <ProfileProvider>
      <div className="app-layout">
        <Sidebar />

        <main className="app-content">
          {children}
        </main>
      </div>
    </ProfileProvider>
  );
}