import {
  Link,
  Navigate,
  Route,
  Routes,
} from 'react-router-dom';

import AppLayout from './components/Applayout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Overview from './pages/Overview';
import AddTransaction from './pages/Addtransaction';
import TransactionHistory from './pages/Transactionhistory';
import EditTransaction from './pages/EditTransaction';
import Settings from './pages/Settings';
import Budget from './pages/Budget';
import Goals from './pages/Goals';


function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={<Login />}
      />

      <Route
        path="/register"
        element={<Register />}
      />

      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Routes>
                <Route
                  path="/"
                  element={
                    <Navigate
                      to="/overview"
                      replace
                    />
                  }
                />

                <Route
                  path="/overview"
                  element={<Overview />}
                />

                <Route
  path="/settings"
  element={<Settings />}
/>

<Route
  path="/budget"
  element={<Budget />}
/>

                <Route
                  path="/transactions"
                  element={<TransactionHistory />}
                />

                <Route
                  path="/transactions/add"
                  element={<AddTransaction />}
                />

                <Route
                  path="/transactions/:id/edit"
                  element={<EditTransaction />}
                />

<Route path="/goals" element={<Goals />} />

<Route
  path="*"
  element={
    <section style={{ padding: '24px' }}>
      <h1>ไม่พบหน้าที่ต้องการ</h1>
      <p>กรุณาเลือกเมนูด้านข้าง หรือกลับไปหน้าภาพรวม</p>
      <Link to="/overview">กลับหน้าภาพรวม</Link>
    </section>
  }
/>

              </Routes>
            </AppLayout>
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;