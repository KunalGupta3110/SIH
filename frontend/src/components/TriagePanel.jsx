import { useMemo, useState } from "react";
import { CircleCheck, XCircle } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

// backend/main.py exposes incident status (UNREVIEWED / CONFIRMED /
// DISMISSED_FP), not a separate raw-event queue, so triage works at the
// incident level here — each incident IS the unit an operator reviews.
export default function TriagePanel({ incidents, error, onAcknowledge }) {
  const [busyId, setBusyId] = useState(null);

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

  async function handleAck(incidentId, status) {
    setBusyId(incidentId);
    try {
      await api.acknowledgeIncident(incidentId, status);
      onAcknowledge?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <SectionHeader
        title="Operator Triage"
        sub="Confirm or dismiss flagged incidents — every dismissal is recorded for site-specific alert calibration."
      />

      {error && (
        <div className="mb-4 rounded-[4px] border border-red/40 bg-red/10 px-3.5 py-2.5 text-[12px] text-red">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      <div className="grid grid-cols-[1fr_260px] gap-5">
        <div className="flex flex-col gap-2.5">
          {pending.length === 0 && !error && (
            <div className="rounded-[4px] border border-line bg-panel px-4 py-6 text-center text-[12.5px] text-dim">
              All incidents reviewed.
            </div>
          )}
          {pending.map((inc) => (
            <div key={inc.incident_id} className="flex items-center justify-between rounded-[4px] border border-line bg-panel px-4 py-3">
              <div>
                <div className="font-mono text-[12px]">
                  {inc.incident_id} <span className="text-dim2">· {inc.severity}</span>
                </div>
                <div className="mt-0.5 text-[11.5px] text-dim">
                  Score {inc.threat_score}/100 — {inc.cameras_involved?.join(", ") || "unknown node"}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAck(inc.incident_id, "CONFIRMED")}
                  disabled={busyId === inc.incident_id}
                  className="flex items-center gap-1.5 rounded-[3px] border border-green/55 bg-green/10 px-2.5 py-1.5 text-[11px] font-medium text-green disabled:opacity-50"
                >
                  <CircleCheck size={12} /> Confirm
                </button>
                <button
                  onClick={() => handleAck(inc.incident_id, "DISMISSED_FP")}
                  disabled={busyId === inc.incident_id}
                  className="flex items-center gap-1.5 rounded-[3px] border border-line2 bg-panel2 px-2.5 py-1.5 text-[11px] font-medium text-dim disabled:opacity-50"
                >
                  <XCircle size={12} /> Dismiss FP
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-[4px] border border-line bg-panel p-4">
          <div className="mb-3 text-[11px] font-medium uppercase tracking-wide text-faint">Triage stats</div>
          {[
            ["Total incidents", stats.total],
            ["Confirmed", stats.confirmed],
            ["Dismissed FP", stats.dismissed],
            ["Pending review", stats.pending],
          ].map(([label, val]) => (
            <div key={label} className="flex items-center justify-between border-b border-[#1A1D21] py-2 font-mono text-[12px] last:border-0">
              <span className="text-dim">{label}</span>
              <span className="font-medium text-ink2">{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
