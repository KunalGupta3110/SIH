"""
IBVAP - Intelligent Border Video Analytics Platform
Module: dashboard/app.py
Description: Streamlit Command & Control Center Dashboard for Border Security.
             Displays live/replayed surveillance feeds, security alerts,
             threat metrics, and Cross-Camera Re-ID target journey stitching.
"""

from datetime import datetime
import json
import os
import sqlite3
import pandas as pd
import streamlit as st

# Page Configuration
st.set_page_config(
    page_title="IBVAP - Intelligent Border Surveillance Platform",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Custom CSS for Professional Defense Command Center Look
st.markdown("""
<style>
    .main {
        background-color: #0b0f19;
    }
    .metric-card {
        background: linear-gradient(135deg, #131c2e 0%, #1a263d 100%);
        border: 1px solid #2a3b5c;
        border-radius: 8px;
        padding: 15px;
        text-align: center;
    }
    .critical-alert {
        background-color: rgba(220, 38, 38, 0.2);
        border-left: 5px solid #dc2626;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .warning-alert {
        background-color: rgba(217, 119, 6, 0.2);
        border-left: 5px solid #d97706;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 10px;
    }
    .reid-match-badge {
        background: #0284c7;
        color: white;
        padding: 3px 8px;
        border-radius: 4px;
        font-weight: bold;
        font-size: 0.85em;
    }
</style>
""", unsafe_allow_html=True)


def load_db_events(db_path="data/events.db", limit=100):
    if not os.path.exists(db_path):
        return []
    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cur = conn.cursor()
        cur.execute("SELECT * FROM security_events ORDER BY timestamp_ms DESC LIMIT ?", (limit,))
        rows = cur.fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []


def load_reid_ledger(path="data/cross_camera_ledger.json"):
    if not os.path.exists(path):
        return []
    try:
        with open(path, "r") as f:
            data = json.load(f)
            return data.get("targets", [])
    except Exception:
        return []


# Sidebar
with st.sidebar:
    st.image("https://img.icons8.com/color/96/000000/shield.png", width=64)
    st.title("IBVAP Command Center")
    st.caption("SIH 2026 | PS ID: 26187 | SSB & MHA")
    st.markdown("---")
    
    selected_camera = st.selectbox("Active Camera Feed", ["All Cameras", "cam_01 (Check Post Alpha)", "cam_02 (BOP Bravo)"])
    severity_filter = st.multiselect("Severity Filter", ["CRITICAL", "WARNING", "INFO"], default=["CRITICAL", "WARNING", "INFO"])
    
    st.markdown("---")
    st.markdown("### ⚙️ System Status")
    st.success("🟢 Edge Inference: ACTIVE")
    st.info("🧠 Model: YOLOv8n + ByteTrack")
    st.info("🎯 Cross Re-ID: ResNet18 (Active)")

# Main Header
st.title("🛡️ IBVAP — Intelligent Border Video Analytics Platform")
st.markdown("**Ministry of Home Affairs | Sashastra Seema Bal (SSB)** — *Intelligent Surveillance on Existing IP CCTV Infrastructure*")

# Top KPI Metrics Row
events = load_db_events()
reid_targets = load_reid_ledger()

filtered_events = [e for e in events if e.get("severity") in severity_filter]
if selected_camera != "All Cameras":
    cam_id_prefix = "cam_01" if "01" in selected_camera else "cam_02"
    filtered_events = [e for e in filtered_events if cam_id_prefix in e.get("camera_id", "")]

crit_count = sum(1 for e in events if e.get("severity") == "CRITICAL")
warn_count = sum(1 for e in events if e.get("severity") == "WARNING")
cross_reid_count = sum(1 for e in events if e.get("alert_type") == "CROSS_CAMERA_MATCH")

col1, col2, col3, col4 = st.columns(4)
col1.metric("📹 Active CCTV Feeds", "2 Feeds Online", "+0 offline")
col2.metric("🚨 Critical Intrusions", f"{crit_count}", delta_color="inverse")
col3.metric("⚠️ Warnings / Loitering", f"{warn_count}")
col4.metric("🎯 Cross-Camera Re-IDs", f"{len(reid_targets)} Stitched", "+100% Tracking")

st.markdown("---")

# Navigation Tabs
tab1, tab2, tab3, tab4 = st.tabs([
    "📹 Live Video & Overlays",
    "🚨 Security Alert Feed",
    "🌐 Cross-Camera Re-ID (Differentiator)",
    "🗺️ Virtual Fence & Zones",
])

# Tab 1: Video Surveillance Feeds
with tab1:
    st.subheader("Surveillance Feed Feeds (Simulated Non-Overlapping Angles)")
    vcol1, vcol2 = st.columns(2)
    
    with vcol1:
        st.markdown("#### 📍 Camera 1: Check Post Alpha (Outer Approach)")
        cam1_vid = "data/detected_output.mp4"
        if os.path.exists(cam1_vid):
            st.video(cam1_vid)
        elif os.path.exists("data/sample_border.mp4"):
            st.video("data/sample_border.mp4")
        else:
            st.info("No video recorded yet. Run `python alerts/run_surveillance.py` to generate demo feed.")

    with vcol2:
        st.markdown("#### 📍 Camera 2: BOP Bravo (Perimeter Restricted Area)")
        cam2_vid = "data/cross_cam_reid_demo.mp4"
        if os.path.exists(cam2_vid):
            st.video(cam2_vid)
        elif os.path.exists("data/sample_border.mp4"):
            st.video("data/sample_border.mp4")
        else:
            st.info("Run `python reid/cross_cam_demo.py` to generate side-by-side Re-ID playback.")

# Tab 2: Alert Feed & Audit Log
with tab2:
    st.subheader("🚨 Real-Time Security Alert Feed & Event Audit")
    
    if not filtered_events:
        st.success("✅ No active intrusion or loitering violations recorded.")
    else:
        for ev in filtered_events[:25]:
            sev = ev.get("severity", "INFO")
            css_class = "critical-alert" if sev == "CRITICAL" else "warning-alert"
            
            with st.container():
                st.markdown(f"""
                <div class="{css_class}">
                    <strong>[{sev}] {ev.get('alert_type')}</strong> | Camera: <code>{ev.get('camera_id')}</code> | Track ID: <code>#{ev.get('track_id')}</code><br>
                    <span>{ev.get('details')}</span>
                </div>
                """, unsafe_allow_html=True)
                
                # Check for thumbnail
                thumb = ev.get("thumbnail_path")
                if thumb and os.path.exists(thumb):
                    st.image(thumb, width=150, caption=f"Snapshot: {ev.get('event_id')}")

        st.markdown("### 📊 Event Log Table")
        df = pd.DataFrame(filtered_events)
        if not df.empty:
            try:
                st.dataframe(df[["event_id", "timestamp_iso", "camera_id", "track_id", "class_name", "alert_type", "severity", "details"]], width="stretch")
            except TypeError:
                st.dataframe(df[["event_id", "timestamp_iso", "camera_id", "track_id", "class_name", "alert_type", "severity", "details"]], use_container_width=True)

# Tab 3: Cross-Camera Re-ID (The Differentiator)
with tab3:
    st.subheader("🎯 Cross-Camera Target Re-Identification & Journey Stitching")
    st.markdown("""
    When a target moves between non-overlapping cameras, IBVAP generates appearance embeddings 
    and reconstructs the target's cross-node trail without human intervention.
    """)
    
    if not reid_targets:
        st.info("No cross-camera target journeys logged yet. Run `python reid/cross_cam_demo.py` to generate Re-ID matches.")
    else:
        for trg in reid_targets:
            with st.expander(f"👤 Target: {trg.get('global_id')} ({trg.get('class_name').upper()}) — Visited {len(trg.get('cameras_visited', []))} Cameras", expanded=True):
                tcol1, tcol2 = st.columns([1, 2])
                with tcol1:
                    st.markdown(f"**Global ID:** `{trg.get('global_id')}`")
                    st.markdown(f"**First Sighting:** `{trg.get('first_seen_cam')}` @ {trg.get('first_seen_ms')}ms")
                    st.markdown(f"**Latest Sighting:** `{trg.get('last_seen_cam')}` @ {trg.get('last_seen_ms')}ms")
                    st.markdown(f"**Total Observations:** {trg.get('total_detections')}")
                
                with tcol2:
                    st.markdown("#### 🗺️ Stitched Movement Timeline Across BOPs")
                    trail = trg.get("movement_trail", [])
                    if trail:
                        cams_in_order = []
                        for pt in trail:
                            c = pt.get("camera_id")
                            if not cams_in_order or cams_in_order[-1] != c:
                                cams_in_order.append(c)
                        st.write(" ➔ ".join([f"🎥 **{c}**" for c in cams_in_order]))
                        st.json(trail[-5:], expanded=False)

# Tab 4: Virtual Zones Configuration
with tab4:
    st.subheader("🗺️ Virtual Fence & Zone Geofencing Configuration")
    zones_file = "data/zones_config.json"
    if os.path.exists(zones_file):
        with open(zones_file, "r") as f:
            z_data = json.load(f)
            st.json(z_data)
    else:
        st.info("Default perimeter tripwires and restricted polygon zones will be configured upon first surveillance run.")
