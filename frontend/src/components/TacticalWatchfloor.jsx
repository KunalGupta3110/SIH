import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { BrandLogo } from "./BrandMark.jsx";
import {
  Radio,
  AlertTriangle,
  Crosshair,
  Activity,
  ChevronRight,
  Shield,
  Cpu,
  Gauge,
  Radar,
  Box,
  Grid3x3,
} from "lucide-react";

// The R3F / three.js GIS engine is code-split — three is only pulled in
// when the operator switches the engine toggle to 3D-GIS.
const TacticalGISCanvas = lazy(() => import("./gis/TacticalGISCanvas.jsx"));

/* ═══════════════════════════════════════════════════════════════════════
   IBVAP SENTINEL — COMMAND WATCHFLOOR
   Layer 0 : pseudo-3D tactical scene, pure 2D canvas (no WebGL, no deps)
   Layer 1 : glassmorphic tactical HUD overlay
   Palette : pitch black + stark white telemetry. Red only for breach.
   ═══════════════════════════════════════════════════════════════════════ */

const RED = "#ef4444";

// World: x = east, y = up, z = north. Zero Line runs along z = -13.
const TOWERS = [
  { id: "CAM-01", cam: "CAM_ALPHA", pos: [-12, 0, -8], target: [-4, 0, -13], sector: "Sector 4-B / West Ridge" },
  { id: "CAM-02", cam: "CAM_BRAVO", pos: [12, 0, -8], target: [5, 0, -13], sector: "Sector 4-B / Fence Line" },
  { id: "CAM-03", cam: "CAM_CHARLIE", pos: [-10, 0, 10], target: [-2, 0, -13], sector: "Sector 4-B / South Corridor" },
  { id: "CAM-04", cam: "CAM_DELTA", pos: [14, 0, 12], target: [6, 0, -13], sector: "Sector 4-B / East Approach" },
];

// Cross-camera Re-ID trajectory — intruder path CAM-01 → CAM-03
const REID_CTRL = [
  [-6, 0, -12],
  [-9, 0, -6],
  [-6, 0, 0],
  [-11, 0, 6],
  [-10, 0, 9.4],
];

const INCIDENTS = [
  { id: "INC-0042", pri: "CRITICAL", score: 87, cam: "CAM_BRAVO", tower: "CAM-02", t: "20:49:02", text: "Intruder crossed 100m geofence — Re-ID match CAM_ALPHA→CAM_BRAVO (91.4%)" },
  { id: "INC-0041", pri: "WARNING", score: 64, cam: "CAM_DELTA", tower: "CAM-04", t: "20:43:17", text: "Vehicle 42 km/h on unpaved access road, proximity to outer barrier <35m" },
  { id: "INC-0040", pri: "WARNING", score: 52, cam: "CAM_CHARLIE", tower: "CAM-03", t: "20:37:55", text: "3-entity formation transiting 180m blind gap, loitering >120s" },
  { id: "INC-0039", pri: "LOG", score: 28, cam: "CAM_ALPHA", tower: "CAM-01", t: "20:22:10", text: "Single subject static 90s near agricultural boundary, buffer proximity" },
];

/* ── vector helpers ──────────────────────────────────────────────────── */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];

