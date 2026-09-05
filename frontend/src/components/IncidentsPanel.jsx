import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, CircleCheck, XCircle, Timer } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const SEVERITY_CLASS = {
  CRITICAL: { text: "text-red", bg: "bg-red/10", border: "border-red/40" },
  WARNING: { text: "text-amber", bg: "bg-amber/10", border: "border-amber/40" },
  INFO: { text: "text-blue", bg: "bg-blue/10", border: "border-blue/40" },
};

export default function IncidentsPanel({ incidents, error, onAcknowledge }) {
  const [open, setOpen] = useState(null);
  const [busyId, setBusyId] = useState(null);

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
        title="Correlated Multi-Camera Incidents & Predictive Handoffs"
        sub="Multiple camera detections unified into continuous spatio-temporal trajectories with predicted arrival bounds."
      />

      {error && (
        <div className="mb-4 rounded-[4px] border border-red/40 bg-red/10 px-3.5 py-2.5 text-[12px] text-red">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      {!error && incidents && incidents.length === 0 && (
        <div className="rounded-[4px] border border-line bg-panel px-4 py-6 text-center text-[12.5px] text-dim">
          No incidents yet. Click <span className="text-amberLight">Simulate Handoff</span> in the top bar to push a real event through the pipeline.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {incidents?.map((inc) => {
          const isOpen = open === inc.incident_id;
          const sev = SEVERITY_CLASS[inc.severity] || SEVERITY_CLASS.INFO;
          const acknowledged = inc.status === "CONFIRMED" || inc.status === "DISMISSED_FP";

          return (
            <div key={inc.incident_id} className="rounded-[4px] border border-line bg-panel">
              <button
                onClick={() => setOpen(isOpen ? null : inc.incident_id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={14} className="text-dim2" /> : <ChevronRight size={14} className="text-dim2" />}
                  <div>
                    <div className="flex items-center gap-2 text-[13px] font-medium">
                      {inc.incident_id}
                      {inc.target_class && (
                        <span className="font-mono text-[11px] text-dim2">· {inc.target_class}</span>
                      )}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-dim2">{inc.created_at}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {inc.dismiss_reason && (
                    <span className="rounded bg-panel2 px-2 py-0.5 font-mono text-[10.5px] text-amber">
                      FP: {inc.dismiss_reason}
                    </span>
                  )}
                  {acknowledged && (
                    <span className="font-mono text-[10.5px] text-dim2">{inc.status}</span>
                  )}
                  {typeof inc.confidence === "number" && (
                    <span className="font-mono text-[11px] text-dim2">{(inc.confidence * 100).toFixed(0)}% conf</span>
                  )}
                  <span className={`rounded-[3px] border px-2 py-1 font-mono text-[11px] font-semibold ${sev.text} ${sev.bg} ${sev.border}`}>
                    {inc.threat_score}/100 · {inc.severity}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-line px-4 py-4">
                  {inc.nodes?.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-dim">
                      {inc.nodes.map((node, i) => (
                        <span key={i} className="flex items-center gap-2">
                          <span className="rounded-[3px] border border-line2 px-1.5 py-0.5">{node.camera_id}</span>
                          {i < inc.nodes.length - 1 && <ArrowRight size={11} className="text-faint" />}
                        </span>
                      ))}
                    </div>
                  )}

                  {inc.story_summary && (
                    <div className="mb-4 rounded bg-panel2 p-3 text-[12.5px] leading-relaxed text-ink2 border border-line2/50 flex items-start gap-2">
                      <Timer size={16} className="text-amber mt-0.5 shrink-0" />
                      <div>{inc.story_summary}</div>
                    </div>
                  )}

                  {/* Explainable Factor Breakdown */}
                  {inc.score_breakdown?.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-faint">
                        Explainable Threat Factors ({inc.threat_score} pts)
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {inc.score_breakdown.map((f, i) => (
                          <div key={i} className="flex items-center justify-between rounded bg-panel2 px-3 py-1.5 text-[11.5px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-ink">{f.factor}</span>
                              <span className="text-dim2 text-[10.5px]">({f.reason})</span>
                            </div>
                            <span className="font-mono font-bold text-amber">+{f.points} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions & Blockchain Anchor */}
                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                    <div className="font-mono text-[10.5px] text-dim2 truncate max-w-md">
                      LEDGER ANCHOR: {inc.cryptographic_hash || "SEALED IN MERKLE LEDGER"}
                    </div>
                    {!acknowledged && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAck(inc.incident_id, "CONFIRMED")}
                          disabled={busyId === inc.incident_id}
                          className="flex items-center gap-1.5 rounded-[3px] border border-green/55 bg-green/10 px-3 py-1.5 text-[11px] font-medium text-green hover:bg-green/20"
                        >
                          <CircleCheck size={12} /> Confirm
                        </button>
                        <button
                          onClick={() => handleAck(inc.incident_id, "DISMISSED_FP")}
                          disabled={busyId === inc.incident_id}
                          className="flex items-center gap-1.5 rounded-[3px] border border-line2 bg-panel2 px-3 py-1.5 text-[11px] font-medium text-dim hover:text-ink2"
                        >
                          <XCircle size={12} /> Dismiss FP
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
