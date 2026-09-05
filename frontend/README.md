# IBVAP Sentinel Console — React + Tailwind frontend

Real rebuild of the dashboard, wired to the **actual** backend your
`run_ecosystem.py` starts (`backend/main.py`, port 8000) — not
`api/server.py` or `services/api_gateway/server.py`, which the ecosystem
launcher doesn't use.

## Where this goes in your repo

Drop this whole folder in as `frontend/` at the repo root (or wherever
you like — it's self-contained, no path assumptions besides talking to
`localhost:8000`).

## Run it

```bash
# 1. Start the real backend (separate terminal, from repo root)
python run_ecosystem.py

# 2. Start this frontend
cd frontend
npm install
npm run dev
```

Open the URL Vite prints (default `http://localhost:5173`).

To point at a different backend host/port, create a `.env` file next to
`package.json`:

```
VITE_API_BASE=http://192.168.1.20:8000
```

## What's real vs. cosmetic

Everything on the **Incidents**, **Evidence Chain**, and **Operator
Triage** screens is live — it polls `backend/main.py` every 5s and every
button (Confirm, Dismiss, Simulate Handoff, Silence Siren, Arm/Disarm)
sends a real request.

**Live Ops** (the camera grid) is a labelled placeholder. `backend/main.py`
has no video-streaming endpoint yet — `hardware_bridge.py` runs in
simulation mode — so there's nothing real to render there. It's built to
look right and swap in a `<video>`/`<img>` tag the moment a stream
endpoint exists; it doesn't pretend to be live.

**Tactical Map** is a static SVG topology (Checkpost Alpha ↔ BOP Bravo)
with the corridor and camera FOVs — it highlights the most recent
incident's ID and score if one exists, but there's no real GPS/geo data
behind camera placement.

## For the demo

Use the **Simulate Handoff** button in the top bar. It calls
`POST /events/simulate-handoff`, which pushes a real CAM_ALPHA →
CAM_BRAVO event pair through the actual pipeline (correlation → scoring
→ ledger sealing) — so clicking it live in front of judges produces a
real incident, a real threat-score breakdown, and (since the simulated
event scores CRITICAL) a real new block in the evidence chain you can
then verify.

## Structure

```
frontend/
├── src/
│   ├── App.jsx                 # wires panels to polling + actions
│   ├── lib/
│   │   ├── api.js              # one function per backend/main.py endpoint
│   │   └── usePoll.js          # polling hook (5s interval, error-tolerant)
│   └── components/
│       ├── NavRail.jsx         # left nav + arm/disarm
│       ├── TopBar.jsx          # live clock, edge telemetry, simulate/silence
│       ├── LivePanel.jsx       # camera grid (placeholder, labelled)
│       ├── IncidentsPanel.jsx  # correlated incidents + score breakdown
│       ├── EvidencePanel.jsx   # hash chain + live /audit/verify
│       ├── TriagePanel.jsx     # confirm/dismiss queue
│       └── MapPanel.jsx        # static tactical topology
```

## Design direction

Graphite/charcoal base (`#0B0D0F`) with a single amber accent
(`#E8A33D`) instead of the generic neon-cyan "hacker dashboard" look —
amber is closer to a real ops-room phosphor palette. Muted red only for
CRITICAL severity, so it stays meaningful instead of decorative. IBM
Plex Sans for UI text, IBM Plex Mono for anything that's actually data
(IDs, timestamps, hashes, coordinates) — matches how real telemetry
tools typographically separate "label" from "reading".

Change the palette in `tailwind.config.js` (`colors.amber`, `.red`,
etc.) if you want to try a different accent — everything references
those tokens, nothing is hardcoded per-component.
