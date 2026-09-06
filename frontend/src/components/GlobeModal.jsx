import { useEffect, useRef, useState } from "react";
import { X, Radio } from "lucide-react";

// Full-screen interactive world map — plain 2D canvas, no WebGL.
// Drag to rotate, scroll to zoom. Camera nodes along the India–Pakistan
// line; click one for its detail. Opens when the hero globe is tapped.

const DEG = Math.PI / 180;

// Coarse continent outlines — [lat, lon] loops. Recognisable, not precise.
const CONTINENTS = [
  // India + subcontinent (the star — a little more detail)
  [[35, 74], [34, 78], [30, 80], [28, 82], [27, 88], [23, 89], [22, 91], [25, 94], [28, 97], [24, 92],
   [21, 87], [19, 85], [16, 82], [14, 80], [10, 79], [8, 77], [10, 76], [13, 75], [16, 73], [19, 73],
   [21, 70], [23, 68], [24, 67], [26, 68], [28, 70], [31, 71], [33, 73], [35, 74]],
  // rest of Asia
  [[35, 74], [42, 55], [45, 40], [55, 45], [66, 65], [72, 90], [70, 130], [62, 170], [55, 160],
   [50, 140], [43, 132], [40, 122], [35, 120], [30, 108], [28, 97], [35, 90], [40, 78], [35, 74]],
  // Africa
  [[35, -5], [32, 10], [30, 25], [22, 37], [12, 43], [2, 42], [-10, 40], [-25, 33], [-34, 20],
   [-30, 17], [-18, 12], [-6, 9], [4, 8], [12, -3], [20, -16], [30, -10], [35, -5]],
  // Europe
  [[71, 25], [62, 5], [58, -5], [50, -8], [43, -9], [40, 0], [37, 15], [40, 25], [45, 30], [55, 30],
   [66, 35], [71, 25]],
  // North America
  [[70, -160], [68, -100], [58, -65], [47, -53], [40, -70], [30, -81], [25, -97], [30, -115],
   [40, -124], [55, -132], [65, -150], [70, -160]],
  // South America
  [[10, -75], [8, -60], [0, -50], [-10, -37], [-23, -43], [-35, -55], [-52, -70], [-38, -73],
   [-20, -70], [-5, -80], [5, -78], [10, -75]],
  // Australia
  [[-12, 131], [-11, 143], [-20, 149], [-30, 153], [-38, 145], [-35, 137], [-32, 116], [-22, 114],
   [-15, 124], [-12, 131]],
];

const CAMERAS = [
  { id: "CAM_ALPHA", lat: 32.04, lon: 75.40, sector: "Gurdaspur", primary: true, status: "ONLINE", note: "Ingress approach" },
  { id: "CAM_BRAVO", lat: 32.10, lon: 75.28, sector: "Gurdaspur", status: "ONLINE", note: "Perimeter fence · restricted zone" },
  { id: "CAM_CHARLIE", lat: 32.31, lon: 75.05, sector: "Gurdaspur", status: "ONLINE", note: "River bend" },
  { id: "CAM_DELTA", lat: 30.35, lon: 74.52, sector: "Fazilka", status: "ONLINE", note: "East spur" },
  { id: "CAM_ECHO", lat: 34.08, lon: 74.80, sector: "Uri", status: "ONLINE", note: "Tower thermal pan" },
  { id: "CAM_FOXTROT", lat: 33.42, lon: 74.30, sector: "Poonch", status: "STALE", note: "Riverine sentry" },
  { id: "CAM_GOLF", lat: 27.65, lon: 71.35, sector: "Barmer", status: "ONLINE", note: "Desert BOP" },
  { id: "CAM_HOTEL", lat: 24.40, lon: 68.90, sector: "Kutch", status: "OFFLINE", note: "Marsh outpost" },
];

function toVec(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l)];
}

