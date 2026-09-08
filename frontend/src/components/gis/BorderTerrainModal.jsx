import {
  Component,
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Line, useGLTF } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import gsap from "gsap";
import { X, Radio, MapPin, Activity, ExternalLink, AlertTriangle, Video } from "lucide-react";
import api from "../../lib/api.js";

// biometric Re-ID dossier drawer — split (its own hologram canvas), only
// loaded when a flagged target is opened.
const TargetBiometricInspector = lazy(() => import("./TargetBiometricInspector.jsx"));

/* ═══════════════════════════════════════════════════════════════════════
   BorderTerrainModal — tap-to-open full-colour 3D tactical diorama of the
   sector. Real mountain terrain (glacier_national_park GLB) and 5
   interactive CCTV nodes planted on the surface via down-raycasts. Tap a
   camera → gsap fly-to + live feed + telemetry. A Re-ID spline contours
   the ridline between the tracked cameras.
   ═══════════════════════════════════════════════════════════════════════ */

const CYAN = "#3fe0d6";
const RED = "#ff2233";

// diorama footprint (world units) + how far the tactical layout is spread
const WORLD = 58;
const SPREAD = 2.4;
const Y_EXAG = 2.4; // vertical exaggeration — the source DEM is very flat

const MODELS = {
  terrain: "/models/terrain_map.glb",
  cctv: "/models/cctv_camera.glb",
  drone: "/models/drone.glb",
};
useGLTF.preload(MODELS.terrain);
useGLTF.preload(MODELS.cctv);
useGLTF.preload(MODELS.drone);

// glassmorphic HUD surface — floating panels over the terrain
const GLASS =
  "border border-white/10 bg-black/60 backdrop-blur-md shadow-[0_0_28px_rgba(0,0,0,0.5)]";

// phones: skip shadow maps + post-processing + heavy DPR so the scene
// actually renders on mobile GPUs instead of losing the WebGL context.
export function useIsMobile() {
  const [m, setM] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 820px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 820px)");
    const on = () => setM(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return m;
}

const _scaleV = new THREE.Vector3(); // scratch for per-frame scale lerps
const _ray = new THREE.Raycaster();
const _origin = new THREE.Vector3();
const _DOWN = new THREE.Vector3(0, -1, 0);

const worldXZ = (pos) => [pos[0] * SPREAD, pos[1] * SPREAD];

// drop a ray straight down and return the terrain surface height at x,z
function sampleY(terrain, x, z, fallback = 0) {
  if (!terrain) return fallback;
  _ray.set(_origin.set(x, 800, z), _DOWN);
  _ray.far = 2000;
  const hits = _ray.intersectObject(terrain, true);
  return hits.length ? hits[0].point.y : fallback;
}

/* ── terrain surface context (set once the GLB has mounted) ───────────── */
const TerrainCtx = createContext(null);
function useTerrainY(x, z, fallback = 0) {
  const terrain = useContext(TerrainCtx);
  return useMemo(() => sampleY(terrain, x, z, fallback), [terrain, x, z, fallback]);
}

/* ── CCTV network ───────────────────────────────────────────────────────
   Live status (ONLINE / STALE / OFFLINE / ALERT) comes from the backend
   GET /cameras/health via useCameras(). The backend does not yet expose
   per-camera geo or stream URLs, so the diorama position, lat/lon and the
   feed clip are a local overlay keyed by camera_id.                       */
const CAMERA_GEO = {
  CAM_ALPHA: { pos: [-9, -4], sector: "North pass · ingress", feed: "/data/ibvap_real_yolo_demo.mp4", lat: "32.0412°N", lon: "75.3980°E" },
  CAM_BRAVO: { pos: [1, 2], sector: "Restricted saddle", feed: "/data/people_surveillance_web.mp4", lat: "32.1021°N", lon: "75.2841°E", forceAlert: true },
  CAM_CHARLIE: { pos: [8, -3], sector: "East ridge overwatch", feed: "/data/cross_cam_real_demo_web.mp4", lat: "32.0930°N", lon: "75.1502°E" },
  CAM_DELTA: { pos: [-4, 6], sector: "Valley approach", feed: "/data/detected_output_web.mp4", lat: "32.0088°N", lon: "75.4410°E" },
  CAM_ECHO: { pos: [6, 8], sector: "South corridor", feed: "/data/vtest_surveillance_output_web.mp4", lat: "31.9721°N", lon: "75.0980°E" },
};
const ORDER = ["CAM_ALPHA", "CAM_BRAVO", "CAM_CHARLIE", "CAM_DELTA", "CAM_ECHO"];

function buildCameras(healthRows) {
  const byId = {};
  (healthRows || []).forEach((r) => {
    byId[r.camera_id || r.id] = r;
  });
  return ORDER.filter((id) => CAMERA_GEO[id]).map((id) => {
    const geo = CAMERA_GEO[id];
    const h = byId[id] || {};
    const faulted = h.simulated_fault || h.status === "FAULT" || h.status === "OFFLINE";
    const stale = h.status === "STALE" || (h.seconds_since_heartbeat ?? 0) > 8;
    const status = faulted ? "OFFLINE" : geo.forceAlert ? "ALERT" : stale ? "STALE" : "ONLINE";
    const fps = h.fps ?? 29.8;
    const health = Math.round(h.health_score ?? (status === "OFFLINE" ? 0 : status === "STALE" ? 71 : 92 + ((id.charCodeAt(4) * 3) % 7)));
    return {
      id,
      pos: geo.pos,
      sector: geo.sector,
      lat: geo.lat,
      lon: geo.lon,
      video: geo.feed,
      status,
      name: h.name || id,
      ping: Math.round(h.latency_ms ?? (14 + ((id.charCodeAt(4) * 7) % 12))),
      fps,
      health,
      track: 10 + ((id.charCodeAt(4) * 7) % 88),
      // signal % from live frame-rate; uptime % from heartbeat freshness
      signalPct: Math.max(0, Math.min(100, Math.round((fps / 30) * 100))),
      uptimePct: status === "OFFLINE" ? 0 : status === "STALE" ? 88 : Math.min(99.9, 99.9 - (h.seconds_since_heartbeat ?? 2) * 0.15),
    };
  });
}

