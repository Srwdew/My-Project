import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import './NextStep.css';

/** The way forward from an empty or not-enough-data message. */
export default function NextStep({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="next-step" to={to}>{children}</Link>;
}
