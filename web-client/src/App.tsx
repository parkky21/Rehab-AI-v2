import { Navigate, Route, Routes } from "react-router-dom";

import { Shell } from "./components/Shell";
import { useAuth } from "./lib/auth";
import { DoctorDashboardPage } from "./pages/DoctorDashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PatientExercisePage } from "./pages/PatientExercisePage";
import { PatientProgressPage } from "./pages/PatientProgressPage";

function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="screen-center">Loading session...</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Shell />
          </RequireAuth>
        }
      >
        <Route index element={<RoleHome />} />
        <Route path="doctor" element={<DoctorDashboardPage />} />
        <Route path="patient/exercise" element={<PatientExercisePage />} />
        <Route path="patient/progress" element={<PatientProgressPage />} />
        {/* Legacy redirect */}
        <Route path="patient" element={<Navigate to="/patient/exercise" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function RoleHome() {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === "doctor") {
    return <Navigate to="/doctor" replace />;
  }
  return <Navigate to="/patient/exercise" replace />;
}
