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
  { id: "overview", label: "Overview" },
  { id: "surveillance", label: "Surveillance Lab" },
  { id: "incidents", label: "Reconstruction & Handoff" },
  { id: "map", label: "Border Map" },
  { id: "custody", label: "Evidence Vault" },
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
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5 gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
            <Shield size={18} className="text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-bold tracking-tight text-white">IBVAP SENTINEL</span>
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-sky-300 border border-sky-500/30">
                CONSOLE
              </span>
            </div>
            <div className="text-[11px] text-slate-400 tracking-normal font-medium">
              Sector 4-B · Gurdaspur Watchfloor
            </div>
          </div>
        </div>

        {/* Section Quick Jump Anchors */}
        <nav className="hidden lg:flex items-center gap-1 text-xs">
          {SECTION_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => scrollToSection(link.id)}
              className="rounded-lg px-3 py-1.5 font-medium text-slate-300 transition-colors hover:bg-white/10 hover:text-sky-300 active:text-sky-200"
            >
              {link.label}
            </button>
          ))}
        </nav>

        {/* Controls & Telemetry */}
        <div className="flex items-center gap-3 text-xs">
          {/* Link Status */}
          <div
            className={`hidden sm:flex items-center gap-1.5 rounded-lg border px-2.5 py-1 ${
              online
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border-red-500/40 bg-red-500/15 text-red-300"
            }`}
          >
            {online ? <Wifi size={13} /> : <WifiOff size={13} />}
            <span className="font-semibold text-[11px]">{online ? "Nominal" : "Offline"}</span>
          </div>

          {/* Honest Simulation Badge */}
          <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-medium text-[11px]">◇ Simulation</span>
          </div>

          {/* Counts */}
          <div className="hidden xl:flex items-center gap-1.5 text-slate-400 text-[11.5px]">
            <span className="text-white font-semibold font-mono">{cameraCount}</span>
            <span>Sensors</span>
            <span className="text-slate-600">/</span>
            <span className={`font-semibold font-mono ${activeTrackCount > 0 ? "text-amber-400" : "text-white"}`}>
              {activeTrackCount}
            </span>
            <span>Tracks</span>
          </div>

          {/* Demo Scenario Seeder & Reset Buttons */}
          <div className="hidden sm:flex items-center gap-1.5">
            {onPopulateDemo && (
              <button
                onClick={onPopulateDemo}
                disabled={populatingDemo}
                title="Seed 5 real distinct test scenarios via backend simulate-case"
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-white/25 hover:text-white transition-all disabled:opacity-50"
              >
                <PlaySquare size={12} className="text-sky-400" />
                <span>{populatingDemo ? "Seeding..." : "Seed Demo"}</span>
              </button>
            )}

            {onResetDemo && (
              <button
                onClick={onResetDemo}
                title="Reset simulation state to baseline"
                className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white hover:border-white/25 transition-all"
              >
                <RotateCcw size={11} />
                <span>Reset</span>
              </button>
            )}
          </div>

          {/* PROMINENT SIREN / ALARM CONTROL */}
          <button
            onClick={handleSilenceClick}
            disabled={silencing}
            title="Silence system hardware siren and clear active acoustic alarm"
            className={`group relative flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[11.5px] font-bold transition-all shadow-lg active:scale-95 shrink-0 ${
              silencedFeedback
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : sirenActive
                ? "border-red-500 bg-red-500/25 text-red-200 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse"
                : "border-sky-500/40 bg-sky-500/10 text-sky-300 hover:border-sky-400 hover:bg-sky-500/20 shadow-[0_0_10px_rgba(56,189,248,0.15)]"
            }`}
          >
            {silencedFeedback ? (
              <>
                <CheckCircle2 size={14} className="text-emerald-400" />
                <span>Siren Silenced</span>
              </>
            ) : sirenActive ? (
              <>
                <Bell size={14} className="text-red-400 animate-bounce" />
                <span>Alarm Active · Silence</span>
              </>
            ) : (
              <>
                <BellOff size={14} className="text-sky-400 group-hover:rotate-12 transition-transform" />
                <span>Silence Siren</span>
              </>
            )}
          </button>

          {/* Real Live Clock */}
          <div className="hidden lg:flex items-center pl-1 font-mono text-[11px] text-slate-300">
            <span>{timeStr}</span>
            <span className="ml-1 text-slate-500 text-[10px]">IST</span>
          </div>
        </div>
      </div>
    </header>
  );
}
