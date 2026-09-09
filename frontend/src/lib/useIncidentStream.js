// IBVAP Sentinel — frontend/src/lib/useIncidentStream.js
// Real-time incident feed over the gateway WebSocket (/ws/incidents).
//
// Event-driven, not polling: the backend pushes a correlated incident the
// instant a restricted-zone entry (or any rule) is ingested, and every
// connected dashboard updates without a refresh.
//
// Usage:
//   const { connected, incidents, latestIncident, alertedCameraIds } = useIncidentStream();
//   const status = alertedCameraIds.has(cam.id) ? "ALERT" : cam.status;

import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || (typeof window !== "undefined" ? window.location.origin : "");

function toWebSocketUrl(base) {
  try {
    const u = new URL("/ws/incidents", base);
    u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
    return u.toString();
  } catch {
    return null;
  }
}

const ALERT_SEVERITIES = new Set(["CRITICAL", "WARNING", "HIGH", "critical", "warning", "high"]);
const DEFAULT_ALERT_WINDOW_MS = 90_000; // a camera marker stays ALERT for 90s after its last incident
const MAX_INCIDENTS = 60;
const MAX_RECONNECT_ATTEMPTS = 8;

/**
 * @param {object}  opts
 * @param {boolean} opts.enabled        - set false to hold the socket closed
 * @param {number}  opts.alertWindowMs  - how long a camera stays flagged after an incident
 */
export function useIncidentStream({ enabled = true, alertWindowMs = DEFAULT_ALERT_WINDOW_MS } = {}) {
  const [connected, setConnected] = useState(false);
  const [incidentMap, setIncidentMap] = useState(() => new Map()); // incident_id -> { ...incident, _receivedAt }
  const [now, setNow] = useState(() => Date.now());
  const [gaveUp, setGaveUp] = useState(false);

  const wsRef = useRef(null);
  const attemptsRef = useRef(0);
  const timerRef = useRef(null);
  const closedByUsRef = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const url = toWebSocketUrl(API_BASE);
    if (!url || typeof WebSocket === "undefined") return undefined;

    closedByUsRef.current = false;

    const connect = () => {
      let ws;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attemptsRef.current = 0;
        setGaveUp(false);
        setConnected(true);
      };

      ws.onmessage = (evt) => {
        let msg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        if (!msg || msg.type !== "incident_update" || !msg.payload) return;
        const incident = msg.payload;
        const id = incident.incident_id || incident.id;
        if (!id) return;
        setIncidentMap((prev) => {
          const next = new Map(prev);
          next.set(id, { ...incident, incident_id: id, _receivedAt: Date.now() });
          // keep only the most recent MAX_INCIDENTS by receipt time
          if (next.size > MAX_INCIDENTS) {
            const ordered = [...next.entries()].sort((a, b) => b[1]._receivedAt - a[1]._receivedAt);
            return new Map(ordered.slice(0, MAX_INCIDENTS));
          }
          return next;
        });
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closedByUsRef.current) scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose will follow and handle the retry
        try {
          ws.close();
        } catch {
          /* noop */
        }
      };
    };

    const scheduleReconnect = () => {
      if (closedByUsRef.current) return;
      attemptsRef.current += 1;
      if (attemptsRef.current > MAX_RECONNECT_ATTEMPTS) {
        setGaveUp(true);
        return;
      }
      const delay = Math.min(30_000, 1000 * 2 ** (attemptsRef.current - 1));
      timerRef.current = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByUsRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
      setConnected(false);
    };
  }, [enabled]);

  // Tick so the ALERT window can expire without a new message arriving.
  useEffect(() => {
    if (!enabled) return undefined;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [enabled]);

  const incidents = useMemo(
    () =>
      [...incidentMap.values()].sort(
        (a, b) => (b._receivedAt || 0) - (a._receivedAt || 0),
      ),
    [incidentMap],
  );

  const latestIncident = incidents[0] || null;

  const alertedCameraIds = useMemo(() => {
    const ids = new Set();
    for (const inc of incidentMap.values()) {
      if (now - (inc._receivedAt || 0) > alertWindowMs) continue;
      const sev = inc.severity;
      if (sev && !ALERT_SEVERITIES.has(sev)) continue;
      for (const cam of inc.cameras_involved || []) ids.add(cam);
    }
    return ids;
  }, [incidentMap, now, alertWindowMs]);

  return { connected, gaveUp, incidents, latestIncident, alertedCameraIds };
}

export default useIncidentStream;
