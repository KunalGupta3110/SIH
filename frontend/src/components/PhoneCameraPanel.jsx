import { useEffect, useRef, useState } from "react";
import { Smartphone, Laptop, Wifi, WifiOff, Loader2, RotateCcw, Info, AlertTriangle, ScrollText, UserPlus, Trash2 } from "lucide-react";
import api from "../lib/api.js";
import { playBeep } from "../lib/liveCamera.jsx";
import { detectFrame, loadYoloSession, PERSON_CLASS_ID } from "../lib/clientYolo.js";
import { updateTracks } from "../lib/clientTracker.js";
import { isLowLight, enhanceLowLight } from "../lib/clientLowLight.js";
import { DEFAULT_ZONE, centroidInZone, crossingDirection } from "../lib/clientZones.js";
import { checkAbandonedObjects, checkLoitering, checkCrowdFormation } from "../lib/clientBehavior.js";
import { logEvent, getEventLog, clearEventLog } from "../lib/clientEventLog.js";
import { readPlate, isOcrBusy } from "../lib/clientANPR.js";
import { detectAndDescribe, enrollFace, matchDescriptor, getGallery, removeFromGallery } from "../lib/clientFace.js";

/* ═══════════════════════════════════════════════════════════════════════
   PhoneCameraPanel — attach a real camera as a live source: a phone
   (Android/iOS "IP Webcam" or "DroidCam") over Wi-Fi, or this laptop's own
   built-in/USB webcam.

   Phone sources: the backend's cv2 worker (core/vision/multi_stream_engine)
   opens the phone's MJPEG URL itself, running the full server-side
   pipeline (tracking, zones, face gallery, ANPR, abandoned-object,
   low-light) on it.

   Laptop webcam: needs NO backend at all. Every one of those same
   capabilities runs a second time, independently, entirely in the
   browser:
     - YOLOv8n detection (ONNX Runtime Web, lib/clientYolo.js)
     - persistent track IDs (lib/clientTracker.js — greedy IOU, not
       ByteTrack, but real multi-frame identity)
     - a no-go zone + wrong-direction crossing (lib/clientZones.js)
     - abandoned-object / loitering / crowd behavior (lib/clientBehavior.js)
     - face detection + recognition against a browser-local gallery
       (lib/clientFace.js — face-api.js, a real dedicated face net)
     - plate OCR + hotlist matching (lib/clientANPR.js — Tesseract.js)
     - low-light detection + enhancement (lib/clientLowLight.js)
     - an append-only event log in localStorage (lib/clientEventLog.js)
   Works identically on the local dev server and the deployed Vercel
   build, since none of it touches a server.
   ═══════════════════════════════════════════════════════════════════════ */

const SLOTS = [
  { id: "CAM_ALPHA", label: "CAM_ALPHA", sub: "Checkpost Alpha Gate" },
  { id: "CAM_BRAVO", label: "CAM_BRAVO", sub: "BOP Bravo Perimeter" },
];

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

const VEHICLE_LABELS = new Set(["car", "truck", "bus", "motorcycle", "bicycle"]);
const ALERT_STICKY_MS = 3500; // how long a fired alert stays shown/beeping before fading if nothing new happens

