import { useState } from "react";
import { X, Clock, ChevronRight, Video, MapPin } from "lucide-react";
import api from "../lib/api.js";

const DISMISS_REASONS = [
  { id: "vegetation", label: "Vegetation / Tree Motion" },
  { id: "animal", label: "Animal / Wildlife" },
  { id: "weather", label: "Weather / Fog / Dust" },
  { id: "camera_noise", label: "Camera Glare / Sensor Noise" },
  { id: "other", label: "Other False Positive" },
];

const SEVERITY_COLOR = {
  CRITICAL: { text: "text-red-400", border: "border-red-500/20", chip: "border-red-500/40 bg-red-500/10 text-red-300" },
  WARNING: { text: "text-amber-400", border: "border-amber-500/20", chip: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  INFO: { text: "text-sky-400", border: "border-sky-500/20", chip: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
};

/**
 * Floating right panel. Replaces the old separate "Correlated Incidents"
 * and "Operator Triage" full pages for the case of a single selected
 * track — this is where its real score breakdown, real event timeline,
 * and the real acknowledge action all live now.
 */
export default function EntityDetailPanel({ kind, entity, onClose, onAcknowledged }) {
  const [busy, setBusy] = useState(false);
  const [showReasons, setShowReasons] = useState(false);
  const [reason, setReason] = useState("vegetation");

  if (!entity) return null;

  if (kind === "SENSOR") {
    return (
      <div className="absolute right-4 top-20 bottom-4 w-80 rounded-lg border border-white/10 bg-black/60 backdrop-blur-md flex flex-col overflow-hidden z-10">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Video size={14} className="text-sky-400" />
            <div className="font-mono text-[12px] text-white">{entity.camera_id}</div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={14} /></button>
        </div>
        <div className="px-4 py-4 space-y-3 text-[11.5px]">
          <div>
            <div className="text-slate-500 text-[10.5px] uppercase tracking-wide">Name</div>
            <div className="text-slate-200">{entity.name || entity.camera_id}</div>
          </div>
          <div className="flex items-start gap-1.5">
            <MapPin size={12} className="text-slate-500 mt-0.5 shrink-0" />
            <div>
              <div className="text-slate-500 text-[10.5px] uppercase tracking-wide">Location</div>
              <div className="text-slate-200">{entity.location || "Border Sector"}</div>
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10.5px] uppercase tracking-wide">Status</div>
            <div className={entity.status === "ONLINE" ? "text-emerald-400 font-semibold" : entity.status === "FAULT" ? "text-red-400 font-semibold" : "text-amber-400 font-semibold"}>
              {entity.status}
            </div>
          </div>
          <div>
            <div className="text-slate-500 text-[10.5px] uppercase tracking-wide">Detail</div>
            <div className="text-slate-300">{entity.details}</div>
          </div>
        </div>
      </div>
    );
  }

  // kind === "TRACK"
  const inc = entity;
  const sev = SEVERITY_COLOR[inc.severity] || SEVERITY_COLOR.INFO;
  const acknowledged = inc.status === "CONFIRMED" || inc.status === "DISMISSED_FP";

  async function handleConfirm() {
    setBusy(true);
    try {
      await api.acknowledgeIncident(inc.incident_id, "CONFIRMED");
      onAcknowledged?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  async function handleDismiss() {
    setBusy(true);
    try {
      await api.acknowledgeIncident(inc.incident_id, "DISMISSED_FP", reason);
      setShowReasons(false);
      onAcknowledged?.();
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`absolute right-4 top-20 bottom-4 w-80 rounded-lg border ${sev.border} bg-black/60 backdrop-blur-md flex flex-col overflow-hidden z-10`}>
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <div className="font-mono text-[12px] text-white">{inc.incident_id}</div>
          <div className="text-[10.5px] text-slate-500">{inc.target_class || "unknown"} · {((inc.confidence ?? 0) * 100).toFixed(0)}% confidence</div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={14} /></button>
      </div>

      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-baseline gap-2">
          <span className={`font-mono text-3xl font-semibold ${sev.text}`}>{inc.threat_score}</span>
          <span className="text-slate-500 text-sm">/100</span>
          <span className={`ml-auto rounded border px-2 py-0.5 font-mono text-[10px] ${sev.chip}`}>{inc.severity}</span>
        </div>
        <div className="mt-3 space-y-1.5">
          {(inc.score_breakdown || []).map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-[11.5px]">
              <span className="w-8 text-right font-mono text-sky-400">+{f.points}</span>
              <span className="text-slate-300">{f.factor}</span>
            </div>
          ))}
          {(!inc.score_breakdown || inc.score_breakdown.length === 0) && (
            <div className="text-[11px] text-slate-500">No scoring factors recorded.</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-slate-500">
          <Clock size={11} /> Event Timeline
        </div>
        <div className="space-y-3 border-l border-white/10 pl-3">
          {(inc.nodes || []).map((n, i) => (
            <div key={i} className="relative">
              <span className="absolute -left-[15px] top-1 h-2 w-2 rounded-full bg-sky-400" />
              <div className="font-mono text-[10px] text-slate-500">{n.timestamp_iso ? new Date(n.timestamp_iso).toLocaleTimeString("en-IN", { hour12: false }) : "—"}</div>
              <div className="text-[11.5px] text-slate-300">{n.camera_id} · {n.event_type} — {n.rule_detail}</div>
            </div>
          ))}
          {(!inc.nodes || inc.nodes.length === 0) && (
            <div className="text-[11px] text-slate-500">No events recorded for this track.</div>
          )}
        </div>

        {inc.cryptographic_hash && (
          <div className="mt-4 font-mono text-[9.5px] text-slate-500 break-all">
            SHA-256: {inc.cryptographic_hash}
          </div>
        )}
      </div>

      {!acknowledged && !showReasons && (
        <div className="flex border-t border-white/10">
          <button
            onClick={handleConfirm}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 bg-red-500/10 py-3 text-[12px] font-medium text-red-300 hover:bg-red-500/20 disabled:opacity-50"
          >
            Task: Confirm &amp; Escalate <ChevronRight size={13} />
          </button>
          <button
            onClick={() => setShowReasons(true)}
            disabled={busy}
            className="flex items-center justify-center px-4 border-l border-white/10 text-[12px] text-slate-400 hover:text-white disabled:opacity-50"
          >
            Dismiss…
          </button>
        </div>
      )}

      {!acknowledged && showReasons && (
        <div className="border-t border-white/10 p-3">
          <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Root cause (site calibration)</div>
          <div className="flex flex-col gap-1 mb-2">
            {DISMISS_REASONS.map((r) => (
              <label key={r.id} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[11px] cursor-pointer ${reason === r.id ? "bg-sky-500/10 text-white" : "text-slate-400"}`}>
                <input type="radio" name="reason" checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-sky-500" />
                {r.label}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowReasons(false)} className="flex-1 rounded border border-white/10 py-1.5 text-[11px] text-slate-400 hover:text-white">Cancel</button>
            <button onClick={handleDismiss} disabled={busy} className="flex-1 rounded bg-sky-500/20 border border-sky-500/40 py-1.5 text-[11px] text-sky-300 font-medium hover:bg-sky-500/30 disabled:opacity-50">Confirm Dismiss</button>
          </div>
        </div>
      )}

      {acknowledged && (
        <div className="border-t border-white/10 px-4 py-3 text-center text-[11px] font-mono text-slate-500">
          {inc.status}{inc.dismiss_reason ? ` · ${inc.dismiss_reason}` : ""}
        </div>
      )}
    </div>
  );
}
