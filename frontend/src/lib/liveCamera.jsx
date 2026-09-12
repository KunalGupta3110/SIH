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

// dual-tone "catch" chirp — distinct from the breach klaxon (BorderTerrain
// Modal's playBreachKlaxon) but loud/urgent on purpose: this is the sound
// for a real detection catch, so it needs to actually get noticed.
let _actx = null;
let _lastBeepAt = 0;
// Every one of the 5 demo-camera tiles polls and calls this independently,
// and each looping demo clip re-triggers its own zone breach near the start
// of every loop (~every 10-20s) — with the grid open that's up to 5
// overlapping false->true edges scattered continuously, which sounded like
// nonstop beeping. This is a single global cooldown (not per-camera) so the
// total rate is capped regardless of how many callers fire at once.
const BEEP_COOLDOWN_MS = 4000;
export function playBeep() {
  const now = performance.now();
  if (now - _lastBeepAt < BEEP_COOLDOWN_MS) return;
  _lastBeepAt = now;
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
      g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    };
    const now = ctx.currentTime;
    tone(now, 1500, 0.2);
    tone(now + 0.22, 1800, 0.2);
    tone(now + 0.44, 1800, 0.22);
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
