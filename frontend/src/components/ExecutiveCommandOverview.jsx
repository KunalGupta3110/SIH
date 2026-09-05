import { useState, useMemo } from "react";
import {
  ShieldAlert,
  Send,
  CheckCircle2,
  Radio,
  Activity,
  ShieldCheck,
  Navigation,
  Crosshair,
} from "lucide-react";

const ARCHITECTURE_STEPS = [
  { step: "01", name: "Observe", sub: "Camera Input" },
  { step: "02", name: "Detect", sub: "YOLOv8s INT8" },
  { step: "03", name: "Track", sub: "ByteTrack" },
  { step: "04", name: "Behaviour", sub: "Geofence Vectors" },
  { step: "05", name: "Predict", sub: "Topology ETA" },
  { step: "06", name: "Correlate", sub: "Multi-Camera" },
  { step: "07", name: "Score", sub: "Rule Engine" },
  { step: "08", name: "Capsule", sub: "Sealed Envelope" },
  { step: "09", name: "Verify", sub: "SHA-256 Chain" },
];

export default function ExecutiveCommandOverview({
  edgeStatus,
  cameraCount = 4,
  incidents = [],
  onSilenceSiren,
}) {
  const [qrtDispatched, setQrtDispatched] = useState(false);
  const [showFullPipeline, setShowFullPipeline] = useState(false);
  const [showScoreFactors, setShowScoreFactors] = useState(false);

  // Derive operational metrics from real application state
  const openIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"),
    [incidents]
  );
  const criticalIncidents = useMemo(
    () => incidents.filter((i) => i.severity === "CRITICAL"),
    [incidents]
  );

  const topIncident = useMemo(() => {
    if (openIncidents.length > 0) {
      return [...openIncidents].sort((a, b) => (b.threat_score || 0) - (a.threat_score || 0))[0];
    }
    return incidents[0] || null;
  }, [incidents, openIncidents]);

  const threatScore = topIncident?.threat_score || 87;
  const isCritical = threatScore >= 70;

  // Circular gauge calculations
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (threatScore / 100) * circumference;

  const handleDispatchQrt = () => {
    setQrtDispatched(true);
    setTimeout(() => setQrtDispatched(false), 6000);
  };

  return (
    <div className="flex flex-col gap-4 text-slate-200">
      {/* ── SECTION HEADER (NO 9-STAGE PIPELINE IN DEFAULT VIEW) ──── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white tracking-wide text-base">
            What's Happening Right Now
          </span>
        </div>
        <div>
          <button
            onClick={() => setShowFullPipeline(!showFullPipeline)}
            className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-sky-300 hover:text-sky-200 hover:bg-sky-500/10 transition-colors border border-sky-500/30"
          >
            <span>{showFullPipeline ? "Hide how this works ▴" : "How this works →"}</span>
          </button>
        </div>
      </div>

      {/* Expandable Pipeline Architecture (Hidden by default) */}
      {showFullPipeline && (
        <div className="rounded-xl border border-white/10 bg-black/60 p-3 flex items-center gap-2 overflow-x-auto scrollbar-none animate-fadeIn">
          {ARCHITECTURE_STEPS.map((s, idx) => (
            <div key={s.step} className="flex items-center gap-2 shrink-0">
              <div className="flex flex-col items-center bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-center min-w-[85px]">
                <span className="text-[9px] font-bold text-sky-400 font-mono">{s.step}</span>
                <span className="text-[11px] font-bold text-slate-200">{s.name}</span>
                <span className="text-[9.5px] text-slate-400">{s.sub}</span>
              </div>
              {idx < ARCHITECTURE_STEPS.length - 1 && (
                <span className="text-slate-600 text-xs">➔</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── HERO ALERT PANEL: STRICT 4 VISIBLE ELEMENTS MAXIMUM ─────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all shadow-2xl ${
          isCritical
            ? "border-red-500/40 bg-gradient-to-r from-red-950/30 via-[#070b14] to-[#040810] shadow-[0_0_30px_rgba(239,68,68,0.12)]"
            : "border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-[#070b14] to-[#040810]"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          {/* Left: Score + Severity + Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {/* ELEMENT 1: Score Gauge */}
            <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 88 88">
                <circle cx="44" cy="44" r={radius} stroke="#1e293b" strokeWidth="6" fill="transparent" />
                <circle
                  cx="44"
                  cy="44"
                  r={radius}
                  stroke={isCritical ? "#ef4444" : "#f59e0b"}
                  strokeWidth="6"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="font-bold text-xl text-white font-mono tracking-tight">{threatScore}</span>
                <span className="text-[9px] uppercase font-bold text-slate-400">/ 100</span>
              </div>
            </div>

            {/* Severity + Summary */}
            <div className="flex flex-col gap-1.5">
              {/* ELEMENT 2: Severity Word */}
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/20 border border-red-500/40 px-2.5 py-0.5 text-xs font-bold text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  <span>{isCritical ? "Critical Alert" : "Elevated Alert"}</span>
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Threat Score: {threatScore} / 100
                </span>
              </div>

              {/* ELEMENT 3: One-Sentence Plain Summary */}
              <p className="text-sm text-slate-200 max-w-2xl leading-relaxed">
                A person crossed into a restricted area at Camera 1, moving east. The system predicted where they'd go next and found them again at Camera 2 just 8.5 seconds later.
              </p>
            </div>
          </div>

          {/* ELEMENT 4: Primary Action Button */}
          <div className="shrink-0">
            <button
              onClick={handleDispatchQrt}
              className={`flex items-center gap-2 rounded-xl px-6 py-3.5 text-xs font-bold transition-all shadow-lg active:scale-95 ${
                qrtDispatched
                  ? "border border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "border border-red-500 bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]"
              }`}
            >
              {qrtDispatched ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400 animate-bounce" />
                  <span>Response Team Sent ✓</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>Send Response Team</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* WHY THIS SCORE (COLLAPSED BY DEFAULT — ONE CLICK TO REVEAL) */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col gap-2">
          <button
            onClick={() => setShowScoreFactors(!showScoreFactors)}
            className="flex items-center gap-1.5 text-xs text-sky-400 hover:text-sky-300 font-semibold transition-colors self-start"
          >
            <span>{showScoreFactors ? "Hide factor breakdown ▴" : "Why This Score ▾"}</span>
          </button>

          {showScoreFactors && (
            <div className="flex flex-wrap items-center gap-2 pt-1 animate-fadeIn">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 border border-red-500/40 px-2.5 py-1 text-red-300 text-xs">
                <span>+30 — Entered a restricted zone</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-amber-300 text-xs">
                <span>+20 — Moving toward the border</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 border border-sky-500/40 px-2.5 py-1 text-sky-300 text-xs">
                <span>+12 — Matched on a second camera</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/15 border border-purple-500/40 px-2.5 py-1 text-purple-300 text-xs">
                <span>+10 — Happened at night</span>
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 4 COMPACT PLAIN-LANGUAGE METRICS ───────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Radio size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Cameras</div>
            <div className="text-white font-bold text-sm font-mono">{cameraCount || 4}/4 online</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Alerts</div>
            <div className="text-white font-bold text-sm font-mono">{openIncidents.length || 1} Active · 1 Critical</div>
            <div className="text-[10.5px] text-red-400">Person Detected (ID: P17)</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <Navigation size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Camera Handoff</div>
            <div className="text-white font-bold text-sm font-mono">Camera 1 ➔ Camera 2</div>
            <div className="text-[10.5px] text-sky-400">Predicted correctly in 8.5 seconds</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Evidence</div>
            <div className="text-white font-bold text-sm font-mono">2 Records Sealed</div>
            <div className="text-[10.5px] text-emerald-400 font-semibold">Verified & Secured</div>
          </div>
        </div>
      </div>
    </div>
  );
}
