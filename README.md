# IBVAP Sentinel — Intelligent Border Video Analytics & Admin Ecosystem
**SIH 2026 Problem Statement ID:** 26187
**Organization:** Ministry of Home Affairs | Sashastra Seema Bal (SSB)
**Category:** Software | **Theme:** Blockchain & Cybersecurity
**GitHub Repository:** https://github.com/KunalGupta3110/SIH

---

## 🔴 Live Demo

**▶ https://ibvap-sentinel.vercel.app**

| | |
|---|---|
| **Command Console** | [/console](https://ibvap-sentinel.vercel.app/console) — sign in with **`abc`** / **`123`** (leave MFA blank), or "Continue as guest" |
| **What to try** | Live Surveillance → **3D Terrain** (switch Alpine / Thar / River sectors) · **Simulate breach** (synthesised klaxon + incident) · **Evidence Vault** (SHA-256 chain + Section 65B) · **Ctrl + K** for the Sentinel Copilot |
| **Themes** | Dark / Light / **Tricolour** toggle in the top bar |

> The Vercel deployment is the **frontend command console** (Vite + React + react-three-fiber). It runs against mock sector state when no backend is reachable. To see it driven by the **real CV pipeline** (YOLOv8 / ByteTrack / Re-ID / ANPR), run the FastAPI backend locally — see [Quick Start](#-quick-start).

---

## 🎯 Overview
**IBVAP Sentinel** is a unified edge-to-cloud security ecosystem that turns the standard IP CCTV already deployed at Border Out Posts (BOPs), check posts and border roads into an intelligent, autonomous surveillance network — **no dedicated field hardware**.

The ecosystem has four parts:

1. **Edge AI Computer Vision Engine** — YOLOv8n detection + ByteTrack multi-object tracking + ResNet18 / OSNet cross-camera Re-ID (512-d appearance embeddings) + optical ANPR licence-plate reader.
2. **FastAPI REST + WebSocket Gateway** — bridges edge events to every client; self-migrating SQLAlchemy 2.0 store, tamper-evident SHA-256 event chain, FCM push dispatch.
3. **React Command Console** (`frontend/`) — the primary operator surface: real-time watchfloor, 3D multi-sector border terrain (react-three-fiber), incident triage, geo-fence editor, evidence vault, analytics. Deployed at the link above. A lighter **Streamlit** analyst dashboard (`dashboard/`) ships alongside for quick data views.
4. **IBVAP Admin Mobile App** (`apps/mobile_admin/`) — cross-platform Flutter client (Android / iOS / Windows / Web) for patrolling officers: full-screen alarm, arm/disarm, incident log, face enrolment.

---

## 🏗️ Architecture

```
        ┌───────────────────────────────────────────────────────────────┐
        │                 EDGE AI VIDEO ANALYTICS ENGINE                │
        │  YOLOv8n detection · ByteTrack IDs · 512-d cross-camera Re-ID  │
        │  geo-fenced zones · tripwires · loitering · approach vectors   │
        │  optical ANPR plate scan · vehicle hot-list escalation         │
        └───────────────────────────────┬───────────────────────────────┘
                                        │
                                        ▼
        ┌───────────────────────────────────────────────────────────────┐
        │           FASTAPI REST + WEBSOCKET GATEWAY  (:8000)            │
        │  /incidents · /cameras/health · /edge/status                   │
        │  SQLAlchemy 2.0 store · SHA-256 hash-chained evidence          │
        │  /notifications/* (FCM push)                                   │
        └───────┬───────────────────────┬───────────────────────┬───────┘
                │                       │                       │
                ▼                       ▼                       ▼
   ┌────────────────────────┐  ┌──────────────────┐  ┌────────────────────────┐
   │  REACT COMMAND CONSOLE │  │ STREAMLIT ANALYST│  │ IBVAP ADMIN (Flutter)  │
   │  (frontend/ · Vercel)  │  │ DASHBOARD        │  │ Android · iOS · Win     │
   │  · real-time watchfloor│  │ · 2D GIS map     │  │ · full-screen alarm     │
   │  · 3D border terrain   │  │ · FP triage      │  │ · arm / disarm          │
   │  · incident triage     │  │ · Re-ID matrix   │  │ · incident log          │
   │  · evidence vault (65B) │  │                  │  │ · face enrolment        │
   └────────────────────────┘  └──────────────────┘  └────────────────────────┘
                                        │
                                        ▼
                        ┌───────────────────────────────┐
                        │  PERIMETER GPIO RELAYS         │
                        │  Arduino barrier interlock ·   │
                        │  siren · strobe · IR floodlight│
                        └───────────────────────────────┘
```

---

## 📁 Project Structure
```
SIH/
├── frontend/                        # ⭐ React Command Console (Vite + R3F) — the deployed app
│   ├── src/components/              #   watchfloor, 3D terrain, incidents, evidence, analytics
│   ├── src/components/gis/          #   BorderTerrain* — multi-sector 3D border model
│   └── public/models/ · public/data/#   GLB terrain assets · demo feeds
├── core/                            # SQLAlchemy backend service, DB migrate/seed, live inference
├── api/                             # FastAPI REST + WebSocket gateway (/incidents, /edge/status)
├── alerts/                          # Geofencing, threat rules, event logger, sound alerts
│   ├── run_surveillance.py          #   master multi-threat surveillance pipeline
│   └── zones.py · events.py         #   polygon zones + tripwires · SQLite event log
├── detection_tracking/              # YOLOv8 + ByteTrack multi-object tracking
├── reid/                            # Cross-camera Re-ID (512-d embeddings, cosine matching)
├── dashboard/                       # Streamlit analyst dashboard (app.py)
├── apps/mobile_admin/               # Flutter admin client (Riverpod: Dashboard/Incidents/Alerts)
├── hardware/                        # Arduino perimeter barrier interlock sketch
├── models/                          # Source GLB assets (Git LFS)
├── data/                            # Video samples, thumbnails, SQLite database
├── run_ecosystem.py                 # 1-click launcher for the Python services
└── requirements.txt
```

---

## 🚀 Quick Start

### Option A — Command Console only (fastest, no Python)
```bash
git clone https://github.com/KunalGupta3110/SIH.git
cd SIH/frontend
npm install
npm run dev            # → http://localhost:5173
```
Sign in with **`abc` / `123`**. Runs on mock sector state — no backend required.

### Option B — Full platform (console + real CV backend)
```bash
# 1. Python services
cd SIH
python -m venv venv && venv\Scripts\activate      # Windows  (source venv/bin/activate on *nix)
pip install -r requirements.txt
python run_ecosystem.py                            # FastAPI :8000/docs  ·  Streamlit :8501

# 2. Point the console at the backend and run it
cd frontend
echo VITE_API_BASE=http://localhost:8000 > .env.local
npm install && npm run dev
```

### Option C — Flutter admin app
```bash
cd apps/mobile_admin
flutter pub get
flutter run
```

### Tactical demonstrations
```bash
# Multi-stage checkpoint incursion + optical ANPR
python alerts/scenario_checkpoint_vehicle_ramming.py

# Cross-camera Re-ID multi-post tracking
python reid/cross_cam_demo.py --cam1 data/sample_border.mp4 --cam2 data/sample_border.mp4
```

---

## 🛡️ Key SIH Advantages
1. **Zero proprietary hardware lock-in** — runs on existing IP CCTV + standard CPU / edge Jetson nodes.
2. **Explainable threat scoring** — the 0–100 score is an additive rule sum (breach +30, heading to zero-line +20, Re-ID match +12, night curfew +10 …); no black box in the decision path.
3. **Transparent cross-camera Re-ID** — cosine-similarity matching (τ = 0.70) with candidate-ranking matrices, validated on a 2-camera testbed.
4. **Tamper-evident evidence** — every snapshot, box and operator action is SHA-256 hash-chained at capture; a Section 65B(4) certificate template is generated alongside. Not a blockchain or distributed ledger — a sequential hash chain.
5. **Human-in-the-loop triage** — 1-click confirm / dismiss false-positive workflow with a forensic audit trail.
6. **Authorised-personnel allowlist** — enrolled officers / patrol staff / marked vehicles inside a zone are tagged *authorised* and cleared, not escalated — cutting nuisance alerts.
7. **Responsible AI & privacy-by-design** — 10 s pre/post-event clip buffering; non-biometric visual appearance embeddings; honest labelling of simulated vs. live data throughout the UI.

---

## 🧪 Data & honesty note
The demo runs on **synchronised two-angle testbed footage plus public dataset clips (MOT17, VisDrone)** — not live tactical CCTV. Sector names, coordinates and camera health are illustrative. Every screen that shows simulated data says so.
