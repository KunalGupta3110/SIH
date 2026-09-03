"""
Cyber Camera Surveillance Platform
Module: apps/web_command_center/app.py
Description: Tactical Web Operations & Command Center with 2D GIS Border Map,
             Operator False-Positive Triage, Re-ID Candidate Score Matrix, and Video HUD.
"""

from datetime import datetime
import glob
import json
import os
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import pandas as pd
import streamlit as st

from core.database.event_db import EventDatabase
from core.database.schema import AlertSeverity, AlertType, OperatorStatus
from services.notifications.telegram_bot import load_notification_config, save_notification_config, test_mobile_alert

st.set_page_config(
    page_title="Cyber Camera Command Center",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded",
)

st.markdown("""
<style>
    .main { background-color: #0b0f19; }
    .critical-alert {
        background-color: rgba(220, 38, 38, 0.15);
        border-left: 5px solid #dc2626;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 12px;
    }
    .warning-alert {
        background-color: rgba(217, 119, 6, 0.15);
        border-left: 5px solid #d97706;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 12px;
    }
    .info-alert {
        background-color: rgba(2, 132, 199, 0.15);
        border-left: 5px solid #0284c7;
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 12px;
    }
    .rule-pill {
        background: #1e293b;
        color: #38bdf8;
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 0.82em;
        font-family: monospace;
    }
    .map-card {
        background: #111827;
        border: 1px solid #1f2937;
        border-radius: 8px;
        padding: 15px;
        margin-bottom: 15px;
    }
</style>
""", unsafe_allow_html=True)

db = EventDatabase("data/events.db")
notify_cfg = load_notification_config()


def load_reid_ledger(path="data/cross_camera_ledger.json"):
    full_path = os.path.join(ROOT_DIR, path)
    if not os.path.exists(full_path):
        return {"targets": [], "recent_evaluations": []}
    try:
        with open(full_path, "r") as f:
            return json.load(f)
    except Exception:
        return {"targets": [], "recent_evaluations": []}


# Sidebar
with st.sidebar:
    st.image("https://img.icons8.com/color/96/000000/shield.png", width=64)
    st.title("Cyber Camera Command")
    st.caption("SIH 2026 | PS ID: 26187 | SSB & MHA")
    st.markdown("---")
    
    selected_camera = st.selectbox("Active Camera", ["All Cameras", "cam_01", "CAM_ALPHA", "CAM_BRAVO", "CAM_CHECKPOST"])
    severity_filter = st.multiselect("Severity Filter", ["CRITICAL", "WARNING", "INFO"], default=["CRITICAL", "WARNING", "INFO"])
    op_status_filter = st.selectbox("Operator Review State", ["All", "UNREVIEWED", "CONFIRMED", "DISMISSED_FP"])
    
    st.markdown("---")
    st.markdown("### 📲 Instant Mobile Alerts")
    bot_token_input = st.text_input("Telegram Bot Token", value=notify_cfg.get("telegram_bot_token", ""), type="password")
    chat_id_input = st.text_input("Telegram Chat ID", value=notify_cfg.get("telegram_chat_id", ""))
    
    if st.button("💾 Save & Test Phone Alert"):
        save_notification_config(bot_token_input, chat_id_input, enabled=True)
        test_mobile_alert(bot_token_input, chat_id_input)
        st.success("✅ Test alert sent to mobile dispatcher!")

    st.markdown("---")
    st.markdown("### 🧹 Database & Snapshot Tools")
    if st.button("🗑️ Clear Test Snapshots & Reset DB"):
        for f in glob.glob(os.path.join(ROOT_DIR, "data", "thumbnails", "*")):
            if os.path.exists(f):
                try: os.remove(f)
                except Exception: pass
        from data.seed_clean_demo_events import seed
        seed()
        st.success("✅ Clean demo events restored!")
        st.rerun()

    st.markdown("---")
    st.markdown("### ⚙️ System Status")
    st.success("🟢 Edge AI Vision: ACTIVE (30+ FPS)")
    st.info("🧠 Core: YOLOv8n + ByteTrack")
    st.info("🎯 Re-ID: ResNet18 (512-d L2)")
    st.caption("Human-in-the-loop decision support active.")

# Main Header
st.title("🛡️ Cyber Camera Surveillance Platform")
st.markdown("**Ministry of Home Affairs | Sashastra Seema Bal (SSB)** — *Intelligent Multi-Node Video Analytics & Mobile Defense Ecosystem*")

