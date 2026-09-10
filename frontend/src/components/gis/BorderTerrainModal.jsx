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
import { X, Radio, MapPin, Activity, ExternalLink, AlertTriangle, Video, ScanFace } from "lucide-react";
import api from "../../lib/api.js";
import { TERRAIN_SECTORS, DEFAULT_SECTOR_ID, getSector } from "../../config/terrains.js";

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

const CYAN = "#3ff09a";
const RED = "#ff2233";

// diorama footprint (world units) + how far the tactical layout is spread
const WORLD = 58;
const SPREAD = 2.4;

const MODELS = {
  cctv: "/models/cctv_camera.glb",
  drone: "/models/drone.glb",
};
useGLTF.preload(MODELS.cctv);
useGLTF.preload(MODELS.drone);
// the default sector's terrain eagerly; the rest load on first switch
useGLTF.preload(getSector(DEFAULT_SECTOR_ID).model);

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

// drop a ray straight down and return the terrain surface height at x,z.
// If the exact point is off the mesh (thin/narrow terrains like a bridge
// span), pull the sample progressively toward the centre until it lands —
// so nodes still plant on a real surface instead of floating at y=0.
function sampleY(terrain, x, z, fallback = 0) {
  if (!terrain) return fallback;
  terrain.updateWorldMatrix(true, true); // ensure the mesh transform is current
  _ray.far = 4000;
  for (const t of [1, 0.85, 0.7, 0.55, 0.4, 0.25, 0.12, 0]) {
    _ray.set(_origin.set(x * t, 2000, z * t), _DOWN);
    const hits = _ray.intersectObject(terrain, true);
    if (hits.length) return hits[0].point.y;
  }
  return fallback;
}

/* ── terrain surface context (set once the GLB has mounted) ───────────── */
const TerrainCtx = createContext(null);
function useTerrainY(x, z, fallback = 0) {
  const terrain = useContext(TerrainCtx);
  const [y, setY] = useState(fallback);
  const locked = useRef(false);
  useEffect(() => {
    locked.current = false;
    setY(fallback);
  }, [terrain, x, z, fallback]);
  // re-sample every frame until a real surface hit lands — the terrain
  // mesh's world matrix isn't reliably settled the instant onReady fires.
  useFrame(() => {
    if (locked.current || !terrain) return;
    const h = sampleY(terrain, x, z, null);
    if (h != null && Number.isFinite(h)) {
      setY(h);
      locked.current = true;
    }
  });
  return y;
}

/* ── CCTV network ───────────────────────────────────────────────────────
   Roster + diorama layout come from the active terrain sector
   (src/config/terrains.js). Live status (ONLINE / STALE / OFFLINE /
   ALERT) is overlaid from the backend GET /cameras/health when that
   sector's camera ids are known to the backend; otherwise the sector's
   declared status stands.                                                */
function buildCameras(sector, healthRows) {
  const byId = {};
  (healthRows || []).forEach((r) => {
    byId[r.camera_id || r.id] = r;
  });
  return (sector?.cameras || []).map((cam) => {
    const h = byId[cam.id] || {};
    const known = Object.keys(h).length > 0;
    const faulted = h.simulated_fault || h.status === "FAULT" || h.status === "OFFLINE";
    const stale = h.status === "STALE" || (h.seconds_since_heartbeat ?? 0) > 8;
    const status = known
      ? faulted
        ? "OFFLINE"
        : cam.status === "ALERT"
        ? "ALERT"
        : stale
        ? "STALE"
        : "ONLINE"
      : cam.status;
    const cc = cam.id.charCodeAt(cam.id.length - 1);
    const fps = h.fps ?? (status === "OFFLINE" ? 0 : status === "STALE" ? 21.4 : 29.8);
    const health = Math.round(
      h.health_score ?? (status === "OFFLINE" ? 0 : status === "STALE" ? 71 : 92 + ((cc * 3) % 7))
    );
    return {
      id: cam.id,
      name: h.name || cam.name || cam.id,
      pos: cam.pos,
      sector: cam.sector,
      lat: cam.lat,
      lon: cam.lon,
      video: cam.feed,
      status,
      ping: Math.round(h.latency_ms ?? (14 + ((cc * 7) % 12))),
      fps,
      health,
      track: 10 + ((cc * 7) % 88),
      // signal % from live frame-rate; uptime % from heartbeat freshness
      signalPct: Math.max(0, Math.min(100, Math.round((fps / 30) * 100))),
      uptimePct: status === "OFFLINE" ? 0 : status === "STALE" ? 88 : Math.min(99.9, 99.9 - (h.seconds_since_heartbeat ?? 2) * 0.15),
    };
  });
}

