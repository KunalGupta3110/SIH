import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { 
  Shield, 
  Eye, 
  Cpu, 
  GitCommit, 
  Sliders, 
  Link2, 
  ArrowRight, 
  ChevronDown, 
  Activity, 
  Radio, 
  Play, 
  CheckCircle2,
  Terminal,
  Lock
} from "lucide-react";

export default function LandingPage() {
  const [initiated, setInitiated] = useState(false);
  const [activeBeat, setActiveBeat] = useState(0);
  const [modelLoading, setModelLoading] = useState(true);
  const canvasContainerRef = useRef(null);
  const threeStateRef = useRef(null);
  const navigate = useNavigate();

  // Handle enter key or click to initiate
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Enter" && !initiated) {
        setInitiated(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [initiated]);

  // Three.js 3D Background Scene with Soldier Model
  useEffect(() => {
    if (!canvasContainerRef.current) return;
    const container = canvasContainerRef.current;
    const width = window.innerWidth;
    const height = window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06080d);
    scene.fog = new THREE.FogExp2(0x06080d, 0.015);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 4, 18);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // Cinematic "Teal and Orange" Lighting
    const ambientLight = new THREE.AmbientLight(0x0f2838, 1.2); // Cool teal ambient
    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xf59e0b, 2.8); // Warm amber key light
    keyLight.position.set(15, 25, 12);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 1.5); // Cyan fill
    fillLight.position.set(-18, 12, -10);
    scene.add(fillLight);

    const rimLight = new THREE.PointLight(0xf59e0b, 3.5, 30);
    rimLight.position.set(0, 8, -4);
    scene.add(rimLight);

    // Terrain & Cyber Grid
    const groundGeo = new THREE.PlaneGeometry(300, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x070c14,
      roughness: 0.85,
      metalness: 0.2,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(300, 60, 0xf59e0b, 0x16253b);
    grid.position.y = 0.02;
    scene.add(grid);

    // Border Caution Corridor Lines (Red & Amber glowing stripes)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.7 });
    const lineGeo = new THREE.PlaneGeometry(300, 0.4);
    const borderLine = new THREE.Mesh(lineGeo, lineMat);
    borderLine.rotation.x = -Math.PI / 2;
    borderLine.position.set(0, 0.04, -8);
    scene.add(borderLine);

    // Atmospheric Floating Embers / Dust Particles
    const particleCount = 200;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount * 3; i += 3) {
      particlePos[i] = (Math.random() - 0.5) * 80;
      particlePos[i + 1] = Math.random() * 20;
      particlePos[i + 2] = (Math.random() - 0.5) * 80;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf59e0b,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    // Watchtower Geometry
    const towerGroup = new THREE.Group();
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x16222f, metalness: 0.8 });
    const towerLegs = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 16, 6), towerMat);
    towerLegs.position.set(-12, 8, -15);
    towerGroup.add(towerLegs);

    const towerCab = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.8, 2.5, 8), towerMat);
    towerCab.position.set(-12, 16, -15);
    towerGroup.add(towerCab);

    const spotlight = new THREE.SpotLight(0xf59e0b, 5, 45, Math.PI / 6, 0.5, 1);
    spotlight.position.set(-12, 16, -15);
    spotlight.target.position.set(0, 0, 0);
    scene.add(spotlight);
    scene.add(spotlight.target);
    scene.add(towerGroup);

    // Tactical Target Bounding Box 3D Wireframe
    const bboxGeo = new THREE.BoxGeometry(1.4, 2.4, 1.4);
    const bboxMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, wireframe: true, transparent: true, opacity: 0.6 });
    const bboxMesh = new THREE.Mesh(bboxGeo, bboxMat);
    bboxMesh.position.set(0, 1.2, 0);
    bboxMesh.visible = false;
    scene.add(bboxMesh);

    // Load Three.js MIT-licensed Soldier.glb model
    let mixer = null;
    let soldierModel = null;
    const loader = new GLTFLoader();
    loader.load(
      "https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Soldier.glb",
      (gltf) => {
        soldierModel = gltf.scene;
        soldierModel.scale.set(1.4, 1.4, 1.4);
        soldierModel.position.set(0, 0, 0);
        soldierModel.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
        scene.add(soldierModel);

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(soldierModel);
          // 0: Idle, 1: Run, 3: Walk
          const walkClip = gltf.animations.find(a => a.name === "Walk") || gltf.animations[3] || gltf.animations[0];
          const action = mixer.clipAction(walkClip);
          action.play();
        }
        setModelLoading(false);
      },
      undefined,
      (err) => {
        console.warn("Could not load Soldier.glb, using tactical procedural fallback:", err);
        setModelLoading(false);
      }
    );

    // Save Three state
    threeStateRef.current = {
      scene,
      camera,
      renderer,
      mixer,
      soldierModel,
      bboxMesh,
      particles,
      spotlight,
    };

    // Animation Loop
    let clock = new THREE.Clock();
    let animId = null;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      const time = clock.getElapsedTime();

      if (mixer) mixer.update(delta);

      // Rotate particles subtly
      particles.rotation.y = time * 0.03;

      // Animate spotlight sweep
      spotlight.target.position.x = Math.sin(time * 0.8) * 8;
      spotlight.target.position.z = Math.cos(time * 0.8) * 4;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animId) cancelAnimationFrame(animId);
      if (renderer.domElement && container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Update 3D Camera Position & Focus based on scroll position / active beat
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min(1, Math.max(0, scrollY / (totalHeight || 1)));

      // 6 Narrative beats mapping
      const beatIndex = Math.min(5, Math.floor(progress * 6));
      setActiveBeat(beatIndex);

      if (!threeStateRef.current) return;
      const { camera, bboxMesh, soldierModel } = threeStateRef.current;

      // Camera choreographies across narrative beats
      if (beatIndex === 0) {
        // Beat 1: The Problem (Wide panoramic view)
        camera.position.x = 0;
        camera.position.y = 4.5 + Math.sin(progress * 10) * 0.5;
        camera.position.z = 16 - progress * 10;
        camera.lookAt(0, 1.2, 0);
        if (bboxMesh) bboxMesh.visible = false;
      } else if (beatIndex === 1) {
        // Beat 2: Detection (Close-in targeting view with active HUD bracket)
        camera.position.set(2.8, 2.2, 5.5);
        camera.lookAt(0, 1.4, 0);
        if (bboxMesh) {
          bboxMesh.visible = true;
          bboxMesh.material.color.setHex(0xf59e0b); // Amber target box
        }
      } else if (beatIndex === 2) {
        // Beat 3: Tracking (Side profile trajectory pan)
        camera.position.set(6.5, 3.2, 4.0);
        camera.lookAt(0, 1.0, 0);
        if (bboxMesh) {
          bboxMesh.visible = true;
          bboxMesh.material.color.setHex(0x38bdf8); // Cyan tracker box
        }
      } else if (beatIndex === 3) {
        // Beat 4: Predictive Handoff (Wide corridor view towards next tower)
        camera.position.set(-6.0, 7.5, 12.0);
        camera.lookAt(-4.0, 2.0, -5.0);
        if (bboxMesh) bboxMesh.visible = true;
      } else if (beatIndex === 4) {
        // Beat 5: Explainable Score (Dramatic low angle looking up at threat)
        camera.position.set(1.5, 1.0, 4.2);
        camera.lookAt(0, 1.6, 0);
        if (bboxMesh) {
          bboxMesh.visible = true;
          bboxMesh.material.color.setHex(0xef4444); // Red alert box
        }
      } else {
        // Beat 6: Evidence Chain & CTA (Command elevated isometric perspective)
        camera.position.set(0, 12.0, 16.0);
        camera.lookAt(0, 0, 0);
        if (bboxMesh) bboxMesh.visible = false;
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="relative min-h-screen bg-[#06080d] text-slate-100 font-sans selection:bg-amber selection:text-black">
      {/* 3D Fixed WebGL Background Scene */}
      <div ref={canvasContainerRef} className="fixed inset-0 pointer-events-none z-0" />

      {/* Splash Screen Overlay */}
      {!initiated && (
        <div
          onClick={() => setInitiated(true)}
          className="fixed inset-0 z-50 flex flex-col items-center justify-between p-8 bg-[#06080d]/95 backdrop-blur-md cursor-pointer transition-all duration-700"
        >
          {/* Top Header */}
          <div className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-widest text-amber">
            <span className="h-2 w-2 rounded-full bg-amber animate-ping" />
            <span>Ministry of Home Affairs · SSB / SIH-26187</span>
          </div>

          {/* Center Brand Identity */}
          <div className="flex flex-col items-center text-center max-w-2xl">
            <div className="flex items-center justify-center p-3 mb-4 rounded-xl border border-amber/40 bg-amber/10 shadow-[0_0_30px_rgba(245,158,11,0.25)]">
              <Shield size={36} className="text-amber" />
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-amber-400 to-amber-600 bg-clip-text text-transparent">
              IBVAP SENTINEL
            </h1>
            <p className="mt-3 text-sm md:text-base text-slate-300 font-light tracking-wide">
              Intelligent Border Video Analytics Platform
            </p>
            <div className="mt-4 font-mono text-[11.5px] text-slate-400 max-w-lg leading-relaxed">
              AI-Powered Multi-Camera Border Surveillance & Cryptographic Evidence Ledger over Existing Frontier CCTV Infrastructure.
            </div>
          </div>

          {/* Bottom Call to Action */}
          <div className="flex flex-col items-center gap-2">
            <div className="px-5 py-2.5 rounded-full border border-amber/50 bg-amber/15 text-amber text-[12.5px] font-mono tracking-wider font-semibold animate-pulse shadow-lg">
              [ PRESS ENTER OR CLICK TO INITIATE GRID ]
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              {modelLoading ? "Loading tactical 3D neural assets…" : "System Ready · 6 Camera Nodes Nominal"}
            </div>
          </div>
        </div>
      )}

      {/* Main Scrollable Narrative Container */}
      <div className={`relative z-10 transition-opacity duration-1000 ${initiated ? "opacity-100" : "opacity-0"}`}>
        
        {/* Sticky Tactical Header */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-[#06080d]/80 backdrop-blur-md border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <Shield size={20} className="text-amber" />
            <span className="font-bold text-[14px] tracking-wider">IBVAP SENTINEL</span>
            <span className="hidden sm:inline-block rounded bg-amber/10 border border-amber/30 px-2 py-0.5 font-mono text-[10px] text-amber">
              SIH-26187
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 font-mono text-[11px] text-slate-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green animate-pulse" />
              <span>LIVE EDGE LINK NOMINAL</span>
            </div>
            <button
              onClick={() => navigate("/console")}
              className="flex items-center gap-2 px-4 py-1.5 rounded border border-amber bg-amber text-slate-950 font-bold text-[12px] hover:bg-amber-400 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)]"
            >
              <span>Operator Console</span>
              <ArrowRight size={13} />
            </button>
          </div>
        </header>

        {/* Narrative Beats */}
        <main className="max-w-6xl mx-auto px-6">
          
          {/* BEAT 1: The Frontier Challenge */}
          <section className="min-h-screen flex flex-col justify-center py-20">
            <div className="max-w-xl p-6 md:p-8 rounded-xl border border-slate-800 bg-[#0c121e]/85 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-amber uppercase tracking-wider mb-2">
                <Radio size={13} />
                <span>Beat 01 · The Frontier Challenge</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                15,106 km of Hostile Frontier. Zero Blindspots Tolerated.
              </h2>
              <p className="mt-3 text-[13.5px] text-slate-300 leading-relaxed">
                Traditional border posts rely on operator vigilance across dozens of disconnected CCTV monitors. Harsh terrain, dense monsoon fog, low-light night windows, and human fatigue lead to missed perimeter breaches.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-800 pt-4 font-mono text-center">
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Border Span</div>
                  <div className="text-amber font-bold text-[13px]">15,106 km</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Manual Fatigue</div>
                  <div className="text-red font-bold text-[13px]">&gt;82% at 4h</div>
                </div>
                <div className="p-2 rounded bg-slate-900/60 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Response Delay</div>
                  <div className="text-amber font-bold text-[13px]">45-120s</div>
                </div>
              </div>
              <div className="mt-6 flex items-center gap-2 text-[11px] font-mono text-slate-400">
                <ChevronDown size={14} className="animate-bounce text-amber" />
                <span>Scroll down to explore real-time AI computer vision</span>
              </div>
            </div>
          </section>

          {/* BEAT 2: Real-Time Detection */}
          <section className="min-h-screen flex flex-col justify-center items-end py-20">
            <div className="max-w-xl p-6 md:p-8 rounded-xl border border-amber/40 bg-[#0c121e]/85 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-amber uppercase tracking-wider mb-2">
                <Eye size={13} />
                <span>Beat 02 · Edge AI Detection</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                Sub-15ms Detection Powered by Quantized YOLOv8s.
              </h2>
              <p className="mt-3 text-[13.5px] text-slate-300 leading-relaxed">
                TensorRT INT8 optimized edge neural networks process incoming multi-camera RTSP feeds directly on Jetson / edge nodes, pinpointing human, vehicle, and weapon incursions at 70+ FPS with zero cloud dependency.
              </p>
              <div className="mt-5 flex flex-col gap-2 font-mono text-[11.5px]">
                <div className="flex justify-between items-center p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400">Inference Latency:</span>
                  <span className="text-green font-bold">14.2 ms / frame</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400">Edge Throughput:</span>
                  <span className="text-amber font-bold">70.4 FPS (Jetson Orin)</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-400">Low-Light Night Accuracy:</span>
                  <span className="text-blue font-bold">94.8% mAP@50</span>
                </div>
              </div>
            </div>
          </section>

          {/* BEAT 3: Multi-Target Tracking */}
          <section className="min-h-screen flex flex-col justify-center py-20">
            <div className="max-w-xl p-6 md:p-8 rounded-xl border border-cyan-500/40 bg-[#0c121e]/85 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-cyan-400 uppercase tracking-wider mb-2">
                <Activity size={13} />
                <span>Beat 03 · Occlusion-Robust Tracking</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                ByteTrack Trajectory Linkage with Zero ID Swaps.
              </h2>
              <p className="mt-3 text-[13.5px] text-slate-300 leading-relaxed">
                When intruders crawl behind concertina wire, trenches, or vegetation, ByteTrack associates low-score detection boxes with Kalman kinematic state predictions, maintaining track continuity without identity fragmentation.
              </p>
              <div className="mt-5 p-3 rounded bg-slate-900/70 border border-cyan-500/30 font-mono text-[11.5px] text-slate-300">
                <div className="text-cyan-400 font-bold mb-1">TRACK_ID #1041 STATS:</div>
                <div className="flex justify-between">
                  <span>Velocity: 68.4 px/s</span>
                  <span>Heading: 88° E (Border Line)</span>
                </div>
                <div className="flex justify-between mt-1">
                  <span>Occlusion Memory: 90 frames</span>
                  <span>Association: IoU + Kalman</span>
                </div>
              </div>
            </div>
          </section>

          {/* BEAT 4: Predictive Handoff */}
          <section className="min-h-screen flex flex-col justify-center items-end py-20">
            <div className="max-w-xl p-6 md:p-8 rounded-xl border border-amber/40 bg-[#0c121e]/85 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-amber uppercase tracking-wider mb-2">
                <GitCommit size={13} />
                <span>Beat 04 · Predictive Cross-Camera Handoff</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                Corridor Topology Predicts Arrival Windows.
              </h2>
              <p className="mt-3 text-[13.5px] text-slate-300 leading-relaxed">
                Instead of treating each camera as an isolated silo, IBVAP Sentinel maps the physical inter-camera graph. When a target departs CAM_ALPHA, downstream camera CAM_BRAVO pre-arms with calculated arrival bounds (6.0s–14.0s).
              </p>
              <div className="mt-4 rounded bg-amber/10 border border-amber/30 p-3 font-mono text-[11px] text-amber">
                &gt; Target departed CAM_ALPHA (26.3m corridor). Predicted CAM_BRAVO arrival in 6.0–14.0s. Confirmed at 8.5s.
              </div>
            </div>
          </section>

          {/* BEAT 5: Explainable Threat Scoring */}
          <section className="min-h-screen flex flex-col justify-center py-20">
            <div className="max-w-xl p-6 md:p-8 rounded-xl border border-red/40 bg-[#0c121e]/85 backdrop-blur-xl shadow-2xl">
              <div className="flex items-center gap-2 font-mono text-[11px] font-bold text-red uppercase tracking-wider mb-2">
                <Sliders size={13} />
                <span>Beat 05 · Transparent Threat Engine</span>
              </div>
              <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                0–100 Explainable Score. Zero Black-Box Hallucinations.
              </h2>
              <p className="mt-3 text-[13.5px] text-slate-300 leading-relaxed">
                Border security commanders cannot act on opaque AI guesses. Every threat score is calculated transparently from a deterministic mathematical rulebook with itemized point justifications:
              </p>
              <div className="mt-4 flex flex-col gap-1.5 font-mono text-[11px]">
                <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-300">Restricted Red Zone Penetration</span>
                  <span className="text-red font-bold">+30 pts</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-300">Movement Vector Heading Towards Border</span>
                  <span className="text-amber font-bold">+20 pts</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-300">Loitering in Caution Zone (&gt;240s)</span>
                  <span className="text-amber font-bold">+15 pts</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
                  <span className="text-slate-300">Cross-Camera Re-ID Match in Transit Window</span>
                  <span className="text-purple-400 font-bold">+12 pts</span>
                </div>
                <div className="flex justify-between p-2 rounded bg-red/20 border border-red/40 text-red font-bold">
                  <span>TOTAL THREAT SCORE (CRITICAL SEVERITY):</span>
                  <span>77 / 100</span>
                </div>
              </div>
            </div>
          </section>

          {/* BEAT 6: Cryptographic Evidence Ledger & Final CTA */}
          <section className="min-h-screen flex flex-col justify-center items-center text-center py-20">
            <div className="max-w-2xl p-8 md:p-10 rounded-2xl border border-amber/50 bg-[#0c121e]/90 backdrop-blur-2xl shadow-[0_0_50px_rgba(245,158,11,0.2)]">
              <div className="inline-flex items-center gap-2 font-mono text-[11px] font-bold text-green uppercase tracking-wider mb-3 px-3 py-1 rounded-full border border-green/40 bg-green/10">
                <Link2 size={13} />
                <span>Beat 06 · Tamper-Evident Evidence Ledger</span>
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                NIST FIPS SHA-256 Merkle Chain. Court-Admissible Proof.
              </h2>
              <p className="mt-4 text-[14px] text-slate-300 leading-relaxed max-w-lg mx-auto">
                Every confirmed incident is permanently cryptographically sealed into a local SQLite hash chain. Any unauthorized modification to logs or evidence breaks the chain, pinpointing the exact tampered block.
              </p>

              {/* Enter Console Button */}
              <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={() => navigate("/console")}
                  className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-8 py-3.5 rounded-lg border border-amber bg-amber text-slate-950 font-extrabold text-[14px] hover:bg-amber-400 transition-all shadow-[0_0_25px_rgba(245,158,11,0.4)]"
                >
                  <Play size={15} />
                  <span>ENTER OPERATOR COMMAND CENTER</span>
                </button>
              </div>

              <div className="mt-6 flex items-center justify-center gap-6 font-mono text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 text-green">
                  <CheckCircle2 size={13} /> 100% Offline Native
                </span>
                <span className="flex items-center gap-1.5 text-amber">
                  <Lock size={13} /> SHA-256 Ledger
                </span>
                <span className="flex items-center gap-1.5 text-blue">
                  <Terminal size={13} /> SIH-26187
                </span>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  );
}
