import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useGLTF, Line } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════════════
   RealWorldGISModel — loads /models/border_terrain.glb, re-skins it as a
   matte-black tactical mesh with a white contour/edge overlay, raycasts
   four watchtowers onto the true surface elevation, and animates the
   camera to a sector when the UI requests focus.

   If the .glb is absent (it is not committed to this repo) the component
   generates an equivalent procedural ridge-terrain with REAL geometry so
   raycasting, towers and focus all still work — nothing goes blank.
   ═══════════════════════════════════════════════════════════════════════ */

const GLB_URL = "/models/border_terrain.glb";
const WHITE = "#ffffff";
const CRIMSON = "#ff2233";

// Watchtower ground positions (x, z). Y is resolved by raycast.
const TOWERS = [
  { id: "NODE_01", state: "MONITORING", xz: [-15, -10] },
  { id: "NODE_02", state: "ACTIVE", xz: [13, -7] },
  { id: "NODE_03", state: "MONITORING", xz: [-10, 13] },
  { id: "NODE_04", state: "MONITORING", xz: [16, 12] },
];

/* ── CPU fBm — mirrors the GLSL in TopographicTerrainShader ──────────── */
function hash2(x, y) {
  const px = x * 127.1 + y * 311.7;
  const py = x * 269.5 + y * 183.3;
  const sx = Math.sin(px) * 43758.5453123;
  const sy = Math.sin(py) * 43758.5453123;
  return [-1 + 2 * (sx - Math.floor(sx)), -1 + 2 * (sy - Math.floor(sy))];
}
function gnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const d = (gx, gy, ox, oy) => {
    const [hx, hy] = hash2(gx, gy);
    return hx * (fx - ox) + hy * (fy - oy);
  };
  const a = d(ix, iy, 0, 0);
  const b = d(ix + 1, iy, 1, 0);
  const c = d(ix, iy + 1, 0, 1);
  const e = d(ix + 1, iy + 1, 1, 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, ux),
    THREE.MathUtils.lerp(c, e, ux),
    uy
  );
}
function fbm(x, y) {
  let v = 0;
  let amp = 0.5;
  let px = x;
  let py = y;
  for (let i = 0; i < 6; i++) {
    v += amp * gnoise(px, py);
    const nx = 0.8 * px + 0.6 * py;
    const ny = -0.6 * px + 0.8 * py;
    px = nx * 2.02;
    py = ny * 2.02;
    amp *= 0.5;
  }
  return v;
}
function terrainHeight(x, z, heightScale) {
  const e = Math.pow(Math.abs(fbm(x * 0.14, z * 0.14)), 1.35) * 1.9;
  return e * heightScale;
}

const TAC_MATERIAL = () =>
  new THREE.MeshStandardMaterial({
    color: "#0a0a0a",
    roughness: 0.8,
    metalness: 0.2,
    flatShading: false,
  });

/* ── procedural fallback terrain (real geometry, raycastable) ───────── */
function useProceduralTerrain(size, segments, heightScale) {
  return useMemo(() => {
    const geo = new THREE.PlaneGeometry(size, size, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, terrainHeight(x, z, heightScale));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }, [size, segments, heightScale]);
}

