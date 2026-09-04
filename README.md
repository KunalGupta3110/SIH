# IBVAP Sentinel — Intelligent Border Video Analytics Platform

**SIH 2026 Problem Statement ID:** SIH26187  
**Organization:** Ministry of Home Affairs | Sashastra Seema Bal (SSB)  
**Theme:** AI & Cybersecurity / Border Surveillance  
**GitHub Repository:** [https://github.com/KunalGupta3110/SIH](https://github.com/KunalGupta3110/SIH)  
**Motto:** *"Don't Just Detect Threats. Reconstruct the Incident."*

---

### 🌐 Live Deployment & Interactive Web Access
> 🚀 **Live Interactive Web Watchfloor Console:**  
> 👉 **[https://kunalgupta3110.github.io/SIH/](https://kunalgupta3110.github.io/SIH/)**
> 
> *Direct browser access — zero installation required. Includes interactive 3D Digital Twin, Real Threat Video Case Players, Retrospective Forensic Uploader, and 1-Click Court Dossier Export.*

---

## 1. Problem Statement & Operational Context
Traditional border surveillance deployments (such as SSB Checkposts and Border Out Posts) suffer from three critical shortcomings:
1. **Camera-Isolated Detections:** Standard CCTV monitors treat each camera independently. When a hostile target crosses camera boundaries, visual tracking is lost.
2. **Alert Fatigue (Single-Frame Detection Spam):** Raw object detectors fire alerts for every single frame a target appears, inundating operators with hundreds of redundant notifications.
3. **Opaque Black-Box Scoring & Tamperable Logs:** Deep learning detectors fail to explain *why* an alert was escalated, and conventional database logs can be surreptitiously modified after an incident.

**IBVAP Sentinel** transforms existing CCTV infrastructure into a predictive, multi-camera intelligence network with spatio-temporal incident correlation, explainable factorized threat scoring, and tamper-evident SHA-256 Merkle chain evidence sealing.

---

## 2. End-to-End System Architecture

```
[ Edge Video Feeds / RTSP / Local MP4 ]
                  │
                  ▼
[ YOLOv8 Object Detection (Edge Optimized) ]
                  │
                  ▼
[ ByteTrack Multi-Object Kinematic Tracker ]
                  │
                  ▼
[ Spatio-Temporal Behavior & Anomaly Engine ] ──► (Optional Isolation Forest Baseline)
                  │
                  ▼
[ Camera Topology Graph & Predictive Handoff ]
                  │ (Kinematic Heading + Transit ETA Windows)
                  ▼
[ Appearance Re-ID (4-Stage Candidate Cascade) ]
                  │ (All Tracks -> Spatial Graph -> Temporal Window -> Top-1 Cosine)
                  ▼
[ Spatio-Temporal Incident Correlation & Debouncing ]
                  │ (Aggregates atomic Events into unified Incidents)
                  ▼
[ Factorized Explainable Threat Scoring (0-100) ]
                  │ (Mathematical rule-based points breakdown)
                  ▼
[ Cryptographic SHA-256 Merkle Evidence Ledger ]
                  │ (Genesis Anchor + Immutable Hash Chain)
                  ▼
[ React 18 Tactical Console (Three.js 3D Digital Twin) + Flutter Field App ]
```

---

## 3. Core Feature Breakdown (No Feature Theatre)

*All features correspond to actual, executing code. Simulated data is explicitly labeled.*

- **Predictive Multi-Camera Handoff:** Graph-based topological routing calculates target exit vectors and predicted arrival windows $[t_{min}, t_{max}]$, reducing Re-ID search spaces by up to $85\%$.
- **Spatio-Temporal Incident Correlation:** Debounces per-frame detections and groups multiple related events across different cameras into a single unified `INC-XXXX` narrative.
- **Factorized Explainable Threat Matrix (0-100):** Explicit mathematical point weights for Red Zone Penetration ($+30$), Rapid Approach Vector ($+20$), Loitering Dwell ($+15$), Cross-Camera Continuation ($+12$), and Night Curfew ($+10$).
- **Cryptographic Merkle Evidence Ledger:** Every confirmed incident is hashed and linked to previous incident blocks with SHA-256 and genesis anchor, verifiable via `/integrity/verify`.
- **Three.js 3D Tactical Digital Twin:** Full 3D terrain wireframe with camera watchtowers, FoV cones, red-zone geofence, and toggleable 2D vector GIS map.
- **AI Model Zoo & Edge Benchmarking:** Real-time FPS, inference latency diagnostics, and site-specific false-alarm threshold sliders.

---

## 4. AI & Vision Pipeline

1. **Object Detection:** YOLOv8s optimized for human and vehicle classes with sub-20ms inference latency.
2. **Kinematic Tracking:** ByteTrack multi-object association maintaining track continuity through temporary occlusions.
3. **Appearance Re-ID:** 512-D L2-normalized feature embeddings (ResNet18 / OSNet) with color-spatial histogram fallback.

---

## 5. Predictive Camera Handoff & Topology Graph

Rather than performing unconstrained brute-force searches across all network cameras, the predictive handoff engine applies kinematic constraints:
$$ec{v} = rac{\Delta ec{x}}{\Delta t}, \quad t_{arrival} \in \left[rac{d_{edge}}{|ec{v}|} - \Delta t, \; rac{d_{edge}}{|ec{v}|} + \Delta tight]$$

### 4-Stage Candidate Filtering Cascade
1. **Stage 1 (Global Pool):** All candidate tracks across the border zone ($N pprox 100$).
2. **Stage 2 (Spatial Adjacency):** Tracks on cameras topologically connected in the direction of heading ($K_1 pprox 8$).
3. **Stage 3 (Temporal Window):** Tracks appearing within the calculated arrival ETA window ($K_2 pprox 3$).
4. **Stage 4 (Cosine Appearance Match):** Top-1 matching track ($1$ verified match).

---

## 6. Spatio-Temporal Incident Correlation & Debouncing

- **Atomic Event:** A single detection or zone crossing on a specific camera (`ZONE_ENTRY`, `LOITERING_THRESHOLD_EXCEEDED`).
- **Unified Incident:** A correlated chain of events across time and space.
- **Debouncing:** Continuous presence of a track within a zone updates the active incident duration rather than firing hundreds of duplicate alerts.

---

## 7. Factorized Explainable Threat Scoring

| Factor | Points | Evaluation Metric |
| :--- | :---: | :--- |
| **Restricted Red Zone Penetration** | `+30` | Centroid within polygon geofence |
| **Perimeter Tripwire Crossing** | `+25` | Target vector intersects directional boundary |
| **Rapid Approach Vector** | `+20` | Kinematic velocity $\ge 90	ext{ px/s}$ |
| **Static Loitering Dwell** | `+15` | Target stationary in caution corridor $\ge 3.0	ext{s}$ |
| **Cross-Camera Re-ID Match** | `+12` | Spatio-temporal handoff confirmed on neighbor node |
| **Unusual Night Curfew Window** | `+10` | Timestamp between 20:00 - 05:00 IST |

*Final Threat Score is clamped to $[0, 100]$. Thresholds: CRITICAL ($\ge 70$), WARNING ($40-69$), INFO ($0-39$).*

---

## 8. SHA-256 Cryptographic Evidence Chain

Every sealed incident creates an immutable block:
$$	ext{Block}_n = 	ext{SHA-256}\Big(	ext{Hash}_{n-1} + 	ext{SHA-256}(	ext{CanonicalJSON}(	ext{Payload}_n))\Big)$$

- **Genesis Value:** `sentinel::genesis::ssb-gurdaspur::2026`
- **Verification Endpoint:** `GET /integrity/verify` checks link-by-link integrity and isolates exact tamper locations.

---

## 9. Offline & Edge Architecture

- **100% Offline Capable:** Zero mandatory internet connection, zero external LLM API calls, zero cloud dependencies.
- **Graceful CPU Degradation:** Operates with pure OpenCV and statistical kinematics if CUDA GPUs are absent.
- **Local Storage:** SQLite in WAL (Write-Ahead Logging) mode with parameterized queries.

---

## 10. Installation & Quickstart

### Prerequisites
- Python 3.10+
- Node.js 18+ (for frontend console)

### Setup
```bash
# 1. Clone repository
git clone https://github.com/KunalGupta3110/SIH.git
cd SIH

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Build React Tactical Console
cd frontend
npm install
npm run build
cd ..
```

---

## 11. Interactive Demo Guide

Run the unified single-command launcher:
```bash
# Launch Master Ecosystem (Backend + React Tactical Console on http://localhost:8000)
python run.py

# Or launch specific deterministic evaluation scenarios:
python run.py --demo 1   # Scenario 1: Restricted Red Zone Incursion
python run.py --demo 2   # Scenario 2: Cross-Camera Re-ID & Predictive Handoff
python run.py --demo 3   # Scenario 3: Camera Health Failure & Stream Freeze Detection
python run.py --demo 4   # Scenario 4: Caution Corridor Loitering & Kinematic Anomaly
python run.py --demo 5   # Scenario 5: Forensic Incident Reconstruction
python run.py --demo 6   # Scenario 6: High-Speed Vehicle Checkpoint Breach & ANPR
python run.py --demo 7   # Scenario 7: Live Multi-Camera Real World Tester
```

---

## 12. REST API Documentation

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/edge/status` | Edge node operational health, armed state, and FPS |
| `GET` | `/edge/cameras` | Active camera list with GPS locations and zone topologies |
| `GET` | `/camera/health` | Real camera diagnostic states (`ONLINE`, `FROZEN`, `OFFLINE`) |
| `POST` | `/events` | Ingest edge detection event with idempotent correlation |
| `GET` | `/incidents` | List all correlated multi-camera incidents with narrative stories |
| `POST` | `/incidents/{id}/acknowledge` | Operator triage decision (`CONFIRMED` / `DISMISSED_FP`) |
| `GET` | `/integrity/verify` | Cryptographic SHA-256 Merkle chain integrity verification |
| `GET` | `/evidence/capsule/{id}` | Export court-admissible forensic JSON evidence capsule |
| `POST` | `/siren/silence` | Operator siren override and hardware silence trigger |

---

## 13. System Performance & Latency Benchmarks

*Measured on standard workstation hardware via `python tools/benchmark.py`:*

```
======================================================================
 [SUMMARY] BENCHMARK PROFILE
======================================================================
  * Re-ID Feature Extraction:        0.398 ms
  * 4-Stage Candidate Cascade:       0.138 ms
  * Explainable Threat Scoring:      0.0029 ms (348,000+ evals/sec)
  * SHA-256 Block Seal Latency:      0.0093 ms/block
  * 100-Block Integrity Verify:      0.243 ms
  * Edge Operational Readiness:      PASS (Zero Cloud Latency)
======================================================================
```

---

## 14. Testing & Verification

Run the master acceptance test suite:
```bash
# 1. Master Acceptance Suite (5/5 Criteria)
python tests/test_master_acceptance.py

# 2. Failure Mode & Graceful Degradation Suite
python tests/test_failure_modes.py

# 3. Performance & Throughput Benchmark
python tools/benchmark.py
```

---

## 15. Operational Limitations
- **Extreme Weather (Heavy Fog/Blizzard):** Optical CCTV feeds degrade in zero-visibility conditions; thermal LWIR camera feeds are recommended for extreme weather.
- **Severe Occlusion:** Heavy foliage or structural blind spots between camera nodes requires calibration of maximum transit ETA windows.

---

## 16. Future Scope & SSB Deployment Roadmap
- **PTZ Autonomous Slew-to-Cue:** Automatic motor tracking aligning neighboring PTZ cameras toward predicted handoff coordinates.
- **Multi-Agency Mesh Sync:** Secure peer-to-peer sync across BOPs using encrypted offline radio packets.
