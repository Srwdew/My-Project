import type { ReactNode } from 'react';
import './SummaryCard.css';

// Presentation only: callers retain their own money/date/percentage conventions.
export default function SummaryCard({ label, value, unit, icon, action, children, className = '' }: {
  label: string; value: ReactNode; unit?: string; icon: ReactNode;
  action?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <section className={'summary-card dashboard-panel dashboard-kpi ' + className}>
    <div className="summary-card-heading dashboard-kpi-heading">
      <h2>{label}</h2><div className="summary-card-actions">{action}<span className="summary-card-icon dashboard-icon">{icon}</span></div>
    </div>
    <strong className="summary-card-value dashboard-money">{value}{unit && <small>{unit}</small>}</strong>
    {children}
  </section>;
}
