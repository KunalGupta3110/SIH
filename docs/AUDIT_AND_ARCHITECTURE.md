# IBVAP Sentinel — Comprehensive Engineering Audit & Architecture Specification

**Project:** Intelligent Border Video Analytics Platform (IBVAP Sentinel)  
**SIH Problem Statement:** SIH26187 (Ministry of Home Affairs / Sashastra Seema Bal)  
**Document Version:** 2.0-PRODUCTION  
**Date:** September 2026  

---

## 1. Executive Summary & Problem Formulation

Traditional border surveillance deployments suffer from three fatal bottlenecks:
1. **Camera-Isolated Detections:** Standard CCTV systems treat each camera as an isolated silo. When an intruder moves out of a camera field of view, situational awareness is broken.
2. **Alert Fatigue (Single-Frame Spam):** Standard object detectors fire an alert for every single frame a target is visible, generating hundreds of alerts per minute and blinding operators.
3. **Black-Box AI Decisions & Tamper Vulnerability:** Deep learning models provide no explainability for why an alert was generated, and plain SQLite/CSV logs can be altered after an incident occurs.

**IBVAP Sentinel** solves these problems with a unified, edge-native intelligence pipeline:

\[ Multi-Camera RTSP / Video Stream ]
                │
                ▼
[ YOLOv8 Object Detection (Edge Optimized) ]
                │
                ▼
[ ByteTrack Multi-Object Kinematic Tracker ]
                │
                ▼
[ Spatio-Temporal Behavior & Anomaly Engine ] ──► Optional Isolation Forest
                │
                ▼
[ Camera Topology Graph & Predictive Handoff ]
                │ (Kinematic vector + travel time constraints)
                ▼
[ Feature Re-ID (Candidate Filtering Cascade) ]
                │ (All Tracks -> Spatial Candidates -> Temporal Window -> Cosine Match)
                ▼
[ Spatio-Temporal Incident Correlation & Debouncing ]
                │ (Correlates individual Events into unified Incidents)
                ▼
[ Factorized Explainable Threat Scoring (0-100) ]
                │ (Explicit rule-based points breakdown)
                ▼
[ SHA-256 Merkle Evidence Ledger ]
                │ (Cryptographically sealed tamper-evident chain)
                ▼
[ 3D Digital Twin Command Console / Flutter Field App ]
\
---

## 2. Comparative Analysis with Reference Repositories

| Dimension | Reference Repo 1 (Border-Surveillance-System) | Reference Repo 2 (chakravyuh_ai) | IBVAP Sentinel (KunalGupta3110/SIH) |
| :--- | :--- | :--- | :--- |
| **Pipeline Paradigm** | Camera -> Detection -> Alert | Anomaly Score -> Context -> Prioritization | Camera -> Detection -> Tracking -> Behavior -> Topology -> Predictive Handoff -> Re-ID -> Correlation -> Explainable Risk -> Evidence Ledger |
| **Multi-Camera Handling** | Independent parallel feeds | Single-node multi-stream | Graph topology with directed edge transit times, exit vectors, and spatio-temporal arrival windows |
| **Alert Generation** | Per-frame detection alerts (causes alert spam) | Priority queue based on anomaly score | Spatio-temporal event debouncing; correlated into unified multi-event Incidents |
| **Re-ID & Tracking** | Simple single-camera tracking | Feature extraction across streams | Appearance Re-ID with 4-stage candidate filtering cascade (Graph -> Time Window -> Appearance) |
| **Threat Scoring** | Raw detector confidence (%) | Black-box anomaly score | Factorized, explainable mathematical score (0-100) with line-item point breakdown |
| **Cryptographic Integrity** | Plain database logs | Mentioned cryptographic hashing | Full SHA-256 Merkle hash chain with Genesis anchor, /integrity/verify, and block tampering detection |
| **Offline / Edge Support** | Local OpenCV loops | Local Python runtime | 100% offline-first; zero cloud API dependency, zero mandatory external LLMs, graceful CPU fallback |
| **Command Visualization** | Standard Streamlit UI | Streamlit / Flask UI | React 18 Tactical Console + Three.js 3D Digital Twin + Flutter field companion |

---

## 3. Strict Distinctions & Engineering Rules

