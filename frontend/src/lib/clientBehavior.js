import { PERSON_CLASS_ID } from "./clientYolo.js";

/* ═══════════════════════════════════════════════════════════════════════
   clientBehavior — abandoned-object, loitering, and crowd-formation
   detectors, the browser-side counterpart to core/rules/abandoned_object.py
   and alerts/events.py's loitering/crowd logic. Operates on clientTracker's
   persistent-ID tracks, so "stayed still for N seconds" is measured across
   real frame-to-frame identity, not per-frame position alone.
   ═══════════════════════════════════════════════════════════════════════ */

const OBJECT_LABELS = new Set(["backpack", "handbag", "suitcase"]);

const STATIONARY_RADIUS_PX = 30;
const STATIONARY_MS = 6000;
const OWNER_PROXIMITY_PX = 160;

const LOITER_RADIUS_PX = 60;
const LOITER_MS = 8000;

const CROWD_RADIUS_PX = 120;
const CROWD_MIN_PEOPLE = 3;

const _objectState = new Map(); // id -> {anchor, sinceMs, alerted}
const _loiterState = new Map();

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function checkAbandonedObjects(tracks, nowMs) {
  const persons = tracks.filter((t) => t.cls === PERSON_CLASS_ID);
  const fired = [];
  const seen = new Set();

  for (const t of tracks) {
    if (!OBJECT_LABELS.has(t.label)) continue;
    seen.add(t.id);
    let st = _objectState.get(t.id);
    if (!st) {
      st = { anchor: t.centroid, sinceMs: nowMs, alerted: false };
      _objectState.set(t.id, st);
      continue;
    }
    if (dist(t.centroid, st.anchor) > STATIONARY_RADIUS_PX) {
      st.anchor = t.centroid;
      st.sinceMs = nowMs;
      st.alerted = false;
      continue;
    }
    const stationaryMs = nowMs - st.sinceMs;
    if (stationaryMs < STATIONARY_MS || st.alerted) continue;

    const ownerNearby = persons.some((p) => dist(p.centroid, t.centroid) < OWNER_PROXIMITY_PX);
    if (!ownerNearby) {
      st.alerted = true;
      fired.push({ ...t, stationarySec: Math.round(stationaryMs / 100) / 10 });
    }
  }

  for (const id of Array.from(_objectState.keys())) if (!seen.has(id)) _objectState.delete(id);
  return fired;
}

export function checkLoitering(tracks, nowMs) {
  const fired = [];
  const seen = new Set();

  for (const t of tracks) {
    if (t.cls !== PERSON_CLASS_ID) continue;
    seen.add(t.id);
    let st = _loiterState.get(t.id);
    if (!st) {
      st = { anchor: t.centroid, sinceMs: nowMs, alerted: false };
      _loiterState.set(t.id, st);
      continue;
    }
    if (dist(t.centroid, st.anchor) > LOITER_RADIUS_PX) {
      st.anchor = t.centroid;
      st.sinceMs = nowMs;
      st.alerted = false;
      continue;
    }
    const loiterMs = nowMs - st.sinceMs;
    if (loiterMs < LOITER_MS || st.alerted) continue;
    st.alerted = true;
    fired.push({ ...t, loiterSec: Math.round(loiterMs / 100) / 10 });
  }

  for (const id of Array.from(_loiterState.keys())) if (!seen.has(id)) _loiterState.delete(id);
  return fired;
}

export function checkCrowdFormation(tracks) {
  const persons = tracks.filter((t) => t.cls === PERSON_CLASS_ID);
  if (persons.length < CROWD_MIN_PEOPLE) return null;

  let closePairs = 0;
  for (let i = 0; i < persons.length; i++) {
    for (let j = i + 1; j < persons.length; j++) {
      if (dist(persons[i].centroid, persons[j].centroid) < CROWD_RADIUS_PX) closePairs++;
    }
  }
  return closePairs >= CROWD_MIN_PEOPLE - 1 ? { count: persons.length } : null;
}

export function resetBehaviorState() {
  _objectState.clear();
  _loiterState.clear();
}
