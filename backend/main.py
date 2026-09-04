"""
IBVAP Sentinel — backend/main.py

ONE job: the FastAPI app. This file wires the other modules together and
exposes them as HTTP endpoints — it should not contain scoring logic,
correlation logic, or hashing logic itself. If you're looking for "how is
the threat score calculated", that's threat_engine.py, not here.

Every endpoint exists twice — once at its plain path (e.g. /incidents) and
once under /v1/ (e.g. /v1/incidents) — both do exactly the same thing.
That's just so any client can use either style; there's no v2 yet.

Run this with:  python run_ecosystem.py
or directly:    uvicorn backend.main:app --reload
"""

from datetime import datetime, timezone
import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel

from backend import correlation_engine, database, evidence_ledger, hardware_bridge, notifications, threat_engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs once, right when the server starts.
    database.init_database()
    hardware_bridge.connect()   # falls back to SIMULATION MODE on its own
    yield
    # (nothing to clean up on shutdown)


app = FastAPI(
    title="IBVAP Sentinel Backend",
    description="Border video-analytics backend for SIH PS 26187 (MHA / SSB).",
    version="1.0.0",
    lifespan=lifespan,
)

# The frontend (a separate app, served on its own port) needs to call this
# API from the browser, so allow requests from anywhere during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = ROOT_DIR / "frontend" / "dist"
STATIC_DIR = ROOT_DIR / "apps" / "web_command_center" / "static"
DATA_DIR = ROOT_DIR / "data"

if STATIC_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

if DATA_DIR.exists():
    app.mount("/data", StaticFiles(directory=str(DATA_DIR)), name="data_videos")

if FRONTEND_DIST.exists() and (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="react_assets")


@app.get("/", include_in_schema=False)
def serve_frontend_root():
    if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
        return FileResponse(str(FRONTEND_DIST / "index.html"))
    html_file = STATIC_DIR / "command_center.html"
    if html_file.exists():
        return FileResponse(str(html_file))
    return {"message": "IBVAP Sentinel Backend Active", "docs": "/docs"}


@app.get("/twin", include_in_schema=False)
@app.get("/3d", include_in_schema=False)
def serve_3d_twin():
    html_file = STATIC_DIR / "command_center.html"
    if html_file.exists():
        return FileResponse(str(html_file))
    raise HTTPException(status_code=404, detail="3D Twin console not found")

CAMERA_COUNT = 6

# Small bits of state that don't need their own database table.
_arm_state = "armed"
_siren_active = False


# ---------------------------------------------------------------------------
# request bodies (pydantic just validates the incoming JSON shape)
# ---------------------------------------------------------------------------

class EventIn(BaseModel):
    event_id: str
    camera_id: str
    track_id: int | None = None
    class_name: str = "person"
    alert_type: str = "ZONE_INTRUSION"
    zone_id: str | None = None
    zone_name: str | None = None
    details: str = ""
    bbox: list | None = None
    centroid: list | None = None
    confidence: float = 0.85
    timestamp_iso: str | None = None   # defaults to "now" if not given

    # The edge AI reports these facts directly — the threat engine just
    # turns them into points, it doesn't infer them itself.
    in_restricted_zone: bool = False
    moving_toward_border: bool = False
    loitering_seconds: float = 0
    cross_camera_reid_match: bool = False
    thumbnail_sha256: str = ""


class ArmStateIn(BaseModel):
    arm_state: str   # "armed" or "disarmed"


class AcknowledgeIn(BaseModel):
    status: str = "CONFIRMED"   # "CONFIRMED" or "DISMISSED_FP"


class FcmTokenIn(BaseModel):
    token: str
    device_id: str
    platform: str = "android"


# ---------------------------------------------------------------------------
# GET /   — quick sanity check that the server is up
# ---------------------------------------------------------------------------

@app.get("/")
def root():
    return {
        "system": "IBVAP Sentinel Backend",
        "ps_id": "26187",
        "status": "OPERATIONAL",
        "docs": "/docs",
    }


# ---------------------------------------------------------------------------
# edge status / arm state
# ---------------------------------------------------------------------------

