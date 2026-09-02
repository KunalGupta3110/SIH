# SIH 2026 Pitch Deck Guide: IBVAP
**Problem Statement ID:** 26187  
**Department:** Ministry of Home Affairs / Sashastra Seema Bal (SSB)  
**Project Name:** IBVAP — Intelligent Border Video Analytics Platform

---

## Slide 1: Title & Team
- **Title:** IBVAP — Intelligent Border Video Analytics Platform
- **Tagline:** Upgrading existing border CCTV infrastructure into an autonomous intelligence network.
- **Team Name & Member Roles:**
  - Lead / CV Pipeline
  - Re-ID & Feature Matching Specialist
  - Alert & Geofencing Engineer
  - Full-Stack Dashboard Developer

---

## Slide 2: The Problem (MHA / SSB Real Challenge)
- Border Out Posts (BOPs) and check posts have hundreds of standard IP cameras.
- **Current Limitation:** They only record passive video. Continuous human observation leads to fatigue and missed incursions.
- **Cost Barrier:** Specialized military AI hardware costs lakhs per camera — impossible to scale across thousands of kilometers of borders.

---

## Slide 3: Our Solution — IBVAP
- **100% Software-Based:** Works directly with existing RTSP/IP CCTV camera feeds without purchasing new camera hardware.
- **Lightweight Edge Inference:** Runs smoothly on CPU or low-cost edge nodes (Jetson/Intel).
- **Explainable AI Rules:** Polygon forbidden zones, directional tripwires, and loitering timers with zero black-box confusion.

---

## Slide 4: Our Unfair Advantage / Key Differentiator 🌟
### **Cross-Camera Re-Identification (Re-ID)**
- Most surveillance platforms treat cameras in isolation (single-camera detection).
- **IBVAP connects the network:** When a suspect or vehicle appears on Check Post Alpha and 10 minutes later reaches BOP Bravo, IBVAP extracts appearance embeddings and automatically stitches their complete movement trajectory.

---

## Slide 5: System Pipeline Architecture
- **Stage 1 (Detection):** YOLOv8n (Human, Vehicle detection at 30+ FPS).
- **Stage 2 (Tracking):** ByteTrack (Persistent Track IDs and motion breadcrumbs).
- **Stage 3 (Spatial Rules):** 2D vector tripwires & polygon containment.
- **Stage 4 (Re-ID Engine):** 512-dim Normalized ResNet18/OSNet feature matching.
- **Stage 5 (Command Center):** Streamlit Command Dashboard with instantaneous alert triage.

---

## Slide 6: Live Demonstration Workflow (Script for Stage)
1. **Show Streamlit Dashboard:** Point out the live multi-camera feeds and real-time status banner.
2. **Trigger Intrusion on Cam 1:** Target walks across the perimeter tripwire $\rightarrow$ Instantly flashes `[CRITICAL] TRIPWIRE_CROSS` with a snapshot.
3. **Show Loitering Alert:** Target stays inside the forbidden Red Zone $>3$s $\rightarrow$ Generates `[WARNING] LOITERING` alert.
4. **Demonstrate Cross-Camera Re-ID (The Wow Factor):** Switch to Tab 3 to show how the suspect on Cam 1 is re-identified when appearing on Cam 2, plotting their chronological journey.

---

## Slide 7: Future Roadmap (Post-Hackathon)
- ANPR integration for border vehicle checkpoints.
- Thermal / Night-vision fusion for extreme low-light terrain.
- Blockchain-backed tamper-proof forensic audit logging.

---

## Slide 8: Q&A / Evaluation Summary
- **Cost:** \$0 additional hardware cost.
- **Bandwidth:** Only alerts and metadata are transmitted to HQ, not continuous heavy 24/7 video streams.
- **Accuracy:** Tested with multi-shot appearance galleries for high robustness.
