import { useEffect, useRef, useState } from "react";
import { Smartphone, Laptop, Wifi, WifiOff, Loader2, RotateCcw, Info, AlertTriangle } from "lucide-react";
import api from "../lib/api.js";
import { playBeep } from "../lib/liveCamera.jsx";
import { detectFrame, loadYoloSession, PERSON_CLASS_ID } from "../lib/clientYolo.js";

/* ═══════════════════════════════════════════════════════════════════════
   PhoneCameraPanel — attach a real camera as a live source: a phone
   (Android/iOS "IP Webcam" or "DroidCam") over Wi-Fi, or this laptop's own
   built-in/USB webcam.

   Phone sources: the backend's cv2 worker (core/vision/multi_stream_engine)
   opens the phone's MJPEG URL itself and streams the annotated result back
   via GET /stream/{id}. These genuinely need the backend running — only
   Python/OpenCV can pull an arbitrary MJPEG URL and run YOLO on it.

   Laptop webcam: needs NO backend at all. The browser opens the camera
   itself via getUserMedia (a real permission prompt — this is the "tap to
   open the webcam" moment) and runs the actual YOLOv8n model directly in
   the page (ONNX Runtime Web, see lib/clientYolo.js) — detection starts
   the instant the feed opens, boxes are drawn on an overlay canvas, and a
   detected person flips the same THREAT ALERT banner + beep used
   elsewhere. Works identically on the local dev server and the deployed
   Vercel build.
   ═══════════════════════════════════════════════════════════════════════ */

const SLOTS = [
  { id: "CAM_ALPHA", label: "CAM_ALPHA", sub: "Checkpost Alpha Gate" },
  { id: "CAM_BRAVO", label: "CAM_BRAVO", sub: "BOP Bravo Perimeter" },
];

// "network" sources are phone apps reached over Wi-Fi by URL, opened by the
// backend's own cv2 worker. "device" is this browser's own webcam — opened
// and detected on entirely client-side, no backend involved.
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
      <>Tap this button — your browser will prompt for camera access. Allow it and detection starts immediately, no backend needed.</>,
      <>If your laptop has more than one camera, pick between them below once access is granted.</>,
    ],
  },
];

