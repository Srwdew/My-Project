import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';
import { removeToken } from '../auth';
import { useProfile } from '../contexts/ProfileContext';
import { useMenu } from './useMenu';
import './AppNav.css';
import './UserHeader.css';

export default function UserHeader() {
  const navigate = useNavigate();
  const { profile, loading, avatarUrl } = useProfile();
  const { open, triggerProps, rootProps, menuProps } = useMenu();

  const name =
    profile?.displayName ||
    profile?.email.split('@')[0] ||
    (loading ? 'กำลังโหลด...' : 'ผู้ใช้');

  const initial = profile
    ? name.charAt(0).toUpperCase()
    : 'U';

  const handleLogout = () => {
    if (!window.dispatchEvent(new Event('spendsense-before-logout', { cancelable: true }))) return;
    removeToken();
    navigate('/login', { replace: true });
  };

  return (
    <div className="user-header">
      <NotificationBell />

      <div className="user-header-account" {...rootProps}>
        <button type="button" className="user-header-profile" aria-label={`เมนูบัญชี ${name}`} {...triggerProps}>
          <span className="user-header-avatar">
            {avatarUrl ? <img src={avatarUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:"50%"}} /> : initial}
          </span>

          <span className="user-header-info">
            <strong title={name}>{name}</strong>

            {profile && (
              <span title={profile.email}>
                {profile.email}
              </span>
            )}
          </span>
          <ChevronDown className="user-header-chevron" size={16} aria-hidden="true" />
        </button>

        {open && (
          <div className="app-menu user-header-menu" aria-label="เมนูบัญชี" {...menuProps}>
            <NavLink to="/settings" role="menuitem" className="app-menu-item">
              <Settings size={20} aria-hidden="true" />
              <span>ตั้งค่า</span>
            </NavLink>
            <button type="button" role="menuitem" className="app-menu-item is-danger account-logout" onClick={handleLogout}>
              <LogOut size={20} aria-hidden="true" />
              <span>ออกจากระบบ</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