// Live camera roster — polls the edge; falls back to the local overlay only.
export function useCameras(pollMs = 6000) {
  const [cameras, setCameras] = useState(() => buildCameras(null));
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const res = await api.getCameraHealth();
        if (alive && res?.cameras) setCameras(buildCameras(res.cameras));
      } catch {
        /* offline — keep the local roster */
      }
    };
    pull();
    const t = setInterval(pull, pollMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [pollMs]);
  return cameras;
}

/* ── GLB helpers ───────────────────────────────────────────────────────── */
const _tmpBox = new THREE.Box3();

// union of the world-space bounds of the *visible* meshes only
function visibleBounds(root) {
  const box = new THREE.Box3();
  root.updateWorldMatrix(true, true);
  root.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    o.geometry.computeBoundingBox();
    _tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(_tmpBox);
  });
  return box;
}

// normalise a loaded scene in its own units: centre on X/Z, drop base to y=0.
// Returns the node + the scale that fits it to `targetSize` (applied by the
// caller on a wrapper group — NOT on <primitive>, which would clobber it).
function prep(scene, targetSize) {
  const s = scene.clone(true);
  s.updateWorldMatrix(true, true);
  const box = visibleBounds(s);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const baseScale = targetSize / (Math.max(size.x, size.y, size.z) || 1);
  s.position.set(-center.x, -box.min.y, -center.z);
  s.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { node: s, baseScale };
}

// one clone-per-instance of a GLB, base-planted and size-normalised
function GlbInstance({ url, targetSize = 1, scale = 1, rotation }) {
  const { scene } = useGLTF(url);
  const { node, baseScale } = useMemo(
    () => prep(scene, targetSize),
    [scene, targetSize]
  );
  return (
    <group scale={baseScale * scale} rotation={rotation}>
      <primitive object={node} />
    </group>
  );
}

/* ── central terrain: the mountain GLB ─────────────────────────────────── */
function TerrainGLB({ onReady }) {
  const { scene } = useGLTF(MODELS.terrain);
  const ref = useRef(null);

  const obj = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = WORLD / (Math.max(size.x, size.z) || 1);
    s.scale.set(k, k * Y_EXAG, k);
    // sit the terrain's lowest point at local y=0 (predictable base plane)
    s.position.set(-center.x * k, -box.min.y * k * Y_EXAG, -center.z * k);
    s.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true;
        o.castShadow = false; // receive only — avoids the mesh shadowing itself/the plinth
        if (o.material) o.material.side = THREE.FrontSide;
      }
    });
    return s;
  }, [scene]);

  useEffect(() => {
    if (ref.current) onReady(ref.current);
  }, [obj, onReady]);

  return (
    <group ref={ref} position={[0, -1.5, 0]}>
      <primitive object={obj} />
    </group>
  );
}

