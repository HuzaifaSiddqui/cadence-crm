import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import { PageLoading } from './components/ui';
import Login from './pages/Login';

// Route-level code splitting keeps the first load light (charts only load with Dashboard/Analytics).
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Pipeline = lazy(() => import('./pages/Pipeline'));
const Contacts = lazy(() => import('./pages/Contacts'));
const ContactDetail = lazy(() => import('./pages/ContactDetail'));
const CompanyDetail = lazy(() => import('./pages/CompanyDetail'));
const Workflows = lazy(() => import('./pages/Workflows'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Team = lazy(() => import('./pages/Team'));
const Billing = lazy(() => import('./pages/Billing'));

function Protected({ children }) {
  const { session, booting } = useAuth();
  const loc = useLocation();
  if (booting) return <PageLoading />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/invite/:token" element={<Login invite />} />
        <Route element={<Protected><Layout /></Protected>}>
          <Route index element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="contacts" element={<Contacts />} />
          <Route path="contacts/:id" element={<ContactDetail />} />
          <Route path="companies/:id" element={<CompanyDetail />} />
          <Route path="workflows" element={<Workflows />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="team" element={<Team />} />
          <Route path="billing" element={<Billing />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
