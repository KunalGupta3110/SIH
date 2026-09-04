import { useEffect, useRef, useState } from "react";
import SectionHeader from "./SectionHeader.jsx";

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

export default function LivePanel() {
  return (
    <div>
      <SectionHeader
        title="Live Multi-Camera CCTV Grid"
        sub="Edge AI Inference — YOLOv8s Detection + ByteTrack Multi-Object Tracking across Sector 4B optical and thermal streams."
      />
      <div className="grid grid-cols-2 gap-4">
        {NODES.map((n) => (
          <CameraFeed key={n.id} node={n} />
        ))}
      </div>
    </div>
  );
}