// Catmull-Rom sampled polyline through the control points
function catmull(pts, segs = 22) {
  const out = [];
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([0, 1, 2].map((k) =>
        0.5 *
        ((2 * p1[k]) +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3))
      );
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export default function TacticalWatchfloor({ onFocusIncident }) {
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const labelRefs = useRef([]);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const [selected, setSelected] = useState("CAM-02");
  const [breach, setBreach] = useState(false);
  const [clock, setClock] = useState(() => new Date());
  const [engine, setEngine] = useState("2d"); // '2d' canvas engine | '3d' R3F GIS
  const fallbackTo2D = useCallback(() => setEngine("2d"), []);

  // mutable scene/camera state — never triggers a React render
  const S = useRef({
    az: Math.PI - 0.4,
    el: 0.5,
    dist: 44,
    fov: 0.62,
    targetAz: Math.PI - 0.4,
    targetEl: 0.5,
    targetDist: 44,
    dragging: false,
    lx: 0,
    ly: 0,
    idle: 0,
    breach: false,
    sel: "CAM-02",
    markers: [],
    _dx: 0,
  });

  useEffect(() => {
    S.current.breach = breach;
  }, [breach]);
  useEffect(() => {
    S.current.sel = selected;
  }, [selected]);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const focusTower = useCallback((towerId) => {
    const tw = TOWERS.find((t) => t.id === towerId);
    if (!tw) return;
    const s = S.current;
    s.targetAz = Math.PI - 0.4 + Math.atan2(tw.pos[0], 22) * 0.9;
    s.targetEl = 0.56;
    s.targetDist = 32;
    s.idle = -280; // suppress auto-rotate for a beat
    setSelected(towerId);
  }, []);

  // expose incident focus to parent
  useEffect(() => {
    if (onFocusIncident) onFocusIncident.current = focusTower;
  }, [onFocusIncident, focusTower]);

  useEffect(() => {
    if (engine !== "2d") return undefined;
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    let W = 0, H = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = wrap.clientWidth || 1;
      H = wrap.clientHeight || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const reidPath = catmull(REID_CTRL, 20);

    // project world → screen with an orbit camera
    const project = (p) => {
      const s = S.current;
      const ca = Math.cos(s.az), sa = Math.sin(s.az);
      let x = p[0] * ca - p[2] * sa;
      let z = p[0] * sa + p[2] * ca;
      let y = p[1];
      const ce = Math.cos(s.el), se = Math.sin(s.el);
      const y2 = y * ce + z * se;
      let z2 = -y * se + z * ce + s.dist;
      if (z2 < 0.25) z2 = 0.25;
      const f = (s.fov * Math.min(W, H)) / z2;
      return { sx: W / 2 + x * f, sy: H * 0.46 - y2 * f, z: z2, f };
    };
    const depthAlpha = (z, k = 46) => Math.max(0.04, Math.min(1, 1.5 - z / k));

    const stroke = (poly, style, wgt = 1, close = false) => {
      ctx.strokeStyle = style;
      ctx.lineWidth = wgt;
      ctx.beginPath();
      poly.forEach((pt, i) => {
        const q = project(pt);
        i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy);
      });
      if (close) ctx.closePath();
      ctx.stroke();
    };

    let start = null;
    let raf;

    const draw = (now) => {
      const s = S.current;
      if (start == null) start = now;
      const t = (now - start) / 1000;

      // camera easing
      if (!s.dragging) s.idle += 1;
      if (!reduce && s.idle > 220 && !s.dragging) s.targetAz += 0.0016;
      s.az += (s.targetAz - s.az) * 0.08;
      s.el += (s.targetEl - s.el) * 0.08;
      s.dist += (s.targetDist - s.dist) * 0.06;

      const br = s.breach;
      ctx.clearRect(0, 0, W, H);

      // vignette floor glow
      const g = ctx.createRadialGradient(W / 2, H * 0.56, 20, W / 2, H * 0.56, Math.max(W, H) * 0.7);
      g.addColorStop(0, br ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.045)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      const wave = (x, z) =>
        reduce ? 0 : 0.18 * Math.sin(x * 0.32 + t * 0.7) * Math.cos(z * 0.28 - t * 0.4);

      // ── topographic grid ─────────────────────────────────────────
      const G = 24, STEP = 3;
      for (let x = -G; x <= G; x += STEP) {
        const line = [];
        for (let z = -G; z <= G; z += 1.5) line.push([x, wave(x, z), z]);
        const a = depthAlpha(project([x, 0, 0]).z) * 0.5;
        stroke(line, `rgba(255,255,255,${a * 0.34})`, 1);
      }
      for (let z = -G; z <= G; z += STEP) {
        const line = [];
        for (let x = -G; x <= G; x += 1.5) line.push([x, wave(x, z), z]);
        const a = depthAlpha(project([0, 0, z]).z) * 0.5;
        stroke(line, `rgba(255,255,255,${a * 0.34})`, 1);
      }

      // ── range rings + radar sweep on the ground ───────────────────
      for (const r of [7, 13, 19, 25]) {
        const ring = [];
        for (let i = 0; i <= 60; i++) {
          const a = (i / 60) * Math.PI * 2;
          ring.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
        }
        stroke(ring, "rgba(255,255,255,0.12)", 1, true);
      }
      if (!reduce) {
        const sweep = t * 0.85;
        for (let k = 0; k < 26; k++) {
          const a0 = sweep - k * 0.03;
          const seg = [
            [0, 0.02, 0],
            [Math.cos(a0) * 26, 0.02, Math.sin(a0) * 26],
            [Math.cos(a0 - 0.03) * 26, 0.02, Math.sin(a0 - 0.03) * 26],
          ];
          ctx.fillStyle = `rgba(255,255,255,${0.09 * (1 - k / 26)})`;
          ctx.beginPath();
          seg.forEach((pt, i) => {
            const q = project(pt);
            i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy);
          });
          ctx.closePath();
          ctx.fill();
        }
      }

      // ── Zero Line + restricted geofence tripwire ──────────────────
      stroke(
        [[-26, 0, -13], [26, 0, -13]],
        "rgba(255,255,255,0.55)",
        1.5
      );
      const gp = br ? 0.35 + 0.4 * Math.abs(Math.sin(t * 6)) : 0.2 + 0.14 * Math.sin(t * 2);
      const fence = [];
      for (let x = -24; x <= 24; x += 2) fence.push([x, 0.05 + 0.35 * Math.sin(x * 0.6 + t), -10]);
      stroke(fence, br ? `rgba(239,68,68,${0.55 + gp})` : `rgba(255,255,255,${0.28 + gp * 0.4})`, br ? 2.4 : 1.4);

      // ── Cross-camera Re-ID trajectory spline ──────────────────────
      ctx.save();
      ctx.setLineDash([6, 5]);
      ctx.lineDashOffset = -t * 22;
      stroke(reidPath.map((p) => [p[0], 0.12, p[2]]), "rgba(255,255,255,0.5)", 1.6);
      ctx.restore();
      // moving pulse along the path
      const pf = (t * 0.16) % 1;
      const pi = Math.max(0, Math.min(reidPath.length - 1, Math.floor(pf * reidPath.length)));
      const rp = reidPath[pi] || reidPath[0];
      const pp = project([rp[0], 0.12, rp[2]]);
      const pr = 3 + 2 * Math.sin(t * 8);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(pp.sx, pp.sy, pr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.beginPath();
      ctx.arc(pp.sx, pp.sy, pr + 5 + (t * 10) % 12, 0, Math.PI * 2);
      ctx.stroke();

      // ── watchtowers + FOV frustums ───────────────────────────────
      s.markers = [];
      const order = [...TOWERS]
        .map((tw) => ({ tw, z: project(tw.pos).z }))
        .sort((a, b) => b.z - a.z);

      order.forEach(({ tw }) => {
        const base = project(tw.pos);
        const apexW = add(tw.pos, [0, 3.4, 0]);
        const apex = project(apexW);
        const isSel = s.sel === tw.id;
        const alert = tw.id === "CAM-02" || (br && tw.id === "CAM-01");
        const ink = alert ? RED : "#ffffff";
        const a = depthAlpha(base.z);

        // FOV frustum
        const dir = norm(sub(tw.target, apexW));
        const right = norm(cross(dir, [0, 1, 0]));
        const up = cross(right, dir);
        const reach = 15;
        const spread = 3.4;
        const bc = add(apexW, scale(dir, reach));
        const rim = [];
        for (let i = 0; i <= 24; i++) {
          const ang = (i / 24) * Math.PI * 2;
          rim.push(
            add(bc, add(scale(right, Math.cos(ang) * spread), scale(up, Math.sin(ang) * spread * 0.5)))
          );
        }
        ctx.fillStyle = alert ? `rgba(239,68,68,${0.06 * a})` : `rgba(255,255,255,${0.05 * a})`;
        ctx.beginPath();
        rim.forEach((pt, i) => {
          const q = project(pt);
          i ? ctx.lineTo(q.sx, q.sy) : ctx.moveTo(q.sx, q.sy);
        });
        ctx.closePath();
        ctx.fill();
        stroke(rim, alert ? `rgba(239,68,68,${0.32 * a})` : `rgba(255,255,255,${0.22 * a})`, 1, true);
        for (let i = 0; i < 24; i += 6) {
          stroke([apexW, rim[i]], alert ? `rgba(239,68,68,${0.28 * a})` : `rgba(255,255,255,${0.18 * a})`, 1);
        }

        // mast + base
        stroke([tw.pos, apexW], `rgba(255,255,255,${0.5 * a})`, 1.4);
        const diamond = [
          add(tw.pos, [1.1, 0, 0]),
          add(tw.pos, [0, 0, 1.1]),
          add(tw.pos, [-1.1, 0, 0]),
          add(tw.pos, [0, 0, -1.1]),
        ];
        stroke(diamond, `rgba(255,255,255,${0.4 * a})`, 1, true);

        // glowing sensor ring at apex
        const pulse = 0.5 + 0.5 * Math.sin(t * 3 + tw.pos[0]);
        ctx.strokeStyle = alert
          ? `rgba(239,68,68,${(0.5 + 0.4 * pulse) * a})`
          : `rgba(255,255,255,${(0.45 + 0.4 * pulse) * a})`;
        ctx.lineWidth = isSel ? 2 : 1.3;
        ctx.beginPath();
        ctx.arc(apex.sx, apex.sy, (isSel ? 8 : 6) + pulse * 4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = ink;
        ctx.beginPath();
        ctx.arc(apex.sx, apex.sy, 3.2, 0, Math.PI * 2);
        ctx.fill();

        if (isSel) {
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 1;
          ctx.strokeRect(apex.sx - 16, apex.sy - 16, 32, 32);
        }
        s.markers.push({ id: tw.id, x: apex.sx, y: apex.sy });
      });

      // ── breach marker ────────────────────────────────────────────
      if (br) {
        const bpt = project([-4, 0, -10]);
        const k = (t * 0.8) % 1;
        ctx.strokeStyle = `rgba(239,68,68,${0.9 * (1 - k)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bpt.sx, bpt.sy, 6 + k * 42, 0, Math.PI * 2);
        ctx.stroke();
        const beam = project([-4, 7, -10]);
        ctx.strokeStyle = "rgba(239,68,68,0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bpt.sx, bpt.sy);
        ctx.lineTo(beam.sx, beam.sy);
        ctx.stroke();
        ctx.fillStyle = RED;
        ctx.beginPath();
        ctx.arc(bpt.sx, bpt.sy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── HTML labels follow the towers ────────────────────────────
      TOWERS.forEach((tw, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        const q = project(add(tw.pos, [0, 4.6, 0]));
        const vis = q.z > 2 && q.sx > -60 && q.sx < W + 60;
        el.style.opacity = vis ? "1" : "0";
        el.style.transform = `translate(-50%,-100%) translate(${q.sx}px, ${q.sy}px)`;
      });

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    // ── interaction ───────────────────────────────────────────────
    const pd = (e) => {
      const s = S.current;
      s.dragging = true;
      s.idle = 0;
      s._dx = 0;
      s.lx = e.clientX;
      s.ly = e.clientY;
      canvas.setPointerCapture?.(e.pointerId);
    };
    const pm = (e) => {
      const s = S.current;
      if (!s.dragging) return;
      const dx = e.clientX - s.lx;
      const dy = e.clientY - s.ly;
      s._dx += Math.abs(dx) + Math.abs(dy);
      s.lx = e.clientX;
      s.ly = e.clientY;
      s.targetAz -= dx * 0.006;
      s.targetEl = Math.max(0.12, Math.min(1.15, s.targetEl + dy * 0.005));
    };
    const pu = (e) => {
      const s = S.current;
      s.dragging = false;
      s.idle = 0;
      if (s._dx < 5) {
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        let best = null, bd = 26;
        for (const m of s.markers) {
          const d = Math.hypot(m.x - mx, m.y - my);
          if (d < bd) { bd = d; best = m.id; }
        }
        if (best) focusTower(best);
      }
    };
    const wheel = (e) => {
      e.preventDefault();
      const s = S.current;
      s.targetDist = Math.max(22, Math.min(72, s.targetDist + e.deltaY * 0.03));
    };
    canvas.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    canvas.addEventListener("wheel", wheel, { passive: false });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", pd);
      window.removeEventListener("pointermove", pm);
      window.removeEventListener("pointerup", pu);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [reduce, focusTower, engine]);

  const utc = clock.toISOString().slice(11, 19);
  const ist = clock.toLocaleTimeString("en-IN", { hour12: false });
  const selTower = TOWERS.find((t) => t.id === selected);

  return (
    <div className="animate-fadeIn">
      <div
        ref={wrapRef}
        className={`keep-dark relative w-full overflow-hidden rounded-2xl border bg-black transition-colors ${
          breach ? "border-[#ef4444]/60" : "border-white/12"
        }`}
        style={{ height: "min(78vh, 760px)", minHeight: 560 }}
      >
        {/* ── LAYER 0 : tactical engine ── */}
        {engine === "3d" ? (
          <Suspense
            fallback={
              <div className="absolute inset-0 grid place-items-center bg-black font-mono text-[10px] text-white/60">
                <span><span className="mr-2 inline-block h-2 w-2 animate-pulse bg-white align-middle" />booting GIS engine…</span>
              </div>
            }
          >
            <TacticalGISCanvas
              focus={selected}
              breach={breach}
              lineDensity={14}
              heightScale={5}
              onUnavailable={fallbackTo2D}
            />
          </Suspense>
        ) : (
          <canvas
            ref={canvasRef}
            className="absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
          />
        )}
        {/* CRT scanline wash */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, #fff 0px, #fff 1px, transparent 1px, transparent 3px)",
          }}
        />

        {/* floating tower labels (2D engine only) */}
        {engine === "2d" && TOWERS.map((tw, i) => (
          <div
            key={tw.id}
            ref={(el) => (labelRefs.current[i] = el)}
            className="pointer-events-none absolute left-0 top-0 z-10 whitespace-nowrap transition-opacity duration-300"
            style={{ willChange: "transform" }}
          >
            <div
              className={`flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] backdrop-blur-sm ${
                tw.id === "CAM-02"
                  ? "border-[#ef4444]/50 bg-[#ef4444]/10 text-[#ef4444]"
                  : "border-white/25 bg-black/70 text-white"
              }`}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  tw.id === "CAM-02" ? "bg-[#ef4444]" : "bg-white"
                } animate-pulse`}
              />
              {tw.id} · {tw.id === "CAM-02" ? "ALERT" : "SIM"}
            </div>
          </div>
        ))}

        {/* ── LAYER 1 : tactical HUD ── */}
        <div className="pointer-events-none absolute inset-0 flex flex-col">
          {/* breach vignette */}
          {breach && (
            <div
              className="absolute inset-0 z-20 animate-pulse"
              style={{ boxShadow: "inset 0 0 160px 34px rgba(239,68,68,0.42)" }}
            />
          )}

          {/* top telemetry header */}
          <div className="z-30 flex flex-wrap items-center justify-between gap-2 border-b border-white/12 bg-black/70 px-4 py-2.5 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <BrandLogo size={26} />
              <div className="leading-tight">
                <div className="font-heading text-sm font-bold tracking-wide text-white">
                  IBVAP Sentinel <span className="text-white/40">// AI watchfloor</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono text-[10px] text-white/50">
                  <span
                    className={`inline-block h-1.5 w-1.5 rounded-full ${
                      breach ? "bg-[#ef4444]" : "bg-white"
                    } animate-pulse`}
                  />
                  {breach ? "Alert state · perimeter breach" : "Alert state · elevated"}
                </div>
              </div>
            </div>

            <div className="hidden items-center gap-4 font-mono text-[10px] text-white/70 md:flex">
              <Telem label="IST" value={ist} />
              <Telem label="UTC" value={utc} />
              <Telem label="FEEDS" value="4 SIM" />
              <Telem label="RE-ID" value="2-CAM TESTBED" />
              <Telem label="Runtime" value="Cloud" />
            </div>

            <div className="flex items-center gap-2">
              {/* engine toggle: 2D canvas ↔ 3D R3F GIS */}
              <div className="pointer-events-auto flex items-center border border-white/20 font-mono text-[10px] font-bold">
                <button
                  onClick={() => setEngine("2d")}
                  className={`flex items-center gap-1 px-2.5 py-1.5 transition-colors ${
                    engine === "2d" ? "bg-white text-black" : "text-white/55 hover:text-white"
                  }`}
                  title="2D isometric canvas engine"
                >
                  <Grid3x3 size={11} /> 2D
                </button>
                <button
                  onClick={() => setEngine("3d")}
                  className={`flex items-center gap-1 border-l border-white/20 px-2.5 py-1.5 transition-colors ${
                    engine === "3d" ? "bg-white text-black" : "text-white/55 hover:text-white"
                  }`}
                  title="3D WebGL GIS terrain engine"
                >
                  <Box size={11} /> 3D&nbsp;GIS
                </button>
              </div>

              <button
                onClick={() => setBreach((b) => !b)}
                className={`pointer-events-auto flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] font-bold transition-all ${
                  breach
                    ? "border-[#ff2233] bg-[#ff2233] text-black"
                    : "border-white/30 bg-black text-white hover:bg-white hover:text-black"
                }`}
              >
                <AlertTriangle size={12} />
                {breach ? "Clear breach" : "Simulate breach"}
              </button>
            </div>
          </div>

          {/* mid: left camera matrix + right intel feed */}
          <div className="flex flex-1 items-stretch justify-between gap-3 overflow-hidden p-3">
            {/* left — live multi-camera matrix */}
            <div className="pointer-events-auto hidden w-60 shrink-0 flex-col gap-2.5 overflow-y-auto lg:flex">
              <PanelTitle icon={Radio}>Camera matrix · sim</PanelTitle>
              {TOWERS.map((tw) => {
                const alert = tw.id === "CAM-02";
                return (
                  <button
                    key={tw.id}
                    onClick={() => focusTower(tw.id)}
                    className={`group relative overflow-hidden border text-left transition-all ${
                      selected === tw.id
                        ? "border-white/50"
                        : alert
                        ? "border-[#ef4444]/40"
                        : "border-white/12 hover:border-white/30"
                    } bg-black/70 backdrop-blur-md`}
                  >
                    <div className="relative h-20 overflow-hidden bg-[repeating-linear-gradient(0deg,rgba(255,255,255,0.05)_0,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_3px)]">
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Crosshair size={20} className="text-white/20" />
                      </div>
                      {/* animated bbox */}
                      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                        <rect
                          x={alert ? 44 : 34}
                          y={alert ? 18 : 22}
                          width="20"
                          height="26"
                          fill="none"
                          stroke={alert ? RED : "#fff"}
                          strokeWidth="1"
                          strokeDasharray="3 2"
                        >
                          <animate attributeName="x" values={alert ? "40;52;40" : "30;40;30"} dur="4s" repeatCount="indefinite" />
                        </rect>
                      </svg>
                      <div className="absolute left-1.5 top-1.5 flex items-center gap-1 font-mono text-[8px] text-white">
                        <span className={`h-1 w-1 rounded-full ${alert ? "bg-[#ef4444]" : "bg-white"} animate-pulse`} />
                        REC
                      </div>
                      <div className="absolute right-1.5 top-1.5 font-mono text-[8px] text-white/60">{tw.id}</div>
                    </div>
                    <div className="space-y-0.5 px-2 py-1.5">
                      <div className={`font-mono text-[10px] font-medium ${alert ? "text-[#ef4444]" : "text-white"}`}>
                        {alert ? "Intruder · Re-ID match (testbed)" : tw.cam}
                      </div>
                      <div className="font-mono text-[8.5px] text-white/45">{tw.sector}</div>
                      <div className="font-mono text-[8.5px] text-white/45">LAT 32.7266°N · LON 74.8570°E</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* right — real-time intel + threat feed */}
            <div className="pointer-events-auto ml-auto hidden w-72 shrink-0 flex-col gap-2.5 overflow-y-auto md:flex">
              <PanelTitle icon={Activity}>Incident correlator</PanelTitle>

              {/* radar micro-widget */}
              <div className="flex items-center gap-3 border border-white/12 bg-black/70 p-2.5 backdrop-blur-md">
                <div className="relative h-14 w-14 shrink-0 rounded-full border border-white/20">
                  <div className="absolute inset-1 rounded-full border border-white/10" />
                  <div
                    className={`absolute inset-0 rounded-full ${reduce ? "" : "animate-spin"}`}
                    style={{
                      background:
                        "conic-gradient(from 0deg, rgba(255,255,255,0.28), transparent 55%)",
                      animationDuration: "2.4s",
                    }}
                  />
                  <span className="absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                  <span className="absolute left-[70%] top-[38%] h-1 w-1 rounded-full bg-white animate-pulse" />
                </div>
                <div className="font-mono text-[9px] leading-relaxed text-white/60">
                  <div className="text-white">Sector sweep · simulated</div>
                  <div>4 camera nodes · 1 flagged track</div>
                  <div>rule-based correlation</div>
                </div>
              </div>

              {INCIDENTS.map((inc) => (
                <button
                  key={inc.id}
                  onClick={() => focusTower(inc.tower)}
                  className={`group border bg-black/70 p-2.5 text-left backdrop-blur-md transition-all hover:border-white/30 ${
                    inc.pri === "CRITICAL" ? "border-[#ef4444]/40" : "border-white/12"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`font-mono text-[8.5px] font-semibold ${
                        inc.pri === "CRITICAL"
                          ? "text-[#ef4444]"
                          : inc.pri === "WARNING"
                          ? "text-white"
                          : "text-white/45"
                      }`}
                    >
                      {inc.pri}
                    </span>
                    <span className="font-mono text-[8.5px] text-white/40">{inc.t} IST</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-[10px] text-white">
                    <span className="font-semibold">{inc.id}</span>
                    <span className="text-white/40">·</span>
                    <span>{inc.cam}</span>
                    <span className="ml-auto flex items-center gap-1 text-white/50 group-hover:text-white">
                      {inc.score}
                      <ChevronRight size={11} />
                    </span>
                  </div>
                  <div className="mt-1 font-sans text-[8.5px] font-medium leading-relaxed text-white/45">{inc.text}</div>
                </button>
              ))}
            </div>
          </div>

          {/* bottom: selected tower readout + scene hint */}
          <div className="z-30 flex items-center justify-between gap-3 border-t border-white/12 bg-black/70 px-4 py-2 font-hud text-[10px] font-medium text-white/60 backdrop-blur-md">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-white">
                <Crosshair size={12} />
                <span className="font-mono">{selTower?.id} · {selTower?.cam}</span>
              </span>
              <span className="hidden sm:inline">{selTower?.sector}</span>
              <span className="hidden md:inline">
                FOV <span className="font-mono">62°</span> · AZ <span className="font-mono">{String(Math.round(((TOWERS.indexOf(selTower) + 1) * 78) % 360)).padStart(3, "0")}°</span>
              </span>
            </div>
            <span className="hidden text-white/35 sm:inline">
              drag to orbit · scroll to zoom · tap a tower to focus
            </span>
          </div>
        </div>

        {/* breach banner */}
        {breach && (
          <div
            className="absolute left-1/2 top-14 z-40 -translate-x-1/2 border border-[#ef4444] bg-black px-5 py-2 text-center"
            style={{ animation: "fade-up 0.35s ease both" }}
          >
            <div className="font-heading text-xs font-bold text-[#ef4444]">
              ⚠ PERIMETER BREACH DETECTED · SECTOR 4-B / WEST RIDGE
            </div>
            <div className="mt-0.5 font-mono text-[9px] text-white/50">
              QRT Alpha-1 auto-dispatched · siren armed · CAM-01 slewed to contact
            </div>
          </div>
        )}
      </div>

      {/* spec strip below the scene — architectural facts, not measured metrics */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard icon={Cpu} label="Detector" value="YOLOv8n" unit="COCO · person/vehicle" />
        <MetricCard icon={Gauge} label="Tracker" value="ByteTrack" unit="local track IDs" />
        <MetricCard icon={Radar} label="Re-ID" value="OSNet / ResNet" unit="512-d · 2-cam testbed" />
        <MetricCard icon={Shield} label="Evidence" value="SHA-256" unit="hash-chained capsules" />
      </div>
    </div>
  );
}

/* ── HUD sub-components ──────────────────────────────────────────────── */
function Telem({ label, value }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-white/35">{label}</span>
      <span className="text-white">{value}</span>
    </span>
  );
}

function PanelTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-white/12 pb-1.5 font-heading text-[9px] font-semibold text-white/70">
      <Icon size={11} />
      {children}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, unit }) {
  return (
    <div className="border border-white/12 bg-black p-3">
      <div className="flex items-center gap-1.5 font-mono text-[9px] font-medium text-white/45">
        <Icon size={11} />
        {label}
      </div>
      <div className="mt-1 font-mono text-xl font-semibold tabular-nums text-white">
        {value}
        <span className="ml-1 text-[10px] font-medium text-white/40">{unit}</span>
      </div>
    </div>
  );
}