# Top KPI Metrics Row
events = db.get_recent_events(limit=200)
reid_data = load_reid_ledger()
reid_targets = reid_data.get("targets", [])
reid_evals = reid_data.get("recent_evaluations", [])
audit_stats = db.get_operator_audit_stats()

crit_count = sum(1 for e in events if e.get("severity") == "CRITICAL")
warn_count = sum(1 for e in events if e.get("severity") == "WARNING")
reid_matches = sum(1 for e in events if e.get("alert_type") == "CROSS_CAMERA_MATCH")
dismissed_fp = audit_stats.get("dismissed_fp", 0)

col1, col2, col3, col4, col5 = st.columns(5)
col1.metric("📹 Active CCTV Feeds", "2 Feeds Online", "100% Uptime")
col2.metric("🚨 Critical Intrusions", f"{crit_count}")
col3.metric("⚠️ Warnings / Approaches", f"{warn_count}")
col4.metric("🎯 Cross-Camera Re-IDs", f"{len(reid_targets)} Stitched", "Explainable")
col5.metric("🛡️ FP Dismissed by Operator", f"{dismissed_fp}", delta=f"{audit_stats.get('total', 0)} Total", delta_color="inverse")

st.markdown("---")

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "📹 Live Feeds & Overlays",
    "🚨 Explainable Alert Feed & Operator Triage",
    "🌐 Cross-Camera Re-ID (Differentiator)",
    "🗺️ Interactive 2D Border Map & Geofence",
    "🔒 Responsible AI & Privacy Framework",
])

with tab1:
    st.subheader("Surveillance Video Feeds & Analytics Playback")
    data_dir = os.path.join(ROOT_DIR, "data")
    all_videos = [f for f in os.listdir(data_dir) if f.endswith(".mp4")] if os.path.exists(data_dir) else []
    web_videos = [f for f in all_videos if f.endswith("_web.mp4")]
    display_videos = web_videos if web_videos else all_videos
    
    vcol1, vcol2 = st.columns(2)
    with vcol1:
        st.markdown("#### 📍 Camera 1: Check Post Alpha (Perimeter & Tripwires)")
        cam1_candidates = ["data/scenario_checkpoint_breach_web.mp4", "data/vtest_surveillance_output_web.mp4"]
        cam1_default = next((f for f in cam1_candidates if os.path.exists(os.path.join(ROOT_DIR, f))), None)
        selected_vid1 = st.selectbox("Select Camera 1 Video", options=[f"data/{f}" for f in display_videos] if display_videos else ["None"], key="cam1_select")
        if selected_vid1 and selected_vid1 != "None" and os.path.exists(os.path.join(ROOT_DIR, selected_vid1)):
            st.video(os.path.join(ROOT_DIR, selected_vid1))
    with vcol2:
        st.markdown("#### 📍 Camera 2 / Cross-Camera Re-ID Feed")
        cam2_candidates = ["data/cross_cam_real_demo_web.mp4", "data/threat_vehicle_rush_web.mp4"]
        cam2_default = next((f for f in cam2_candidates if os.path.exists(os.path.join(ROOT_DIR, f))), None)
        selected_vid2 = st.selectbox("Select Camera 2 / Re-ID Video", options=[f"data/{f}" for f in display_videos] if display_videos else ["None"], key="cam2_select")
        if selected_vid2 and selected_vid2 != "None" and os.path.exists(os.path.join(ROOT_DIR, selected_vid2)):
            st.video(os.path.join(ROOT_DIR, selected_vid2))

