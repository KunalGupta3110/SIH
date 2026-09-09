# Restricted-Zone Detection → Real-Time Dashboard Push

Two features wired end to end:

1. **Restricted-zone detection** — the CV pipeline flags a person/vehicle entering
   a calibrated polygon (or crossing a directional tripwire) and forwards that
   event to the API gateway.
2. **Real-time push** — the gateway correlates/scores the event into an incident,
   seals it into the SHA-256 chain, and pushes it over a WebSocket. The React
   console flips the camera marker to **ALERT** with no page refresh.

Nothing here is a new detection stack — it reuses `detection_tracking/`,
`alerts/zones.py`, `alerts/events.py`, and `alerts/draw_zones_gui.py`.

## What changed

| File | Change |
| --- | --- |
| `services/api_gateway/server.py` | `IncidentStreamManager`, `GET /ws/incidents`, `broadcast_incident_update()`; `/events` (+ `/events/ingest` alias), `/events/simulate-handoff`, `/events/run-live-inference` now broadcast the correlated incident after it is written. |
| `alerts/gateway_forwarder.py` | **new** — `GatewayForwarder` maps a `SecurityEvent` to the gateway `EventIn` schema and `POST`s it to `/events`. Never raises into the frame loop; logs one warning and keeps going if the backend is unreachable. |
| `alerts/events.py` | `AlertEngine(..., event_sink=callable)` — each generated event is handed to the sink (isolated in try/except). |
| `alerts/run_surveillance.py` | wires `GatewayForwarder.forward` as the sink; `--gateway-url` / `--no-forward` flags. |
| `alerts/schema.py` | added the `DIRECTION_VIOLATION` alert type (already referenced by `events.py`). |
| `tools/simulate_zone_entry.py` | **new** — fire a synthetic zone-entry (or 2-camera handoff) at the gateway without a camera. |
| `frontend/src/lib/useIncidentStream.js` | **new** — WebSocket hook: auto-reconnect w/ backoff, dedupes by `incident_id`, exposes `alertedCameraIds`. |
| `frontend/src/components/ConsoleDashboard.jsx` | consumes the hook; `displayCameras` folds in live status; camera card shows an ALERT ring; a "Realtime" pill shows when the socket is connected; a toast fires on each new incident. |

## Zone calibration (one-time, per camera)

```bash
python alerts/draw_zones_gui.py --source path/to/still_frame.jpg --camera-id CAM_BRAVO \
    --config data/zones_config.json
```

`--source` accepts an image or a video (first frame is used). Click the polygon
corners, press the key it prompts for to save. Zones live in
`data/zones_config.json` keyed by camera id — recalibrate without touching code.

## Run it end to end

**1. Start the gateway** (terminal 1):

```bash
python -m uvicorn services.api_gateway.server:app --port 8000
```

**2. Start the dashboard** (terminal 2) pointed at the gateway:

```bash
cd frontend
# tell the app where the gateway is (dev)
echo "VITE_API_BASE=http://localhost:8000" > .env.local
npm run dev
```

Open the console → **Live Surveillance**. A green **Realtime** pill appears next
to "6 Cameras" once the WebSocket connects.

**3a. Fastest check — simulate a zone entry** (terminal 3):

```bash
python tools/simulate_zone_entry.py --camera CAM_BRAVO
# or a 2-camera cross-corridor walk-through:
python tools/simulate_zone_entry.py --handoff --camera CAM_BRAVO
```

Expected within ~1 second, no refresh:
- CAM_BRAVO tile border turns red, header shows **ALERT**
- a toast: `⚡ Live: INC-XXXX · CAM_BRAVO · threat NN/100 (…)`
- the script prints the incident id, threat score, and itemized breakdown

**3b. Real footage** — run the surveillance engine against a recorded file:

```bash
python alerts/run_surveillance.py \
    --source data/threat_night_crawl_web.mp4 \
    --camera-id CAM_BRAVO \
    --zones data/zones_config.json \
    --no-show
# forwarding target defaults to $IBVAP_GATEWAY_URL or http://127.0.0.1:8000
```

Each restricted-zone entry / tripwire crossing POSTs to `/events` and the
dashboard updates live. `AlertEngine` fires **one** intrusion event per
(track, zone) — re-entry after leaving the zone re-arms it — so a subject walking
through does not flood the stream.

## Acceptance checks (verified)

- [x] one `zone_entry` → one incident with a non-zero threat score (`INC-0001 score=50`)
- [x] incident pushed to every `/ws/incidents` client; `POST /events` response matches the pushed payload
- [x] reconnect: a fresh socket gets **no** stale backlog, no duplicates (dedupe by `incident_id`)
- [x] duplicate `event_id` → `{"duplicate": true}`, no second incident
- [x] gateway down → `GatewayForwarder.forward()` logs one warning, returns `None`, never raises

## Config

| Env var | Default | Meaning |
| --- | --- | --- |
| `IBVAP_GATEWAY_URL` | `http://127.0.0.1:8000` | where `alerts/` forwards events |
| `IBVAP_GATEWAY_FORWARD` | `1` | set `0` to disable forwarding (local SQLite only) |
| `VITE_API_BASE` (frontend) | `window.location.origin` | gateway origin for REST + `ws(s)://…/ws/incidents` |

On the Vercel static deploy there is no gateway, so the socket never connects,
the hook gives up quietly after a few attempts, and the console shows its normal
demo data.
