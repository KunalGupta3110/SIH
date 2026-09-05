import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { SystemProvider } from "./contexts/SystemContext.jsx";
import TacticalShell from "./components/layout/TacticalShell.jsx";
import LoadingState from "./components/ui/LoadingState.jsx";

// ── Lazy-loaded pages ──
const LiveOperations = lazy(() => import("./pages/LiveOperations.jsx"));
const IncidentsPage = lazy(() => import("./pages/IncidentsPage.jsx"));
const IncidentWorkspace = lazy(() => import("./pages/IncidentWorkspace.jsx"));
const ReconstructionPage = lazy(() => import("./pages/ReconstructionPage.jsx"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage.jsx"));
const CameraHealthPage = lazy(() => import("./pages/CameraHealthPage.jsx"));
const EvidenceVaultPage = lazy(() => import("./pages/EvidenceVaultPage.jsx"));
const SystemSettingsPage = lazy(() => import("./pages/SystemSettingsPage.jsx"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <LoadingState variant="full" />
    </div>
  );
}

export default function App() {
  return (
    <SystemProvider>
      <Routes>
        <Route element={<TacticalShell />}>
          <Route
            index
            element={
              <Suspense fallback={<PageLoader />}>
                <LiveOperations />
              </Suspense>
            }
          />
          <Route
            path="map"
            element={
              <Suspense fallback={<PageLoader />}>
                <LiveOperations fullMap />
              </Suspense>
            }
          />
          <Route
            path="cameras"
            element={
              <Suspense fallback={<PageLoader />}>
                <CameraHealthPage />
              </Suspense>
            }
          />
          <Route
            path="incidents"
            element={
              <Suspense fallback={<PageLoader />}>
                <IncidentsPage />
              </Suspense>
            }
          />
          <Route
            path="incidents/:incidentId"
            element={
              <Suspense fallback={<PageLoader />}>
                <IncidentWorkspace />
              </Suspense>
            }
          />
          <Route
            path="reconstruction"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReconstructionPage />
              </Suspense>
            }
          />
          <Route
            path="reconstruction/:incidentId"
            element={
              <Suspense fallback={<PageLoader />}>
                <ReconstructionPage />
              </Suspense>
            }
          />
          <Route
            path="analytics"
            element={
              <Suspense fallback={<PageLoader />}>
                <AnalyticsPage />
              </Suspense>
            }
          />
          <Route
            path="evidence"
            element={
              <Suspense fallback={<PageLoader />}>
                <EvidenceVaultPage />
              </Suspense>
            }
          />
          <Route
            path="settings"
            element={
              <Suspense fallback={<PageLoader />}>
                <SystemSettingsPage />
              </Suspense>
            }
          />
          {/* Catch-all redirect */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </SystemProvider>
  );
}
