import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { PageSpinner } from '@salon/ui';
import { useSession } from './store';
import Layout from './components/Layout';
import LoginPage from './pages/Login';
import OnboardingPage from './pages/Onboarding';
import DashboardPage from './pages/Dashboard';
import CalendarPage from './pages/Calendar';
import CustomersPage from './pages/Customers';
import ServicesPage from './pages/Services';
import ResourcesPage from './pages/Resources';
import TeamPage from './pages/Team';
import BillingPage from './pages/Billing';
import SettingsPage from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === 'loading') return <PageSpinner />;
  if (status === 'anon') return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  const load = useSession((s) => s.load);
  const status = useSession((s) => s.status);
  React.useEffect(() => {
    void load();
  }, [load]);

  const loc = useLocation();
  // Full-screen auth pages without CRM chrome
  if (loc.pathname === '/login') return <React.Suspense fallback={<PageSpinner />}><LoginPage /></React.Suspense>;

  if (status === 'loading') return <PageSpinner />;
  if (status === 'anon') return <React.Suspense fallback={<PageSpinner />}><LoginPage /></React.Suspense>;

  return (
    <RequireAuth>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/resources" element={<ResourcesPage />} />
          <Route path="/team" element={<TeamPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </RequireAuth>
  );
}
