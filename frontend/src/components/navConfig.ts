import {
  Activity, ArrowLeftRight, CirclePlus, History, LayoutDashboard,
  PiggyBank, ShieldAlert, Target, TrendingUp, type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  label: string;
  icon: LucideIcon;
  to: string;
  end?: boolean;
  children?: NavItem[];
};

export type NavGroup = { label: string; items: NavItem[] };

// Single source of truth for the sidebar menu.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'ภาพรวม',
    items: [{ label: 'ภาพรวม', icon: LayoutDashboard, to: '/overview' }],
  },
  {
    label: 'การเงิน',
    items: [
      {
        label: 'ธุรกรรม', icon: ArrowLeftRight, to: '/transactions',
        children: [
          { label: 'ประวัติรายการ', icon: History, to: '/transactions', end: true },
          { label: 'เพิ่มรายการ', icon: CirclePlus, to: '/transactions/add' },
        ],
      },
      { label: 'งบประมาณ', icon: PiggyBank, to: '/budget' },
      { label: 'เป้าหมาย', icon: Target, to: '/goals' },
    ],
  },
  {
    label: 'วิเคราะห์',
    items: [
      { label: 'พฤติกรรม', icon: Activity, to: '/behavior' },
      { label: 'การพยากรณ์', icon: TrendingUp, to: '/forecast' },
      { label: 'รายการที่ควรตรวจสอบ', icon: ShieldAlert, to: '/anomaly' },
    ],
  },
];

export const isNavMatch = (item: NavItem, pathname: string) =>
  item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`);