/* ── stepped diorama plinth under the terrain (base sits at y = -1.5) ─── */
function PlinthBase() {
  const rim = useMemo(() => new THREE.BoxGeometry(WORLD + 2.4, 0.5, WORLD + 2.4), []);
  return (
    <group position={[0, -1.5, 0]}>
      <mesh position={[0, -4.5, 0]}>
        <boxGeometry args={[WORLD + 5, 8, WORLD + 5]} />
        <meshBasicMaterial color="#05070a" fog={false} />
      </mesh>
      <mesh position={[0, -1.3, 0]}>
        <boxGeometry args={[WORLD + 2.4, 2.6, WORLD + 2.4]} />
        <meshBasicMaterial color="#0b0f13" fog={false} />
      </mesh>
      <lineSegments position={[0, 0.05, 0]}>
        <edgesGeometry args={[rim]} />
        <lineBasicMaterial color={CYAN} transparent opacity={0.28} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/* ── one interactive CCTV node ────────────────────────────────────────── */
function CctvNode({ cam, selected, breach, onSelect }) {
  const ringRef = useRef(null);
  const coneRef = useRef(null);
  const modelRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const tRef = useRef(Math.random() * 6);
  const [x, z] = worldXZ(cam.pos);
  const y = useTerrainY(x, z, 0);
  const alert = cam.status === "ALERT" || breach;
  const ink = alert ? RED : CYAN;
  const glowHot = useMemo(() => new THREE.Color(ink).multiplyScalar(4), [ink]);
  const glowSoft = useMemo(() => new THREE.Color(ink).multiplyScalar(1.7), [ink]);
  // aim the model + FOV toward the sector interior
  const aim = useMemo(() => Math.atan2(-x, -z), [x, z]);

  useFrame((_, dt) => {
    tRef.current += dt;
    const k = (Math.sin(tRef.current * (alert ? 5 : 2.2)) + 1) / 2;
    const active = selected || hovered;
    if (ringRef.current) {
      ringRef.current.scale.setScalar(1.5 + k * 0.4 + (active ? 0.5 : 0));
      ringRef.current.material.opacity = (alert ? 0.24 : 0.14) + k * 0.1 + (active ? 0.1 : 0);
    }
    if (coneRef.current) {
      coneRef.current.material.opacity = 0.14 + k * 0.06 + (active ? 0.08 : 0) + (alert ? 0.06 : 0);
    }
    if (modelRef.current) {
      const s = active ? 1.12 : 1;
      modelRef.current.scale.lerp(_scaleV.set(s, s, s), 0.18);
    }
  });

  const select = (e) => {
    e?.stopPropagation?.();
    onSelect(cam);
  };

  return (
    <group position={[x, y, z]}>
      <pointLight color={ink} intensity={selected ? 5 : 2.6} distance={13} decay={2} position={[0, 3, 0]} />

      {/* generous invisible hit target */}
      <mesh
        position={[0, 2.4, 0]}
        visible={false}
        onClick={select}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = ""; }}
      >
        <cylinderGeometry args={[2.4, 2.4, 7, 10]} />
      </mesh>

      {/* mounting pod + base pad */}
      <mesh position={[0, 0.06, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.52, 0.66, 0.16, 16]} />
        <meshStandardMaterial color="#21262c" roughness={0.8} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.24, 1.9, 10]} />
        <meshStandardMaterial color="#3a4048" roughness={0.5} metalness={0.6} />
      </mesh>

      {/* the CCTV GLB + FOV fan */}
      <group ref={modelRef} position={[0, 1.9, 0]} rotation={[0, aim, 0]} onClick={select}>
        <Suspense fallback={null}>
          <GlbInstance url={MODELS.cctv} targetSize={3.1} />
        </Suspense>
        <mesh position={[0, 0.7, 0]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshBasicMaterial color={glowHot} toneMapped={false} />
        </mesh>
        {/* ground-projected FOV sector — clamped to the surface, no clip */}
        <mesh ref={coneRef} position={[0, -1.86, 1.3]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[4, 44, -Math.PI / 2 - 0.4, 0.8]} />
          <meshBasicMaterial
            color={glowSoft}
            transparent
            opacity={0.12}
            side={THREE.DoubleSide}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      </group>

      {/* additive ground glow */}
      <mesh ref={ringRef} position={[0, 0.16, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.15, 40]} />
        <meshBasicMaterial
          color={glowSoft}
          transparent
          opacity={0.18}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>

      <Line points={[[0, 3.1, 0], [0, 4.7, 0]]} color={glowSoft} lineWidth={1} transparent opacity={0.55} />

      <Html position={[0, 5.1, 0]} center distanceFactor={24} zIndexRange={[20, 0]}>
        <button onClick={() => onSelect(cam)} className="pointer-events-auto flex flex-col items-center gap-1">
          <span
            className="grid h-6 w-6 place-items-center rounded-full border backdrop-blur-sm"
            style={{
              borderColor: alert ? RED : CYAN,
              background: alert ? "rgba(255,34,51,0.16)" : "rgba(6,12,16,0.78)",
              color: alert ? RED : CYAN,
              boxShadow: `0 0 10px ${alert ? "rgba(255,34,51,0.4)" : "rgba(63,224,214,0.35)"}`,
            }}
          >
            <Video size={11} />
          </span>
          <span
            className="flex items-center gap-1 whitespace-nowrap border px-1.5 py-0.5 font-mono text-[9px] tracking-wide"
            style={{
              borderColor: alert ? RED : selected ? CYAN : "rgba(255,255,255,0.28)",
              background: "rgba(6,12,16,0.8)",
              color: alert ? RED : selected ? CYAN : "#dfe8ec",
            }}
          >
            {cam.id}
          </span>
        </button>
      </Html>
    </group>
  );
}

/* ── perimeter fence line along the northern edge ─────────────────────── */
function PerimeterFence({ breach }) {
  const terrain = useContext(TerrainCtx);
  const z = -WORLD * 0.4;
  const wire = useMemo(() => {
    const arr = [];
    for (let x = -WORLD * 0.42; x <= WORLD * 0.42; x += 4) {
      arr.push(new THREE.Vector3(x, sampleY(terrain, x, z, 0) + 1.7, z));
    }
    return arr;
  }, [terrain, z]);
  return (
    <group>
      {wire.map((v, i) => (
        <mesh key={i} position={[v.x, v.y - 0.85, v.z]} castShadow>
          <cylinderGeometry args={[0.07, 0.07, 1.9, 5]} />
          <meshStandardMaterial color="#8a8f94" roughness={0.6} metalness={0.5} />
        </mesh>
      ))}
      <Line points={wire} color={breach ? RED : "#9aa0a6"} lineWidth={1.2} transparent opacity={0.8} />
      <Line points={wire.map((v) => v.clone().setY(v.y - 0.7))} color={breach ? RED : "#9aa0a6"} lineWidth={1} transparent opacity={0.5} />
    </group>
  );
}

/* ── camera fly-to rig ────────────────────────────────────────────────── */
const HOME_POS = { x: 42, y: 34, z: 48 };
const HOME_LOOK = { x: 0, y: 2, z: 0 };

