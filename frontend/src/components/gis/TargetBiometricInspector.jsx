import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, useGLTF } from "@react-three/drei";
import { motion, AnimatePresence } from "framer-motion";
import * as THREE from "three";
import { X, ShieldAlert, Crosshair, Radio, Send, Archive } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   TargetBiometricInspector — slide-over "AI Target Biometrics &
   Multi-Camera Re-ID Inspector". Holographic wireframe of the subject
   (public/models/suspect_biometric.glb) with body-landmark hotspots, a
   vertical profiling scan line, plus the cross-camera match trail and
   inference metrics. Opens from the right on a flagged-target click.

   NOTE: a simulation dossier — biometric %, height and hash values are
   illustrative placeholders (flagged in the footer). Cross-camera Re-ID
   is a real capability, validated on the CAM_ALPHA ↔ CAM_BRAVO pair.
   ═══════════════════════════════════════════════════════════════════════ */

const CYAN = "#3ff09a";
const AMBER = "#f5b544";
const CRIMSON = "#ff2233";
const MODEL = "/models/suspect_biometric.glb";
useGLTF.preload(MODEL);

const HOTSPOTS = [
  { y: 1.32, tone: CRIMSON, label: "Concealment detected", detail: "Face covering · 94.2%" },
  { y: 0.24, tone: CYAN, label: "Attire · dark tactical jacket", detail: "Backpack confirmed" },
  { y: -0.62, tone: AMBER, label: "Gait speed · 1.4 m/s", detail: "Suspicious loitering vector" },
  { y: -1.34, tone: CYAN, label: "Estimated height", detail: "181.4 cm (±2 cm)" },
];

const TRAIL = [
  { sector: "Sector 1", time: "14:32:01 UTC", cam: "CAM_ALPHA", note: "Detected moving south", conf: 98.4, clip: "/data/ibvap_real_yolo_demo.mp4" },
  { sector: "Sector 4", time: "14:34:18 UTC", cam: "CAM_BRAVO", note: "Geofence fence approach", conf: 96.1, clip: "/data/people_surveillance_web.mp4" },
  { sector: "Sector 4", time: "14:35:42 UTC", cam: "CAM_CHARLIE", note: "Active perimeter breach", conf: 99.2, clip: "/data/cross_cam_real_demo_web.mp4" },
];

/* ── 3D: holographic subject ──────────────────────────────────────────── */
function SubjectHologram() {
  const { scene } = useGLTF(MODEL);
  const turntable = useRef(null);
  const scan = useRef(null);

  const model = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = 2.7 / (size.y || 1);
    s.scale.setScalar(k);
    s.position.set(-center.x * k, -center.y * k, -center.z * k);
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshBasicMaterial({
        color: new THREE.Color(CYAN).multiplyScalar(1.4),
        wireframe: true,
        transparent: true,
        opacity: 0.55,
        toneMapped: false,
      });
    });
    return s;
  }, [scene]);

  // faint solid inner shell so the wireframe reads as a volume
  const shell = useMemo(() => {
    const s = model.clone(true);
    s.traverse((o) => {
      if (!o.isMesh) return;
      o.material = new THREE.MeshBasicMaterial({
        color: "#0a2b31",
        transparent: true,
        opacity: 0.28,
        side: THREE.BackSide,
        toneMapped: false,
      });
    });
    return s;
  }, [model]);

  useFrame((state, dt) => {
    if (turntable.current) turntable.current.rotation.y += dt * 0.45;
    if (scan.current) {
      const t = state.clock.getElapsedTime();
      scan.current.position.y = Math.sin(t * 0.9) * 1.5;
      scan.current.material.opacity = 0.4 + (Math.sin(t * 6) + 1) * 0.12;
    }
  });

  return (
    <group ref={turntable}>
      <primitive object={shell} />
      <primitive object={model} />

      {/* vertical profiling scan plane */}
      <mesh ref={scan} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[2.4, 2.4]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
      </mesh>

      {/* landmark hotspots — labels alternate sides, kept inside the panel */}
      {HOTSPOTS.map((h, i) => {
        const left = i % 2 === 0;
        return (
          <group key={i} position={[0, h.y, 0.26]}>
            <mesh>
              <sphereGeometry args={[0.04, 12, 12]} />
              <meshBasicMaterial color={h.tone} toneMapped={false} />
            </mesh>
            <mesh position={[left ? -0.28 : 0.28, 0, 0]}>
              <boxGeometry args={[0.56, 0.005, 0.005]} />
              <meshBasicMaterial color={h.tone} toneMapped={false} />
            </mesh>
            <Html
              position={[left ? -0.62 : 0.62, 0, 0]}
              center={false}
              distanceFactor={4.4}
              zIndexRange={[20, 0]}
              style={{ transform: `translate(${left ? "-100%" : "0"}, -50%)` }}
            >
              <div
                className={`pointer-events-none w-[120px] bg-black/85 px-1.5 py-1 font-mono text-[8px] leading-tight backdrop-blur-md ${left ? "border-r-2 text-right" : "border-l-2"}`}
                style={{ borderColor: h.tone, color: h.tone }}
              >
                <div className="font-bold">{h.label}</div>
                <div className="text-white/70">[{h.detail}]</div>
              </div>
            </Html>
          </group>
        );
      })}

      <gridHelper args={[6, 12, "#1c4a4f", "#12333799"]} position={[0, -1.55, 0]} />
    </group>
  );
}

