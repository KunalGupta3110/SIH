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
  SectorSwitcher,
  useCameras,
  useIsMobile,
  hasWebGL,
  SceneBoundary,
  useBreachSim,
  clearTerrainCache,
} from "./BorderTerrainModal.jsx";
import { getSector, DEFAULT_SECTOR_ID } from "../../config/terrains.js";

/* ═══════════════════════════════════════════════════════════════════════
   BorderTerrainPanel — the console's Border Map view.
   Embedded (non-modal) build of the 3D sector terrain: live CCTV roster
   from GET /cameras/health, tap-to-focus + feed panel, breach preview.
   Replaces the former 2D SVG tactical map.
   ═══════════════════════════════════════════════════════════════════════ */

const CYAN = "#3ff09a";
const RED = "#ff2233";

export default function BorderTerrainPanel() {
  const [sectorId, setSectorId] = useState(DEFAULT_SECTOR_ID);
  const sector = getSector(sectorId);
  const cameras = useCameras(sector);
  const [selected, setSelected] = useState(null);
  const [drone, setDrone] = useState(false);
  const [loadingSector, setLoadingSector] = useState(false);
  const [webgl] = useState(() => hasWebGL());
  const lite = useIsMobile();
  const selCam = selected ? cameras.find((c) => c.id === selected.id) || selected : null;
  const live = cameras.filter((c) => c.status === "ONLINE" || c.status === "ALERT").length;
  const pickCam = (c) => { setDrone(false); setSelected(c); };
  const recenter = () => setSelected((s) => (s ? { ...s } : s));
  const [bio, setBio] = useState(null);

  const { breach, breachCamId, incidents, simulate, acknowledge, clear } = useBreachSim(cameras, sector);

  const switchSector = (id) => {
    if (id === sectorId) return;
    setSelected(null);
    setDrone(false);
    setLoadingSector(true);
    setSectorId(id);
  };

  useEffect(() => () => clearTerrainCache(), []);

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
            <span>{sector.sectorCode} · {sector.name} · 3D Terrain &amp; Sensor Topology</span>
          </h2>
          <p className="text-xs text-white/55">
            {cameras.length} camera nodes · {live} live · {sector.agency} · status from edge / simulation
          </p>
        </div>
        <div className="flex items-center gap-2">
          {incidents.length > 0 && (
            <span className="flex items-center gap-1.5 border border-[#3ff09a]/30 px-2 py-1 font-mono text-[10px] text-[#3ff09a]/80">
              {incidents.length} dispatched
            </span>
          )}
          <button
            onClick={() => (breach ? clear() : simulate())}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 font-hud text-[12px] font-semibold transition-colors"
            style={{
              borderColor: breach ? RED : "rgba(255,255,255,0.25)",
              background: breach ? RED : "transparent",
              color: breach ? "#000" : "#fff",
            }}
          >
            <AlertTriangle size={12} />
            {breach ? "Clear alert" : "Simulate breach"}
          </button>
        </div>
      </div>

      <div className="keep-dark relative h-[60vh] min-h-[360px] w-full overflow-hidden rounded-2xl border border-white/12 bg-[#0a1017] md:h-[68vh]">
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
                  <Scene
                    sector={sector}
                    cameras={cameras}
                    selected={selected}
                    breach={breach}
                    breachCamId={breachCamId}
                    onSelect={pickCam}
                    onTerrainReady={() => setLoadingSector(false)}
                  />
                </Suspense>
              </Canvas>
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center font-hud text-[13px] leading-relaxed text-white/45">
            WebGL is unavailable in this browser — the camera roster is still live in the rail
          </div>
        )}

        <SectorSwitcher
          active={sectorId}
          onSelect={switchSector}
          className="pointer-events-auto absolute left-1/2 top-3 z-40 -translate-x-1/2"
        />

        {loadingSector && (
          <TacticalLoader label={`RECONFIGURING ${sector.name.toUpperCase()} · ${sector.sectorCode.toUpperCase()}...`} />
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
              ? "pointer-events-auto absolute inset-x-2 top-16 z-20"
              : "pointer-events-auto absolute left-4 top-14 z-20 w-52"
          }
        />

        <BreachBanner show={breach} sector={sector} camId={breachCamId} onAcknowledge={() => acknowledge()} />

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center font-hud text-[11px] text-white/35 sm:block">
          Drag to orbit · scroll to zoom · tap a camera or the UAV for its feed
        </div>

        <AnimatePresence mode="wait">
          {selCam && (
            <DetailPanel
              key={selCam.id}
              cam={selCam}
              sector={sector}
              onClose={() => setSelected(null)}
              onRecenter={recenter}
              onAcknowledge={(id) => acknowledge(id)}
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
