import { useState, useEffect, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import siren from "../lib/audioSiren.js";
import {
  Shield,
  Video,
  Cpu,
  Lock,
  ArrowRight,
  ChevronDown,
  Layers,
  Activity,
  Check,
  CheckCircle2,
  Crosshair,
  GitBranch,
  Database,
  BarChart3,
  Sliders,
  Play,
  Eye,
  Camera,
  Radio,
  Sparkles,
  ExternalLink,
  Zap,
  Clock,
  Compass,
  FileCheck,
  Server,
  Volume2,
  VolumeX,
} from "lucide-react";

export default function LandingPage() {
  const navigate = useNavigate();
  const [activePlatformTab, setActivePlatformTab] = useState("monitor");
  const [audioMuted, setAudioMuted] = useState(false);
  const [timeState, setTimeState] = useState({ time: "23:12:17 IST", date: "5 Sep 2026" });

  // Interactive Threat Score Simulator state
  const [factorBreach, setFactorBreach] = useState(true);
  const [factorHeading, setFactorHeading] = useState(true);
  const [factorReid, setFactorReid] = useState(true);
  const [factorCurfew, setFactorCurfew] = useState(false);

  const calculatedThreat = useMemo(() => {
    let score = 15; // Base ambient score
    if (factorBreach) score += 30;
    if (factorHeading) score += 20;
    if (factorReid) score += 12;
    if (factorCurfew) score += 10;
    return score;
  }, [factorBreach, factorHeading, factorReid, factorCurfew]);

  const threatSeverity = useMemo(() => {
    if (calculatedThreat >= 75) return { label: "CRITICAL", color: "text-red-400", badge: "bg-red-500/20 border-red-500/50 text-red-300" };
    if (calculatedThreat >= 50) return { label: "HIGH", color: "text-amber-400", badge: "bg-amber-500/20 border-amber-500/50 text-amber-300" };
    if (calculatedThreat >= 30) return { label: "MEDIUM", color: "text-teal-400", badge: "bg-teal-500/20 border-teal-500/50 text-teal-300" };
    return { label: "LOW", color: "text-emerald-400", badge: "bg-emerald-500/20 border-emerald-500/50 text-emerald-300" };
  }, [calculatedThreat]);

  const playClick = useCallback(() => {
    if (!audioMuted) siren.playClick();
  }, [audioMuted]);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const time = now.toLocaleTimeString("en-IN", { hour12: false }) + " IST";
      const date = now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
      setTimeState({ time, date });
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen w-full bg-[#050811] text-slate-100 antialiased selection:bg-cyan-500/30 selection:text-cyan-200 overflow-x-hidden font-sans">
      {/* ── TOP TACTICAL NAVIGATION BAR ───────────────────────── */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-center py-3.5 px-4 sm:px-8 pointer-events-none">
        <div className="max-w-7xl w-full h-16 rounded-2xl bg-[#0a101d]/90 border border-cyan-500/25 backdrop-blur-xl px-6 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.8)] pointer-events-auto">
          {/* Brand & Defense Emblem */}
          <Link to="/" onClick={playClick} className="flex items-center gap-3 group">
            <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shadow-[0_0_20px_rgba(6,182,212,0.3)] group-hover:scale-105 transition-transform">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-wider text-white">IBVAP SENTINEL</span>
                <span className="text-xs" title="SSB / Ministry of Home Affairs">🇮🇳</span>
              </div>
              <div className="text-[9px] font-bold uppercase tracking-widest text-cyan-400 font-mono">
                BORDER DEFENSE VISION AI
              </div>
            </div>
          </Link>

          {/* Nav Links */}
          <div className="hidden md:flex items-center gap-1 text-xs font-semibold tracking-wider text-slate-300">
            <a href="#platform" onClick={playClick} className="px-3.5 py-2 rounded-lg hover:text-cyan-300 hover:bg-cyan-950/30 transition-colors">
              CAPABILITIES
            </a>
            <a href="#calculator" onClick={playClick} className="px-3.5 py-2 rounded-lg hover:text-cyan-300 hover:bg-cyan-950/30 transition-colors">
              THREAT ENGINE
            </a>
            <a href="#pipeline" onClick={playClick} className="px-3.5 py-2 rounded-lg hover:text-cyan-300 hover:bg-cyan-950/30 transition-colors">
              HOW IT OPERATES
            </a>
            <a href="#specs" onClick={playClick} className="px-3.5 py-2 rounded-lg hover:text-cyan-300 hover:bg-cyan-950/30 transition-colors">
              BENCHMARKS
            </a>
            <Link to="/console?tab=reconstruction" onClick={playClick} className="px-3.5 py-2 rounded-lg text-amber-400/90 hover:text-amber-300 hover:bg-amber-950/30 transition-colors flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              <span>LIVE SCENARIO LAB</span>
            </Link>
          </div>

          {/* Launch Console CTA */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAudioMuted(!audioMuted)}
              title={audioMuted ? "Unmute Tactical Audio" : "Mute Tactical Audio"}
              className="p-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              {audioMuted ? <VolumeX size={15} /> : <Volume2 size={15} className="text-cyan-400" />}
            </button>
            <Link
              to="/console"
              onClick={playClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold text-xs uppercase tracking-wider transition-all duration-300 shadow-[0_0_25px_rgba(6,182,212,0.45)] hover:scale-105 active:scale-95 border border-cyan-400/30"
            >
              <span>Launch Console</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO SECTION: TACTICAL DEFENSE HUD & SONAR VIBE ──── */}
      <section className="relative pt-36 pb-20 px-6 sm:px-12 flex flex-col items-center text-center overflow-hidden">
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[1100px] h-[600px] bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.18)_0%,rgba(16,185,129,0.06)_45%,transparent_75%)] pointer-events-none -z-10" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0c192c_1px,transparent_1px),linear-gradient(to_bottom,#0c192c_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-40 pointer-events-none -z-10" />

        <div className="inline-flex items-center gap-2.5 p-1 px-4 rounded-full bg-slate-900/90 border border-cyan-500/35 text-[11px] font-mono text-cyan-300 mb-8 backdrop-blur-md shadow-[0_0_20px_rgba(6,182,212,0.15)]">
          <span className="flex items-center gap-1.5 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            BORDER INTELLIGENCE SYSTEM
          </span>
          <span className="text-slate-600">•</span>
          <span className="text-slate-300 font-medium">100% On-Premise Air-Gapped Edge</span>
        </div>

        <h1 className="max-w-4xl text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
          Zero Blindspots.<br className="hidden sm:block" />{" "}
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
            One Unified Border Command.
          </span>
        </h1>

        <p className="max-w-2xl text-base sm:text-lg text-slate-300 leading-relaxed font-normal mb-10">
          Autonomous multi-camera correlation for national borders. Predicts subject transit across unmonitored blind gaps, calculates objective 0–100 threat scores, and seals court-admissible evidence under Section 65B of the Indian Evidence Act.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 mb-14">
          <Link
            to="/console"
            onClick={playClick}
            className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 hover:from-cyan-400 hover:to-teal-500 text-white font-extrabold text-sm uppercase tracking-wider transition-all duration-300 shadow-[0_0_35px_rgba(6,182,212,0.5)] hover:scale-105 active:scale-95 flex items-center gap-2.5 border border-cyan-400/40"
          >
            <span>Open Command Console</span>
            <ArrowRight size={16} />
          </Link>
          <a
            href="#calculator"
            onClick={playClick}
            className="px-6 py-3.5 rounded-xl bg-[#0a1220]/90 hover:bg-[#0f1b2e] text-slate-200 border border-slate-700/80 font-semibold text-sm transition-all shadow-md"
          >
            Test Threat Calculator ↓
          </a>
        </div>

        {/* ── HIGH-TECH DEFENSE DASHBOARD PREVIEW ─────────────── */}
        <div className="relative max-w-5xl w-full mx-auto px-4">
          <div className="relative rounded-2xl bg-[#09101d] border border-cyan-500/30 shadow-[0_20px_70px_rgba(6,182,212,0.18)] overflow-hidden">
            <div className="h-10 px-4 border-b border-slate-800/90 bg-[#070c16] flex items-center justify-between text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                <span className="ml-2 text-slate-200 font-bold">IBVAP SENTINEL // TACTICAL COMMAND DASHBOARD</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                  SECTOR 4-B LIVE
                </span>
                <span className="text-slate-500 font-mono">{timeState.time}</span>
              </div>
            </div>

            <div className="p-4 bg-[#050912] grid grid-cols-1 md:grid-cols-12 gap-3.5 text-left">
              <div className="md:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-slate-300 pb-1">
                  <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <Video size={13} />
                    6 CAMERAS ONLINE [REC]
                  </span>
                  <span className="text-cyan-400">YOLOv8 + ByteTrack [Active]</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="aspect-video rounded-lg bg-black/80 border border-slate-800 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-slate-400">CAM_ALPHA</span>
                    <span className="text-[8.5px] font-mono text-emerald-400">● 18:42 Ingress</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-red-950/30 border border-red-500/60 p-1.5 flex flex-col justify-between relative shadow-[0_0_12px_rgba(239,68,68,0.3)]">
                    <div className="flex justify-between items-center text-[9px] font-mono text-red-300">
                      <span>CAM_BRAVO</span>
                      <span className="px-1 rounded bg-red-500/30 text-[8px]">BREACH</span>
                    </div>
                    <div className="text-center font-mono text-[9px] text-red-200 font-bold bg-black/60 rounded py-0.5">
                      Person [0.94]
                    </div>
                    <span className="text-[8.5px] font-mono text-red-400">● Active Target</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-black/80 border border-slate-800 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-slate-400">CAM_CHARLIE</span>
                    <span className="text-[8.5px] font-mono text-sky-400">● Predicted (18:42:24)</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-black/80 border border-slate-800 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-slate-400">CAM_DELTA</span>
                    <span className="text-[8.5px] font-mono text-slate-400">● Perimeter Clear</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-black/80 border border-slate-800 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-slate-400">CAM_ECHO</span>
                    <span className="text-[8.5px] font-mono text-slate-400">● Patrol Road</span>
                  </div>
                  <div className="aspect-video rounded-lg bg-black/80 border border-slate-800 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-slate-400">CAM_FOXTROT</span>
                    <span className="text-[8.5px] font-mono text-slate-400">● Normal [12 FPS]</span>
                  </div>
                </div>

                <div className="p-2 rounded-lg bg-[#0a1220] border border-slate-800/80 flex items-center justify-between text-[10.5px] font-mono text-slate-300">
                  <span>ACTIVE TRACK: <strong className="text-cyan-400">#P17</strong></span>
                  <span>SPEED: <strong className="text-emerald-400">5.2 km/h NE</strong></span>
                  <span>CONFIDENCE: <strong className="text-teal-400">91.4% (OSNet)</strong></span>
                </div>
              </div>

              <div className="md:col-span-5 rounded-xl bg-[#0b1424] border border-red-500/40 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                    CRITICAL ALERT · INC-0042
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[9.5px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                    SCORE 87 / 100
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="text-slate-200 font-semibold">Person Detected Near Restricted Zone</div>
                  <div className="text-[10px] text-slate-400 font-mono">CAM_BRAVO · Lat 32.5621, Long 75.1234</div>
                </div>

                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-slate-400">OBJECTIVE THREAT FACTORS:</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <span className="p-1 rounded bg-red-950/40 border border-red-500/30 text-red-300">+30 Zone Breach</span>
                    <span className="p-1 rounded bg-red-950/40 border border-red-500/30 text-red-300">+20 Toward Zero Line</span>
                    <span className="p-1 rounded bg-red-950/40 border border-red-500/30 text-red-300">+12 Re-ID Correlation</span>
                    <span className="p-1 rounded bg-red-950/40 border border-red-500/30 text-red-300">+10 Curfew Window</span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-slate-400">SHA-256 SEALED IN BLOCK #4</span>
                  <Link to="/console" onClick={playClick} className="px-3 py-1 rounded-md bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-[11px] transition-colors">
                    Investigate →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE THREAT SCORE CALCULATOR ─────────────────── */}
      <section id="calculator" className="py-20 px-6 sm:px-12 bg-[#060b17] border-t border-slate-800/80">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/50 border border-cyan-500/40 text-cyan-300 text-xs font-mono">
              <Zap size={13} />
              <span>Interactive Threat Quantification Engine</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Deterministic 0–100 Additive Formula</h2>
            <p className="text-slate-300 text-sm max-w-xl mx-auto">
              Test how Sentinel eliminates operator fatigue by turning complex multi-sensor observations into an explainable, objective score.
            </p>
          </div>

          <div className="p-6 sm:p-8 rounded-3xl bg-[#0a1220] border border-cyan-500/40 shadow-2xl grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-7 space-y-3">
              <div className="text-xs font-mono text-slate-400 uppercase font-bold">Toggle Verified Sensor Triggers:</div>
              <div className="space-y-2">
                {[
                  { label: "100m Restricted Geofence Breach", pts: "+30 pts", checked: factorBreach, toggle: () => { playClick(); setFactorBreach(!factorBreach); } },
                  { label: "Velocity Vector Heading Toward Zero Line", pts: "+20 pts", checked: factorHeading, toggle: () => { playClick(); setFactorHeading(!factorHeading); } },
                  { label: "Cross-Camera Re-ID Identity Confirmed", pts: "+12 pts", checked: factorReid, toggle: () => { playClick(); setFactorReid(!factorReid); } },
                  { label: "Detected in Night Curfew Window (22:00-05:00)", pts: "+10 pts", checked: factorCurfew, toggle: () => { playClick(); setFactorCurfew(!factorCurfew); } },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.toggle}
                    className={`w-full p-3 rounded-xl border text-left flex items-center justify-between text-xs transition-all ${
                      item.checked
                        ? "bg-cyan-950/40 border-cyan-500/60 text-white shadow-[0_0_15px_rgba(6,182,212,0.15)]"
                        : "bg-[#070d17] border-slate-800 text-slate-400 hover:border-slate-700"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`h-4 w-4 rounded flex items-center justify-center border ${item.checked ? "bg-cyan-500 border-cyan-400 text-black" : "border-slate-700"}`}>
                        {item.checked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span className={item.checked ? "font-semibold text-white" : ""}>{item.label}</span>
                    </div>
                    <span className={`font-mono font-bold ${item.checked ? "text-cyan-400" : "text-slate-600"}`}>{item.pts}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-5 rounded-2xl bg-[#070d17] border border-slate-800 p-6 flex flex-col items-center justify-center text-center space-y-3">
              <span className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold border ${threatSeverity.badge}`}>
                {threatSeverity.label} PRIORITY
              </span>
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path className="text-slate-800" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path className="text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.8)]" strokeDasharray={`${calculatedThreat}, 100`} strokeWidth="3.2" strokeLinecap="round" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-extrabold font-mono text-white leading-none">{calculatedThreat}</span>
                  <span className="text-[9px] font-mono text-slate-400">/ 100</span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-slate-300">
                {calculatedThreat >= 75 ? "Automated siren triggers. QRT alerted." : calculatedThreat >= 50 ? "Operator verification cued." : "Passive continuous logging."}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── THE PLATFORM CAPABILITIES ──────────────────────────── */}
      <section id="platform" className="py-20 px-6 sm:px-12 bg-[#070c17] border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase mb-2">Tactical Surveillance Engine</div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">Engineered for Indian Borders</h2>
            <p className="text-slate-300 text-base leading-relaxed">
              Designed to solve the hardest problems facing border security forces: unmonitored blind corridors, high false alarm rates, and unverified video evidence.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
            {[
              { id: "monitor", label: "01 · Multi-Camera Sensor Grid", icon: Video },
              { id: "handoff", label: "02 · Spatial Re-ID & Handoff", icon: GitBranch },
              { id: "threat", label: "03 · Additive Threat Scoring", icon: BarChart3 },
              { id: "ledger", label: "04 · Section 65B Evidence Vault", icon: Lock },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activePlatformTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => { playClick(); setActivePlatformTab(tab.id); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/50 shadow-[0_0_20px_rgba(6,182,212,0.25)] scale-105"
                      : "bg-[#0b1322] text-slate-400 border border-slate-800 hover:text-white hover:border-slate-700"
                  }`}
                >
                  <Icon size={15} className={isActive ? "text-cyan-400" : "text-slate-400"} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl bg-[#0a1220] border border-cyan-500/30 p-8 shadow-xl">
            {activePlatformTab === "monitor" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/40 text-cyan-300 font-mono text-xs mb-4 border border-cyan-500/30">
                    <Video size={13} />
                    Continuous Multi-RTSP Edge Inference
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Live Multi-Feed Grid with Zero Cloud Latency</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Streams and analyzes 6+ RTSP/MJPEG feeds simultaneously on-premise. YOLOv8n TensorRT models process frames locally under 18ms per frame, identifying persons, vehicles, and wildlife without routing raw video over satellite or internet.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-slate-300">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Sub-18ms detection latency on NVIDIA Jetson Orin</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Automated optical PTZ cueing on detected perimeter breaches</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Acoustic alert trigger with operator silence controls</span></div>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-black aspect-video relative">
                  <video src="/data/people_surveillance_web.mp4" autoPlay loop muted playsInline className="h-full w-full object-cover grayscale contrast-125" />
                  <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/70 text-cyan-300 text-xs font-mono border border-cyan-500/40">
                    CAM_BRAVO · SECTOR 4-B
                  </div>
                </div>
              </div>
            )}

            {activePlatformTab === "handoff" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/40 text-cyan-300 font-mono text-xs mb-4 border border-cyan-500/30">
                    <GitBranch size={13} />
                    Predictive Topology & Deep Appearance Re-ID
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Seamless Target Tracking Across Camera Blindspots</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Borders span kilometers where cameras cannot overlap. Sentinel models camera field-of-view topology, calculates target velocity vectors, and cues downstream cameras before the subject emerges.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-slate-300">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>91.4% Re-ID match via OSNet 512-dim cosine embeddings</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Calculates expected time-of-arrival window on adjacent cameras</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Maintains persistent Track ID across disjoint camera networks</span></div>
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden border border-slate-800 bg-[#060a12] p-4 flex flex-col justify-center gap-3">
                  <div className="text-xs font-mono text-cyan-400">TOPOLOGICAL TRANSIT CORRIDOR:</div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-black/60 border border-slate-800">
                    <div className="text-left">
                      <div className="text-xs font-bold text-white font-mono">CAM_ALPHA</div>
                      <div className="text-[10px] text-slate-400 font-mono">18:42:11 · Ingress</div>
                    </div>
                    <div className="h-[2px] flex-1 mx-4 bg-gradient-to-r from-cyan-500 to-emerald-500 relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-mono text-slate-400">13s BLIND GAP</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-emerald-400 font-mono">CAM_BRAVO</div>
                      <div className="text-[10px] text-slate-400 font-mono">18:42:24 · Re-ID 91%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activePlatformTab === "threat" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/40 text-cyan-300 font-mono text-xs mb-4 border border-cyan-500/30">
                    <BarChart3 size={13} />
                    Transparent Additive Math (0–100)
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Explainable Threat Engine Without Black Boxes</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Military commanders cannot act on opaque AI guesses. Every threat score (0–100) is deterministically computed from 4 weighted factors with plain-language rationale.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-slate-300">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Zero hallucination: every point backed by verified pixel telemetry</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>38% reduction in operator fatigue via site-specific calibration</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Instant threshold escalation for rapid response team dispatch</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#060a12] p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-mono font-bold text-white">SCORE BREAKDOWN · #P17</span>
                    <span className="text-xl font-mono font-extrabold text-red-400">87 / 100</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between p-2 rounded bg-red-950/30 border border-red-500/30 text-red-200"><span>Restricted Zone Breach</span><strong>+30 PTS</strong></div>
                    <div className="flex justify-between p-2 rounded bg-red-950/30 border border-red-500/30 text-red-200"><span>Heading Toward Zero Line</span><strong>+20 PTS</strong></div>
                    <div className="flex justify-between p-2 rounded bg-red-950/30 border border-red-500/30 text-red-200"><span>Cross-Camera Re-ID Match</span><strong>+12 PTS</strong></div>
                    <div className="flex justify-between p-2 rounded bg-red-950/30 border border-red-500/30 text-red-200"><span>Night Window (Curfew Active)</span><strong>+10 PTS</strong></div>
                  </div>
                </div>
              </div>
            )}

            {activePlatformTab === "ledger" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-cyan-950/40 text-cyan-300 font-mono text-xs mb-4 border border-cyan-500/30">
                    <Lock size={13} />
                    Section 65B Indian Evidence Act Compliant
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-3">Tamper-Evident SHA-256 Judicial Evidence Vault</h3>
                  <p className="text-slate-300 text-sm leading-relaxed mb-6">
                    Video evidence frequently fails scrutiny in court due to broken custody chains. Sentinel seals every snapshot, detection coordinate, and operator log into immutable SHA-256 blockchain blocks at the point of capture.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-slate-300">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Cryptographic hash generation at hardware edge ingestion</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>Generates automated court-ready Section 65B certificates</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-emerald-400 shrink-0" /><span>One-click tamper detection across chronological blocks</span></div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-[#060a12] p-5 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-emerald-400 border-b border-slate-800 pb-2">
                    <span className="flex items-center gap-1.5 font-bold"><CheckCircle2 size={14} />LEDGER INTEGRITY: VERIFIED</span>
                    <span className="text-slate-500">5 BLOCKS SEALED</span>
                  </div>
                  <div className="p-3 rounded-lg bg-black/60 border border-slate-800/80 space-y-1 text-[11px] text-slate-300">
                    <div>BLOCK #4 · INC-0042 [CRITICAL]</div>
                    <div className="text-cyan-400 truncate">HASH: a4f89d3167eb2156828c40ff11e8bc297394bb04</div>
                    <div className="text-slate-500 truncate">PREV: sentinel::block_03_seal</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── 4-STEP OPERATIONAL PIPELINE ───────────────────────── */}
      <section id="pipeline" className="py-20 px-6 sm:px-12 bg-[#050811]">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-xs font-mono font-bold tracking-widest text-cyan-400 uppercase mb-2">Operational Pipeline</div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight mb-4">How Sentinel Operates</h2>
            <p className="text-slate-300 text-base">From raw sensor ingestion to cryptographically sealed judicial dossiers.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-[#09101d] border border-slate-800 flex flex-col justify-between hover:border-cyan-500/40 transition-colors">
              <div>
                <div className="text-3xl font-extrabold text-cyan-400/30 font-mono mb-4">01</div>
                <h4 className="text-base font-bold text-white mb-2">Edge Ingestion</h4>
                <p className="text-xs text-slate-400 leading-relaxed">Runs lightweight YOLOv8 on NVIDIA Jetson / on-prem edge with zero internet dependency.</p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] font-mono text-cyan-400">Local TensorRT</div>
            </div>

            <div className="p-6 rounded-2xl bg-[#09101d] border border-slate-800 flex flex-col justify-between hover:border-cyan-500/40 transition-colors">
              <div>
                <div className="text-3xl font-extrabold text-teal-400/30 font-mono mb-4">02</div>
                <h4 className="text-base font-bold text-white mb-2">Cross-Camera Handoff</h4>
                <p className="text-xs text-slate-400 leading-relaxed">Predictive camera topology routes target vectors across blind gaps to cue neighboring sensors.</p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] font-mono text-teal-400">Topology Aware</div>
            </div>

            <div className="p-6 rounded-2xl bg-[#09101d] border border-slate-800 flex flex-col justify-between hover:border-cyan-500/40 transition-colors">
              <div>
                <div className="text-3xl font-extrabold text-amber-400/30 font-mono mb-4">03</div>
                <h4 className="text-base font-bold text-white mb-2">Explainable Threat</h4>
                <p className="text-xs text-slate-400 leading-relaxed">Scores 0-100 derived transparently from zone breach, loitering, speed, and curfew weights.</p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] font-mono text-amber-400">Zero Black Box</div>
            </div>

            <div className="p-6 rounded-2xl bg-[#09101d] border border-slate-800 flex flex-col justify-between hover:border-cyan-500/40 transition-colors">
              <div>
                <div className="text-3xl font-extrabold text-emerald-400/30 font-mono mb-4">04</div>
                <h4 className="text-base font-bold text-white mb-2">Judicial Evidence</h4>
                <p className="text-xs text-slate-400 leading-relaxed">Every bounding box, snapshot, and event sealed into tamper-evident SHA-256 blockchain blocks.</p>
              </div>
              <div className="mt-6 pt-3 border-t border-slate-800/80 text-[11px] font-mono text-emerald-400">Section 65B Certified</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUANTIFIED FIELD BENCHMARKS ───────────────────────── */}
      <section id="specs" className="py-20 px-6 sm:px-12 bg-[#070c16] border-t border-slate-800/80">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="p-6 rounded-2xl bg-[#0a1220] border border-slate-800">
              <div className="text-3xl sm:text-4xl font-extrabold text-cyan-400 font-mono mb-1">&lt; 18ms</div>
              <div className="text-xs text-slate-400 font-mono uppercase">Inference Latency</div>
              <div className="text-[10px] text-slate-500 mt-1">YOLOv8n TensorRT FP16</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0a1220] border border-slate-800">
              <div className="text-3xl sm:text-4xl font-extrabold text-teal-400 font-mono mb-1">91.4%</div>
              <div className="text-xs text-slate-400 font-mono uppercase">Re-ID Match Rate</div>
              <div className="text-[10px] text-slate-500 mt-1">OSNet Appearance Feature Vector</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0a1220] border border-slate-800">
              <div className="text-3xl sm:text-4xl font-extrabold text-amber-400 font-mono mb-1">38%</div>
              <div className="text-xs text-slate-400 font-mono uppercase">False Alarm Cut</div>
              <div className="text-[10px] text-slate-500 mt-1">Site-Specific Calibration Engine</div>
            </div>
            <div className="p-6 rounded-2xl bg-[#0a1220] border border-slate-800">
              <div className="text-3xl sm:text-4xl font-extrabold text-emerald-400 font-mono mb-1">100%</div>
              <div className="text-xs text-slate-400 font-mono uppercase">Air-Gapped Sovereign</div>
              <div className="text-[10px] text-slate-500 mt-1">Zero Cloud Ingress or Dependencies</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800/80 bg-[#04060d] py-12 px-6 sm:px-12 text-slate-500 font-mono text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-400">
              <Shield size={14} />
            </div>
            <span className="font-bold text-slate-200">IBVAP SENTINEL</span>
            <span>·</span>
            <span>MINISTRY OF HOME AFFAIRS · SSB</span>
          </div>

          <div className="flex items-center gap-6">
            <span>SIH26187</span>
            <span>·</span>
            <Link to="/console" onClick={playClick} className="text-cyan-400 hover:text-cyan-300 font-bold uppercase transition-colors">
              Launch Console →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
