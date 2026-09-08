import { Suspense, lazy, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AnimatePresence } from "framer-motion";
import { Map as MapIcon, AlertTriangle } from "lucide-react";

const TargetBiometricInspector = lazy(() => import("./TargetBiometricInspector.jsx"));
import {
  Scene,
  DetailPanel,
  DronePanel,
  CameraRail,
  BreachBanner,
  TacticalLoader,
  useCameras,
  useIsMobile,
  hasWebGL,
  SceneBoundary,
} from "./BorderTerrainModal.jsx";

/* ═══════════════════════════════════════════════════════════════════════
   BorderTerrainPanel — the console's Border Map view.
   Embedded (non-modal) build of the 3D sector terrain: live CCTV roster
   from GET /cameras/health, tap-to-focus + feed panel, breach preview.
   Replaces the former 2D SVG tactical map.
   ═══════════════════════════════════════════════════════════════════════ */

const CYAN = "#3fe0d6";
const RED = "#ff2233";

export default function BorderTerrainPanel() {
  const cameras = useCameras();
  const [selected, setSelected] = useState(null);
  const [drone, setDrone] = useState(false);
  const [breach, setBreach] = useState(false);
  const [webgl] = useState(() => hasWebGL());
  const lite = useIsMobile();
  const selCam = selected ? cameras.find((c) => c.id === selected.id) || selected : null;
  const live = cameras.filter((c) => c.status === "ONLINE" || c.status === "ALERT").length;
  const pickCam = (c) => { setDrone(false); setSelected(c); };
  const [bio, setBio] = useState(null);

  useEffect(() => {
    const onUav = () => { setSelected(null); setDrone(true); };
    const onBio = (e) => setBio(e.detail || {});
    window.addEventListener("uav-select", onUav);
    window.addEventListener("open-biometric", onBio);
    return () => {
      window.removeEventListener("uav-select", onUav);
      window.removeEventListener("open-biometric", onBio);
    };
  }, []);

  return (
    <div className="space-y-4 animate-fadeIn">
      <div className="p-4 rounded-2xl bg-[#000000] border border-white/12 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <MapIcon size={18} className="text-white" />
            <span>Sector 4-B · 3D Terrain Map &amp; Sensor Topology</span>
          </h2>
          <p className="text-xs text-white/55">
            {cameras.length} camera nodes · {live} live · geofenced corridor · live status from edge
          </p>
        </div>
        <button
          onClick={() => setBreach((b) => !b)}
          className="flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] font-bold tracking-widest transition-colors"
          style={{
            borderColor: breach ? RED : "rgba(255,255,255,0.25)",
            background: breach ? RED : "transparent",
            color: breach ? "#000" : "#fff",
          }}
        >
          <AlertTriangle size={12} />
          {breach ? "CLEAR BREACH" : "SIMULATE BREACH"}
        </button>
      </div>

      <div className="relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-white/12 bg-[#0a1017] md:h-[68vh]">
        {webgl ? (
          <SceneBoundary>
            <Suspense fallback={<TacticalLoader />}>
              <Canvas
                shadows={!lite}
                dpr={lite ? [1, 1.5] : [1, 2]}
                gl={{ antialias: !lite, powerPreference: lite ? "default" : "high-performance", failIfMajorPerformanceCaveat: false }}
                camera={{ position: [42, 34, 48], fov: 40, near: 0.1, far: 600 }}
                onPointerMissed={() => { setSelected(null); setDrone(false); }}
              >
                <Suspense fallback={null}>
                  <Scene cameras={cameras} selected={selected} breach={breach} onSelect={pickCam} />
                </Suspense>
              </Canvas>
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center font-mono text-[11px] uppercase leading-relaxed tracking-[0.2em] text-white/45">
            WebGL unavailable in this browser — camera roster still live in the rail
          </div>
        )}

        {/* HUD corner brackets */}
        <div className="pointer-events-none absolute inset-3 z-10">
          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map(
            (c) => (
              <span key={c} className={`absolute h-4 w-4 ${c}`} style={{ borderColor: `${CYAN}66` }} />
            )
          )}
        </div>

        <CameraRail
          cameras={cameras}
          selected={selected}
          onSelect={pickCam}
          className={
            lite
              ? "pointer-events-auto absolute inset-x-2 top-2 z-20"
              : "pointer-events-auto absolute left-4 top-4 z-20 w-52"
          }
        />

        <BreachBanner show={breach} />

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center font-mono text-[9px] uppercase tracking-[0.2em] text-white/35 sm:block">
          drag to orbit · scroll to zoom · tap a camera or the UAV for its feed
        </div>

        <AnimatePresence mode="wait">
          {selCam && (
            <DetailPanel
              key={selCam.id}
              cam={selCam}
              onClose={() => setSelected(null)}
              className="absolute right-4 top-4"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {drone && !selCam && (
            <DronePanel key="uav-01" onClose={() => setDrone(false)} className="absolute right-4 top-4" />
          )}
        </AnimatePresence>
      </div>

      <Suspense fallback={null}>
        <TargetBiometricInspector open={!!bio} subject={bio || {}} onClose={() => setBio(null)} />
      </Suspense>
    </div>
  );
}