export default function PhoneCameraPanel() {
  const [slot, setSlot] = useState("CAM_ALPHA");
  const [sourceId, setSourceId] = useState("ipwebcam");
  const [ip, setIp] = useState("");
  const [webcamDevices, setWebcamDevices] = useState([]);
  const [webcamDeviceId, setWebcamDeviceId] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | connecting | live | error
  const [status, setStatus] = useState(null);
  const [imgKey, setImgKey] = useState(0);
  const [plateInfo, setPlateInfo] = useState(null);
  const [faceInfo, setFaceInfo] = useState(null);
  const [showLog, setShowLog] = useState(false);
  const [logEntries, setLogEntries] = useState([]);
  const [enrollName, setEnrollName] = useState("");
  const [enrollRole, setEnrollRole] = useState("authorized");
  const [enrolling, setEnrolling] = useState(false);
  const [enrollMsg, setEnrollMsg] = useState("");
  const [gallery, setGallery] = useState([]);

  const pollRef = useRef(null);
  const prevAlert = useRef(false);
  const videoElRef = useRef(null);
  const canvasRef = useRef(null); // now the VISIBLE canvas: draws the (possibly enhanced) frame + every overlay
  const mediaStreamRef = useRef(null);
  const detectLoopId = useRef(0);
  const lastOcrAtRef = useRef(0);
  const lastFaceAtRef = useRef(0);
  const bannerRef = useRef({ text: null, until: 0 });

  const source = SOURCES.find((a) => a.id === sourceId) || SOURCES[0];
  const isDevice = source.kind === "device";

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
    detectLoopId.current += 1;
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    bannerRef.current = { text: null, until: 0 };
    setPlateInfo(null);
    setFaceInfo(null);
  };

  useEffect(
    () => () => {
      stopPoll();
      stopBrowserWebcam();
    },
    []
  );

  useEffect(() => {
    if (!showLog) return;
    const refresh = () => setLogEntries(getEventLog().slice(-40).reverse());
    refresh();
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [showLog]);

  useEffect(() => {
    if (isDevice) setGallery(getGallery());
  }, [isDevice, enrollMsg]);

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

  // Raises (or refreshes) the sticky on-screen banner + logs the event —
  // shared by every detector below so they all feed the same alert surface.
  const raiseAlert = (text, logType, logDetail, nowMs) => {
    bannerRef.current = { text, until: nowMs + ALERT_STICKY_MS };
    logEvent({ type: logType, detail: logDetail ?? text, camera: slot });
  };

  const maybeRunAnpr = (tracks, frameCanvas, nowMs) => {
    if (nowMs - lastOcrAtRef.current < 1500 || isOcrBusy()) return;
    lastOcrAtRef.current = nowMs;

    const vehicle = tracks.find((t) => VEHICLE_LABELS.has(t.label));
    let source2d = frameCanvas;
    if (vehicle) {
      const [x1, y1, x2, y2] = vehicle.bbox;
      const cw = Math.max(1, x2 - x1);
      const cropY = y1 + (y2 - y1) * 0.5;
      const ch = Math.max(1, y2 - cropY);
      const crop = document.createElement("canvas");
      crop.width = cw;
      crop.height = ch;
      crop.getContext("2d").drawImage(frameCanvas, x1, cropY, cw, ch, 0, 0, cw, ch);
      source2d = crop;
    }

    readPlate(source2d).then((result) => {
      if (!result || !result.cleanedText || result.cleanedText.length < 4) return;
      setPlateInfo(result);
      if (result.hotlistHit) {
        raiseAlert(`ANPR HOTLIST HIT: ${result.cleanedText}`, "ANPR_HOTLIST_HIT", `Plate ${result.cleanedText} — ${result.hotlistHit}`, performance.now());
      } else if (result.isPlateFormat) {
        logEvent({ type: "ANPR_READ", plate: result.cleanedText, camera: slot });
      }
    });
  };

  const maybeRunFace = (video, nowMs) => {
    if (nowMs - lastFaceAtRef.current < 1200) return;
    lastFaceAtRef.current = nowMs;
    detectAndDescribe(video)
      .then((detection) => {
        if (!detection) {
          setFaceInfo(null);
          return;
        }
        const match = matchDescriptor(detection.descriptor);
        setFaceInfo(match);
        if (match?.role === "watchlist") {
          raiseAlert(`FACE MATCH: ${match.name.toUpperCase()} (WATCHLIST)`, "FACE_WATCHLIST_MATCH", `Face match ${match.name} (dist ${match.distance})`, performance.now());
        }
      })
      .catch(() => {});
  };

  const drawFrame = (ctx, w, h, tracks, dark) => {
    // zone outline (near-full-frame no-go rectangle + its midline, the
    // simplified "wrong-direction" tripwire)
    ctx.strokeStyle = "rgba(56,189,248,0.55)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.strokeRect(DEFAULT_ZONE.x1 * w, DEFAULT_ZONE.y1 * h, (DEFAULT_ZONE.x2 - DEFAULT_ZONE.x1) * w, (DEFAULT_ZONE.y2 - DEFAULT_ZONE.y1) * h);
    ctx.setLineDash([]);

    for (const t of tracks) {
      const [x1, y1, x2, y2] = t.bbox;
      const isPerson = t.cls === PERSON_CLASS_ID;
      const isObject = t.label === "backpack" || t.label === "handbag" || t.label === "suitcase";
      const color = isPerson ? "#ef4444" : isObject ? "#facc15" : "#22c55e";
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      const label = `${t.label.toUpperCase()} #${t.id} ${(t.score * 100).toFixed(0)}%`;
      ctx.font = "bold 14px monospace";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = color;
      ctx.fillRect(x1, Math.max(0, y1 - 18), tw + 8, 18);
      ctx.fillStyle = "#000";
      ctx.fillText(label, x1 + 4, Math.max(13, y1 - 5));

      if (t.history.length > 1) {
        ctx.strokeStyle = "rgba(250,204,21,0.6)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(t.history[0][0], t.history[0][1]);
        for (const p of t.history) ctx.lineTo(p[0], p[1]);
        ctx.stroke();
      }
    }

    if (dark) {
      ctx.font = "13px monospace";
      ctx.fillStyle = "#facc15";
      ctx.fillText("LOW-LIGHT ENHANCEMENT: ON", 10, h - 10);
    }
  };

  const runDetectionLoop = (session, myLoopId) => {
    const tick = async () => {
      if (detectLoopId.current !== myLoopId) return;
      const video = videoElRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        requestAnimationFrame(tick);
        return;
      }
      const t0 = performance.now();
      const w = video.videoWidth;
      const h = video.videoHeight;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(video, 0, 0, w, h);

      const dark = isLowLight(ctx, w, h);
      if (dark) enhanceLowLight(ctx, w, h);

      let dets = [];
      try {
        dets = await detectFrame(session, canvas, { width: w, height: h });
      } catch {
        /* transient inference hiccup — keep the loop alive */
      }
      if (detectLoopId.current !== myLoopId) return;

      const nowMs = performance.now();
      const tracks = updateTracks(dets, nowMs);

      // re-draw the frame fresh (detectFrame doesn't mutate `canvas`, but
      // tracker/overlay drawing below does) then layer every overlay on top
      ctx.drawImage(video, 0, 0, w, h);
      if (dark) enhanceLowLight(ctx, w, h);

      let zoneBreach = false;
      for (const t of tracks) {
        if (centroidInZone(t.centroid, DEFAULT_ZONE, w, h)) {
          zoneBreach = true;
          const dir = crossingDirection(t, DEFAULT_ZONE, h);
          if (dir === "OUTBOUND") {
            raiseAlert(`WRONG-DIRECTION CROSSING: ${t.label.toUpperCase()} #${t.id}`, "DIRECTION_VIOLATION", `${t.label} #${t.id} crossed outbound (wrong direction)`, nowMs);
          }
        }
      }
      if (zoneBreach && (!bannerRef.current.text || nowMs > bannerRef.current.until)) {
        raiseAlert("ZONE INTRUSION DETECTED", "ZONE_INTRUSION", "Track inside the no-go zone", nowMs);
      }

      for (const obj of checkAbandonedObjects(tracks, nowMs)) {
        raiseAlert(`ABANDONED ${obj.label.toUpperCase()} #${obj.id}`, "ABANDONED_OBJECT", `${obj.label} #${obj.id} unattended ${obj.stationarySec}s`, nowMs);
      }
      for (const t of checkLoitering(tracks, nowMs)) {
        raiseAlert(`LOITERING: PERSON #${t.id}`, "LOITERING", `person #${t.id} loitering ${t.loiterSec}s`, nowMs);
      }
      const crowd = checkCrowdFormation(tracks);
      if (crowd) raiseAlert(`CROWD FORMATION (${crowd.count})`, "GROUP_CLUSTER", `${crowd.count} people clustered`, nowMs);

      maybeRunAnpr(tracks, canvas, nowMs);
      maybeRunFace(video, nowMs);

      drawFrame(ctx, w, h, tracks, dark);

      const personSeen = tracks.some((t) => t.cls === PERSON_CLASS_ID);
      if (personSeen && zoneBreach && !prevAlert.current) playBeep();
      prevAlert.current = personSeen && zoneBreach;

      const activeAlertText = bannerRef.current.text && nowMs < bannerRef.current.until ? bannerRef.current.text : null;
      const fps = Math.round((1000 / Math.max(1, performance.now() - t0)) * 10) / 10;
      setPhase("live");
      setStatus({
        connected: true,
        fps,
        alert: !!activeAlertText,
        alert_status: activeAlertText || "PERIMETER SECURE",
      });

      requestAnimationFrame(tick);
    };
    tick();
  };

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

      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        setWebcamDevices(all.filter((d) => d.kind === "videoinput"));
        const activeId = stream.getVideoTracks()[0]?.getSettings()?.deviceId || deviceId || null;
        setWebcamDeviceId(activeId);
      } catch {
        /* enumerateDevices blocked/unsupported — single default camera still works fine */
      }

      setPhase("connecting");
      setStatus({ connected: false, fps: 0, alert: false, alert_status: "Loading detection models…" });
      prevAlert.current = false;

      const session = await loadYoloSession();
      const myLoopId = detectLoopId.current;
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

  const pickSource = (s) => {
    setSourceId(s.id);
    if (s.kind === "device") {
      startBrowserWebcam(webcamDeviceId);
    } else if (isDevice) {
      stopBrowserWebcam();
      setPhase("idle");
      setStatus(null);
    }
  };

  const switchWebcamDevice = (id) => {
    if (id !== webcamDeviceId) startBrowserWebcam(id);
  };

  const handleEnroll = async () => {
    if (!enrollName.trim() || !videoElRef.current || phase !== "live") return;
    setEnrolling(true);
    setEnrollMsg("");
    try {
      const personId = `${enrollName.trim().toUpperCase().replace(/\s+/g, "_")}-${Date.now().toString(36)}`;
      const result = await enrollFace(videoElRef.current, personId, enrollName.trim(), enrollRole);
      setEnrollMsg(result ? `Enrolled "${enrollName.trim()}" (${enrollRole}) from the current frame.` : "No face found in the current frame — look straight at the camera and try again.");
      if (result) setEnrollName("");
    } finally {
      setEnrolling(false);
    }
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
        <div className="flex items-center gap-1.5">
          {isDevice && (
            <button
              onClick={() => setShowLog((v) => !v)}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors ${
                showLog ? "border-white/40 bg-white/[0.08] text-white" : "border-white/12 text-white/50 hover:text-white"
              }`}
            >
              <ScrollText size={12} /> Event Log
            </button>
          )}
          <span className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 font-mono text-[11px] font-semibold ${badge.cls}`}>
            <Badge size={12} className={badge.spin ? "animate-spin" : ""} />
            {badge.text}
          </span>
        </div>
      </div>
      <p className="text-xs text-white/55">
        Unlike the ingress simulator above, this runs real detection on a real camera feed — genuine inference, not a canned clip.{" "}
        {isDevice && (
          <span className="text-white/40">
            (tracking · zone + direction · abandoned-object/loitering/crowd · face match · ANPR · low-light — all in your browser, no backend)
          </span>
        )}
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

      {/* setup instructions */}
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

      {/* threat banner */}
      {phase === "live" && status?.alert && (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/50 bg-red-500/10 px-3 py-2 font-mono text-[12px] font-bold text-red-300 animate-pulse">
          <AlertTriangle size={14} className="shrink-0" />
          THREAT ALERT{status.alert_status ? ` — ${status.alert_status}` : ""}
        </div>
      )}

      {/* ANPR / face readouts — only meaningful for the client-side device path */}
      {isDevice && phase === "live" && (plateInfo || faceInfo) && (
        <div className="flex flex-wrap gap-2 font-mono text-[11px]">
          {plateInfo && (
            <span
              className={`rounded-lg border px-2.5 py-1 ${
                plateInfo.hotlistHit ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-white/15 bg-white/[0.04] text-white/60"
              }`}
            >
              PLATE: {plateInfo.cleanedText || "…"} {plateInfo.hotlistHit ? `— HOTLIST (${plateInfo.hotlistHit})` : plateInfo.isPlateFormat ? "" : "(unreadable/no format match)"}
            </span>
          )}
          {faceInfo && (
            <span className={`rounded-lg border px-2.5 py-1 ${faceInfo.role === "watchlist" ? "border-red-500/50 bg-red-500/10 text-red-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
              FACE: {faceInfo.name} ({faceInfo.role})
            </span>
          )}
        </div>
      )}

      {/* face enrollment — client-side gallery, localStorage-backed */}
      {isDevice && phase === "live" && (
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-white/50">
            <UserPlus size={12} /> Enroll the face currently in frame
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={enrollName}
              onChange={(e) => setEnrollName(e.target.value)}
              placeholder="Name"
              className="flex-1 min-w-[120px] rounded-lg border border-white/12 bg-black px-2.5 py-1.5 font-mono text-[11px] text-white placeholder:text-white/25 focus:border-white/40 focus:outline-none"
            />
            <select
              value={enrollRole}
              onChange={(e) => setEnrollRole(e.target.value)}
              className="rounded-lg border border-white/12 bg-black px-2 py-1.5 font-mono text-[11px] text-white focus:border-white/40 focus:outline-none"
            >
              <option value="authorized">Authorized</option>
              <option value="watchlist">Watchlist</option>
            </select>
            <button
              onClick={handleEnroll}
              disabled={enrolling || !enrollName.trim()}
              className="rounded-lg bg-white px-3 py-1.5 font-mono text-[11px] font-bold text-black transition-colors hover:bg-emerald-300 disabled:opacity-40"
            >
              {enrolling ? "Capturing…" : "Capture & Enroll"}
            </button>
          </div>
          {enrollMsg && <div className="font-mono text-[10px] text-white/45">{enrollMsg}</div>}
          {gallery.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {gallery.map((g) => (
                <span key={g.personId} className="flex items-center gap-1 rounded-lg border border-white/12 px-2 py-1 font-mono text-[10px] text-white/55">
                  {g.name} ({g.role})
                  <button
                    onClick={() => {
                      removeFromGallery(g.personId);
                      setGallery(getGallery());
                    }}
                    className="text-white/30 hover:text-red-300"
                    title="Remove"
                  >
                    <Trash2 size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* event log */}
      {isDevice && showLog && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="font-mono text-[11px] font-semibold text-white/60">Append-only event log (this browser)</span>
            <button
              onClick={() => {
                clearEventLog();
                setLogEntries([]);
              }}
              className="font-mono text-[10px] text-white/35 hover:text-red-300"
            >
              Clear
            </button>
          </div>
          <div className="max-h-40 space-y-1 overflow-y-auto font-mono text-[10px] text-white/50">
            {logEntries.length === 0 ? (
              <div className="text-white/30">No events yet.</div>
            ) : (
              logEntries.map((e, i) => (
                <div key={i} className="border-b border-white/5 pb-0.5">
                  <span className="text-white/30">{new Date(e.ts).toLocaleTimeString()}</span> <span className="text-amber-300">{e.type}</span> — {e.detail}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* live preview */}
      <div
        className={`relative overflow-hidden rounded-xl border bg-black transition-colors ${phase === "idle" ? "hidden" : ""} ${
          status?.alert ? "border-red-500/60" : "border-white/12"
        }`}
      >
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoElRef} muted playsInline className="hidden" />
        <canvas ref={canvasRef} className={isDevice ? "aspect-video w-full object-contain" : "hidden"} />
        {!isDevice && phase !== "idle" && (
          // eslint-disable-next-line jsx-a11y/alt-text
          <img key={imgKey} src={`${api.streamUrl(slot)}?k=${imgKey}`} className="aspect-video w-full object-contain" />
        )}
        {status?.alert && <div className="pointer-events-none absolute inset-0 border-4 border-red-500/70 animate-pulse" />}
      </div>
    </div>
  );
}
