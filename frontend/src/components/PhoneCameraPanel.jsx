import { useEffect, useRef, useState } from "react";
import { Smartphone, Wifi, WifiOff, Loader2, RotateCcw, Info } from "lucide-react";
import api from "../lib/api.js";

/* ═══════════════════════════════════════════════════════════════════════
   PhoneCameraPanel — attach a real phone (Android "IP Webcam" app) as a
   live camera source. The URL is sent to the FastAPI backend, which points
   its existing YOLOv8 + ByteTrack worker (core/vision/multi_stream_engine)
   at it and streams the ANNOTATED result back as MJPEG — real detection
   boxes drawn server-side on your own camera feed, not a canned demo clip.

   Requires the backend running locally (`python run_ecosystem.py`) on the
   same Wi-Fi as the phone, with the console's VITE_API_BASE pointed at it.
   Not reachable from the public Vercel deploy — that build has no backend
   to attach a camera to.
   ═══════════════════════════════════════════════════════════════════════ */

const SLOTS = [
  { id: "CAM_ALPHA", label: "CAM_ALPHA", sub: "Checkpost Alpha Gate" },
  { id: "CAM_BRAVO", label: "CAM_BRAVO", sub: "BOP Bravo Perimeter" },
];

export default function PhoneCameraPanel() {
  const [slot, setSlot] = useState("CAM_ALPHA");
  const [url, setUrl] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | connecting | live | error
  const [status, setStatus] = useState(null);
  const [imgKey, setImgKey] = useState(0); // bust the <img> MJPEG src on (re)connect
  const pollRef = useRef(null);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPoll, []);

  const poll = (camId) => {
    stopPoll();
    pollRef.current = setInterval(async () => {
      const res = await api.getCameraSource(camId);
      if (!res || Object.keys(res).length === 0) {
        setPhase("error");
        setStatus({ error: "Backend unreachable — run it locally (python run_ecosystem.py) on the same Wi-Fi as your phone." });
        stopPoll();
        return;
      }
      setStatus(res);
      setPhase(res.connected ? "live" : "connecting");
    }, 1500);
  };

  const connect = async () => {
    const clean = url.trim();
    if (!clean) return;
    setPhase("connecting");
    setStatus(null);
    setImgKey((k) => k + 1);
    await api.setCameraSource(slot, clean);
    poll(slot);
  };

  const disconnect = async () => {
    stopPoll();
    setPhase("idle");
    setStatus(null);
    await api.setCameraSource(slot, "demo");
  };

  const switchSlot = (id) => {
    if (phase !== "idle") disconnect();
    setSlot(id);
  };

  const badge =
    phase === "live"
      ? { icon: Wifi, text: `Live · ${status?.fps ?? "—"} FPS`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" }
      : phase === "connecting"
      ? { icon: Loader2, text: "Connecting…", cls: "border-amber-500/40 bg-amber-500/10 text-amber-300", spin: true }
      : phase === "error"
      ? { icon: WifiOff, text: "Unreachable", cls: "border-red-500/40 bg-red-500/10 text-red-300" }
      : { icon: Smartphone, text: "Not attached", cls: "border-white/15 bg-white/[0.04] text-white/50" };
  const Badge = badge.icon;

  return (
    <div className="rounded-2xl border border-white/12 bg-[#000000] p-4 space-y-3.5 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Smartphone size={16} className="text-white" />
          <h3 className="font-mono text-sm font-bold text-white">Attach Phone Camera · Real Backend Detection</h3>
        </div>
        <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold ${badge.cls}`}>
          <Badge size={12} className={badge.spin ? "animate-spin" : ""} />
          {badge.text}
        </span>
      </div>
      <p className="text-xs text-white/55">
        Unlike the ingress simulator above, this runs the real YOLOv8n + ByteTrack pipeline on your own phone's live feed and
        draws the detection boxes server-side — genuine inference, not a canned clip.
      </p>

      {/* setup instructions */}
      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
        <Info size={13} className="mt-0.5 shrink-0 text-white/40" />
        <div className="space-y-0.5">
          <div>1. Install <strong className="text-white/80">IP Webcam</strong> (free, Android) → open it → <strong className="text-white/80">Start server</strong>.</div>
          <div>2. Phone &amp; laptop on the <strong className="text-white/80">same Wi-Fi</strong>. Copy the URL it shows (e.g. <code className="text-emerald-300">http://192.168.1.42:8080/video</code>).</div>
          <div>3. Backend must be running locally: <code className="text-emerald-300">python run_ecosystem.py</code>, and the console started with <code className="text-emerald-300">VITE_API_BASE</code> pointed at it.</div>
        </div>
      </div>

      {/* slot + url + controls */}
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <div className="flex shrink-0 gap-1.5">
          {SLOTS.map((s) => (
            <button
              key={s.id}
              onClick={() => switchSlot(s.id)}
              title={s.sub}
              className={`rounded-lg border px-2.5 py-2 font-mono text-[11px] font-semibold transition-colors ${
                slot === s.id ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-white/12 text-white/55 hover:text-white"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="http://192.168.1.42:8080/video"
          className="flex-1 rounded-lg border border-white/12 bg-black px-3 py-2 font-mono text-[12px] text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none"
        />
        {phase === "idle" || phase === "error" ? (
          <button
            onClick={connect}
            disabled={!url.trim()}
            className="shrink-0 rounded-lg bg-white px-4 py-2 font-mono text-[12px] font-bold text-black transition-colors hover:bg-emerald-300 disabled:opacity-40"
          >
            Connect
          </button>
        ) : (
          <button
            onClick={disconnect}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/15 px-4 py-2 font-mono text-[12px] font-semibold text-white/70 transition-colors hover:text-white"
          >
            <RotateCcw size={12} /> Use demo feed
          </button>
        )}
      </div>

      {status?.error && phase === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 font-mono text-[11px] text-red-300">{status.error}</div>
      )}
      {status?.error && phase !== "error" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 font-mono text-[11px] text-amber-300">
          Waiting for the phone… ({status.error})
        </div>
      )}

      {/* live preview — the backend's own MJPEG stream, annotated with real detections */}
      {phase !== "idle" && (
        <div className="overflow-hidden rounded-xl border border-white/12 bg-black">
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img key={imgKey} src={`${api.streamUrl(slot)}?k=${imgKey}`} className="aspect-video w-full object-contain" />
        </div>
      )}
    </div>
  );
}
