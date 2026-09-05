import { useEffect, useMemo, useState } from "react";
import { CircleCheck, XCircle, SlidersHorizontal } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const DISMISS_REASONS = [
  { id: "vegetation", label: "Vegetation / Tree Motion", hint: "Swaying branches / tall grass" },
  { id: "animal", label: "Animal / Wildlife", hint: "Cattle, stray dogs, birds" },
  { id: "weather", label: "Weather / Fog / Dust", hint: "Monsoon rain, fog, sandstorm" },
  { id: "camera_noise", label: "Camera Glare / Sensor Noise", hint: "Headlight bloom, IR reflections" },
  { id: "other", label: "Other False Positive", hint: "Patrol officer with clearance, etc." },
];

export default function TriagePanel({ incidents, error, onAcknowledge }) {
  const [busyId, setBusyId] = useState(null);
  const [dismissingId, setDismissingId] = useState(null);
  const [selectedReason, setSelectedReason] = useState("vegetation");
  const [calibrationData, setCalibrationData] = useState(null);

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
    <div>
      <SectionHeader
        title="Operator Triage & Site-Specific False Alarm Calibration"
        sub="Every operator dismissal is tagged with a root cause reason to calibrate site sensitivity per camera node."
      />

      {error && (
        <div className="mb-4 rounded-[4px] border border-red/40 bg-red/10 px-3.5 py-2.5 text-[12px] text-red">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        <div className="flex flex-col gap-3">
          {pending.length === 0 && !error && (
            <div className="rounded-[4px] border border-line bg-panel px-4 py-8 text-center text-[12.5px] text-dim">
              All incidents reviewed. Edge pipeline running nominal.
            </div>
          )}

          {pending.map((inc) => {
            const isDismissing = dismissingId === inc.incident_id;
            return (
              <div
                key={inc.incident_id}
                className="flex flex-col rounded-[4px] border border-line bg-panel p-4 transition-all"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-mono text-[12px] font-semibold text-ink">
                      {inc.incident_id} <span className="text-dim2">· {inc.severity} ({inc.threat_score}/100)</span>
                    </div>
                    <div className="mt-1 text-[12px] text-dim">
                      {inc.story_summary || `Nodes: ${inc.cameras_involved?.join(", ") || "unknown"}`}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleConfirm(inc.incident_id)}
                      disabled={busyId === inc.incident_id}
                      className="flex items-center gap-1.5 rounded-[3px] border border-green/55 bg-green/10 px-3 py-1.5 text-[11.5px] font-medium text-green hover:bg-green/20 disabled:opacity-50"
                    >
                      <CircleCheck size={13} /> Confirm Threat
                    </button>
                    <button
                      onClick={() => setDismissingId(isDismissing ? null : inc.incident_id)}
                      disabled={busyId === inc.incident_id}
                      className={`flex items-center gap-1.5 rounded-[3px] border px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                        isDismissing
                          ? "border-amber bg-amber/20 text-amber font-bold"
                          : "border-line2 bg-panel2 text-dim hover:text-ink2"
                      } disabled:opacity-50`}
                    >
                      <XCircle size={13} /> Dismiss FP…
                    </button>
                  </div>
                </div>

                {/* Dismissal Reason Modal / Expansion */}
                {isDismissing && (
                  <div className="mt-3.5 border-t border-line2 pt-3 bg-panel2/60 p-3 rounded-[3px]">
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber">
                      Select Root Cause for Site Calibration:
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                      {DISMISS_REASONS.map((r) => (
                        <label
                          key={r.id}
                          className={`flex items-start gap-2 p-2 rounded cursor-pointer border text-[11.5px] transition-all ${
                            selectedReason === r.id
                              ? "border-amber/60 bg-amber/10 text-ink font-medium"
                              : "border-line bg-panel text-dim hover:border-line2"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`reason_${inc.incident_id}`}
                            value={r.id}
                            checked={selectedReason === r.id}
                            onChange={() => setSelectedReason(r.id)}
                            className="mt-0.5 accent-amber"
                          />
                          <div>
                            <div className="text-ink2 leading-tight">{r.label}</div>
                            <div className="text-[10px] text-dim2">{r.hint}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => setDismissingId(null)}
                        className="px-3 py-1 text-[11px] rounded border border-line bg-panel text-dim hover:text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => submitDismissal(inc.incident_id)}
                        disabled={busyId === inc.incident_id}
                        className="px-3.5 py-1 text-[11px] font-medium rounded border border-amber/50 bg-amber text-panel font-semibold hover:bg-amberLight"
                      >
                        Submit Calibration & Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Triage & Calibration Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="rounded-[4px] border border-line bg-panel p-4">
            <div className="mb-3 flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-faint">
              <span>Triage Queue</span>
              <span className="font-mono text-ink2">{stats.pending} pending</span>
            </div>
            {[
              ["Total Recorded", stats.total],
              ["Confirmed Threats", stats.confirmed],
              ["Dismissed False Alarms", stats.dismissed],
              ["Pending Operator Review", stats.pending],
            ].map(([label, val]) => (
              <div
                key={label}
                className="flex items-center justify-between border-b border-[#1A1D21] py-2 font-mono text-[12px] last:border-0"
              >
                <span className="text-dim">{label}</span>
                <span className="font-medium text-ink2">{val}</span>
              </div>
            ))}
          </div>

          {/* Site Calibration Stats */}
          <div className="rounded-[4px] border border-line bg-panel p-4">
            <div className="mb-3 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-amber">
              <SlidersHorizontal size={13} />
              <span>Site-Specific Calibration</span>
            </div>
            <div className="mb-2 text-[11px] text-dim">
              Dismissal reasons recorded for dynamic threshold tuning:
            </div>
            {calibrationData?.by_reason && (
              <div className="flex flex-col gap-1.5 font-mono text-[11.5px]">
                {Object.entries(calibrationData.by_reason).map(([rsn, count]) => (
                  <div key={rsn} className="flex items-center justify-between rounded bg-panel2 px-2 py-1">
                    <span className="text-dim capitalize">{rsn.replace("_", " ")}</span>
                    <span className="font-bold text-amber">{count}</span>
                  </div>
                ))}
                <div className="mt-2 text-[10px] text-dim2">
                  Total Calibrated FP: {calibrationData.total_dismissed || 0}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