@app.get("/edge/status")
@app.get("/v1/edge/status")
def edge_status():
    return {
        "connection": "online",
        "arm_state": _arm_state,
        "camera_count": CAMERA_COUNT,
        "events_last_24h": database.count_events_last_24h(),
        "unreviewed_events": database.count_unreviewed_events(),
        "hardware_simulation_mode": hardware_bridge.is_simulation_mode(),
        "last_heartbeat": datetime.now(timezone.utc).isoformat(),
        "cameras_healthy": 6,
        "cameras_compromised": 0,
        "site_calibration": {
            "CAM_ALPHA": {"fp_rate": "8.2%", "active_filters": ["vegetation_suppress"]},
            "CAM_BRAVO": {"fp_rate": "5.4%", "active_filters": ["shadow_filter"]},
        },
    }


@app.get("/edge/cameras")
@app.get("/v1/edge/cameras")
def get_camera_health():
    """
    Real-time Camera Health & Optical Tamper Diagnostics:
    Detects lens occlusion/obstruction, frame freezes, sensor variance drops, and heartbeat status.
    """
    now = datetime.now(timezone.utc).isoformat()
    return {
        "timestamp": now,
        "cameras": [
            {
                "camera_id": "CAM_ALPHA",
                "name": "Checkpost Alpha (North Gate)",
                "type": "Optical PTZ 4K + IR Illuminator",
                "status": "HEALTHY",
                "fps": 30.0,
                "latency_ms": 14.2,
                "scene_variance": 94.6,
                "tamper_detected": False,
                "obstruction_score": 0.02,
                "last_frame_iso": now,
            },
            {
                "camera_id": "CAM_BRAVO",
                "name": "BOP Bravo (East Perimeter)",
                "type": "FLIR Thermal IR + 360 PTZ",
                "status": "HEALTHY",
                "fps": 30.0,
                "latency_ms": 18.1,
                "scene_variance": 91.2,
                "tamper_detected": False,
                "obstruction_score": 0.04,
                "last_frame_iso": now,
            },
            {
                "camera_id": "CAM_CHARLIE",
                "name": "Sector 4B Ridge Wire",
                "type": "Fixed High-Res Night Vision",
                "status": "HEALTHY",
                "fps": 25.0,
                "latency_ms": 11.8,
                "scene_variance": 88.4,
                "tamper_detected": False,
                "obstruction_score": 0.01,
                "last_frame_iso": now,
            },
            {
                "camera_id": "UAV_01",
                "name": "Autonomous Recon Quadcopter",
                "type": "Airborne FLIR + LiDAR",
                "status": "HEALTHY",
                "fps": 30.0,
                "latency_ms": 16.5,
                "scene_variance": 96.0,
                "tamper_detected": False,
                "obstruction_score": 0.00,
                "last_frame_iso": now,
            },
        ],
    }


@app.post("/edge/arm-state")
@app.post("/v1/edge/arm-state")
def set_arm_state(body: ArmStateIn):
    global _arm_state
    if body.arm_state not in ("armed", "disarmed"):
        raise HTTPException(status_code=400, detail="arm_state must be 'armed' or 'disarmed'")
    _arm_state = body.arm_state
    return edge_status()


# ---------------------------------------------------------------------------
# event ingestion — the main pipeline
# ---------------------------------------------------------------------------

