import { useState, useEffect, useMemo } from "react";
import { Shield, Bell, BellOff, Wifi, PlaySquare, CheckCircle2, RotateCcw, Sliders } from "lucide-react";

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
  { id: "surveillance", label: "Example Alerts" },
  { id: "incidents", label: "What Happened" },
  { id: "map", label: "Map" },
  { id: "custody", label: "Evidence" },
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
  const [showDemoMenu, setShowDemoMenu] = useState(false);

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
        {/* 1. Brand / Logo */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 shadow-[0_0_12px_rgba(56,189,248,0.2)]">
            <Shield size={16} className="text-sky-400" />
          </div>
          <span className="text-[14px] font-bold tracking-tight text-white">IBVAP SENTINEL</span>
        </div>

        {/* 2. Section Navigation */}
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

        {/* Right Section: Status Pill, Alarm Control, Clock */}
        <div className="flex items-center gap-3 text-xs">
          {/* 3. Combined Status Pill with Collapsed Settings */}
          <div className="relative">
            <button
              onClick={() => setShowDemoMenu(!showDemoMenu)}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-slate-300 text-xs hover:border-white/25 transition-all"
              title="Click to view details and testing controls"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11.5px] font-medium font-mono text-emerald-400">
                4 cameras online ▾
              </span>
            </button>

            {showDemoMenu && (
              <div className="absolute right-0 mt-2 w-52 rounded-xl border border-white/15 bg-[#090f1a] p-2 shadow-2xl z-50 flex flex-col gap-1 text-xs animate-fadeIn">
                <div className="px-2 py-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider border-b border-white/10">
                  System Status
                </div>
                <div className="px-2 py-1 text-slate-300 text-[11px] flex justify-between">
                  <span className="text-slate-400">Cameras:</span>
                  <span className="text-emerald-400 font-mono font-semibold">{cameraCount || 4}/4 online</span>
                </div>
                <div className="px-2 py-1 text-slate-300 text-[11px] flex justify-between">
                  <span className="text-slate-400">Active Alerts:</span>
                  <span className="text-amber-300 font-mono font-semibold">{activeTrackCount}</span>
                </div>
                <div className="px-2 py-1 text-slate-300 text-[11px] flex justify-between border-b border-white/10 pb-1.5">
                  <span className="text-slate-400">Mode:</span>
                  <span className="text-sky-300 font-medium">Simulation</span>
                </div>

                <div className="px-2 pt-1 text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                  Testing Controls
                </div>
                {onPopulateDemo && (
                  <button
                    onClick={() => {
                      onPopulateDemo();
                      setShowDemoMenu(false);
                    }}
                    disabled={populatingDemo}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-slate-300 hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
                  >
                    <PlaySquare size={13} className="text-sky-400" />
                    <span>{populatingDemo ? "Loading..." : "Load Example Scenarios"}</span>
                  </button>
                )}
                {onResetDemo && (
                  <button
                    onClick={() => {
                      onResetDemo();
                      setShowDemoMenu(false);
                    }}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-slate-400 hover:bg-white/10 hover:text-white transition-all"
                  >
                    <RotateCcw size={13} />
                    <span>Reset to Default</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* 4. Alarm / Silence Control */}
          <button
            onClick={handleSilenceClick}
            disabled={silencing}
            title="Silence active alarm"
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

          {/* 5. Clock */}
          <div className="hidden lg:flex items-center pl-1 font-mono text-[11px] text-slate-300">
            <span>{timeStr} IST</span>
          </div>
        </div>
      </div>
    </header>
  );
}
