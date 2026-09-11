import { useEffect, useRef, useState } from "react";
import { Smartphone, Laptop, Wifi, WifiOff, Loader2, RotateCcw, Info, AlertTriangle } from "lucide-react";
import api from "../lib/api.js";
import { playBeep } from "../lib/liveCamera.jsx";

/* ═══════════════════════════════════════════════════════════════════════
   PhoneCameraPanel — attach a real camera as a live source: a phone
   (Android/iOS "IP Webcam" or "DroidCam") over Wi-Fi, or this laptop's own
   built-in/USB webcam. The source is sent to the FastAPI backend, which
   points its existing YOLOv8 + ByteTrack worker (core/vision/
   multi_stream_engine) at it and streams the ANNOTATED result back as
   MJPEG — real detection boxes drawn server-side, not a canned demo clip.

   Requires the backend running locally (`python run_ecosystem.py`), with
   the console's VITE_API_BASE pointed at it — the phone must additionally
   share the laptop's Wi-Fi (not needed for the laptop-webcam option, since
   OpenCV opens the device directly on the same machine as the backend).
   Not reachable from the public Vercel deploy — that build has no backend
   to attach a camera to.
   ═══════════════════════════════════════════════════════════════════════ */

const SLOTS = [
  { id: "CAM_ALPHA", label: "CAM_ALPHA", sub: "Checkpost Alpha Gate" },
  { id: "CAM_BRAVO", label: "CAM_BRAVO", sub: "BOP Bravo Perimeter" },
];

// "network" sources are phone apps reached over Wi-Fi by URL. "device" is
// a webcam OpenCV can open directly on the SAME machine as the backend —
// no IP needed, just a device index.
const SOURCES = [
  {
    id: "ipwebcam",
    kind: "network",
    label: "IP Webcam",
    platform: "Android",
    port: 8080,
    path: "/video",
    steps: [
      <>Install <strong className="text-white/80">IP Webcam</strong> (free, Android) → open it → scroll down → <strong className="text-white/80">Start server</strong>.</>,
      <>It shows an address like <code className="text-emerald-300">192.168.1.42:8080</code> — type just the IP below.</>,
    ],
  },
  {
    id: "droidcam",
    kind: "network",
    label: "DroidCam",
    platform: "Android & iOS",
    port: 4747,
    path: "/video",
    steps: [
      <>Install <strong className="text-white/80">DroidCam</strong> (Android or iOS) → open it.</>,
      <>It shows a Wi-Fi IP and a 4-digit port (usually <code className="text-emerald-300">4747</code>) — no PC client / DroidCam OBS driver needed, this reads its plain video feed directly.</>,
    ],
  },
  {
    id: "webcam",
    kind: "device",
    label: "This Laptop's Webcam",
    platform: "Built-in / USB",
    steps: [
      <>No app needed — the backend opens the webcam attached to <strong className="text-white/80">this machine</strong> directly.</>,
      <>If it opens the wrong camera, try device <strong className="text-white/80">1</strong> or <strong className="text-white/80">2</strong> below.</>,
    ],
  },
];

