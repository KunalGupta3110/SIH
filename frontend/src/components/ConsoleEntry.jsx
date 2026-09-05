import { useEffect, useState } from "react";
import { Shield } from "lucide-react";

// Brief system-initializing moment shown once before the Common Operating
// Picture mounts. This is deliberately NOT the landing page's cinematic
// splash — no 3D, no narrative beats, just a short tactical boot sequence
// (a handful of status lines + a progress bar) that an operator can skip.
// Total runtime is capped so it never becomes an obstacle to getting to
// the console.
const BOOT_LINES = [
  "ESTABLISHING SENTINEL UPLINK…",
  "SYNCHRONIZING EDGE CAMERA MESH…",
  "LOADING INCIDENT LEDGER…",
  "COMMON OPERATING PICTURE READY",
];

const LINE_INTERVAL_MS = 380;
const HOLD_AFTER_MS = 450;

export default function ConsoleEntry({ onComplete }) {
  const [lineCount, setLineCount] = useState(0);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (lineCount >= BOOT_LINES.length) {
      const t = setTimeout(() => finish(), HOLD_AFTER_MS);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setLineCount((n) => n + 1), LINE_INTERVAL_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineCount]);

  function finish() {
    if (closing) return;
    setClosing(true);
    setTimeout(onComplete, 180);
  }

  const progressPct = Math.round((lineCount / BOOT_LINES.length) * 100);

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#060a10] transition-opacity duration-200 ${
        closing ? "opacity-0" : "opacity-100"
      }`}
      style={{ fontFamily: "'IBM Plex Mono', monospace" }}
      role="button"
      tabIndex={0}
      onClick={finish}
      onKeyDown={finish}
      aria-label="Skip startup sequence"
    >
      <div className="flex items-center gap-2 mb-6">
        <div className="flex h-9 w-9 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10">
          <Shield size={17} className="text-sky-400" />
        </div>
        <div className="text-sm font-semibold tracking-[0.2em] text-white">IBVAP SENTINEL</div>
      </div>

      <div className="w-[300px] space-y-1.5 text-[11px]">
        {BOOT_LINES.map((line, i) => (
          <div
            key={line}
            className={`transition-opacity duration-200 ${i < lineCount ? "opacity-100" : "opacity-0"} ${
              i === BOOT_LINES.length - 1 ? "text-emerald-400" : "text-slate-400"
            }`}
          >
            {i < lineCount ? "✓" : " "} {line}
          </div>
        ))}
      </div>

      <div className="mt-5 h-[2px] w-[300px] overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full bg-sky-500 transition-all duration-300 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      <div className="mt-4 text-[9.5px] uppercase tracking-widest text-slate-600">
        click or press any key to skip
      </div>
    </div>
  );
}
