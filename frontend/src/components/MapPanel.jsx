import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { Box, Layers } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";

export default function MapPanel({ incidents }) {
  const [view3D, setView3D] = useState(true);
  const canvasRef = useRef(null);
  const latest = incidents?.[0];
  const label = latest
    ? `${latest.incident_id} · score ${latest.threat_score}/100`
    : "No active incident";

  useEffect(() => {
    if (!view3D || !canvasRef.current) return;
    const container = canvasRef.current;
    const w = container.clientWidth || 800;
    const h = container.clientHeight || 420;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0c10);
    scene.fog = new THREE.FogExp2(0x0a0c10, 0.012);

    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 500);
    camera.position.set(0, 28, 42);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Ambient + Directional Lights
    const amb = new THREE.AmbientLight(0x4a729e, 0.65);
    scene.add(amb);
    const dir = new THREE.DirectionalLight(0xdcf8ff, 0.85);
    dir.position.set(20, 45, 20);
    scene.add(dir);

    // Terrain & Cyber Grid
    const ter = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 100),
      new THREE.MeshStandardMaterial({ color: 0x07111e, roughness: 0.9 })
    );
    ter.rotation.x = -Math.PI / 2;
    scene.add(ter);

    const grid = new THREE.GridHelper(140, 35, 0xe8a33d, 0x16253b);
    grid.position.y = 0.02;
    scene.add(grid);

    // Road & Road markings
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 5.5),
      new THREE.MeshStandardMaterial({ color: 0x0e1724 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, 6);
    scene.add(road);

    // Braced Lattice Towers (Alpha & Bravo)
    function createTower(x, z, tint = 0xe8a33d) {
      const g = new THREE.Group();
      const legMat = new THREE.MeshStandardMaterial({ color: 0x18283f, metalness: 0.7 });
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([dx, dz]) => {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.14, 9, 6), legMat);
        leg.position.set(dx, 4.5, dz);
        g.add(leg);
      });

      const cab = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.7, 1.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x091424 })
      );
      cab.position.y = 10;
      g.add(cab);

      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(1.55, 1.55, 0.6, 8),
        new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 })
      );
      glass.position.y = 10.2;
      g.add(glass);

      // Radar dish
      const radar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.1, 0.2, 12, 1, false, 0, Math.PI),
        new THREE.MeshStandardMaterial({ color: tint, metalness: 0.8 })
      );
      radar.position.y = 11.5;
      radar.rotation.z = Math.PI / 2;
      g.add(radar);
      g._radar = radar;

      // Searchlight cone
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(5, 15, 16, 1, true),
        new THREE.MeshBasicMaterial({ color: tint, wireframe: true, transparent: true, opacity: 0.14 })
      );
      cone.position.set(0, 7.5, 3);
      cone.rotation.x = Math.PI / 2.5;
      g.add(cone);

      g.position.set(x, 0, z);
      scene.add(g);
      return g;
    }

    const towerA = createTower(-22, -4, 0xe8a33d);
    const towerB = createTower(22, -4, 0x5c93b8);

    // Hazard Geofence
    const geoBox = new THREE.Mesh(
      new THREE.BoxGeometry(36, 2.8, 7),
      new THREE.MeshBasicMaterial({ color: 0xd6534a, transparent: true, opacity: 0.14, side: THREE.DoubleSide })
    );
    geoBox.position.set(0, 1.4, 0);
    scene.add(geoBox);

    // Walking Infiltrator Avatar
    const intruder = new THREE.Group();
    const torso = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.75, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xd6534a, emissive: 0xd6534a, emissiveIntensity: 0.4 })
    );
    torso.position.y = 1.2;
    intruder.add(torso);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0x111827 })
    );
    head.position.y = 1.8;
    intruder.add(head);

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0xd6534a, side: THREE.DoubleSide })
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.05;
    intruder.add(halo);
    intruder.position.set(-20, 0, 1);
    scene.add(intruder);

    // Quadcopter UAV
    const drone = new THREE.Group();
    const dBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.2, 1.0),
      new THREE.MeshStandardMaterial({ color: 0x5c93b8, emissive: 0x5c93b8, emissiveIntensity: 0.4 })
    );
    drone.add(dBody);
    drone.position.set(0, 12, 0);
    scene.add(drone);

    // Animation loop
    let reqId;
    const clock = new THREE.Clock();
    function animate() {
      reqId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      // Rotate radar
      if (towerA._radar) towerA._radar.rotation.y += 0.03;
      if (towerB._radar) towerB._radar.rotation.y += 0.03;

      // UAV Flight
      drone.position.set(Math.cos(t * 0.4) * 16, 12 + Math.sin(t * 0.8) * 0.5, Math.sin(t * 0.4) * 10);
      drone.rotation.y = -t * 0.4;

      // Target motion
      intruder.position.x = -20 + ((t * 4) % 44);

      renderer.render(scene, camera);
    }
    animate();

    const handleResize = () => {
      const nw = container.clientWidth, nh = container.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(reqId);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
    };
  }, [view3D]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <SectionHeader
          title="Tactical Digital Twin"
          sub="3D Hardware-Grade Digital Twin and Spatio-Temporal Corridor between Checkpost Alpha and BOP Bravo."
        />
        <div className="flex items-center gap-1 rounded-[3px] border border-line bg-panel2 p-1 font-mono text-[11px]">
          <button
            onClick={() => setView3D(true)}
            className={`flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 transition-colors ${
              view3D ? "bg-amber/20 text-amberLight font-medium" : "text-dim hover:text-ink"
            }`}
          >
            <Box size={13} /> 3D Digital Twin
          </button>
          <button
            onClick={() => setView3D(false)}
            className={`flex items-center gap-1.5 rounded-[2px] px-2.5 py-1 transition-colors ${
              !view3D ? "bg-amber/20 text-amberLight font-medium" : "text-dim hover:text-ink"
            }`}
          >
            <Layers size={13} /> 2D Vector Map
          </button>
        </div>
      </div>

      <div className="relative rounded-[4px] border border-line bg-panel2 p-2">
        {view3D ? (
          <div ref={canvasRef} className="h-[440px] w-full cursor-grab active:cursor-grabbing overflow-hidden rounded-[2px]" />
        ) : (
          <div className="p-4">
            <svg viewBox="0 0 900 340" className="w-full">
              <rect x="60" y="130" width="780" height="80" fill="rgba(214,83,74,0.09)" stroke="#D6534A" strokeDasharray="4 4" strokeWidth="1.2" />
              <text x="450" y="120" fill="#8B6A67" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
                RESTRICTED BORDER CORRIDOR
              </text>

              <circle cx="170" cy="170" r="12" fill="#0E1013" stroke="#E8A33D" strokeWidth="2" />
              <path d="M 170 170 L 250 115 L 250 225 Z" fill="rgba(232,163,61,0.10)" stroke="#E8A33D" strokeWidth="1" />
              <text x="170" y="255" fill="#E8A33D" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
                CAM_ALPHA
              </text>

              <circle cx="730" cy="170" r="12" fill="#0E1013" stroke="#5C93B8" strokeWidth="2" />
              <path d="M 730 170 L 650 115 L 650 225 Z" fill="rgba(92,147,184,0.10)" stroke="#5C93B8" strokeWidth="1" />
              <text x="730" y="255" fill="#5C93B8" fontFamily="IBM Plex Mono, monospace" fontSize="11" textAnchor="middle">
                CAM_BRAVO
              </text>

              {latest && (
                <>
                  <line x1="210" y1="170" x2="690" y2="170" stroke="#E8A33D" strokeWidth="1.5" strokeDasharray="5 6" opacity="0.6" />
                  <circle cx="470" cy="170" r="6" fill="#D6534A">
                    <animate attributeName="r" values="5;8;5" dur="1.6s" repeatCount="indefinite" />
                  </circle>
                </>
              )}
              <text x="470" y="150" fill="#D6534A" fontFamily="IBM Plex Mono, monospace" fontSize="10.5" textAnchor="middle">
                {label}
              </text>
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}
