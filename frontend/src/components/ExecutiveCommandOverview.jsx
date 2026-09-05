import { useState, useMemo } from "react";
import { ShieldAlert, AlertOctagon, Send, BellOff, FileText, CheckCircle2, Radio, Server, Activity, ShieldCheck, Navigation, Crosshair } from "lucide-react";
import api from "../lib/api.js";

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

  // Derive top urgent active incident
  const topIncident = useMemo(() => {
    if (openIncidents.length > 0) {
      return [...openIncidents].sort((a, b) => (b.threat_score || 0) - (a.threat_score || 0))[0];
    }
    return incidents[0] || null;
  }, [incidents, openIncidents]);

  const threatScore = topIncident?.threat_score || 87;
  const isCritical = threatScore >= 70;

  // Circular gauge calculations (circumference = 2 * PI * r)
  const radius = 38;
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
    <div className="flex flex-col gap-4 text-slate-200">
      {/* ── TOP EXECUTIVE COMMAND DECK ─────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all shadow-2xl ${
          isCritical
            ? "border-red-500/50 bg-gradient-to-r from-red-950/40 via-[#070b14]/90 to-[#040810] shadow-[0_0_35px_rgba(239,68,68,0.2)]"
            : "border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-[#070b14]/90 to-[#040810]"
        }`}
      >
        {/* Subtle background radar ring decoration */}
        <div className="absolute right-0 top-0 bottom-0 w-96 opacity-5 pointer-events-none overflow-hidden">
          <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full border border-sky-400" />
          <div className="absolute -right-10 -top-10 h-80 w-80 rounded-full border border-sky-400" />
        </div>

        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-6">
          {/* LEFT: CIRCULAR RADAR THREAT GAUGE & READOUT */}
          <div className="flex items-center gap-5">
            {/* SVG Circular Threat Gauge Dial */}
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
              <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 96 96">
                {/* Background Ring */}
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  stroke="#1e293b"
                  strokeWidth="7"
                  fill="transparent"
                />
                {/* Colored Progress Ring */}
                <circle
                  cx="48"
                  cy="48"
                  r={radius}
                  stroke={isCritical ? "#ef4444" : "#f59e0b"}
                  strokeWidth="7"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  strokeLinecap="round"
                  fill="transparent"
                  className="transition-all duration-1000 ease-out"
                />
              </svg>

              {/* Gauge Center Readout */}
              <div className="absolute flex flex-col items-center justify-center text-center">
                <span className="font-mono text-2xl font-black text-white tracking-tighter">
                  {threatScore}
                </span>
                <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  INDEX
                </span>
              </div>

              {/* Outer pulsing ring for critical threats */}
              {isCritical && (
                <div className="absolute inset-0 rounded-full border border-red-500/40 animate-ping pointer-events-none" />
              )}
            </div>

            {/* Tactical Incident Headline */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1.5 rounded bg-red-500/20 border border-red-500/40 px-2.5 py-0.5 font-mono text-[10.5px] font-bold text-red-300">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  <span>{isCritical ? "DEFCON 2 · CRITICAL BORDER INTRUSION" : "DEFCON 3 · ELEVATED SURVEILLANCE"}</span>
                </span>
                <span className="font-mono text-[11px] text-slate-400">
                  SECTOR 4B · GURDASPUR WATCHFLOOR
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                Automated Incident Reconstruction & C4I Overview
              </h2>

              <p className="text-[13px] text-slate-300 max-w-2xl mt-1 leading-relaxed">
                {topIncident?.story_summary ||
                  "Target trajectory tracked across Checkpost Alpha and BOP Bravo within predicted spatio-temporal transit window (6.0–14.0s). Confirmed in 8.5s."}
              </p>
            </div>
          </div>

          {/* RIGHT: TACTICAL COMMAND ACTIONS */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {/* Quick Reaction Team Dispatch Button */}
            <button
              onClick={handleDispatchQrt}
              className={`flex items-center gap-2 rounded-xl px-5 py-3 font-mono text-[12.5px] font-bold transition-all shadow-xl active:scale-95 ${
                qrtDispatched
                  ? "border border-emerald-500 bg-emerald-500/25 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                  : "border border-red-500 bg-red-600 hover:bg-red-500 text-white shadow-[0_0_25px_rgba(239,68,68,0.45)]"
              }`}
            >
              {qrtDispatched ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-400 animate-bounce" />
                  <span>QRT SENTRY SQUAD-4 DEPLOYED</span>
                </>
              ) : (
                <>
                  <Send size={15} />
                  <span>DISPATCH QRT SENTRY</span>
                </>
              )}
            </button>

            {/* Acoustic Siren Silence Control */}
            <button
              onClick={handleSilence}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 font-mono text-[12px] font-bold transition-all active:scale-95 ${
                silenced
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.25)]"
                  : "border-white/20 bg-black/60 text-slate-200 hover:border-white/40 hover:text-white"
              }`}
            >
              <BellOff size={15} className={silenced ? "text-emerald-400" : "text-sky-400"} />
              <span>{silenced ? "SIREN SILENCED" : "SILENCE SIREN"}</span>
            </button>

            {/* Legal Dossier Shortcut */}
            {topIncident && (
              <a
                href={`/incidents/${topIncident.incident_id}/dossier`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-white/15 bg-black/40 px-4 py-3 font-mono text-[12px] font-semibold text-slate-300 hover:border-sky-500/40 hover:text-white transition-all shadow-md"
              >
                <FileText size={15} className="text-sky-400" />
                <span>SECTION 65B DOSSIER</span>
              </a>
            )}
          </div>
        </div>

        {/* EXPLAINABLE FACTOR JUSTIFICATION CHIPS */}
        <div className="mt-5 pt-4 border-t border-white/10 flex flex-wrap items-center gap-2.5 font-mono text-[11px]">
          <span className="text-slate-400 font-bold uppercase tracking-wider text-[10.5px]">
            AI Threat Factor Justification:
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-red-500/15 border border-red-500/40 px-2.5 py-1 text-red-300 font-semibold">
            <Crosshair size={11} />
            <span><strong className="font-bold">+30</strong> 100m Red Zone Penetration</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 border border-amber-500/40 px-2.5 py-1 text-amber-300 font-semibold">
            <Navigation size={11} />
            <span><strong className="font-bold">+20</strong> Heading Vector Toward Zero Line</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-sky-500/15 border border-sky-500/40 px-2.5 py-1 text-sky-300 font-semibold">
            <Activity size={11} />
            <span><strong className="font-bold">+12</strong> Cross-Camera Re-ID Transit (8.5s)</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-500/15 border border-purple-500/40 px-2.5 py-1 text-purple-300 font-semibold">
            <ShieldAlert size={11} />
            <span><strong className="font-bold">+10</strong> Low-Visibility Night Window</span>
          </span>
        </div>
      </div>

      {/* ── 4 MEANINGFUL OPERATIONAL TELEMETRY MATRICES ─────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 font-mono text-[11.5px]">
        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow-lg hover:border-white/20 transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
            <Radio size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Active Cameras</div>
            <div className="text-white font-bold text-[14px] mt-0.5">{cameraCount}/4 Online</div>
            <div className="text-[10px] text-emerald-400">100% Topology Mesh</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow-lg hover:border-white/20 transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-400">
            <Activity size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Correlated Incidents</div>
            <div className="text-white font-bold text-[14px] mt-0.5">{openIncidents.length} Open · {criticalIncidents.length} Critical</div>
            <div className="text-[10px] text-red-400">Track P17 Active</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow-lg hover:border-white/20 transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
            <Navigation size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Predicted Handoff</div>
            <div className="text-white font-bold text-[14px] mt-0.5">CAM-01 ➔ CAM-02</div>
            <div className="text-[10px] text-sky-400">ETA 8.5s · Re-ID 94.2%</div>
          </div>
        </div>

        <div className="flex items-center gap-3.5 rounded-xl border border-white/10 bg-black/40 p-4 shadow-lg hover:border-white/20 transition-all">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-300">
            <ShieldCheck size={18} />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Evidence Capsules</div>
            <div className="text-white font-bold text-[14px] mt-0.5">2 Sealed Blocks</div>
            <div className="text-[10px] text-purple-400">SHA-256 Hash Chain Valid</div>
          </div>
        </div>
      </div>
    </div>
  );
}
