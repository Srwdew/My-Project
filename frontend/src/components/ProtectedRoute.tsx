import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSessionKey } from '../auth';
export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const session = useSessionKey();
  return session ? children : <Navigate to="/login" replace />;
}
