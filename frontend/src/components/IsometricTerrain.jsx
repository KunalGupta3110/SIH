// IBVAP Sentinel — isometric border-sector terrain, rendered as a black &
// white digital-elevation model. Pure SVG, no raster assets.
//   mode="hero"      → camera network + animated sightlines
//   mode="perimeter" → adds a dashed restricted geofence + a breach marker
// Severity red is the only non-monochrome ink, and only in perimeter mode.

const CAMERAS = [
  { id: "CAM-01", x: 138, y: 236 },
  { id: "CAM-02", x: 300, y: 300 },
  { id: "CAM-03", x: 468, y: 250 },
  { id: "CAM-04", x: 606, y: 300 },
  { id: "CAM-05", x: 700, y: 214 },
];
const SIGHTLINES = [[0, 1], [1, 2], [2, 3], [3, 4]];

// A ridge silhouette as an isometric-ish polyline across the plane.
function ridge(y, amp, seed) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const x = 60 + (i / 12) * 700;
    const h = Math.sin(i * 0.9 + seed) * amp + Math.sin(i * 2.3 + seed) * (amp * 0.35);
    pts.push(`${x.toFixed(0)},${(y - Math.abs(h)).toFixed(0)}`);
  }
  return pts.join(" ");
}

export default function IsometricTerrain({ mode = "hero", className = "" }) {
  const perimeter = mode === "perimeter";
  return (
    <svg
      viewBox="0 0 820 460"
      className={`h-full w-full ${className}`}
      role="img"
      aria-label="Isometric elevation model of the monitored border sector"
    >
      <defs>
        <clipPath id="it-plane">
          <polygon points="410,96 786,250 410,404 34,250" />
        </clipPath>
        <linearGradient id="it-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.02" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.08" />
        </linearGradient>
      </defs>

      {/* isometric ground plane */}
      <polygon points="410,96 786,250 410,404 34,250" fill="url(#it-fade)" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1" />
      {/* plane thickness */}
      <polygon points="34,250 410,404 410,432 34,278" fill="#0a0a0a" stroke="#ffffff" strokeOpacity="0.12" />
      <polygon points="786,250 410,404 410,432 786,278" fill="#050505" stroke="#ffffff" strokeOpacity="0.12" />

      <g clipPath="url(#it-plane)">
        {/* isometric contour grid */}
        {Array.from({ length: 9 }).map((_, i) => {
          const t = (i - 4) / 4;
          return (
            <g key={i} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="1">
              <line x1={410 + t * 376} y1={96 + Math.abs(t) * 0} x2={410 + t * 376} y2={404} />
              <line x1={34 + (t + 1) * 188} y1={250 - (t) * 0} x2={410 + t * 188} y2={96} />
            </g>
          );
        })}
        <line x1="34" y1="250" x2="786" y2="250" stroke="#ffffff" strokeOpacity="0.1" />

        {/* stacked ridge contours — depth via opacity */}
        <polyline points={ridge(250, 8, 0)} fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="1" />
        <polyline points={ridge(266, 16, 1.4)} fill="none" stroke="#ffffff" strokeOpacity="0.22" strokeWidth="1.25" />
        <polyline points={ridge(286, 26, 2.7)} fill="none" stroke="#ffffff" strokeOpacity="0.34" strokeWidth="1.5" />
        <polyline points={ridge(310, 34, 3.9)} fill="none" stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1.75" />

        {/* river / infiltration channel */}
        <path
          d="M120,250 C 240,300 300,206 400,252 S 560,318 706,250"
          fill="none"
          stroke="#ffffff"
          strokeOpacity="0.7"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {perimeter && (
          <g>
            <polygon
              points="244,224 470,178 588,254 500,322 296,318"
              fill="#ef4444"
              fillOpacity="0.06"
              stroke="#ef4444"
              strokeWidth="2"
              strokeDasharray="7 5"
              className="animate-[dash-flow_1s_linear_infinite]"
            />
            <text x="246" y="214" fill="#ef4444" fillOpacity="0.9" fontSize="9.5" fontFamily="'IBM Plex Mono',monospace" letterSpacing="1">
              RESTRICTED GEOFENCE · 100m
            </text>
          </g>
        )}
      </g>

      {/* animated sightlines */}
      {SIGHTLINES.map(([a, b], i) => (
        <line
          key={i}
          x1={CAMERAS[a].x}
          y1={CAMERAS[a].y}
          x2={CAMERAS[b].x}
          y2={CAMERAS[b].y}
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="1.25"
          strokeDasharray="3 6"
          style={{ animation: "dash-flow 1.1s linear infinite" }}
        />
      ))}

      {/* camera nodes */}
      {CAMERAS.map((c, i) => {
        const alert = perimeter && c.id === "CAM-03";
        const ink = alert ? "#ef4444" : "#ffffff";
        return (
          <g key={c.id} transform={`translate(${c.x}, ${c.y})`}>
            <line x1="0" y1="0" x2="0" y2="20" stroke={ink} strokeOpacity="0.35" strokeWidth="1.25" />
            <ellipse cx="0" cy="22" rx="6" ry="2.5" fill={ink} fillOpacity="0.14" />
            <circle r="5" fill="none" stroke={ink} strokeWidth="1.5">
              <animate attributeName="r" values="5;15;5" dur="2.8s" begin={`${i * 0.45}s`} repeatCount="indefinite" />
              <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2.8s" begin={`${i * 0.45}s`} repeatCount="indefinite" />
            </circle>
            <rect x="-3.5" y="-3.5" width="7" height="7" fill="#000000" stroke={ink} strokeWidth="1.75" transform="rotate(45)" />
            <g transform="translate(9,-5)">
              <rect x="0" y="-7.5" width={c.id.length * 6 + 6} height="14" fill="#000000" stroke={ink} strokeOpacity="0.4" />
              <text x="3" y="2.5" fill={ink} fontSize="8.5" fontFamily="'IBM Plex Mono',monospace" letterSpacing="0.5">{c.id}</text>
            </g>
          </g>
        );
      })}

      {perimeter && (
        <g transform="translate(452, 246)">
          <circle r="9" fill="none" stroke="#ef4444" strokeWidth="1.5" className="animate-ping" />
          <path d="M0,-7 L7,6 L-7,6 Z" fill="#000000" stroke="#ef4444" strokeWidth="1.75" />
          <circle r="1.5" fill="#ef4444" cy="1" />
        </g>
      )}
    </svg>
  );
}
