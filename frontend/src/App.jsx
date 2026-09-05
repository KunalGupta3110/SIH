import { useCallback, useMemo, useState } from "react";
import TopBar from "./components/TopBar.jsx";
import MapPanel from "./components/MapPanel.jsx";
import EntitiesPanel from "./components/EntitiesPanel.jsx";
import EntityDetailPanel from "./components/EntityDetailPanel.jsx";
import EventSeriesStrip from "./components/EventSeriesStrip.jsx";
import IncidentsPanel from "./components/IncidentsPanel.jsx";
import TriagePanel from "./components/TriagePanel.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import { usePoll } from "./lib/usePoll.js";
import api from "./lib/api.js";

// IBVAP Sentinel Console — Common Operating Picture rebuild.
//
// The map is the default screen (mode === "cop"), not a tab you navigate
// to. Everything else — the entities list, the selected track/sensor
// detail, the event series — is a floating glass panel over that map.
// The other 4 modes (Entities & Sensors / Track Board / Tasking Queue /
// Chain of Custody) are dedicated full-page views for when an operator
// wants the whole list rather than one selected thing.
export default function App() {
  const [mode, setMode] = useState("cop");
  const [selectedId, setSelectedId] = useState(null);

  const { data: edgeStatus } = usePoll(() => api.getEdgeStatus(), 5000);
  const { data: cameraHealthRaw } = usePoll(() => api.getCameraHealth(), 5000);
  const {
    data: incidentsRaw,
    error: incidentsError,
    refetch: refetchIncidents,
  } = usePollWithRefetch(() => api.getIncidents(50), 5000);
  const { data: blockchain, error: blockchainError } = usePoll(() => api.getBlockchain(), 5000);

  const cameraHealth = cameraHealthRaw?.cameras || [];
  const incidents = incidentsRaw || [];

  const activeTrackCount = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP").length,
    [incidents]
  );

  const selectedCamera = useMemo(
    () => cameraHealth.find((c) => c.camera_id === selectedId) || null,
    [cameraHealth, selectedId]
  );
  const selectedTrack = useMemo(
    () => incidents.find((i) => i.incident_id === selectedId) || null,
    [incidents, selectedId]
  );

  const handleSelect = useCallback((id) => {
    setSelectedId((current) => (current === id ? null : id));
  }, []);

  const handleSilence = useCallback(() => {
    api.silenceSiren().catch(console.error);
  }, []);

  return (
    <div className="relative h-screen w-full overflow-hidden bg-[#060a10] text-slate-200" style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}>
      <TopBar
        mode={mode}
        setMode={setMode}
        edgeStatus={edgeStatus}
        cameraCount={cameraHealth.length}
        activeTrackCount={activeTrackCount}
        onSilence={handleSilence}
      />

      {mode === "cop" && (
        <>
          <MapPanel
            cameraHealth={cameraHealth}
            incidents={incidents}
            selectedId={selectedId}
            onSelect={handleSelect}
          />
          <EntitiesPanel
            cameraHealth={cameraHealth}
            incidents={incidents}
            selectedId={selectedId}
            onSelect={handleSelect}
            variant="floating"
          />
          {selectedCamera && (
            <EntityDetailPanel kind="SENSOR" entity={selectedCamera} onClose={() => setSelectedId(null)} />
          )}
          {selectedTrack && (
            <EntityDetailPanel
              kind="TRACK"
              entity={selectedTrack}
              onClose={() => setSelectedId(null)}
              onAcknowledged={refetchIncidents}
            />
          )}
          <EventSeriesStrip incidents={incidents} />
        </>
      )}

      {mode === "entities" && (
        <div className="absolute inset-0 top-14 bg-[#060a10]">
          <EntitiesPanel
            cameraHealth={cameraHealth}
            incidents={incidents}
            selectedId={selectedId}
            onSelect={handleSelect}
            variant="full"
          />
        </div>
      )}

      {mode === "tracks" && (
        <div className="absolute inset-0 top-14 bg-[#060a10]">
          <IncidentsPanel incidents={incidents} error={incidentsError} onAcknowledge={refetchIncidents} />
        </div>
      )}

      {mode === "tasking" && (
        <div className="absolute inset-0 top-14 bg-[#060a10]">
          <TriagePanel incidents={incidents} error={incidentsError} onAcknowledge={refetchIncidents} />
        </div>
      )}

      {mode === "chain" && (
        <div className="absolute inset-0 top-14 bg-[#060a10]">
          <EvidencePanel blockchain={blockchain} error={blockchainError} />
        </div>
      )}
    </div>
  );
}

function usePollWithRefetch(fetcher, intervalMs) {
  const [nonce, setNonce] = useState(0);
  const poll = usePoll(fetcher, intervalMs, [nonce]);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...poll, refetch };
}
