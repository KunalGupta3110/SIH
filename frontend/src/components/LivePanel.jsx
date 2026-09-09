import { useEffect, useState } from "react";
import { Camera, Activity, Info, VideoOff } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api, { API_BASE } from "../lib/api.js";

// Static identity only (name/type labels) — everything that can be wrong
// (status, fps, latency, heartbeat) comes from GET /cameras/health below and
// is never assumed here. CAM_WEBCAM is the one genuinely live source (the
// operator machine's own webcam); CAM_ALPHA..DELTA run real YOLOv8+ByteTrack
// against recorded footage, looped — labeled as such in the stream overlay
// core/vision/live_stream.py draws on every frame.
const CAMERA_IDENTITY = [
  { camera_id: "CAM_WEBCAM", type: "Live Device Webcam", isLive: true },
  { camera_id: "CAM_ALPHA", type: "Optical 4K PTZ (Recorded)", isLive: false },
  { camera_id: "CAM_BRAVO", type: "FLIR Thermal IR (Recorded)", isLive: false },
  { camera_id: "CAM_CHARLIE", type: "Optical Fixed 1080p (Recorded)", isLive: false },
  { camera_id: "CAM_DELTA", type: "Optical Fixed 1080p (Recorded)", isLive: false },
];

export default function LivePanel({ focusCameraId = null }) {
  const [health, setHealth] = useState({});
  const [healthError, setHealthError] = useState(null);
  const [streamFailed, setStreamFailed] = useState({});

  useEffect(() => {
    let cancelled = false;
    const fetchHealth = async () => {
      try {
        const res = await api.getCameraHealth();
        if (cancelled) return;
        const byId = {};
        for (const cam of res?.cameras || []) byId[cam.camera_id] = cam;
        setHealth(byId);
        setHealthError(null);
      } catch (e) {
        if (!cancelled) setHealthError(e.message || "Unreachable");
      }
    };

    fetchHealth();
    const interval = setInterval(fetchHealth, 4000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-col gap-5">
      <SectionHeader
        title="Live Video Operations"
        sub="Real YOLOv8 + ByteTrack inference — one live device webcam, four recorded border-camera feeds."
      />

      {healthError && (
        <div className="flex items-center gap-2.5 rounded-[4px] border border-red/40 bg-red/10 px-4 py-3 text-[12px] text-red">
          <Info size={15} className="shrink-0" />
          <span>Couldn't reach the backend for camera telemetry ({healthError}). Streams below will show NO SIGNAL until it's back.</span>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CAMERA_IDENTITY.map((identity) => {
          const cam = health[identity.camera_id];
          const status = cam?.status || "CONNECTING";
          const isFault = status === "FAULT";
          const isOffline = status === "OFFLINE";
          const isConnecting = status === "CONNECTING";
          const isFrozen = status === "FROZEN";
          const isFocused = focusCameraId && identity.camera_id === focusCameraId;
          const streamBroken = streamFailed[identity.camera_id];

          let statusClass = "text-green border-green/30 bg-green/10";
          if (isConnecting) statusClass = "text-dim border-line2 bg-panel2";
          if (isFault || isFrozen) statusClass = "text-amber border-amber/40 bg-amber/10";
          if (isOffline) statusClass = "text-red border-red/40 bg-red/10";

          const showNoSignal = isOffline || streamBroken;

          return (
            <div
              key={identity.camera_id}
              className={`rounded-[4px] border bg-panel p-4 flex flex-col justify-between transition-shadow ${
                isFocused ? "border-amber shadow-[0_0_0_1px_rgba(232,163,61,0.4)]" : "border-line"
              }`}
            >
              {isFocused && (
                <div className="mb-2.5 -mt-1 flex items-center gap-1.5 font-mono text-[10px] font-semibold text-amber">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber animate-pulse" />
                  DEEP-LINKED CAMERA
                </div>
              )}

              <div className="flex items-center justify-between border-b border-line pb-2.5 mb-3 font-mono text-[11.5px]">
                <div className="flex items-center gap-2">
                  <Camera size={14} className={identity.isLive ? "text-green" : "text-amber"} />
                  <span className="font-bold text-ink">{identity.camera_id}</span>
                  <span className="text-dim2 text-[10.5px]">· {cam?.name || identity.type}</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${statusClass}`}>{status}</span>
              </div>

              {/* Real MJPEG feed, or an honest NO SIGNAL state — never a static fake frame. */}
              <div className="w-full aspect-video overflow-hidden rounded bg-[#080B10] border border-line2/40 relative">
                {showNoSignal ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
                    <VideoOff size={24} className="text-dim2/50" />
                    <div className="font-mono text-[11px] text-dim">NO SIGNAL</div>
                    <div className="font-mono text-[9.5px] text-dim2 px-4">{cam?.details || "Source unavailable"}</div>
                  </div>
                ) : (
                  <img
                    src={`${API_BASE}/stream/${identity.camera_id}`}
                    alt={`${identity.camera_id} live feed`}
                    className="h-full w-full object-cover"
                    onError={() => setStreamFailed((prev) => ({ ...prev, [identity.camera_id]: true }))}
                    onLoad={() => setStreamFailed((prev) => ({ ...prev, [identity.camera_id]: false }))}
                  />
                )}
              </div>

              <div className="mt-3 flex items-center justify-between font-mono text-[10.5px] text-dim border-t border-line/50 pt-2.5">
                <span className="flex items-center gap-1.5">
                  <Activity size={12} className={isFault || isOffline ? "text-amber" : "text-green"} />
                  <span>{cam?.fps ? `${cam.fps.toFixed(1)} FPS` : "No frames yet"}</span>
                </span>
                <span>
                  Heartbeat: {cam?.seconds_since_heartbeat !== undefined ? `${cam.seconds_since_heartbeat.toFixed(1)}s ago` : "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