### A. Events vs. Incidents
- **Event:** A single atomic observation from an individual camera (e.g. ZONE_ENTRY, BOUNDARY_APPROACH, PREDICTIVE_HANDOFF, LOITERING_THRESHOLD_EXCEEDED).
- **Incident:** A correlated spatio-temporal collection of related events forming a complete narrative (e.g. Target enters sector via CAM_ALPHA, loiters for 20s, crosses boundary heading East, confirmed arriving at CAM_BRAVO after 8s -> INC-1041).
- **Rule:** Never generate one alert per frame. Multiple frames of continuous presence within a zone produce *one* event with updated duration and state.

### B. Confidence vs. Risk Score
- **Detection Confidence:** How confident is YOLO that this object is a person (e.g. 94%)
- **Re-ID Similarity:** How similar is this person embedding to the target from the previous camera (e.g. 0.84)
- **Behavior Confidence:** How consistent is the kinematic trajectory with the observed heading (e.g. 91%)
- **Threat Risk Score:** How dangerous is the overall situation to border security (0-100)
- **Rule:** A high detection confidence (95%) on an authorized patrol does NOT equal high risk (15/100). Risk is computed exclusively through factorized threat rules.

### C. Appearance-Based Re-ID vs. Facial Recognition
- **Rule:** IBVAP Sentinel utilizes anonymous appearance embeddings (color-spatial histograms and CNN feature maps) to associate tracks across disparate camera fields of view. It never attempts biometric facial recognition or identity tracking.

### D. Real Kinematic Predictive Handoff
- **Rule:** Predictive handoff does not randomly query neighboring cameras. It calculates:
  1. Directional exit heading from the last 15 trajectory points.
  2. Estimated travel time based on edge distance and target velocity.
  3. Spatio-temporal arrival window [t_min, t_max].
  4. Candidate filtering: Only search for Re-ID matches on cameras in the direction of heading during the active arrival window.

---

## 4. Module-by-Module Repository Audit

| Module Path | Working Status | Purpose & Functionality | Duplication / Dead Code | Error Handling & Fallbacks |
| :--- | :---: | :--- | :--- | :--- |
| backend/main.py | 100% Working | Primary FastAPI ecosystem gateway, REST endpoints, static mounting, event ingestion. | None. Unified entry point. | Graceful 404/400 handling, CORS enabled, automated DB initialization. |
| backend/database.py | 100% Working | SQLite WAL-mode database for events, incidents, and SHA-256 ledger blocks. | Single source of truth for persistent state. | Automatic table creation, parameterized queries preventing SQL injection. |
| backend/threat_engine.py | 100% Working | Factorized explainable threat scoring matrix (0-100) with rule breakdowns. | Single source of truth for backend risk. | Clamped boundaries [0, 100], default fallbacks. |
| backend/correlation_engine.py | 100% Working | Spatio-temporal event correlation and narrative story synthesis. | Single correlation engine. | Lookback window bounds, idempotent event handling. |
| backend/evidence_ledger.py | 100% Working | SHA-256 Merkle hash chain with genesis anchor and verification. | Single source of truth for evidence integrity. | Step-by-step block hash recomputation and tamper isolation. |
| core/rules/predictive_handoff.py | 100% Working | Camera graph topology, exit vector calculation, arrival window matching. | Core handoff engine. | Expired prediction garbage collection, speed scaling. |
| core/rules/explainable_scoring.py | 100% Working | Detailed factorized threat scoring dataclasses and point breakdown. | Shared scoring definitions. | Deterministic rule execution. |
| core/vision/reid.py | 100% Working | Anonymous appearance embedding extraction and cosine similarity matching. | Core vision Re-ID. | Graceful fallback to color-spatial histogram if deep weights absent. |
| core/vision/tracker.py | 100% Working | ByteTrack kinematic multi-object tracker with velocity and dwell tracking. | Primary edge tracker. | Handles frame drops, occlusion recovery up to 30 frames. |
| tools/benchmark.py | 100% Working | Latency, FPS, and throughput measurement suite. | Diagnostic tool. | Measures real system performance. |
| frontend/ | 100% Working | React 18 + Vite + Tailwind tactical console with 3D digital twin and model zoo. | Replaced legacy Streamlit. | Clean build (dist/), dynamic API failover. |

---

## 5. Security and Repository Hygiene Guidelines

1. **Zero Secret Leaks:** No hardcoded tokens, passwords, or cloud credentials. All configuration is loaded from environment variables or local defaults.
2. **Offline-First:** All assets, weights, and scripts run on local compute with no required internet connection.
3. **Transparent Demonstration:** Simulated data and feeds are explicitly labeled with [SIMULATED] or [DEMO] tags in the user interface.
