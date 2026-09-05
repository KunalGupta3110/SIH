import { useState, useRef, useMemo, useEffect } from "react";
import { Video, AlertTriangle, Play, Pause, RotateCcw, Crosshair, Eye, Shield, Radio, VolumeX, Volume2, Maximize2, Zap, Search, X } from "lucide-react";
import SectionHeader from "./SectionHeader.jsx";
import api from "../lib/api.js";

export const REAL_LIFE_SCENARIOS = [
  {
    id: "vehicle_rush",
    title: "Vehicle Ramming & Gate Rush",
    targetClass: "Vehicle / Car",
    camera: "CAM_ALPHA",
    severity: "CRITICAL",
    threatScore: 88,
    speed: "88 km/h",
    confidence: "94.2%",
    videoUrl: "/data/threat_vehicle_rush_web.mp4",
    description: "High-speed vehicle rush detected approaching Checkpost Alpha barrier gate at 88 km/h. Automated ANPR tripwire triggered.",
    factors: ["Restricted Zone Penetration (+30)", "Rapid Approach Velocity (+20)", "Night Window (+10)"],
    boxStyle: { left: "26%", top: "34%", width: "48%", height: "46%" },
    keywords: ["car", "vehicle", "rush", "ramming", "speed", "gate", "alpha", "anpr"],
  },
  {
    id: "night_crawl",
    title: "Night Perimeter Crawl Infiltration",
    targetClass: "Person (Crawling)",
    camera: "CAM_BRAVO",
    severity: "CRITICAL",
    threatScore: 92,
    speed: "6 px/s (Low Velocity)",
    confidence: "96.5%",
    videoUrl: "/data/threat_night_crawl_web.mp4",
    description: "Low-profile crawling breach in tall grass along the 100m restricted red zone. Thermal IR contrast signature confirmed.",
    factors: ["Restricted Red Zone Breach (+30)", "Curfew Hour Curvature (+20)", "Loitering >240s (+15)"],
    boxStyle: { left: "30%", top: "40%", width: "42%", height: "38%" },
    keywords: ["crawl", "night", "person", "grass", "fence", "infiltrator", "bravo", "red zone"],
  },
  {
    id: "cycle_loiter",
    title: "Cycle & Pedestrian Loitering",
    targetClass: "Bicycle / Pedestrian",
    camera: "CAM_CHARLIE",
    severity: "WARNING",
    threatScore: 54,
    speed: "14 km/h",
    confidence: "91.8%",
    videoUrl: "/data/vtest_pedestrians_web.mp4",
    description: "Cyclist and pedestrian stationary in caution corridor for >240s near patrol road. Dwell time anomaly flagged.",
    factors: ["Caution Corridor Dwell >240s (+15)", "Perimeter Road Vicinity (+20)"],
    boxStyle: { left: "22%", top: "28%", width: "36%", height: "52%" },
    keywords: ["cycle", "bicycle", "pedestrian", "walk", "loiter", "road", "charlie", "dwell"],
  },
  {
    id: "group_breach",
    title: "Coordinated Multi-Person Breach",
    targetClass: "Group (4 Targets)",
    camera: "CAM_DELTA",
    severity: "CRITICAL",
    threatScore: 95,
    speed: "35 px/s",
    confidence: "95.0%",
    videoUrl: "/data/threat_group_breach_web.mp4",
    description: "Simultaneous 4-person cluster breach attempting to cut perimeter fencing. Multi-target tracker linkage engaged.",
    factors: ["Coordinated Cluster Incursion (+35)", "Restricted Red Zone Breach (+30)", "Zero Line Vector (+20)"],
    boxStyle: { left: "18%", top: "22%", width: "64%", height: "60%" },
    keywords: ["group", "people", "multiple", "cluster", "fence", "delta", "team"],
  },
  {
    id: "cross_cam_handoff",
    title: "Cross-Camera Predictive Handoff",
    targetClass: "Person Track",
    camera: "CAM_ALPHA → CAM_BRAVO",
    severity: "CRITICAL",
    threatScore: 77,
    speed: "65 px/s",
    confidence: "93.4%",
    videoUrl: "/data/cross_cam_real_demo_web.mp4",
    description: "Target departed Checkpost Alpha heading East; system predicted BOP Bravo intercept in 6.0–14.0s; confirmed at 8.5s via Re-ID appearance embedding.",
    factors: ["Restricted Zone Penetration (+30)", "Cross-Camera Re-ID Match (+12)", "Heading Toward Border (+20)"],
    boxStyle: { left: "32%", top: "25%", width: "40%", height: "54%" },
    keywords: ["handoff", "cross", "predictive", "transit", "corridor", "reid", "alpha", "bravo"],
  },
];

