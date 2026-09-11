/* ═══════════════════════════════════════════════════════════════════════
   clientTracker — lightweight greedy IOU tracker giving each detection a
   persistent ID across frames, entirely client-side. Not ByteTrack (no
   Kalman motion model / re-id cascade), but a real multi-frame identity
   assignment — the same simplification core/vision/tracker.py's own MOG2
   fallback path uses when ultralytics isn't available server-side.
   ═══════════════════════════════════════════════════════════════════════ */

const IOU_MATCH_THRESHOLD = 0.25;
const GRACE_MS = 600; // keep an unmatched track alive this long (brief occlusion/miss)
const HISTORY_LEN = 30;

let _tracks = [];
let _nextId = 1;

function iou(a, b) {
  const ix1 = Math.max(a[0], b[0]);
  const iy1 = Math.max(a[1], b[1]);
  const ix2 = Math.min(a[2], b[2]);
  const iy2 = Math.min(a[3], b[3]);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = (a[2] - a[0]) * (a[3] - a[1]);
  const areaB = (b[2] - b[0]) * (b[3] - b[1]);
  return inter / (areaA + areaB - inter + 1e-6);
}

/**
 * @param detections [{cls, label, score, x1,y1,x2,y2}, ...] — one frame's
 *   raw YOLO output (clientYolo.js's detectFrame() result).
 * @param nowMs performance.now()-style timestamp for this frame.
 * @returns tracks actually matched THIS frame, each with a stable `.id`
 *   that persists across calls: {id, cls, label, score, bbox, centroid, history}
 */
export function updateTracks(detections, nowMs) {
  const unmatched = new Set(detections.map((_, i) => i));
  const survivors = [];

  for (const track of _tracks) {
    let bestIdx = -1;
    let bestIou = IOU_MATCH_THRESHOLD;
    for (const i of unmatched) {
      const d = detections[i];
      if (d.cls !== track.cls) continue;
      const ov = iou(track.bbox, [d.x1, d.y1, d.x2, d.y2]);
      if (ov > bestIou) {
        bestIou = ov;
        bestIdx = i;
      }
    }
    if (bestIdx >= 0) {
      const d = detections[bestIdx];
      track.bbox = [d.x1, d.y1, d.x2, d.y2];
      track.centroid = [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2];
      track.score = d.score;
      track.lastSeen = nowMs;
      track.missed = 0;
      track.history.push(track.centroid);
      if (track.history.length > HISTORY_LEN) track.history.shift();
      survivors.push(track);
      unmatched.delete(bestIdx);
    } else {
      track.missed = (track.missed || 0) + 1;
      if (nowMs - track.lastSeen < GRACE_MS) survivors.push(track);
    }
  }

  for (const i of unmatched) {
    const d = detections[i];
    const centroid = [(d.x1 + d.x2) / 2, (d.y1 + d.y2) / 2];
    survivors.push({
      id: _nextId++,
      cls: d.cls,
      label: d.label,
      score: d.score,
      bbox: [d.x1, d.y1, d.x2, d.y2],
      centroid,
      lastSeen: nowMs,
      missed: 0,
      history: [centroid],
    });
  }

  _tracks = survivors;
  return _tracks.filter((t) => t.missed === 0);
}

export function resetTracks() {
  _tracks = [];
  _nextId = 1;
}