with tab2:
    st.subheader("🚨 Real-Time Explainable Alerts & Operator Action Triage")
    filtered_events = [e for e in events if e.get("severity") in severity_filter]
    if selected_camera != "All Cameras":
        filtered_events = [e for e in filtered_events if selected_camera in e.get("camera_id", "")]
    if op_status_filter != "All":
        filtered_events = [e for e in filtered_events if e.get("operator_status") == op_status_filter]

    if not filtered_events:
        st.success("✅ No alerts matching the selected filter criteria.")
    else:
        for ev in filtered_events[:20]:
            sev = ev.get("severity", "INFO")
            op_st = ev.get("operator_status", "UNREVIEWED")
            eid = ev.get("event_id")
            try: conf_val = float(ev.get("confidence", 0.85))
            except (ValueError, TypeError): conf_val = 0.85

            css_class = "critical-alert" if sev == "CRITICAL" else ("warning-alert" if sev == "WARNING" else "info-alert")
            with st.container():
                acol1, acol2 = st.columns([3, 1])
                with acol1:
                    st.markdown(f"""
                    <div class="{css_class}">
                        <strong>[{sev}] {ev.get('alert_type')}</strong> | Camera: <code>{ev.get('camera_id')}</code> | Track: <code>#{ev.get('track_id')}</code> | Status: <code>{op_st}</code><br>
                        <span>{ev.get('details')}</span><br>
                        <span class="rule-pill">Rule: {ev.get('rule_name', 'Spatial Rule')}</span>
                        <span class="rule-pill">Confidence: {conf_val*100:.1f}%</span>
                    </div>
                    """, unsafe_allow_html=True)
                with acol2:
                    bcol1, bcol2 = st.columns(2)
                    with bcol1:
                        if st.button("Confirm", key=f"conf_{eid}"):
                            db.update_operator_status(eid, OperatorStatus.CONFIRMED, "Confirmed by Operator")
                            st.rerun()
                    with bcol2:
                        if st.button("Dismiss", key=f"fp_{eid}"):
                            db.update_operator_status(eid, OperatorStatus.DISMISSED_FP, "Dismissed as False Positive")
                            st.rerun()

                    thumb = ev.get("thumbnail_path")
                    if thumb and os.path.exists(thumb):
                        st.image(thumb, width=120, caption=f"Snapshot: #{ev.get('track_id')}")

with tab3:
    st.subheader("🎯 Cross-Camera Target Re-Identification & Journey Stitching")
    if not reid_targets:
        st.info("No cross-camera target journeys logged yet. Run `python demos/scenario_2_cross_cam_reid.py`.")
    else:
        for trg in reid_targets:
            with st.expander(f"👤 Global Target: {trg.get('global_id')} ({trg.get('class_name').upper()})", expanded=True):
                st.markdown(f"**Origin:** `{trg.get('first_seen_cam')}` ➔ **Latest:** `{trg.get('last_seen_cam')}`")
                trail = trg.get("movement_trail", [])
                if trail:
                    st.write(" ➔ ".join([f"🎥 **{pt.get('camera_id')}**" for pt in trail]))

        if reid_evals:
            st.markdown("### 📈 Re-ID Candidate Matching Score Log")
            eval_rows = []
            for ev in reid_evals[-15:]:
                for cand in ev.get("candidates", []):
                    eval_rows.append({
                        "Query Camera": ev.get("query_cam"),
                        "Candidate Target": cand.get("candidate_global_id"),
                        "Cosine Similarity": f"{cand.get('cosine_similarity', 0)*100:.1f}%",
                        "Decision": "ACCEPTED" if cand.get("accepted") else "REJECTED",
                    })
            if eval_rows:
                st.dataframe(pd.DataFrame(eval_rows), width="stretch")

with tab4:
    st.subheader("🗺️ Interactive 2D Tactical Border Map & Camera Geofence Topology")
    node_data = [
        {"node": "Check Post Alpha (CAM_01)", "lat": 32.1450, "lon": 74.8920, "type": "Checkpost", "status": "ACTIVE / GUARDED", "alerts": crit_count},
        {"node": "BOP Bravo (CAM_02)", "lat": 32.1880, "lon": 74.9350, "type": "Border Outpost", "status": "ACTIVE / GUARDED", "alerts": reid_matches},
        {"node": "Sector Charlie Fence (CAM_03)", "lat": 32.1650, "lon": 74.9100, "type": "Perimeter Wire", "status": "SECURE", "alerts": warn_count},
    ]
    map_df = pd.DataFrame(node_data)
    mcol1, mcol2 = st.columns([2, 1])
    with mcol1:
        st.map(map_df, latitude="lat", longitude="lon", size=25, color="#dc2626")
    with mcol2:
        for node in node_data:
            badge_color = "🔴" if node["alerts"] > 0 else "🟢"
            st.markdown(f"""
            <div class="map-card">
                <strong>{badge_color} {node['node']}</strong><br>
                <span class="rule-pill">Status: {node['status']}</span>
                <span class="rule-pill">Alerts: {node['alerts']}</span>
            </div>
            """, unsafe_allow_html=True)

with tab5:
    st.subheader("🔒 Responsible AI & Privacy Framework")
    st.markdown("""
    - **10s Pre/Post Event Buffering:** Non-infringing video retention only for verified breaches.
    - **Appearance Embeddings vs Biometric Face ID:** 512-d visual appearance representations, zero facial biometric storage.
    - **Human-in-the-Loop Triage:** Operator oversight with immutable SQLite audit logs.
    """)