export default function PhoneCameraPanel() {
  const [slot, setSlot] = useState("CAM_ALPHA");
  const [sourceId, setSourceId] = useState("ipwebcam");
  const [ip, setIp] = useState("");
  const [webcamDevices, setWebcamDevices] = useState([]); // populated post-permission
  const [webcamDeviceId, setWebcamDeviceId] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | connecting | live | error
  const [status, setStatus] = useState(null);
  const [imgKey, setImgKey] = useState(0); // bust the <img> MJPEG src on (re)connect
  const pollRef = useRef(null);
  const prevAlert = useRef(false); // tracks false->true so playBeep() fires once per fresh catch
  const videoElRef = useRef(null); // <video> fed by getUserMedia — the client-side detection source
  const overlayRef = useRef(null); // canvas the detection boxes are drawn onto, sized to match the video
  const mediaStreamRef = useRef(null);
  const detectLoopId = useRef(0); // bumped on every stop so a stale in-flight loop iteration no-ops

  const source = SOURCES.find((a) => a.id === sourceId) || SOURCES[0];
  const isDevice = source.kind === "device";

  // Network sources accept a bare IP ("192.168.1.42"), IP:port, or a full
  // pasted URL (e.g. "http://192.168.2.7:8080/") — auto-normalizes and appends
  // the stream path (/video) so raw browser URLs stream correctly in OpenCV.
  const buildUrl = (raw, selectedSource) => {
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
  const resolvedUrl = isDevice ? "" : buildUrl(ip, source);

  const stopPoll = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
  };

  const stopBrowserWebcam = () => {
    detectLoopId.current += 1; // invalidates any in-flight detect loop
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    const canvas = overlayRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(
    () => () => {
      stopPoll();
      stopBrowserWebcam();
    },
    []
  );

  const poll = (camId) => {
    stopPoll();
    prevAlert.current = false;
    pollRef.current = setInterval(async () => {
      const res = await api.getCameraSource(camId);
      if (!res || Object.keys(res).length === 0) {
        setPhase("error");
        setStatus({ error: "Backend unreachable — run it locally (python run_ecosystem.py) and point VITE_API_BASE at it." });
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

  const connect = async () => {
    if (!resolvedUrl) return;
    setPhase("connecting");
    setStatus(null);
    setImgKey((k) => k + 1);
    await api.setCameraSource(slot, resolvedUrl);
    poll(slot);
  };

  // Draws this frame's detection boxes onto the overlay canvas, at the
  // video's native resolution — CSS (object-contain, matched sizing)
  // scales both elements identically so boxes line up on screen.
  const drawOverlay = (dets, video) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of dets) {
      const isPerson = d.cls === PERSON_CLASS_ID;
      const color = isPerson ? "#ef4444" : "#22c55e";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(d.x1, d.y1, d.x2 - d.x1, d.y2 - d.y1);
      const label = `${d.label.toUpperCase()} ${(d.score * 100).toFixed(0)}%`;
      ctx.font = "bold 14px monospace";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(d.x1, Math.max(0, d.y1 - 18), tw + 8, 18);
      ctx.fillStyle = "#000";
      ctx.fillText(label, d.x1 + 4, Math.max(13, d.y1 - 5));
    }
  };

  // The client-side detection loop: grab a frame, run the real YOLOv8n
  // model on it (ONNX Runtime Web), draw boxes, flip the alert state on a
  // person catch, then immediately schedule the next pass — self-paced by
  // however long inference actually takes, no fixed interval needed.
  const runDetectionLoop = (session, myLoopId) => {
    const tick = async () => {
      if (detectLoopId.current !== myLoopId) return; // superseded by a stop/restart
      const video = videoElRef.current;
      if (!video || video.readyState < 2) {
        requestAnimationFrame(tick);
        return;
      }
      const t0 = performance.now();
      let dets = [];
      try {
        dets = await detectFrame(session, video);
      } catch {
        /* transient inference hiccup — keep the loop alive */
      }
      if (detectLoopId.current !== myLoopId) return;

      drawOverlay(dets, video);
      const fps = Math.round((1000 / Math.max(1, performance.now() - t0)) * 10) / 10;
      const personSeen = dets.some((d) => d.cls === PERSON_CLASS_ID);
      if (personSeen && !prevAlert.current) playBeep();
      prevAlert.current = personSeen;
      setPhase("live");
      setStatus({
        connected: true,
        fps,
        alert: personSeen,
        alert_status: personSeen ? "BREACH: PERSON DETECTED (client-side YOLOv8n)" : "PERIMETER SECURE",
      });

      requestAnimationFrame(tick);
    };
    tick();
  };

  // Opens the BROWSER's own webcam (a real permission prompt — this is what
  // makes "tap to open the laptop webcam" actually true) and runs detection
  // on it immediately, fully client-side — no backend call at all.
  const startBrowserWebcam = async (deviceId) => {
    try {
      stopPoll();
      const constraints = { video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stopBrowserWebcam();
      mediaStreamRef.current = stream;
      const video = videoElRef.current;
      video.srcObject = stream;
      await video.play();

      // Labels are only populated once permission is granted — refresh the
      // picker now so a multi-camera laptop can switch away from the wrong one.
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setWebcamDevices(all.filter((d) => d.kind === "videoinput"));
        const activeId = stream.getVideoTracks()[0]?.getSettings()?.deviceId || deviceId || null;
        setWebcamDeviceId(activeId);
      } catch {
        /* enumerateDevices blocked/unsupported — single default camera still works fine */
      }

      setPhase("connecting");
      setStatus({ connected: false, fps: 0, alert: false, alert_status: "Loading YOLOv8n model…" });
      prevAlert.current = false;

      const session = await loadYoloSession();
      const myLoopId = detectLoopId.current; // startBrowserWebcam bumped this via stopBrowserWebcam() above
      runDetectionLoop(session, myLoopId);
    } catch (err) {
      stopBrowserWebcam();
      setPhase("error");
      const denied = err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError");
      setStatus({
        error: denied
          ? "Webcam permission denied — allow camera access in the browser's address-bar prompt and tap again."
          : `Could not open the browser webcam: ${err?.message || err}`,
      });
    }
  };

  const disconnect = async () => {
    stopPoll();
    stopBrowserWebcam();
    setPhase("idle");
    setStatus(null);
    if (!isDevice) await api.setCameraSource(slot, "demo");
  };

  const switchSlot = (id) => {
    if (phase !== "idle") disconnect();
    setSlot(id);
  };

  // Tapping the laptop-webcam source opens it immediately — no separate
  // Connect click needed, since there's no address to type first.
  const pickSource = (s) => {
    setSourceId(s.id);
    if (s.kind === "device") {
      startBrowserWebcam(webcamDeviceId);
    } else if (isDevice) {
      // leaving the device source mid-stream
      stopBrowserWebcam();
      setPhase("idle");
      setStatus(null);
    }
  };

  const switchWebcamDevice = (id) => {
    if (id !== webcamDeviceId) startBrowserWebcam(id);
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
          <h3 className="font-mono text-sm font-bold text-white">Attach Phone Camera · Real Detection</h3>
        </div>
        <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold ${badge.cls}`}>
          <Badge size={12} className={badge.spin ? "animate-spin" : ""} />
          {badge.text}
        </span>
      </div>
      <p className="text-xs text-white/55">
        Unlike the ingress simulator above, this runs the real YOLOv8n model on a real camera feed and draws the
        detection boxes live — genuine inference, not a canned clip.{" "}
        {isDevice && <span className="text-white/40">(laptop webcam runs entirely in your browser — no backend needed)</span>}
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
            <>
              <div>{source.steps.length + 1}. Phone &amp; laptop on the <strong className="text-white/80">same Wi-Fi</strong>.</div>
              <div>
                {source.steps.length + 2}. Backend must be running: <code className="text-emerald-300">python run_ecosystem.py</code>, and the
                console started with <code className="text-emerald-300">VITE_API_BASE</code> pointed at it.
              </div>
            </>
          )}
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
          <div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
            {webcamDevices.length > 1 ? (
              <>
                <span className="shrink-0 font-mono text-[10px] text-white/40">Camera:</span>
                {webcamDevices.map((d, i) => (
                  <button
                    key={d.deviceId}
                    onClick={() => switchWebcamDevice(d.deviceId)}
                    className={`shrink-0 rounded-lg border px-3 py-2 font-mono text-[11px] font-semibold transition-colors ${
                      webcamDeviceId === d.deviceId ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-300" : "border-white/12 text-white/55 hover:text-white"
                    }`}
                  >
                    {d.label || `Camera ${i + 1}`}
                  </button>
                ))}
              </>
            ) : (
              <span className="font-mono text-[10px] text-white/35">Tap the source button above (or Connect) to grant camera access.</span>
            )}
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
            onClick={isDevice ? () => startBrowserWebcam(webcamDeviceId) : connect}
            disabled={!isDevice && !resolvedUrl}
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
          Will connect to <span className="text-white/55">{isDevice ? "your browser's webcam (grants access on tap, no backend involved)" : resolvedUrl}</span>
        </div>
      )}

      {status?.error && phase === "error" && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 font-mono text-[11px] text-red-300">{status.error}</div>
      )}
      {status?.error && phase !== "error" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 font-mono text-[11px] text-amber-300">
          {isDevice ? status.error : `Waiting for the phone… (${status.error})`}
        </div>
      )}

      {/* threat banner — shows the moment YOLO catches something on this feed */}
      {phase === "live" && status?.alert && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-[12px] font-bold text-red-300 animate-pulse">
          <AlertTriangle size={14} className="shrink-0" />
          THREAT ALERT{status.alert_status ? ` — ${status.alert_status}` : ""}
        </div>
      )}

      {/* live preview — the phone path shows the backend's own annotated MJPEG;
          the laptop-webcam path shows the local <video> with a boxes overlay
          drawn straight from the client-side YOLO pass. Both stay mounted so
          the getUserMedia stream / video ref never gets torn down mid-session. */}
      <div
        className={`relative overflow-hidden rounded-xl border bg-black transition-colors ${phase === "idle" ? "hidden" : ""} ${
          status?.alert ? "border-red-500/60" : "border-white/12"
        }`}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoElRef} muted playsInline className={isDevice ? "aspect-video w-full object-contain" : "hidden"} />
        <canvas ref={overlayRef} className={isDevice ? "pointer-events-none absolute inset-0 h-full w-full object-contain" : "hidden"} />
        {!isDevice && phase !== "idle" && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img key={imgKey} src={`${api.streamUrl(slot)}?k=${imgKey}`} className="aspect-video w-full object-contain" />
        )}
        {status?.alert && <div className="pointer-events-none absolute inset-0 border-4 border-red-500/70 animate-pulse" />}
      </div>
    </div>
  );
}
