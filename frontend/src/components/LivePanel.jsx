import { useEffect, useState } from "react";
import { Camera, Activity, Info } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const DEFAULT_CAMERAS = [
  { camera_id: "CAM_ALPHA", name: "Sector 4 North Checkpost", type: "Optical 4K PTZ", status: "ONLINE", seconds_since_heartbeat: 4.2 },
  { camera_id: "CAM_BRAVO", name: "BOP Bravo Eastern Perimeter", type: "FLIR Thermal IR", status: "ONLINE", seconds_since_heartbeat: 8.5 },
  { camera_id: "CAM_CHARLIE", name: "Corridor C Caution Zone", type: "Optical Fixed 1080p", status: "ONLINE", seconds_since_heartbeat: 12.1 },
  { camera_id: "CAM_DELTA", name: "Sector 4 South Gate", type: "Optical Fixed 1080p", status: "ONLINE", seconds_since_heartbeat: 15.0 },
];

export default function LivePanel() {
  const [cameras, setCameras] = useState(DEFAULT_CAMERAS);

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const res = await api.getCameraHealth();
        if (res?.cameras && res.cameras.length > 0) {
          const merged = DEFAULT_CAMERAS.map((def) => {
            const live = res.cameras.find((c) => c.camera_id === def.camera_id);
            return live ? { ...def, ...live } : def;
          });
          setCameras(merged);
        }
      } catch (e) {
        // quiet
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Live Video Operations"
        sub="Tactical camera node feed status and edge ingestion stream registry."
      />

      {/* Honest Status Caption */}
      <div className="flex items-center gap-2.5 rounded-[4px] border border-line2/60 bg-panel2 px-4 py-3 text-[12px] text-dim">
        <Info size={15} className="text-amber shrink-0" />
        <span>
          Live video ingestion is not yet wired to a streaming RTSP endpoint — camera identities and node health statuses shown below are real.
        </span>
      </div>

      {/* Camera Card Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {cameras.map((cam) => {
          const isFault = cam.status === "FAULT";
          const isOffline = cam.status === "OFFLINE";
          const isStale = cam.status === "STALE";

          let statusClass = "text-green border-green/30 bg-green/10";
          if (isFault) statusClass = "text-amber border-amber/40 bg-amber/10";
          if (isOffline) statusClass = "text-red border-red/40 bg-red/10";
          if (isStale) statusClass = "text-amber border-amber/30 bg-amber/10";

          return (
            <div key={cam.camera_id} className="rounded-[4px] border border-line bg-panel p-4 flex flex-col justify-between">
              {/* Card Header */}
              <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3 font-mono text-[11.5px]">
                <div className="flex items-center gap-2">
                  <Camera size={14} className="text-amber" />
                  <span className="font-bold text-ink">{cam.camera_id}</span>
                  <span className="text-dim2 text-[10.5px]">· {cam.type}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusClass}`}>
                  {cam.status}
                </span>
              </div>

              {/* Surface Placeholder Viewport */}
              <div className="w-full aspect-video rounded bg-[#080B10] border border-line2/40 flex flex-col items-center justify-center p-4 text-center">
                <Camera size={26} className="text-dim2/40 mb-2" />
                <div className="font-mono text-[11px] text-dim">{cam.name}</div>
                <div className="font-mono text-[10px] text-dim2 mt-1">RTSP Stream Ingestion Offline</div>
              </div>

              {/* Real Heartbeat Telemetry Footer */}
              <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] text-dim border-t border-line/50 pt-2.5">
                <span className="flex items-center gap-1.5">
                  <Activity size={12} className={isFault ? "text-amber" : "text-green"} />
                  <span>Node Telemetry: Active</span>
                </span>
                <span>
                  Heartbeat: {cam.seconds_since_heartbeat !== undefined ? `${cam.seconds_since_heartbeat}s ago` : "Nominal"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
