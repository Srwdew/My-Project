import PageSkeleton from "./components/PageSkeleton";
import { lazy, Suspense } from "react";
import Guide from "./pages/Guide";
const PublicHome = lazy(() => import("./pages/PublicHome"));
const PasswordRecovery = lazy(() => import("./pages/PasswordRecovery"));
const Privacy = lazy(() => import("./pages/Privacy"));
import "./pageChrome.css";
import "./components/Motion.css";
const Admin = lazy(() => import("./pages/Admin"));
const AnomalyQueue = lazy(() => import("./pages/AnomalyQueue"));
const Setup = lazy(() => import("./pages/Setup"));
const AnomalyDetailPage = lazy(() => import("./pages/AnomalyDetail"));
const Behavior = lazy(() => import("./pages/Behavior"));
const Forecast = lazy(() => import("./pages/Forecast"));
import { Link, Navigate, Route, Routes } from "react-router-dom";

const AppLayout = lazy(() => import("./components/Applayout"));
const ProtectedRoute = lazy(() => import("./components/ProtectedRoute"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Overview = lazy(() => import("./pages/Overview"));
const AddTransaction = lazy(() => import("./pages/Addtransaction"));
const TransactionHistory = lazy(() => import("./pages/Transactionhistory"));
const EditTransaction = lazy(() => import("./pages/EditTransaction"));
const Settings = lazy(() => import("./pages/Settings"));
const Budget = lazy(() => import("./pages/Budget"));
const Goals = lazy(() => import("./pages/Goals"));

function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route path="/" element={<PublicHome />} />
        <Route
          path="/setup"
          element={
            <ProtectedRoute setupPage>
              <Setup />
            </ProtectedRoute>
          }
        />
        <Route path="/guide" element={<Guide />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route
          path="/password-recovery"
          element={<PasswordRecovery key="forgot" />}
        />
        <Route
          path="/forgot-password"
          element={<PasswordRecovery key="forgot" />}
        />
        <Route
          path="/reset-password"
          element={<PasswordRecovery key="reset" reset />}
        />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <Admin />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />

        <Route path="/register" element={<Register />} />

        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <AppLayout>
                {/* Inner boundary keeps the sidebar/tab bar mounted while a page chunk loads. */}
                <Suspense fallback={<PageSkeleton />}>
                <Routes>
                  <Route
                    path="/"
                    element={<Navigate to="/overview" replace />}
                  />

                  <Route path="/overview" element={<Overview />} />

                  <Route path="/settings" element={<Settings />} />

                  <Route path="/budget" element={<Budget />} />

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
                  <Route path="/forecast" element={<Forecast />} />
                  <Route
                    path="/notifications/:notificationId/anomaly"
                    element={<AnomalyDetailPage />}
                  />
                  <Route
                    path="/transactions/:transactionId/anomaly"
                    element={<AnomalyDetailPage />}
                  />
                  <Route path="/anomaly" element={<AnomalyQueue />} />
                  <Route path="/behavior" element={<Behavior />} />

                  <Route
                    path="*"
                    element={
                      <section style={{ padding: "24px" }}>
                        <h1>ไม่พบหน้าที่ต้องการ</h1>
                        <p>กรุณาเลือกเมนูด้านข้าง หรือกลับไปหน้าภาพรวม</p>
                        <Link to="/overview">กลับหน้าภาพรวม</Link>
                      </section>
                    }
                  />
                </Routes>
                </Suspense>
              </AppLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  );
}

export default App;
