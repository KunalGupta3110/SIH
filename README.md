# IBVAP — Intelligent Border Video Analytics Platform
**SIH 2026 Problem Statement ID:** 26187  
**Organization:** Ministry of Home Affairs | Sashastra Seema Bal (SSB), Police II Division  
**Category:** Software | **Theme:** Blockchain & Cybersecurity

---

## 🎯 Overview
IBVAP transforms standard IP CCTV infrastructure at Border Out Posts (BOPs), check posts, and border roads into an intelligent, autonomous surveillance network with **no specialized proprietary hardware required**. 

### 🌟 Key Differentiator
Unlike standard single-camera surveillance setups, IBVAP incorporates **Cross-Camera Re-Identification (Re-ID)**, stitching object trajectories across non-overlapping camera feeds into unified movement trails.

---

## 📁 Repository Structure
```
sih26187-border-surveillance/
├── detection_tracking/       # YOLOv8n + ByteTrack pipeline
│   ├── detect.py             # Frame-by-frame object detector (Person/Vehicles)
│   ├── track.py              # Multi-object tracker with persistent IDs & trajectories
│   └── requirements.txt      # Pipeline dependencies
├── reid/                     # Cross-camera Re-ID module (OSNet / ResNet)
│   ├── embed.py              # Feature extraction per track
│   └── match.py              # Cross-camera gallery matching
├── alerts/                   # Rule-based explainable alert logic
│   ├── zones.py              # Virtual tripwires & restricted polygon zones
│   └── events.py             # Event schema, loitering, direction violation
├── backend/                  # FastAPI aggregation and streaming server
│   └── main.py
├── dashboard/                # Streamlit command & control UI
│   └── app.py
├── data/                     # Test video clips & synthetic scenarios
├── docs/                     # Architecture diagrams, pitch deck notes
└── README.md
```

---

## 🚀 Quick Start (Detection & Tracking — Day 1–2)

### 1. Installation
Create and activate a virtual environment, then install dependencies:
```bash
python -m venv venv
# On Windows:
.\venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

pip install -r detection_tracking/requirements.txt
```

### 2. Run Single-Camera Detection
Test object detection (Human & Vehicle classes) on a video file or webcam:
```bash
# On webcam (source 0)
python detection_tracking/detect.py --source 0 --show

# On video file (CPU fallback mode)
python detection_tracking/detect.py --source data/sample_border.mp4 --output data/detected_output.mp4 --device cpu
```

### 3. Run Multi-Object Tracking (ByteTrack)
Generate persistent track IDs, motion trajectories, and structured JSON logs:
```bash
python detection_tracking/track.py --source data/sample_border.mp4 --output data/tracked_output.mp4 --save-json data/tracking_log.json --show
```
