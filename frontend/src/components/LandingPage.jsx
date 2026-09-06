import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import siren from "../lib/audioSiren.js";
import { Reveal, CountUp } from "../lib/motion.jsx";
import {
  Shield,
  Video,
  Lock,
  ArrowRight,
  Check,
  CheckCircle2,
  GitBranch,
  BarChart3,
  Zap,
  Volume2,
  VolumeX,
} from "lucide-react";

export default function LandingPage() {
  const [activePlatformTab, setActivePlatformTab] = useState("monitor");
  const [audioMuted, setAudioMuted] = useState(false);
  const [timeState, setTimeState] = useState({ time: "23:12:17 IST", date: "5 Sep 2026" });

  const [factorBreach, setFactorBreach] = useState(true);
  const [factorHeading, setFactorHeading] = useState(true);
  const [factorReid, setFactorReid] = useState(true);
  const [factorCurfew, setFactorCurfew] = useState(false);

  const calculatedThreat = useMemo(() => {
    let score = 15;
    if (factorBreach) score += 30;
    if (factorHeading) score += 20;
    if (factorReid) score += 12;
    if (factorCurfew) score += 10;
    return score;
  }, [factorBreach, factorHeading, factorReid, factorCurfew]);

  const threatSeverity = useMemo(() => {
    if (calculatedThreat >= 75) return { label: "CRITICAL", ring: "text-red-500", badge: "bg-red-600 text-white border-red-500 font-bold" };
    if (calculatedThreat >= 50) return { label: "HIGH", ring: "text-amber-400", badge: "bg-amber-500 text-black border-amber-400 font-bold" };
    if (calculatedThreat >= 30) return { label: "MEDIUM", ring: "text-white", badge: "bg-white text-black border-white font-bold" };
    return { label: "LOW", ring: "text-emerald-400", badge: "bg-emerald-500 text-black border-emerald-500 font-bold" };
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
    <div className="min-h-screen w-full bg-black text-white antialiased selection:bg-white selection:text-black overflow-x-hidden font-sans">
      {/* ── TOP NAV ───────────────────────────────────────────── */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-center py-3.5 px-4 sm:px-8 pointer-events-none">
        <div className="max-w-7xl w-full h-16 bg-black border border-white px-6 flex items-center justify-between pointer-events-auto">
          <Link to="/" onClick={playClick} className="flex items-center gap-3 group">
            <div className="h-9 w-9 bg-white text-black border border-white flex items-center justify-center font-bold press">
              <Shield size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-wide text-white">IBVAP SENTINEL</span>
                <span className="text-xs" title="SSB / Ministry of Home Affairs">🇮🇳</span>
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-micro text-white/60 font-mono">
                BORDER DEFENSE VISION AI
              </div>
            </div>
          </Link>

          <div className="hidden md:flex items-center gap-2 text-[11px] font-bold tracking-wide text-white/80">
            <a href="#platform" onClick={playClick} className="link-underline px-1 py-2 hover:text-white transition-colors">CAPABILITIES</a>
            <a href="#calculator" onClick={playClick} className="link-underline px-1 py-2 hover:text-white transition-colors">THREAT ENGINE</a>
            <a href="#pipeline" onClick={playClick} className="link-underline px-1 py-2 hover:text-white transition-colors">HOW IT OPERATES</a>
            <a href="#specs" onClick={playClick} className="link-underline px-1 py-2 hover:text-white transition-colors">BENCHMARKS</a>
            <Link to="/console?tab=reconstruction" onClick={playClick} className="ml-2 px-3 py-2 border border-white/50 hover:bg-white hover:text-black transition-colors duration-300 flex items-center gap-1.5 press">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              <span>LIVE SCENARIO LAB</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAudioMuted(!audioMuted)}
              title={audioMuted ? "Unmute Tactical Audio" : "Mute Tactical Audio"}
              className="p-2 border border-white/50 bg-black text-white hover:bg-white hover:text-black transition-colors duration-300 press"
            >
              {audioMuted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <Link
              to="/console"
              onClick={playClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-black hover:bg-black hover:text-white font-extrabold text-xs uppercase tracking-wide transition-all duration-300 border border-white press group"
            >
              <span>Launch Console</span>
              <ArrowRight size={14} className="transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </nav>

      {/* ── HERO ──────────────────────────────────────────────── */}
      <section className="relative pt-40 pb-24 px-6 sm:px-12 flex flex-col items-center text-center overflow-hidden bg-black">
        <Reveal className="inline-flex items-center gap-2.5 py-1 px-4 border border-white/40 text-[11px] font-mono text-white/70 mb-9 bg-black">
          <span className="flex items-center gap-1.5 font-bold text-white">
            <span className="h-2 w-2 rounded-full bg-white animate-ping" />
            <span>BORDER INTELLIGENCE SYSTEM</span>
          </span>
          <span className="text-white/30">|</span>
          <span className="text-white/70 font-medium">100% On-Premise Air-Gapped Edge</span>
        </Reveal>

        <Reveal
          as="h1"
          delay={80}
          className="font-display max-w-4xl text-[2.6rem] sm:text-6xl lg:text-[4.5rem] font-medium tracking-tight text-white leading-[1.05] mb-7 [text-wrap:balance]"
        >
          Zero blindspots.{" "}
          <span className="italic font-light">One unified border command.</span>
        </Reveal>

        <Reveal as="p" delay={160} className="max-w-2xl text-base sm:text-lg text-white/70 leading-relaxed font-normal mb-11">
          Autonomous multi-camera correlation for national borders. Predicts subject transit across unmonitored blind gaps, calculates objective 0–100 threat scores, and seals court-admissible evidence under Section 65B of the Indian Evidence Act.
        </Reveal>

        <Reveal delay={240} className="flex flex-wrap items-center justify-center gap-4 mb-16">
          <Link
            to="/console"
            onClick={playClick}
            className="px-8 py-3.5 bg-white text-black font-extrabold text-sm uppercase tracking-wide transition-all duration-300 hover:bg-black hover:text-white flex items-center gap-2.5 border border-white press group"
          >
            <span>Open Command Console</span>
            <ArrowRight size={16} className="transition-transform duration-300 group-hover:translate-x-1" />
          </Link>
          <a
            href="#calculator"
            onClick={playClick}
            className="px-6 py-3.5 bg-black text-white hover:bg-white hover:text-black border border-white/50 font-bold text-sm transition-all duration-300 press"
          >
            Test Threat Calculator ↓
          </a>
        </Reveal>

        {/* dashboard preview */}
        <Reveal delay={120} className="relative max-w-5xl w-full mx-auto px-4">
          <div className="relative border border-white bg-black overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_40px_120px_-30px_rgba(255,255,255,0.12)]">
            <div className="h-10 px-4 border-b border-white/70 bg-black flex items-center justify-between text-xs text-white font-mono">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full border border-white/50" />
                <span className="h-2.5 w-2.5 rounded-full border border-white/50" />
                <span className="h-2.5 w-2.5 rounded-full border border-white/50" />
                <span className="ml-2 text-white/80 font-bold tracking-wide">IBVAP SENTINEL // TACTICAL COMMAND DASHBOARD</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-white/60 font-semibold flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
                  SECTOR 4-B LIVE
                </span>
                <span className="text-white font-mono">{timeState.time}</span>
              </div>
            </div>

            <div className="p-4 bg-black grid grid-cols-1 md:grid-cols-12 gap-3.5 text-left">
              <div className="md:col-span-7 space-y-2.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-white/70 pb-1 border-b border-white/15">
                  <span className="flex items-center gap-1.5 text-white font-bold">
                    <Video size={13} />
                    6 CAMERAS ONLINE [REC]
                  </span>
                  <span className="text-white/60 font-mono">YOLOv8 + ByteTrack [Active]</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="aspect-video bg-black border border-white/20 p-1.5 flex flex-col justify-between">
                    <span className="text-[9px] font-mono text-white font-bold">CAM_ALPHA</span>
                    <span className="text-[8.5px] font-mono text-white/55">● 18:42 Ingress</span>
                  </div>
                  <div className="aspect-video bg-black border-2 border-red-500 p-1.5 flex flex-col justify-between relative">
                    <div className="flex justify-between items-center text-[9px] font-mono text-red-500 font-bold">
                      <span>CAM_BRAVO</span>
                      <span className="px-1 bg-red-600 text-white text-[8px] font-bold">BREACH</span>
                    </div>
                    <div className="text-center font-mono text-[9px] text-white font-bold bg-black border border-red-500 py-0.5">Person [0.94]</div>
                    <span className="text-[8.5px] font-mono text-red-500 font-bold">● Active Target</span>
                  </div>
                  {[
                    ["CAM_CHARLIE", "Predicted (18:42:24)"],
                    ["CAM_DELTA", "Perimeter Clear"],
                    ["CAM_ECHO", "Patrol Road"],
                    ["CAM_FOXTROT", "Normal [12 FPS]"],
                  ].map(([c, s]) => (
                    <div key={c} className="aspect-video bg-black border border-white/20 p-1.5 flex flex-col justify-between">
                      <span className="text-[9px] font-mono text-white font-bold">{c}</span>
                      <span className="text-[8.5px] font-mono text-white/55">● {s}</span>
                    </div>
                  ))}
                </div>

                <div className="p-2 bg-black border border-white/20 flex items-center justify-between text-[10.5px] font-mono text-white/70">
                  <span>ACTIVE TRACK: <strong className="bg-white text-black px-1 font-bold">#P17</strong></span>
                  <span>SPEED: <strong className="text-white font-bold">5.2 km/h NE</strong></span>
                  <span>CONFIDENCE: <strong className="text-white font-bold">91.4% (OSNet)</strong></span>
                </div>
              </div>

              <div className="md:col-span-5 bg-black border-2 border-red-500 p-3 flex flex-col justify-between space-y-2">
                <div className="flex items-center justify-between border-b border-red-500 pb-2">
                  <span className="text-xs font-bold text-red-500 flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                    CRITICAL ALERT · INC-0042
                  </span>
                  <span className="px-2 py-0.5 text-[9.5px] font-mono font-bold bg-red-600 text-white">SCORE 87 / 100</span>
                </div>
                <div className="space-y-1 text-xs">
                  <div className="text-white font-bold">Person Detected Near Restricted Zone</div>
                  <div className="text-[10px] text-white/60 font-mono">CAM_BRAVO · Lat 32.5621, Long 75.1234</div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-mono text-white/60 uppercase font-bold tracking-wide">OBJECTIVE THREAT FACTORS:</div>
                  <div className="grid grid-cols-2 gap-1 text-[10px] font-mono">
                    <span className="p-1 border border-red-500 text-red-400 font-bold">+30 Zone Breach</span>
                    <span className="p-1 border border-red-500 text-red-400 font-bold">+20 Toward Zero Line</span>
                    <span className="p-1 border border-red-500 text-red-400 font-bold">+12 Re-ID Correlation</span>
                    <span className="p-1 border border-red-500 text-red-400 font-bold">+10 Curfew Window</span>
                  </div>
                </div>
                <div className="pt-2 border-t border-red-500 flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60">SHA-256 SEALED IN BLOCK #4</span>
                  <Link to="/console" onClick={playClick} className="px-3 py-1 bg-white text-black hover:bg-black hover:text-white border border-white font-bold text-[11px] transition-colors duration-300 press">
                    Investigate →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── THREAT CALCULATOR ─────────────────────────────────── */}
      <section id="calculator" className="py-24 px-6 sm:px-12 bg-black border-t border-white/12">
        <div className="max-w-4xl mx-auto space-y-10">
          <Reveal className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-white/40 text-white/70 text-[11px] font-mono uppercase tracking-wide">
              <Zap size={13} />
              <span>Interactive Threat Quantification Engine</span>
            </div>
            <h2 className="font-display text-3xl sm:text-[3.25rem] font-normal text-white tracking-tight leading-[1.08]">Deterministic 0–100 additive formula</h2>
            <p className="text-white/65 text-sm sm:text-base max-w-xl mx-auto leading-relaxed">
              Test how Sentinel eliminates operator fatigue by turning complex multi-sensor observations into an explainable, objective score.
            </p>
          </Reveal>

          <Reveal delay={100} className="p-6 sm:p-9 bg-black border border-white/15 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-7 space-y-3">
              <div className="text-[11px] font-mono text-white/60 uppercase font-bold tracking-wide">Toggle Verified Sensor Triggers:</div>
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
                    className={`press w-full p-3 border text-left flex items-center justify-between text-xs transition-all duration-300 ${
                      item.checked ? "bg-white text-black font-bold border-white" : "bg-black text-white border-white/40 hover:border-white hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`h-4 w-4 flex items-center justify-center border transition-colors duration-200 ${item.checked ? "bg-black text-white border-black" : "border-white/50"}`}>
                        {item.checked && <Check size={11} strokeWidth={3} />}
                      </div>
                      <span>{item.label}</span>
                    </div>
                    <span className="font-mono font-bold">{item.pts}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="md:col-span-5 bg-black border border-white p-6 flex flex-col items-center justify-center text-center space-y-3">
              <span className={`px-3 py-1 text-[10px] font-mono font-bold border ${threatSeverity.badge}`}>
                {threatSeverity.label} PRIORITY
              </span>
              <div className="relative h-28 w-28 flex items-center justify-center">
                <svg className="h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <path stroke="#FFFFFF" strokeOpacity="0.2" strokeWidth="1" strokeDasharray="2, 2" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                  <path
                    className={`${threatSeverity.ring} transition-all duration-500 ease-out-expo`}
                    strokeDasharray={`${calculatedThreat}, 100`}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-extrabold font-mono text-white leading-none tabular-nums">{calculatedThreat}</span>
                  <span className="text-[9px] font-mono text-white/50">/ 100</span>
                </div>
              </div>
              <div className="text-[11px] font-mono text-white/70 font-semibold">
                {calculatedThreat >= 75 ? "Automated siren triggers. QRT alerted." : calculatedThreat >= 50 ? "Operator verification cued." : "Passive continuous logging."}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── PLATFORM CAPABILITIES ─────────────────────────────── */}
      <section id="platform" className="py-24 px-6 sm:px-12 bg-black border-t border-white/12">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center max-w-3xl mx-auto mb-14">
            <div className="text-[11px] font-mono font-bold tracking-micro text-white/55 uppercase mb-3">Tactical Surveillance Engine</div>
            <h2 className="font-display text-3xl sm:text-[3.25rem] font-normal text-white tracking-tight mb-4 leading-[1.08]">Engineered for Indian borders</h2>
            <p className="text-white/65 text-base leading-relaxed">
              Designed to solve the hardest problems facing border security forces: unmonitored blind corridors, high false alarm rates, and unverified video evidence.
            </p>
          </Reveal>

          <Reveal delay={80} className="flex flex-wrap items-center justify-center gap-2 mb-10">
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
                  className={`press flex items-center gap-2 px-5 py-2.5 text-xs font-bold transition-all duration-300 border ${
                    isActive ? "bg-white text-black border-white" : "bg-black text-white/80 border-white/40 hover:bg-white hover:text-black"
                  }`}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </Reveal>

          <Reveal delay={140} className="border border-white/15 bg-black p-8">
            {activePlatformTab === "monitor" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center animate-fade-up">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white/70 font-mono text-xs mb-4 border border-white/40">
                    <Video size={13} /> Continuous Multi-RTSP Edge Inference
                  </div>
                  <h3 className="font-display text-[1.7rem] font-normal text-white mb-3 leading-[1.15]">Live multi-feed grid with zero cloud latency</h3>
                  <p className="text-white/65 text-sm leading-relaxed mb-6">
                    Streams and analyzes 6+ RTSP/MJPEG feeds simultaneously on-premise. YOLOv8n TensorRT models process frames locally under 18ms per frame, identifying persons, vehicles, and wildlife without routing raw video over satellite or internet.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-white/70">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Sub-18ms detection latency on NVIDIA Jetson Orin</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Automated optical PTZ cueing on detected perimeter breaches</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Acoustic alert trigger with operator silence controls</span></div>
                  </div>
                </div>
                <div className="border border-white/25 bg-black aspect-video relative">
                  <video src="/data/people_surveillance_web.mp4" autoPlay loop muted playsInline className="h-full w-full object-cover grayscale contrast-125" />
                  <div className="absolute top-3 left-3 px-2 py-1 bg-black text-white text-xs font-mono border border-white/40">CAM_BRAVO · SECTOR 4-B</div>
                </div>
              </div>
            )}
            {activePlatformTab === "handoff" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center animate-fade-up">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white/70 font-mono text-xs mb-4 border border-white/40">
                    <GitBranch size={13} /> Predictive Topology & Deep Appearance Re-ID
                  </div>
                  <h3 className="font-display text-[1.7rem] font-normal text-white mb-3 leading-[1.15]">Seamless target tracking across camera blindspots</h3>
                  <p className="text-white/65 text-sm leading-relaxed mb-6">
                    Borders span kilometers where cameras cannot overlap. Sentinel models camera field-of-view topology, calculates target velocity vectors, and cues downstream cameras before the subject emerges.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-white/70">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>91.4% Re-ID match via OSNet 512-dim cosine embeddings</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Calculates expected time-of-arrival window on adjacent cameras</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Maintains persistent Track ID across disjoint camera networks</span></div>
                  </div>
                </div>
                <div className="border border-white/25 bg-black p-4 flex flex-col justify-center gap-3">
                  <div className="text-xs font-mono text-white/60 uppercase font-bold tracking-wide">TOPOLOGICAL TRANSIT CORRIDOR:</div>
                  <div className="flex items-center justify-between p-3 bg-black border border-white/25">
                    <div className="text-left">
                      <div className="text-xs font-bold text-white font-mono">CAM_ALPHA</div>
                      <div className="text-[10px] text-white/55 font-mono">18:42:11 · Ingress</div>
                    </div>
                    <div className="h-[2px] flex-1 mx-4 bg-white/70 relative">
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[9px] font-mono text-white/60">13s BLIND GAP</span>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-bold text-white font-mono">CAM_BRAVO</div>
                      <div className="text-[10px] text-white/55 font-mono">18:42:24 · Re-ID 91%</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            {activePlatformTab === "threat" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center animate-fade-up">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white/70 font-mono text-xs mb-4 border border-white/40">
                    <BarChart3 size={13} /> Transparent Additive Math (0–100)
                  </div>
                  <h3 className="font-display text-[1.7rem] font-normal text-white mb-3 leading-[1.15]">Explainable threat engine without black boxes</h3>
                  <p className="text-white/65 text-sm leading-relaxed mb-6">
                    Military commanders cannot act on opaque AI guesses. Every threat score (0–100) is deterministically computed from 4 weighted factors with plain-language rationale.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-white/70">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Zero hallucination: every point backed by verified pixel telemetry</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>38% reduction in operator fatigue via site-specific calibration</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Instant threshold escalation for rapid response team dispatch</span></div>
                  </div>
                </div>
                <div className="border border-white/25 bg-black p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/15 pb-2">
                    <span className="text-xs font-mono font-bold text-white">SCORE BREAKDOWN · #P17</span>
                    <span className="text-xl font-mono font-extrabold text-red-500">87 / 100</span>
                  </div>
                  <div className="space-y-2 text-xs font-mono">
                    <div className="flex justify-between p-2 border border-red-500 text-red-400 font-bold"><span>Restricted Zone Breach</span><strong>+30 PTS</strong></div>
                    <div className="flex justify-between p-2 border border-red-500 text-red-400 font-bold"><span>Heading Toward Zero Line</span><strong>+20 PTS</strong></div>
                    <div className="flex justify-between p-2 border border-red-500 text-red-400 font-bold"><span>Cross-Camera Re-ID Match</span><strong>+12 PTS</strong></div>
                    <div className="flex justify-between p-2 border border-red-500 text-red-400 font-bold"><span>Night Window (Curfew Active)</span><strong>+10 PTS</strong></div>
                  </div>
                </div>
              </div>
            )}
            {activePlatformTab === "ledger" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center animate-fade-up">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 bg-black text-white/70 font-mono text-xs mb-4 border border-white/40">
                    <Lock size={13} /> Section 65B Indian Evidence Act Compliant
                  </div>
                  <h3 className="font-display text-[1.7rem] font-normal text-white mb-3 leading-[1.15]">Tamper-evident SHA-256 judicial evidence vault</h3>
                  <p className="text-white/65 text-sm leading-relaxed mb-6">
                    Video evidence frequently fails scrutiny in court due to broken custody chains. Sentinel seals every snapshot, detection coordinate, and operator log into immutable SHA-256 blockchain blocks at the point of capture.
                  </p>
                  <div className="space-y-2.5 font-mono text-xs text-white/70">
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Cryptographic hash generation at hardware edge ingestion</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>Generates automated court-ready Section 65B certificates</span></div>
                    <div className="flex items-center gap-2"><CheckCircle2 size={15} className="text-white shrink-0" /><span>One-click tamper detection across chronological blocks</span></div>
                  </div>
                </div>
                <div className="border border-white/25 bg-black p-5 space-y-3 font-mono text-xs">
                  <div className="flex items-center justify-between text-white border-b border-white/15 pb-2 font-bold">
                    <span className="flex items-center gap-1.5"><CheckCircle2 size={14} />LEDGER INTEGRITY: VERIFIED</span>
                    <span className="text-white/60">5 BLOCKS SEALED</span>
                  </div>
                  <div className="p-3 bg-black border border-white/25 space-y-1 text-[11px] text-white/70">
                    <div className="font-bold text-white">BLOCK #4 · INC-0042 [CRITICAL]</div>
                    <div className="truncate font-mono">HASH: a4f89d3167eb2156828c40ff11e8bc297394bb04</div>
                    <div className="truncate font-mono">PREV: sentinel::block_03_seal</div>
                  </div>
                </div>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {/* ── PIPELINE (major break) ────────────────────────────── */}
      <section id="pipeline" className="py-24 px-6 sm:px-12 bg-black border-t-[3px] border-white">
        <div className="max-w-6xl mx-auto">
          <Reveal className="text-center max-w-2xl mx-auto mb-16">
            <div className="text-[11px] font-mono font-bold tracking-micro text-white/55 uppercase mb-3">Operational Pipeline</div>
            <h2 className="font-display text-3xl sm:text-[3.25rem] font-normal text-white tracking-tight mb-4 leading-[1.08]">How Sentinel operates</h2>
            <p className="text-white/65 text-base">From raw sensor ingestion to cryptographically sealed judicial dossiers.</p>
          </Reveal>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-10">
            {[
              { n: "01", t: "Edge Ingestion", d: "Runs lightweight YOLOv8 on NVIDIA Jetson / on-prem edge with zero internet dependency.", tag: "Local TensorRT" },
              { n: "02", t: "Cross-Camera Handoff", d: "Predictive camera topology routes target vectors across blind gaps to cue neighboring sensors.", tag: "Topology Aware" },
              { n: "03", t: "Explainable Threat", d: "Scores 0–100 derived transparently from zone breach, loitering, speed, and curfew weights.", tag: "Zero Black Box" },
              { n: "04", t: "Judicial Evidence", d: "Every bounding box, snapshot, and event sealed into tamper-evident SHA-256 blockchain blocks.", tag: "Section 65B Certified" },
            ].map((step, i) => (
              <Reveal key={step.n} delay={i * 90} className="group flex flex-col justify-between border-t-2 border-white pt-5 pr-2">
                <div>
                  <div className="font-display text-5xl font-light text-white/40 mb-4 tabular-nums transition-colors duration-300 group-hover:text-white">{step.n}</div>
                  <h4 className="text-base font-bold text-white mb-2">{step.t}</h4>
                  <p className="text-xs text-white/60 leading-relaxed">{step.d}</p>
                </div>
                <div className="mt-6 text-[11px] font-mono text-white/70 font-bold uppercase tracking-wide">{step.tag}</div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENCHMARKS (borderless, rule-separated) ───────────── */}
      <section id="specs" className="py-24 px-6 sm:px-12 bg-black border-t border-white/12">
        <div className="max-w-6xl mx-auto">
          <Reveal className="grid grid-cols-2 md:grid-cols-4 border-t border-white/15 divide-y divide-white/12 md:divide-y-0 md:divide-x md:divide-white/12">
            {[
              { v: 18, prefix: "< ", suffix: "ms", label: "Inference Latency", sub: "YOLOv8n TensorRT FP16" },
              { v: 91.4, suffix: "%", decimals: 1, label: "Re-ID Match Rate", sub: "OSNet Appearance Feature Vector" },
              { v: 38, suffix: "%", label: "False Alarm Cut", sub: "Site-Specific Calibration Engine" },
              { v: 100, suffix: "%", label: "Air-Gapped Sovereign", sub: "Zero Cloud Ingress or Dependencies" },
            ].map((s, i) => (
              <div key={i} className="p-6 md:p-8 text-center md:text-left">
                <div className="font-mono text-3xl sm:text-[2.75rem] font-extrabold text-white mb-1 tabular-nums leading-none">
                  <CountUp value={s.v} prefix={s.prefix || ""} suffix={s.suffix || ""} decimals={s.decimals || 0} />
                </div>
                <div className="text-xs text-white font-mono uppercase font-bold tracking-wide">{s.label}</div>
                <div className="text-[10px] text-white/50 mt-1">{s.sub}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t-[3px] border-white bg-black py-12 px-6 sm:px-12 text-white/70 font-mono text-xs">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 bg-white text-black border border-white flex items-center justify-center font-bold">
              <Shield size={14} />
            </div>
            <span className="font-bold text-white">IBVAP SENTINEL</span>
            <span className="text-white/30">·</span>
            <span>MINISTRY OF HOME AFFAIRS · SSB</span>
          </div>
          <div className="flex items-center gap-6">
            <span>SIH26187</span>
            <span className="text-white/30">·</span>
            <Link to="/console" onClick={playClick} className="bg-white text-black hover:bg-black hover:text-white px-3 py-1.5 border border-white font-bold uppercase transition-colors duration-300 press">
              Launch Console →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