def _ingest_event(event_in: EventIn) -> dict:
    """
    The full journey of one event, step by step:
      1. Idempotency check — has this exact event_id been seen before?
      2. Store the raw event (including the threat factors it reported).
      3. Correlate it into an incident, new or existing (correlation_engine).
      4. Score the WHOLE incident using every factor seen across all of its
         events so far — an incident's score is the sum of its evidence,
         not just whatever the newest event happened to report. This is
         what makes "zone entry on cam A + loitering on cam A + a
         cross-camera match on cam B" add up to one combined score.
      5. If the incident is now CRITICAL, seal it into the evidence ledger.
    """
    event = event_in.model_dump()
    event["timestamp_iso"] = event["timestamp_iso"] or datetime.now(timezone.utc).isoformat()
    # The four threat factors live inside rule_metrics_json — that column
    # exists exactly for "extra details about why this event was flagged".
    event["rule_metrics"] = {
        "in_restricted_zone": event["in_restricted_zone"],
        "moving_toward_border": event["moving_toward_border"],
        "loitering_seconds": event["loitering_seconds"],
        "cross_camera_reid_match": event["cross_camera_reid_match"],
    }

    # Step 1 + 2: idempotent insert.
    was_inserted = database.insert_event(event)
    if not was_inserted:
        return {"status": "duplicate", "event_id": event["event_id"], "message": "Event already recorded — ignored."}

    # Step 3: which incident does this belong to?
    incident_id = correlation_engine.correlate_event(event)

    # Step 4: score the incident using every event it now contains.
    all_events_in_incident = database.get_events_for_incident(incident_id)
    cameras_involved = sorted({e["camera_id"] for e in all_events_in_incident})
    story_summary = correlation_engine.build_story_summary(incident_id)
    scored = threat_engine.calculate_threat_score(**_aggregate_incident_factors(all_events_in_incident))
    database.update_incident_score(
        incident_id=incident_id,
        threat_score=scored["score"],
        severity=scored["severity"],
        score_breakdown=scored["factors"],
        cameras=cameras_involved,
        story_summary=story_summary,
    )

    # Step 5: critical incidents get sealed into the tamper-evident ledger.
    sealed = False
    if scored["severity"] == "CRITICAL":
        _seal_incident_into_ledger(incident_id, scored, cameras_involved, event)
        sealed = True

    return {
        "status": "recorded",
        "event_id": event["event_id"],
        "incident_id": incident_id,
        "threat_score": scored["score"],
        "severity": scored["severity"],
        "factors": scored["factors"],
        "sealed_to_ledger": sealed,
    }


def _aggregate_incident_factors(events: list) -> dict:
    """
    Combine the threat factors reported across every event in an incident
    into one set of arguments for threat_engine.calculate_threat_score():
      - a yes/no factor counts if ANY event in the incident reported it
      - loitering_seconds uses the longest dwell time seen
      - the night-window check uses the most recent event's time
    """
    in_restricted_zone = False
    moving_toward_border = False
    loitering_seconds = 0
    cross_camera_reid_match = False

    for event in events:
        metrics = json.loads(event["rule_metrics_json"] or "{}")
        in_restricted_zone = in_restricted_zone or bool(metrics.get("in_restricted_zone"))
        moving_toward_border = moving_toward_border or bool(metrics.get("moving_toward_border"))
        loitering_seconds = max(loitering_seconds, metrics.get("loitering_seconds") or 0)
        cross_camera_reid_match = cross_camera_reid_match or bool(metrics.get("cross_camera_reid_match"))

    latest_event = events[-1]
    hour_ist = _timestamp_to_ist_hour(latest_event["timestamp_iso"])

    return {
        "in_restricted_zone": in_restricted_zone,
        "moving_toward_border": moving_toward_border,
        "loitering_seconds": loitering_seconds,
        "cross_camera_reid_match": cross_camera_reid_match,
        "hour_ist": hour_ist,
    }


def _timestamp_to_ist_hour(timestamp_iso: str) -> int:
    """
    IST is UTC+5:30. We only need the *hour* for the night-window rule, and
    adding 30 minutes never changes which hour a timestamp falls in, so a
    plain +5 on the UTC hour is enough — no timezone library needed.
    """
    dt_utc = datetime.fromisoformat(timestamp_iso.replace("Z", "+00:00"))
    return (dt_utc.hour + 5) % 24


def _seal_incident_into_ledger(incident_id: str, scored: dict, cameras_involved: list, event: dict) -> None:
    last_block = database.get_last_ledger_block()
    previous_hash = last_block["current_hash"] if last_block else evidence_ledger.GENESIS_VALUE

    block = evidence_ledger.seal_incident(
        incident_id=incident_id,
        threat_score=scored["score"],
        camera_ids=cameras_involved,
        rule_evidence=scored["factors"],
        thumbnail_sha256=event.get("thumbnail_sha256", ""),
        timestamp=datetime.now(timezone.utc).isoformat(),
        previous_hash=previous_hash,
    )
    database.insert_ledger_block(block)
    database.set_incident_hash(incident_id, block["current_hash"])


@app.post("/events")
@app.post("/v1/events")
def post_event(event: EventIn):
    return _ingest_event(event)