export default function PhoneCameraPanel() {
  const [slot, setSlot] = useState("CAM_ALPHA");
  const [sourceId, setSourceId] = useState("ipwebcam");
  const [ip, setIp] = useState("");
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [phase, setPhase] = useState("idle"); // idle | connecting | live | error
  const [status, setStatus] = useState(null);
  const [imgKey, setImgKey] = useState(0); // bust the <img> MJPEG src on (re)connect
  const pollRef = useRef(null);
  const prevAlert = useRef(false); // tracks false->true so playBeep() fires once per fresh catch

  const source = SOURCES.find((a) => a.id === sourceId) || SOURCES[0];
  const isDevice = source.kind === "device";

  // Network sources accept a bare IP ("192.168.1.42"), IP:port, or a full
  // pasted URL (e.g. "http://192.168.2.7:8080/") — auto-normalizes and appends
  // the stream path (/video) so raw browser URLs stream correctly in OpenCV.
  const buildUrl = (raw, selectedSource) => {
    if (selectedSource.kind === "device") return String(deviceIndex);
    let val = (raw || "").trim();
    if (!val) return "";

    val = val.replace(/\/+$/, "");

    if (/^https?:\/\//i.test(val)) {
      try {
        const parsed = new URL(val);
        if (!parsed.pathname || parsed.pathname === "/" || parsed.pathname === "/index.html") {
          parsed.pathname = selectedSource.path || "/video";
        }
        return parsed.toString();
      } catch {
        if (!val.includes("/video") && !val.includes("/videofeed") && !val.includes("/mjpegfeed")) {
          return `${val}${selectedSource.path || "/video"}`;
        }
        return val;
      }
    }

    if (/^rtsp:\/\//i.test(val)) return val;

    if (val.includes("/")) {
      const parts = val.split("/");
      const hostPart = parts[0];
      const restPath = "/" + parts.slice(1).join("/");
      const hasPort = /:\d+$/.test(hostPart);
      const hostWithPort = hasPort ? hostPart : `${hostPart}:${selectedSource.port || 8080}`;
      return `http://${hostWithPort}${restPath}`;
    }

    const hasPort = /:\d+$/.test(val);
    const hostWithPort = hasPort ? val : `${val}:${selectedSource.port || 8080}`;
    return `http://${hostWithPort}${selectedSource.path || "/video"}`;
  };
  const resolvedUrl = buildUrl(ip, source);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };
  useEffect(() => stopPoll, []);

  const poll = (camId) => {
    stopPoll();
    prevAlert.current = false;
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
      // beep on the false->true edge only — a fresh catch, not every poll while it stays true
      if (res.alert && !prevAlert.current) playBeep();
      prevAlert.current = !!res.alert;
    }, 1500);
  };

  const connect = async (selectedSource = source, urlOverride) => {
    const url = urlOverride ?? (selectedSource.kind === "device" ? String(deviceIndex) : buildUrl(ip, selectedSource));
    if (!url) return;
    setPhase("connecting");
    setStatus(null);
    setImgKey((k) => k + 1);
    await api.setCameraSource(slot, url);
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

  // Tapping a device source (the laptop webcam) opens it immediately — no
  // separate Connect click needed, since there's no address to type first.
  const pickSource = (s) => {
    setSourceId(s.id);
    if (s.kind === "device") connect(s, String(deviceIndex));
  };

  const pickDeviceIndex = (i) => {
    setDeviceIndex(i);
    if (isDevice && phase !== "idle") connect(source, String(i));
  };

  const badge =
    phase === "live" && status?.alert
      ? { icon: AlertTriangle, text: "THREAT ALERT", cls: "border-red-500/60 bg-red-500/15 text-red-300 animate-pulse" }
      : phase === "live"
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
        Unlike the ingress simulator above, this runs the real YOLOv8n + ByteTrack pipeline on a real camera feed and
        draws the detection boxes server-side — genuine inference, not a canned clip.
      </p>

      {/* source picker */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[10px] text-white/40 mr-1">Source:</span>
        {SOURCES.map((s) => {
          const Icon = s.kind === "device" ? Laptop : Smartphone;
          return (
            <button
              key={s.id}
              onClick={() => pickSource(s)}
              title={s.kind === "device" ? "Tap to open this laptop's webcam" : s.platform}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] font-semibold transition-colors ${
                sourceId === s.id ? "border-white/40 bg-white/[0.08] text-white" : "border-white/12 text-white/50 hover:text-white"
              }`}
            >
              <Icon size={11} />
              {s.label} <span className="text-white/35">· {s.platform}</span>
            </button>
          );
        })}
      </div>

      {/* setup instructions — dynamic per selected source */}
      <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-white/60">
        <Info size={13} className="mt-0.5 shrink-0 text-white/40" />
        <div className="space-y-0.5">
          {source.steps.map((s, i) => (
            <div key={i}>{i + 1}. {s}</div>
          ))}
          {!isDevice && (
            <div>{source.steps.length + 1}. Phone &amp; laptop on the <strong className="text-white/80">same Wi-Fi</strong>.</div>
          )}
          <div>
            {source.steps.length + (isDevice ? 1 : 2)}. Backend must be running locally: <code className="text-emerald-300">python run_ecosystem.py</code>, and the
            console started with <code className="text-emerald-300">VITE_API_BASE</code> pointed at it.
          </div>
        </div>
      </div>

      {/* slot + source input + controls */}
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
        {isDevice ? (
          <div className="flex flex-1 items-center gap-1.5">
            <span className="font-mono text-[10px] text-white/40">Device:</span>
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => pickDeviceIndex(i)}
                className={`rounded-lg border px-3 py-2 font-mono text-[12px] font-semibold transition-colors ${
                  deviceIndex === i ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-white/12 text-white/55 hover:text-white"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        ) : (
          <input
            value={ip}
            onChange={(e) => setIp(e.target.value)}
            placeholder={`192.168.1.42  (or paste a full URL)`}
            className="flex-1 rounded-lg border border-white/12 bg-black px-3 py-2 font-mono text-[12px] text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none"
          />
        )}
        {phase === "idle" || phase === "error" ? (
          <button
            onClick={connect}
            disabled={!resolvedUrl}
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
      {(isDevice || ip.trim()) && (
        <div className="-mt-1 font-mono text-[10px] text-white/35">
          Will connect to <span className="text-white/55">{isDevice ? `webcam device ${resolvedUrl}` : resolvedUrl}</span>
        </div>
      )}

      {status?.error && phase === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 font-mono text-[11px] text-red-300">{status.error}</div>
      )}
      {status?.error && phase !== "error" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 font-mono text-[11px] text-amber-300">
          Waiting for the phone… ({status.error})
        </div>
      )}

      {/* threat banner — shows the moment YOLO catches something on this feed */}
      {phase === "live" && status?.alert && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-[12px] font-bold text-red-300 animate-pulse">
          <AlertTriangle size={14} className="shrink-0" />
          THREAT ALERT{status.alert_status ? ` — ${status.alert_status}` : ""}
        </div>
      )}

      {/* live preview — the backend's own MJPEG stream, annotated with real detections */}
      {phase !== "idle" && (
        <div className={`relative overflow-hidden rounded-xl border bg-black transition-colors ${status?.alert ? "border-red-500/60" : "border-white/12"}`}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <img key={imgKey} src={`${api.streamUrl(slot)}?k=${imgKey}`} className="aspect-video w-full object-contain" />
          {status?.alert && (
            <div className="pointer-events-none absolute inset-0 border-4 border-red-500/70 animate-pulse" />
          )}
        </div>
      )}
    </div>
  );
}
