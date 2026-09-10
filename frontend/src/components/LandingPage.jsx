import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import siren from "../lib/audioSiren.js";
import { Reveal, CountUp } from "../lib/motion.jsx";
import IsometricTerrain from "./IsometricTerrain.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import BrandMark from "./BrandMark.jsx";

// The 3D terrain diorama pulls in three.js — code-split so it only loads
// when the operator taps the sector map open.
const BorderTerrainModal = lazy(() => import("./gis/BorderTerrainModal.jsx"));
// Textured earth globe (react-three-fiber + a ~1 MB .glb) — also split, and
// only mounted once the hero globe scrolls into view.
const SentinelGlobe3D = lazy(() => import("./SentinelGlobe3D.jsx"));

// neutral placeholder while the globe chunk / model loads — a faint ring,
// never the old 2D dot-globe.
function GlobeShell() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="aspect-square w-[72%] rounded-full border border-white/[0.07]" />
    </div>
  );
}
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
  Crosshair,
  RotateCcw,
  LogIn,
  UserPlus,
} from "lucide-react";

/* ═══════════════════════════════════════════════════════════════════
   Primitives
   ═══════════════════════════════════════════════════════════════════ */

// Defers a heavy child until it scrolls near the viewport; shows `fallback`
// (the lightweight 2D globe) until then.
function WhenVisible({ children, fallback, rootMargin = "300px" }) {
  const [vis, setVis] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || vis) return undefined;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVis(true);
          io.disconnect();
        }
      },
      { rootMargin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [vis, rootMargin]);
  return (
    <div ref={ref} className="h-full w-full">
      {vis ? children : fallback}
    </div>
  );
}

function Eyebrow({ children }) {
  return (
    <div className="text-[12px] font-medium text-zinc-500">{children}</div>
  );
}

function Stat({ value, label, decimals = 0, prefix = "", suffix = "" }) {
  return (
    <div>
      <div className="font-mono text-3xl font-semibold text-zinc-100 tabular-nums leading-none">
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </div>
      <div className="mt-2 text-[12px] text-zinc-500">{label}</div>
    </div>
  );
}

