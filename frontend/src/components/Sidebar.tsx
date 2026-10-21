import { NavLink } from 'react-router-dom';
import { useNavigate } from 'react-router-dom';
import { removeToken } from '../auth';
import './Sidebar.css';

export default function Sidebar() {
  const navigate = useNavigate();

const handleLogout = () => {
  if (!window.dispatchEvent(new Event("spendsense-before-logout", { cancelable: true }))) return;
  removeToken();

  navigate('/login', {
    replace: true,
  });
};
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-box">S</div>
        <span>SpendSense</span>
      </div>

      <nav className="sidebar-menu">
        <NavLink to="/overview" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
          <span aria-hidden="true">⌂</span><span>ภาพรวม</span>
        </NavLink>
        <NavLink to="/transactions" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
          <span aria-hidden="true">☷</span><span>ธุรกรรม</span>
        </NavLink>
        <NavLink to="/budget" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
          <span aria-hidden="true">◫</span><span>งบประมาณ</span>
        </NavLink>
        <NavLink to="/goals" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>
          <span aria-hidden="true">◎</span><span>เป้าหมาย</span>
        </NavLink>
        <NavLink to="/behavior" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>พฤติกรรม</NavLink>
        <NavLink to="/forecast" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>การพยากรณ์</NavLink>
        <NavLink to="/anomaly" className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}>รายการที่ควรตรวจสอบ</NavLink>
      </nav>

      <div className="sidebar-bottom">
        <NavLink
  to="/settings"
  className={({ isActive }) =>
    `sidebar-item ${isActive ? 'active' : ''}`
  }
>
  <span>⚙</span>
  <span>ตั้งค่า</span>
</NavLink>

        <button
  type="button"
  className="sidebar-logout"
  onClick={handleLogout}
>
  ออกจากระบบ
</button>
      </div>
    </aside>

    
  );

}