/* ── one watchtower: mast, base, pulsing ring, FOV frustum, label ───── */
function Watchtower({ node, position, focused, breach }) {
  const ringRef = useRef(null);
  const coneRef = useRef(null);
  const t = useRef(Math.random() * 6);
  const alert = node.state === "ACTIVE" || (breach && node.id === "NODE_01");
  const ink = alert || breach ? CRIMSON : WHITE;

  useFrame((_, dt) => {
    t.current += dt;
    const k = (Math.sin(t.current * 2.4) + 1) / 2;
    if (ringRef.current) {
      const s = 1 + k * 1.4 + (focused ? 0.5 : 0);
      ringRef.current.scale.setScalar(s);
      ringRef.current.material.opacity = 0.7 * (1 - k) + (focused ? 0.15 : 0);
    }
    if (coneRef.current) {
      coneRef.current.rotation.y += dt * 0.35;
      coneRef.current.material.opacity = 0.06 + k * 0.05 + (alert ? 0.04 : 0);
    }
  });

  return (
    <group position={position}>
      {/* mast */}
      <mesh position={[0, 1.6, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 3.2, 6]} />
        <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0.2} />
      </mesh>
      {/* base pad */}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 0.1, 20]} />
        <meshStandardMaterial color="#050505" roughness={0.9} metalness={0.1} />
      </mesh>
      {/* sensor head */}
      <mesh position={[0, 3.3, 0]}>
        <boxGeometry args={[0.5, 0.4, 0.5]} />
        <meshStandardMaterial color={ink} emissive={ink} emissiveIntensity={alert ? 0.9 : 0.35} />
      </mesh>
      {/* pulsing status ring */}
      <mesh ref={ringRef} position={[0, 3.3, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.72, 40]} />
        <meshBasicMaterial color={ink} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      {/* FOV frustum cone — points outward toward the border (−Z) */}
      <mesh
        ref={coneRef}
        position={[0, 3.0, -6]}
        rotation={[Math.PI / 2, 0, 0]}
      >
        <coneGeometry args={[3.4, 12, 22, 1, true]} />
        <meshBasicMaterial
          color={alert ? CRIMSON : WHITE}
          transparent
          opacity={0.08}
          wireframe
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* ground marker */}
      <mesh position={[0, 0.12, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.1, 1.25, 32]} />
        <meshBasicMaterial color={ink} transparent opacity={focused ? 0.9 : 0.4} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ── re-ID trajectory: dashed Bezier spline NODE_01 → NODE_03 ───────── */
function TrajectorySpline({ a, b, breach }) {
  const lineRef = useRef(null);
  const points = useMemo(() => {
    if (!a || !b) return [];
    const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
    mid.y += 6;
    mid.x += 3;
    const curve = new THREE.QuadraticBezierCurve3(
      a.clone().setY(a.y + 1.5),
      mid,
      b.clone().setY(b.y + 1.5)
    );
    return curve.getPoints(60);
  }, [a, b]);

  useFrame((_, dt) => {
    if (lineRef.current?.material) {
      lineRef.current.material.dashOffset -= dt * 2.2;
    }
  });

  if (points.length === 0) return null;
  return (
    <Line
      ref={lineRef}
      points={points}
      color={breach ? CRIMSON : WHITE}
      lineWidth={1.4}
      dashed
      dashScale={2.4}
      dashSize={0.7}
      gapSize={0.4}
      transparent
      opacity={0.85}
    />
  );
}

/* ── camera rig — lerps toward a focused tower ──────────────────────── */
function FocusRig({ focus, towerPositions, controlsRef }) {
  const { camera } = useThree();
  const home = useRef(new THREE.Vector3(26, 24, 30));
  const desired = useRef(new THREE.Vector3(26, 24, 30));
  const lookAt = useRef(new THREE.Vector3(0, 0, 0));

  useEffect(() => {
    if (focus && towerPositions[focus]) {
      const p = towerPositions[focus];
      desired.current.set(p.x + 8, p.y + 10, p.z + 14);
      lookAt.current.copy(p);
    } else {
      desired.current.copy(home.current);
      lookAt.current.set(0, 0, 0);
    }
  }, [focus, towerPositions]);

  useFrame((_, dt) => {
    const k = 1 - Math.pow(0.001, dt);
    camera.position.lerp(desired.current, k);
    if (controlsRef?.current) {
      controlsRef.current.target.lerp(lookAt.current, k);
      controlsRef.current.update();
    } else {
      camera.lookAt(lookAt.current);
    }
  });
  return null;
}

/* ── GLB skin: matte-black + white edge overlay ─────────────────────── */
function skinScene(scene) {
  const added = [];
  scene.traverse((child) => {
    if (!child.isMesh) return;
    child.material = TAC_MATERIAL();
    child.castShadow = false;
    child.receiveShadow = false;
    try {
      const edges = new THREE.EdgesGeometry(child.geometry, 28);
      const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: WHITE, transparent: true, opacity: 0.28 })
      );
      child.add(line);
      added.push(line);
    } catch {
      /* geometry without indexable edges — skip overlay */
    }
  });
  return added;
}

