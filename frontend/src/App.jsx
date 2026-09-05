import { useState, useMemo, useCallback } from "react";
import StickyTopBar from "./components/StickyTopBar.jsx";
import ExecutiveCommandOverview from "./components/ExecutiveCommandOverview.jsx";
import LiveSurveillanceSection from "./components/LiveSurveillanceSection.jsx";
import TrackBoard from "./components/TrackBoard.jsx";
import MapPanel from "./components/MapPanel.jsx";
import ChainOfCustody from "./components/ChainOfCustody.jsx";
import SectionHeader from "./components/SectionHeader.jsx";
import { usePoll } from "./lib/usePoll.js";
import api from "./lib/api.js";
import { ArrowUp, ShieldCheck, Cpu } from "lucide-react";

export default function App() {
  const [selectedMapId, setSelectedMapId] = useState(null);
  const [populatingDemo, setPopulatingDemo] = useState(false);

  // Real backend polling
  const { data: edgeStatus } = usePoll(() => api.getEdgeStatus(), 5000);
  const { data: cameraHealthRaw, refetch: refetchCameras } = usePollWithRefetch(
    () => api.getCameraHealth(),
    5000
  );
  const {
    data: incidentsRaw,
    error: incidentsError,
    refetch: refetchIncidents,
  } = usePollWithRefetch(() => api.getIncidents(50), 4000);
  const { data: blockchain, error: blockchainError, refetch: refetchBlockchain } = usePollWithRefetch(
    () => api.getBlockchain(),
    6000
  );

  const cameraHealth = cameraHealthRaw?.cameras || [];
  const incidents = incidentsRaw || [];

  const activeTrackCount = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP").length,
    [incidents]
  );

  const hasCriticalAlert = useMemo(
    () =>
      incidents.some(
        (i) =>
          i.severity === "CRITICAL" &&
          i.status !== "CONFIRMED" &&
          i.status !== "DISMISSED_FP"
      ),
    [incidents]
  );

  const handleSilence = useCallback(async () => {
    try {
      await api.silenceSiren();
    } catch (err) {
      console.error("Silence siren failed:", err);
    }
  }, []);

  const handlePopulateDemo = useCallback(async () => {
    if (populatingDemo) return;
    setPopulatingDemo(true);
    try {
      for (const caseId of [1, 2, 3, 4, 5]) {
        await api.simulateCase(caseId);
        await new Promise((r) => setTimeout(r, 900));
      }
      refetchIncidents();
      refetchCameras();
      refetchBlockchain();
    } catch (err) {
      console.error("Populate demo scenarios failed:", err);
    } finally {
      setPopulatingDemo(false);
    }
  }, [populatingDemo, refetchIncidents, refetchCameras, refetchBlockchain]);

  const handleResetDemo = useCallback(() => {
    api.resetDemo();
    refetchIncidents();
    refetchCameras();
    refetchBlockchain();
  }, [refetchIncidents, refetchCameras, refetchBlockchain]);

  const handleRefreshAll = useCallback(() => {
    refetchIncidents();
    refetchCameras();
    refetchBlockchain();
  }, [refetchIncidents, refetchCameras, refetchBlockchain]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div
      className="min-h-screen w-full bg-[#050b12] text-slate-200 antialiased selection:bg-sky-500/30 selection:text-sky-200"
      style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif" }}
    >
      {/* ── STICKY TOP BAR (Persists throughout scroll) ─────────────── */}
      <StickyTopBar
        edgeStatus={edgeStatus}
        cameraCount={cameraHealth.length}
        activeTrackCount={activeTrackCount}
        hasCriticalAlert={hasCriticalAlert}
        onSilence={handleSilence}
        onPopulateDemo={handlePopulateDemo}
        onResetDemo={handleResetDemo}
        populatingDemo={populatingDemo}
      />

      {/* ── MAIN CONTINUOUS SCROLL CONTAINER (5 CLEAN SECTIONS) ───────── */}
      <main className="mx-auto max-w-7xl px-6 py-8 space-y-14">
        {/* ── SECTION 1: COMMAND & SITUATIONAL OVERVIEW ─────────────── */}
        <section id="overview" className="scroll-mt-20">
          <ExecutiveCommandOverview
            edgeStatus={edgeStatus}
            cameraCount={cameraHealth.length}
            incidents={incidents}
            onSilenceSiren={handleSilence}
          />
        </section>

        {/* ── SECTION 2: SURVEILLANCE SCENARIOS & FOOTAGE SEARCH ────── */}
        <section id="surveillance" className="scroll-mt-20">
          <LiveSurveillanceSection
            cameraHealth={cameraHealth}
            incidents={incidents}
            onRefresh={handleRefreshAll}
          />
        </section>

        {/* ── SECTION 3: UNIFIED INCIDENT RECONSTRUCTION & HANDOFF ──── */}
        <section id="incidents" className="scroll-mt-20">
          <TrackBoard
            incidents={incidents}
            error={incidentsError}
            onAcknowledge={refetchIncidents}
          />
        </section>

        {/* ── SECTION 4: 2D TACTICAL BORDER MAP ─────────────────────── */}
        <section id="map" className="scroll-mt-20 flex flex-col gap-4">
          <SectionHeader
            title="Tactical Border Sector 2D Schematic"
            sub="Flat 2D spatial overview of the 100m restricted red zone, zero line, patrol road, camera telemetry pins, and active target vectors."
          />
          <MapPanel
            cameraHealth={cameraHealth}
            incidents={incidents}
            selectedId={selectedMapId}
            onSelect={(id) => setSelectedMapId((cur) => (cur === id ? null : id))}
          />
        </section>

        {/* ── SECTION 5: FORENSIC EVIDENCE VAULT & SECTION 65B ──────── */}
        <section id="custody" className="scroll-mt-20">
          <ChainOfCustody
            blockchain={blockchain}
            error={blockchainError}
          />
        </section>
      </main>

      {/* ── TACTICAL FOOTER ─────────────────────────────────────────── */}
      <footer className="border-t border-white/10 bg-[#03060a] py-8 text-slate-500 font-mono text-[11px]">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-6 w-6 items-center justify-center rounded border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <ShieldCheck size={14} />
            </div>
            <div>
              <span className="font-bold text-slate-300 tracking-wider">IBVAP SENTINEL</span>
              <span className="mx-2 text-slate-700">|</span>
              <span>PREDICTIVE MULTI-CAMERA BORDER RECONSTRUCTION</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Cpu size={12} className="text-emerald-400" />
              <span>NVIDIA JETSON ORIN INT8 RUNTIME</span>
            </div>
            <button
              onClick={scrollToTop}
              className="flex items-center gap-1 rounded border border-white/10 px-2.5 py-1 text-slate-400 hover:text-white hover:border-white/25 transition-all"
            >
              <span>TOP</span>
              <ArrowUp size={11} />
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function usePollWithRefetch(fetcher, intervalMs) {
  const [nonce, setNonce] = useState(0);
  const poll = usePoll(fetcher, intervalMs, [nonce]);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  return { ...poll, refetch };
}
