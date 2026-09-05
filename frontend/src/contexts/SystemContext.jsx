import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePoll } from "../lib/usePoll.js";
import api from "../lib/api.js";

const SystemContext = createContext(null);

/**
 * Provides system-wide polled data to all pages.
 * Centralises what was previously scattered across App.jsx.
 */
export function SystemProvider({ children }) {
  // ── refetch nonce for incidents (allows manual re-poll) ──
  const [incidentNonce, setIncidentNonce] = useState(0);

  // ── Core data polling ──
  const { data: edgeStatus, loading: edgeLoading } = usePoll(
    () => api.getEdgeStatus(),
    5000
  );
  const { data: cameraHealthRaw, loading: camerasLoading } = usePoll(
    () => api.getCameraHealth(),
    5000
  );
  const {
    data: incidentsRaw,
    error: incidentsError,
    loading: incidentsLoading,
  } = usePoll(() => api.getIncidents(50), 5000, [incidentNonce]);

  const { data: blockchain, error: blockchainError } = usePoll(
    () => api.getBlockchain(),
    8000
  );
  const { data: networkStatus } = usePoll(() => api.getNetworkStatus(), 5000);
  const { data: calibration } = usePoll(() => api.getCalibration(), 10000);

  // ── Derived data ──
  const cameraHealth = cameraHealthRaw?.cameras || [];
  const incidents = incidentsRaw || [];

  const activeIncidents = useMemo(
    () =>
      incidents.filter(
        (i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"
      ),
    [incidents]
  );

  const cameraCounts = useMemo(() => {
    const online = cameraHealth.filter(
      (c) => c.status === "ONLINE"
    ).length;
    const warning = cameraHealth.filter(
      (c) => c.status === "STALE" || c.status === "WARNING" || c.status === "FAULT"
    ).length;
    const offline = cameraHealth.filter(
      (c) => c.status === "OFFLINE"
    ).length;
    return { total: cameraHealth.length, online, warning, offline };
  }, [cameraHealth]);

  // Detect if we're running in simulation/mock mode
  // (mock fallback returns hardcoded uptime_seconds of 18450)
  const isSimulation = useMemo(() => {
    if (!edgeStatus) return true;
    return edgeStatus.hardware_simulation_mode === true;
  }, [edgeStatus]);

  const isNetworkDown = networkStatus?.simulated_down === true;

  const refetchIncidents = useCallback(
    () => setIncidentNonce((n) => n + 1),
    []
  );

  const value = useMemo(
    () => ({
      // Raw data
      edgeStatus,
      cameraHealth,
      incidents,
      activeIncidents,
      blockchain,
      blockchainError,
      networkStatus,
      calibration,
      incidentsError,

      // Derived
      cameraCounts,
      isSimulation,
      isNetworkDown,

      // Loading states
      edgeLoading,
      camerasLoading,
      incidentsLoading,

      // Actions
      refetchIncidents,
    }),
    [
      edgeStatus,
      cameraHealth,
      incidents,
      activeIncidents,
      blockchain,
      blockchainError,
      networkStatus,
      calibration,
      incidentsError,
      cameraCounts,
      isSimulation,
      isNetworkDown,
      edgeLoading,
      camerasLoading,
      incidentsLoading,
      refetchIncidents,
    ]
  );

  return (
    <SystemContext.Provider value={value}>{children}</SystemContext.Provider>
  );
}

/** @returns {ReturnType<typeof SystemProvider extends ({children}:{children:any}) => any ? never : never>} */
export function useSystem() {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error("useSystem must be used inside <SystemProvider>");
  return ctx;
}

export default SystemContext;
