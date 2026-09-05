import { useState } from "react";
import { ChevronDown, ChevronRight, ArrowRight, CircleCheck, XCircle, FileText, Timer } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const SEVERITY_CLASS = {
  CRITICAL: { text: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/40" },
  WARNING: { text: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/40" },
  INFO: { text: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/40" },
};

/**
 * Track Board — every track/incident, not just the one selected on the
 * map. Same real data and acknowledge action as the COP's floating right
 * panel, just as a full scrollable list for when an operator wants the
 * whole picture instead of one entity at a time.
 */
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
    <div className="h-full overflow-y-auto p-6 text-slate-200">
      <SectionHeader
        title="Track Board"
        sub="Every correlated multi-camera track, with real predictive-handoff spatio-temporal windows and explainable scoring."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 py-2.5 text-[12px] text-red-300">
          Couldn't reach the backend. Start it with <code className="font-mono">python run_ecosystem.py</code>.
        </div>
      )}

      {!error && incidents && incidents.length === 0 && (
        <div className="rounded-lg border border-white/10 bg-black/40 px-4 py-6 text-center text-[12.5px] text-slate-500">
          No tracks yet. Use "Simulate Handoff" in the Tasking Queue to push a real event through the pipeline.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {incidents?.map((inc) => {
          const isOpen = open === inc.incident_id;
          const sev = SEVERITY_CLASS[inc.severity] || SEVERITY_CLASS.INFO;
          const acknowledged = inc.status === "CONFIRMED" || inc.status === "DISMISSED_FP";

          return (
            <div key={inc.incident_id} className="rounded-lg border border-white/10 bg-black/40">
              <button
                onClick={() => setOpen(isOpen ? null : inc.incident_id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-3">
                  {isOpen ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronRight size={14} className="text-slate-500" />}
                  <div>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-white">
                      {inc.incident_id}
                      {inc.target_class && <span className="font-mono text-[11px] text-slate-500">· {inc.target_class}</span>}
                    </div>
                    <div className="mt-0.5 font-mono text-[10.5px] text-slate-500">{inc.created_at}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {inc.dismiss_reason && (
                    <span className="rounded bg-black/40 px-2 py-0.5 font-mono text-[10.5px] text-amber-400">FP: {inc.dismiss_reason}</span>
                  )}
                  {acknowledged && <span className="font-mono text-[10.5px] text-slate-500">{inc.status}</span>}
                  {typeof inc.confidence === "number" && (
                    <span className="font-mono text-[11px] text-slate-500">{(inc.confidence * 100).toFixed(0)}% conf</span>
                  )}
                  <span className={`rounded border px-2 py-1 font-mono text-[11px] font-semibold ${sev.text} ${sev.bg} ${sev.border}`}>
                    {inc.threat_score}/100 · {inc.severity}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-white/10 px-4 py-4">
                  {inc.nodes?.length > 0 && (
                    <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[11px] text-slate-400">
                      {inc.nodes.map((node, i) => (
                        <span key={i} className="flex items-center gap-2">
                          <span className="rounded border border-white/10 px-1.5 py-0.5">{node.camera_id}</span>
                          {i < inc.nodes.length - 1 && <ArrowRight size={11} className="text-slate-600" />}
                        </span>
                      ))}
                    </div>
                  )}

                  {inc.story_summary && (
                    <div className="mb-4 rounded bg-black/40 p-3 text-[12.5px] leading-relaxed text-slate-200 border border-white/5 flex items-start gap-2">
                      <Timer size={16} className="text-sky-400 mt-0.5 shrink-0" />
                      <div>{inc.story_summary}</div>
                    </div>
                  )}

                  {inc.score_breakdown?.length > 0 && (
                    <div className="mb-4">
                      <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Explainable Threat Factors ({inc.threat_score} pts)
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {inc.score_breakdown.map((f, i) => (
                          <div key={i} className="flex items-center justify-between rounded bg-black/40 px-3 py-1.5 text-[11.5px]">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-white">{f.factor}</span>
                              <span className="text-slate-500 text-[10.5px]">({f.reason})</span>
                            </div>
                            <span className="font-mono font-bold text-sky-400">+{f.points} pts</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3">
                    <div className="flex items-center gap-3">
                      <a
                        href={`/incidents/${inc.incident_id}/dossier`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-white/10 bg-black/40 text-[11px] text-slate-400 hover:text-white font-mono"
                      >
                        <FileText size={12} className="text-sky-400" />
                        <span>View Forensic Dossier</span>
                      </a>
                      <div className="font-mono text-[10px] text-slate-500 truncate max-w-xs">
                        HASH: {inc.cryptographic_hash?.slice(0, 16)}...
                      </div>
                    </div>

                    {!acknowledged && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAck(inc.incident_id, "CONFIRMED")}
                          disabled={busyId === inc.incident_id}
                          className="flex items-center gap-1.5 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-300 hover:bg-red-500/20"
                        >
                          <CircleCheck size={12} /> Confirm
                        </button>
                        <button
                          onClick={() => handleAck(inc.incident_id, "DISMISSED_FP")}
                          disabled={busyId === inc.incident_id}
                          className="flex items-center gap-1.5 rounded border border-white/10 bg-black/40 px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:text-white"
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
