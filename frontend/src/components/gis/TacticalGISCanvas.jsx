import { Component, Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, AdaptiveDpr } from "@react-three/drei";
import * as THREE from "three";
import RealWorldGISModel from "./RealWorldGISModel.jsx";
import TopographicTerrainShader from "./TopographicTerrainShader.jsx";

/* ═══════════════════════════════════════════════════════════════════════
   TacticalGISCanvas — the R3F host.
   Renders the GIS terrain + towers + shader relief under a monochrome
   tactical lighting rig. Detects WebGL up front and, if the context is
   unavailable (or the scene throws), calls onUnavailable() so the parent
   can fall back to the 2D-canvas watchfloor — never a blank screen.
   ═══════════════════════════════════════════════════════════════════════ */

export function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

class GLBoundary extends Component {
  constructor(p) {
    super(p);
    this.state = { dead: false };
  }
  static getDerivedStateFromError() {
    return { dead: true };
  }
  componentDidCatch(err) {
    // eslint-disable-next-line no-console
    console.warn("TacticalGISCanvas: WebGL scene failed —", err?.message);
    this.props.onError?.();
  }
  render() {
    if (this.state.dead) return null;
    return this.props.children;
  }
}

function Loader() {
  return (
    <Html center>
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-white/70">
        <span className="inline-block h-2 w-2 animate-pulse bg-white" /> loading terrain mesh…
      </div>
    </Html>
  );
}

function Lighting() {
  return (
    <>
      <ambientLight intensity={0.32} />
      <directionalLight position={[18, 30, 10]} intensity={1.1} color="#ffffff" />
      <directionalLight position={[-20, 12, -14]} intensity={0.25} color="#ffffff" />
      <hemisphereLight args={["#20242b", "#000000", 0.35]} />
    </>
  );
}

export default function TacticalGISCanvas({
  focus = null,
  breach = false,
  showRelief = true,
  lineDensity = 14,
  heightScale = 5,
  onUnavailable,
}) {
  const controlsRef = useRef(null);
  const [webgl] = useState(() => hasWebGL());

  useEffect(() => {
    if (!webgl) onUnavailable?.();
  }, [webgl, onUnavailable]);

  if (!webgl) {
    return (
      <div className="absolute inset-0 grid place-items-center bg-black">
        <div className="max-w-xs text-center font-mono text-[10px] uppercase leading-relaxed tracking-[0.2em] text-white/45">
          WebGL unavailable in this browser · switch the engine toggle to 2D
        </div>
      </div>
    );
  }

  return (
    <GLBoundary onError={onUnavailable}>
      <Canvas
        className="absolute inset-0"
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: false }}
        camera={{ position: [26, 24, 30], fov: 42, near: 0.1, far: 400 }}
        onCreated={({ gl, scene }) => {
          gl.setClearColor("#050505", 1);
          scene.fog = new THREE.Fog("#050505", 55, 150);
        }}
      >
        <AdaptiveDpr pixelated />
        <Lighting />

        <Suspense fallback={<Loader />}>
          <RealWorldGISModel
            focus={focus}
            breach={breach}
            controlsRef={controlsRef}
            heightScale={heightScale}
          />
        </Suspense>

        {showRelief && (
          <group position={[0, -0.35, 0]}>
            <TopographicTerrainShader
              size={120}
              segments={200}
              heightScale={heightScale * 0.9}
              lineDensity={lineDensity}
              breachPulse={breach}
            />
          </group>
        )}

        {/* wireframe deck grid + intersection feel */}
        <gridHelper args={[120, 60, "#555e6b", "#20242b"]} position={[0, 0.02, 0]} />

        <OrbitControls
          ref={controlsRef}
          enableDamping
          dampingFactor={0.08}
          minDistance={14}
          maxDistance={90}
          maxPolarAngle={Math.PI / 2.15}
          target={[0, 0, 0]}
        />
      </Canvas>
    </GLBoundary>
  );
}
