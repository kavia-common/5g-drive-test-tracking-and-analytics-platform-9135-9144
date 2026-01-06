import React, { useEffect } from "react";
import "./App.css";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { config, getPublicConfigSnapshot, logger } from "./config";
import DashboardShell from "./components/layout/DashboardShell";
import { RoleProvider } from "./context/RoleContext";
import RequireRole from "./components/auth/RequireRole";

import LiveTrackingPage from "./pages/LiveTrackingPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import UploadPage from "./pages/UploadPage";
import CompliancePage from "./pages/CompliancePage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/SettingsPage";
import NotFoundPage from "./pages/NotFoundPage";

/**
 * PUBLIC_INTERFACE
 * App is the main SPA entrypoint. It wires:
 * - RoleProvider (demo RBAC)
 * - React Router routes
 * - DashboardShell layout
 *
 * @returns {JSX.Element}
 */
function App() {
  // Initialize runtime config once (module initialization happens on import).
  // Keep logging non-noisy: a single info log outside production.
  useEffect(() => {
    if (config.nodeEnv !== "production") {
      logger.info("[config]", getPublicConfigSnapshot());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="App">
      <RoleProvider>
        <BrowserRouter>
          <DashboardShell title="Operations Dashboard">
            <Routes>
              <Route path="/" element={<Navigate to="/live" replace />} />

              <Route path="/live" element={<LiveTrackingPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />

              <Route
                path="/upload"
                element={
                  <RequireRole allow={["operator", "admin"]}>
                    <UploadPage />
                  </RequireRole>
                }
              />

              <Route
                path="/compliance"
                element={
                  <RequireRole allow={["viewer", "operator", "admin"]}>
                    <CompliancePage />
                  </RequireRole>
                }
              />

              <Route
                path="/reports"
                element={
                  <RequireRole allow={["viewer", "operator", "admin"]}>
                    <ReportsPage />
                  </RequireRole>
                }
              />

              <Route
                path="/settings"
                element={
                  <RequireRole allow={["operator", "admin"]}>
                    <SettingsPage />
                  </RequireRole>
                }
              />

              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </DashboardShell>
        </BrowserRouter>
      </RoleProvider>
    </div>
  );
}

export default App;
