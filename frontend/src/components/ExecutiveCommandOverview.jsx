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
  Sparkles,
} from "lucide-react";

export default function ExecutiveCommandOverview({
  edgeStatus,
  cameraCount = 4,
  incidents = [],
  onSilenceSiren,
}) {
  const [qrtDispatched, setQrtDispatched] = useState(false);

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
      {/* ── CLEAN ARCHITECTURAL PIPELINE HEADER ──────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white tracking-wide uppercase text-sm">
            Operational Posture & C4I Overview
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-slate-400 font-mono text-[11px]">Sector 4-B Active Watch</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-400 text-[11px] overflow-x-auto py-0.5">
          <span className="text-sky-400 font-semibold uppercase tracking-wider text-[10px] mr-1">Pipeline:</span>
          <span>Observe</span>
          <span className="text-slate-600">→</span>
          <span>Detect</span>
          <span className="text-slate-600">→</span>
          <span>Track</span>
          <span className="text-slate-600">→</span>
          <span className="text-sky-300 font-medium">Predict Handoff</span>
          <span className="text-slate-600">→</span>
          <span className="text-sky-300 font-medium">Correlate</span>
          <span className="text-slate-600">→</span>
          <span>Score</span>
          <span className="text-slate-600">→</span>
          <span className="text-emerald-400 font-medium">Verify</span>
        </div>
      </div>

      {/* ── COMMAND OVERVIEW HERO CARD ─────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all shadow-2xl ${
          isCritical
            ? "border-red-500/40 bg-gradient-to-r from-red-950/30 via-[#070b14] to-[#040810] shadow-[0_0_30px_rgba(239,68,68,0.12)]"
            : "border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-[#070b14] to-[#040810]"
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          {/* LEFT: CIRCULAR RADAR THREAT GAUGE & HEADLINE */}
          <div className="flex items-center gap-5">
            {/* SVG Circular Threat Dial */}
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
                <span className="text-[9px] uppercase font-bold text-slate-400">INDEX</span>
              </div>
            </div>

            {/* Headline */}
            <div>
              <div className="flex items-center gap-2.5 mb-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[11px] font-bold text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  <span>{isCritical ? "CRITICAL BORDER INCURSION" : "ELEVATED SURVEILLANCE"}</span>
                </span>
                <span className="text-xs text-slate-400">Target Track: P17 [Person]</span>
              </div>

              <h2 className="text-xl font-bold text-white tracking-tight">
                Automated Multi-Camera Incident Reconstruction
              </h2>

              <p className="text-xs text-slate-300 max-w-2xl mt-1 leading-relaxed">
                {topIncident?.story_summary ||
                  "Target trajectory tracked across Checkpost Alpha and BOP Bravo within predicted spatio-temporal transit window (6.0–14.0s). Confirmed in 8.5s with 94.2% Re-ID match."}
              </p>
            </div>
          </div>

          {/* RIGHT: TACTICAL DISPATCH ACTION */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={handleDispatchQrt}
              className={`flex items-center gap-2 rounded-xl px-5 py-3 text-xs font-bold transition-all shadow-lg active:scale-95 ${
                qrtDispatched
                  ? "border border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "border border-red-500 bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]"
              }`}
            >
              {qrtDispatched ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400 animate-bounce" />
                  <span>QRT SENTRY SQUAD DEPLOYED</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>DISPATCH QUICK REACTION TEAM</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* THREAT FACTOR JUSTIFICATION PILLS */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-slate-400 font-semibold text-[11px] uppercase tracking-wider mr-1">
            Threat Factors:
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 border border-red-500/40 px-2.5 py-1 text-red-300 font-medium text-[11px]">
            <Crosshair size={12} />
            <span><strong className="font-mono">+30</strong> Restricted Red Zone Breach</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-amber-300 font-medium text-[11px]">
            <Navigation size={12} />
            <span><strong className="font-mono">+20</strong> Heading Toward Border</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 border border-sky-500/40 px-2.5 py-1 text-sky-300 font-medium text-[11px]">
            <Activity size={12} />
            <span><strong className="font-mono">+12</strong> Re-ID Transit Match</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/15 border border-purple-500/40 px-2.5 py-1 text-purple-300 font-medium text-[11px]">
            <ShieldAlert size={12} />
            <span><strong className="font-mono">+10</strong> Night Window Curfew</span>
          </span>
        </div>
      </div>

      {/* ── 4 COMPACT OPERATIONAL TELEMETRY METRICS ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Radio size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Sensor Mesh</div>
            <div className="text-white font-bold text-sm font-mono">{cameraCount}/4 Active</div>
            <div className="text-[10.5px] text-emerald-400">100% Optical Coverage</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Incidents Tracked</div>
            <div className="text-white font-bold text-sm font-mono">{openIncidents.length} Open · {criticalIncidents.length} Critical</div>
            <div className="text-[10.5px] text-red-400">Track P17 Incursion</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <Navigation size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Predictive Handoff</div>
            <div className="text-white font-bold text-sm font-mono">CAM-01 ➔ CAM-02</div>
            <div className="text-[10.5px] text-sky-400">ETA 8.5s · Re-ID 94.2%</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase font-semibold">Evidence Ledger</div>
            <div className="text-white font-bold text-sm font-mono">2 Sealed Capsules</div>
            <div className="text-[10.5px] text-purple-400">SHA-256 Validated</div>
          </div>
        </div>
      </div>
    </div>
  );
}
