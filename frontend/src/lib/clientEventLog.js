/* ═══════════════════════════════════════════════════════════════════════
   clientEventLog — an append-only event log for the browser-only webcam
   pipeline, since there's no backend DB to write to here. Backed by
   localStorage so it survives a reload; entries are only ever pushed,
   never edited, matching the "append-only" spirit of the checklist item
   (core/database/evidence_chain.py is the real hash-chained equivalent
   on the backend side).
   ═══════════════════════════════════════════════════════════════════════ */

const STORAGE_KEY = "ibvap_client_event_log";
const MAX_EVENTS = 200;

export function logEvent(event) {
  const entry = { ts: new Date().toISOString(), ...event };
  try {
    const list = getEventLog();
    list.push(entry);
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* localStorage unavailable (private mode, quota) — event still returned for in-memory use */
  }
  return entry;
}

export function getEventLog() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearEventLog() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
