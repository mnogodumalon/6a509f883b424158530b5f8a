import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import KursplanPage from '@/pages/KursplanPage';
import KursplanDetailPage from '@/pages/KursplanDetailPage';
import BuchungenPage from '@/pages/BuchungenPage';
import BuchungenDetailPage from '@/pages/BuchungenDetailPage';
import PublicFormKursplan from '@/pages/public/PublicForm_Kursplan';
import PublicFormBuchungen from '@/pages/public/PublicForm_Buchungen';
// <public:imports>
// </public:imports>
// <custom:imports>
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/6a509f71578595715144f358" element={<PublicFormKursplan />} />
              <Route path="public/6a509f74f14684380deb788b" element={<PublicFormBuchungen />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="kursplan" element={<KursplanPage />} />
                <Route path="kursplan/:id" element={<KursplanDetailPage />} />
                <Route path="buchungen" element={<BuchungenPage />} />
                <Route path="buchungen/:id" element={<BuchungenDetailPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}
