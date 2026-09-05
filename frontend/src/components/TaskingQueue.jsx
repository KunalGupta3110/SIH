import { useEffect, useMemo, useState } from "react";
import { CircleCheck, XCircle, SlidersHorizontal, Play } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const DISMISS_REASONS = [
  { id: "vegetation", label: "Vegetation / Tree Motion", hint: "Swaying branches / tall grass" },
  { id: "animal", label: "Animal / Wildlife", hint: "Cattle, stray dogs, birds" },
  { id: "weather", label: "Weather / Fog / Dust", hint: "Monsoon rain, fog, sandstorm" },
  { id: "camera_noise", label: "Camera Glare / Sensor Noise", hint: "Headlight bloom, IR reflections" },
  { id: "other", label: "Other False Positive", hint: "Patrol officer with clearance, etc." },
];

/**
 * Tasking Queue — every unresolved track framed as a task an operator must
 * action: confirm, or dismiss with a root-cause reason (which feeds real
 * site calibration stats). "Simulate Handoff" lives here now — it's a way
 * to manufacture a task to demonstrate the queue, not a COP-map control.
 */
export default function TriagePanel({ incidents, error, onAcknowledge }) {
  const [busyId, setBusyId] = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [selectedReason, setSelectedReason] = useState("vegetation");
  const [calibrationData, setCalibrationData] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const fetchCalibration = async () => {
    try {
      const data = await api.getCalibration();
      if (data) setCalibrationData(data);
    } catch (e) {
      // quiet
    }
  };

  useEffect(() => {
    fetchCalibration();
  }, []);

  const pending = useMemo(
    () => (incidents || []).filter((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP"),
    [incidents]
  );

  const stats = useMemo(() => {
    const all = incidents || [];
    return {
      total: all.length,
      confirmed: all.filter((i) => i.status === "CONFIRMED").length,
      dismissed: all.filter((i) => i.status === "DISMISSED_FP").length,
      pending: pending.length,
    };
  }, [incidents, pending]);

  async function handleSimulate() {
    setSimulating(true);
    try {
      await api.simulateHandoff();
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setSimulating(false);
    }
  }

  async function handleConfirm(incidentId) {
    setBusyId(incidentId);
    try {
      await api.acknowledgeIncident(incidentId, "CONFIRMED");
      onAcknowledge?.();
      fetchCalibration();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  }

  async function submitDismissal(incidentId) {
    setBusyId(incidentId);
    try {
      await api.acknowledgeIncident(incidentId, "DISMISSED_FP", selectedReason);
      setDismissingId(null);
      onAcknowledge?.();
      fetchCalibration();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-6 text-slate-200">
      <div className="flex items-start justify-between gap-4">
        <SectionHeader
          title="Tasking Queue"
          sub="Every operator dismissal is tagged with a root cause to calibrate site sensitivity per camera node."
        />
        <button
          onClick={handleSimulate}
          disabled={simulating}
          className="flex shrink-0 items-center gap-1.5 rounded border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-[11.5px] font-semibold text-sky-300 hover:bg-sky-500/20 disabled:opacity-50"
        >
          <Play size={11} fill="currentColor" />
          {simulating ? "Simulating…" : "Simulate Handoff"}
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="flex flex-col gap-3">
          {pending.length === 0 && !error && (
            <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-8 text-center text-[12.5px] text-slate-500">
              All tracks reviewed. Edge pipeline running nominal.
            </div>
          )}

          {pending.map((inc) => {
            const isDismissing = dismissingId === inc.incident_id;
            return (
              <div key={inc.incident_id} className="flex flex-col rounded-lg border border-white/10 bg-black/40 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[12px] font-semibold text-white">
                      {inc.incident_id} <span className="text-slate-500">· {inc.severity} ({inc.threat_score}/100)</span>
                    </div>
                    <div className="mt-1 text-[12px] text-slate-400">
                      {inc.story_summary || `Nodes: ${inc.cameras_involved?.join(", ") || "unknown"}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConfirm(inc.incident_id)}
                      disabled={busyId === inc.incident_id}
                      className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11.5px] font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <CircleCheck size={13} /> Confirm Threat
                    </button>
                    <button
                      onClick={() => setDismissingId(isDismissing ? null : inc.incident_id)}
                      disabled={busyId === inc.incident_id}
                      className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                        isDismissing ? "border-sky-500/50 bg-sky-500/20 text-sky-300 font-bold" : "border-white/10 bg-black/40 text-slate-400 hover:text-white"
                      } disabled:opacity-50`}
                    >
                      <XCircle size={13} /> Dismiss FP…
                    </button>
                  </div>
                </div>

                {isDismissing && (
                  <div className="mt-3.5 border-t border-white/10 pt-3 bg-black/30 p-3 rounded">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-sky-400">
                      Select Root Cause for Site Calibration:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {DISMISS_REASONS.map((r) => (
                        <label
                          key={r.id}
                          className={`flex items-start gap-2 p-2 rounded cursor-pointer border text-[11.5px] transition-all ${
                            selectedReason === r.id ? "border-sky-500/50 bg-sky-500/10 text-white font-medium" : "border-white/10 bg-black/30 text-slate-400 hover:border-white/25"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`reason_${inc.incident_id}`}
                            value={r.id}
                            checked={selectedReason === r.id}
                            onChange={() => setSelectedReason(r.id)}
                            className="mt-0.5 accent-sky-500"
                          />
                          <div>
                            <div className="text-slate-200 leading-tight">{r.label}</div>
                            <div className="text-[10px] text-slate-500">{r.hint}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setDismissingId(null)} className="px-3 py-1 text-[11px] rounded border border-white/10 bg-black/30 text-slate-400 hover:text-white">
                        Cancel
                      </button>
                      <button
                        onClick={() => submitDismissal(inc.incident_id)}
                        disabled={busyId === inc.incident_id}
                        className="px-3.5 py-1 text-[11px] font-medium rounded border border-sky-500/50 bg-sky-500 text-black font-semibold hover:bg-sky-400"
                      >
                        Submit Calibration &amp; Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-slate-500">
              <span>Triage Queue</span>
              <span className="font-mono text-slate-300">{stats.pending} pending</span>
            </div>
            {[
              ["Total Recorded", stats.total],
              ["Confirmed Threats", stats.confirmed],
              ["Dismissed False Alarms", stats.dismissed],
              ["Pending Operator Review", stats.pending],
            ].map(([label, val]) => (
              <div key={label} className="flex items-center justify-between border-b border-white/5 py-2 font-mono text-[12px] last:border-0">
                <span className="text-slate-500">{label}</span>
                <span className="font-medium text-slate-200">{val}</span>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-white/10 bg-black/40 p-4">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-sky-400">
              <SlidersHorizontal size={13} />
              <span>Site-Specific Calibration</span>
            </div>
            <div className="mb-2 text-[11px] text-slate-500">Dismissal reasons recorded for dynamic threshold tuning:</div>
            {calibrationData?.by_reason && (
              <div className="flex flex-col gap-1.5 font-mono text-[11.5px]">
                {Object.entries(calibrationData.by_reason).map(([rsn, count]) => (
                  <div key={rsn} className="flex items-center justify-between rounded bg-black/30 px-2 py-1">
                    <span className="text-slate-500 capitalize">{rsn.replace("_", " ")}</span>
                    <span className="font-bold text-sky-400">{count}</span>
                  </div>
                ))}
                <div className="mt-2 text-[10px] text-slate-500">Total Calibrated FP: {calibrationData.total_dismissed || 0}</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
