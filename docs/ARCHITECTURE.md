# IBVAP — System Architecture & Technical Specifications

**PS ID:** 26187 | **Organization:** Ministry of Home Affairs / SSB | **Platform:** IBVAP

---

## 1. High-Level Architecture Pipeline

```
               [ Standard IP CCTV Cameras (RTSP/ONVIF) ]
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────┐
        │                 EDGE INFERENCE NODE                  │
        │                                                      │
        │   1. Detection: YOLOv8n (Quantized / CPU-Optimized)  │
        │   2. Single-Camera Tracking: ByteTrack (Persistent)  │
        │   3. Geofencing: Polygons & Virtual Tripwires        │
        │   4. Re-ID Embedding Extraction: ResNet18 / OSNet    │
        └──────────────────────────┬───────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 ▼                                   ▼
  ┌──────────────────────────────┐    ┌──────────────────────────────┐
  │   CROSS-CAMERA RE-ID ENGINE  │    │      ALERT & EVENT ENGINE    │
  │                              │    │                              │
  │ • Temporal Gallery Window    │    │ • Severity Tiering           │
  │ • Cosine Appearance Matching │    │ • Loitering & Direction Dets │
  │ • Multi-Camera Path Stitch   │    │ • SQLite Ledger & Thumbnails │
  └──────────────┬───────────────┘    └──────────────┬───────────────┘
                 │                                   │
                 └─────────────────┬─────────────────┘
                                   ▼
        ┌──────────────────────────────────────────────────────┐
        │            CENTRAL COMMAND & CONTROL API             │
        │                   (FastAPI Server)                   │
        └──────────────────────────┬───────────────────────────┘
                                   │
                                   ▼
        ┌──────────────────────────────────────────────────────┐
        │         STREAMLIT COMMAND CENTER DASHBOARD           │
        │                                                      │
        │ • Multi-Camera Live Feeds + HUD Overlays             │
        │ • Real-Time Alert Stream with Threat Level Badges    │
        │ • Cross-Camera Target Journey Interactive Map        │
        └──────────────────────────────────────────────────────┘
```

---

## 2. Mathematical Formulation & Core Algorithms

### A. Virtual Tripwire Crossing & Direction
Given a target's consecutive centroids $P_{t-1} = (x_1, y_1)$ and $P_t = (x_2, y_2)$, and tripwire segment $L = (A, B)$:
1. Line segment intersection is tested using 2D orientation cross products:
   $$\text{ccw}(A, B, C) = (C_y - A_y)(B_x - A_x) > (B_y - A_y)(C_x - A_x)$$
2. The crossing vector $\vec{V}_{\text{motion}} = P_t - P_{t-1}$ is evaluated against the tripwire normal $\vec{V}_{\text{wire}}$ using:
   $$\text{Cross} = V_{\text{wire}, x} \cdot V_{\text{motion}, y} - V_{\text{wire}, y} \cdot V_{\text{motion}, x}$$
   - If $\text{Cross} > 0 \implies \text{INBOUND\_BORDER}$ (Critical Threat)
   - If $\text{Cross} \le 0 \implies \text{OUTBOUND\_BORDER}$

### B. Cross-Camera Re-Identification (Appearance Matching)
For a detected target crop $I_{\text{crop}}$, a 512-dimensional feature embedding $\vec{f} \in \mathbb{R}^{512}$ is extracted and $L_2$-normalized:
$$\hat{f} = \frac{\vec{f}}{\|\vec{f}\|_2}$$

Similarity between query embedding $\hat{f}_q$ from Camera $B$ and target gallery $\mathcal{G}_i = \{\hat{e}_1, \hat{e}_2, \dots, \hat{e}_k\}$ from Camera $A$ is:
$$\text{Score}(\hat{f}_q, \mathcal{G}_i) = 0.6 \cdot \max_{j} (\hat{f}_q \cdot \hat{e}_j) + 0.4 \cdot (\hat{f}_q \cdot \bar{e}_i)$$
where $\bar{e}_i$ is the running mean centroid of the target's multi-shot gallery. If $\text{Score} \ge \tau$ (where $\tau = 0.68 - 0.72$), a positive cross-camera match is confirmed.

---

## 3. Hardware & Edge Optimization

| Component | Architecture | Fallback | Inference Latency (CPU) |
|---|---|---|---|
| **Detector** | YOLOv8n (nano) | ONNX / OpenVINO | ~22–35 ms / frame |
| **Tracker** | ByteTrack (Kalman + Hungarian) | IoU Association | ~2–4 ms / frame |
| **Re-ID Extractor** | ResNet18 (Truncated pooling) | MobileNetV3 | ~15–20 ms / crop |
| **Alert Engine** | Spatial Geometry & SQLite | JSON Logs | < 1 ms |
| **Dashboard** | Streamlit + WebRTC / MP4 | FastAPI REST | Real-time |
