import {
  Activity, ArrowLeftRight, ChartPie, LayoutGrid, ShieldAlert, Target, TrendingUp, type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  /** Shorter name for phones, where the full one would overflow the bar. */
  short?: string;
  icon: LucideIcon;
  to: string;
};

// Single source of truth for the bottom bar.
export const NAV_ITEMS: NavItem[] = [
  { label: 'ภาพรวม', icon: LayoutGrid, to: '/overview' },
  { label: 'ธุรกรรม', icon: ArrowLeftRight, to: '/transactions' },
  { label: 'งบประมาณ', short: 'งบ', icon: ChartPie, to: '/budget' },
  { label: 'เป้าหมาย', icon: Target, to: '/goals' },
];

export const ANALYSIS_ITEMS: NavItem[] = [
  { label: 'พฤติกรรม', icon: Activity, to: '/behavior' },
  { label: 'การพยากรณ์', icon: TrendingUp, to: '/forecast' },
  { label: 'รายการที่ควรตรวจสอบ', icon: ShieldAlert, to: '/anomaly' },
];

export const ADD_TRANSACTION_PATH = '/transactions/add';

export const isNavMatch = (item: NavItem, pathname: string) =>
  pathname !== ADD_TRANSACTION_PATH && (pathname === item.to || pathname.startsWith(`${item.to}/`));
