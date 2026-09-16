import NotificationBell from './NotificationBell';
import { useProfile } from '../contexts/ProfileContext';
import './UserHeader.css';

export default function UserHeader() {
  const { profile, loading } = useProfile();

  const name =
    profile?.displayName ||
    profile?.email.split('@')[0] ||
    (loading ? 'กำลังโหลด...' : 'ผู้ใช้');

  const initial = profile
    ? name.charAt(0).toUpperCase()
    : 'U';

  return (
    <div className="user-header">
      <NotificationBell />

      <div className="user-header-profile">
        <div className="user-header-avatar">
          {initial}
        </div>

        <div className="user-header-info">
          <strong title={name}>{name}</strong>

          {profile && (
            <span title={profile.email}>
              {profile.email}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}