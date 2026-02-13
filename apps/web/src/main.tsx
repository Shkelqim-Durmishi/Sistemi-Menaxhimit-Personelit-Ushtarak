// src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';

import Dashboard from './pages/Dashboard';
import ReportsEditor from './pages/ReportsEditor';
import Approvals from './pages/Approvals';
import Login from './pages/Login';
import UsersPage from './pages/Users';
import LoginAuditPage from './pages/LoginAudit';
import PeoplePage from './pages/People';
import PeoplePendingPage from './pages/PeoplePending';
import Requests from './pages/Requests';

// ✅ NEW – GPS Vehicles Live
import VehiclesLive from './pages/VehiclesLive';

// ✅ NEW – Profile + Change Password
import ProfilePage from './pages/profile';
import ChangePasswordPage from './pages/change-password';

import './index.css';
import { getCurrentUser } from './lib/api';

/* =======================
   AUTH GUARDS
======================= */

function RequireAuth({ children }: { children: JSX.Element }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireRole({ roles, children }: { roles: string[]; children: JSX.Element }) {
  const user = getCurrentUser();
  if (!user) return <Navigate to="/login" replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

/* =======================
   QUERY CLIENT
======================= */

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/* =======================
   APP BOOTSTRAP
======================= */

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* LOGIN */}
          <Route path="/login" element={<Login />} />

          {/* APP SHELL */}
          <Route path="/" element={<App />}>
            {/* DASHBOARD */}
            <Route
              index
              element={
                <RequireAuth>
                  <Dashboard />
                </RequireAuth>
              }
            />

            {/* ✅ PROFILE */}
            <Route
              path="profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />

            {/* ✅ CHANGE PASSWORD */}
            <Route
              path="change-password"
              element={
                <RequireAuth>
                  <ChangePasswordPage />
                </RequireAuth>
              }
            />

            {/* REPORTS */}
            <Route
              path="reports"
              element={
                <RequireAuth>
                  <ReportsEditor />
                </RequireAuth>
              }
            />

            {/* PEOPLE */}
            <Route
              path="people"
              element={
                <RequireRole roles={['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER']}>
                  <PeoplePage />
                </RequireRole>
              }
            />

            <Route
              path="people/pending"
              element={
                <RequireRole roles={['ADMIN', 'COMMANDER']}>
                  <PeoplePendingPage />
                </RequireRole>
              }
            />

            {/* APPROVALS */}
            <Route
              path="approvals"
              element={
                <RequireRole roles={['ADMIN', 'OFFICER', 'COMMANDER', 'AUDITOR']}>
                  <Approvals />
                </RequireRole>
              }
            />

            {/* REQUESTS */}
            <Route
              path="requests"
              element={
                <RequireRole roles={['ADMIN', 'OFFICER', 'OPERATOR', 'COMMANDER', 'AUDITOR']}>
                  <Requests />
                </RequireRole>
              }
            />

            {/* ✅ GPS – VEHICLES LIVE */}
            <Route
              path="vehicles-live"
              element={
                <RequireRole roles={['ADMIN', 'COMMANDER']}>
                  <VehiclesLive />
                </RequireRole>
              }
            />

            {/* ADMIN */}
            <Route
              path="users"
              element={
                <RequireRole roles={['ADMIN']}>
                  <UsersPage />
                </RequireRole>
              }
            />

            <Route
              path="admin/login-audit"
              element={
                <RequireRole roles={['ADMIN']}>
                  <LoginAuditPage />
                </RequireRole>
              }
            />

            {/* FALLBACK */}
            <Route path="*" element={<Navigate to="/" />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);