function FocusRig({ target, controlsRef, terrain }) {
  const { camera } = useThree();
  useEffect(() => {
    const ctrl = controlsRef.current;
    let goalPos, goalLook;
    if (target) {
      const [x, z] = worldXZ(target.pos);
      const y = sampleY(terrain, x, z, 0);
      goalPos = { x: x + 10, y: y + 9, z: z + 14 };
      goalLook = { x, y: y + 2.4, z };
    } else {
      goalPos = { ...HOME_POS };
      goalLook = { ...HOME_LOOK };
    }
    const tp = gsap.to(camera.position, { ...goalPos, duration: 1.15, ease: "power2.inOut" });
    const tl = ctrl
      ? gsap.to(ctrl.target, {
          ...goalLook,
          duration: 1.15,
          ease: "power2.inOut",
          onUpdate: () => ctrl.update(),
        })
      : null;
    return () => {
      tp.kill();
      tl?.kill();
    };
  }, [target, camera, controlsRef, terrain]);
  return null;
}

/* ── cross-camera Re-ID trajectory (ALPHA → BRAVO → CHARLIE) ────────────
   The project's Re-ID is validated on the CAM_ALPHA ↔ CAM_BRAVO pair
   (2-cam testbed); this spline contours the terrain surface between the
   tracked cameras with travelling pulses, and goes crimson on breach.    */
function ReidPath({ active }) {
  const terrain = useContext(TerrainCtx);
  const p0 = useRef(null);
  const p1 = useRef(null);
  const p2 = useRef(null);
  const pulses = [p0, p1, p2];
  const clock = useRef(0);

  const curve = useMemo(() => {
    const chain = ["CAM_ALPHA", "CAM_BRAVO", "CAM_CHARLIE"]
      .map((id) => CAMERA_GEO[id])
      .filter(Boolean)
      .map((g) => worldXZ(g.pos));
    const pts = [];
    for (let i = 0; i < chain.length - 1; i++) {
      const [ax, az] = chain[i];
      const [bx, bz] = chain[i + 1];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const x = ax + (bx - ax) * t;
        const zz = az + (bz - az) * t;
        pts.push(new THREE.Vector3(x, sampleY(terrain, x, zz, 0) + 1.4, zz));
      }
    }
    const [lx, lz] = chain[chain.length - 1];
    pts.push(new THREE.Vector3(lx, sampleY(terrain, lx, lz, 0) + 1.4, lz));
    return new THREE.CatmullRomCurve3(pts);
  }, [terrain]);

  const linePts = useMemo(() => curve.getPoints(90), [curve]);
  const mid = useMemo(() => curve.getPoint(0.5), [curve]);
  const hot = useMemo(
    () => new THREE.Color(active ? RED : CYAN).multiplyScalar(active ? 3 : 1.6),
    [active]
  );

  useFrame((_, dt) => {
    clock.current += dt * (active ? 0.5 : 0.22);
    pulses.forEach((r, i) => {
      if (!r.current) return;
      const tt = (clock.current + i / pulses.length) % 1;
      curve.getPoint(tt, r.current.position);
      const fade = Math.sin(tt * Math.PI);
      r.current.scale.setScalar((active ? 0.3 : 0.18) * (0.35 + fade));
      r.current.material.opacity = 0.3 + fade * 0.7;
    });
  });

  return (
    <group>
      <Line
        points={linePts}
        color={active ? RED : CYAN}
        lineWidth={active ? 2 : 1}
        transparent
        opacity={active ? 0.85 : 0.34}
        dashed
        dashScale={active ? 4 : 6}
      />
      {pulses.map((r, i) => (
        <mesh key={i} ref={r}>
          <sphereGeometry args={[1, 14, 14]} />
          <meshBasicMaterial color={hot} transparent toneMapped={false} />
        </mesh>
      ))}
      <Html position={[mid.x, mid.y + 1.8, mid.z]} center distanceFactor={32} zIndexRange={[15, 0]}>
        <div
          className="whitespace-nowrap border bg-black/80 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest"
          style={{ borderColor: active ? RED : "rgba(63,224,214,0.5)", color: active ? RED : CYAN }}
        >
          Re-ID track · A→B→C
        </div>
      </Html>
    </group>
  );
}

/* ── autonomous patrol drone (UAV-01) ────────────────────────────────────
   Loops a CatmullRom flight path over the ridline with a downward scan
   beam + a ground reticle that tracks its ground track. Tap → UAV panel.  */
const DRONE_WAYPOINTS = [
  [-10, 8, -6], [0, 9, -8], [10, 8, 2], [5, 7.5, 8], [-8, 8, 4],
];
const DRONE_SPEED = 0.017;

// tap on the drone (3D mesh or HUD tag) → DOM event; the outer modal/panel
// listens for this (crosses the drei <Html> React-root boundary cleanly).
const fireUavSelect = () => window.dispatchEvent(new CustomEvent("uav-select"));

const BEAM_H = 10;
const DRONE_YAW = Math.PI; // model-forward correction

