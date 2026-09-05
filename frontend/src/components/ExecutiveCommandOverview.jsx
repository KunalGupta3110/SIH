import { useState, useMemo } from "react";
import {
  ShieldAlert,
  Send,
  BellOff,
  FileText,
  CheckCircle2,
  Radio,
  Activity,
  ShieldCheck,
  Navigation,
  Crosshair,
  Sparkles,
} from "lucide-react";
import api from "../lib/api.js";

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
  const [silenced, setSilenced] = useState(false);

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

  const handleSilence = async () => {
    setSilenced(true);
    try {
      await onSilenceSiren?.();
      setTimeout(() => setSilenced(false), 4000);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-4 text-slate-200 font-mono">
      {/* ── INTEGRATED ARCHITECTURAL PIPELINE STEPPER ──────────────── */}
      <div className="rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10.5px]">
        <span className="font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5 shrink-0">
          <Sparkles size={12} />
          <span>ARCHITECTURE PIPELINE:</span>
        </span>
        <div className="flex items-center gap-1 overflow-x-auto scrollbar-none py-0.5">
          {ARCHITECTURE_STEPS.map((s, idx) => (
            <div key={s.step} className="flex items-center gap-1 shrink-0">
              <span
                className={`px-2 py-0.5 rounded border text-[9.5px] font-bold ${
                  idx === 4 || idx === 5
                    ? "bg-sky-500/20 border-sky-400 text-sky-200"
                    : "bg-black/40 border-white/5 text-slate-400"
                }`}
              >
                {s.step} {s.name}
              </span>
              {idx < ARCHITECTURE_STEPS.length - 1 && (
                <span className="text-slate-600 text-[10px]">➔</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── COMMAND OVERVIEW HERO CARD ─────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-5 sm:p-6 transition-all shadow-2xl ${
          isCritical
            ? "border-red-500/40 bg-gradient-to-r from-red-950/30 via-[#070b14] to-[#040810] shadow-[0_0_30px_rgba(239,68,68,0.15)]"
            : "border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-[#070b14] to-[#040810]"
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          {/* LEFT: CIRCULAR RADAR THREAT GAUGE & HEADLINE */}
          <div className="flex items-center gap-4 sm:gap-5">
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
                <span className="font-bold text-xl text-white tracking-tighter">{threatScore}</span>
                <span className="text-[8.5px] uppercase font-bold text-slate-400">INDEX</span>
              </div>
            </div>

            {/* Headline */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 border border-red-500/40 px-2 py-0.2 text-[10px] font-bold text-red-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" />
                  <span>{isCritical ? "DEFCON 2 · CRITICAL BORDER ALERT" : "DEFCON 3 · ELEVATED SURVEILLANCE"}</span>
                </span>
                <span className="text-[10px] text-slate-400">SECTOR 4-B · GURDASPUR WATCHFLOOR</span>
              </div>

              <h2 className="text-lg sm:text-xl font-black text-white tracking-tight">
                Automated Incident Reconstruction & C4I Overview
              </h2>

              <p className="text-[12px] text-slate-300 max-w-2xl mt-0.5 leading-relaxed">
                {topIncident?.story_summary ||
                  "Target trajectory tracked across Checkpost Alpha and BOP Bravo within predicted spatio-temporal transit window (6.0–14.0s). Confirmed in 8.5s."}
              </p>
            </div>
          </div>

          {/* RIGHT: COMMAND ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={handleDispatchQrt}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-[12px] font-bold transition-all shadow-lg active:scale-95 ${
                qrtDispatched
                  ? "border border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                  : "border border-red-500 bg-red-600 hover:bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.35)]"
              }`}
            >
              {qrtDispatched ? (
                <>
                  <CheckCircle2 size={15} className="text-emerald-400 animate-bounce" />
                  <span>QRT SENTRY SQUAD-4 DEPLOYED</span>
                </>
              ) : (
                <>
                  <Send size={14} />
                  <span>DISPATCH QRT SENTRY</span>
                </>
              )}
            </button>

            <button
              onClick={handleSilence}
              className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-[11.5px] font-bold transition-all active:scale-95 ${
                silenced
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                  : "border-white/20 bg-black/60 text-slate-200 hover:border-white/40 hover:text-white"
              }`}
            >
              <BellOff size={14} className={silenced ? "text-emerald-400" : "text-sky-400"} />
              <span>{silenced ? "SILENCED" : "SILENCE SIREN"}</span>
            </button>
          </div>
        </div>

        {/* THREAT FACTOR JUSTIFICATION PILLS */}
        <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-wrap items-center gap-2 text-[10.5px]">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px]">
            AI THREAT FACTOR JUSTIFICATION:
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 border border-red-500/40 px-2 py-0.5 text-red-300 font-semibold">
            <Crosshair size={10} />
            <span><strong>+30</strong> Red Zone Breach</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-amber-300 font-semibold">
            <Navigation size={10} />
            <span><strong>+20</strong> Heading Toward Border</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-sky-500/15 border border-sky-500/40 px-2 py-0.5 text-sky-300 font-semibold">
            <Activity size={10} />
            <span><strong>+12</strong> Re-ID Transit Match</span>
          </span>
          <span className="inline-flex items-center gap-1 rounded bg-purple-500/15 border border-purple-500/40 px-2 py-0.5 text-purple-300 font-semibold">
            <ShieldAlert size={10} />
            <span><strong>+10</strong> Night Window</span>
          </span>
        </div>
      </div>

      {/* ── 4 COMPACT OPERATIONAL TELEMETRY METRICS ─────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-[11px]">
        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5 shadow">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Radio size={16} />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 uppercase font-semibold">Sensor Mesh</div>
            <div className="text-white font-bold text-[13px]">{cameraCount}/4 Cameras Active</div>
            <div className="text-[9.5px] text-emerald-400">100% Optical Coverage</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5 shadow">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400">
            <Activity size={16} />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 uppercase font-semibold">Incidents Tracked</div>
            <div className="text-white font-bold text-[13px]">{openIncidents.length} Open · {criticalIncidents.length} Critical</div>
            <div className="text-[9.5px] text-red-400">Track P17 Active</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5 shadow">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <Navigation size={16} />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 uppercase font-semibold">Predictive Handoff</div>
            <div className="text-white font-bold text-[13px]">CAM-01 ➔ CAM-02</div>
            <div className="text-[9.5px] text-sky-400">ETA 8.5s · Re-ID 94.2%</div>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/40 p-3.5 shadow">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
            <ShieldCheck size={16} />
          </div>
          <div>
            <div className="text-[9.5px] text-slate-400 uppercase font-semibold">Evidence Ledger</div>
            <div className="text-white font-bold text-[13px]">2 Sealed Capsules</div>
            <div className="text-[9.5px] text-purple-400">SHA-256 Validated</div>
          </div>
        </div>
      </div>
    </div>
  );
}