// Live camera roster for a sector — polls the backend; falls back to the
// sector's declared roster. Resets immediately when the sector changes.
export function useCameras(sector, pollMs = 6000) {
  const [cameras, setCameras] = useState(() => buildCameras(sector, null));
  useEffect(() => {
    setCameras(buildCameras(sector, null));
    let alive = true;
    const pull = async () => {
      try {
        const res = await api.getCameraHealth();
        if (alive && res?.cameras) setCameras(buildCameras(sector, res.cameras));
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
  }, [sector, pollMs]);
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

/* ── central terrain: the active sector's GLB ──────────────────────────── */
function TerrainGLB({ model, yExag = 2.4, onReady }) {
  const { scene } = useGLTF(model);
  const ref = useRef(null);

  const obj = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = WORLD / (Math.max(size.x, size.z) || 1);
    s.scale.set(k, k * yExag, k);
    // sit the terrain's lowest point at local y=0 (predictable base plane)
    s.position.set(-center.x * k, -box.min.y * k * yExag, -center.z * k);
    s.traverse((o) => {
      if (o.isMesh) {
        o.receiveShadow = true;
        o.castShadow = false; // receive only — avoids the mesh shadowing itself/the plinth
        if (o.material) o.material.side = THREE.FrontSide;
      }
    });
    return s;
  }, [scene, yExag]);

  useEffect(() => {
    if (ref.current) onReady(ref.current);
    return () => onReady(null); // clear the surface ref while the next terrain loads
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
              boxShadow: `0 0 10px ${alert ? "rgba(255,34,51,0.4)" : "rgba(63,240,154,0.35)"}`,
            }}
          >
            <Video size={11} />
          </span>
          <span
            className="flex items-center gap-1 whitespace-nowrap rounded border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] font-medium backdrop-blur-md"
            style={{ color: alert ? RED : selected ? CYAN : "#d4d4d8" }}
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
function ReidPath({ active, chain = [] }) {
  const terrain = useContext(TerrainCtx);
  const p0 = useRef(null);
  const p1 = useRef(null);
  const p2 = useRef(null);
  const pulses = [p0, p1, p2];
  const clock = useRef(0);
  const key = chain.map((p) => p.join()).join("|");

  const curve = useMemo(() => {
    const nodes = chain.map((p) => worldXZ(p));
    if (nodes.length < 2) {
      return new THREE.CatmullRomCurve3([new THREE.Vector3(), new THREE.Vector3(0, 0, 1)]);
    }
    const pts = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, az] = nodes[i];
      const [bx, bz] = nodes[i + 1];
      for (let s = 0; s < 12; s++) {
        const t = s / 12;
        const x = ax + (bx - ax) * t;
        const zz = az + (bz - az) * t;
        pts.push(new THREE.Vector3(x, sampleY(terrain, x, zz, 0) + 1.4, zz));
      }
    }
    const [lx, lz] = nodes[nodes.length - 1];
    pts.push(new THREE.Vector3(lx, sampleY(terrain, lx, lz, 0) + 1.4, lz));
    return new THREE.CatmullRomCurve3(pts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrain, key]);

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

  if (chain.length < 2) return null;

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
          className="whitespace-nowrap rounded border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] font-medium backdrop-blur-md"
          style={{ color: active ? RED : CYAN }}
        >
          Re-ID track · A→B→C
        </div>
      </Html>
    </group>
  );
}

/* ── autonomous patrol drone (UAV-01) ────────────────────────────────────
   ONE <group>. useFrame writes only droneGroup.position + .quaternion along
   the flight curve — the model, the UV scan cone, the ground reticle and
   the HUD tag are fixed-transform children, so they can never detach. The
   only per-frame child write is the beam's own Z-axis scanning sweep.     */
