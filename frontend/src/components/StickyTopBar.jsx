import { useState, useEffect, useMemo } from "react";
import { Shield, Bell, BellOff, Wifi, WifiOff, PlaySquare, CheckCircle2, RotateCcw } from "lucide-react";

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return t;
}

const SECTION_LINKS = [
  { id: "pipeline", label: "00 PIPELINE" },
  { id: "overview", label: "01 OVERVIEW" },
  { id: "handoff", label: "02 PREDICTIVE HANDOFF" },
  { id: "surveillance", label: "03 SCENARIO LAB" },
  { id: "incidents", label: "04 RECONSTRUCTION" },
  { id: "map", label: "05 BORDER MAP" },
  { id: "custody", label: "06 EVIDENCE VAULT" },
];

export default function StickyTopBar({
  edgeStatus,
  cameraCount = 0,
  activeTrackCount = 0,
  hasCriticalAlert = false,
  onSilence,
  onPopulateDemo,
  onResetDemo,
  populatingDemo = false,
}) {
  const clock = useClock();
  const timeStr = useMemo(() => clock.toLocaleTimeString("en-IN", { hour12: false }), [clock]);
  const online = edgeStatus?.connection === "online";
  const sirenActive = edgeStatus?.siren_active || hasCriticalAlert;

  const [silencedFeedback, setSilencedFeedback] = useState(false);
  const [silencing, setSilencing] = useState(false);

  const handleSilenceClick = async () => {
    setSilencing(true);
    try {
      await onSilence?.();
      setSilencedFeedback(true);
      setTimeout(() => setSilencedFeedback(false), 3500);
    } catch (err) {
      console.error(err);
    } finally {
      setSilencing(false);
    }
  };

  const scrollToSection = (id) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[#050b12]/95 backdrop-blur-md shadow-2xl transition-all">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md border border-sky-500/40 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
            <Shield size={18} className="text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-bold tracking-wider text-white">IBVAP SENTINEL</span>
              <span className="rounded bg-sky-500/15 px-1.5 py-0.2 font-mono text-[9.5px] font-semibold text-sky-300 border border-sky-500/30">
                CONSOLE
              </span>
            </div>
            <div className="font-mono text-[10px] text-slate-400 tracking-tight">
              SECTOR 4B · PUNJAB BORDER WATCHFLOOR
            </div>
          </div>
        </div>

        {/* Section Quick Jump Anchors */}
        <nav className="hidden lg:flex items-center gap-1 font-mono text-[11px]">
          {SECTION_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="rounded px-2.5 py-1 text-slate-400 transition-colors hover:bg-white/5 hover:text-sky-300 active:text-sky-200"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Controls & Telemetry */}
        <div className="flex items-center gap-3.5 font-mono text-[11px]">
          {/* Link Status */}
          <div
            className={`flex items-center gap-1.5 rounded border px-2 py-1 ${
              online
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/40 bg-red-500/15 text-red-300"
            }`}
          >
            {online ? <Wifi size={12} /> : <WifiOff size={12} />}
            <span className="font-semibold text-[10.5px]">{online ? "LINK NOMINAL" : "LINK OFFLINE"}</span>
          </div>

          {/* Honest Simulation Badge */}
          <div className="hidden sm:flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-semibold text-[10px]">◇ SIMULATION MODE</span>
          </div>

          {/* Counts */}
          <div className="hidden sm:flex items-center gap-2 text-slate-400 text-[10.5px]">
            <span className="text-slate-200 font-semibold">{cameraCount}</span> SENSORS
            <span className="text-slate-600">/</span>
            <span className={`font-semibold ${activeTrackCount > 0 ? "text-amber-400" : "text-slate-200"}`}>
              {activeTrackCount}
            </span>{" "}
            TRACKS
          </div>

          {/* Demo Scenario Seeder & Reset Buttons */}
          <div className="hidden md:flex items-center gap-1.5">
            {onPopulateDemo && (
              <button
                onClick={onPopulateDemo}
                disabled={populatingDemo}
                title="Seed 5 real distinct test scenarios via backend simulate-case"
                className="flex items-center gap-1.5 rounded border border-white/10 bg-black/40 px-2.5 py-1 text-[10.5px] text-slate-300 hover:border-white/25 hover:text-white transition-all disabled:opacity-50"
              >
                <PlaySquare size={11} className="text-sky-400" />
                <span>{populatingDemo ? "SEEDING..." : "SEED DEMO"}</span>
              </button>
            )}

            {onResetDemo && (
              <button
                onClick={onResetDemo}
                title="Reset simulation state to baseline"
                className="flex items-center gap-1 rounded border border-white/10 bg-black/40 px-2 py-1 text-[10.5px] text-slate-400 hover:text-white hover:border-white/25 transition-all"
              >
                <RotateCcw size={11} />
                <span>RESET</span>
              </button>
            )}
          </div>

          {/* PROMINENT SIREN / ALARM CONTROL */}
          <button
            onClick={handleSilenceClick}
            disabled={silencing}
            title="Silence system hardware siren and clear active acoustic alarm"
            className={`group relative flex items-center gap-2 rounded-md border px-3 py-1.5 font-mono text-[11px] font-bold transition-all shadow-lg active:scale-95 ${
              silencedFeedback
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : sirenActive
                ? "border-red-500 bg-red-500/25 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:border-sky-400 hover:bg-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.15)]"
            }`}
          >
            {silencedFeedback ? (
              <>
                <CheckCircle2 size={13} className="text-emerald-400" />
                <span>SIREN SILENCED</span>
              </>
            ) : sirenActive ? (
              <>
                <Bell size={13} className="text-red-400 animate-bounce" />
                <span>ALARM ACTIVE · SILENCE</span>
              </>
            ) : (
              <>
                <BellOff size={13} className="text-sky-400 group-hover:rotate-12 transition-transform" />
                <span>SILENCE SIREN</span>
              </>
            )}
          </button>

          {/* Real Live Clock */}
          <div className="hidden xl:flex items-center pl-1 font-mono text-[11px] text-white">
            <span>{timeStr}</span>
            <span className="ml-1 text-slate-500 text-[9.5px]">IST</span>
          </div>
        </div>
      </div>
    </header>
  );
}
