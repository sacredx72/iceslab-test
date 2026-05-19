import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { UsersPage } from './pages/UsersPage';
import { NodesPage } from './pages/NodesPage';
import { SrrPage } from './pages/SrrPage';
import { ProfilesPage } from './pages/ProfilesPage';
import { SquadsPage } from './pages/SquadsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="/nodes" element={<NodesPage />} />
          <Route path="/profiles" element={<ProfilesPage />} />
          {/* Slice 27 — /inbounds replaced by /profiles. Keep redirect so
              existing bookmarks don't 404. */}
          <Route path="/inbounds" element={<Navigate to="/profiles" replace />} />
          <Route path="/squads" element={<SquadsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/srr" element={<SrrPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
