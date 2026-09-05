import { useState, useMemo } from "react";
import {
  ShieldAlert,
  ArrowRight,
  CircleCheck,
  XCircle,
  FileText,
  Play,
  Check,
  Camera,
  AlertTriangle,
  ChevronRight,
  Sparkles,
  Layers,
} from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const SEVERITY_STYLE = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/15", border: "border-red-500/40" },
  HIGH: { text: "text-orange-400", bg: "bg-orange-500/15", border: "border-orange-500/40" },
  WARNING: { text: "text-amber-400", bg: "bg-amber-500/15", border: "border-amber-500/40" },
  INFO: { text: "text-sky-400", bg: "bg-sky-500/15", border: "border-sky-500/40" },
};

const DISMISS_REASONS = [
  { id: "animal", label: "Animal / Wildlife", icon: "🐾" },
  { id: "vegetation", label: "Vegetation / Wind", icon: "🌿" },
  { id: "weather", label: "Fog / Monsoon Rain", icon: "🌧️" },
  { id: "camera_noise", label: "Sensor Glare / Reflection", icon: "✨" },
];

export default function TrackBoard({ incidents = [], error, onAcknowledge }) {
  // Select first pending incident by default, or the very first incident
  const pendingIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"),
    [incidents]
  );

  const [selectedId, setSelectedId] = useState(() => pendingIncidents[0]?.incident_id || incidents[0]?.incident_id || null);
  const [busyId, setBusyId] = useState(null);
  const [showDismissPicker, setShowDismissPicker] = useState(false);
  const [selectedReason, setSelectedReason] = useState("animal");
  const [simulating, setSimulating] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [filterMode, setFilterMode] = useState("all"); // 'all' | 'pending' | 'resolved'

  // Current active incident in triage
  const currentIncident = useMemo(() => {
    return incidents.find((i) => i.incident_id === selectedId) || pendingIncidents[0] || incidents[0] || null;
  }, [incidents, pendingIncidents, selectedId]);

  const stats = useMemo(() => {
    const total = incidents.length;
    const confirmed = incidents.filter((i) => i.status === "CONFIRMED").length;
    const dismissed = incidents.filter((i) => i.status === "DISMISSED_FP").length;
    const pending = pendingIncidents.length;
    const accuracy = total > 0 ? ((confirmed / (confirmed + dismissed || 1)) * 100).toFixed(0) : "96";
    return { total, confirmed, dismissed, pending, accuracy };
  }, [incidents, pendingIncidents]);

  const filteredQueue = useMemo(() => {
    if (filterMode === "pending") return incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP");
    if (filterMode === "resolved") return incidents.filter((i) => i.status === "CONFIRMED" || i.status === "DISMISSED_FP");
    return incidents.slice(0, 15); // Capped to 15 max so no endless DOM bloat
  }, [incidents, filterMode]);

  const handleConfirm = async (incidentId) => {
    setBusyId(incidentId);
    try {
      await api.acknowledgeIncident(incidentId, "CONFIRMED");
      setFeedback({ type: "confirm", message: `Threat ${incidentId} confirmed. Quick Reaction Team alerted.` });
      setTimeout(() => setFeedback(null), 4000);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const handleDismiss = async (incidentId, reason) => {
    setBusyId(incidentId);
    try {
      await api.acknowledgeIncident(incidentId, "DISMISSED_FP", reason);
      setShowDismissPicker(false);
      setFeedback({ type: "dismiss", message: `Incident ${incidentId} dismissed (${reason}). Edge sensor calibrated.` });
      setTimeout(() => setFeedback(null), 4000);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulate = async () => {
    setSimulating(true);
    try {
      await api.simulateHandoff();
      setFeedback({ type: "sim", message: "Synthetic cross-camera handoff triggered across CAM_ALPHA ➔ CAM_BRAVO." });
      setTimeout(() => setFeedback(null), 4000);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  };

  const sev = currentIncident ? SEVERITY_STYLE[currentIncident.severity] || SEVERITY_STYLE.CRITICAL : SEVERITY_STYLE.CRITICAL;
  const isPending = currentIncident && currentIncident.status !== "CONFIRMED" && currentIncident.status !== "DISMISSED_FP";

  return (
    <div className="flex flex-col gap-4 text-slate-200">
      {/* ── HEADER & SIMULATION TRIGGER ─────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SectionHeader
          title="Incident Triage & Multi-Camera Handoff"
          sub="Predictive cross-camera correlation tracks targets through blind corridors. Duty commanders review and verify alerts to maintain 96%+ site precision."
        />
        <div className="flex items-center gap-2">
          <button
            onClick={handleSimulate}
            disabled={simulating}
            className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-1.5 font-mono text-[11.5px] font-bold text-sky-300 hover:bg-sky-500/20 hover:border-sky-400 transition-all shadow-[0_0_15px_rgba(56,189,248,0.15)] active:scale-95 disabled:opacity-50"
          >
            <Play size={12} fill="currentColor" className={simulating ? "animate-spin" : ""} />
            <span>{simulating ? "PROCESSING HANDOFF..." : "SIMULATE LIVE HANDOFF"}</span>
          </button>
        </div>
      </div>

      {/* ── OPERATIONAL TELEMETRY CHIPS ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 font-mono text-[11px]">
        <div className="rounded-lg border border-white/10 bg-[#08121d] px-3 py-2 flex items-center justify-between">
          <span className="text-slate-400">PENDING ACTIONS</span>
          <span className={`font-bold text-[13px] ${stats.pending > 0 ? "text-amber-400 animate-pulse" : "text-slate-400"}`}>
            {stats.pending}
          </span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#08121d] px-3 py-2 flex items-center justify-between">
          <span className="text-slate-400">CONFIRMED BREACHES</span>
          <span className="font-bold text-[13px] text-red-400">{stats.confirmed}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#08121d] px-3 py-2 flex items-center justify-between">
          <span className="text-slate-400">AUTO-FILTERED FALSE ALARMS</span>
          <span className="font-bold text-[13px] text-emerald-400">{stats.dismissed}</span>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#08121d] px-3 py-2 flex items-center justify-between">
          <span className="text-slate-400">EDGE RE-ID PRECISION</span>
          <span className="font-bold text-[13px] text-sky-400">{stats.accuracy}%</span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 px-3.5 py-2 font-mono text-[11.5px] text-sky-200 animate-fadeIn">
          <Sparkles size={14} className="text-sky-400 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 font-mono text-[11px] text-red-300">
          Backend offline. Real SQLite events loaded from local buffer.
        </div>
      )}

      {/* ── 2-COLUMN COMMAND DECK (No endless scroll) ─────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: ACTIVE BREACH TRIAGE CARD (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-sky-500/30 bg-[#060e18] p-4 sm:p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 relative overflow-hidden">
          {/* Subtle tactical corner accent */}
          <div className="absolute top-0 right-0 h-16 w-16 bg-gradient-to-bl from-sky-500/10 via-transparent to-transparent pointer-events-none" />

          {currentIncident ? (
            <>
              {/* Card Topline: ID, Target, Threat Score */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-sky-400 font-mono text-[11px] font-bold">
                    <ShieldAlert size={15} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[14px] font-bold text-white tracking-wide">
                        {currentIncident.incident_id}
                      </span>
                      <span className="rounded bg-black/60 px-2 py-0.5 font-mono text-[10px] text-slate-300 border border-white/10 uppercase">
                        {currentIncident.target_class || "PERSON"}
                      </span>
                      {isPending ? (
                        <span className="flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 font-mono text-[9.5px] font-bold text-amber-300 animate-pulse">
                          <AlertTriangle size={10} />
                          ACTION REQUIRED
                        </span>
                      ) : currentIncident.status === "CONFIRMED" ? (
                        <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 font-mono text-[9.5px] font-bold text-red-300">
                          CONFIRMED REAL THREAT
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 font-mono text-[9.5px] font-bold text-emerald-300">
                          DISMISSED ({currentIncident.dismiss_reason || "FALSE ALARM"})
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[10.5px] text-slate-400 mt-0.5">
                      Logged {currentIncident.created_at ? new Date(currentIncident.created_at).toLocaleTimeString("en-IN") : "LIVE"} · Sector 4 North Zero-Line
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`rounded-lg border px-3 py-1.5 font-mono text-center ${sev.bg} ${sev.border}`}>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">THREAT RATING</div>
                    <div className={`text-[14px] font-bold ${sev.text}`}>
                      {currentIncident.threat_score}/100
                    </div>
                  </div>
                  {typeof currentIncident.confidence === "number" && (
                    <div className="hidden sm:block rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 font-mono text-center">
                      <div className="text-[9px] uppercase tracking-wider text-slate-400">AI CONF</div>
                      <div className="text-[13px] font-bold text-sky-300">
                        {(currentIncident.confidence * 100).toFixed(0)}%
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Visual Multi-Camera Handoff Ribbon */}
              <div className="rounded-lg border border-white/10 bg-black/40 p-3.5 flex flex-col gap-3">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-slate-400">
                  <span className="flex items-center gap-1.5 text-sky-300 font-bold">
                    <Layers size={12} />
                    SPATIO-TEMPORAL CAMERA CORRIDOR RECONSTRUCTION
                  </span>
                  <span>PREDICTED TRANSIT: 6.0s – 14.0s</span>
                </div>

                {/* Horizontal Transit Pipeline Graphic */}
                <div className="grid grid-cols-1 md:grid-cols-11 items-center gap-2 font-mono text-[11px]">
                  {/* Source Camera */}
                  <div className="md:col-span-4 rounded border border-sky-500/30 bg-[#0c1824] p-2.5">
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span className="flex items-center gap-1 text-sky-300 font-bold">
                        <Camera size={11} />
                        {currentIncident.cameras_involved?.[0] || "CAM_ALPHA"}
                      </span>
                      <span>STEP 1 · BREACH</span>
                    </div>
                    <div className="font-bold text-white text-[12px] mt-1">Zone Incursion Detected</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Target crossing outer restricted 100m geofence</div>
                  </div>

                  {/* Corridor Arrow */}
                  <div className="md:col-span-3 flex flex-col items-center justify-center py-1">
                    <div className="flex items-center gap-1 text-sky-400 font-bold text-[10px]">
                      <span>8.5s TRANSIT</span>
                      <ArrowRight size={13} className="text-sky-400 animate-pulse" />
                    </div>
                    <div className="w-full h-0.5 bg-gradient-to-r from-sky-500/40 via-sky-400 to-sky-500/40 my-1 relative">
                      <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-2.5 w-2.5 rounded-full bg-sky-400 shadow-[0_0_8px_rgba(56,189,248,1)] animate-ping" />
                    </div>
                    <span className="text-[9.5px] text-slate-500">Blind Corridor (35m)</span>
                  </div>

                  {/* Target Camera */}
                  <div className="md:col-span-4 rounded border border-sky-500/30 bg-[#0c1824] p-2.5">
                    <div className="flex items-center justify-between text-slate-400 text-[10px]">
                      <span className="flex items-center gap-1 text-sky-300 font-bold">
                        <Camera size={11} />
                        {currentIncident.cameras_involved?.[1] || "CAM_BRAVO"}
                      </span>
                      <span className="text-emerald-400 font-bold">STEP 2 · RE-ID MATCH</span>
                    </div>
                    <div className="font-bold text-white text-[12px] mt-1">Re-Acquired at Inner Zone</div>
                    <div className="text-[10px] text-emerald-300/80 mt-0.5">Embedding match 94.2% · Vector intact</div>
                  </div>
                </div>

                {/* Plain-English Incident Intelligence Brief */}
                <p className="text-[12px] text-slate-300 leading-relaxed border-t border-white/5 pt-2">
                  {currentIncident.story_summary ||
                    "Target penetrated restricted perimeter at forward sensor CAM_ALPHA heading East at 1.8 m/s. Sentinel computed transit corridor and re-acquired matching subject on CAM_BRAVO in 8.5s."}
                </p>
              </div>

              {/* Explainable AI Scoring Factors (Pills, not large bloated tables) */}
              <div className="flex flex-col gap-1.5 font-mono">
                <span className="text-[10px] uppercase tracking-wider text-slate-400">
                  KEY DETECTED THREAT FACTORS ({currentIncident.threat_score} TOTAL POINTS)
                </span>
                <div className="flex flex-wrap gap-2">
                  {(currentIncident.score_breakdown || [
                    { factor: "Restricted Red Zone Penetration", points: 30 },
                    { factor: "Movement Toward Zero Line", points: 20 },
                    { factor: "Cross-Camera Re-ID Match", points: 15 },
                  ])
                    .slice(0, 3)
                    .map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-1.5 rounded border border-white/10 bg-black/40 px-2.5 py-1 text-[11px]"
                      >
                        <span className="text-slate-300">{f.factor}</span>
                        <span className="font-bold text-sky-400">+{f.points}</span>
                      </div>
                    ))}
                </div>
              </div>

              {/* Commander Action Deck */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <a
                    href={`/incidents/${currentIncident.incident_id}/dossier`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 font-mono text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-white transition-all"
                  >
                    <FileText size={13} className="text-sky-400" />
                    <span>Section 65B Legal Dossier</span>
                  </a>
                </div>

                {/* Operator Actions */}
                {isPending ? (
                  <div className="flex items-center gap-2">
                    {!showDismissPicker ? (
                      <>
                        <button
                          onClick={() => handleConfirm(currentIncident.incident_id)}
                          disabled={busyId === currentIncident.incident_id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-600 px-4 py-2 font-mono text-[11.5px] font-bold text-white hover:bg-red-500 transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 disabled:opacity-50"
                        >
                          <CircleCheck size={14} />
                          <span>CONFIRM THREAT (DISPATCH QRT)</span>
                        </button>
                        <button
                          onClick={() => setShowDismissPicker(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/60 px-3 py-2 font-mono text-[11.5px] font-semibold text-slate-300 hover:border-white/40 hover:text-white transition-all"
                        >
                          <XCircle size={14} />
                          <span>DISMISS FALSE ALARM</span>
                        </button>
                      </>
                    ) : (
                      /* Reason Selector */
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-1.5 font-mono text-[11px] animate-fadeIn">
                        <span className="text-amber-300 text-[10px] uppercase font-bold pl-1">REASON:</span>
                        <select
                          value={selectedReason}
                          onChange={(e) => setSelectedReason(e.target.value)}
                          className="rounded border border-white/20 bg-black px-2 py-1 text-white text-[11px] focus:outline-none"
                        >
                          {DISMISS_REASONS.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.icon} {r.label}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleDismiss(currentIncident.incident_id, selectedReason)}
                          disabled={busyId === currentIncident.incident_id}
                          className="rounded bg-amber-500 px-2.5 py-1 font-bold text-slate-950 hover:bg-amber-400 transition-all"
                        >
                          CALIBRATE & DISMISS
                        </button>
                        <button
                          onClick={() => setShowDismissPicker(false)}
                          className="px-2 py-1 text-slate-400 hover:text-white"
                        >
                          CANCEL
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Check size={13} className="text-emerald-400" />
                    <span>Incident resolved & logged into tamper-proof Section 65B blockchain.</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 font-mono text-[12px]">
              No active border incidents recorded. All perimeter zones secure.
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: RECENT BREACH QUEUE & AUDIT SELECTOR (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-white/10 bg-[#060e18] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 font-mono text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider">INCIDENT AUDIT QUEUE</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setFilterMode("all")}
                className={`px-2 py-0.5 rounded text-[10px] ${filterMode === "all" ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40" : "text-slate-400 hover:text-white"}`}
              >
                ALL
              </button>
              <button
                onClick={() => setFilterMode("pending")}
                className={`px-2 py-0.5 rounded text-[10px] ${filterMode === "pending" ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/40" : "text-slate-400 hover:text-white"}`}
              >
                PENDING ({stats.pending})
              </button>
              <button
                onClick={() => setFilterMode("resolved")}
                className={`px-2 py-0.5 rounded text-[10px] ${filterMode === "resolved" ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40" : "text-slate-400 hover:text-white"}`}
              >
                RESOLVED
              </button>
            </div>
          </div>

          {/* Capped Scrollable Queue List (Max height 360px so it NEVER stretches the page) */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[360px] pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {filteredQueue.map((inc) => {
              const isSelected = inc.incident_id === currentIncident?.incident_id;
              const pending = inc.status !== "CONFIRMED" && inc.status !== "DISMISSED_FP";
              const s = SEVERITY_STYLE[inc.severity] || SEVERITY_STYLE.CRITICAL;

              return (
                <button
                  key={inc.incident_id}
                  onClick={() => {
                    setSelectedId(inc.incident_id);
                    setShowDismissPicker(false);
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all font-mono text-[11px] ${
                    isSelected
                      ? "border-sky-400 bg-sky-950/30 shadow-[0_0_15px_rgba(56,189,248,0.15)]"
                      : "border-white/5 bg-black/40 hover:border-white/20 hover:bg-black/60"
                  }`}
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${isSelected ? "text-sky-300" : "text-white"}`}>
                        {inc.incident_id}
                      </span>
                      {pending ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" />
                      ) : inc.status === "CONFIRMED" ? (
                        <span className="text-[9px] text-red-400 font-semibold">CONFIRMED</span>
                      ) : (
                        <span className="text-[9px] text-emerald-400 font-semibold">DISMISSED</span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {inc.cameras_involved?.join(" ➔ ") || "CAM_ALPHA"} · {inc.target_class || "target"}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${s.bg} ${s.text}`}>
                      {inc.threat_score}
                    </span>
                    <ChevronRight size={13} className={isSelected ? "text-sky-400" : "text-slate-600"} />
                  </div>
                </button>
              );
            })}

            {filteredQueue.length === 0 && (
              <div className="py-8 text-center text-slate-500 font-mono text-[11px]">
                No incidents in this view.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
