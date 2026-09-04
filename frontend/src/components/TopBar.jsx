import { useEffect, useMemo, useState } from "react";
import { Wifi, WifiOff, Play, Volume2 } from "lucide-react";

function useClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const i = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(i);
  }, []);
  return t;
}

export default function TopBar({ edgeStatus, edgeError, onSimulate, simulating, onSilence }) {
  const clock = useClock();
  const timeStr = useMemo(() => clock.toLocaleTimeString("en-IN", { hour12: false }), [clock]);

  const online = !edgeError && edgeStatus?.connection === "online";

  return (
    <div className="flex items-center justify-between border-b border-line bg-panel2 px-5 py-2.5">
      <div className="flex items-center gap-4 font-mono text-[11px] text-dim">
        <span className="flex items-center gap-1.5">
          {online ? <Wifi size={12} className="text-green" /> : <WifiOff size={12} className="text-red" />}
          {online ? "EDGE LINK NOMINAL" : "EDGE LINK OFFLINE"}
        </span>
        {edgeStatus && (
          <>
            <span>NODES: {edgeStatus.camera_count}</span>
            <span>EVENTS (24H): {edgeStatus.events_last_24h}</span>
            <span>UNREVIEWED: {edgeStatus.unreviewed_events}</span>
            {edgeStatus.hardware_simulation_mode && (
              <span className="text-amber">SIMULATION MODE</span>
            )}
          </>
        )}
        {edgeError && (
          <span className="text-red">
            Backend unreachable — start it with `python run_ecosystem.py`
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSimulate}
          disabled={simulating}
          className="flex items-center gap-1.5 rounded-[3px] border border-amber/40 bg-amber/10 px-3 py-1.5 text-[11.5px] font-medium text-amberLight transition-colors hover:bg-amber/20 disabled:opacity-50"
          title="Pushes a real CAM_ALPHA -> CAM_BRAVO handoff through the full pipeline"
        >
          <Play size={12} />
          {simulating ? "Simulating…" : "Simulate Handoff"}
        </button>
        <button
          onClick={onSilence}
          className="flex items-center gap-1.5 rounded-[3px] border border-line2 bg-panel px-3 py-1.5 text-[11.5px] font-medium text-dim transition-colors hover:text-ink2"
        >
          <Volume2 size={12} />
          Silence Siren
        </button>
        <div className="ml-2 font-mono text-[12px] tracking-wider text-dim">{timeStr} IST</div>
      </div>
    </div>
  );
}
