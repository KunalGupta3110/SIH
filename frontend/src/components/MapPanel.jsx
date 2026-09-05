import { useState, useMemo } from "react";
import {
  Compass,
  Video,
  ShieldAlert,
  Radio,
  Eye,
  Crosshair,
  Maximize2,
  Layers,
  ChevronRight,
  Activity,
  CheckCircle2,
} from "lucide-react";

const CAMERA_COORDS = {
  CAM_ALPHA: { x: 190, y: 350, name: "Checkpost Alpha Gate", fovSpread: 135, az: "025° NE", coords: "32°04'12.4\"N 75°18'44.2\"E" },
  CAM_BRAVO: { x: 450, y: 350, name: "BOP Bravo Perimeter", fovSpread: 130, az: "018° NNE", coords: "32°04'28.1\"N 75°18'59.8\"E" },
  CAM_CHARLIE: { x: 740, y: 350, name: "Tower Charlie Culvert", fovSpread: 140, az: "355° NNW", coords: "32°04'45.6\"N 75°19'12.0\"E" },
  CAM_DELTA: { x: 1010, y: 350, name: "Delta Riverine Crossing", fovSpread: 130, az: "012° N", coords: "32°05'02.2\"N 75°19'31.4\"E" },
};

export default function MapPanel({
  cameraHealth = [],
  incidents = [],
  selectedId,
  onSelect,
  className = "relative w-full h-[580px] rounded-2xl overflow-hidden border border-sky-500/30 bg-[#02060c] shadow-2xl font-mono",
}) {
  // Layer visibility toggles
  const [showCones, setShowCones] = useState(true);
  const [showRings, setShowRings] = useState(true);
  const [showVectors, setShowVectors] = useState(true);
  const [showRadarSweep, setShowRadarSweep] = useState(true);
  const [hoveredEntity, setHoveredEntity] = useState(null);

  // Active / Primary Incident for map tracking (only top 1-2 to avoid visual clutter/collision)
  const activeIncident = useMemo(() => {
    if (selectedId && selectedId.startsWith("INC-")) {
      return incidents.find((i) => i.incident_id === selectedId);
    }
    return incidents.find((i) => i.status !== "CONFIRMED" && i.status !== "DISMISSED_FP") || incidents[0] || null;
  }, [incidents, selectedId]);

  // Selected item telemetry
  const selectedInfo = useMemo(() => {
    const id = selectedId || hoveredEntity;
    if (!id) return null;
    if (CAMERA_COORDS[id]) {
      const cam = cameraHealth.find((c) => c.camera_id === id);
      return {
        type: "camera",
        id,
        ...CAMERA_COORDS[id],
        status: cam?.status || "ONLINE",
        fps: "29.8 FPS",
        resolution: "3840x2160 4K Optical + FLIR Thermal",
      };
    }
    if (activeIncident && (activeIncident.incident_id === id || id === "target")) {
      return {
        type: "target",
        id: activeIncident.incident_id,
        threat: activeIncident.threat_score,
        targetClass: activeIncident.target_class || "person",
        summary: activeIncident.story_summary,
        cameras: activeIncident.cameras_involved || ["CAM_ALPHA", "CAM_BRAVO"],
        confidence: activeIncident.confidence ? `${(activeIncident.confidence * 100).toFixed(0)}%` : "94%",
        transitTime: "8.5s Corridor Elapsed",
        speed: "1.8 m/s (Crawl / Sprint Vector)",
        coords: "32°04'21.8\"N 75°18'51.0\"E",
      };
    }
    return null;
  }, [selectedId, hoveredEntity, activeIncident, cameraHealth]);

  return (
    <div className={className}>
      {/* ── C4ISR VECTOR RADAR CANVAS (1200 x 520) ────────────────── */}
      <svg
        viewBox="0 0 1200 520"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full select-none"
      >
        <defs>
          {/* Tactical Millimeter Grid Pattern */}
          <pattern id="tactical-grid-dense" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#0e2238" strokeWidth="0.6" />
            <circle cx="0" cy="0" r="0.8" fill="#1e3a5f" />
          </pattern>
          <pattern id="tactical-grid-major" width="150" height="150" patternUnits="userSpaceOnUse">
            <rect width="150" height="150" fill="none" stroke="#143452" strokeWidth="1.2" />
            <path d="M 75 70 L 75 80 M 70 75 L 80 75" stroke="#1d4ed8" strokeWidth="0.8" opacity="0.6" />
          </pattern>

          {/* Danger Diagonal Hatch for 100m Restricted Zone */}
          <pattern id="red-zone-hatch" width="16" height="16" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
            <line x1="0" y1="0" x2="0" y2="16" stroke="rgba(239, 68, 68, 0.25)" strokeWidth="1.8" />
          </pattern>

          {/* Radar Sweep Radial Gradient */}
          <radialGradient id="radar-center-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.08" />
            <stop offset="60%" stopColor="#0284c7" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#02060c" stopOpacity="0" />
          </radialGradient>

          {/* Optical Beam Gradients */}
          <linearGradient id="fov-beam-active" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.25" />
            <stop offset="40%" stopColor="#ef4444" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.01" />
          </linearGradient>
          <linearGradient id="fov-beam-idle" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.18" />
            <stop offset="60%" stopColor="#38bdf8" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.01" />
          </linearGradient>

          {/* Glow filter for active alerts */}
          <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Base Background & Grids */}
        <rect width="1200" height="520" fill="#02060c" />
        <rect width="1200" height="520" fill="url(#tactical-grid-dense)" />
        <rect width="1200" height="520" fill="url(#tactical-grid-major)" />

        {/* Concentric Defense Range Distance Rings (Centered near sector center 600, 70) */}
        {showRings && (
          <g opacity="0.45">
            {/* Range 50m */}
            <path d="M 100 130 A 650 650 0 0 1 1100 130" fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="4 4" />
            <text x="50" y="134" fill="#38bdf8" fontSize="10" fontWeight="bold">RANGE: 50m</text>

            {/* Range 100m */}
            <path d="M 80 190 A 750 750 0 0 1 1120 190" fill="none" stroke="#38bdf8" strokeWidth="1" strokeDasharray="5 5" />
            <text x="50" y="194" fill="#38bdf8" fontSize="10" fontWeight="bold">RANGE: 100m</text>

            {/* Range 200m */}
            <path d="M 60 300 A 900 900 0 0 1 1140 300" fill="none" stroke="#38bdf8" strokeWidth="0.8" strokeDasharray="6 6" />
            <text x="50" y="304" fill="#38bdf8" fontSize="10" fontWeight="bold">RANGE: 200m</text>
          </g>
        )}

        {/* ── INTERNATIONAL ZERO LINE (BORDER TRIPWIRE) ─────────────── */}
        <g>
          {/* Outer glow aura */}
          <line x1="40" y1="70" x2="1160" y2="70" stroke="#ef4444" strokeWidth="4" opacity="0.15" />
          {/* Main dashed border line */}
          <line x1="40" y1="70" x2="1160" y2="70" stroke="#ef4444" strokeWidth="1.8" strokeDasharray="8 6" filter="url(#glow-red)" />
          {/* Terminal border pillar markers */}
          <circle cx="40" cy="70" r="4" fill="#ef4444" />
          <circle cx="1160" cy="70" r="4" fill="#ef4444" />
          {/* Clean tactical zero line title - positioned above the line with no collisions */}
          <text x="45" y="55" fill="#ef4444" fontSize="12" fontWeight="bold" letterSpacing="1.5">
            INTERNATIONAL ZERO LINE (PUNJAB BORDER SECTOR) // GEOFENCE ZERO
          </text>
          <text x="1050" y="55" fill="#f87171" fontSize="10" opacity="0.8">
            BEARING: 090° EAST
          </text>
        </g>

        {/* ── 100m RESTRICTED RED ZONE CORRIDOR ────────────────────── */}
        <g>
          {/* Zone boundary laser tripwires */}
          <line x1="40" y1="190" x2="1160" y2="190" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
          <line x1="40" y1="300" x2="1160" y2="300" stroke="#ef4444" strokeWidth="1" strokeDasharray="4 4" opacity="0.8" />
          {/* Fill with danger hatch */}
          <rect x="40" y="190" width="1120" height="110" fill="url(#red-zone-hatch)" />
          <rect x="40" y="190" width="1120" height="110" fill="rgba(239, 68, 68, 0.05)" />
          {/* Clear tactical label at the top margin of the zone, completely free of collisions */}
          <text x="48" y="210" fill="#f87171" fontSize="11" fontWeight="bold" letterSpacing="1.2">
            RESTRICTED RED ZONE [100m DEFENSE TRIPWIRE] // IMMEDIATE QRT INTERCEPT
          </text>
        </g>

        {/* ── CAMERA COVERAGE RADAR FOV CONES ────────────────────────── */}
        {showCones && (
          <g>
            {Object.entries(CAMERA_COORDS).map(([camId, cam]) => {
              const isActive = activeIncident?.cameras_involved?.includes(camId);
              const isSel = selectedId === camId;
              const fillGrad = isActive ? "url(#fov-beam-active)" : "url(#fov-beam-idle)";
              const strokeCol = isActive ? "#ef4444" : "#38bdf8";

              // True conical sector arc projecting upward from camera tower (cam.x, 350) to (cam.x +/- 125, 140)
              return (
                <g key={camId} className="transition-all duration-300">
                  {/* FOV Cone polygon */}
                  <polygon
                    points={`${cam.x},350 ${cam.x - cam.fovSpread},130 ${cam.x + cam.fovSpread},130`}
                    fill={fillGrad}
                    stroke={strokeCol}
                    strokeWidth={isActive || isSel ? "1.2" : "0.5"}
                    strokeDasharray={isActive ? "none" : "3 3"}
                    opacity={isSel ? "1" : isActive ? "0.9" : "0.6"}
                  />
                  {/* Outer FOV arc cap */}
                  <path
                    d={`M ${cam.x - cam.fovSpread} 130 Q ${cam.x} 120 ${cam.x + cam.fovSpread} 130`}
                    fill="none"
                    stroke={strokeCol}
                    strokeWidth={isActive ? "1.5" : "0.8"}
                    opacity="0.8"
                  />
                  {/* Optical focal center line */}
                  <line
                    x1={cam.x}
                    y1="350"
                    x2={cam.x}
                    y2="125"
                    stroke={strokeCol}
                    strokeWidth="0.6"
                    strokeDasharray="2 4"
                    opacity="0.5"
                  />
                </g>
              );
            })}
          </g>
        )}

        {/* ── RADAR SWEEP LINE ANIMATION ─────────────────────────────── */}
        {showRadarSweep && (
          <g>
            <circle cx="600" cy="70" r="480" fill="url(#radar-center-glow)" />
            {/* Animated SVG Sweep line */}
            <g transform="translate(600, 70)">
              <line x1="0" y1="0" x2="0" y2="440" stroke="#38bdf8" strokeWidth="1.5" opacity="0.6">
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="-65"
                  to="65"
                  dur="4s"
                  repeatCount="indefinite"
                  additive="replace"
                />
              </line>
            </g>
          </g>
        )}

        {/* ── MULTI-CAMERA SENSOR TRANSIT FIBER LINE ─────────────────── */}
        {showVectors && (
          <g>
            {/* High-speed optic backbone line */}
            <line x1="190" y1="350" x2="1010" y2="350" stroke="#0284c7" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.7" />

            {/* Corridor Transit Time Badges between cameras */}
            <g transform="translate(315, 342)">
              <rect x="-35" y="-10" width="70" height="18" rx="4" fill="#041220" stroke="#38bdf8" strokeWidth="0.8" />
              <text x="0" y="2.5" fill="#38bdf8" fontSize="9.5" fontWeight="bold" textAnchor="middle">➔ 8.5s WINDOW</text>
            </g>
            <g transform="translate(585, 342)">
              <rect x="-35" y="-10" width="70" height="18" rx="4" fill="#041220" stroke="#0284c7" strokeWidth="0.8" opacity="0.8" />
              <text x="0" y="2.5" fill="#38bdf8" fontSize="9.5" fontWeight="bold" textAnchor="middle" opacity="0.8">➔ 9.2s WINDOW</text>
            </g>
            <g transform="translate(865, 342)">
              <rect x="-35" y="-10" width="70" height="18" rx="4" fill="#041220" stroke="#0284c7" strokeWidth="0.8" opacity="0.8" />
              <text x="0" y="2.5" fill="#38bdf8" fontSize="9.5" fontWeight="bold" textAnchor="middle" opacity="0.8">➔ 7.8s WINDOW</text>
            </g>
          </g>
        )}

        {/* ── ACTIVE BREACH TARGET TRACK & RECONSTRUCTION VECTOR ──────── */}
        {activeIncident && (
          <g>
            {/* Reconstructed Multi-Camera Infiltration Trajectory */}
            {/* Starts at CAM_ALPHA sector (210, 245), transit path to CAM_BRAVO sector (450, 245) */}
            <path
              d="M 205 245 Q 320 235 435 248"
              fill="none"
              stroke="#ef4444"
              strokeWidth="2.5"
              strokeDasharray="6 4"
              filter="url(#glow-red)"
            />

            {/* Waypoint 1: CAM_ALPHA Incursion Point */}
            <g transform="translate(205, 245)">
              <circle r="6" fill="#ef4444" opacity="0.3" />
              <circle r="3" fill="#ef4444" />
              {/* Leader tag */}
              <line x1="0" y1="0" x2="-25" y2="-22" stroke="#ef4444" strokeWidth="0.8" />
              <rect x="-95" y="-34" width="70" height="16" rx="3" fill="#03070d" stroke="#ef4444" strokeWidth="0.8" />
              <text x="-60" y="-22" fill="#fca5a5" fontSize="8.5" fontWeight="bold" textAnchor="middle">03:14:02 BREACH</text>
            </g>

            {/* Waypoint 2: CAM_BRAVO Re-Acquisition Point */}
            <g transform="translate(435, 248)">
              <circle r="6" fill="#10b981" opacity="0.3" />
              <circle r="3" fill="#10b981" />
              {/* Leader tag */}
              <line x1="0" y1="0" x2="25" y2="-22" stroke="#10b981" strokeWidth="0.8" />
              <rect x="25" y="-34" width="82" height="16" rx="3" fill="#03070d" stroke="#10b981" strokeWidth="0.8" />
              <text x="66" y="-22" fill="#6ee7b7" fontSize="8.5" fontWeight="bold" textAnchor="middle">03:14:11 RE-ID 94%</text>
            </g>

            {/* Active Moving Contact Reticle (Corridor Midpoint 320, 240) */}
            <g
              transform="translate(320, 240)"
              className="cursor-pointer"
              onClick={() => onSelect?.(activeIncident.incident_id)}
              onMouseEnter={() => setHoveredEntity("target")}
              onMouseLeave={() => setHoveredEntity(null)}
            >
              {/* Pulsing warning rings */}
              <circle r="14" fill="none" stroke="#ef4444" strokeWidth="1" opacity="0.6">
                <animate attributeName="r" values="8;22;8" dur="2s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
              </circle>

              {/* Tactical Diamond Reticle */}
              <polygon points="0,-9 9,0 0,9 -9,0" fill="#ef4444" stroke="#ffffff" strokeWidth="1.2" filter="url(#glow-red)" />
              <circle r="2.5" fill="#ffffff" />

              {/* Heading Vector Arrow pointing North-East (042°) */}
              <line x1="0" y1="0" x2="16" y2="-18" stroke="#ffffff" strokeWidth="1.8" />
              <polygon points="16,-18 10,-17 14,-12" fill="#ffffff" />

              {/* Tactical Target Callout Tag (Positioned above cleanly with zero collisions) */}
              <g transform="translate(18, -48)">
                <line x1="-2" y1="30" x2="10" y2="15" stroke="#ef4444" strokeWidth="1" />
                <rect x="10" y="0" width="165" height="34" rx="4" fill="#0a0507" stroke="#ef4444" strokeWidth="1.2" filter="url(#glow-red)" />
                <rect x="10" y="0" width="165" height="14" rx="4" fill="#dc2626" />
                <text x="16" y="10.5" fill="#ffffff" fontSize="9" fontWeight="bold">
                  ● ACTIVE BREACH · THREAT {activeIncident.threat_score}/100
                </text>
                <text x="16" y="26" fill="#fca5a5" fontSize="8.5">
                  {activeIncident.incident_id} [{activeIncident.target_class?.toUpperCase() || "PERSON"}] · 1.8 m/s
                </text>
              </g>
            </g>
          </g>
        )}

        {/* ── CAMERA SENSOR MAST NODES (Y = 350) ──────────────────────── */}
        {Object.entries(CAMERA_COORDS).map(([camId, cam]) => {
          const isSelected = selectedId === camId;
          const isHovered = hoveredEntity === camId;
          const isBreached = activeIncident?.cameras_involved?.includes(camId);

          return (
            <g
              key={camId}
              transform={`translate(${cam.x}, ${cam.y})`}
              className="cursor-pointer group"
              onClick={() => onSelect?.(camId)}
              onMouseEnter={() => setHoveredEntity(camId)}
              onMouseLeave={() => setHoveredEntity(null)}
            >
              {/* Mast Pylon Stand graphic */}
              <path d="M -8 18 L 0 0 L 8 18 Z" fill="#0c1f33" stroke="#1e3a5f" strokeWidth="1" />
              <line x1="-12" y1="18" x2="12" y2="18" stroke="#1e3a5f" strokeWidth="2" />

              {/* Selection Halo */}
              {(isSelected || isHovered) && (
                <circle r="18" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeDasharray="3 3">
                  <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="8s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Optical Housing Disc */}
              <circle
                r="11"
                fill={isBreached ? "#1c0b0f" : "#061322"}
                stroke={isBreached ? "#ef4444" : isSelected ? "#38bdf8" : "#0284c7"}
                strokeWidth={isBreached || isSelected ? "2" : "1.2"}
                filter={isBreached ? "url(#glow-red)" : isSelected ? "url(#glow-cyan)" : undefined}
              />

              {/* Lens Aperture dot */}
              <circle r="4" fill={isBreached ? "#ef4444" : "#38bdf8"} />

              {/* Active Beacon status indicator */}
              <circle cx="7" cy="-7" r="3" fill="#10b981" />
              <circle cx="7" cy="-7" r="5" fill="none" stroke="#10b981" opacity="0.6">
                <animate attributeName="r" values="3;7;3" dur="2s" repeatCount="indefinite" />
              </circle>

              {/* Camera Tag Below Mast (y = 28) - Never overlaps target or line! */}
              <g transform="translate(0, 30)">
                <rect
                  x="-42"
                  y="-8"
                  width="84"
                  height="17"
                  rx="3"
                  fill={isBreached ? "#1e0b0e" : isSelected ? "#071c30" : "#040c16"}
                  stroke={isBreached ? "#ef4444" : isSelected ? "#38bdf8" : "#1e3a5f"}
                  strokeWidth="1"
                />
                <text
                  x="0"
                  y="4"
                  fill={isBreached ? "#f87171" : isSelected ? "#38bdf8" : "#cbd5e1"}
                  fontSize="9.5"
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {camId}
                </text>
              </g>
            </g>
          );
        })}

        {/* ── TACTICAL BSF PATROL ROAD CORRIDOR (Y = 445) ───────────── */}
        <g>
          {/* Dark asphalt highway bed */}
          <rect x="40" y="445" width="1120" height="26" fill="#0b131e" stroke="#1e293b" strokeWidth="1" />
          {/* Dashed highway center line */}
          <line x1="40" y1="458" x2="1160" y2="458" stroke="#eab308" strokeWidth="1.2" strokeDasharray="14 10" opacity="0.85" />
          {/* Highway shoulder guard lines */}
          <line x1="40" y1="446" x2="1160" y2="446" stroke="#475569" strokeWidth="0.8" />
          <line x1="40" y1="470" x2="1160" y2="470" stroke="#475569" strokeWidth="0.8" />
          {/* Road Corridor text */}
          <text x="48" y="488" fill="#64748b" fontSize="10.5" fontWeight="bold">
            TACTICAL BSF PATROL ROAD // SECTOR 4B MOBILITY CORRIDOR
          </text>
          <text x="1040" y="488" fill="#475569" fontSize="9.5">
            QRT SPEED CAP: 60 KM/H
          </text>
        </g>
      </svg>

      {/* ── TOP-LEFT TACTICAL HUD HEADER ────────────────────────────── */}
      <div className="absolute top-3 left-4 flex flex-col gap-1 z-10 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
          <span className="text-[12px] font-bold text-white tracking-wider">C4ISR SECTOR 4-B RADAR</span>
          <span className="rounded border border-sky-500/40 bg-sky-500/10 px-1.5 py-0.2 text-[9.5px] text-sky-300">
            NORTH PERIMETER
          </span>
        </div>
        <div className="text-[10px] text-slate-400">
          LAT 32°04'12"N · LON 75°18'44"E · ELEVATION 248m MSL
        </div>
      </div>

      {/* ── TOP-RIGHT COMPASS & TACTICAL LAYER CONTROLS ───────────────── */}
      <div className="absolute top-3 right-4 flex flex-col items-end gap-2 z-10">
        {/* Compass Dial */}
        <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-[#050b14]/90 px-3 py-1.5 shadow-xl text-[11px] backdrop-blur-sm">
          <Compass size={14} className="text-sky-400 animate-spin" style={{ animationDuration: "30s" }} />
          <span className="font-bold text-slate-200">GRID NORTH // 000°</span>
        </div>

        {/* Tactical Layer Visibility Toggles */}
        <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#050b14]/90 p-1 shadow-xl text-[10px] backdrop-blur-sm">
          <button
            onClick={() => setShowCones(!showCones)}
            className={`px-2 py-1 rounded transition-all ${
              showCones ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            CONES
          </button>
          <button
            onClick={() => setShowRings(!showRings)}
            className={`px-2 py-1 rounded transition-all ${
              showRings ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            RINGS
          </button>
          <button
            onClick={() => setShowVectors(!showVectors)}
            className={`px-2 py-1 rounded transition-all ${
              showVectors ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            VECTORS
          </button>
          <button
            onClick={() => setShowRadarSweep(!showRadarSweep)}
            className={`px-2 py-1 rounded transition-all ${
              showRadarSweep ? "bg-sky-500/20 text-sky-300 font-bold border border-sky-500/40" : "text-slate-500 hover:text-slate-300"
            }`}
          >
            SWEEP
          </button>
        </div>
      </div>

      {/* ── BOTTOM-RIGHT INTERACTIVE INSPECTION TELEMETRY DRAWER ─────── */}
      {selectedInfo && (
        <div className="absolute bottom-3 right-4 max-w-sm w-full rounded-xl border border-sky-500/40 bg-[#050b14]/95 p-3.5 shadow-2xl z-20 backdrop-blur-md text-[11px] animate-fadeIn">
          {selectedInfo.type === "camera" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-1.5">
                  <Video size={13} className="text-sky-400" />
                  <span className="font-bold text-white text-[12px]">{selectedInfo.id}</span>
                </div>
                <span className="flex items-center gap-1 text-[9.5px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/30">
                  <CheckCircle2 size={10} />
                  {selectedInfo.status}
                </span>
              </div>
              <div className="text-slate-300 font-semibold text-[11.5px]">{selectedInfo.name}</div>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                <div>AZIMUTH: <span className="text-white font-bold">{selectedInfo.az}</span></div>
                <div>FRAME RATE: <span className="text-white font-bold">{selectedInfo.fps}</span></div>
              </div>
              <div className="text-[9.5px] text-slate-400 border-t border-white/5 pt-1">
                {selectedInfo.coords}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                <div className="flex items-center gap-1.5 text-red-400 font-bold">
                  <ShieldAlert size={14} />
                  <span className="text-[12px]">{selectedInfo.id}</span>
                </div>
                <span className="rounded bg-red-600 px-2 py-0.5 text-[9.5px] font-bold text-white shadow-sm">
                  THREAT {selectedInfo.threat}/100
                </span>
              </div>
              <div className="text-[10px] text-slate-300">
                <span className="text-slate-400">CORRIDOR TRANSIT:</span>{" "}
                <span className="font-bold text-sky-400">{selectedInfo.cameras.join(" ➔ ")}</span>
              </div>
              <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-400">
                <div>AI RE-ID: <span className="text-emerald-400 font-bold">{selectedInfo.confidence}</span></div>
                <div>SPEED: <span className="text-white font-bold">{selectedInfo.speed}</span></div>
              </div>
              <div className="text-[10.5px] text-slate-300 border-t border-white/5 pt-1 line-clamp-2">
                {selectedInfo.summary || "Intruder detected penetrating outer zero-line tripwire, tracked across sector."}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

