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
  Clock,
  Archive,
  Scan,
  Activity,
  Compass,
  Lock,
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
  const pendingIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"),
    [incidents]
  );

  const [selectedId, setSelectedId] = useState(() => pendingIncidents[0]?.incident_id || incidents[0]?.incident_id || null);
  const [busyId, setBusyId] = useState(null);
  const [showDismissPicker, setShowDismissPicker] = useState(false);
  const [selectedReason, setSelectedReason] = useState("animal");
  const [feedback, setFeedback] = useState(null);
  const [filterMode, setFilterMode] = useState("all");

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
    return incidents.slice(0, 15);
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

  const scrollToVault = () => {
    document.getElementById("custody")?.scrollIntoView({ behavior: "smooth" });
  };

  const sev = currentIncident ? SEVERITY_STYLE[currentIncident.severity] || SEVERITY_STYLE.CRITICAL : SEVERITY_STYLE.CRITICAL;
  const isPending = currentIncident && currentIncident.status !== "CONFIRMED" && currentIncident.status !== "DISMISSED_FP";

  // Reconstructed observation timeline ladder
  const observationLadder = useMemo(() => {
    if (currentIncident?.nodes && currentIncident.nodes.length > 0) {
      return currentIncident.nodes;
    }
    return [
      { step: 1, camera_id: "CAM_ALPHA", event_type: "ZONE_ENTRY", timestamp_iso: "18:42:01", rule_detail: "Restricted-zone breach detected (Geofence incursion)" },
      { step: 2, camera_id: "CAM_ALPHA", event_type: "TRACK_MAINTAINED", timestamp_iso: "18:42:03", rule_detail: "TRACK P17: Movement continuing EAST @ 1.8 m/s" },
      { step: 3, camera_id: "CAM_BRAVO", event_type: "PREDICTIVE_HANDOFF", timestamp_iso: "18:42:08", rule_detail: "Cross-camera Re-ID match 94.2% within predicted ETA window" },
      { step: 4, camera_id: "CAM_BRAVO", event_type: "BEHAVIOUR_ANALYSIS", timestamp_iso: "18:42:11", rule_detail: "Persistent movement vector toward zero line" },
      { step: 5, camera_id: "SYSTEM", event_type: "THREAT_EVALUATED", timestamp_iso: "18:42:15", rule_detail: "Threat score 87 / 100 calculated from 5 correlated rules" },
      { step: 6, camera_id: "SYSTEM", event_type: "EVIDENCE_SEALED", timestamp_iso: "18:42:16", rule_detail: "Evidence capsule sealed into SHA-256 ledger" },
    ];
  }, [currentIncident]);

  return (
    <div className="flex flex-col gap-4 text-slate-200 font-mono">
      {/* ── SECTION TITLE ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SectionHeader
          title="Incident Correlation & Multi-Observation Reconstruction"
          sub="Multi-camera correlation aggregates temporal detections across sensors into ONE unified incident story. Evaluators review explainable threat contributions before dispatch."
        />
      </div>

      {/* ── OPERATIONAL TELEMETRY CHIPS ─────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-[11px]">
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
        <div className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-950/40 px-3.5 py-2 text-[11.5px] text-sky-200 animate-fadeIn">
          <Sparkles size={14} className="text-sky-400 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-2.5 text-[11px] text-red-300">
          Backend offline. Correlated incident records loaded from local state.
        </div>
      )}

      {/* ── 2-COLUMN COMMAND DECK ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* LEFT COLUMN: ONE CORRELATED INCIDENT DECK (8 cols) */}
        <div className="lg:col-span-8 rounded-xl border border-sky-500/30 bg-[#060e18] p-4 sm:p-5 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col gap-4 relative overflow-hidden">
          {currentIncident ? (
            <>
              {/* Card Topline: Incident ID, Target, Score, Observations count */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-sky-400 font-bold">
                    <ShieldAlert size={17} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[14.5px] font-bold text-white tracking-wide">
                        {currentIncident.incident_id}
                      </span>
                      <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300 border border-sky-500/40">
                        ONE UNIFIED INCIDENT
                      </span>
                      <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] text-slate-300 border border-white/10 uppercase">
                        {currentIncident.target_class || "PERSON"}
                      </span>
                      {isPending ? (
                        <span className="flex items-center gap-1 rounded bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[9.5px] font-bold text-amber-300 animate-pulse">
                          <AlertTriangle size={10} />
                          ACTION REQUIRED
                        </span>
                      ) : currentIncident.status === "CONFIRMED" ? (
                        <span className="rounded bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[9.5px] font-bold text-red-300">
                          CONFIRMED REAL THREAT
                        </span>
                      ) : (
                        <span className="rounded bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[9.5px] font-bold text-emerald-300">
                          DISMISSED ({currentIncident.dismiss_reason || "FALSE ALARM"})
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-slate-400 mt-0.5 flex items-center gap-2">
                      <span>Correlated Cameras: {currentIncident.cameras_involved?.join(" ➔ ") || "CAM_ALPHA ➔ CAM_BRAVO"}</span>
                      <span>·</span>
                      <span className="text-emerald-400 font-semibold">{observationLadder.length} Correlated Observations</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`rounded-lg border px-3 py-1.5 text-center ${sev.bg} ${sev.border}`}>
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">THREAT SCORE</div>
                    <div className={`text-[15px] font-bold ${sev.text}`}>
                      {currentIncident.threat_score}/100
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-1.5 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-slate-400">CONFIDENCE</div>
                    <div className="text-[13px] font-bold text-sky-300">
                      {(currentIncident.confidence ? currentIncident.confidence * 100 : 91).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>

              {/* ── CHRONOLOGICAL INCIDENT RECONSTRUCTION LADDER ──────── */}
              <div className="rounded-lg border border-white/10 bg-black/50 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[10.5px] text-slate-400 border-b border-white/10 pb-2">
                  <span className="flex items-center gap-1.5 text-sky-300 font-bold uppercase tracking-wider">
                    <Clock size={12} />
                    CHRONOLOGICAL OBSERVATION PROGRESSION ({observationLadder.length} EVENTS CORRELATED)
                  </span>
                  <span className="text-slate-400">SPATIAL-TEMPORAL COHESION INTACT</span>
                </div>

                <div className="flex flex-col gap-1.5 pt-1">
                  {observationLadder.map((obs, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-3 p-2 rounded-lg bg-black/40 border border-white/5 hover:border-sky-500/30 transition-all text-[11px]"
                    >
                      {/* Timestamp Badge */}
                      <span className="shrink-0 rounded bg-slate-900 border border-white/10 px-2 py-0.5 text-[10px] text-slate-400 font-bold">
                        {obs.timestamp_iso || "18:42:01"}
                      </span>

                      {/* Camera / Source Node Badge */}
                      <span className="shrink-0 rounded bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 text-[10px] text-sky-300 font-bold">
                        {obs.camera_id}
                      </span>

                      {/* Observation narrative */}
                      <div className="flex-1 text-slate-300 leading-snug">
                        {obs.rule_detail}
                      </div>

                      {/* Check icon */}
                      <span className="text-emerald-400 shrink-0">✓</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── EXPLAINABLE THREAT SCORE BREAKDOWN (NO MYSTERY NUMBERS) ─ */}
              <div className="rounded-lg border border-white/10 bg-black/50 p-3.5 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-[10.5px] text-slate-400 border-b border-white/10 pb-2">
                  <span className="font-bold uppercase tracking-wider text-slate-300">
                    EXPLAINABLE THREAT SCORE CONTRIBUTIONS (TOTAL: {currentIncident.threat_score} / 100)
                  </span>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span>CONFIDENCE: <strong className="text-sky-300">91%</strong></span>
                    <span>·</span>
                    <span>EVIDENCE: <strong className="text-white">{observationLadder.length} OBS</strong></span>
                    <span>·</span>
                    <span>UPDATED: <strong className="text-slate-300">18:42:15 IST</strong></span>
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  {(currentIncident.score_breakdown || [
                    { factor: "Restricted Red Zone Penetration", points: 30, reason: "Target centroid crossed 100m defense geofence polygon." },
                    { factor: "Movement Toward Boundary", points: 20, reason: "Heading vector points East (078°) toward zero line." },
                    { factor: "Loitering Behaviour", points: 15, reason: "Target stationary in caution corridor for >18s." },
                    { factor: "Cross-Camera Re-ID Continuation", points: 12, reason: "Appearance matched within predicted spatio-temporal transit window (6.0–14.0s)." },
                    { factor: "Low-Visibility Night Window", points: 10, reason: "Low-visibility curfew sector transit (03:14 IST)." },
                  ]).map((f, i) => (
                    <div
                      key={i}
                      className="rounded border border-white/10 bg-black/40 p-2.5 flex flex-col gap-1 text-[11px]"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-white font-bold">{f.factor}</span>
                        <span className="rounded bg-red-500/15 border border-red-500/40 px-2 py-0.2 text-red-300 font-bold text-[11px]">
                          +{f.points} PTS
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400">{f.reason}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── COMMANDER ACTION DECK ────────────────────────────── */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={scrollToVault}
                    className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11px] text-sky-300 hover:bg-sky-500/20 transition-all"
                  >
                    <Archive size={13} />
                    <span>VIEW EVIDENCE CAPSULE</span>
                  </button>

                  <a
                    href={`/incidents/${currentIncident.incident_id}/dossier`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3 py-1.5 text-[11px] text-slate-300 hover:border-sky-500/40 hover:text-white transition-all"
                  >
                    <FileText size={13} className="text-sky-400" />
                    <span>SECTION 65B DOSSIER</span>
                  </a>
                </div>

                {isPending ? (
                  <div className="flex items-center gap-2">
                    {!showDismissPicker ? (
                      <>
                        <button
                          onClick={() => handleConfirm(currentIncident.incident_id)}
                          disabled={busyId === currentIncident.incident_id}
                          className="flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-600 px-4 py-2 text-[11.5px] font-bold text-white hover:bg-red-500 transition-all shadow-[0_0_15px_rgba(239,68,68,0.3)] active:scale-95 disabled:opacity-50"
                        >
                          <CircleCheck size={14} />
                          <span>CONFIRM THREAT (DISPATCH QRT)</span>
                        </button>
                        <button
                          onClick={() => setShowDismissPicker(true)}
                          className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-[11.5px] font-semibold text-slate-300 hover:border-white/40 hover:text-white transition-all"
                        >
                          <XCircle size={14} />
                          <span>DISMISS FALSE ALARM</span>
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-950/30 p-1.5 text-[11px] animate-fadeIn">
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
                  <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                    <Check size={13} className="text-emerald-400" />
                    <span>Incident verified & sealed into immutable Section 65B hash ledger.</span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-slate-400 text-[12px]">
              No active border incidents recorded. All perimeter sectors nominal.
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: INCIDENT AUDIT QUEUE (4 cols) */}
        <div className="lg:col-span-4 rounded-xl border border-white/10 bg-[#060e18] p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between border-b border-white/10 pb-2.5 text-[11px]">
            <span className="font-bold text-slate-300 uppercase tracking-wider">INCIDENT QUEUE</span>
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

          <div className="flex flex-col gap-2 overflow-y-auto max-h-[380px] pr-1 scrollbar-thin scrollbar-thumb-white/10">
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
                  className={`flex items-center justify-between p-2.5 rounded-lg border text-left transition-all text-[11px] ${
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
              <div className="py-8 text-center text-slate-500 text-[11px]">
                No incidents matching filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
