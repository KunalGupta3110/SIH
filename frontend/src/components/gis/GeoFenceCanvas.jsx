import { useState, useRef, useMemo, useCallback } from "react";
import { Pentagon, Minus, Trash2, Check, X, MousePointer2, Crosshair } from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════════
   GEO-FENCE & TRIPWIRE EDITOR
   Interactive top-down sector canvas. Operators draw restricted-zone
   polygons, tripwire lines and BOP perimeters, name them, assign a
   severity weight, and stage them for the correlation engine.

   Pure SVG + pointer math — no map SDK, no external tiles. The sector
   plate is a stylised schematic (grid, Zero Line, BOP markers) so the
   tool works fully offline / in the demo sandbox.
   ═══════════════════════════════════════════════════════════════════════ */

const W = 960;
const H = 560;

// stylised Border Out Posts along the sector
const BOPS = [
  { id: "BOP-114", x: 170, y: 150 },
  { id: "BOP-115", x: 470, y: 110 },
  { id: "BOP-116", x: 760, y: 190 },
];

const KINDS = {
  zone: { label: "Restricted zone", hint: "closed polygon · entry opens an incident", color: "#ef4444" },
  tripwire: { label: "Tripwire", hint: "directional line · crossing opens an incident", color: "#f5b544" },
  perimeter: { label: "BOP perimeter", hint: "closed polygon · own-force safe area", color: "#3ff09a" },
  mask: { label: "Nuisance mask", hint: "closed polygon · detections inside are demoted", color: "#8a8f94" },
};

const SEV = {
  Critical: { pts: 30, ink: "text-rose-400", dot: "bg-rose-500" },
  High: { pts: 20, ink: "text-amber-400", dot: "bg-amber-400" },
  Medium: { pts: 10, ink: "text-zinc-300", dot: "bg-zinc-400" },
};

const SEED = [
  {
    id: "GF-01",
    name: "River Bend approach",
    kind: "zone",
    severity: "Critical",
    points: [[300, 250], [430, 230], [470, 330], [360, 380], [280, 330]],
    closed: true,
  },
  {
    id: "GF-02",
    name: "Fence-line tripwire",
    kind: "tripwire",
    severity: "High",
    points: [[120, 430], [820, 400]],
    closed: false,
  },
];

// pixel → sector-local metres (stylised: 1px ≈ 0.9 m), then to a fake lat/lon
const toMetres = (p) => [Math.round(p[0] * 0.9), Math.round(p[1] * 0.9)];
const toLatLon = (p) => [
  (32.56 + (H / 2 - p[1]) * 0.00002).toFixed(4),
  (75.12 + (p[0] - W / 2) * 0.00002).toFixed(4),
];
const centroid = (pts) => [
  pts.reduce((s, p) => s + p[0], 0) / pts.length,
  pts.reduce((s, p) => s + p[1], 0) / pts.length,
];
const polyArea = (pts) => {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
};
const lineLen = (pts) => {
  let d = 0;
  for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return d;
};

