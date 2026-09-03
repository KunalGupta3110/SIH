# IBVAP — Intelligent Border Video Analytics Platform
**SIH 2026 Problem Statement ID:** 26187  
**Organization:** Ministry of Home Affairs | Sashastra Seema Bal (SSB)  
**Category:** Software | **Theme:** Blockchain & Cybersecurity  
**GitHub Repository:** https://github.com/KunalGupta3110/SIH

---

## 🎯 Overview
IBVAP transforms existing standard IP CCTV infrastructure at Border Out Posts (BOPs), check posts, and border roads into an intelligent, autonomous surveillance network with **no proprietary hardware required**. 

### 🌟 Core Differentiator: Cross-Camera Re-ID
Unlike conventional single-camera detection setups, IBVAP incorporates **Cross-Camera Re-Identification (Re-ID)**, extracting 512-d normalized visual appearance embeddings to stitch target trajectories across non-overlapping camera feeds with **transparent, on-screen Cosine Similarity scoring**.

---

## 🏗️ Architecture & Modules
```
CCTV Feeds (RTSP/ONVIF or pre-recorded clips)
      │
      ▼
Detection (YOLOv8n) ──▶ Tracking (ByteTrack + Persistent IDs)
      │
      ▼
Cross-Camera Re-ID (ResNet18 512-d L2 Embeddings + Temporal Gallery)
      │
      ▼
Alert & Anomaly Logic (Explainable Rules)
   ├─ Virtual Tripwire (2D Vector Crossing)
   ├─ Restricted Polygon Zone (Point-in-Polygon Containment)
   ├─ Loitering Detection (Temporal Dwell-Time Threshold)
   ├─ Rapid Approach Vector (Relative Pixel Rate towards Barrier)
   ├─ Group Density Clustering (Euclidean Spatial Proximity)
   └─ Severity Tiering (INFO / WARNING / CRITICAL)
      │
      ▼
Event Store (SQLite) ──▶ Command Dashboard (Streamlit)
                              ├─ Multi-feed Video Playback
                              ├─ Explainable Alert Feed & Snapshot Review
                              ├─ Human-in-the-Loop Operator False-Positive Triage
                              ├─ Re-ID Candidate Score Matrix & Journey Timeline
                              └─ Responsible AI & Privacy Retention Framework
```

---

## 🚀 Quick Start

### 1. Installation
```bash
git clone https://github.com/KunalGupta3110/SIH.git
cd SIH

# Create virtual environment
python -m venv venv
# Windows:
.\venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install consolidated dependencies
pip install -r requirements.txt
```

### 2. Run Single-Camera Surveillance (Detection + Tracking + Zones)
```bash
# On sample test video:
python alerts/run_surveillance.py --source data/sample_border.mp4 --show

# On live webcam:
python alerts/run_surveillance.py --source 0 --show
```

### 3. Run Explainable Cross-Camera Re-ID Demo (Key Differentiator 🎯)
```bash
python reid/cross_cam_demo.py --cam1 data/sample_border.mp4 --cam2 data/sample_border.mp4
```

### 4. Interactive Visual Zone Calibration Tool
```bash
python alerts/draw_zones_gui.py --source data/sample_border.mp4
```
- `Left Click`: Add polygon / tripwire points
- `t`: Tripwire Mode (2 points)
- `r`: Restricted Polygon Zone Mode (3+ points)
- `Enter`: Finalize zone
- `s`: Save to `data/zones_config.json`

### 5. Launch Command & Control Dashboard
```bash
streamlit run dashboard/app.py
```
*(Open http://localhost:8501 in your browser).*

---

## 🔒 Responsible AI & Privacy Safeguards
1. **Privacy-by-Design Retention:** 10s pre/post-event clip buffer only; continuous 24/7 raw video is **not** permanently retained at edge nodes.
2. **Non-Biometric Appearance Re-ID:** Matches clothing and build embeddings—**not** facial biometrics.
3. **Human-in-the-Loop Decision Support:** System flags advisory events for operator review; it never executes autonomous kinetic actions. Operator dismissals of false positives are audited in real time.
