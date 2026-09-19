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
        <NavLink
          to="/overview"
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''}`
          }
        >
          <span>⌂</span>
          <span>ภาพรวม</span>
        </NavLink>

        <NavLink
          to="/transactions/add"
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''}`
          }
        >
          <span>＋</span>
          <span>เพิ่มธุรกรรม</span>
        </NavLink>

        <NavLink
          to="/transactions"
          end
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''}`
          }
        >
          <span>☷</span>
          <span>ประวัติธุรกรรม</span>
        </NavLink>

        <NavLink
          to="/budget"
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''}`
          }
        >
          <span>◫</span>
          <span>งบประมาณ</span>
        </NavLink>

        <NavLink
          to="/goals"
          className={({ isActive }) =>
            `sidebar-item ${isActive ? 'active' : ''}`
          }
        >
          <span>◎</span>
          <span>เป้าหมายการเงิน</span>
        </NavLink>
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