export default function GeoFenceCanvas({ onDeploy }) {
  const svgRef = useRef(null);
  const [zones, setZones] = useState(SEED);
  const [tool, setTool] = useState("select"); // select | zone | tripwire | perimeter | mask
  const [draft, setDraft] = useState([]); // points of the shape being drawn
  const [cursor, setCursor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [nextSev, setNextSev] = useState("High");
  const [deployed, setDeployed] = useState(false);

  const drawing = tool !== "select";
  const isPolygon = tool === "zone" || tool === "perimeter" || tool === "mask";

  const svgPoint = useCallback((e) => {
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    const y = ((e.clientY - rect.top) / rect.height) * H;
    return [Math.round(Math.max(0, Math.min(W, x))), Math.round(Math.max(0, Math.min(H, y)))];
  }, []);

  const commitDraft = useCallback(
    (pts) => {
      if (isPolygon && pts.length < 3) return;
      if (!isPolygon && pts.length < 2) return;
      const n = zones.filter((z) => z.kind === tool).length + 1;
      const id = `GF-${String(zones.length + 1).padStart(2, "0")}`;
      setZones((zs) => [
        ...zs,
        {
          id,
          name: `${KINDS[tool].label} ${n}`,
          kind: tool,
          severity: nextSev,
          points: pts,
          closed: isPolygon,
        },
      ]);
      setDraft([]);
      setTool("select");
      setSelected(id);
      setDeployed(false);
    },
    [zones, tool, isPolygon, nextSev]
  );

  const onSvgClick = (e) => {
    if (!drawing) return;
    const p = svgPoint(e);
    const next = [...draft, p];
    // close polygon by clicking near the first point
    if (isPolygon && draft.length >= 2) {
      const [fx, fy] = draft[0];
      if (Math.hypot(p[0] - fx, p[1] - fy) < 14) return commitDraft(draft);
    }
    if (!isPolygon && next.length === 2) return commitDraft(next);
    setDraft(next);
  };

  const finishDraft = () => {
    if (draft.length) commitDraft(draft);
  };
  const cancelDraft = () => {
    setDraft([]);
    setTool("select");
  };

  const removeZone = (id) => {
    setZones((zs) => zs.filter((z) => z.id !== id));
    if (selected === id) setSelected(null);
    setDeployed(false);
  };
  const patchZone = (id, patch) => {
    setZones((zs) => zs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
    setDeployed(false);
  };

  const budget = useMemo(
    () => zones.filter((z) => z.kind === "zone" || z.kind === "tripwire").reduce((s, z) => s + SEV[z.severity].pts, 0),
    [zones]
  );

  const deploy = () => {
    setDeployed(true);
    onDeploy?.(zones);
  };

  const sel = zones.find((z) => z.id === selected);

  return (
    <div className="animate-fadeIn space-y-4">
      {/* header */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/12 bg-black p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/12 bg-white/[0.06] text-white">
            <Pentagon size={18} />
          </div>
          <div>
            <h2 className="font-heading text-base font-bold text-white">Geo-Fence &amp; Tripwire Editor</h2>
            <p className="text-xs font-medium text-white/55">
              Sector 4-B · operator-drawn zones feed the rule-based correlator
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-white/50">
            zone weight budget <span className="tabular-nums text-white">+{budget}</span>
          </span>
          <button
            onClick={deploy}
            className={`flex items-center gap-1.5 border px-3 py-1.5 font-heading text-[12px] font-semibold transition-colors ${
              deployed
                ? "border-[#3ff09a]/50 bg-[#3ff09a]/10 text-[#3ff09a]"
                : "border-white bg-white text-black hover:bg-black hover:text-white"
            }`}
          >
            <Check size={13} />
            {deployed ? "Staged for correlator" : "Deploy to sector"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* ── canvas ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/12 bg-black">
          {/* toolbar */}
          <div className="flex flex-wrap items-center gap-1.5 border-b border-white/12 bg-black/60 px-3 py-2">
            <ToolButton active={tool === "select"} onClick={() => { setTool("select"); setDraft([]); }} icon={MousePointer2}>
              Select
            </ToolButton>
            <span className="mx-1 h-4 w-px bg-white/15" />
            {["zone", "tripwire", "perimeter", "mask"].map((k) => (
              <ToolButton key={k} active={tool === k} onClick={() => { setTool(k); setDraft([]); setSelected(null); }} dot={KINDS[k].color}>
                {KINDS[k].label}
              </ToolButton>
            ))}
            <span className="ml-auto flex items-center gap-1.5">
              {Object.keys(SEV).map((s) => (
                <button
                  key={s}
                  onClick={() => setNextSev(s)}
                  className={`flex items-center gap-1 border px-2 py-1 font-mono text-[10px] transition-colors ${
                    nextSev === s ? "border-white/50 text-white" : "border-white/15 text-white/45 hover:text-white/80"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${SEV[s].dot}`} />
                  {s}
                </button>
              ))}
            </span>
          </div>

          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            className={`block w-full ${drawing ? "cursor-crosshair" : "cursor-default"}`}
            onClick={onSvgClick}
            onMouseMove={(e) => drawing && setCursor(svgPoint(e))}
            onMouseLeave={() => setCursor(null)}
            onDoubleClick={finishDraft}
          >
            {/* sector plate */}
            <rect x="0" y="0" width={W} height={H} fill="#050506" />
            {Array.from({ length: Math.floor(W / 40) + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={H} stroke="rgba(255,255,255,0.05)" />
            ))}
            {Array.from({ length: Math.floor(H / 40) + 1 }).map((_, i) => (
              <line key={`h${i}`} x1="0" y1={i * 40} x2={W} y2={i * 40} stroke="rgba(255,255,255,0.05)" />
            ))}
            {/* Zero Line */}
            <line x1="0" y1="470" x2={W} y2="452" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeDasharray="2 4" />
            <text x="12" y="490" fill="rgba(255,255,255,0.35)" fontSize="10" fontFamily="monospace">
              ZERO LINE · IB
            </text>

            {/* BOPs */}
            {BOPS.map((b) => (
              <g key={b.id}>
                <rect x={b.x - 5} y={b.y - 5} width="10" height="10" fill="none" stroke="#3ff09a" strokeWidth="1.5" />
                <text x={b.x + 10} y={b.y + 4} fill="rgba(255,255,255,0.5)" fontSize="10" fontFamily="monospace">
                  {b.id}
                </text>
              </g>
            ))}

            {/* committed zones */}
            {zones.map((z) => {
              const c = KINDS[z.kind].color;
              const on = z.id === selected;
              const d = z.points.map((p) => p.join(",")).join(" ");
              return (
                <g
                  key={z.id}
                  onClick={(e) => { if (!drawing) { e.stopPropagation(); setSelected(z.id); } }}
                  className={drawing ? "" : "cursor-pointer"}
                >
                  {z.closed ? (
                    <polygon points={d} fill={c} fillOpacity={on ? 0.22 : 0.12} stroke={c} strokeWidth={on ? 2 : 1.4} />
                  ) : (
                    <polyline points={d} fill="none" stroke={c} strokeWidth={on ? 3 : 2} strokeDasharray="6 4" />
                  )}
                  {z.points.map((p, i) => (
                    <circle key={i} cx={p[0]} cy={p[1]} r={on ? 3.5 : 2.5} fill={c} />
                  ))}
                  <text
                    x={centroid(z.points)[0]}
                    y={centroid(z.points)[1]}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize="11"
                    fontFamily="monospace"
                    style={{ pointerEvents: "none" }}
                  >
                    {z.id}
                  </text>
                </g>
              );
            })}

            {/* live draft */}
            {draft.length > 0 && (
              <g style={{ pointerEvents: "none" }}>
                <polyline
                  points={[...draft, ...(cursor ? [cursor] : [])].map((p) => p.join(",")).join(" ")}
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                />
                {draft.map((p, i) => (
                  <circle key={i} cx={p[0]} cy={p[1]} r={i === 0 ? 5 : 3} fill={i === 0 ? "#fff" : "rgba(255,255,255,0.6)"} />
                ))}
              </g>
            )}
          </svg>

          {/* draft action bar */}
          {drawing && (
            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 border-t border-white/12 bg-black/85 px-3 py-2 backdrop-blur-md">
              <span className="font-medium text-[11px] text-white/60">
                {isPolygon
                  ? "Click to add points · click the first point (or double-click) to close"
                  : "Click start, then end point"}
                {draft.length > 0 && <span className="ml-2 font-mono text-white/40">{draft.length} pt</span>}
              </span>
              <div className="flex items-center gap-2">
                <button onClick={finishDraft} className="flex items-center gap-1 border border-white bg-white px-2.5 py-1 font-heading text-[11px] font-semibold text-black">
                  <Check size={12} /> Finish
                </button>
                <button onClick={cancelDraft} className="flex items-center gap-1 border border-white/30 px-2.5 py-1 font-heading text-[11px] font-semibold text-white/70 hover:text-white">
                  <X size={12} /> Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── side panel ── */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-white/12 bg-black p-3">
            <div className="font-heading text-[11px] font-semibold text-white/70">Sector zones · {zones.length}</div>
            <div className="mt-2 space-y-1.5">
              {zones.length === 0 && (
                <p className="py-4 text-center text-[11px] font-medium text-white/35">
                  No zones yet — pick a tool and draw on the plate
                </p>
              )}
              {zones.map((z) => (
                <button
                  key={z.id}
                  onClick={() => setSelected(z.id)}
                  className={`flex w-full items-center gap-2 border px-2.5 py-2 text-left transition-colors ${
                    z.id === selected ? "border-white/50 bg-white/[0.04]" : "border-white/12 hover:border-white/25"
                  }`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KINDS[z.kind].color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12px] font-medium text-white">{z.name}</span>
                    <span className="block font-mono text-[9.5px] text-white/40">
                      {z.id} · {KINDS[z.kind].label}
                    </span>
                  </span>
                  <span className={`font-mono text-[9.5px] ${SEV[z.severity].ink}`}>+{SEV[z.severity].pts}</span>
                </button>
              ))}
            </div>
          </div>

          {/* selected zone inspector */}
          {sel && (
            <div className="rounded-2xl border border-white/12 bg-black p-3">
              <div className="flex items-center justify-between">
                <span className="font-heading text-[11px] font-semibold text-white/70">Zone properties</span>
                <button onClick={() => removeZone(sel.id)} className="flex items-center gap-1 text-[10px] font-medium text-white/40 hover:text-rose-400">
                  <Trash2 size={11} /> delete
                </button>
              </div>
              <label className="mt-2 block">
                <span className="font-mono text-[9px] text-white/40">NAME</span>
                <input
                  value={sel.name}
                  onChange={(e) => patchZone(sel.id, { name: e.target.value })}
                  className="mt-0.5 w-full border border-white/12 bg-black px-2 py-1 text-[12px] font-medium text-white focus:border-white/40 focus:outline-none"
                />
              </label>
              <div className="mt-2">
                <span className="font-mono text-[9px] text-white/40">SEVERITY</span>
                <div className="mt-0.5 flex gap-1">
                  {Object.keys(SEV).map((s) => (
                    <button
                      key={s}
                      onClick={() => patchZone(sel.id, { severity: s })}
                      className={`flex flex-1 items-center justify-center gap-1 border py-1 font-mono text-[10px] transition-colors ${
                        sel.severity === s ? "border-white/50 text-white" : "border-white/15 text-white/45 hover:text-white/80"
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${SEV[s].dot}`} />
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <dl className="mt-3 space-y-1 border-t border-white/10 pt-2 font-mono text-[10px] text-white/50">
                <Row k="kind">{KINDS[sel.kind].label}</Row>
                <Row k="vertices">{sel.points.length}</Row>
                {sel.closed ? (
                  <Row k="area">{Math.round(polyArea(sel.points) * 0.81).toLocaleString()} m²</Row>
                ) : (
                  <Row k="length">{Math.round(lineLen(sel.points) * 0.9).toLocaleString()} m</Row>
                )}
                <Row k="centroid">{toLatLon(centroid(sel.points)).join(", ")}</Row>
                <Row k="threat +">{SEV[sel.severity].pts} pts on entry</Row>
              </dl>
              <p className="mt-2 text-[10px] font-medium leading-relaxed text-white/35">
                {KINDS[sel.kind].hint}
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-white/12 bg-black p-3 text-[10px] font-medium leading-relaxed text-white/40">
            <span className="flex items-center gap-1.5 text-white/60">
              <Crosshair size={11} /> How it wires up
            </span>
            <p className="mt-1">
              Deployed zones are handed to the same rule-based correlator that scores live incidents. A track centroid
              inside a <span className="text-white/70">restricted zone</span>, or crossing a{" "}
              <span className="text-white/70">tripwire</span>, adds its severity weight to the 0–100 threat score.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, icon: Icon, dot, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2.5 py-1 font-heading text-[11px] font-semibold transition-colors ${
        active ? "border-white/50 bg-white/[0.06] text-white" : "border-white/15 text-white/50 hover:text-white"
      }`}
    >
      {Icon && <Icon size={12} />}
      {dot && <span className="h-2 w-2 rounded-full" style={{ background: dot }} />}
      {children}
    </button>
  );
}

function Row({ k, children }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-white/35">{k}</dt>
      <dd className="text-right text-white/70">{children}</dd>
    </div>
  );
}
