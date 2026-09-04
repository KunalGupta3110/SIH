import { useEffect, useRef, useState } from "react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

const NODES = [
  { id: "CAM_ALPHA", name: "Checkpost Alpha", sub: "North Entry Gate (Optical PTZ 4K)", tint: "amber" },
  { id: "CAM_BRAVO", name: "BOP Bravo", sub: "Eastern Perimeter (FLIR Thermal IR)", tint: "blue" },
];

function CameraFeed({ node }) {
  const canvasRef = useRef(null);
  const [mode, setMode] = useState(node.id === "CAM_BRAVO" ? "thermal" : "rgb");

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    let reqId, t = 0;

    function render() {
      t += 0.025;
      const W = cv.width, H = cv.height;

      if (mode === "thermal") {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#100428"); g.addColorStop(0.55, "#4c1d95"); g.addColorStop(1, "#030712");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // Thermal heat cluster
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        const hx = W * 0.45 + Math.sin(t * 1.2) * 15;
        const hy = H * 0.55 + Math.cos(t * 0.8) * 6;
        ctx.arc(hx, hy, 22, 0, Math.PI * 2);
        ctx.fill();
      } else if (mode === "night") {
        ctx.fillStyle = "#02160a"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#00ff9d";
        const nx = W * 0.42 + Math.sin(t * 1.2) * 15;
        ctx.fillRect(nx, H * 0.42, 20, 50);
      } else {
        const g = ctx.createLinearGradient(0, 0, 0, H);
        g.addColorStop(0, "#08111e"); g.addColorStop(0.6, "#0c1b2f"); g.addColorStop(1, "#040912");
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(0, 240, 255, 0.85)";
        const rx = W * 0.42 + Math.sin(t * 1.2) * 15;
        ctx.fillRect(rx, H * 0.42, 20, 50);
      }

      // YOLOv8 Bounding Box & Target Label
      const bx = W * 0.38 + Math.sin(t * 1.2) * 15;
      ctx.strokeStyle = mode === "thermal" ? "#f59e0b" : "#00f0ff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bx, H * 0.36, 36, 68);

      // HUD Text
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "9.5px monospace";
      ctx.fillText("[YOLOv8s] TRG #1041 95.4%", bx - 4, H * 0.32);

      // Scanline & Noise
      ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
      ctx.fillRect(0, (t * 60) % H, W, 2);

      reqId = requestAnimationFrame(render);
    }
    render();

    return () => cancelAnimationFrame(reqId);
  }, [mode]);

  return (
    <div className="rounded-[4px] border border-line bg-panel">
      <div className="flex items-center justify-between border-b border-line px-3.5 py-2.5">
        <div>
          <div className="text-[13px] font-medium">{node.name}</div>
          <div className="text-[11px] text-dim2">{node.sub}</div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 font-mono text-[10.5px] ${node.tint === "amber" ? "text-amber" : "text-blue"}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
            {node.id}
          </span>
        </div>
      </div>

      <div className="relative aspect-video w-full overflow-hidden bg-[#05080f]">
        <canvas ref={canvasRef} width={480} height={270} className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute bottom-2 left-2 font-mono text-[9.5px] text-cyan-400 opacity-80">
          LAT: 32.1914°N · 30 FPS · AI STREAM
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-line px-3.5 py-2 font-mono text-[10.5px]">
        <span className="text-dim2">Filter Mode</span>
        <div className="flex gap-1">
          {["rgb", "thermal", "night"].map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-[2px] border px-2 py-0.5 uppercase transition-colors ${
                mode === m
                  ? "border-amber bg-amber/20 font-bold text-amberLight"
                  : "border-line text-dim hover:text-ink"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const REAL_CASES = [
  {
    id: 1,
    title: "Case 1: Night-Time Low-Crawling Incursion",
    video: "/data/threat_night_crawl_web.mp4",
    cam: "CAM_ALPHA",
    target: "Person (Low-Crawl)",
    rule: "Perimeter Red Zone + Night Optics",
    score: 92,
    severity: "CRITICAL",
    desc: "Target attempting prone infiltration under outer barbed wire. Detected via IR contrast & tripwire crossing.",
  },
  {
    id: 2,
    title: "Case 2: Cross-Camera Spatio-Temporal Re-ID",
    video: "/data/cross_cam_real_demo_web.mp4",
    cam: "CAM_ALPHA ➔ CAM_BRAVO",
    target: "Person (Walking Vector 042°)",
    rule: "Spatial Gate 6-14s (ETA: 9.4s)",
    score: 77,
    severity: "HIGH",
    desc: "Target exit velocity matched across 26.3m blind corridor. 512-d OSNet rank-1 cosine similarity 0.96.",
  },
  {
    id: 3,
    title: "Case 3: Vehicle Ramming & ANPR Watchlist",
    video: "/data/threat_vehicle_rush_web.mp4",
    cam: "CAM_ALPHA (Gate)",
    target: "Vehicle (PB08-XX-1234)",
    rule: "High Velocity (68 km/h) + Blacklist",
    score: 74,
    severity: "HIGH",
    desc: "Speeding SUV approaching main checkpoint. Hydraulic boom barrier rapidly locked down.",
  },
  {
    id: 4,
    title: "Case 4: Perimeter Sustained Loitering Dwell",
    video: "/data/people_surveillance_web.mp4",
    cam: "CAM_BRAVO",
    target: "Person (Static Dwell)",
    rule: "Dwell 268s (>240s Threshold)",
    score: 65,
    severity: "WARNING",
    desc: "Suspicious subject lingering near outer fence line. Dwell timer triggered threat escalation.",
  },
  {
    id: 5,
    title: "Case 5: Coordinated Group Breach",
    video: "/data/threat_group_breach_web.mp4",
    cam: "CAM_ALPHA & BRAVO",
    target: "Group Cluster (3 Targets)",
    rule: "Multi-Target Coordinated Incursion",
    score: 88,
    severity: "CRITICAL",
    desc: "Simultaneous perimeter fence penetration across adjacent sectors.",
  },
];

export default function LivePanel({ onCaseTriggered }) {
  const [selectedCase, setSelectedCase] = useState(REAL_CASES[0]);
  const [running, setRunning] = useState(false);

  const handleRunCase = async (c) => {
    setRunning(true);
    try {
      await api.simulateCase(c.id);
      onCaseTriggered?.();
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Real Cases Live Video Detection Showcase */}
      <div>
        <SectionHeader
          title="Real-World Border Threat Cases (Live AI Video Demos)"
          sub="Pre-recorded real border surveillance video footage processed through the YOLOv8 + OSNet + Evidence Chain pipeline."
        />

        <div className="rounded-[4px] border border-line bg-panel2 p-3">
          {/* Case Navigation Tabs */}
          <div className="mb-3 flex flex-wrap gap-1.5 border-b border-line pb-2.5">
            {REAL_CASES.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className={`rounded-[3px] border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                  selectedCase.id === c.id
                    ? "border-amber bg-amber/20 text-amberLight font-bold"
                    : "border-line bg-panel text-dim hover:text-ink"
                }`}
              >
                {c.title}
              </button>
            ))}
          </div>

          {/* Video Player & Live Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative aspect-video md:col-span-2 overflow-hidden rounded-[3px] border border-line bg-black">
              <video
                key={selectedCase.video}
                src={selectedCase.video}
                autoPlay
                loop
                muted
                playsInline
                className="h-full w-full object-cover"
              />
              <div className="pointer-events-none absolute top-2 left-2 rounded-[2px] bg-black/70 px-2 py-1 font-mono text-[10px] text-amber">
                CAMERA: {selectedCase.cam} · 1080p 30FPS
              </div>
              <div className="pointer-events-none absolute bottom-2 right-2 rounded-[2px] bg-red/80 px-2 py-0.5 font-mono text-[10px] font-bold text-white">
                THREAT SCORE: {selectedCase.score}/100 ({selectedCase.severity})
              </div>
            </div>

            <div className="flex flex-col justify-between rounded-[3px] border border-line bg-panel p-3 text-[12px]">
              <div className="flex flex-col gap-2">
                <div className="font-semibold text-amberLight">{selectedCase.title}</div>
                <p className="text-dim text-[11.5px] leading-relaxed">{selectedCase.desc}</p>
                <div className="mt-1 flex flex-col gap-1 font-mono text-[11px] text-dim2">
                  <div>• <b>Target:</b> <span className="text-ink">{selectedCase.target}</span></div>
                  <div>• <b>Trigger Rule:</b> <span className="text-ink">{selectedCase.rule}</span></div>
                  <div>• <b>Threat Tier:</b> <span className="text-red font-bold">{selectedCase.severity} ({selectedCase.score}/100)</span></div>
                </div>
              </div>

              <button
                onClick={() => handleRunCase(selectedCase)}
                disabled={running}
                className="mt-3 flex items-center justify-center gap-1.5 rounded-[3px] border border-amber bg-amber/20 py-2 text-[12px] font-bold text-amberLight transition-colors hover:bg-amber/30 disabled:opacity-50"
              >
                {running ? "Processing Detection…" : `▶ Trigger Live Detection (${selectedCase.title.split(":")[0]})`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Retrospective Video Forensic Analysis Uploader */}
      <div className="mb-6">
        <SectionHeader
          title="Retrospective Video Forensics & Evidence Uploader"
          sub="Upload external CCTV footage (.mp4) for automated forensic frame analysis, threat scoring, and cryptographic sealing."
        />
        <RetrospectiveUploader onIncidentCreated={onCaseTriggered} />
      </div>

      {/* Real-Time Live Multi-Camera Grid */}
      <div>
        <SectionHeader
          title="Edge AI Multi-Camera Feeds"
          sub="Live continuous monitoring with real-time Optical / Thermal / Night Vision switching."
        />
        <div className="grid grid-cols-2 gap-4">
          {NODES.map((n) => (
            <CameraFeed key={n.id} node={n} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RetrospectiveUploader({ onIncidentCreated }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleUpload(e) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("camera_id", "CAM_ALPHA");
    formData.append("zone_name", "Uploaded Sector Footage");

    try {
      const res = await fetch("http://localhost:8000/edge/upload-video", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(`Upload failed: ${res.statusText}`);
      const data = await res.json();
      setResult(data);
      onIncidentCreated?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="rounded-[4px] border border-line bg-panel p-4">
      <form onSubmit={handleUpload} className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="video/mp4,video/avi,video/mkv"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="font-mono text-[12px] text-dim2 file:mr-3 file:rounded-[3px] file:border file:border-line2 file:bg-panel2 file:px-3 file:py-1.5 file:font-mono file:text-[11px] file:text-ink hover:file:bg-line"
        />
        <button
          type="submit"
          disabled={!file || uploading}
          className="flex items-center gap-1.5 rounded-[3px] border border-blue-500/50 bg-blue-500/20 px-4 py-1.5 font-mono text-[12px] font-bold text-blue-300 transition-colors hover:bg-blue-500/30 disabled:opacity-40"
        >
          {uploading ? "Analyzing Video Footage…" : "📤 Upload & Run Forensic Analysis"}
        </button>
      </form>

      {error && (
        <div className="mt-3 rounded-[3px] border border-red/40 bg-red/10 px-3 py-2 text-[12px] text-red font-mono">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-[4px] border border-green/40 bg-green/10 p-3.5 text-[12px]">
          <div className="flex items-center justify-between font-bold text-green">
            <span>✅ Forensic Analysis Complete — Incident {result.incident_id} Created</span>
            <a
              href={`http://localhost:8000/incidents/${result.incident_id}/dossier`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-[3px] border border-green bg-green/20 px-2.5 py-1 text-[11px] text-white hover:bg-green/30 font-mono"
            >
              📄 Open Official Dossier (PDF)
            </a>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2 font-mono text-[11px] text-dim2">
            <div>• <b>Duration:</b> {result.video_metadata?.duration_seconds}s</div>
            <div>• <b>Resolution:</b> {result.video_metadata?.resolution}</div>
            <div>• <b>Threat Score:</b> <span className="text-red font-bold">{result.analysis_results?.threat_score}/100</span></div>
          </div>
          <div className="mt-2 truncate font-mono text-[10px] text-faint">
            Sealed SHA-256 Hash: {result.analysis_results?.sealed_block_hash}
          </div>
        </div>
      )}
    </div>
  );
}

