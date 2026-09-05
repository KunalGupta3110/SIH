import { useEffect, useMemo, useState } from "react";
import { Shield, Radar, Layers, TrendingUp, ClipboardList, Link2, Wifi, WifiOff, Volume2, PlaySquare } from "lucide-react";

export const MODES = [
  { key: "cop", icon: Radar, label: "Common Operating Picture" },
  { key: "entities", icon: Layers, label: "Entities & Sensors" },
  { key: "tracks", icon: TrendingUp, label: "Track Board" },
  { key: "tasking", icon: ClipboardList, label: "Tasking Queue" },
  { key: "chain", icon: Link2, label: "Chain of Custody" },
];

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return t;
}

/**
 * Thin top segmented toolbar — replaces the old full-height sidebar. Only
 * the active mode shows a label; the rest are icon-only, same behavior as
 * the approved reference mockup.
 */
export default function TopBar({
  mode,
  setMode,
  edgeStatus,
  cameraCount,
  activeTrackCount,
  onSilence,
  onPopulateDemo,
  populatingDemo,
}) {
  const clock = useClock();
  const timeStr = useMemo(() => clock.toLocaleTimeString("en-IN", { hour12: false }), [clock]);

  const online = edgeStatus?.connection === "online";

  return (
    <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/70 to-transparent">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10">
          <Shield size={15} className="text-sky-400" />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white tracking-wide">IBVAP SENTINEL</div>
          <div className="font-mono text-[9.5px] text-slate-500">SIH-26187 · SECTOR 4B · COP</div>
        </div>
      </div>

      {/* mode switcher — segmented, not a full sidebar */}
      <div className="flex items-center gap-0.5 rounded-lg border border-white/10 bg-black/50 p-1 backdrop-blur-md">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.key;
          return (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.label}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11.5px] font-medium transition-colors ${
                active ? "bg-sky-500/20 text-sky-300" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon size={13} />
              {active && m.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 font-mono text-[10.5px] text-slate-400">
        <span className={`flex items-center gap-1.5 ${online ? "text-emerald-400" : "text-red-400"}`}>
          {online ? <Wifi size={12} /> : <WifiOff size={12} />}
          {online ? "LINK NOMINAL" : "LINK DEGRADED"}
        </span>
        <span>{cameraCount} SENSORS · {activeTrackCount} ACTIVE TRACK{activeTrackCount === 1 ? "" : "S"}</span>
        {onPopulateDemo && (
          <button
            onClick={onPopulateDemo}
            disabled={populatingDemo}
            title="Seed 5 real distinct scenario incidents via the backend's simulate-case endpoint"
            className="flex items-center gap-1.5 rounded border border-white/10 px-2 py-1 text-slate-400 hover:text-white hover:border-white/25 disabled:opacity-50"
          >
            <PlaySquare size={11} />
            {populatingDemo ? "SEEDING…" : "POPULATE DEMO SCENARIOS"}
          </button>
        )}
        <button
          onClick={onSilence}
          title="Silence siren"
          className="flex items-center gap-1 rounded border border-white/10 px-1.5 py-1 text-slate-400 hover:text-white hover:border-white/25"
        >
          <Volume2 size={11} />
        </button>
        <span className="text-white">{timeStr} IST</span>
      </div>
    </div>
  );
}
