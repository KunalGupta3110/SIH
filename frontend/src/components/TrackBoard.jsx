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
  Compass,
  GitBranch,
  CheckCircle2,
  Navigation,
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

const PRESET_CORRIDORS = [
  { id: "c1", label: "CAM-01 ➔ CAM-02", source: "CAM_ALPHA", target: "CAM_BRAVO", dir: "EAST (078°)", eta: "8.5s", dist: "26.3m", reid: "94.2%" },
  { id: "c2", label: "CAM-02 ➔ CAM-03", source: "CAM_BRAVO", target: "CAM_CHARLIE", dir: "EAST (082°)", eta: "12.0s", dist: "48.0m", reid: "91.5%" },
  { id: "c3", label: "CAM-04 ➔ CAM-01", source: "CAM_DELTA", target: "CAM_ALPHA", dir: "NORTH (005°)", eta: "9.8s", dist: "35.0m", reid: "93.0%" },
];

export default function TrackBoard({ incidents = [], error, onAcknowledge }) {
  const pendingIncidents = useMemo(
    () => incidents.filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"),
    [incidents]
  );

  const [selectedId, setSelectedId] = useState(() => pendingIncidents[0]?.incident_id || incidents[0]?.incident_id || null);
  const [selectedCorridorId, setSelectedCorridorId] = useState("c1");
  const [busyId, setBusyId] = useState(null);
  const [showDismissPicker, setShowDismissPicker] = useState(false);
  const [selectedReason, setSelectedReason] = useState("animal");
  const [simulatingHandoff, setSimulatingHandoff] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const currentIncident = useMemo(() => {
    return incidents.find((i) => i.incident_id === selectedId) || pendingIncidents[0] || incidents[0] || null;
  }, [incidents, pendingIncidents, selectedId]);

  const activeCorridor = useMemo(() => {
    return PRESET_CORRIDORS.find((c) => c.id === selectedCorridorId) || PRESET_CORRIDORS[0];
  }, [selectedCorridorId]);

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
      setFeedback({ type: "dismiss", message: `Incident ${incidentId} dismissed (${reason}). Sensor calibrated.` });
      setTimeout(() => setFeedback(null), 4000);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  };

  const handleSimulateHandoff = async () => {
    setSimulatingHandoff(true);
    try {
      await api.simulateHandoff();
      setFeedback({
        type: "handoff",
        message: `Handoff simulation executed: Target re-acquired at ${activeCorridor.target} in ${activeCorridor.eta}. Re-ID match ${activeCorridor.reid}.`,
      });
      setTimeout(() => setFeedback(null), 5000);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulatingHandoff(false);
    }
  };

  const scrollToVault = () => {
    document.getElementById("custody")?.scrollIntoView({ behavior: "smooth" });
  };

  const sev = currentIncident ? SEVERITY_STYLE[currentIncident.severity] || SEVERITY_STYLE.CRITICAL : SEVERITY_STYLE.CRITICAL;
  const isPending = currentIncident && currentIncident.status !== "CONFIRMED" && currentIncident.status !== "DISMISSED_FP";

  const observationLadder = useMemo(() => {
    if (currentIncident?.nodes && currentIncident.nodes.length > 0) {
      return currentIncident.nodes;
    }
    return [
      { step: 1, camera_id: "CAM_ALPHA", timestamp_iso: "18:42:01", rule_detail: "Restricted-zone breach detected (Geofence incursion)" },
      { step: 2, camera_id: "CAM_ALPHA", timestamp_iso: "18:42:03", rule_detail: "TRACK P17: Movement continuing EAST @ 1.8 m/s" },
      { step: 3, camera_id: "CAM_BRAVO", timestamp_iso: "18:42:08", rule_detail: "Cross-camera Re-ID match 94.2% within ETA window" },
      { step: 4, camera_id: "CAM_BRAVO", timestamp_iso: "18:42:11", rule_detail: "Persistent movement vector toward zero line" },
      { step: 5, camera_id: "SYSTEM", timestamp_iso: "18:42:15", rule_detail: "Threat score 87 / 100 · 5 correlated observations" },
      { step: 6, camera_id: "SYSTEM", timestamp_iso: "18:42:16", rule_detail: "Evidence capsule sealed into SHA-256 ledger" },
    ];
  }, [currentIncident]);

  return (
    <div className="flex flex-col gap-5 text-slate-200">
      {/* ── SECTION HEADER ─────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <SectionHeader
          title="Incident Reconstruction & Predictive Handoff"
          sub="Correlates individual camera observations into a unified incident track, and forecasts target transit through blind corridors."
        />
        {/* Incident Switcher Pills */}
        <div className="flex items-center gap-1.5 self-start sm:self-center">
          <span className="text-xs text-slate-400 mr-1 uppercase font-semibold">Incident:</span>
          {incidents.slice(0, 3).map((inc) => (
            <button
              key={inc.incident_id}
              onClick={() => setSelectedId(inc.incident_id)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all border ${
                inc.incident_id === currentIncident?.incident_id
                  ? "bg-sky-500/20 border-sky-400 text-sky-200 shadow-sm"
                  : "bg-black/40 border-white/10 text-slate-400 hover:text-white"
              }`}
            >
              <span className="font-mono">{inc.incident_id}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div className="flex items-center gap-2 rounded-xl border border-sky-500/40 bg-sky-950/40 px-4 py-2.5 text-xs text-sky-200 animate-fadeIn">
          <Sparkles size={15} className="text-sky-400 shrink-0" />
          <span>{feedback.message}</span>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          Backend offline. Correlated incident records loaded from local state.
        </div>
      )}

      {/* ── UNIFIED COMMAND DECK (SPLIT SCREEN) ────────────────────── */}
      <div className="rounded-2xl border border-sky-500/30 bg-[#060e18] p-5 sm:p-6 shadow-2xl flex flex-col gap-5">
        {/* Deck Header: Incident ID, Badges, Threat Score */}
        {currentIncident ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/40 bg-sky-500/10 text-sky-400 font-bold">
                  <ShieldAlert size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="text-lg font-bold text-white tracking-wide font-mono">
                      {currentIncident.incident_id}
                    </span>
                    <span className="rounded-md bg-sky-500/15 border border-sky-500/30 px-2 py-0.5 text-[10.5px] font-bold text-sky-300 uppercase">
                      Correlated Incident Track
                    </span>
                    <span className="rounded-md bg-black/60 px-2 py-0.5 text-[10.5px] text-slate-300 border border-white/10 uppercase font-medium">
                      Target: {currentIncident.target_class || "Person"}
                    </span>
                    {isPending ? (
                      <span className="flex items-center gap-1.5 rounded-md bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-[10.5px] font-bold text-amber-300 animate-pulse">
                        <AlertTriangle size={11} />
                        Action Required
                      </span>
                    ) : currentIncident.status === "CONFIRMED" ? (
                      <span className="rounded-md bg-red-500/20 border border-red-500/40 px-2 py-0.5 text-[10.5px] font-bold text-red-300">
                        Confirmed Real Threat
                      </span>
                    ) : (
                      <span className="rounded-md bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-[10.5px] font-bold text-emerald-300">
                        Dismissed ({currentIncident.dismiss_reason || "False Alarm"})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Multi-Camera Path: <strong className="text-slate-300 font-mono">{currentIncident.cameras_involved?.join(" ➔ ") || "CAM_ALPHA ➔ CAM_BRAVO"}</strong> · {observationLadder.length} Correlated Spatio-Temporal Observations
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`rounded-xl border px-3.5 py-1.5 text-center ${sev.bg} ${sev.border}`}>
                  <div className="text-[10px] uppercase font-semibold text-slate-400">Threat Score</div>
                  <div className={`text-base font-bold font-mono ${sev.text}`}>
                    {currentIncident.threat_score}/100
                  </div>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-1.5 text-center">
                  <div className="text-[10px] uppercase font-semibold text-slate-400">AI Confidence</div>
                  <div className="text-base font-bold font-mono text-sky-300">
                    {(currentIncident.confidence ? currentIncident.confidence * 100 : 91).toFixed(0)}%
                  </div>
                </div>
              </div>
            </div>

            {/* Split Grid: Left = Reconstruction, Right = Predictive Handoff */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* ── LEFT COLUMN (7 cols): OBSERVATION LADDER & SCORE ─── */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Chronological Observation Ladder */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/10 pb-2">
                    <span className="font-bold text-sky-300 uppercase tracking-wider flex items-center gap-2">
                      <Clock size={14} />
                      Chronological Spatio-Temporal Progression
                    </span>
                    <span className="font-mono text-[11px]">{observationLadder.length} Nodes</span>
                  </div>

                  <div className="flex flex-col gap-2 pt-1">
                    {observationLadder.map((obs, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-black/50 border border-white/5 text-xs hover:border-white/15 transition-all"
                      >
                        <span className="shrink-0 rounded bg-slate-900 border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 font-mono font-medium">
                          {obs.timestamp_iso || "18:42:01"}
                        </span>
                        <span className="shrink-0 rounded bg-sky-950/60 border border-sky-500/30 px-2 py-0.5 text-[11px] text-sky-300 font-mono font-semibold">
                          {obs.camera_id}
                        </span>
                        <span className="flex-1 text-slate-300 text-xs">
                          {obs.rule_detail}
                        </span>
                        <span className="text-emerald-400 shrink-0 font-bold text-xs">✓</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Explainable Threat Score Breakdown */}
                <div className="rounded-xl border border-white/10 bg-black/40 p-4 flex flex-col gap-3">
                  <div className="flex items-center justify-between text-xs text-slate-400 border-b border-white/10 pb-2">
                    <span className="font-bold uppercase tracking-wider text-slate-300">
                      Explainable Threat Factor Breakdown
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">Total: {currentIncident.threat_score} pts</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs">
                    {(currentIncident.score_breakdown || [
                      { factor: "Restricted Red Zone Penetration", points: 30 },
                      { factor: "Movement Toward Boundary", points: 20 },
                      { factor: "Loitering Behaviour", points: 15 },
                      { factor: "Cross-Camera Re-ID Match", points: 12 },
                      { factor: "Night Window Curfew", points: 10 },
                    ]).map((f, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/50 px-3 py-2"
                      >
                        <span className="text-slate-300 text-xs">{f.factor}</span>
                        <span className="font-bold text-red-400 font-mono text-xs shrink-0 ml-2">+{f.points}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Commander Actions */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={scrollToVault}
                      className="flex items-center gap-1.5 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-all"
                    >
                      <Archive size={14} />
                      <span>Evidence Capsule</span>
                    </button>
                    <a
                      href={`/incidents/${currentIncident.incident_id}/dossier`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-black/60 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
                    >
                      <FileText size={14} className="text-sky-400" />
                      <span>Section 65B Dossier</span>
                    </a>
                  </div>

                  {isPending ? (
                    <div className="flex items-center gap-2.5">
                      {!showDismissPicker ? (
                        <>
                          <button
                            onClick={() => handleConfirm(currentIncident.incident_id)}
                            disabled={busyId === currentIncident.incident_id}
                            className="flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 transition-all shadow-md active:scale-95 disabled:opacity-50"
                          >
                            <CircleCheck size={14} />
                            <span>Confirm Threat</span>
                          </button>
                          <button
                            onClick={() => setShowDismissPicker(true)}
                            className="flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/60 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-all"
                          >
                            <XCircle size={14} />
                            <span>Dismiss False Alarm</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-1.5 text-xs">
                          <select
                            value={selectedReason}
                            onChange={(e) => setSelectedReason(e.target.value)}
                            className="rounded-md border border-white/20 bg-black px-2.5 py-1 text-white text-xs focus:outline-none"
                          >
                            {DISMISS_REASONS.map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.icon} {r.label}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleDismiss(currentIncident.incident_id, selectedReason)}
                            className="rounded-md bg-amber-500 px-3 py-1 font-bold text-slate-950 hover:bg-amber-400 text-xs"
                          >
                            Confirm
                          </button>
                          <button onClick={() => setShowDismissPicker(false)} className="px-1.5 text-slate-400 hover:text-white">
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-emerald-400 flex items-center gap-1.5 font-medium">
                      <Check size={14} />
                      <span>Incident confirmed & sealed to cryptographic ledger.</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT COLUMN (5 cols): PREDICTIVE HANDOFF CARD ───── */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="rounded-2xl border border-sky-500/40 bg-gradient-to-b from-sky-950/30 to-black/60 p-5 shadow-xl flex flex-col gap-4">
                  {/* Handoff Header */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-3">
                    <div className="flex items-center gap-2">
                      <GitBranch size={18} className="text-sky-400" />
                      <span className="font-bold text-white text-sm tracking-wide">
                        PREDICTIVE CAMERA HANDOFF
                      </span>
                    </div>
                    <span className="rounded-md bg-emerald-500/15 border border-emerald-500/40 px-2.5 py-0.5 text-[10.5px] font-bold text-emerald-300">
                      Topology Active
                    </span>
                  </div>

                  {/* Clean Formatted Key-Value Telemetry Block */}
                  <div className="flex flex-col gap-2.5 bg-black/60 rounded-xl p-4 border border-white/5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Source Camera:</span>
                      <span className="font-bold font-mono text-white">{activeCorridor.source}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Track ID:</span>
                      <span className="font-bold font-mono text-sky-300">TRACK P17 [Person]</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Movement Heading:</span>
                      <span className="font-bold text-amber-300 flex items-center gap-1.5">
                        <Navigation size={12} />
                        <span>{activeCorridor.dir} @ 1.8 m/s</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-2">
                      <span className="text-slate-400">Predicted Next Camera:</span>
                      <span className="font-bold font-mono text-sky-400">{activeCorridor.target}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Calculated Arrival ETA:</span>
                      <span className="font-bold text-white flex items-center gap-1.5">
                        <Clock size={12} className="text-sky-400" />
                        <span className="font-mono">{activeCorridor.eta}</span>
                        <span className="text-slate-400 font-normal">({activeCorridor.dist} corridor)</span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Appearance Re-ID Match:</span>
                      <span className="font-bold font-mono text-emerald-400">{activeCorridor.reid}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-white/5 pt-2">
                      <span className="text-slate-400">Handoff Status:</span>
                      <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-400 animate-pulse" />
                        <span>✓ CONFIRMED</span>
                      </span>
                    </div>
                  </div>

                  {/* Quick Preset Corridors */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] text-slate-400 uppercase font-semibold">
                      Topological Corridor Presets:
                    </span>
                    <div className="grid grid-cols-3 gap-1.5">
                      {PRESET_CORRIDORS.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => setSelectedCorridorId(c.id)}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all truncate ${
                            c.id === selectedCorridorId
                              ? "bg-sky-500/20 border-sky-400 text-sky-200"
                              : "bg-black/40 border-white/10 text-slate-400 hover:text-white"
                          }`}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Trigger Button */}
                  <button
                    onClick={handleSimulateHandoff}
                    disabled={simulatingHandoff}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-500/60 bg-sky-500/20 py-3 text-xs font-bold text-sky-200 hover:bg-sky-500/30 transition-all shadow-md active:scale-95 disabled:opacity-50"
                  >
                    <Play size={13} fill="currentColor" className={simulatingHandoff ? "animate-spin" : ""} />
                    <span>{simulatingHandoff ? "Computing Spatial Transit..." : "Simulate Live Handoff"}</span>
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="py-12 text-center text-slate-400 text-xs">
            No active border incidents recorded. All perimeter sectors nominal.
          </div>
        )}
      </div>
    </div>
  );
}