function PatrolDrone() {
  const terrain = useContext(TerrainCtx);
  const rig = useRef(null); // follows the flight path (level)
  const tilt = useRef(null); // heading + banking (drone body only)
  const beam = useRef(null);
  const core = useRef(null);
  const reticle = useRef(null);
  const [hovered, setHovered] = useState(false);

  const glowHot = useMemo(() => new THREE.Color(CYAN).multiplyScalar(4), []);

  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        DRONE_WAYPOINTS.map(([x, y, z]) => new THREE.Vector3(x * SPREAD, y * 1.5, z * SPREAD)),
        true,
        "catmullrom",
        0.4
      ),
    []
  );
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);

  useFrame((state) => {
    if (!rig.current) return;
    const time = state.clock.getElapsedTime();
    const t = (time * DRONE_SPEED) % 1;
    curve.getPointAt(t, pos);
    curve.getTangentAt(t, tan);

    const bob = Math.sin(time * 3) * 0.25;
    rig.current.position.set(pos.x, pos.y + bob, pos.z);

    if (tilt.current) {
      const heading = Math.atan2(tan.x, tan.z) + DRONE_YAW;
      tilt.current.rotation.set(
        Math.sin(time * 2.3) * 0.08,
        heading,
        Math.sin(time * 3) * 0.16
      );
    }

    const gy = sampleY(terrain, pos.x, pos.z, 0);
    const h = Math.max(3, pos.y + bob - gy);
    if (beam.current) {
      beam.current.position.y = -h / 2 - 0.4;
      beam.current.scale.set(1, h / BEAM_H, 1);
      beam.current.material.opacity = 0.14 + (Math.sin(time * 2.4) + 1) * 0.035;
    }
    if (core.current) {
      core.current.material.opacity = 0.55 + (Math.sin(time * 5) + 1) * 0.22;
    }
    if (reticle.current) {
      reticle.current.position.set(pos.x, gy + 0.15, pos.z);
      const s = 2.6 + Math.sin(time * 2) * 0.5;
      reticle.current.scale.setScalar(s);
      reticle.current.material.opacity = 0.22 + (Math.sin(time * 2) + 1) * 0.07;
    }
  });

  const tap = (e) => { e.stopPropagation(); fireUavSelect(); };
  const hoverIn = (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; };
  const hoverOut = () => { setHovered(false); document.body.style.cursor = ""; };

  return (
    <>
      <group ref={rig}>
        <group ref={tilt}>
          <group scale={hovered ? 1.12 : 1} position={[0, -0.5, 0]} onClick={tap} onPointerOver={hoverIn} onPointerOut={hoverOut}>
            <Suspense fallback={null}>
              <GlbInstance url={MODELS.drone} targetSize={5} />
            </Suspense>
          </group>
        </group>

        <mesh onClick={tap} onPointerOver={hoverIn} onPointerOut={hoverOut}>
          <sphereGeometry args={[4, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        <mesh ref={core} position={[0, -0.55, 0]}>
          <sphereGeometry args={[0.18, 14, 14]} />
          <meshBasicMaterial color={glowHot} transparent opacity={0.7} toneMapped={false} />
        </mesh>
        <mesh position={[0, -0.62, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.5, 32]} />
          <meshBasicMaterial color={CYAN} transparent opacity={0.35} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>

        <pointLight color={CYAN} intensity={hovered ? 6 : 4} distance={16} decay={2} />

        <mesh ref={beam}>
          <coneGeometry args={[2.6, BEAM_H, 44, 1, true]} />
          <meshBasicMaterial color="#00f0ff" transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>

        <Html position={[0, 2.6, 0]} center zIndexRange={[30, 0]}>
          <button
            onClick={fireUavSelect}
            className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap border border-[#3fe0d6]/60 bg-black/85 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-widest text-[#3fe0d6] hover:bg-[#3fe0d6]/15"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3fe0d6]" />
            [UAV-01 // PATROL SCANNING]
          </button>
        </Html>
      </group>

      <mesh ref={reticle} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.78, 1.0, 56]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.25} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>
    </>
  );
}

/* ── breach alert banner (DOM overlay, sits above the canvas) ────────── */
export function BreachBanner({ show, node = "CAM_BRAVO" }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -18, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -18, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 26 }}
          className="pointer-events-none absolute inset-x-0 top-4 z-40 flex justify-center px-4"
        >
          <div className="flex items-center gap-2.5 border border-[#ff2233] bg-[#ff2233]/12 px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff2233] shadow-[0_0_28px_rgba(255,34,51,0.28)] backdrop-blur-md">
            <AlertTriangle size={14} className="shrink-0 animate-pulse" />
            <span>Critical alert · restricted zone breached · {node}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ── in-canvas loading placeholder ───────────────────────────────────── */
export function TacticalLoader() {
  return (
    <div className="grid h-full w-full place-items-center bg-[#0a1017]">
      <div className="flex flex-col items-center gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-[#3fe0d6]/70">
        <span className="h-6 w-6 animate-spin rounded-full border border-[#3fe0d6]/25 border-t-[#3fe0d6]" />
        loading terrain assets…
      </div>
    </div>
  );
}

