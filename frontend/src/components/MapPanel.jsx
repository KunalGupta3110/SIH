import { Video, Circle } from "lucide-react";
import { positionForCamera, positionForIncident } from "../lib/mapGeometry.js";

const CAMERA_DOT_COLOR = {
  ONLINE: "border-sky-400 bg-sky-500/20 text-sky-300",
  STALE: "border-amber-400 bg-amber-500/20 text-amber-300",
  OFFLINE: "border-slate-500 bg-slate-500/15 text-slate-400",
  FAULT: "border-red-400 bg-red-500/20 text-red-300",
};

const TRACK_DOT_COLOR = {
  CRITICAL: "border-red-400 bg-red-500/25 text-red-200",
  WARNING: "border-amber-400 bg-amber-500/20 text-amber-200",
  INFO: "border-sky-400 bg-sky-500/20 text-sky-200",
};

/**
 * The Common Operating Picture map — full-bleed backdrop, not a boxed panel.
 * Geometry (camera layout, border line, red-zone corridor, patrol road) is
 * the same flat 2D schematic the old boxed MapPanel used; only the frame
 * changed, from a contained SVG card to the whole viewport.
 */
export default function MapPanel({ cameraHealth = [], incidents = [], selectedId, onSelect }) {
  return (
    <div className="absolute inset-0">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <pattern id="cop-grid" width="4" height="4" patternUnits="userSpaceOnUse">
            <path d="M 4 0 L 0 0 0 4" fill="none" stroke="#0d3050" strokeWidth="0.08" />
          </pattern>
          <radialGradient id="cop-vign" cx="50%" cy="45%" r="75%">
            <stop offset="0%" stopColor="#0a1420" stopOpacity="0" />
            <stop offset="100%" stopColor="#020408" stopOpacity="0.9" />
          </radialGradient>
        </defs>
        <rect width="100" height="100" fill="#050b12" />
        <rect width="100" height="100" fill="url(#cop-grid)" />

        {/* International border line */}
        <line x1="4" y1="18" x2="96" y2="18" stroke="#ef4444" strokeWidth="0.25" strokeDasharray="1 0.6" />
        <text x="5" y="15.5" fill="#ef4444" fontSize="2" fontFamily="monospace" fontWeight="bold">
          INTERNATIONAL BORDER LINE (ZERO LINE)
        </text>

        {/* Restricted red-zone corridor */}
        <rect x="4" y="42" width="92" height="16" fill="rgba(239,68,68,0.07)" stroke="#ef4444" strokeWidth="0.12" strokeDasharray="0.6 0.5" />
        <text x="5" y="53" fill="#f87171" fontSize="1.7" fontFamily="monospace">
          100m RESTRICTED RED ZONE
        </text>

        {/* Patrol corridor road */}
        <line x1="4" y1="82" x2="96" y2="82" stroke="#334155" strokeWidth="1.4" />
        <line x1="4" y1="82" x2="96" y2="82" stroke="#eab308" strokeWidth="0.15" strokeDasharray="1.2 0.8" />
        <text x="5" y="86.5" fill="#64748b" fontSize="1.7" fontFamily="monospace">
          TACTICAL PATROL CORRIDOR ROAD
        </text>

        {/* Inter-camera transit corridor markers, drawn between consecutive
            known cameras so the "predicted handoff window" reads on the map
            itself, not just in a side panel. */}
        <path d="M 18 50 L 36 50" stroke="#38bdf8" strokeWidth="0.25" strokeDasharray="0.8 0.6" opacity="0.6" />
        <path d="M 44 50 L 61 50" stroke="#38bdf8" strokeWidth="0.25" strokeDasharray="0.8 0.6" opacity="0.6" />
        <path d="M 69 50 L 82 50" stroke="#38bdf8" strokeWidth="0.25" strokeDasharray="0.8 0.6" opacity="0.6" />

        <rect width="100" height="100" fill="url(#cop-vign)" />
      </svg>

      {/* Camera / sensor entities */}
      {cameraHealth.map((cam) => {
        const pos = positionForCamera(cam.camera_id);
        const colorClass = CAMERA_DOT_COLOR[cam.status] || CAMERA_DOT_COLOR.OFFLINE;
        const isSelected = selectedId === cam.camera_id;
        return (
          <button
            key={cam.camera_id}
            onClick={() => onSelect?.(cam.camera_id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div className={`relative flex h-7 w-7 items-center justify-center rounded-full border ${colorClass} ${isSelected ? "ring-2 ring-white/60" : ""}`}>
              <Video size={13} />
            </div>
            <div className="mt-1 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 backdrop-blur-sm">
              {cam.camera_id}
            </div>
          </button>
        );
      })}

      {/* Track / incident entities */}
      {incidents.map((inc) => {
        const pos = positionForIncident(inc);
        const sev = inc.severity || "INFO";
        const colorClass = TRACK_DOT_COLOR[sev] || TRACK_DOT_COLOR.INFO;
        const isSelected = selectedId === inc.incident_id;
        return (
          <button
            key={inc.incident_id}
            onClick={() => onSelect?.(inc.incident_id)}
            className="absolute -translate-x-1/2 -translate-y-1/2 group"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div className={`relative flex h-7 w-7 items-center justify-center rounded-full border ${colorClass} ${isSelected ? "ring-2 ring-white/60" : ""}`}>
              <Circle size={8} className="fill-current" />
              {sev === "CRITICAL" && <span className="absolute inset-0 rounded-full border border-red-400 animate-ping" />}
            </div>
            <div className="mt-1 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] text-slate-300 backdrop-blur-sm">
              {inc.incident_id}
            </div>
          </button>
        );
      })}
    </div>
  );
}