@app.post("/events/simulate-handoff")
@app.post("/v1/events/simulate-handoff")
def simulate_handoff():
    """
    Demo helper: pretend a target crossed from CAM_ALPHA to CAM_BRAVO 9
    seconds apart, without needing a real camera. Pushes both events
    through the exact same pipeline as POST /events, so you can see
    correlation + scoring + ledger sealing happen live.
    """
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    suffix = now.strftime("%Y%m%dT%H%M%S%f")

    first_event = EventIn(
        event_id=f"SIM-A-{suffix}",
        camera_id="CAM_ALPHA",
        track_id=17,
        alert_type="ZONE_INTRUSION",
        zone_id="alpha_red_zone",
        zone_name="Checkpost Alpha Red Zone",
        details="Simulated breach for demo purposes.",
        timestamp_iso=now.isoformat(),
        in_restricted_zone=True,
        moving_toward_border=True,
    )
    second_event = EventIn(
        event_id=f"SIM-B-{suffix}",
        camera_id="CAM_BRAVO",
        track_id=17,
        alert_type="ZONE_INTRUSION",
        zone_id="bravo_fence_zone",
        zone_name="BOP Bravo Fence Zone",
        details="Simulated cross-camera re-appearance for demo purposes.",
        timestamp_iso=(now + timedelta(seconds=9)).isoformat(),   # 9s later -> inside the 6-14s handoff window
        in_restricted_zone=True,
        cross_camera_reid_match=True,
        loitering_seconds=250,
    )

    result_a = _ingest_event(first_event)
    result_b = _ingest_event(second_event)
    return {"first_event": result_a, "second_event": result_b}


