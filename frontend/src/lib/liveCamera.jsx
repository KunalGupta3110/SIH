import { useEffect, useRef, useState } from "react";
import api from "./api.js";

/* ═══════════════════════════════════════════════════════════════════════
   liveCamera — shared plumbing for camera tiles that run REAL backend
   detection instead of a looping demo clip.

   These 5 camera IDs have a live worker in core/vision/multi_stream_engine
   (CAM_ALPHA/BRAVO eager at boot, CHARLIE/DELTA/ECHO lazily started on
   first request). GET /stream/{id} is the YOLOv8+ByteTrack ANNOTATED
   MJPEG — a plain <img src> renders it natively. GET /cameras/{id}/source
   reports {connected, alert, fps} for the UI to poll.

   Requires the backend running locally (VITE_API_BASE) — falls back to
   the static demo <video> automatically when it's unreachable.
   ═══════════════════════════════════════════════════════════════════════ */

export const LIVE_DETECTION_CAMS = new Set(["CAM_ALPHA", "CAM_BRAVO", "CAM_CHARLIE", "CAM_DELTA", "CAM_ECHO"]);

export function isLiveDetectionCam(camId) {
  return LIVE_DETECTION_CAMS.has(camId);
}

// short dual-tone "catch" chirp — deliberately NOT the breach klaxon
// (BorderTerrainModal's playBreachKlaxon), this fires on every real
// detection so it has to be brief and non-alarming.
let _actx = null;
export function playBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    _actx = _actx || new Ctx();
    const ctx = _actx;
    if (ctx.state === "suspended") ctx.resume();
    const tone = (t0, freq, dur) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.45, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };
    const now = ctx.currentTime;
    tone(now, 1500, 0.16);
    tone(now + 0.19, 1800, 0.14);
  } catch {
    /* noop */
  }
}

/**
 * Polls a live camera's detection status. Fires playBeep() the moment
 * `alert` transitions false -> true (a fresh catch), not on every poll
 * while it stays true.
 */
export function useCameraAlert(camId, enabled) {
  const [status, setStatus] = useState(null);
  const prevAlert = useRef(false);
  useEffect(() => {
    if (!enabled || !camId) {
      setStatus(null);
      return;
    }
    prevAlert.current = false;
    let alive = true;
    const poll = async () => {
      const res = await api.getCameraSource(camId);
      if (!alive) return;
      if (!res || Object.keys(res).length === 0) {
        setStatus({ unreachable: true });
        return;
      }
      const isAlert = !!(res.connected && res.alert);
      if (isAlert && !prevAlert.current) playBeep();
      prevAlert.current = isAlert;
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [camId, enabled]);
  return status;
}

/**
 * Drop-in swap for a plain <video> tile: renders the backend's live
 * annotated MJPEG stream for a wired camera ID, or falls back to the
 * static demo clip for every other camera / when the backend is offline.
 */
export function LiveCameraMedia({ camId, fallbackSrc, className = "", style, status }) {
  const live = isLiveDetectionCam(camId) && status && !status.unreachable;
  if (!live) {
    return <video src={fallbackSrc} autoPlay loop muted playsInline className={className} style={style} />;
  }
  // eslint-disable-next-line jsx-a11y/alt-text
  return <img src={api.streamUrl(camId)} className={className} style={style} />;
}