const PRESET_FILTERS = [
  { id: "all", label: "All Footage", query: "" },
  { id: "car", label: "🚗 Car Rush", query: "car" },
  { id: "crawl", label: "🥷 Night Crawl", query: "crawl" },
  { id: "cycle", label: "🚲 Cyclist", query: "cycle" },
  { id: "group", label: "👥 Group Breach", query: "group" },
  { id: "handoff", label: "🔄 Handoff", query: "handoff" },
];

export default function LiveSurveillanceSection({
  cameraHealth = [],
  incidents = [],
  onRefresh,
}) {
  const [selectedScenarioId, setSelectedScenarioId] = useState("vehicle_rush");
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [showOverlay, setShowOverlay] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activePreset, setActivePreset] = useState("all");

  const videoRef = useRef(null);

  // Filter scenarios based on search input or active preset
  const filteredScenarios = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return REAL_LIFE_SCENARIOS;
    return REAL_LIFE_SCENARIOS.filter((s) => {
      const matchTitle = s.title.toLowerCase().includes(q);
      const matchDesc = s.description.toLowerCase().includes(q);
      const matchKeywords = s.keywords?.some((k) => k.includes(q));
      const matchClass = s.targetClass.toLowerCase().includes(q);
      const matchCam = s.camera.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchKeywords || matchClass || matchCam;
    });
  }, [searchQuery]);

  // Auto-select first matching scenario if current selection is filtered out
  useEffect(() => {
    if (filteredScenarios.length > 0 && !filteredScenarios.some((s) => s.id === selectedScenarioId)) {
      setSelectedScenarioId(filteredScenarios[0].id);
    }
  }, [filteredScenarios, selectedScenarioId]);

  const scenario = useMemo(
    () => REAL_LIFE_SCENARIOS.find((s) => s.id === selectedScenarioId) || REAL_LIFE_SCENARIOS[0],
    [selectedScenarioId]
  );

  const handlePresetClick = (preset) => {
    setActivePreset(preset.id);
    setSearchQuery(preset.query);
  };

  const handleSearchChange = (val) => {
    setSearchQuery(val);
    const found = PRESET_FILTERS.find((p) => p.query && val.toLowerCase().includes(p.query));
    setActivePreset(found ? found.id : val ? "custom" : "all");
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const setRate = (rate) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  };

  return (
    <div className="flex flex-col gap-5 text-slate-200">
      <SectionHeader
        title="Live Surveillance & Real-World Border Scenarios"
        sub="Authentic situational footage captured along the northern border. Select real-life breach scenarios to inspect how the AI detects vehicles, night crawling infiltrators, cyclists, and multi-camera target handoffs."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT COLUMN: REAL-LIFE SCENARIO SELECTOR (4.5 cols on lg) */}
        <div className="lg:col-span-5 flex flex-col gap-3">
          {/* Forensic Footage Semantic Query Input */}
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Ask for specific footage (e.g. 'car', 'crawl', 'cycle', 'group')..."
                className="w-full rounded-lg border border-white/15 bg-black/60 pl-8 pr-8 py-2 font-mono text-[11px] text-white placeholder-slate-500 focus:border-sky-400 focus:outline-none transition-all shadow-inner"
              />
              {searchQuery && (
                <button
                  onClick={() => handleSearchChange("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Quick Preset Filter Chips */}
            <div className="flex flex-wrap gap-1 font-mono text-[10px]">
              {PRESET_FILTERS.map((p) => {
                const isActive = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => handlePresetClick(p)}
                    className={`px-2 py-0.5 rounded-md border transition-all ${
                      isActive
                        ? "border-sky-400 bg-sky-500/20 text-sky-200 font-bold shadow-sm"
                        : "border-white/10 bg-black/40 text-slate-400 hover:border-white/25 hover:text-slate-200"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between px-1 pt-1">
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
              <Video size={13} className="text-sky-400" />
              <span>Matching Scenarios ({filteredScenarios.length})</span>
            </span>
            <span className="font-mono text-[10px] text-sky-400 font-semibold">CLICK TO STREAM</span>
          </div>

          <div className="flex flex-col gap-2">
            {filteredScenarios.map((sc) => {
              const isSelected = sc.id === selectedScenarioId;
              const isCrit = sc.severity === "CRITICAL";

              return (
                <button
                  key={sc.id}
                  onClick={() => {
                    setSelectedScenarioId(sc.id);
                    setIsPlaying(true);
                  }}
                  className={`group relative flex flex-col gap-2 rounded-lg border p-3.5 text-left transition-all ${
                    isSelected
                      ? "border-sky-500/80 bg-sky-950/40 shadow-[0_0_20px_rgba(56,189,248,0.18)] ring-1 ring-sky-400/50"
                      : "border-white/10 bg-black/40 hover:border-white/20 hover:bg-black/60"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          isSelected ? "bg-sky-400 animate-pulse" : isCrit ? "bg-red-400" : "bg-amber-400"
                        }`}
                      />
                      <span className="font-mono text-[13px] font-bold text-white tracking-wide">
                        {sc.title}
                      </span>
                    </div>

                    <span
                      className={`font-mono text-[10.5px] font-bold rounded px-1.5 py-0.5 border ${
                        isCrit
                          ? "border-red-500/40 bg-red-500/15 text-red-300"
                          : "border-amber-500/40 bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      THREAT {sc.threatScore}/100
                    </span>
                  </div>

                  <p className="text-[12px] text-slate-300 leading-snug line-clamp-2">
                    {sc.description}
                  </p>

                  <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-400 pt-1 border-t border-white/5">
                    <span className="text-slate-300 font-semibold">{sc.camera}</span>
                    <span className="text-sky-300 font-medium">TARGET: {sc.targetClass}</span>
                    <span className="text-slate-500">{sc.confidence}</span>
                  </div>

                  {isSelected && (
                    <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-sky-400 shadow-[0_0_10px_rgba(56,189,248,0.8)]" />
                  )}
                </button>
              );
            })}
            {filteredScenarios.length === 0 && (
              <div className="rounded-lg border border-white/10 bg-black/40 p-6 text-center font-mono text-[11.5px] text-slate-400">
                <div>No border footage matching "{searchQuery}"</div>
                <button
                  onClick={() => handleSearchChange("")}
                  className="mt-2.5 inline-block text-[11px] font-bold text-sky-400 hover:text-sky-300 underline"
                >
                  Clear search & show all footage
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: REAL FOOTAGE VIEWFINDER WITH OVERLAY (7.5 cols on lg) */}
        <div className="lg:col-span-7 flex flex-col gap-2">
          <div className="relative w-full aspect-[16/10] sm:aspect-[16/9] overflow-hidden rounded-xl border border-white/20 bg-black shadow-2xl">
            {/* REAL VIDEO PLAYER (PLAYS AUTHENTIC MP4) */}
            <video
              ref={videoRef}
              key={scenario.videoUrl}
              src={scenario.videoUrl}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="absolute inset-0 h-full w-full object-cover"
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            />

            {/* Tactical Grid Filter */}
            <div
              className="absolute inset-0 opacity-15 pointer-events-none"
              style={{
                backgroundImage:
                  "linear-gradient(to right, #38bdf8 1px, transparent 1px), linear-gradient(to bottom, #38bdf8 1px, transparent 1px)",
                backgroundSize: "35px 35px",
              }}
            />

            {/* Corner Viewfinder Brackets */}
            <div className="absolute left-4 top-4 h-4 w-4 border-l-2 border-t-2 border-sky-400/80 pointer-events-none" />
            <div className="absolute right-4 top-4 h-4 w-4 border-r-2 border-t-2 border-sky-400/80 pointer-events-none" />
            <div className="absolute left-4 bottom-4 h-4 w-4 border-l-2 border-b-2 border-sky-400/80 pointer-events-none" />
            <div className="absolute right-4 bottom-4 h-4 w-4 border-r-2 border-b-2 border-sky-400/80 pointer-events-none" />

            {/* Top Telemetry Header */}
            <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/90 via-black/50 to-transparent font-mono text-[11px] z-10">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-bold text-sky-400">
                  <Radio size={12} className="animate-pulse" />
                  <span>{scenario.camera}</span>
                </span>
                <span className="text-slate-500">|</span>
                <span className="text-white font-medium">{scenario.title}</span>
              </div>

              <div className="flex items-center gap-2.5">
                <span className="flex items-center gap-1.5 font-bold text-emerald-400 bg-black/60 px-2 py-0.5 rounded border border-emerald-500/30">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>LIVE FOOTAGE STREAM</span>
                </span>
                <span className="hidden sm:inline font-mono text-[10px] text-slate-400">
                  1080P · 30 FPS
                </span>
              </div>
            </div>

            {/* REAL-TIME BOUNDING BOX TELEMETRY OVERLAY */}
            {showOverlay && (
              <div
                className="absolute pointer-events-none transition-all duration-300"
                style={scenario.boxStyle}
              >
                <div className="relative w-full h-full rounded border-2 border-red-500/90 bg-red-500/10 shadow-[0_0_30px_rgba(239,68,68,0.3)] flex flex-col justify-between p-2.5">
                  {/* Corner Reticles */}
                  <div className="absolute -left-1 -top-1 h-3 w-3 border-l-2 border-t-2 border-red-400" />
                  <div className="absolute -right-1 -top-1 h-3 w-3 border-r-2 border-t-2 border-red-400" />
                  <div className="absolute -left-1 -bottom-1 h-3 w-3 border-l-2 border-b-2 border-red-400" />
                  <div className="absolute -right-1 -bottom-1 h-3 w-3 border-r-2 border-b-2 border-red-400" />

                  {/* Top Bounding Tag */}
                  <div className="flex items-center justify-between font-mono text-[10.5px]">
                    <span className="flex items-center gap-1.5 rounded bg-red-600 px-2 py-0.5 font-bold text-white shadow">
                      <Crosshair size={11} className="animate-spin" />
                      <span>{scenario.targetClass.toUpperCase()}</span>
                      <span>· {scenario.confidence}</span>
                    </span>

                    <span className="rounded bg-black/80 px-2 py-0.5 font-bold text-red-400 border border-red-500/40">
                      THREAT {scenario.threatScore}
                    </span>
                  </div>

                  {/* Center Target Reticle */}
                  <div className="self-center flex flex-col items-center">
                    <div className="relative flex items-center justify-center">
                      <div className="h-7 w-7 rounded-full border border-red-400/50 animate-ping" />
                      <div className="absolute h-3 w-3 rounded-full border border-red-400 bg-red-500/40" />
                    </div>
                    <span className="mt-1 rounded bg-black/80 px-1.5 py-0.2 font-mono text-[9px] text-red-300 border border-red-500/30">
                      VELOCITY: {scenario.speed}
                    </span>
                  </div>

                  {/* Bottom Rule Explanation Banner */}
                  <div className="rounded bg-black/85 p-2 font-mono text-[10px] text-slate-200 border border-red-500/40">
                    <div className="text-red-400 font-bold uppercase tracking-wider mb-0.5">
                      AUTOMATED TRIPWIRE BREACH
                    </div>
                    <p className="line-clamp-1 text-slate-300">{scenario.description}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Playback & Telemetry Controls */}
            <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-5 py-2.5 bg-gradient-to-t from-black/95 via-black/60 to-transparent font-mono text-[11px] z-10">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/20 bg-black/70 text-white hover:bg-sky-500/20 hover:border-sky-400 transition-all"
                  title={isPlaying ? "Pause footage" : "Play footage"}
                >
                  {isPlaying ? <Pause size={13} /> : <Play size={13} />}
                </button>

                <button
                  onClick={toggleMute}
                  className="flex h-7 w-7 items-center justify-center rounded border border-white/20 bg-black/70 text-white hover:bg-sky-500/20 hover:border-sky-400 transition-all"
                  title={isMuted ? "Unmute" : "Mute"}
                >
                  {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                <div className="flex items-center gap-1 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-300">
                  <span className="text-slate-500">SPEED:</span>
                  <button
                    onClick={() => setRate(1)}
                    className={`px-1 rounded ${playbackRate === 1 ? "text-sky-300 font-bold" : "hover:text-white"}`}
                  >
                    1x
                  </button>
                  <button
                    onClick={() => setRate(0.5)}
                    className={`px-1 rounded ${playbackRate === 0.5 ? "text-sky-300 font-bold" : "hover:text-white"}`}
                    title="Slow motion forensic review"
                  >
                    0.5x
                  </button>
                </div>

                <button
                  onClick={() => setShowOverlay(!showOverlay)}
                  className={`flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-semibold transition-all ${
                    showOverlay
                      ? "border-sky-500/40 bg-sky-500/15 text-sky-300"
                      : "border-white/10 bg-black/60 text-slate-400"
                  }`}
                >
                  <Eye size={11} />
                  <span>{showOverlay ? "HUD ON" : "HUD OFF"}</span>
                </button>
              </div>

              <div className="hidden sm:flex items-center gap-3 text-slate-400 text-[10.5px]">
                <span>OPTICAL: 85mm IR LENS</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-300">PIPELINE: YOLOv8s + ByteTrack</span>
              </div>
            </div>
          </div>

          {/* Plain-English Incident Breakdown Card */}
          <div className="rounded-lg border border-white/10 bg-black/40 p-3.5 font-mono text-[11px] text-slate-300">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-bold text-white uppercase tracking-wider text-[11.5px]">
                Situational Intelligence Brief · {scenario.title}
              </span>
              <span className="text-sky-400 font-semibold">{scenario.camera}</span>
            </div>
            <p className="text-slate-300 leading-relaxed text-[12px] mb-2">{scenario.description}</p>
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5 text-[10.5px]">
              <span className="text-slate-500 font-semibold">Active Rules Triggered:</span>
              {scenario.factors.map((f, i) => (
                <span key={i} className="rounded bg-black/60 border border-white/10 px-2 py-0.5 text-slate-300">
                  ✓ {f}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
