import { Component, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════
   SentinelGlobe3D — the hero "tap to open" globe: a real textured earth
   (public/models/earth.glb, ~0.9 MB, 1024px WebP, no Draco) and nothing
   else. The old 2D dot-globe is gone: while the model loads (or if WebGL
   is unavailable) all that shows is a faint framing ring.

   Built to run on any smartphone:
     • WebGL1 or WebGL2, texture-size gate at 1024
     • no MSAA / DPR ≤ 1.5 / powerPreference "default" on mobile
     • webglcontextlost → the framing ring, for the rest of the session
   ═══════════════════════════════════════════════════════════════════════ */

const MODEL = "/models/earth.glb";
useGLTF.preload(MODEL);

function webglSupport() {
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2") ||
      c.getContext("webgl") ||
      c.getContext("experimental-webgl");
    if (!gl) return false;
    return (gl.getParameter(gl.MAX_TEXTURE_SIZE) || 0) >= 1024;
  } catch {
    return false;
  }
}

// faint framing ring — the only thing shown before the earth renders
function Ring() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="aspect-square w-[72%] rounded-full border border-white/[0.07]" />
    </div>
  );
}

class Boundary extends Component {
  constructor(p) {
    super(p);
    this.state = { dead: false };
  }
  static getDerivedStateFromError() {
    return { dead: true };
  }
  render() {
    return this.state.dead ? this.props.fallback : this.props.children;
  }
}

function Earth({ spin = true }) {
  const { scene } = useGLTF(MODEL);
  const ref = useRef(null);

  // normalise whatever scale / offset the GLB ships with → unit-ish sphere
  const model = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const k = 2 / (Math.max(size.x, size.y, size.z) || 1);
    s.scale.setScalar(k);
    s.position.set(-center.x * k, -center.y * k, -center.z * k);
    return s;
  }, [scene]);

  useFrame((_, dt) => {
    if (spin && ref.current) ref.current.rotation.y += Math.min(dt, 0.05) * 0.1;
  });

  return (
    <group ref={ref} rotation={[0.32, 0, 0.12]}>
      <primitive object={model} />
    </group>
  );
}

export default function SentinelGlobe3D({ className = "", onTap }) {
  const [ok] = useState(() => typeof window !== "undefined" && webglSupport());
  const [failed, setFailed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const down = useRef(null);
  const moved = useRef(false);
  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 640px)").matches;

  const shell = (
    <div className={`relative h-full w-full ${className}`}>
      <Ring />
    </div>
  );

  if (!ok || failed) return shell;

  return (
    <div
      className={`relative h-full w-full ${className}`}
      style={{ cursor: dragging ? "grabbing" : "grab" }}
      onPointerDownCapture={(e) => {
        down.current = [e.clientX, e.clientY];
        moved.current = false;
      }}
      onPointerMoveCapture={(e) => {
        if (!down.current) return;
        if (Math.hypot(e.clientX - down.current[0], e.clientY - down.current[1]) > 8) {
          moved.current = true;
          setDragging(true);
        }
      }}
      onPointerUpCapture={() => {
        down.current = null;
        setDragging(false);
      }}
      onClickCapture={(e) => {
        // drag-to-rotate stays on the globe; a clean tap opens the terrain modal
        e.stopPropagation();
        if (!moved.current) onTap?.();
      }}
    >
      <Ring />

      <Boundary fallback={<Ring />}>
        <Canvas
          dpr={isMobile ? [1, 1.5] : [1, 2]}
          camera={{ position: [0, 0, 3.4], fov: 34 }}
          gl={{
            antialias: !isMobile,
            alpha: true,
            powerPreference: "default",
            failIfMajorPerformanceCaveat: false,
          }}
          className="!absolute inset-0"
          style={{ background: "transparent" }}
          onCreated={({ gl }) => {
            gl.domElement.addEventListener(
              "webglcontextlost",
              (ev) => {
                ev.preventDefault();
                setFailed(true);
              },
              { once: true }
            );
          }}
        >
          <ambientLight intensity={1.15} />
          <directionalLight position={[3, 2, 4]} intensity={2.2} />
          <directionalLight position={[-4, -1, -3]} intensity={0.4} color="#5f7fd0" />
          <Suspense fallback={null}>
            <Earth spin={!dragging} />
          </Suspense>
          <OrbitControls
            enablePan={false}
            enableZoom={false}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.4}
            minPolarAngle={Math.PI * 0.12}
            maxPolarAngle={Math.PI * 0.88}
          />
        </Canvas>
      </Boundary>
    </div>
  );
}