export function Scene({ cameras, selected, breach, onSelect }) {
  const controlsRef = useRef(null);
  const lite = useIsMobile();
  const [terrain, setTerrain] = useState(null);
  const onReady = useCallback((obj) => setTerrain(obj), []);

  const alertCam = cameras.find((c) => c.status === "ALERT");
  const focusTarget = selected || (breach && alertCam ? alertCam : null);

  return (
    <>
      <color attach="background" args={["#0b131c"]} />
      <fog attach="fog" args={["#0b131c", 110, 240]} />
      <ambientLight intensity={lite ? 1.25 : 1.0} />
      <hemisphereLight args={["#dbe8f2", "#2b2721", lite ? 1.05 : 0.85]} />
      {/* crisp directional sunlight — upper-left, soft shadows over the ridges */}
      <directionalLight
        position={[-38, 54, 30]}
        intensity={2.5}
        color="#fff3e0"
        castShadow={!lite}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={1}
        shadow-camera-far={180}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
      />
      <directionalLight position={[40, 22, -40]} intensity={0.4} color={CYAN} />

      <PlinthBase />

      <TerrainCtx.Provider value={terrain}>
        <Suspense fallback={null}>
          <TerrainGLB onReady={onReady} />
        </Suspense>

        {terrain && (
          <>
            {cameras.map((c) => (
              <CctvNode
                key={c.id}
                cam={c}
                selected={selected?.id === c.id || (breach && c.status === "ALERT")}
                breach={breach && c.status === "ALERT"}
                onSelect={onSelect}
              />
            ))}
            <ReidPath active={breach} />
            <PerimeterFence breach={breach} />
            <PatrolDrone />
          </>
        )}
      </TerrainCtx.Provider>

      <FocusRig target={focusTarget} controlsRef={controlsRef} terrain={terrain} />
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.08}
        minDistance={16}
        maxDistance={150}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 2, 0]}
      />

      {!lite && (
        <EffectComposer disableNormalPass>
          <Bloom intensity={breach ? 1.8 : 1.3} luminanceThreshold={0.82} luminanceSmoothing={0.3} mipmapBlur radius={0.75} />
          <Vignette eskil={false} offset={0.3} darkness={0.5} />
        </EffectComposer>
      )}
    </>
  );
}

/* ── WebGL guard ───────────────────────────────────────────────────── */
export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}
export class SceneBoundary extends Component {
  constructor(p) {
    super(p);
    this.state = { dead: false };
  }
  static getDerivedStateFromError() {
    return { dead: true };
  }
  render() {
    if (this.state.dead)
      return (
        <div className="grid h-full place-items-center font-mono text-[11px] uppercase tracking-[0.2em] text-white/50">
          terrain engine failed to start
        </div>
      );
    return this.props.children;
  }
}

/* ── detail panel (camera feed + telemetry) ────────────────────────── */
function Spark({ color, data }) {
  const d = data && data.length > 1 ? data : [8, 11, 9, 14, 12, 17, 13, 19, 15, 21, 18, 16];
  const min = Math.min(...d), max = Math.max(...d);
  const pts = d
    .map((v, i) => `${(i / (d.length - 1)) * 100},${28 - ((v - min) / (max - min || 1)) * 24}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function RingGauge({ label, value, color }) {
  const r = 15;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative h-12 w-12">
        <svg viewBox="0 0 40 40" className="h-full w-full -rotate-90">
          <circle cx="20" cy="20" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={color}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * v) / 100}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center font-mono text-[10px] font-bold text-white tabular-nums">
          {Math.round(v)}
        </span>
      </div>
      <span className="font-mono text-[8px] uppercase tracking-widest text-white/40">{label}</span>
    </div>
  );
}

export function DetailPanel({ cam, onClose, className = "" }) {
  const alert = cam.status === "ALERT";
  const lite = useIsMobile();
  return (
    <motion.div
      initial={lite ? { y: 60, opacity: 0 } : { x: 40, opacity: 0 }}
      animate={lite ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
      exit={lite ? { y: 60, opacity: 0 } : { x: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className={`pointer-events-auto z-30 max-h-[70vh] overflow-y-auto ${GLASS} ${
        lite ? "absolute inset-x-0 bottom-0 w-full rounded-t-xl" : `w-[320px] ${className || "absolute right-4 top-20"}`
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[11px] tracking-wide">
        <span className="flex items-center gap-1.5 text-white">
          <Radio size={12} className="text-[#3fe0d6]" />
          {cam.id} <span className="text-white/35">[LIVE]</span>
        </span>
        <span
          className="flex items-center gap-1 text-[10px] font-bold"
          style={{ color: alert ? RED : "#3fe0d6" }}
        >
          {alert && <AlertTriangle size={11} />}
          {cam.status}
        </span>
      </div>

      <div className="relative">
        <video
          src={cam.video}
          autoPlay
          loop
          muted
          playsInline
          className="aspect-video w-full object-cover contrast-105 brightness-105"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg,#fff 0,#fff 1px,transparent 1px,transparent 3px)",
          }}
        />
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] text-white/80">
          <span
            className="h-1 w-1 animate-pulse rounded-full"
            style={{ background: alert ? RED : "#3fe0d6" }}
          />
          LIVE
        </div>
        {alert && (
          <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 56" preserveAspectRatio="none">
              <rect x="40" y="16" width="20" height="30" fill="none" stroke={RED} strokeWidth="0.8" strokeDasharray="3 2">
                <animate attributeName="x" values="34;48;34" dur="4s" repeatCount="indefinite" />
              </rect>
            </svg>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("open-biometric", { detail: { id: `ALPHA-0${cam.track ?? 49}` } }))}
              className="pointer-events-auto absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap border border-[#ff2233] bg-black/80 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-widest text-[#ff2233] transition-colors hover:bg-[#ff2233] hover:text-black"
            >
              TRK #{cam.track ?? 7} · person · flagged →
            </button>
          </>
        )}
      </div>

      {/* circular gauges — live signal / uptime / health from /cameras/health */}
      <div className="flex items-center justify-around border-b border-white/10 px-3 py-2.5">
        <RingGauge label="Signal" value={cam.signalPct ?? 90} color={alert ? RED : "#3fe0d6"} />
        <RingGauge label="Uptime" value={cam.uptimePct ?? 99} color={alert ? RED : "#3fe0d6"} />
        <RingGauge label="Health" value={cam.health ?? 92} color={alert ? RED : "#3fe0d6"} />
      </div>

      <div className="space-y-1.5 px-3 py-3 font-mono text-[10.5px] text-white/60">
        <Row k="Sector" v={cam.sector} />
        <Row k="GPS" v={`${cam.lat} · ${cam.lon}`} />
        <Row k="Link ping" v={`${cam.ping} ms`} />
        <Row k="Frame rate" v={`${(cam.fps ?? 29.8).toFixed(1)} fps`} />
        <div className="pt-1">
          <div className="mb-0.5 flex items-center gap-1 text-[9px] uppercase tracking-widest text-white/35">
            <Activity size={9} /> detections / min · last hour
          </div>
          <Spark color={alert ? RED : "#3fe0d6"} />
        </div>
      </div>

      <div className="flex border-t border-white/10">
        <a
          href="/console"
          className="flex flex-1 items-center justify-center gap-1.5 py-2 font-mono text-[10px] font-bold uppercase tracking-widest text-[#3fe0d6] transition-colors hover:bg-[#3fe0d6] hover:text-black"
        >
          <ExternalLink size={11} /> open in console
        </a>
        <button
          onClick={onClose}
          className="border-l border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
        >
          back to orbit
        </button>
      </div>
    </motion.div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/35">{k}</span>
      <span className="text-right text-white/75">{v}</span>
    </div>
  );
}