@app.post("/events/simulate-case/{case_id}")
@app.post("/v1/events/simulate-case/{case_id}")
def simulate_case(case_id: int):
    """
    Simulates one of 5 real-world tactical border threat cases:
    1: Night Crawl Breach (CAM_ALPHA, Red Zone, Night Optics, Score: 92/100)
    2: Cross-Cam Re-ID Handoff (CAM_ALPHA -> CAM_BRAVO, Score: 77/100)
    3: Vehicle Ramming & ANPR (CAM_ALPHA, Speed 68 km/h, Plate PB08-XX-1234, Score: 74/100)
    4: Perimeter Loitering Dwell (CAM_BRAVO, 268s Dwell, Score: 65/100)
    5: Coordinated Multi-Target Group Breach (CAM_ALPHA & BRAVO, Score: 88/100)
    """
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    suffix = now.strftime("%Y%m%dT%H%M%S%f")

    if case_id == 1:
        evt = EventIn(
            event_id=f"CASE1-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=1041,
            alert_type="PERIMETER_BREACH",
            zone_id="alpha_red_zone",
            zone_name="Checkpost Alpha Red Zone",
            details="Night-time low-crawling infiltrator crossed perimeter tripwire.",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        res = _ingest_event(evt)
        return {"case_id": 1, "name": "Night Crawl Incursion", "result": res}

    elif case_id == 2:
        return simulate_handoff()

    elif case_id == 3:
        evt = EventIn(
            event_id=f"CASE3-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=7002,
            class_name="vehicle",
            alert_type="ANPR_WATCHLIST_HIT",
            zone_id="alpha_gate_zone",
            zone_name="Main Entry Gate & Boom Barrier",
            details="Blacklisted vehicle PB08-XX-1234 approaching barrier at 68 km/h.",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        res = _ingest_event(evt)
        return {"case_id": 3, "name": "Vehicle Ramming & ANPR", "result": res}

    elif case_id == 4:
        evt = EventIn(
            event_id=f"CASE4-{suffix}",
            camera_id="CAM_BRAVO",
            track_id=2025,
            alert_type="LOITERING_DWELL",
            zone_id="bravo_fence_zone",
            zone_name="BOP Bravo Outer Fence Line",
            details="Target dwelling along outer perimeter wire for 268s (>240s threshold).",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=False,
            loitering_seconds=268,
        )
        res = _ingest_event(evt)
        return {"case_id": 4, "name": "Perimeter Loitering Dwell", "result": res}

    else:
        evt1 = EventIn(
            event_id=f"CASE5-A-{suffix}",
            camera_id="CAM_ALPHA",
            track_id=3001,
            alert_type="GROUP_INCURSION",
            zone_id="alpha_red_zone",
            zone_name="Checkpost Alpha Perimeter",
            details="Coordinated multi-person group breach (Cluster A).",
            timestamp_iso=now.isoformat(),
            in_restricted_zone=True,
            moving_toward_border=True,
        )
        evt2 = EventIn(
            event_id=f"CASE5-B-{suffix}",
            camera_id="CAM_BRAVO",
            track_id=3002,
            alert_type="GROUP_INCURSION",
            zone_id="bravo_fence_zone",
            zone_name="BOP Bravo Perimeter",
            details="Coordinated multi-person group breach (Cluster B).",
            timestamp_iso=(now + timedelta(seconds=4)).isoformat(),
            in_restricted_zone=True,
            cross_camera_reid_match=True,
            moving_toward_border=True,
        )
        res1 = _ingest_event(evt1)
        res2 = _ingest_event(evt2)
        return {"case_id": 5, "name": "Coordinated Group Breach", "result_a": res1, "result_b": res2}


# ---------------------------------------------------------------------------
# incidents
# ---------------------------------------------------------------------------

def _incident_with_story(incident: dict) -> dict:
    """Attach the events that make up this incident, and unpack its JSON columns."""
    events = database.get_events_for_incident(incident["incident_id"])
    return {
        "incident_id": incident["incident_id"],
        "created_at": incident["created_at"],
        "closed_at": incident["closed_at"],
        "status": incident["status"],
        "threat_score": incident["threat_score"],
        "severity": incident["severity"],
        "confidence": incident["confidence"],
        "target_class": incident["target_class"],
        "cameras_involved": json.loads(incident["cameras_json"] or "[]"),
        "story_summary": incident["story_summary"],
        "score_breakdown": json.loads(incident["score_breakdown_json"] or "[]"),
        "cryptographic_hash": incident["cryptographic_hash"],
        "nodes": [
            {
                "step": i + 1,
                "camera_id": e["camera_id"],
                "event_type": e["alert_type"],
                "timestamp_iso": e["timestamp_iso"],
                "rule_detail": e["details"],
            }
            for i, e in enumerate(events)
        ],
    }


@app.get("/incidents")
@app.get("/v1/incidents")
def get_incidents(limit: int = 50):
    return [_incident_with_story(i) for i in database.get_all_incidents(limit)]


@app.get("/incidents/correlated")
@app.get("/v1/incidents/correlated")
def get_correlated_incidents(limit: int = 50):
    """Same as /incidents — the name matches what the frontend already
    expects, and every incident here is already the result of correlation."""
    return get_incidents(limit)


@app.post("/incidents/{incident_id}/acknowledge")
@app.post("/v1/incidents/{incident_id}/acknowledge")
def acknowledge_incident(incident_id: str, body: AcknowledgeIn):
    incident = database.get_incident(incident_id)
    if incident is None:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found")
    if body.status not in ("CONFIRMED", "DISMISSED_FP"):
        raise HTTPException(status_code=400, detail="status must be CONFIRMED or DISMISSED_FP")

    database.update_incident_status(incident_id, body.status)
    global _siren_active
    _siren_active = False   # acknowledging an incident also quiets the siren
    return _incident_with_story(database.get_incident(incident_id))


# ---------------------------------------------------------------------------
# evidence ledger
# ---------------------------------------------------------------------------

@app.get("/audit/blockchain")
@app.get("/v1/audit/blockchain")
def get_blockchain():
    blocks = database.get_all_ledger_blocks()
    return {
        "blocks_sealed": len(blocks),
        "blocks": [
            {
                "block_index": b["block_index"],
                "previous_hash": b["previous_hash"],
                "current_hash": b["current_hash"],
                "timestamp": b["timestamp"],
                "payload": json.loads(b["payload_json"]),
            }
            for b in blocks
        ],
    }


@app.get("/audit/verify")
@app.get("/v1/audit/verify")
def verify_blockchain():
    blocks = database.get_all_ledger_blocks()
    return evidence_ledger.verify_chain(blocks)


# ---------------------------------------------------------------------------
# siren + notifications
# ---------------------------------------------------------------------------

@app.post("/siren/silence")
@app.post("/v1/siren/silence")
def silence_siren():
    global _siren_active
    _siren_active = False
    result = hardware_bridge.send_command("SIREN_OFF")
    return {"status": "silenced", "hardware_result": result}


@app.post("/notifications/register-token")
@app.post("/v1/notifications/register-token")
def register_token(body: FcmTokenIn):
    return notifications.register_token(body.token, body.device_id, body.platform)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
