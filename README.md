# IBVAP Sentinel — Intelligent Border Video Analytics & Admin Ecosystem
**SIH 2026 Problem Statement ID:** 26187  
**Organization:** Ministry of Home Affairs | Sashastra Seema Bal (SSB)  
**Category:** Software | **Theme:** Blockchain & Cybersecurity  
**GitHub Repository:** https://github.com/KunalGupta3110/SIH

---

## 🎯 Overview
**IBVAP Sentinel** is a unified edge-to-cloud security ecosystem that transforms standard IP CCTV infrastructure at Border Out Posts (BOPs), check posts, and border roads into an intelligent, autonomous surveillance network.

The ecosystem unites:
1. **Edge AI Computer Vision Engine:** YOLOv8 + ByteTrack + PyTorch ResNet18 Re-ID + Ultra-HD ANPR License Plate Scanner.
2. **FastAPI REST Gateway:** High-performance REST endpoints bridging Edge AI events to client apps.
3. **Web Command & Control Dashboard:** Streamlit command station with 2D GIS Tactical Border Map & Operator 1-click False-Positive triage.
4. **Sentinel Admin Mobile App:** Cross-platform Flutter client (Android, iOS, Windows, Web) for mobile command and real-time push alert handling.

---

## 🏗️ Unified Ecosystem Architecture
```
                         ┌─────────────────────────────────────────────────────────┐
                         │              EDGE AI VIDEO ANALYTICS ENGINE             │
                         │  - YOLOv8 Multi-Object Detection + ByteTrack IDs        │
                         │  - Cross-Camera Re-ID (512-D L2 Appearance Embeddings)  │
                         │  - Geofenced Red Zones, Tripwires & Loitering Dwell     │
                         │  - Rapid Approach Vectors & Optical ANPR Plate Scan     │
                         └────────────────────────────┬────────────────────────────┘
                                                      │
                                                      ▼
                         ┌─────────────────────────────────────────────────────────┐
                         │               FASTAPI REST GATEWAY (Port 8000)          │
                         │  - /edge/status (Node Heartbeat, FPS, Arm/Disarm)       │
                         │  - /incidents (Timeline, High-Res Snapshots, Review)    │
                         │  - /notifications/register-token (FCM / Push Dispatch)  │
                         └──────────────┬───────────────────────────┬──────────────┘
                                        │                           │
                   ┌────────────────────┴─────┐       ┌─────────────┴────────────────────┐
                   ▼                          ▼       ▼                                  ▼
┌──────────────────────────────────────┐             ┌──────────────────────────────────────┐
│     WEB COMMAND CENTER (Streamlit)   │             │   SENTINEL ADMIN FLUTTER MOBILE APP  │
│  - 2D Interactive GIS Border Map     │             │  - Cross-platform Android / iOS / Win│
│  - Multi-Feed Video Playback HUD     │             │  - Full-Screen Emergency Alarm Screen│
│  - Operator False-Positive Triage    │             │  - Arm / Disarm Toggle & Incident Log│
│  - Re-ID Candidate Matching Matrix   │             │  - Riverpod State + Dio REST Client  │
└──────────────────────────────────────┘             └──────────────────────────────────────┘
```

---

## 📁 Unified Project Structure
```
SIH/
├── alerts/                         # Spatial geofencing, threat rules, sound alerts
│   ├── run_surveillance.py         # Master unified multi-threat surveillance pipeline
│   ├── scenario_checkpoint_vehicle_ramming.py # Tactical ANPR & pop-up evidence inspector
│   ├── notify.py                   # Async Telegram mobile alert dispatcher
│   ├── zones.py                    # Polygon zones & directional tripwires
│   └── events.py                   # SQLite event logger & operator triage
├── detection_tracking/             # YOLOv8 + ByteTrack multi-object tracking
├── reid/                           # Cross-camera Re-ID (ResNet18 512-d embeddings)
│   ├── cross_cam_demo.py           # Dual-camera Re-ID live demo
│   └── match.py                    # Transparent candidate matching & cosine scoring
├── api/                            # FastAPI REST Gateway for mobile & external clients
│   └── server.py                   # REST endpoints (/incidents, /edge/status)
├── dashboard/                      # Web Command & Control Center
│   └── app.py                      # Streamlit dashboard with 2D GIS Border Map
├── sentinel_admin_app/             # Cross-platform Flutter Admin Client
│   ├── lib/                        # Riverpod features (Dashboard, Incidents, Alerts)
│   └── pubspec.yaml                # Flutter project dependencies
├── data/                           # Video samples, thumbnails, SQLite database
├── run_ecosystem.py                # Master 1-click launcher for all services
└── requirements.txt                # Consolidated Python dependencies
```

---

## 🚀 Quick Start

### 1. Python Environment Setup
```bash
# Clone & install dependencies
git clone https://github.com/KunalGupta3110/SIH.git
cd SIH
python -m venv venv
venv\Scripts\activate       # Windows
pip install -r requirements.txt
```

### 2. Launch Unified Platform (1-Click)
```bash
python run_ecosystem.py
```
* **FastAPI Backend:** http://localhost:8000/docs
* **Web Command Center:** http://localhost:8501

### 3. Launch Flutter Admin Mobile App
```bash
cd sentinel_admin_app
flutter pub get
flutter run
```

### 4. Run Tactical Threat Demonstrations
* **Multi-Stage Checkpoint Incursion & Ultra-HD ANPR:**
  ```bash
  python alerts/scenario_checkpoint_vehicle_ramming.py
  ```
* **Cross-Camera Re-ID Multi-Post Tracking:**
  ```bash
  python reid/cross_cam_demo.py --cam1 data/sample_border.mp4 --cam2 data/sample_border.mp4
  ```

---

## 🛡️ Key SIH Winning Advantages
1. **Zero Proprietary Hardware Lock-In:** Runs on existing IP CCTV + standard CPU / Edge Jetson nodes.
2. **Transparent Cross-Camera Re-ID:** Honest, explainable Cosine Similarity scoring ($\tau = 0.70$) with candidate ranking matrices.
3. **Human-in-the-Loop Operator Triage:** 1-click Confirm / Dismiss False-Positive workflow with forensic SQLite audit trail.
4. **Dual-Platform Monitoring:** Web Command Center for station operators + Flutter Mobile App for patrolling officers.
5. **Responsible AI & Privacy-by-Design:** 10s pre/post-event clip buffering; non-biometric visual appearance embeddings.
