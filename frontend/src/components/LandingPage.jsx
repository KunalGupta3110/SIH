import { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import siren from "../lib/audioSiren.js";
import { Reveal, CountUp } from "../lib/motion.jsx";
import IsometricTerrain from "./IsometricTerrain.jsx";
import {
  Shield,
  ArrowRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Check,
  Volume2,
  VolumeX,
  Menu,
  X,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Primitives
   ═══════════════════════════════════════════════════════════════════ */

function Eyebrow({ children }) {
  return (
    <div className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/45">{children}</div>
  );
}

function Stat({ value, label, decimals = 0, prefix = "", suffix = "" }) {
  return (
    <div>
      <div className="font-mono text-3xl font-semibold text-white tabular-nums leading-none">
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      <div className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">{label}</div>
    </div>
  );
}

function Ring({ value, label, sub, size = 96 }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex items-center gap-3.5">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="4" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="#ffffff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c - (c * value) / 100}
            style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <span className="font-mono text-sm font-semibold tabular-nums">
            <CountUp value={value} suffix="%" />
          </span>
        </div>
      </div>
      <div>
        <div className="text-[13px] font-semibold text-white">{label}</div>
        <div className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/40">{sub}</div>
      </div>
    </div>
  );
}

function Spark({ label, value, data }) {
  const w = 240;
  const h = 40;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const pts = data
    .map((d, i) => `${(i / (data.length - 1)) * w},${h - ((d - min) / (max - min || 1)) * (h - 4) - 2}`)
    .join(" ");
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-white/45">{label}</span>
        <span className="font-mono text-[11px] tabular-nums text-white">{value}</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-1.5 w-full" style={{ height: h }}>
        <polyline points={pts} fill="none" stroke="#ffffff" strokeOpacity="0.8" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function VideoTile({ src, cam, note, detected, className = "" }) {
  return (
    <div className={`scanline relative overflow-hidden border border-white/12 bg-black ${className}`}>
      <video
        src={src}
        autoPlay
        loop
        muted
        playsInline
        className="aspect-video w-full object-cover grayscale contrast-110 brightness-105"
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 font-mono text-[9px]">
        <div className="flex items-start justify-between">
          <span className="flex items-center gap-1 bg-black/70 px-1.5 py-0.5 text-white/70">
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> LIVE
          </span>
          <span className="bg-black/70 px-1.5 py-0.5 text-white/60">{cam}</span>
        </div>
        <div className="flex items-end justify-between">
          <span className="bg-black/70 px-1.5 py-0.5 text-white/55">{note}</span>
          {detected && (
            <span className="border border-red-500/60 bg-red-950/50 px-1.5 py-0.5 text-red-300">{detected}</span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   Page
   ═══════════════════════════════════════════════════════════════════ */

const NAV = [
  ["Operations", "#operations"],
  ["Cross-Match", "#reid"],
  ["Threat Engine", "#threat"],
  ["Evidence", "#evidence"],
  ["Benchmarks", "#specs"],
];

const THREAT_FACTORS = [
  ["Restricted geofence breach", 30, "Track centroid inside the 100m buffer polygon"],
  ["Velocity vector toward zero line", 20, "Heading within 35° of the border normal"],
  ["Cross-camera Re-ID confirmed", 12, "Cosine similarity ≥ 0.82 on a 512-d embedding"],
  ["Night curfew window", 10, "Detection between 22:00 and 05:00 IST"],
];

export default function LandingPage() {
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [menu, setMenu] = useState(false);
  const [factors, setFactors] = useState([true, true, true, false]);
  const [clock, setClock] = useState("--:--:--");
  const click = useCallback(() => { if (!muted) siren.playClick(); }, [muted]);

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }) + " IST");
    t();
    const i = setInterval(t, 1000);
    return () => clearInterval(i);
  }, []);

  const score = useMemo(
    () => 8 + factors.reduce((s, on, i) => s + (on ? THREAT_FACTORS[i][1] : 0), 0),
    [factors]
  );
  const band =
    score >= 75 ? { label: "CRITICAL", cls: "text-red-400 border-red-500", action: "Siren armed · QRT auto-dispatched" }
    : score >= 45 ? { label: "ELEVATED", cls: "text-amber-400 border-amber-500", action: "Operator verification cued" }
    : { label: "ROUTINE", cls: "text-white border-white/40", action: "Passive continuous logging" };

  return (
    <div className="min-h-screen w-full bg-black text-white font-sans antialiased selection:bg-white selection:text-black overflow-x-hidden">
      {/* ── NAV ─────────────────────────────────────────────────── */}
      <nav className="fixed inset-x-0 top-0 z-50 border-b border-white/10 bg-black/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" onClick={click} className="flex items-center gap-3">
            <span className="grid h-8 w-8 place-items-center border border-white bg-white text-black">
              <Shield size={16} />
            </span>
            <span className="leading-none">
              <span className="block text-[13px] font-bold tracking-wide">IBVAP SENTINEL</span>
              <span className="mt-1 block font-mono text-[8.5px] uppercase tracking-[0.24em] text-white/45">
                Border Defense Vision AI
              </span>
            </span>
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} onClick={click} className="link-underline px-3 py-2 text-[12px] font-medium text-white/70 transition-colors hover:text-white">
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setMuted((m) => !m)}
              className="press hidden h-9 w-9 place-items-center border border-white/40 text-white/70 hover:bg-white hover:text-black sm:grid"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <Link
              to="/console"
              onClick={click}
              className="press group hidden items-center gap-2 border border-white bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-wide text-black hover:bg-black hover:text-white sm:flex"
            >
              Launch Console
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
            <button onClick={() => setMenu((m) => !m)} className="press grid h-9 w-9 place-items-center border border-white/40 md:hidden">
              {menu ? <X size={15} /> : <Menu size={15} />}
            </button>
          </div>
        </div>
        {menu && (
          <div className="border-t border-white/10 bg-black px-6 py-3 md:hidden">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} onClick={() => { click(); setMenu(false); }} className="block py-2 text-sm text-white/75">
                {label}
              </a>
            ))}
            <Link to="/console" className="mt-2 block border border-white bg-white px-4 py-2 text-center text-[11px] font-bold uppercase text-black">
              Launch Console
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <header className="relative mx-auto max-w-6xl px-6 pb-20 pt-32 sm:pt-40">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <Reveal className="inline-flex items-center gap-2.5 border border-white/25 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              SIH 2026 · PS-26187 · SSB Gurdaspur Sector
            </Reveal>

            <Reveal as="h1" delay={70} className="font-display mt-6 text-[2.7rem] font-light leading-[1.04] tracking-tight text-white sm:text-6xl [text-wrap:balance]">
              AI Border<br />
              <span className="italic">Surveillance System</span>
            </Reveal>

            <Reveal as="p" delay={140} className="mt-6 max-w-lg text-[15px] leading-relaxed text-white/65">
              One identity, tracked across every camera on the line. Sentinel correlates
              multi-camera detections through the blind gaps between them, scores each
              event on an explainable 0–100 scale, and seals the evidence the instant it
              is captured — fully on-premise, air-gapped, court-admissible.
            </Reveal>

            <Reveal delay={210} className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/console"
                onClick={click}
                className="press group flex items-center gap-2 border border-white bg-white px-6 py-3 text-[12px] font-bold uppercase tracking-wide text-black hover:bg-black hover:text-white"
              >
                Open Command Console
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#operations" onClick={click} className="press border border-white/40 px-6 py-3 text-[12px] font-bold uppercase tracking-wide text-white/80 hover:border-white hover:text-white">
                See it running
              </a>
            </Reveal>

            <Reveal delay={280} className="mt-10 grid max-w-md grid-cols-3 gap-6 border-t border-white/12 pt-6">
              <Stat value={6} label="Cameras online" />
              <Stat value={4} label="Active perimeters" />
              <Stat value={1.8} decimals={1} suffix="s" label="Detect → alert" />
            </Reveal>
          </div>

          {/* terrain panel */}
          <Reveal delay={120} className="relative border border-white/15 bg-black">
            <div className="flex items-center justify-between border-b border-white/12 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              <span>Sector 4-B · Elevation Model</span>
              <span className="flex items-center gap-1.5 text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Streaming
              </span>
            </div>
            <div className="relative">
              <IsometricTerrain mode="hero" />
              <div className="animate-drift absolute left-3 top-3 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/45">Scan coverage</div>
                <div className="font-mono text-base font-semibold"><CountUp value={93.4} decimals={1} suffix="%" /></div>
              </div>
              <div className="animate-drift absolute right-3 top-10 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: "-2s" }}>
                <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/45">Uptime</div>
                <div className="font-mono text-base font-semibold"><CountUp value={99.98} decimals={2} suffix="%" /></div>
              </div>
              <div className="animate-drift absolute bottom-3 right-4 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: "-4s" }}>
                <div className="font-mono text-[8.5px] uppercase tracking-[0.14em] text-white/45">Open alerts</div>
                <div className="font-mono text-base font-semibold text-amber-400"><CountUp value={3} /></div>
              </div>
            </div>
            <div className="flex items-center gap-3 border-t border-white/12 px-3 py-2">
              <button onClick={click} className="press text-white/50 hover:text-white"><SkipBack size={13} /></button>
              <button onClick={() => { click(); setPlaying((p) => !p); }} className="press grid h-7 w-7 place-items-center border border-white bg-white text-black">
                {playing ? <Pause size={12} /> : <Play size={12} />}
              </button>
              <button onClick={click} className="press text-white/50 hover:text-white"><SkipForward size={13} /></button>
              <div className="relative h-0.5 flex-1 bg-white/15">
                <div className="absolute inset-y-0 left-0 w-2/3 bg-white" />
              </div>
              <span className="font-mono text-[10px] tabular-nums text-white/45">{clock}</span>
            </div>
          </Reveal>
        </div>
      </header>

      {/* ── PROBLEM ─────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow>Why the line still gets crossed</Eyebrow>
            <h2 className="font-display mt-4 max-w-2xl text-3xl font-light leading-tight tracking-tight sm:text-[2.75rem]">
              Three failures no single camera can fix.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-px border border-white/12 bg-white/12 sm:grid-cols-3">
            {[
              ["01", "Blind corridors", "Cameras on a border cannot overlap for kilometres. A subject that leaves one frame simply vanishes until the next — if anyone is watching it.", "13s", "median blind-gap transit"],
              ["02", "Alarm fatigue", "Wildlife, weather and vegetation trip motion alerts hundreds of times a night. Operators learn to ignore the buzzer.", "38%", "of alerts are false, pre-Sentinel"],
              ["03", "Unusable evidence", "Footage pulled days later has no verifiable chain of custody and routinely fails Section 65B scrutiny in court.", "0", "tamper-proof by default"],
            ].map(([n, t, d, stat, statlabel]) => (
              <Reveal key={n} className="bg-black p-7">
                <div className="font-mono text-[11px] text-white/35">{n}</div>
                <h3 className="mt-3 text-lg font-bold">{t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">{d}</p>
                <div className="mt-6 flex items-baseline gap-2 border-t border-white/12 pt-4">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{stat}</span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/40">{statlabel}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── OPERATIONS ──────────────────────────────────────────── */}
      <section id="operations" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>01 — Operations</Eyebrow>
              <h2 className="font-display mt-4 text-3xl font-light tracking-tight sm:text-[2.75rem]">Every feed, one watchfloor</h2>
            </div>
            <span className="font-mono text-[11px] text-white/45">YOLOv8n · ByteTrack · &lt;18 ms / frame @ Jetson Orin</span>
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_260px]">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <VideoTile src="/data/ibvap_real_yolo_demo.mp4" cam="CAM_ALPHA" note="Ingress approach" detected="PERSON 0.87" />
              <VideoTile src="/data/ibvap_real_bytetrack_demo.mp4" cam="CAM_BRAVO" note="Perimeter · restricted zone" detected="TRACK #14" />
              <VideoTile src="/data/detected_output_web.mp4" cam="CAM_CHARLIE" note="Checkpoint lane" />
              <VideoTile src="/data/people_surveillance_web.mp4" cam="CAM_DELTA" note="Patrol road" />
            </div>

            <Reveal delay={120} className="space-y-6 border border-white/12 p-5">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Sector telemetry</div>
              <Ring value={78} label="Scan coverage" sub="perimeter sweep" />
              <Ring value={64} label="Channel load" sub="6 of 8 active" />
              <div className="space-y-5 border-t border-white/12 pt-5">
                <Spark label="Detections / min" value="24.1" data={[9, 12, 10, 16, 13, 19, 15, 23, 18, 27, 22, 24]} />
                <Spark label="False-alarm rate" value="2.3%" data={[7, 6, 6.5, 5, 4.4, 4.1, 3.6, 3.2, 2.9, 2.6, 2.4, 2.3]} />
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── CROSS-CAMERA RE-ID ──────────────────────────────────── */}
      <section id="reid" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>02 — Cross-camera Re-Identification</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-light tracking-tight sm:text-[2.75rem]">
              One identity, held across the blind gap
            </h2>
            <p className="mt-5 text-[14px] leading-relaxed text-white/65">
              A ResNet-18 appearance encoder turns each detection into a 512-dimension
              embedding. When a track leaves one camera, Sentinel predicts where and when
              it will re-emerge and matches it on arrival by cosine similarity — no
              overlap required.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-[1fr_auto_1fr]">
            <Reveal className="border border-white/15 bg-black">
              <div className="flex items-center justify-between border-b border-white/12 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
                <span>CAM_ALPHA · Ingress</span><span>t = 20:14:07</span>
              </div>
              <div className="relative">
                <video src="/data/detected_output_web.mp4" autoPlay loop muted playsInline className="aspect-video w-full object-cover grayscale contrast-110 brightness-110" />
                <span className="absolute bottom-2 left-2 border border-white/50 bg-black/70 px-1.5 py-0.5 font-mono text-[9px]">TARGET ALPHA-7 · acquired</span>
              </div>
            </Reveal>

            <Reveal delay={90} className="flex flex-col items-center justify-center gap-2 px-2 py-4 md:py-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">Blind corridor</div>
              <svg viewBox="0 0 120 40" className="w-28">
                <line x1="4" y1="20" x2="116" y2="20" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="1.5" strokeDasharray="3 4" style={{ animation: "dash-flow 1s linear infinite" }} />
                <path d="M108,14 L118,20 L108,26" fill="none" stroke="#ffffff" strokeWidth="1.5" />
              </svg>
              <div className="font-mono text-lg font-semibold tabular-nums"><CountUp value={1.33} decimals={2} suffix=" s" /></div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-white/40">40 frames unmonitored</div>
            </Reveal>

            <Reveal delay={180} className="border border-white bg-black">
              <div className="flex items-center justify-between border-b border-white/12 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/60">
                <span>CAM_BRAVO · Perimeter</span><span>t = 20:14:08</span>
              </div>
              <div className="relative">
                <video src="/data/cross_cam_real_demo_web.mp4" autoPlay loop muted playsInline className="aspect-video w-full object-cover grayscale contrast-110 brightness-110" />
                <span className="absolute bottom-2 left-2 border border-white bg-white px-1.5 py-0.5 font-mono text-[9px] text-black">TARGET ALPHA-7 · re-identified</span>
              </div>
            </Reveal>
          </div>

          <Reveal delay={120} className="mt-4 grid grid-cols-2 gap-px border border-white/12 bg-white/12 sm:grid-cols-4">
            {[
              ["91.4%", "Match confidence"],
              ["512-d", "Embedding vector"],
              ["0.82", "Cosine threshold"],
              ["3", "Camera handoffs"],
            ].map(([v, l]) => (
              <div key={l} className="bg-black px-4 py-5 text-center">
                <div className="font-mono text-xl font-semibold tabular-nums">{v}</div>
                <div className="mt-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/40">{l}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── THREAT ENGINE + PERIMETER ───────────────────────────── */}
      <section id="threat" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>03 — Explainable Threat Engine</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-light tracking-tight sm:text-[2.75rem]">A score a commander can defend</h2>
            <p className="mt-5 text-[14px] leading-relaxed text-white/65">
              No black box. Every 0–100 threat score is the sum of fixed, auditable
              weights — toggle a factor and watch the math. The same table runs in the
              console and prints on the incident dossier.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            {/* interactive breakdown */}
            <Reveal className="border border-white/15 p-6">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-white/45">Contributing factors</div>
              <div className="mt-4 space-y-2">
                {THREAT_FACTORS.map(([label, pts, detail], i) => {
                  const on = factors[i];
                  return (
                    <button
                      key={label}
                      onClick={() => { click(); setFactors((f) => f.map((v, j) => (j === i ? !v : v))); }}
                      className={`press flex w-full items-start justify-between gap-4 border p-3 text-left transition-colors ${
                        on ? "border-white bg-white text-black" : "border-white/25 text-white hover:border-white/60"
                      }`}
                    >
                      <span className="flex items-start gap-3">
                        <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center border ${on ? "border-black" : "border-white/50"}`}>
                          {on && <Check size={11} strokeWidth={3} />}
                        </span>
                        <span>
                          <span className="block text-[13px] font-semibold">{label}</span>
                          <span className={`mt-0.5 block font-mono text-[10.5px] ${on ? "text-black/60" : "text-white/45"}`}>{detail}</span>
                        </span>
                      </span>
                      <span className="font-mono text-[13px] font-bold tabular-nums">+{pts}</span>
                    </button>
                  );
                })}
              </div>
            </Reveal>

            {/* score readout */}
            <Reveal delay={120} className="flex flex-col items-center justify-center border border-white p-6 text-center">
              <span className={`border px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.16em] ${band.cls}`}>
                {band.label}
              </span>
              <div className="relative my-5 h-36 w-36">
                <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
                  <path d="M18 2.1 a 15.9 15.9 0 0 1 0 31.8 a 15.9 15.9 0 0 1 0 -31.8" fill="none" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="2.5" />
                  <path
                    d="M18 2.1 a 15.9 15.9 0 0 1 0 31.8 a 15.9 15.9 0 0 1 0 -31.8"
                    fill="none"
                    stroke={score >= 75 ? "#ef4444" : score >= 45 ? "#f59e0b" : "#ffffff"}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${score}, 100`}
                    style={{ transition: "stroke-dasharray 0.5s cubic-bezier(0.22,1,0.36,1)" }}
                  />
                </svg>
                <div className="absolute inset-0 grid place-items-center">
                  <div>
                    <div className="font-mono text-4xl font-semibold tabular-nums leading-none">{score}</div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.16em] text-white/40">/ 100</div>
                  </div>
                </div>
              </div>
              <p className="font-mono text-[11px] text-white/60">{band.action}</p>
            </Reveal>
          </div>

          {/* perimeter terrain */}
          <Reveal delay={100} className="mt-4 border border-white/15 bg-black">
            <div className="flex items-center gap-3 border-b border-white/12 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-white/45">
              <span className="text-white">Perimeter overlay</span>
              <span>·</span><span>Restricted geofence · River Bend</span>
            </div>
            <div className="relative">
              <IsometricTerrain mode="perimeter" />
              <div className="absolute right-4 top-4 w-60 border border-red-500/50 bg-black/85 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.14em] text-red-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" /> Zone breach · critical
                </div>
                <div className="mt-2 space-y-1 font-mono text-[10.5px] text-white/55">
                  <div className="flex justify-between"><span>Zone</span><span className="text-white">Alpha-Red</span></div>
                  <div className="flex justify-between"><span>Score</span><span className="text-red-400">87 / 100</span></div>
                  <div className="flex justify-between"><span>Dwell</span><span className="text-white">00:41</span></div>
                  <div className="flex justify-between"><span>Camera</span><span className="text-white">CAM-03</span></div>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── EVIDENCE ────────────────────────────────────────────── */}
      <section id="evidence" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal className="max-w-2xl">
            <Eyebrow>04 — Chain of Custody</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-light tracking-tight sm:text-[2.75rem]">Sealed at capture, not after</h2>
            <p className="mt-5 text-[14px] leading-relaxed text-white/65">
              Every snapshot, bounding box and operator action is hashed into a
              SHA-256 chain the moment it is written. Break one block and every block
              after it fails verification — and the Section 65B certificate generates
              itself.
            </p>
          </Reveal>

          <Reveal delay={100} className="mt-12 overflow-x-auto">
            <div className="flex min-w-max items-stretch gap-0">
              {[
                ["BLOCK #1", "sector::genesis", "00:00:00"],
                ["BLOCK #2", "a4f8…bb04", "20:14:07"],
                ["BLOCK #3", "c1d9…7e22", "20:14:08"],
                ["BLOCK #4", "9f02…41ac", "20:15:33", true],
                ["BLOCK #5", "e77b…0d90", "20:22:10"],
              ].map(([b, h, t, critical], i, arr) => (
                <div key={b} className="flex items-stretch">
                  <div className={`w-52 border p-4 ${critical ? "border-red-500/60" : "border-white/15"}`}>
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                      <span className={critical ? "text-red-400" : "text-white/50"}>{b}</span>
                      <span className="text-white/35">{t}</span>
                    </div>
                    <div className="mt-3 font-mono text-[11px] text-white/70">HASH</div>
                    <div className="font-mono text-[12px] text-white">{h}</div>
                    {critical && (
                      <div className="mt-3 border border-red-500/50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-red-300">
                        INC-0042 · CRITICAL
                      </div>
                    )}
                  </div>
                  {i < arr.length - 1 && (
                    <div className="grid w-6 place-items-center font-mono text-white/30">→</div>
                  )}
                </div>
              ))}
            </div>
          </Reveal>

          <Reveal delay={160} className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-2 border-t border-white/12 pt-4 font-mono text-[11px] text-white/50">
            <span className="flex items-center gap-2 text-white"><Check size={13} /> Ledger integrity: verified</span>
            <span>5 blocks sealed</span>
            <span>Genesis: sentinel::genesis::ssb-gurdaspur::2026</span>
          </Reveal>
        </div>
      </section>

      {/* ── PIPELINE (major break) ──────────────────────────────── */}
      <section className="border-t-2 border-white bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow>End to end</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-light tracking-tight sm:text-[2.75rem]">Frame to dossier in one pass</h2>
          </Reveal>
          <div className="mt-14 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["01", "Edge ingest", "YOLOv8n TensorRT on the Jetson at the tower. Raw video never leaves the sector."],
              ["02", "Track & hand off", "ByteTrack maintains IDs; the topology model routes vectors across blind gaps."],
              ["03", "Score & explain", "Additive 0–100 threat, every point traceable to a rule and a pixel."],
              ["04", "Seal & certify", "SHA-256 chain + auto-generated Section 65B certificate."],
            ].map(([n, t, d], i) => (
              <Reveal key={n} delay={i * 80} className="group border-t-2 border-white pt-5">
                <div className="font-display text-5xl font-light text-white/35 transition-colors group-hover:text-white">{n}</div>
                <h3 className="mt-3 text-[15px] font-bold">{t}</h3>
                <p className="mt-2 text-[12.5px] leading-relaxed text-white/55">{d}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── BENCHMARKS ──────────────────────────────────────────── */}
      <section id="specs" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal><Eyebrow>Field benchmarks</Eyebrow></Reveal>
          <Reveal delay={80} className="mt-10 grid grid-cols-2 divide-y divide-white/12 border-y border-white/15 md:grid-cols-4 md:divide-y-0 md:divide-x">
            {[
              { v: 18, prefix: "< ", suffix: " ms", l: "Inference latency", s: "YOLOv8n · TensorRT FP16" },
              { v: 91.4, decimals: 1, suffix: "%", l: "Re-ID match rate", s: "ResNet-18 · 512-d cosine" },
              { v: 38, suffix: "%", l: "False-alarm cut", s: "Site calibration engine" },
              { v: 100, suffix: "%", l: "Air-gapped", s: "Zero cloud dependency" },
            ].map((m) => (
              <div key={m.l} className="p-6 md:p-8">
                <div className="font-mono text-3xl font-semibold tabular-nums sm:text-[2.5rem]">
                  <CountUp value={m.v} prefix={m.prefix || ""} suffix={m.suffix || ""} decimals={m.decimals || 0} />
                </div>
                <div className="mt-2 font-mono text-[11px] uppercase tracking-[0.14em] text-white">{m.l}</div>
                <div className="mt-1 font-mono text-[10px] text-white/40">{m.s}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-black py-24 text-center sm:py-28">
        <div className="mx-auto max-w-3xl px-6">
          <Reveal as="h2" className="font-display text-3xl font-light leading-tight tracking-tight sm:text-[2.75rem] [text-wrap:balance]">
            The console is live. Walk the sector.
          </Reveal>
          <Reveal delay={100} className="mt-8">
            <Link
              to="/console"
              onClick={click}
              className="press group inline-flex items-center gap-2.5 border border-white bg-white px-8 py-3.5 text-[12px] font-bold uppercase tracking-wide text-black hover:bg-black hover:text-white"
            >
              Launch Command Console
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────────── */}
      <footer className="border-t-2 border-white bg-black px-6 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 font-mono text-[11px] text-white/50 sm:flex-row">
          <div className="flex items-center gap-3">
            <span className="grid h-6 w-6 place-items-center border border-white bg-white text-black"><Shield size={12} /></span>
            <span className="font-bold text-white">IBVAP SENTINEL</span>
            <span className="text-white/25">·</span>
            <span>Ministry of Home Affairs · SSB</span>
          </div>
          <div className="flex items-center gap-5">
            <span>SIH 2026 · PS-26187</span>
            <Link to="/console" onClick={click} className="press border border-white bg-white px-3 py-1.5 font-bold uppercase text-black hover:bg-black hover:text-white">
              Console →
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
