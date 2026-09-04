import { useCallback, useState } from "react";
import NavRail from "./components/NavRail.jsx";
import TopBar from "./components/TopBar.jsx";
import LivePanel from "./components/LivePanel.jsx";
import IncidentsPanel from "./components/IncidentsPanel.jsx";
import EvidencePanel from "./components/EvidencePanel.jsx";
import TriagePanel from "./components/TriagePanel.jsx";
import MapPanel from "./components/MapPanel.jsx";
import ModelZooPanel from "./components/ModelZooPanel.jsx";
import { usePoll } from "./lib/usePoll.js";
import api from "./lib/api.js";

export default function App() {
  const [section, setSection] = useState("live");
  const [armPending, setArmPending] = useState(false);
  const [simulating, setSimulating] = useState(false);

  const { data: edgeStatus, error: edgeError } = usePoll(() => api.getEdgeStatus(), 5000);
  const {
    data: incidents,
    error: incidentsError,
    loading: incidentsLoading,
    refetch: refetchIncidents,
  } = usePollWithRefetch(() => api.getIncidents(50), 5000);
  const { data: blockchain, error: blockchainError } = usePoll(() => api.getBlockchain(), 5000);

  const handleToggleArm = useCallback(async () => {
    if (!edgeStatus) return;
    setArmPending(true);
    try {
      await api.setArmState(edgeStatus.arm_state === "armed" ? "disarmed" : "armed");
    } catch (e) {
      console.error(e);
    } finally {
      setArmPending(false);
    }
  }, [edgeStatus]);

  const handleSimulate = useCallback(async () => {
    setSimulating(true);
    try {
      await api.simulateHandoff();
      refetchIncidents();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  }, [refetchIncidents]);

  const handleSilence = useCallback(() => {
    api.silenceSiren().catch(console.error);
  }, []);

  return (
    <div className="flex h-screen w-full bg-base text-ink">
      <NavRail
        section={section}
        setSection={setSection}
        armState={edgeStatus?.arm_state}
        onToggleArm={handleToggleArm}
        armPending={armPending}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          edgeStatus={edgeStatus}
          edgeError={edgeError}
          onSimulate={handleSimulate}
          simulating={simulating}
          onSilence={handleSilence}
        />
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {section === "live" && <LivePanel onCaseTriggered={refetchIncidents} />}
          {section === "incidents" && (
            <IncidentsPanel incidents={incidents} error={incidentsError} onAcknowledge={refetchIncidents} />
          )}
          {section === "evidence" && <EvidencePanel blockchain={blockchain} error={blockchainError} />}
          {section === "triage" && (
            <TriagePanel incidents={incidents} error={incidentsError} onAcknowledge={refetchIncidents} />
          )}
          {section === "map" && <MapPanel incidents={incidents} />}
          {section === "zoo" && <ModelZooPanel />}
        </div>
      </div>
    </div>
  );
}

// usePoll doesn't expose a manual refetch, but acknowledging/simulating
// needs to refresh incidents immediately rather than waiting up to 5s —
// this small wrapper adds that without changing the shared hook's API.
function usePollWithRefetch(fetcher, intervalMs) {
  const [nonce, setNonce] = useState(0);
  const poll = usePoll(fetcher, intervalMs, [nonce]);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...poll, refetch };
}