/* ── UAV patrol panel (opens on drone tap) ──────────────────────────────
   The autonomous drone is a Phase-2 roadmap element — telemetry values are
   nominal placeholders, flagged "roadmap · not deployed".               */
export function DronePanel({ onClose, className = "" }) {
  const [feed, setFeed] = useState("uav"); // "uav" | "cams"
  const lite = useIsMobile();
  return (
    <motion.div
      initial={lite ? { y: 60, opacity: 0 } : { x: 40, opacity: 0 }}
      animate={lite ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
      exit={lite ? { y: 60, opacity: 0 } : { x: 40, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 32 }}
      className={`pointer-events-auto z-30 max-h-[70vh] overflow-y-auto ${GLASS} ${
        lite ? "absolute inset-x-0 bottom-0 w-full rounded-t-xl" : `w-[320px] ${className || "absolute right-4 top-20"}`
      }`}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-mono text-[11px] tracking-wide">
        <span className="flex items-center gap-1.5 text-white">
          <Radio size={12} className="text-[#3fe0d6]" />
          UAV-01 <span className="text-white/35">[PATROL]</span>
        </span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-[#3fe0d6]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3fe0d6]" />
          SCANNING
        </span>
      </div>

      <div className="relative">
        <video
          src={feed === "uav" ? "/data/detected_output_web.mp4" : "/data/people_surveillance_web.mp4"}
          autoPlay
          loop
          muted
          playsInline
          className="aspect-video w-full object-cover contrast-105 brightness-105"
        />
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#3fe0d6 0,#3fe0d6 1px,transparent 1px,transparent 3px)" }}
        />
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 bg-black/70 px-1.5 py-0.5 font-mono text-[8px] text-white/80">
          <span className="h-1 w-1 animate-pulse rounded-full bg-[#3fe0d6]" />
          {feed === "uav" ? "UAV OPTICS · SIM" : "CCTV GRID · SIM"}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 56">
          <circle cx="50" cy="28" r="9" fill="none" stroke="#3fe0d6" strokeWidth="0.4" strokeDasharray="2 2">
            <animateTransform attributeName="transform" type="rotate" from="0 50 28" to="360 50 28" dur="9s" repeatCount="indefinite" />
          </circle>
          <line x1="50" y1="15" x2="50" y2="41" stroke="#3fe0d6" strokeWidth="0.25" />
          <line x1="37" y1="28" x2="63" y2="28" stroke="#3fe0d6" strokeWidth="0.25" />
        </svg>
      </div>

      <div className="space-y-1 border-b border-white/10 px-3 py-2.5 font-mono text-[10.5px] text-white/60">
        <div className="mb-1 text-[9px] uppercase tracking-widest text-white/35">Autonomous drone patrol</div>
        <Row k="Battery" v="84%" />
        <Row k="Altitude" v="420 m" />
        <Row k="Speed" v="54 km/h" />
      </div>

      <div className="flex border-b border-white/10 font-mono text-[9px] font-bold uppercase tracking-widest">
        <button
          onClick={() => setFeed("cams")}
          className={`flex-1 py-2 transition-colors ${feed === "cams" ? "bg-[#3fe0d6] text-black" : "text-white/50 hover:text-white"}`}
        >
          Surveillance cams
        </button>
        <button
          onClick={() => setFeed("uav")}
          className={`flex-1 border-l border-white/10 py-2 transition-colors ${feed === "uav" ? "bg-[#3fe0d6] text-black" : "text-white/50 hover:text-white"}`}
        >
          UAV optics feed
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-white/10">
        <span className="px-3 py-2 font-mono text-[9px] uppercase tracking-widest text-white/35">roadmap · not deployed</span>
        <button
          onClick={onClose}
          className="border-l border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-white"
        >
          back to orbit
        </button>
      </div>
    </motion.div>
  );
}

const STATUS_INK = { ONLINE: CYAN, STALE: "#f5b544", OFFLINE: "#8a8f94", ALERT: RED };

export function CameraRail({ cameras, selected, onSelect, className = "" }) {
  const lite = useIsMobile();
  const liveN = cameras.filter((c) => c.status === "ONLINE" || c.status === "ALERT").length;

  if (lite) {
    // phones: a compact horizontal scroll strip along the top
    return (
      <div className={`${GLASS} flex items-center gap-1.5 overflow-x-auto rounded-lg p-1.5 ${className}`}>
        {cameras.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className={`flex shrink-0 items-center gap-1.5 border px-2 py-1 font-mono text-[10px] transition-colors ${
              selected?.id === c.id ? "border-[#3fe0d6] bg-white/10 text-white" : "border-white/15 text-white/60"
            }`}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: STATUS_INK[c.status] || CYAN }} />
            {c.id.replace("CAM_", "")}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={`${GLASS} ${className}`}>
      <div className="border-b border-white/10 px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-white/55">
        CCTV Network · {liveN}/{cameras.length} live
      </div>
      <ul>
        {cameras.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c)}
              className={`flex w-full items-center gap-2 border-l-2 px-3 py-1.5 text-left font-mono text-[10px] transition-colors ${
                selected?.id === c.id
                  ? "border-[#3fe0d6] bg-white/[0.06] text-white"
                  : "border-transparent text-white/55 hover:bg-white/[0.03] hover:text-white"
              }`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_INK[c.status] || CYAN }} />
              <span className="flex-1 truncate">{c.id}</span>
              <span className="text-[8px] uppercase tracking-wider" style={{ color: STATUS_INK[c.status] || "rgba(255,255,255,0.35)" }}>
                {c.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function BorderTerrainModal({ onClose }) {
  const cameras = useCameras();
  const [selected, setSelected] = useState(null);
  const [drone, setDrone] = useState(false);
  const [bio, setBio] = useState(null);
  const [breach, setBreach] = useState(false);
  const [webgl] = useState(() => hasWebGL());
  const lite = useIsMobile();
  const online = cameras.filter((c) => c.status === "ONLINE" || c.status === "ALERT").length;

  const selCam = selected ? cameras.find((c) => c.id === selected.id) || selected : null;
  const pickCam = (c) => { setDrone(false); setSelected(c); };

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

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const body = (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[#0a1017] font-sans text-white">
      <div className="z-30 flex items-center justify-between gap-2 border-b border-[#3fe0d6]/15 bg-[#0a1016]/70 px-3 py-2.5 backdrop-blur-xl backdrop-saturate-150 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center border border-[#3fe0d6]/50 text-[#3fe0d6]">
            <MapPin size={14} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-mono text-[11px] font-bold tracking-[0.12em] sm:text-[12px] sm:tracking-[0.15em]">
              SECTOR 4-B <span className="hidden sm:inline">· LIVE TERRAIN MODEL</span>
            </div>
            <div className="truncate font-mono text-[9px] uppercase tracking-[0.16em] text-white/45 sm:tracking-[0.2em]">
              {cameras.length} nodes · {online} live · SSB Gurdaspur
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setBreach((b) => !b)}
            className="flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[10px] font-bold tracking-widest transition-colors sm:px-3"
            style={{
              borderColor: breach ? RED : "rgba(255,255,255,0.25)",
              background: breach ? RED : "transparent",
              color: breach ? "#000" : "#fff",
            }}
          >
            <AlertTriangle size={12} />
            <span className="hidden sm:inline">{breach ? "CLEAR" : "SIMULATE BREACH"}</span>
            <span className="sm:hidden">{breach ? "CLEAR" : "BREACH"}</span>
          </button>
          <button
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center border border-white/30 text-white/70 hover:bg-white hover:text-black"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
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
            WebGL unavailable in this browser
          </div>
        )}

        <div className="pointer-events-none absolute inset-4 z-10">
          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map(
            (c) => (
              <span key={c} className={`absolute h-4 w-4 border-[#3fe0d6]/40 ${c}`} />
            )
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center font-mono text-[9px] uppercase tracking-[0.2em] text-white/35 sm:block">
          drag to orbit · scroll to zoom · tap a camera or the UAV for its feed
        </div>

        <CameraRail
          cameras={cameras}
          selected={selected}
          onSelect={pickCam}
          className={
            lite
              ? "pointer-events-auto absolute inset-x-2 top-16 z-20"
              : "pointer-events-auto absolute left-4 top-20 z-20 w-52"
          }
        />

        <BreachBanner show={breach} />

        <AnimatePresence mode="wait">
          {selCam && (
            <DetailPanel
              key={selCam.id}
              cam={selCam}
              onClose={() => setSelected(null)}
              className="absolute right-4 top-20"
            />
          )}
        </AnimatePresence>
        <AnimatePresence>
          {drone && !selCam && (
            <DronePanel key="uav-01" onClose={() => setDrone(false)} className="absolute right-4 top-20" />
          )}
        </AnimatePresence>
      </div>

      <Suspense fallback={null}>
        <TargetBiometricInspector open={!!bio} subject={bio || {}} onClose={() => setBio(null)} />
      </Suspense>
    </div>
  );

  return createPortal(body, document.body);
}