class GLBoundary extends Component {
  constructor(p) { super(p); this.state = { dead: false }; }
  static getDerivedStateFromError() { return { dead: true }; }
  render() {
    return this.state.dead
      ? <div className="grid h-full place-items-center font-mono text-[10px] text-white/40">Hologram offline</div>
      : this.props.children;
  }
}

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

/* ── animated detection box for the trail thumbnails ──────────────────── */
function TrailBox({ tone }) {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 56" preserveAspectRatio="none">
      <rect x="38" y="14" width="24" height="34" fill="none" stroke={tone} strokeWidth="1" strokeDasharray="4 2">
        <animate attributeName="x" values="30;52;30" dur="5s" repeatCount="indefinite" />
      </rect>
    </svg>
  );
}

/* ── main drawer ──────────────────────────────────────────────────────── */
export default function TargetBiometricInspector({ open, onClose, subject = {} }) {
  const [webgl] = useState(() => hasWebGL());
  const id = subject.id || "ALPHA-049";
  const hash = subject.hash || "8F4B-91A0-E3C2-0049";

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const body = (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[120] flex justify-end bg-black/55 font-hud backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.aside
            className="flex h-full w-full max-w-[440px] flex-col border-l border-[#3ff09a]/20 bg-[#050508] text-white shadow-[0_0_60px_rgba(0,0,0,0.7)]"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="border-b border-white/10 bg-[#0B0F19]/80 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="leading-tight">
                  <div className="font-mono text-[10px] font-bold text-white">
                    Tactical Target Re-ID Dossier
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#3ff09a]">
                    // Subject #{id}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="grid h-7 w-7 shrink-0 place-items-center border border-white/25 text-white/60 hover:bg-white hover:text-black"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex items-center gap-1 border border-[#ff2233] bg-[#ff2233]/15 px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#ff2233]">
                  <ShieldAlert size={10} /> Threat: High [Armed / Restricted Zone]
                </span>
                <span className="font-mono text-[9px] text-white/45">
                  SHA256: {hash}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {/* hologram viewport */}
              <div className="relative h-80 border-b border-white/10 bg-gradient-to-b from-[#04141644] to-[#050508]">
                {webgl ? (
                  <GLBoundary>
                    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0.15, 5.6], fov: 34 }} gl={{ antialias: true, alpha: true, powerPreference: "default", failIfMajorPerformanceCaveat: false }}>
                      <ambientLight intensity={0.7} />
                      <pointLight position={[3, 3, 4]} intensity={1.4} color={CYAN} />
                      <Suspense fallback={null}>
                        <SubjectHologram />
                      </Suspense>
                      <OrbitControls enablePan={false} enableZoom={false} enableDamping dampingFactor={0.1} />
                    </Canvas>
                  </GLBoundary>
                ) : (
                  <div className="grid h-full place-items-center font-mono text-[10px] text-white/40">
                    biometric hologram · webgl unavailable
                  </div>
                )}
                <div className="pointer-events-none absolute left-3 top-3 font-mono text-[8px] text-[#3ff09a]/70">
                  ● biometric profiling · active
                </div>
                <div className="pointer-events-none absolute inset-3 border border-[#3ff09a]/15" />
              </div>

              {/* cross-camera match trail */}
              <div className="border-b border-white/10 px-4 py-3">
                <div className="mb-2 font-mono text-[9px] font-bold text-white/55">
                  Multi-camera cross-match trail
                </div>
                <ol className="space-y-2.5">
                  {TRAIL.map((t, i) => {
                    const breach = t.note.toLowerCase().includes("breach");
                    const tone = breach ? CRIMSON : i === 1 ? AMBER : CYAN;
                    return (
                      <li key={i} className="flex gap-2.5">
                        <div className="relative h-12 w-[72px] shrink-0 overflow-hidden border border-white/15 bg-black">
                          <video src={t.clip} autoPlay loop muted playsInline className="h-full w-full object-cover opacity-80" />
                          <TrailBox tone={tone} />
                        </div>
                        <div className="min-w-0 flex-1 font-mono text-[9.5px] leading-tight">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-bold" style={{ color: tone }}>{t.cam}</span>
                            <span className="text-white/40">{t.time}</span>
                          </div>
                          <div className="text-white/60">{t.sector} · {t.note}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="h-1 flex-1 bg-white/10">
                              <span className="block h-full" style={{ width: `${t.conf}%`, background: tone }} />
                            </span>
                            <span className="tabular-nums text-white/70">{t.conf.toFixed(1)}%</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </div>

              {/* AI inference metrics */}
              <div className="px-4 py-3">
                <div className="mb-2 font-mono text-[9px] font-bold text-white/55">
                  Real-time AI inference
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-[9.5px]">
                  <Metric k="Loitering" v="08m 42s" sub="in restricted sector" />
                  <Metric k="Match similarity" v="98.6%" tone={CYAN} />
                  <Metric k="Direction of intent" v="Bearing 194°" sub="toward border line" tone={AMBER} />
                  <Metric k="Re-ID hash" v={hash.slice(0, 9)} sub="global track key" />
                </div>
              </div>
            </div>

            {/* actions */}
            <div className="space-y-1.5 border-t border-white/10 bg-[#0B0F19]/80 px-4 py-3">
              <button className="flex w-full items-center justify-center gap-2 border border-[#ff2233] bg-[#ff2233]/15 px-3 py-2 font-mono text-[10px] font-bold text-[#ff2233] animate-pulse hover:bg-[#ff2233] hover:text-black hover:animate-none">
                <ShieldAlert size={12} /> [!] Broadcast sector lockdown
              </button>
              <div className="flex gap-1.5">
                <button className="flex flex-1 items-center justify-center gap-1.5 border border-[#3ff09a]/40 px-2 py-2 font-mono text-[9px] font-bold text-[#3ff09a] hover:bg-[#3ff09a]/15">
                  <Send size={11} /> [+] Dispatch UAV-01
                </button>
                <button
                  onClick={onClose}
                  className="flex flex-1 items-center justify-center gap-1.5 border border-white/20 px-2 py-2 font-mono text-[9px] font-bold text-white/55 hover:text-white"
                >
                  <Archive size={11} /> [X] Dismiss
                </button>
              </div>
              <div className="pt-1 text-center font-mono text-[8px] text-white/25">
                simulated dossier · demo · Re-ID validated on CAM_ALPHA↔CAM_BRAVO
              </div>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return createPortal(body, document.body);
}

function Metric({ k, v, sub, tone = "#ffffff" }) {
  return (
    <div>
      <div className="text-[8px] text-white/35">{k}</div>
      <div className="font-bold tabular-nums" style={{ color: tone }}>{v}</div>
      {sub && <div className="text-[8px] text-white/35">{sub}</div>}
    </div>
  );
}
