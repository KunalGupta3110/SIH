import { useEffect, useMemo, useState } from "react";
import { Wifi, WifiOff, Play, Volume2, Activity } from "lucide-react";
import api from "../lib/api.js";

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

  const [netStatus, setNetStatus] = useState({ simulated_down: false, queued_events_count: 0 });
  const [camsHealth, setCamsHealth] = useState([]);
  const [showHealthMenu, setShowHealthMenu] = useState(false);
  const [togglingNet, setTogglingNet] = useState(false);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const net = await api.getNetworkStatus();
        if (net) setNetStatus(net);
        const cams = await api.getCameraHealth();
        if (cams?.cameras) setCamsHealth(cams.cameras);
      } catch (e) {
        // quiet
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleToggleNetwork = async () => {
    setTogglingNet(true);
    try {
      const res = await api.toggleNetwork();
      if (res) setNetStatus(res);
    } catch (e) {
      console.error(e);
    } finally {
      setTogglingNet(false);
    }
  };

  const handleFaultToggle = async (camId, currentStatus) => {
    try {
      if (currentStatus === "FAULT") {
        await api.clearCameraFault(camId);
      } else {
        await api.simulateCameraFault(camId);
      }
      const cams = await api.getCameraHealth();
      if (cams?.cameras) setCamsHealth(cams.cameras);
    } catch (e) {
      console.error(e);
    }
  };

  const isSimulatedOffline = netStatus.simulated_down;
  const faultCount = camsHealth.filter((c) => c.status === "FAULT").length;

  return (
    <div className="flex flex-wrap items-center justify-between border-b border-line bg-panel2 px-5 py-2.5 gap-2">
      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-dim">
        {/* Network State & Toggle */}
        <button
          onClick={handleToggleNetwork}
          disabled={togglingNet}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-mono text-[11px] transition-all ${
            isSimulatedOffline
              ? "border-red/60 bg-red/20 text-red font-bold animate-pulse"
              : "border-green/40 bg-green/10 text-green"
          }`}
          title="Click to simulate connection loss & reconnect-and-sync queue buffering"
        >
          {isSimulatedOffline ? <WifiOff size={12} /> : <Wifi size={12} />}
          {isSimulatedOffline
            ? `SIM OFFLINE (BUFFERING: ${netStatus.queued_events_count || 0})`
            : "NETWORK: ONLINE (SYNCED)"}
        </button>

        {/* Camera Health Status Badge */}
        <div className="relative">
          <button
            onClick={() => setShowHealthMenu(!showHealthMenu)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] border font-mono text-[11px] transition-all ${
              faultCount > 0
                ? "border-amber/60 bg-amber/20 text-amber font-bold"
                : "border-line2 bg-panel text-dim hover:text-ink"
            }`}
          >
            <Activity size={12} className={faultCount > 0 ? "text-amber" : "text-green"} />
            <span>
              CAM HEALTH: {camsHealth.length - faultCount}/{camsHealth.length || 4} ACTIVE
              {faultCount > 0 && ` (${faultCount} FAULT)`}
            </span>
          </button>

          {showHealthMenu && (
            <div className="absolute left-0 top-8 z-50 w-72 rounded-[4px] border border-line bg-panel p-3 shadow-xl">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-dim">
                Tactical Node Heartbeats
              </div>
              <div className="flex flex-col gap-1.5">
                {camsHealth.map((cam) => (
                  <div
                    key={cam.camera_id}
                    className="flex items-center justify-between rounded-[3px] bg-panel2 p-1.5 text-[11px]"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-ink">{cam.camera_id}</span>
                      <span className="text-[9.5px] text-dim2">
                        {cam.status} · {cam.seconds_since_heartbeat}s ago
                      </span>
                    </div>
                    <button
                      onClick={() => handleFaultToggle(cam.camera_id, cam.status)}
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        cam.status === "FAULT"
                          ? "border-green/40 bg-green/20 text-green"
                          : "border-amber/40 bg-amber/20 text-amber hover:bg-amber/30"
                      }`}
                    >
                      {cam.status === "FAULT" ? "Clear Fault" : "Simulate Fault"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {edgeStatus && (
          <>
            <span>EVENTS (24H): {edgeStatus.events_last_24h}</span>
            <span>UNREVIEWED: {edgeStatus.unreviewed_events}</span>
            {edgeStatus.hardware_simulation_mode && (
              <span className="text-amber">SIMULATION MODE</span>
            )}
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={onSimulate}
          disabled={simulating}
          className="flex items-center gap-1.5 rounded-[3px] border border-amber/40 bg-amber/10 px-3 py-1.5 text-[11.5px] font-medium text-amberLight transition-colors hover:bg-amber/20 disabled:opacity-50"
          title="Pushes a real CAM_ALPHA -> CAM_BRAVO handoff through topological transit window"
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