function GLBTerrain({ url, onReady }) {
  const gltf = useGLTF(url);
  useLayoutEffect(() => {
    skinScene(gltf.scene);
    onReady?.(gltf.scene);
  }, [gltf, onReady]);
  return <primitive object={gltf.scene} />;
}

/* ═══════════════════════════════════════════════════════════════════════ */
export default function RealWorldGISModel({
  focus = null,
  breach = false,
  controlsRef,
  heightScale = 5,
  size = 70,
  segments = 180,
  forceProcedural = false,
}) {
  const [glbOk, setGlbOk] = useState(null); // null = checking, true/false resolved
  const [terrainMesh, setTerrainMesh] = useState(null);
  const proceduralGeo = useProceduralTerrain(size, segments, heightScale);
  const proceduralRef = useRef(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);

  // does the .glb actually exist?
  useEffect(() => {
    if (forceProcedural) {
      setGlbOk(false);
      return;
    }
    let alive = true;
    fetch(GLB_URL, { method: "HEAD" })
      .then((r) => {
        if (alive) setGlbOk(r.ok && (r.headers.get("content-type") || "").includes("model"));
      })
      .catch(() => alive && setGlbOk(false));
    return () => {
      alive = false;
    };
  }, [forceProcedural]);

  // resolve tower elevations by raycasting straight down onto the terrain
  const towerPositions = useMemo(() => {
    const target = terrainMesh || proceduralRef.current;
    const out = {};
    for (const tw of TOWERS) {
      const [x, z] = tw.xz;
      let y = terrainHeight(x, z, heightScale);
      if (target) {
        raycaster.set(new THREE.Vector3(x, 500, z), new THREE.Vector3(0, -1, 0));
        const hit = raycaster.intersectObject(target, true)[0];
        if (hit) y = hit.point.y;
      }
      out[tw.id] = new THREE.Vector3(x, y, z);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terrainMesh, glbOk, heightScale, raycaster]);

  const useGlb = glbOk === true;

  return (
    <group>
      {/* terrain */}
      {useGlb ? (
        <GLBTerrain url={GLB_URL} onReady={setTerrainMesh} />
      ) : (
        <mesh ref={proceduralRef} geometry={proceduralGeo}>
          <meshStandardMaterial color="#0a0a0a" roughness={0.8} metalness={0.2} />
          {/* white contour / wireframe overlay */}
          <mesh geometry={proceduralGeo}>
            <meshBasicMaterial color={WHITE} wireframe transparent opacity={0.12} />
          </mesh>
        </mesh>
      )}

      {/* geofence tripwire — flashes crimson on breach */}
      <GeofenceTripwire heightScale={heightScale} breach={breach} />

      {/* watchtowers */}
      {TOWERS.map((tw) => (
        <Watchtower
          key={tw.id}
          node={tw}
          position={towerPositions[tw.id]}
          focused={focus === tw.id}
          breach={breach}
        />
      ))}

      {/* multi-camera re-ID trajectory NODE_01 → NODE_03 */}
      <TrajectorySpline a={towerPositions.NODE_01} b={towerPositions.NODE_03} breach={breach} />

      <FocusRig focus={focus} towerPositions={towerPositions} controlsRef={controlsRef} />
    </group>
  );
}

function GeofenceTripwire({ heightScale, breach }) {
  const ref = useRef(null);
  const points = useMemo(() => {
    const pts = [];
    for (let x = -32; x <= 32; x += 1.5) {
      pts.push(new THREE.Vector3(x, terrainHeight(x, -15, heightScale) + 0.4, -15));
    }
    return pts;
  }, [heightScale]);

  useFrame((_, dt) => {
    if (ref.current?.material && breach) {
      ref.current.material.dashOffset -= dt * 5;
    }
  });

  return (
    <Line
      ref={ref}
      points={points}
      color={breach ? CRIMSON : WHITE}
      lineWidth={breach ? 2.4 : 1.3}
      dashed={breach}
      dashSize={0.6}
      gapSize={0.3}
      transparent
      opacity={breach ? 0.95 : 0.5}
    />
  );
}

// best-effort preload; harmless if the file is absent
try {
  useGLTF.preload(GLB_URL);
} catch {
  /* noop */
}
