import { useMemo, useState } from "react";
import { Search, MapPin, Video, Circle } from "lucide-react";

const CAMERA_STATUS_DOT = {
  ONLINE: "bg-emerald-400",
  STALE: "bg-amber-400",
  OFFLINE: "bg-slate-500",
  FAULT: "bg-red-400",
};

const TRACK_STATUS_DOT = {
  CRITICAL: "bg-red-400",
  WARNING: "bg-amber-400",
  INFO: "bg-sky-400",
};

function buildEntities(cameraHealth, incidents) {
  const sensors = (cameraHealth || []).map((c) => ({
    id: c.camera_id,
    kind: "SENSOR",
    dot: CAMERA_STATUS_DOT[c.status] || CAMERA_STATUS_DOT.OFFLINE,
    title: c.camera_id,
    sub: `${c.name || c.camera_id} · ${c.location || "Border Sector"} · ${c.status}`,
  }));
  const tracks = (incidents || []).map((i) => ({
    id: i.incident_id,
    kind: "TRACK",
    dot: TRACK_STATUS_DOT[i.severity] || TRACK_STATUS_DOT.INFO,
    title: i.incident_id,
    sub: `${i.target_class || "unknown"} · ${(i.cameras_involved || []).join(" → ")} · ${i.threat_score}/100`,
  }));
  return [...tracks, ...sensors];
}

/**
 * Entities list — used both as the floating left glass panel in COP mode
 * (variant="floating") and as the full "Entities & Sensors" mode page
 * (variant="full"), so there's exactly one place this list is built from
 * real /cameras/health + /incidents/correlated data.
 */
export default function EntitiesPanel({ cameraHealth = [], incidents = [], selectedId, onSelect, variant = "floating" }) {
  const [filter, setFilter] = useState("");
  const entities = useMemo(() => buildEntities(cameraHealth, incidents), [cameraHealth, incidents]);
  const filtered = useMemo(
    () => entities.filter((e) => e.title.toLowerCase().includes(filter.toLowerCase()) || e.sub.toLowerCase().includes(filter.toLowerCase())),
    [entities, filter]
  );

  const listItem = (e) => (
    <button
      key={e.id}
      onClick={() => onSelect?.(e.id)}
      className={`flex w-full items-start gap-2.5 border-b border-white/5 px-3.5 py-3 text-left transition-colors ${
        selectedId === e.id ? "bg-sky-500/10" : "hover:bg-white/5"
      }`}
    >
      <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${e.dot}`} />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-mono text-[11.5px] text-white">
          {e.kind === "SENSOR" ? <Video size={11} className="text-slate-500" /> : <Circle size={7} className="fill-current text-slate-500" />}
          {e.title}
          <span className="text-[9px] text-slate-500">{e.kind}</span>
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-slate-400">{e.sub}</div>
      </div>
    </button>
  );

  if (variant === "full") {
    return (
      <div className="h-full overflow-y-auto p-6">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold text-white">Entities &amp; Sensors</h2>
          <p className="mt-0.5 text-[12px] text-slate-500">Every known camera node and every tracked object, in one list — real data from /cameras/health and /incidents/correlated.</p>
        </div>
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 max-w-md">
          <Search size={13} className="text-slate-500" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter entities…"
            className="flex-1 bg-transparent text-[12px] text-slate-200 placeholder:text-slate-600 outline-none"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => onSelect?.(e.id)}
              className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-left transition-colors ${
                selectedId === e.id ? "border-sky-500/40 bg-sky-500/10" : "border-white/10 bg-black/40 hover:bg-white/5"
              }`}
            >
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${e.dot}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-mono text-[12px] text-white">
                  {e.kind === "SENSOR" ? <Video size={12} className="text-slate-500" /> : <Circle size={8} className="fill-current text-slate-500" />}
                  {e.title}
                  <span className="text-[9px] text-slate-500">{e.kind}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{e.sub}</div>
              </div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full py-10 text-center text-[12px] text-slate-500">No entities match "{filter}".</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-4 top-20 bottom-4 w-64 rounded-lg border border-white/10 bg-black/55 backdrop-blur-md flex flex-col overflow-hidden z-10">
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
        <Search size={13} className="text-slate-500" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter entities…"
          className="flex-1 bg-transparent text-[11px] text-slate-200 placeholder:text-slate-600 outline-none"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map(listItem)}
        {filtered.length === 0 && (
          <div className="px-3.5 py-6 text-center text-[11px] text-slate-500">No entities match "{filter}".</div>
        )}
      </div>
      <div className="border-t border-white/10 px-3.5 py-2.5 font-mono text-[9.5px] text-slate-500 flex items-center gap-1.5">
        <MapPin size={10} /> Sector 4B · North Corridor
      </div>
    </div>
  );
}
