import { useEffect, useRef } from "react";

// Black & white rotating globe — plain 2D canvas, no WebGL, no dependencies.
// A dot-sphere with a coarse land mask, a lit arc of border sectors and a
// pulsing beacon on the SSB Gurdaspur sector. Always renders.

const DEG = Math.PI / 180;
const PRIMARY = { lat: 32.04, lon: 75.4 };
const SECTORS = [
  { lat: 35.0, lon: 74.1 },
  { lat: 33.4, lon: 74.6 },
  { lat: 30.3, lon: 74.4 },
  { lat: 27.6, lon: 71.3 },
  { lat: 24.4, lon: 68.9 },
];
// very coarse continent outline (dots), enough to read as a map in B&W
const LAND = [
  [34, 76], [32, 78], [30, 80], [27, 81], [24, 83], [22, 86], [20, 85], [18, 83],
  [16, 80], [13, 78], [11, 78], [14, 75], [17, 73], [20, 73], [23, 71], [26, 70],
  [29, 72], [32, 75], [28, 77], [24, 79], [20, 80], [22, 74],
  [45, 88], [50, 100], [40, 112], [36, 104], [55, 78], [60, 62], [52, 48], [42, 44],
  [30, 32], [20, 22], [10, 16], [0, 22], [-12, 26], [-24, 26], [-32, 24], [6, 38], [16, 40],
  [50, 12], [45, 6], [55, 26], [47, 22], [40, 2], [30, 46], [25, 52], [36, 40],
];

function toVec(lat, lon) {
  const p = lat * DEG;
  const l = lon * DEG;
  return [Math.cos(p) * Math.cos(l), Math.sin(p), Math.cos(p) * Math.sin(l)];
}

export default function SentinelGlobe({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const land = LAND.map(([la, lo]) => toVec(la, lo));
    const sectors = SECTORS.map((s) => toVec(s.lat, s.lon));
    const primary = toVec(PRIMARY.lat, PRIMARY.lon);
    const tilt = 20 * DEG;

    let W = 0, H = 0, R = 0, cx = 0, cy = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.clientWidth || 1;
      H = canvas.clientHeight || 1;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      R = Math.min(W, H) * 0.42;
      cx = W / 2;
      cy = H / 2;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // rotate a unit vector around Y by yaw, then tilt around X
    const project = (v, yaw) => {
      const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
      let x = v[0] * cyaw + v[2] * syaw;
      let z = -v[0] * syaw + v[2] * cyaw;
      let y = v[1];
      const ct = Math.cos(tilt), st = Math.sin(tilt);
      const y2 = y * ct - z * st;
      const z2 = y * st + z * ct;
      return { sx: cx + x * R, sy: cy - y2 * R, z: z2 };
    };

    let raf;
    const start = performance.now();
    // yaw that brings the Gurdaspur sector to the centre of the near face
    const baseYaw = -Math.atan2(primary[0], primary[2]) + 0.12;
    const draw = (now) => {
      const t = (now - start) / 1000;
      const yaw = reduce ? baseYaw : baseYaw + Math.sin(t * 0.1) * 0.42;
      ctx.clearRect(0, 0, W, H);

      // limb + halo
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.1)";
      ctx.beginPath();
      ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
      ctx.stroke();

      // graticule dots
      for (let la = -60; la <= 60; la += 15) {
        for (let lo = 0; lo < 360; lo += 8) {
          const pt = project(toVec(la, lo), yaw);
          if (pt.z <= 0) continue;
          ctx.fillStyle = `rgba(255,255,255,${0.08 + pt.z * 0.16})`;
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // land dots
      for (const v of land) {
        const pt = project(v, yaw);
        if (pt.z <= 0.02) continue;
        ctx.fillStyle = `rgba(255,255,255,${0.5 + pt.z * 0.45})`;
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 1.9 + pt.z * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }

      // border line through the sectors
      const chain = [toVec(36, 74), ...SECTORS.map((s) => toVec(s.lat, s.lon)), toVec(PRIMARY.lat, PRIMARY.lon), toVec(22, 68)]
        .map((v) => project(v, yaw));
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      let started = false;
      for (const p of chain) {
        if (p.z <= 0) { started = false; continue; }
        if (!started) { ctx.moveTo(p.sx, p.sy); started = true; }
        else ctx.lineTo(p.sx, p.sy);
      }
      ctx.stroke();

      // sector ticks
      for (const v of sectors) {
        const pt = project(v, yaw);
        if (pt.z <= 0) continue;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(pt.sx, pt.sy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }

      // primary beacon + pulse
      const bp = project(primary, yaw);
      if (bp.z > -0.15) {
        const k = (t % 2.6) / 2.6;
        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - k)})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(bp.sx, bp.sy, 3 + k * 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(bp.sx, bp.sy, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.beginPath();
        ctx.arc(bp.sx, bp.sy, 6, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={`h-full w-full ${className}`}
      role="img"
      aria-label="Rotating globe marking the monitored border sector"
    />
  );
}
