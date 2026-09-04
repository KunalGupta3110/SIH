import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, CircleCheck, XCircle } from "lucide-react";
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
        title="Correlated Incidents"
        sub="Multiple raw detections merged into one reconstructed story — not a flat alert list."
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
                    <p className="mb-4 text-[12.5px] leading-relaxed text-ink2">{inc.story_summary}</p>
                  )}

                  <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Threat score breakdown</div>
                  <div className="mt-2 flex flex-col gap-1.5">
                    {(inc.score_breakdown || []).map((b, i) => (
                      <div key={i} className="flex items-start gap-2.5 text-[12px]">
                        <span className={`w-9 shrink-0 text-right font-mono font-medium ${sev.text}`}>+{b.points}</span>
                        <div>
                          <span className="font-medium text-ink2">{b.factor}</span>
                          <span className="text-dim2"> — {b.reason}</span>
                        </div>
                      </div>
                    ))}
                    {(!inc.score_breakdown || inc.score_breakdown.length === 0) && (
                      <div className="text-[12px] text-dim2">No scored factors recorded.</div>
                    )}
                  </div>

                  {inc.cryptographic_hash && (
                    <div className="mt-3 truncate font-mono text-[10.5px] text-faint">
                      Sealed to ledger: {inc.cryptographic_hash}
                    </div>
                  )}

                  {!acknowledged && (
                    <div className="mt-4 flex gap-2 border-t border-[#1A1D21] pt-3">
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
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