export default function GlobeModal({ onClose }) {
  const canvasRef = useRef(null);
  const [selected, setSelected] = useState(CAMERAS[0]);
  const selRef = useRef(CAMERAS[0]);
  const gp = toVec(32, 75);
  const stateRef = useRef({
    yaw: -Math.atan2(gp[0], gp[2]) + 0.05,
    pitch: -0.12, zoom: 1.3, dragging: false, lx: 0, ly: 0, vyaw: 0, auto: true, markers: [],
  });

  const pick = (c) => { setSelected(c); selRef.current = c; };

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const S = stateRef.current;

    let W = 0, H = 0, R = 0, cx = 0, cy = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth;
      H = canvas.clientHeight;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.4;
      cx = W / 2;
      cy = H / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (v) => {
      const cy2 = Math.cos(S.yaw), sy = Math.sin(S.yaw);
      let x = v[0] * cy2 + v[2] * sy;
      let z = -v[0] * sy + v[2] * cy2;
      let y = v[1];
      const cp = Math.cos(S.pitch), sp = Math.sin(S.pitch);
      const y2 = y * cp - z * sp;
      const z2 = y * sp + z * cp;
      const r = R * S.zoom;
      return { sx: cx + x * r, sy: cy - y2 * r, z: z2 };
    };

    let raf;
    let last = performance.now();
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!S.dragging) {
        S.yaw += S.vyaw;
        S.vyaw *= 0.94;
        if (S.auto && !reduce) S.yaw += 0.0007;
      }
      S.pitch = Math.max(-1.2, Math.min(1.2, S.pitch));
      const r = R * S.zoom;

      ctx.clearRect(0, 0, W, H);

      // limb + halo
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.08)";
      ctx.beginPath();
      ctx.arc(cx, cy, r * 1.05, 0, Math.PI * 2);
      ctx.stroke();

      // graticule
      ctx.strokeStyle = "rgba(255,255,255,0.07)";
      ctx.lineWidth = 1;
      for (let la = -60; la <= 60; la += 30) {
        ctx.beginPath();
        let started = false;
        for (let lo = 0; lo <= 360; lo += 6) {
          const p = project(toVec(la, lo));
          if (p.z <= 0) { started = false; continue; }
          if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }
      for (let lo = 0; lo < 360; lo += 30) {
        ctx.beginPath();
        let started = false;
        for (let la = -80; la <= 80; la += 4) {
          const p = project(toVec(la, lo));
          if (p.z <= 0) { started = false; continue; }
          if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      // continents
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.25;
      for (const loop of CONTINENTS) {
        ctx.beginPath();
        let started = false;
        for (const [la, lo] of loop) {
          const p = project(toVec(la, lo));
          if (p.z <= 0) { started = false; continue; }
          if (!started) { ctx.moveTo(p.sx, p.sy); started = true; } else ctx.lineTo(p.sx, p.sy);
        }
        ctx.stroke();
      }

      // border line
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      let bs = false;
      for (const c of [...CAMERAS].sort((a, b) => b.lat - a.lat)) {
        const p = project(toVec(c.lat, c.lon));
        if (p.z <= 0) { bs = false; continue; }
        if (!bs) { ctx.moveTo(p.sx, p.sy); bs = true; } else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // camera markers
      S.markers = [];
      const k = (now % 2600) / 2600;
      for (const c of CAMERAS) {
        const p = project(toVec(c.lat, c.lon));
        if (p.z <= 0.02) continue;
        S.markers.push({ id: c.id, sx: p.sx, sy: p.sy, cam: c });
        const on = c.status === "ONLINE";
        const sel = selRef.current?.id === c.id;
        if (on) {
          ctx.strokeStyle = `rgba(255,255,255,${0.7 * (1 - k)})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 3 + k * (c.primary ? 22 : 12), 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = c.status === "OFFLINE" ? "rgba(255,255,255,0.3)" : "#fff";
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, sel ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fill();
        if (sel || c.primary) {
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(p.sx, p.sy, 7, 0, Math.PI * 2);
          ctx.stroke();
          ctx.font = "9px 'IBM Plex Mono', monospace";
          ctx.fillStyle = "rgba(255,255,255,0.8)";
          ctx.fillText(c.id, p.sx + 10, p.sy + 3);
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // interaction
    const pd = (e) => {
      S.dragging = true;
      S.auto = false;
      S.lx = e.clientX;
      S.ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const pm = (e) => {
      if (!S.dragging) return;
      const dx = e.clientX - S.lx;
      const dy = e.clientY - S.ly;
      S.yaw -= dx * 0.006;
      S.pitch -= dy * 0.006;
      S.vyaw = -dx * 0.0006;
      S.lx = e.clientX;
      S.ly = e.clientY;
    };
    const pu = (e) => {
      if (S.dragging && Math.abs(e.clientX - (S._dx0 ?? e.clientX)) < 4) {
        // tap → hit-test markers
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let best = null;
        let bd = 14;
        for (const m of S.markers) {
          const d = Math.hypot(m.sx - mx, m.sy - my);
          if (d < bd) { bd = d; best = m.cam; }
        }
        if (best) pick(best);
      }
      S.dragging = false;
    };
    const pdown0 = (e) => { S._dx0 = e.clientX; };
    const wheel = (e) => {
      e.preventDefault();
      S.zoom = Math.max(0.7, Math.min(2.4, S.zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    canvas.addEventListener("pointerdown", pdown0);
    canvas.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    canvas.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", pdown0);
      canvas.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, []);

  const online = CAMERAS.filter((c) => c.status === "ONLINE").length;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/12 px-5 py-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/60">
          Global Sensor Map <span className="text-white">· {online} / {CAMERAS.length} active</span>
        </div>
        <button onClick={onClose} className="press grid h-9 w-9 place-items-center border border-white/40 text-white/70 hover:bg-white hover:text-black">
          <X size={16} />
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* globe */}
        <div className="relative min-h-0 flex-1">
          <canvas ref={canvasRef} className="h-full w-full cursor-grab active:cursor-grabbing touch-none" />
          <div className="pointer-events-none absolute left-4 bottom-4 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
            drag to rotate · scroll to zoom
          </div>
        </div>

        {/* camera rail */}
        <div className="w-full shrink-0 overflow-y-auto border-t border-white/12 lg:w-80 lg:border-l lg:border-t-0">
          {selected && (
            <div className="border-b border-white/12 p-4 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-white">{selected.id}</span>
                <span className={`text-[10px] uppercase tracking-[0.14em] ${
                  selected.status === "ONLINE" ? "text-white" : selected.status === "STALE" ? "text-amber-400" : "text-red-400"
                }`}>{selected.status}</span>
              </div>
              <div className="mt-2 space-y-1 text-[11px] text-white/55">
                <div className="flex justify-between"><span>Sector</span><span className="text-white">{selected.sector}</span></div>
                <div className="flex justify-between"><span>Position</span><span className="text-white">{selected.lat.toFixed(2)}°N · {selected.lon.toFixed(2)}°E</span></div>
                <div className="flex justify-between"><span>Role</span><span className="text-white">{selected.note}</span></div>
              </div>
              <a href="/console" className="mt-3 flex items-center justify-center gap-1.5 border border-white bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-black">
                <Radio size={11} /> Open in console
              </a>
            </div>
          )}
          <ul className="divide-y divide-white/8">
            {CAMERAS.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => pick(c)}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left font-mono text-[11px] transition-colors ${
                    selected?.id === c.id ? "bg-white/[0.06] text-white" : "text-white/60 hover:bg-white/[0.03]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${
                      c.status === "ONLINE" ? "bg-white" : c.status === "STALE" ? "bg-amber-400" : "bg-red-500"
                    }`} />
                    {c.id}
                  </span>
                  <span className="text-white/35">{c.sector}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