const DRONE_WAYPOINTS = [
  [-9, 8, -3], [0, 9, -4.5], [9, 8, 1], [5, 7.5, 4], [-7, 8, 2.5],
];
const DRONE_SPEED = 0.017;
const DRONE_YAW = Math.PI; // model-forward correction
// hover above whatever the terrain surface is directly below — keeps the
// UV scan cone + ground reticle (fixed children at local y ≈ -8.9) landing
// exactly on the surface on any terrain, flat bridge span included.
const DRONE_HOVER = 8.9;
const UV = "#3ff09a"; // UV / thermal scan tint

// tap on the drone (3D mesh or HUD tag) → DOM event; the outer modal/panel
// listens for this (crosses the drei <Html> React-root boundary cleanly).
const fireUavSelect = () => window.dispatchEvent(new CustomEvent("uav-select"));

function PatrolDrone({ path }) {
  const droneGroupRef = useRef(null); // the single synchronized unit
  const beamRef = useRef(null); // scanning-optics Z-sweep only (rotation, not position)
  const [hovered, setHovered] = useState(false);
  const terrain = useContext(TerrainCtx);
  const flyY = useRef(null); // smoothed surface-follow altitude
  const waypoints = path && path.length >= 3 ? path : DRONE_WAYPOINTS;

  const uvGlow = useMemo(() => new THREE.Color(UV).multiplyScalar(2), []);
  const curve = useMemo(
    () =>
      new THREE.CatmullRomCurve3(
        waypoints.map(([x, y, z]) => new THREE.Vector3(x * SPREAD, y * 1.5, z * SPREAD)),
        true,
        "catmullrom",
        0.4
      ),
    [waypoints]
  );
  const pos = useMemo(() => new THREE.Vector3(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  const qTarget = useMemo(() => new THREE.Quaternion(), []);
  const eTmp = useMemo(() => new THREE.Euler(), []);

  useFrame((state) => {
    const g = droneGroupRef.current;
    if (!g) return;
    const time = state.clock.getElapsedTime();
    const t = (time * DRONE_SPEED) % 1;
    curve.getPoint(t, pos);
    curve.getTangent(t, tan);

    // (1) the whole unit rides the curve in X/Z, but its altitude follows the
    //     terrain surface directly below so the scan cone always hits ground
    const targetY = sampleY(terrain, pos.x, pos.z, 0) + DRONE_HOVER;
    flyY.current = flyY.current == null ? targetY : flyY.current + (targetY - flyY.current) * 0.06;
    g.position.set(pos.x, flyY.current + Math.sin(time * 3) * 0.22, pos.z);

    // (2) …and yaws to face travel direction (quaternion only, kept upright
    //     so the scan cone stays pointed straight down)
    const heading = Math.atan2(tan.x, tan.z) + DRONE_YAW;
    qTarget.setFromEuler(eTmp.set(Math.sin(time * 2.3) * 0.05, heading, Math.sin(time * 3) * 0.06));
    g.quaternion.slerp(qTarget, 0.12);

    // (3) the ONLY child write — the beam's active-scanning sweep on Z
    if (beamRef.current) beamRef.current.rotation.z = Math.sin(time * 0.55) * 0.22;
  });

  const tap = (e) => { e.stopPropagation(); fireUavSelect(); };
  const hoverIn = (e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = "pointer"; };
  const hoverOut = () => { setHovered(false); document.body.style.cursor = ""; };

  return (
    <group ref={droneGroupRef}>
      {/* ── drone chassis — sits ON TOP, clear of the rays ── */}
      <group position={[0, 2.2, 0]} rotation={[0, DRONE_YAW, 0]} scale={hovered ? 1.14 : 1} onClick={tap} onPointerOver={hoverIn} onPointerOut={hoverOut}>
        <Suspense fallback={null}>
          <GlbInstance url={MODELS.drone} targetSize={6} />
        </Suspense>
      </group>

      {/* generous invisible hit target */}
      <mesh position={[0, 2.4, 0]} onClick={tap} onPointerOver={hoverIn} onPointerOut={hoverOut}>
        <sphereGeometry args={[4.5, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      <pointLight color={UV} intensity={hovered ? 6 : 4} distance={20} decay={2} position={[0, 1.5, 0]} />

      {/* ── attached UV / thermal scanning rig — emitted from under the drone ── */}
      <group ref={beamRef}>
        {/* emitter nozzle just below the drone belly */}
        <mesh position={[0, 1.2, 0]}>
          <sphereGeometry args={[0.24, 16, 16]} />
          <meshBasicMaterial color={uvGlow} transparent opacity={0.8} toneMapped={false} />
        </mesh>
        <mesh position={[0, 1.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.55, 32]} />
          <meshBasicMaterial color={UV} transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        {/* volumetric UV cone — apex at the nozzle, fanning down to the ground */}
        <mesh position={[0, -3.85, 0]}>
          <coneGeometry args={[3.6, 10, 44, 1, true]} />
          <meshBasicMaterial color={UV} transparent opacity={0.16} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        {/* projected ground target reticle (fixed offset — moves with the rig) */}
        <group position={[0, -8.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[2.2, 2.55, 60]} />
            <meshBasicMaterial color={UV} transparent opacity={0.32} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          <mesh>
            <ringGeometry args={[0.35, 0.5, 32]} />
            <meshBasicMaterial color={UV} transparent opacity={0.4} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
          {/* sweep spoke — reads as a scan line inside the reticle */}
          <mesh position={[1.1, 0, 0]}>
            <planeGeometry args={[2.2, 0.06]} />
            <meshBasicMaterial color={UV} transparent opacity={0.5} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
          </mesh>
        </group>
      </group>

      {/* ── telemetry badge (child of the group) ── */}
      <Html position={[0, 5, 0]} distanceFactor={14} center zIndexRange={[30, 0]}>
        <button
          onClick={fireUavSelect}
          className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded border border-zinc-800 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-300 backdrop-blur-md hover:border-[#3ff09a]/50"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ff09a]" />
          UAV-01 · Thermal UV scanning
        </button>
      </Html>
    </group>
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
          <div className="flex items-center gap-2.5 rounded border border-[#ff2233] bg-[#ff2233]/12 px-4 py-2 font-hud text-[12.5px] font-semibold text-[#ff2233] shadow-[0_0_28px_rgba(255,34,51,0.28)] backdrop-blur-md">
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
      <div className="flex flex-col items-center gap-3 font-hud text-[12px] font-medium text-[#3ff09a]/70">
        <span className="h-6 w-6 animate-spin rounded-full border border-[#3ff09a]/25 border-t-[#3ff09a]" />
        Loading terrain assets…
      </div>
    </div>
  );
}

export function Scene({ sector, cameras, selected, breach, onSelect, onTerrainReady }) {
  const controlsRef = useRef(null);
  const lite = useIsMobile();
  const [terrain, setTerrain] = useState(null);
  const onReady = useCallback(
    (obj) => {
      setTerrain(obj);
      if (obj) onTerrainReady?.();
    },
    [onTerrainReady]
  );

  const alertCam = cameras.find((c) => c.status === "ALERT");
  const focusTarget = selected || (breach && alertCam ? alertCam : null);
  const reidChain = useMemo(() => cameras.slice(0, 3).map((c) => c.pos), [cameras]);

  return (
    <>
      <color attach="background" args={[sector.bg]} />
      <fog attach="fog" args={[sector.fog, 110, 240]} />
      <ambientLight intensity={lite ? 1.25 : 1.0} color={sector.ambient} />
      <hemisphereLight args={[sector.ambient, "#2b2721", lite ? 1.05 : 0.85]} />
      {/* crisp directional sunlight — upper-left, soft shadows over the ridges */}
      <directionalLight
        position={[-38, 54, 30]}
        intensity={2.5}
        color={sector.sun}
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
          <TerrainGLB key={sector.model} model={sector.model} yExag={sector.yExag} onReady={onReady} />
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
            <ReidPath active={breach} chain={reidChain} />
            <PerimeterFence breach={breach} />
            <PatrolDrone path={sector.dronePath} />
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
        <div className="grid h-full place-items-center font-hud text-[13px] text-white/50">
          Terrain engine failed to start
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
        <span className="absolute inset-0 grid place-items-center font-hud text-[12px] font-bold text-white tabular-nums">
          {Math.round(v)}
        </span>
      </div>
      <span className="font-hud text-[10px] font-medium text-white/45">{label}</span>
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
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-hud text-[13px]">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          <Radio size={13} className="text-[#3ff09a]" />
          {cam.id} <span className="font-normal text-white/40">· Live</span>
        </span>
        <span
          className="flex items-center gap-1 text-[11px] font-semibold capitalize"
          style={{ color: alert ? RED : "#3ff09a" }}
        >
          {alert && <AlertTriangle size={11} />}
          {cam.status.toLowerCase()}
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
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-hud text-[10px] font-medium text-white/85">
          <span
            className="h-1.5 w-1.5 animate-pulse rounded-full"
            style={{ background: alert ? RED : "#3ff09a" }}
          />
          Live
        </div>
        {alert && (
          <>
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 56" preserveAspectRatio="none">
              <rect x="40" y="16" width="20" height="30" fill="none" stroke={RED} strokeWidth="0.8" strokeDasharray="3 2">
                <animate attributeName="x" values="34;48;34" dur="4s" repeatCount="indefinite" />
              </rect>
            </svg>
            <span className="pointer-events-none absolute left-1/2 top-2.5 -translate-x-1/2 whitespace-nowrap rounded border border-rose-500/60 bg-zinc-950/80 px-2 py-0.5 font-mono text-[10px] font-medium text-rose-300 backdrop-blur-md">
              Track #{cam.track ?? 7} · Person · Flagged
            </span>
          </>
        )}
      </div>

      {/* flagged target → full Re-ID dossier */}
      {alert && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("open-biometric", { detail: { id: `ALPHA-0${cam.track ?? 49}` } }))}
          className="flex w-full items-center justify-center gap-2 border-b border-[#ff2233]/40 bg-[#ff2233]/12 py-2.5 font-hud text-[12px] font-semibold text-[#ff2233] transition-colors hover:bg-[#ff2233] hover:text-black"
        >
          <ScanFace size={14} className="shrink-0" />
          Open full Re-ID dossier
          <span aria-hidden>→</span>
        </button>
      )}

      {/* circular gauges — live signal / uptime / health from /cameras/health */}
      <div className="flex items-center justify-around border-b border-white/10 px-3 py-2.5">
        <RingGauge label="Signal" value={cam.signalPct ?? 90} color={alert ? RED : "#3ff09a"} />
        <RingGauge label="Uptime" value={cam.uptimePct ?? 99} color={alert ? RED : "#3ff09a"} />
        <RingGauge label="Health" value={cam.health ?? 92} color={alert ? RED : "#3ff09a"} />
      </div>

      <div className="space-y-1.5 px-3 py-3 font-hud text-[12px] text-white/65">
        <Row k="Sector" v={cam.sector} />
        <Row k="GPS" v={`${cam.lat}, ${cam.lon}`} mono />
        <Row k="Link ping" v={`${cam.ping} ms`} mono />
        <Row k="Frame rate" v={`${(cam.fps ?? 29.8).toFixed(1)} fps`} mono />
        <div className="pt-1">
          <div className="mb-1 flex items-center gap-1.5 text-[11px] text-white/40">
            <Activity size={11} /> Detections / min · last hour
          </div>
          <Spark color={alert ? RED : "#3ff09a"} />
        </div>
      </div>

      <div className="flex border-t border-white/10 font-hud text-[12px] font-semibold">
        <a
          href="/console"
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[#3ff09a] transition-colors hover:bg-[#3ff09a] hover:text-black"
        >
          <ExternalLink size={12} /> Open in console
        </a>
        <button
          onClick={onClose}
          className="border-l border-white/10 px-3 py-2.5 font-normal text-white/55 hover:text-white"
        >
          Back to orbit
        </button>
      </div>
    </motion.div>
  );
}
function Row({ k, v, mono }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/40">{k}</span>
      <span className={`text-right text-white/80 ${mono ? "font-mono text-[11px] tabular-nums" : ""}`}>{v}</span>
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
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 font-hud text-[13px]">
        <span className="flex items-center gap-1.5 font-semibold text-white">
          <Radio size={13} className="text-[#3ff09a]" />
          UAV-01 <span className="font-normal text-white/40">· Patrol</span>
        </span>
        <span className="flex items-center gap-1 text-[11px] font-semibold text-[#3ff09a]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ff09a]" />
          Scanning
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
          style={{ backgroundImage: "repeating-linear-gradient(0deg,#3ff09a 0,#3ff09a 1px,transparent 1px,transparent 3px)" }}
        />
        <div className="pointer-events-none absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-hud text-[10px] font-medium text-white/85">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ff09a]" />
          {feed === "uav" ? "UAV optics · Sim" : "CCTV grid · Sim"}
        </div>
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 56">
          <circle cx="50" cy="28" r="9" fill="none" stroke="#3ff09a" strokeWidth="0.4" strokeDasharray="2 2">
            <animateTransform attributeName="transform" type="rotate" from="0 50 28" to="360 50 28" dur="9s" repeatCount="indefinite" />
          </circle>
          <line x1="50" y1="15" x2="50" y2="41" stroke="#3ff09a" strokeWidth="0.25" />
          <line x1="37" y1="28" x2="63" y2="28" stroke="#3ff09a" strokeWidth="0.25" />
        </svg>
      </div>

      <div className="space-y-1 border-b border-white/10 px-3 py-2.5 font-hud text-[12px] text-white/65">
        <div className="mb-1 text-[11px] text-white/40">Autonomous drone patrol</div>
        <Row k="Battery" v="84%" mono />
        <Row k="Altitude" v="420 m" mono />
        <Row k="Speed" v="54 km/h" mono />
      </div>

      <div className="flex border-b border-white/10 font-hud text-[11px] font-semibold">
        <button
          onClick={() => setFeed("cams")}
          className={`flex-1 py-2.5 transition-colors ${feed === "cams" ? "bg-[#3ff09a] text-black" : "text-white/55 hover:text-white"}`}
        >
          Surveillance cams
        </button>
        <button
          onClick={() => setFeed("uav")}
          className={`flex-1 border-l border-white/10 py-2.5 transition-colors ${feed === "uav" ? "bg-[#3ff09a] text-black" : "text-white/55 hover:text-white"}`}
        >
          UAV optics feed
        </button>
      </div>

      <div className="flex items-center justify-between border-t border-white/10 font-hud text-[11px]">
        <span className="px-3 py-2.5 text-white/35">Roadmap · not deployed</span>
        <button
          onClick={onClose}
          className="border-l border-white/10 px-3 py-2.5 font-semibold text-white/55 hover:text-white"
        >
          Back to orbit
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
            className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
              selected?.id === c.id ? "border-[#3ff09a] bg-white/10 text-zinc-100" : "border-white/15 text-zinc-400"
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
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-[12px]">
        <span className="font-semibold text-zinc-200">CCTV network</span>
        <span className="font-mono text-[11px] text-zinc-500 tabular-nums">{liveN}/{cameras.length}</span>
      </div>
      <ul>
        {cameras.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c)}
              className={`flex w-full items-center gap-2.5 border-l-2 px-3 py-1.5 text-left transition-colors ${
                selected?.id === c.id
                  ? "border-[#3ff09a] bg-white/[0.06]"
                  : "border-transparent hover:bg-white/[0.03]"
              }`}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_INK[c.status] || CYAN }} />
              <span className={`flex-1 truncate font-mono text-[11px] ${selected?.id === c.id ? "text-zinc-100" : "text-zinc-400"}`}>{c.id}</span>
              <span className="font-mono text-[10px] font-medium" style={{ color: STATUS_INK[c.status] || "#71717a" }}>
                {c.status}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── tactical multi-terrain switcher ──────────────────────────────────── */
export function SectorSwitcher({ active, onSelect, className = "" }) {
  // warm the other terrain GLBs once the switcher is on screen
  useEffect(() => {
    const t = setTimeout(() => {
      TERRAIN_SECTORS.forEach((s) => {
        if (s.id !== active) useGLTF.preload(s.model);
      });
    }, 1200);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <div className={`flex items-center gap-1 border border-white/12 bg-black/70 p-1 backdrop-blur-md ${className}`}>
      {TERRAIN_SECTORS.map((s) => {
        const on = s.id === active;
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            title={`${s.sectorCode} · ${s.name}`}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-hud text-[11px] font-semibold transition-colors ${
              on ? "bg-[#3ff09a]/15 text-[#3ff09a]" : "text-white/55 hover:text-white"
            }`}
          >
            {on && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3ff09a]" />}
            <span className="hidden sm:inline">{s.name}</span>
            <span className="sm:hidden">{s.sectorCode}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function BorderTerrainModal({ onClose }) {
  const [sectorId, setSectorId] = useState(DEFAULT_SECTOR_ID);
  const sector = getSector(sectorId);
  const cameras = useCameras(sector);
  const [selected, setSelected] = useState(null);
  const [drone, setDrone] = useState(false);
  const [bio, setBio] = useState(null);
  const [breach, setBreach] = useState(false);
  const [loadingSector, setLoadingSector] = useState(false);
  const [webgl] = useState(() => hasWebGL());
  const lite = useIsMobile();
  const online = cameras.filter((c) => c.status === "ONLINE" || c.status === "ALERT").length;

  const selCam = selected ? cameras.find((c) => c.id === selected.id) || selected : null;
  const pickCam = (c) => { setDrone(false); setSelected(c); };

  const switchSector = useCallback((id) => {
    if (id === sectorId) return;
    setSelected(null);
    setDrone(false);
    setBio(null);
    setBreach(false);
    setLoadingSector(true);
    setSectorId(id);
  }, [sectorId]);

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
    <div className="keep-dark fixed inset-0 z-[100] flex flex-col bg-[#0a1017] font-hud text-white">
      <div className="z-30 flex items-center justify-between gap-2 border-b border-[#3ff09a]/15 bg-[#0a1016]/70 px-3 py-2.5 backdrop-blur-xl backdrop-saturate-150 sm:px-5 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="grid h-7 w-7 shrink-0 place-items-center border border-[#3ff09a]/50 text-[#3ff09a]">
            <MapPin size={14} />
          </span>
          <div className="min-w-0 leading-tight">
            <div className="truncate font-hud text-[13px] font-semibold tracking-tight sm:text-[14px]">
              {sector.sectorCode} <span className="hidden font-normal text-white/55 sm:inline">· Live Terrain Model</span>
            </div>
            <div className="truncate font-hud text-[11px] text-white/45">
              {cameras.length} nodes · {online} live · {sector.agency}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <button
            onClick={() => setBreach((b) => !b)}
            className="flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-hud text-[11px] font-semibold transition-colors sm:px-3"
            style={{
              borderColor: breach ? RED : "rgba(255,255,255,0.25)",
              background: breach ? RED : "transparent",
              color: breach ? "#000" : "#fff",
            }}
          >
            <AlertTriangle size={12} />
            <span className="hidden sm:inline">{breach ? "Clear alert" : "Simulate breach"}</span>
            <span className="sm:hidden">{breach ? "Clear" : "Breach"}</span>
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
                  <Scene
                    sector={sector}
                    cameras={cameras}
                    selected={selected}
                    breach={breach}
                    onSelect={pickCam}
                    onTerrainReady={() => setLoadingSector(false)}
                  />
                </Suspense>
              </Canvas>
            </Suspense>
          </SceneBoundary>
        ) : (
          <div className="grid h-full place-items-center px-6 text-center font-hud text-[13px] leading-relaxed text-white/45">
            WebGL is unavailable in this browser
          </div>
        )}

        <div className="pointer-events-none absolute inset-4 z-10">
          {["left-0 top-0 border-l border-t", "right-0 top-0 border-r border-t", "bottom-0 left-0 border-b border-l", "bottom-0 right-0 border-b border-r"].map(
            (c) => (
              <span key={c} className={`absolute h-4 w-4 border-[#3ff09a]/40 ${c}`} />
            )
          )}
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 hidden text-center font-hud text-[11px] text-white/35 sm:block">
          Drag to orbit · scroll to zoom · tap a camera or the UAV for its feed
        </div>

        <SectorSwitcher
          active={sectorId}
          onSelect={switchSector}
          className="pointer-events-auto absolute left-1/2 top-4 z-20 -translate-x-1/2"
        />

        {loadingSector && (
          <div className="pointer-events-none absolute inset-x-0 top-1/2 z-20 -translate-y-1/2 text-center">
            <span className="inline-flex items-center gap-2 border border-[#3ff09a]/30 bg-black/70 px-3 py-1.5 font-hud text-[11px] text-white/70 backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#3ff09a]" />
              Loading {sector.name} · {sector.sectorCode}
            </span>
          </div>
        )}

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