// Architectural spec — a fixed engineering fact, not a measured metric.
function Spec({ label, value }) {
  return (
    <div>
      <div className="text-[11px] font-medium text-zinc-500">{label}</div>
      <div className="mt-1.5 font-mono text-[15px] font-semibold leading-tight text-white">{value}</div>
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
        <div className="font-mono text-[10.5px] text-white/40">{sub}</div>
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
        <span className="font-mono text-[10.5px] text-white/45">{label}</span>
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
            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> SIM
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

// Sparse HUD corner brackets — frames a panel without a full border.
function Corners({ className = "" }) {
  const arm = "h-3 w-3 border-white/45";
  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden="true">
      <span className={`absolute left-0 top-0 border-l border-t ${arm}`} />
      <span className={`absolute right-0 top-0 border-r border-t ${arm}`} />
      <span className={`absolute bottom-0 left-0 border-b border-l ${arm}`} />
      <span className={`absolute bottom-0 right-0 border-b border-r ${arm}`} />
    </div>
  );
}

/* Real ByteTrack rows — curated slice of public/data/ibvap_real_bytetrack_tracks.json.
   Real fields: frame, timestamp_sec, track_id, class, conf, box, in_restricted_zone. */
const LIVE_TRACKS = [
  { id: 14, cls: "person", conf: 0.87, dwell: "00:41", zone: true },
  { id: 9, cls: "person", conf: 0.74, dwell: "00:12", zone: false },
  { id: 3, cls: "car", conf: 0.9, dwell: "04:07", zone: false },
  { id: 21, cls: "person", conf: 0.66, dwell: "00:05", zone: false },
];

// The four Re-ID hops — camera, wall-clock, match score against the previous hop.
const REID_HOPS = [
  { cam: "CAM_ALPHA", role: "Ingress approach", t: "20:14:07", match: null, src: "/data/ibvap_real_yolo_demo.mp4" },
  { cam: "CAM_BRAVO", role: "Perimeter fence", t: "20:14:08", match: 91.4, src: "/data/cross_cam_real_demo_web.mp4" },
  { cam: "CAM_CHARLIE", role: "River bend", t: "20:15:33", match: 88.1, src: "/data/people_surveillance_web.mp4" },
  { cam: "CAM_DELTA", role: "East spur", t: "20:16:22", match: 85.7, src: "/data/people_surveillance_web.mp4" },
];

// 2×2 anchor points (percent of the connector box) + the curved handoff paths.
const REID_NODES = [
  { x: 26, y: 27 },
  { x: 74, y: 27 },
  { x: 26, y: 73 },
  { x: 74, y: 73 },
];
const REID_PATHS = [
  "M26,27 C46,10 62,10 74,27",
  "M74,31 C90,45 90,55 74,71",
  "M74,73 C54,90 46,90 26,73",
];

function ReidHandoff({ playing, step }) {
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
      {REID_PATHS.map((d, i) => {
        const active = playing ? step > i : true;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="#ffffff"
            strokeWidth="1.2"
            strokeDasharray="2.4 2.4"
            vectorEffect="non-scaling-stroke"
            style={{
              opacity: active ? 0.75 : 0.12,
              transition: "opacity 0.5s ease",
              animation: active ? "dash-flow 0.9s linear infinite" : "none",
            }}
          />
        );
      })}
      {REID_NODES.map((n, i) => {
        const lit = playing ? step >= i : true;
        return (
          <g key={i} style={{ opacity: lit ? 1 : 0.25, transition: "opacity 0.4s ease" }}>
            <circle cx={n.x} cy={n.y} r="1.4" fill="#ffffff" vectorEffect="non-scaling-stroke" />
            <circle cx={n.x} cy={n.y} r="3.2" fill="none" stroke="#ffffff" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
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
  ["Spec", "#specs"],
  ["Stack", "#roadmap"],
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
  const [reidPlaying, setReidPlaying] = useState(false);
  const [reidStep, setReidStep] = useState(0);
  const [globeOpen, setGlobeOpen] = useState(false);
  const click = useCallback(() => { if (!muted) siren.playClick(); }, [muted]);

  useEffect(() => {
    const t = () => setClock(new Date().toLocaleTimeString("en-GB", { hour12: false }) + " IST");
    t();
    const i = setInterval(t, 1000);
    return () => clearInterval(i);
  }, []);

  // Re-ID reconstruction: step the target camera-to-camera on a timer.
  useEffect(() => {
    if (!reidPlaying) return;
    if (reidStep >= REID_HOPS.length - 1) {
      const done = setTimeout(() => setReidPlaying(false), 1400);
      return () => clearTimeout(done);
    }
    const adv = setTimeout(() => setReidStep((s) => s + 1), 1100);
    return () => clearTimeout(adv);
  }, [reidPlaying, reidStep]);

  const runReid = useCallback(() => {
    click();
    setReidStep(0);
    setReidPlaying(true);
  }, [click]);

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
          <Link to="/" onClick={click} className="flex items-center">
            <BrandMark
              size={30}
              subtitle="Cloud surveillance analytics"
              wordClass="text-[13px] font-semibold tracking-tight text-white"
              subClass="text-[10px] font-medium text-white/55"
            />
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            {NAV.map(([label, href]) => (
              <a key={href} href={href} onClick={click} className="link-underline px-3 py-2 text-[12px] font-medium text-white/70 transition-colors hover:text-white">
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <ThemeToggle className="hidden sm:grid" />
            <button
              onClick={() => setMuted((m) => !m)}
              className="press hidden h-9 w-9 place-items-center border border-white/40 text-white/70 hover:bg-white hover:text-black sm:grid"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <Link
              to="/login"
              onClick={click}
              className="press hidden items-center gap-1.5 border border-white/40 px-3.5 py-2 text-[11px] font-bold text-white/80 hover:bg-white hover:text-black sm:flex"
            >
              <LogIn size={12} />
              Login
            </Link>
            <Link
              to="/register"
              onClick={click}
              title="Enrol authorized personnel — operator sign-in required"
              className="press hidden items-center gap-1.5 border border-white/40 px-3.5 py-2 text-[11px] font-bold text-white/80 hover:bg-white hover:text-black sm:flex"
            >
              <UserPlus size={12} />
              Register
            </Link>
            <Link
              to="/console"
              onClick={click}
              className="press group hidden items-center gap-2 border border-white bg-white px-4 py-2 text-[11px] font-bold text-black hover:bg-black hover:text-white sm:flex"
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
            <Link to="/login" onClick={() => setMenu(false)} className="mt-2 block border border-white/40 px-4 py-2 text-center text-[11px] font-bold text-white/80">
              Login
            </Link>
            <Link to="/register" onClick={() => setMenu(false)} className="mt-2 block border border-white/40 px-4 py-2 text-center text-[11px] font-bold text-white/80">
              Register personnel
            </Link>
            <Link to="/console" onClick={() => setMenu(false)} className="mt-2 block border border-white bg-white px-4 py-2 text-center text-[11px] font-bold text-black">
              Launch Console
            </Link>
          </div>
        )}
      </nav>

      {/* ── HERO ────────────────────────────────────────────────── */}
      <header className="relative mx-auto max-w-6xl px-6 pb-20 pt-32 sm:pt-40">
        <div className="grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <div>
            <Reveal className="inline-flex items-center gap-2.5 border border-white/25 px-3 py-1 font-mono text-[10.5px] text-white/55">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              SIH 2026 · PS-26187 · SSB Alpine Ridge Frontier
            </Reveal>

            <Reveal as="h1" delay={70} className="font-display mt-6 text-[2.7rem] font-light leading-[1.04] tracking-tight text-white sm:text-6xl [text-wrap:balance]">
              Intelligent Border<br />
              <span className="italic">Video Analytics</span>
            </Reveal>

            <Reveal as="p" delay={140} className="mt-6 max-w-lg text-[15px] leading-relaxed text-white/65">
              A software-defined surveillance platform that extracts actionable
              intelligence from the CCTV a sector already runs — detection,
              tracking, cross-camera re-identification, virtual-fence intrusion and
              tamper-evident evidence — with no dedicated hardware, delivered as
              scalable cloud software.
            </Reveal>

            <Reveal delay={210} className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/console"
                onClick={click}
                className="press group flex items-center gap-2 border border-white bg-white px-6 py-3 text-[12px] font-bold text-black hover:bg-black hover:text-white"
              >
                Open Command Console
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
              </Link>
              <a href="#operations" onClick={click} className="press border border-white/40 px-6 py-3 text-[12px] font-bold text-white/80 hover:border-white hover:text-white">
                See it running
              </a>
            </Reveal>

            <Reveal delay={280} className="mt-10 grid max-w-md grid-cols-2 gap-x-6 gap-y-5 border-t border-white/12 pt-6">
              <Spec label="Delivery" value="Cloud software · no field hardware" />
              <Spec label="Detection & tracking" value="YOLOv8n + ByteTrack" />
              <Spec label="Cross-camera Re-ID" value="OSNet embeddings" />
              <Spec label="Evidence integrity" value="SHA-256 chained" />
            </Reveal>
          </div>

          {/* 3D earth globe */}
          <Reveal delay={120} className="w-full justify-self-stretch">
            <button
              type="button"
              onClick={() => { click(); setGlobeOpen(true); }}
              className="press group relative mx-auto block aspect-square w-full max-w-md lg:max-w-none"
              aria-label="Open the 3D sector terrain model"
            >
              <Corners />
              <div className="absolute inset-0">
                <WhenVisible fallback={<GlobeShell />}>
                  <Suspense fallback={<GlobeShell />}>
                    <SentinelGlobe3D onTap={() => { click(); setGlobeOpen(true); }} />
                  </Suspense>
                </WhenVisible>
              </div>
              <span className="pointer-events-none absolute left-3 top-3 font-sans text-[9px] font-medium text-white/40">
                Sector 4-B · terrain model
              </span>
              <span className="pointer-events-none absolute bottom-3 right-3 hidden font-mono text-[9px] text-white/45 sm:block">
                32.04°N&nbsp;·&nbsp;75.40°E
              </span>
              <span className="pointer-events-none absolute inset-x-0 bottom-3 text-center font-sans text-[9px] font-medium text-white/50 transition-colors sm:text-white/0 sm:group-hover:text-white/55">
                tap to open 3D terrain →
              </span>
            </button>
          </Reveal>
        </div>
      </header>

      {/* ── NATIONAL CONTEXT ────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-black py-20 sm:py-24">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 lg:grid-cols-[1fr_1.05fr]">
          <Reveal>
            <Eyebrow>Scale of the problem</Eyebrow>
            <h2 className="font-display mt-4 text-3xl font-light leading-[1.08] tracking-tight sm:text-[2.5rem] [text-wrap:balance]">
              One 42&nbsp;km sector of a 3,323&nbsp;km line.
            </h2>
            <p className="mt-5 max-w-md text-[14px] leading-relaxed text-white/65">
              Sentinel's MVP is modelled on the SSB Alpine Ridge Frontier stretch of the
              India–Pakistan border using recorded and simulated feeds. Nothing about
              the pipeline is sector-specific — the same correlation, transit-time
              estimator and hash-chained evidence store are provisioned per sector
              from a single tenant, no new install per site.
            </p>
            <div className="mt-8 grid max-w-md grid-cols-3 gap-6 border-t border-white/12 pt-6">
              <Stat value={3323} label="km land border" />
              <Stat value={6} label="sectors mapped" />
              <Stat value={1} label="tenant, all sectors" />
            </div>
          </Reveal>

          <Reveal delay={120} className="relative w-full justify-self-stretch border border-white/15 bg-black">
            <Corners />
            <div className="flex items-center justify-between border-b border-white/12 px-3 py-2 font-mono text-[10px] text-white/45">
              <span>Sector 4-B · Camera Topology Model</span>
              <span className="flex items-center gap-1.5 text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" /> Simulation
              </span>
            </div>
            <div className="relative">
              <IsometricTerrain mode="hero" />
              <span className="pointer-events-none absolute left-3 bottom-3 font-sans text-[8.5px] font-medium text-white/35">
                FOV model · 5 nodes
              </span>
              <div className="animate-drift absolute left-3 top-3 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm">
                <div className="font-mono text-[8.5px] text-white/45">Detector</div>
                <div className="font-mono text-base font-semibold">YOLOv8n</div>
              </div>
              <div className="animate-drift absolute right-3 top-10 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: "-2s" }}>
                <div className="font-mono text-[8.5px] text-white/45">Classes</div>
                <div className="font-mono text-base font-semibold">person · vehicle</div>
              </div>
              <div className="animate-drift absolute bottom-3 right-4 border border-white/20 bg-black/80 px-2.5 py-1.5 backdrop-blur-sm" style={{ animationDelay: "-4s" }}>
                <div className="font-mono text-[8.5px] text-white/45">Feed source</div>
                <div className="font-mono text-base font-semibold text-amber-400">Recorded</div>
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
      </section>

      {/* ── CAPABILITIES ────────────────────────────────────────── */}
      <section className="border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow>Platform capabilities · PS-26187</Eyebrow>
            <h2 className="font-display mt-4 max-w-2xl text-3xl font-light leading-tight tracking-tight sm:text-[2.75rem]">
              Eight analytics capabilities on the CCTV a sector already has.
            </h2>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/50">
              IBVAP is software-defined — no dedicated surveillance hardware, no new
              cameras. Eight analytics capabilities run on the feeds a sector
              already has.
            </p>
          </Reveal>
          <div className="mt-14 grid gap-px border border-white/12 bg-white/12 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [
                "Human detection & tracking",
                "YOLOv8n person detection with ByteTrack persistent IDs — every subject held across the frame and written to the event log.",
                "YOLOv8n + ByteTrack",
              ],
              [
                "Vehicle detection & classification",
                "COCO vehicle classes — car, truck, bus, two-wheeler — detected and tracked per camera, with type recorded on the incident.",
                "YOLOv8n · COCO vehicles",
              ],
              [
                "Virtual-fence intrusion detection",
                "Operator-drawn no-go zones and boundary lines. A crossing — or a wrong-direction crossing — opens an incident immediately.",
                "Zone + direction rules",
              ],
              [
                "Real-time alerts & event logging",
                "Detections, zone events and operator actions stream to an append-only event log with push alerts to the watchfloor.",
                "Append-only log · push",
              ],
              [
                "Face detection & recognition",
                "Face crops are pulled from person tracks and matched against a watch-list gallery to flag named individuals as they cross a camera.",
                "Face gallery · cosine match",
              ],
              [
                "Automatic number-plate recognition",
                "Plate OCR reads number plates off the tracked vehicle stream and matches them against vehicle-of-interest and blacklist tables.",
                "Plate OCR · watch-list",
              ],
              [
                "Suspicious-activity detection",
                "Loitering, abandoned-object and crowd-formation detectors raise an incident on behaviour, not just position.",
                "Behaviour analytics · 0–100",
              ],
              [
                "Night-time movement detection",
                "Low-light image enhancement and thermal fusion keep detection reliable through dusk, night and zero-light conditions.",
                "Low-light + thermal fusion",
              ],
            ].map(([t, d, tag], i) => (
              <Reveal key={t} delay={i * 55} className="flex flex-col bg-black p-7">
                <span className="font-mono text-[11px] text-white/35">0{i + 1}</span>
                <h3 className="mt-3 text-[15px] font-bold leading-snug">{t}</h3>
                <p className="mt-2 flex-1 text-[12.5px] leading-relaxed text-white/60">{d}</p>
                <div className="mt-5 border-t border-white/12 pt-3 text-[11px] text-white/40">
                  {tag}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

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
              ["02", "Alarm fatigue", "Wildlife, weather and vegetation trip motion alerts repeatedly through the night. Operators learn to ignore the buzzer.", "motion-only", "nuisance triggers dominate legacy alerts"],
              ["03", "Unusable evidence", "Footage pulled days later has no verifiable chain of custody and routinely fails Section 65B scrutiny in court.", "0", "verifiable chain, pre-Sentinel"],
            ].map(([n, t, d, stat, statlabel]) => (
              <Reveal key={n} className="bg-black p-7">
                <div className="font-mono text-[11px] text-white/35">{n}</div>
                <h3 className="mt-3 text-lg font-bold">{t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-white/60">{d}</p>
                <div className="mt-6 flex items-baseline gap-2 border-t border-white/12 pt-4">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{stat}</span>
                  <span className="font-mono text-[10px] text-white/40">{statlabel}</span>
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
            <span className="font-mono text-[11px] text-white/45">YOLOv8n (COCO · person/vehicle) · ByteTrack · cloud inference</span>
          </Reveal>

          <Reveal delay={60} className="mt-4 flex items-center gap-2 border border-white/12 bg-white/[0.03] px-3 py-2 font-mono text-[10px] text-white/45">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            Mode: dual-angle synchronized simulation (VisDrone + recorded testbed feeds) · target pipeline: hosted cloud
          </Reveal>

          <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-4">
              {/* focus tile — enlarged active detection + live track readout */}
              <Reveal className="grid gap-0 border border-white/15 sm:grid-cols-[1.5fr_1fr]">
                <div className="relative">
                  <video src="/data/cross_cam_real_demo_web.mp4" autoPlay loop muted playsInline className="aspect-video w-full object-cover grayscale contrast-110 brightness-105" />
                  <Corners />
                  <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2.5 font-mono text-[9px]">
                    <div className="flex items-start justify-between">
                      <span className="flex items-center gap-1 bg-black/70 px-1.5 py-0.5 text-white/70"><span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> SIM · FOCUS</span>
                      <span className="bg-black/70 px-1.5 py-0.5 text-white/60">CAM_BRAVO · Perimeter fence</span>
                    </div>
                    <span className="w-fit border border-red-500/60 bg-red-950/50 px-1.5 py-0.5 text-red-300">TRACK #14 · in restricted zone</span>
                  </div>
                </div>
                <div className="border-t border-white/12 p-4 font-mono sm:border-l sm:border-t-0">
                  <div className="text-[10px] text-white/45">Active tracks · ByteTrack</div>
                  <table className="mt-3 w-full text-[11px]">
                    <thead>
                      <tr className="text-white/35">
                        <th className="pb-1.5 text-left font-normal">ID</th>
                        <th className="pb-1.5 text-left font-normal">Class</th>
                        <th className="pb-1.5 text-right font-normal">Conf</th>
                        <th className="pb-1.5 text-right font-normal">Dwell</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LIVE_TRACKS.map((t) => (
                        <tr key={t.id} className={`border-t border-white/8 ${t.zone ? "text-red-300" : "text-white/75"}`}>
                          <td className="py-1.5 tabular-nums">#{t.id}</td>
                          <td className="py-1.5">{t.cls}</td>
                          <td className="py-1.5 text-right tabular-nums">{t.conf.toFixed(2)}</td>
                          <td className="py-1.5 text-right tabular-nums">{t.dwell}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-3 border-t border-white/12 pt-2 text-[9.5px] text-white/35">
                    1 of 4 tracks inside the 100m buffer
                  </div>
                </div>
              </Reveal>

              <div className="grid gap-4 sm:grid-cols-3">
                <VideoTile src="/data/ibvap_real_yolo_demo.mp4" cam="CAM_ALPHA" note="Ingress approach" detected="PERSON 0.87" />
                <VideoTile src="/data/detected_output_web.mp4" cam="CAM_CHARLIE" note="Checkpoint lane" />
                <VideoTile src="/data/people_surveillance_web.mp4" cam="CAM_DELTA" note="Patrol road" />
              </div>
            </div>

            <Reveal delay={120} className="space-y-6 border border-white/12 p-5">
              <div className="font-mono text-[10.5px] text-white/45">Sector telemetry</div>
              <Ring value={78} label="Scan coverage" sub="perimeter sweep" />
              <Ring value={64} label="Channel load" sub="6 of 8 active" />
              <div className="space-y-5 border-t border-white/12 pt-5">
                <Spark label="Detections / min" value="24" data={[9, 12, 10, 16, 13, 19, 15, 23, 18, 27, 22, 24]} />
                <Spark label="Restricted-zone entries" value="3" data={[0, 1, 0, 1, 1, 0, 2, 1, 2, 1, 3, 3]} />
                <Spark label="Curfew-window detections" value="6" data={[0, 0, 1, 0, 2, 1, 1, 3, 2, 4, 3, 6]} />
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
              An OSNet / ResNet appearance encoder (torchreid) turns each person
              detection into a 512-d embedding. When a track leaves one camera, Sentinel
              estimates a transit-time window from last-known distance and speed, then
              matches on arrival by cosine similarity. Validated on a synchronized
              two-angle testbed — viewpoint and lighting shifts remain the main error
              source.
            </p>
          </Reveal>

          <Reveal delay={40} className="mt-4 flex items-center gap-2 border border-white/12 bg-white/[0.03] px-3 py-2 font-mono text-[10px] text-white/45">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-white" />
            Validated pair: CAM_ALPHA ↔ CAM_BRAVO (2 synchronized angles) · the four-node trail below illustrates the target camera topology
          </Reveal>

          {/* control strip */}
          <Reveal delay={80} className="mt-12 flex flex-wrap items-center gap-4 border-y border-white/12 py-3">
            <button
              onClick={reidPlaying ? () => setReidPlaying(false) : runReid}
              className="press flex items-center gap-2 border border-white bg-white px-4 py-2 font-mono text-[11px] font-bold text-black hover:bg-black hover:text-white"
            >
              {reidPlaying ? <Pause size={13} /> : <Play size={13} />}
              {reidPlaying ? "Pause" : "Reconstruct trail"}
            </button>
            <button onClick={() => { click(); setReidStep(0); setReidPlaying(false); }} className="press grid h-9 w-9 place-items-center border border-white/40 text-white/60 hover:border-white hover:text-white">
              <RotateCcw size={13} />
            </button>
            <div className="flex items-center gap-2 font-mono text-[10.5px] text-white/45">
              <Crosshair size={12} /> Target Alpha-7
              <span className="text-white/25">·</span>
              hop {Math.min(reidStep + 1, REID_HOPS.length)} / {REID_HOPS.length}
            </div>
            <div className="ml-auto font-mono text-[10.5px] text-white/45">
              blind corridor <span className="text-white">1.33 s</span> · 40 frames
            </div>
          </Reveal>

          {/* 2×2 camera grid with animated handoff arcs */}
          <Reveal delay={120} className="relative mt-6">
            <ReidHandoff playing={reidPlaying} step={reidStep} />
            <div className="grid gap-x-12 gap-y-12 sm:grid-cols-2">
              {REID_HOPS.map((hop, i) => {
                const reached = reidPlaying ? reidStep >= i : true;
                const isHere = reidPlaying && reidStep === i;
                return (
                  <div
                    key={hop.cam}
                    className={`relative border bg-black transition-all duration-500 ${
                      isHere ? "border-white shadow-[0_0_0_2px_rgba(255,255,255,0.25)]" : reached ? "border-white/40" : "border-white/12 opacity-45"
                    }`}
                  >
                    <div className="flex items-center justify-between border-b border-white/12 px-3 py-2 font-mono text-[10px] text-white/50">
                      <span>{hop.cam} · {hop.role}</span>
                      <span>t = {hop.t}</span>
                    </div>
                    <div className="relative">
                      <video src={hop.src} autoPlay loop muted playsInline className="aspect-video w-full object-cover grayscale contrast-110 brightness-125" />
                      {isHere && <Corners />}
                      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2 font-mono text-[9px]">
                        <div className="flex justify-end">
                          {hop.match != null && reached && (
                            <span className="bg-black/75 px-1.5 py-0.5 text-white/80">match {hop.match}%</span>
                          )}
                        </div>
                        <span className={`w-fit px-1.5 py-0.5 ${reached ? "border border-white bg-white text-black" : "border border-white/40 bg-black/70 text-white/60"}`}>
                          <Crosshair size={9} className="mr-1 inline" />
                          {i === 0 ? "TARGET ALPHA-7 · acquired" : reached ? "TARGET ALPHA-7 · re-identified" : "awaiting arrival"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Reveal>

          <Reveal delay={160} className="mt-6 grid grid-cols-2 gap-px border border-white/12 bg-white/12 sm:grid-cols-4">
            {[
              ["91.4%", "Peak match · testbed"],
              ["512-d", "Embedding"],
              ["0.82", "Cosine threshold"],
              ["2-cam", "Validated topology"],
            ].map(([v, l]) => (
              <div key={l} className="bg-black px-4 py-5 text-center">
                <div className="font-mono text-xl font-semibold tabular-nums">{v}</div>
                <div className="mt-1.5 font-mono text-[9.5px] text-white/40">{l}</div>
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
              <div className="font-mono text-[10.5px] text-white/45">Contributing factors</div>
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
              <span className={`border px-3 py-1 font-mono text-[10px] font-bold ${band.cls}`}>
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
                    <div className="mt-1 font-mono text-[10px] text-white/40">/ 100</div>
                  </div>
                </div>
              </div>
              <p className="font-mono text-[11px] text-white/60">{band.action}</p>
            </Reveal>
          </div>

          {/* perimeter terrain */}
          <Reveal delay={100} className="mt-4 border border-white/15 bg-black">
            <div className="flex items-center gap-3 border-b border-white/12 px-3 py-2 font-mono text-[10px] text-white/45">
              <span className="text-white">Perimeter overlay</span>
              <span>·</span><span>Restricted geofence · River Bend</span>
            </div>
            <div className="relative">
              <IsometricTerrain mode="perimeter" />
              <div className={`absolute right-4 top-4 w-64 border bg-black/85 backdrop-blur-sm ${score >= 75 ? "border-red-500/50" : "border-white/20"}`}>
                <Corners />
                <div className={`flex items-center justify-between border-b px-3 py-2 font-mono text-[10.5px] font-bold ${score >= 75 ? "border-red-500/30 text-red-400" : "border-white/12 text-white/70"}`}>
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${score >= 75 ? "bg-red-500 animate-pulse" : "bg-white/40"}`} />
                    {score >= 75 ? "Zone breach" : "Zone monitor"}
                  </span>
                  <span>{band.label}</span>
                </div>
                <div className="space-y-1.5 px-3 py-2.5 font-mono text-[10.5px] text-white/55">
                  <div className="flex justify-between"><span>Zone</span><span className="text-white">Alpha-Red · River Bend</span></div>
                  <div className="flex justify-between"><span>Camera</span><span className="text-white">CAM-03</span></div>
                  <div className="flex justify-between"><span>Threat</span><span className={score >= 75 ? "text-red-400" : score >= 45 ? "text-amber-400" : "text-white"}>{score} / 100</span></div>
                  {/* dwell progress bar */}
                  <div className="pt-1">
                    <div className="flex justify-between"><span>Dwell</span><span className="text-white">{score >= 75 ? "00:41 / 01:00" : "—"}</span></div>
                    <div className="mt-1 h-1 w-full bg-white/10">
                      <div className={`h-full transition-all ${score >= 75 ? "bg-red-500" : score >= 45 ? "bg-amber-400" : "bg-white/40"}`} style={{ width: `${Math.min(score, 100)}%` }} />
                    </div>
                  </div>
                </div>
                {/* entities inside the zone */}
                <div className={`border-t px-3 py-2 font-mono text-[10px] ${score >= 75 ? "border-red-500/20" : "border-white/10"}`}>
                  <div className="text-white/40">Entities in zone · {score >= 45 ? 2 : 0}</div>
                  <div className={`mt-1.5 space-y-1 ${score >= 45 ? "" : "hidden"}`}>
                    <div className={`flex items-center justify-between ${score >= 75 ? "text-red-300" : "text-white/70"}`}>
                      <span>· TRACK #14 · person</span><span className="tabular-nums">0.87</span>
                    </div>
                    <div className="flex items-center justify-between text-white/60">
                      <span>· TRACK #22 · person</span><span className="tabular-nums">0.71</span>
                    </div>
                  </div>
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
              SHA-256 chain the moment it is written. Break one capsule and every
              capsule after it fails verification — and a Section 65B certificate
              template is generated alongside it. This is hash-chaining for
              tamper-evidence, not a blockchain or distributed ledger.
            </p>
          </Reveal>

          <Reveal delay={100} className="mt-12 overflow-x-auto">
            <div className="flex min-w-max items-stretch gap-0">
              {[
                ["BLOCK #1", "sector::genesis", "00:00:00"],
                ["BLOCK #2", "a4f8…bb04", "20:14:07"],
                ["BLOCK #3", "c1d9…7e22", "20:14:08"],
                ["BLOCK #4", "9f02…41ac", "20:15:33", "INC-0042"],
                ["BLOCK #5", "e77b…0d90", "20:22:10"],
              ].map(([b, h, t, incident], i, arr) => (
                <div key={b} className="flex items-stretch">
                  <div className="w-52 border border-white/15 p-4">
                    <div className="flex items-center justify-between font-mono text-[10px]">
                      <span className="text-white/50">{b}</span>
                      <span className="text-white/35">{t}</span>
                    </div>
                    <div className="mt-3 font-mono text-[11px] text-white/70">HASH</div>
                    <div className="font-mono text-[12px] text-white">{h}</div>
                    {incident && (
                      <div className="mt-3 border border-white/20 px-1.5 py-0.5 font-mono text-[9px] text-white/50">
                        {incident} sealed
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
            <span className="flex items-center gap-2 text-white"><Check size={13} /> Hash-chain integrity: verified</span>
            <span>5 capsules sealed</span>
            <span>Genesis: sentinel::genesis::ssb-alpine-ridge::2026</span>
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
              ["01", "Connect existing CCTV", "RTSP / ONVIF feeds point at the tenant — no new cameras. YOLOv8n detects people and vehicles frame by frame in our cloud."],
              ["02", "Track & re-identify", "ByteTrack holds IDs within a camera; OSNet appearance embeddings re-identify the same subject on the next camera across a blind gap."],
              ["03", "Detect intrusion & score", "Virtual-fence and direction rules flag the crossing; an additive 0–100 threat score itemises every contributing rule."],
              ["04", "Alert, log & seal", "The watchfloor is alerted in real time, the event log is appended, and evidence is sealed into a SHA-256 chain with a Section 65B certificate."],
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

      {/* ── ENGINEERING SPECIFICATION ───────────────────────────── */}
      <section id="specs" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow>Engineering specification</Eyebrow>
            <p className="mt-4 max-w-xl text-[13px] leading-relaxed text-white/50">
              Architectural facts, not measured field metrics. IBVAP is a software
              layer over standard CCTV — the MVP is validated on public datasets
              (MOT17, VisDrone) and recorded synchronized two-angle feeds, not on
              live tactical cameras.
            </p>
          </Reveal>
          <Reveal delay={80} className="mt-10 grid grid-cols-2 divide-y divide-white/12 border-y border-white/15 md:grid-cols-4 md:divide-y-0 md:divide-x">
            {[
              { v: "YOLOv8n", l: "Detection", s: "COCO person + vehicle classes · cloud-hosted inference" },
              { v: "ByteTrack", l: "Tracking", s: "per-camera multi-object track IDs" },
              { v: "OSNet", l: "Cross-camera Re-ID", s: "512-d cosine · 2-camera synchronized testbed" },
              { v: "SHA-256", l: "Evidence + 65B", s: "sequential hash-chained capsules · certificate template" },
            ].map((m) => (
              <div key={m.l} className="p-6 md:p-8">
                <div className="font-mono text-xl font-semibold leading-tight sm:text-2xl">{m.v}</div>
                <div className="mt-2 font-mono text-[11px] text-white">{m.l}</div>
                <div className="mt-1 font-mono text-[10px] leading-relaxed text-white/40">{m.s}</div>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ── ROADMAP ─────────────────────────────────────────────── */}
      <section id="roadmap" className="scroll-mt-20 border-t border-white/10 bg-black py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-6">
          <Reveal>
            <Eyebrow>The full stack</Eyebrow>
            <h2 className="font-display mt-4 max-w-2xl text-3xl font-light leading-tight tracking-tight sm:text-[2.75rem]">
              Every capability, in one platform.
            </h2>
          </Reveal>
          <div className="mt-14 grid gap-px border border-white/12 bg-white/12 md:grid-cols-2">
            <Reveal className="bg-black p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Detection &amp; tracking
              </div>
              <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-white/70">
                {[
                  "Human + vehicle detection and tracking (YOLOv8n + ByteTrack, cloud-hosted)",
                  "Face detection & watch-list recognition on person tracks",
                  "ANPR — plate OCR with vehicle-of-interest and blacklist matching",
                  "Dual-camera OSNet cross-camera Re-ID across synchronized angles",
                  "Night-time detection via low-light enhancement + thermal fusion",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Check size={14} className="mt-0.5 shrink-0 text-white" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
            <Reveal delay={100} className="bg-black p-8">
              <div className="flex items-center gap-2 font-mono text-[10px] text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" />
                Intelligence &amp; evidence
              </div>
              <ul className="mt-6 space-y-3 text-[13px] leading-relaxed text-white/70">
                {[
                  "Virtual-fence intrusion & wrong-direction rules with real-time alerts",
                  "Suspicious-activity analytics — loitering, abandoned object, crowd formation",
                  "Explainable rule-based threat correlator (0–100) + append-only event log",
                  "SHA-256 hash-chained evidence capsules + Section 65B template",
                  "C2 integration hooks, SSO, per-agency RBAC and audit export",
                ].map((x) => (
                  <li key={x} className="flex gap-2.5">
                    <Check size={14} className="mt-0.5 shrink-0 text-white" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
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
              className="press group inline-flex items-center gap-2.5 border border-white bg-white px-8 py-3.5 text-[12px] font-bold text-black hover:bg-black hover:text-white"
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
            <Link to="/console" onClick={click} className="press border border-white bg-white px-3 py-1.5 font-bold text-black hover:bg-black hover:text-white">
              Console →
            </Link>
          </div>
        </div>
      </footer>

      {globeOpen && (
        <Suspense fallback={null}>
          <BorderTerrainModal onClose={() => setGlobeOpen(false)} />
        </Suspense>
      )}
    </div>
  );
}
