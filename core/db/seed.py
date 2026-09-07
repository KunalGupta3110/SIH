"""
IBVAP Sentinel — core/db/seed.py

Populates a freshly-migrated database with enough realistic data that the
dashboard isn't empty on first run: the camera topology graph, a couple of
tracked Re-ID targets, and a few historical incidents (seeded through
SentinelBackend.ingest_event so they go through the same scoring/
correlation/hash-chain path as a real event — not hand-crafted rows that
could drift out of sync with what that code actually produces).

Every step here is idempotent: it checks whether its table already has rows
before inserting, so calling run_seed() on every server startup is safe and
just becomes a no-op after the first run.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from typing import Optional

from sqlalchemy import func, select

from core.backend_service import SentinelBackend
from core.camera_topology import DEFAULT_TOPOLOGY
from core.db.models import Camera, CameraAdjacency, TrackedTarget


def _seed_cameras_and_topology(backend: SentinelBackend) -> int:
    with backend._session() as session:  # noqa: SLF001 - seed script, same package
        already_seeded = session.execute(select(func.count()).select_from(Camera)).scalar_one()
        if already_seeded:
            return 0

        now = datetime.now(timezone.utc).isoformat()
        for camera_id, node in DEFAULT_TOPOLOGY.items():
            session.add(
                Camera(
                    camera_id=camera_id,
                    name=node.name,
                    location_desc=node.location_desc,
                    fov_deg=90.0,
                    status="ONLINE",
                    created_at=now,
                )
            )
        session.flush()

        edge_count = 0
        for camera_id, node in DEFAULT_TOPOLOGY.items():
            for neighbor_id, params in node.neighbors.items():
                session.add(
                    CameraAdjacency(
                        source_camera_id=camera_id,
                        target_camera_id=neighbor_id,
                        min_transit_s=params["min_transit_s"],
                        max_transit_s=params["max_transit_s"],
                        distance_m=params.get("distance_m", 0.0),
                        exit_heading=params.get("exit_heading", ""),
                    )
                )
                edge_count += 1
        return edge_count


def _seed_tracked_targets(backend: SentinelBackend) -> int:
    with backend._session() as session:  # noqa: SLF001
        already_seeded = session.execute(select(func.count()).select_from(TrackedTarget)).scalar_one()
        if already_seeded:
            return 0

        now = datetime.now(timezone.utc)
        demo_targets = [
            TrackedTarget(
                global_id="TRG-0041",
                class_name="person",
                first_seen_camera_id="CAM_ALPHA",
                first_seen_at=(now - timedelta(minutes=6)).isoformat(),
                current_camera_id="CAM_BRAVO",
                last_seen_at=(now - timedelta(minutes=2)).isoformat(),
                predicted_next_camera_id="CAM_CHARLIE",
                predicted_arrival_min_s=10.0,
                predicted_arrival_max_s=22.0,
                velocity_px_s=58.0,
                heading="EAST",
                camera_history_json=json.dumps(["CAM_ALPHA", "CAM_BRAVO"]),
            ),
            TrackedTarget(
                global_id="VEH-0007",
                class_name="car",
                first_seen_camera_id="CAM_ALPHA",
                first_seen_at=(now - timedelta(minutes=20)).isoformat(),
                current_camera_id="CAM_ALPHA",
                last_seen_at=(now - timedelta(minutes=19)).isoformat(),
                predicted_next_camera_id="CAM_DELTA",
                predicted_arrival_min_s=8.0,
                predicted_arrival_max_s=18.0,
                velocity_px_s=112.0,
                heading="SOUTH",
                camera_history_json=json.dumps(["CAM_ALPHA"]),
            ),
        ]
        session.add_all(demo_targets)
        return len(demo_targets)


def _seed_demo_incidents(backend: SentinelBackend) -> int:
    existing = backend.get_incidents(limit=1)
    if existing:
        return 0

    now = datetime.now(timezone.utc)

    # Incident 1: a cross-camera handoff, tracked_targets TRG-0041's own history.
    t0 = now - timedelta(hours=6)
    backend.ingest_event({
        "event_id": "SEED-EVT-0041-A",
        "timestamp_iso": t0.isoformat(),
        "camera_id": "CAM_ALPHA",
        "track_id": 41,
        "class_name": "person",
        "alert_type": "ZONE_INTRUSION",
        "details": "Seed data: target entered restricted zone near northern checkpost.",
        "confidence": 0.93,
        "in_restricted_zone": True,
        "movement_toward_border": True,
    })
    backend.ingest_event({
        "event_id": "SEED-EVT-0041-B",
        "timestamp_iso": (t0 + timedelta(seconds=9)).isoformat(),
        "camera_id": "CAM_BRAVO",
        "track_id": 41,
        "class_name": "person",
        "alert_type": "CROSS_CAMERA_MATCH",
        "details": "Seed data: same target reacquired at Bravo perimeter within transit window.",
        "confidence": 0.95,
        "in_restricted_zone": True,
        "movement_toward_border": True,
        "cross_camera_reid_match": True,
    })

    # Incident 2: a resolved/confirmed vehicle rush, already triaged.
    t1 = now - timedelta(hours=20)
    result = backend.ingest_event({
        "event_id": "SEED-EVT-VEH-0007",
        "timestamp_iso": t1.isoformat(),
        "camera_id": "CAM_ALPHA",
        "track_id": 7,
        "class_name": "car",
        "alert_type": "VEHICLE_RUSH",
        "details": "Seed data: high-speed vehicle rush toward checkpost barrier.",
        "confidence": 0.9,
        "in_restricted_zone": True,
        "movement_toward_border": True,
    })
    incident_id = result["incident"]["incident_id"]
    backend.acknowledge_incident(incident_id, status="CONFIRMED", notes="Seed data: verified by duty officer.")

    # Incident 3: a dismissed false positive, so the calibration view isn't empty either.
    t2 = now - timedelta(hours=30)
    result = backend.ingest_event({
        "event_id": "SEED-EVT-FP-01",
        "timestamp_iso": t2.isoformat(),
        "camera_id": "CAM_CHARLIE",
        "track_id": 12,
        "class_name": "person",
        "alert_type": "ZONE_INTRUSION",
        "details": "Seed data: wind-blown vegetation triggered a red-zone alert.",
        "confidence": 0.4,
        "in_restricted_zone": True,
    })
    fp_incident_id = result["incident"]["incident_id"]
    backend.acknowledge_incident(fp_incident_id, status="DISMISSED_FP", dismiss_reason="vegetation")

    return 3


def run_seed(backend: Optional[SentinelBackend] = None) -> dict:
    """
    Idempotent demo-data seed. Safe to call on every server startup.

    Takes a SentinelBackend instance rather than a db_path so callers (the
    gateway's lifespan hook, tests) always seed through the *same* backend
    instance the rest of the app is using — e.g. services.api_gateway.server
    passes get_backend(), so a test that monkeypatches the default backend
    to a throwaway db never touches the real data/events.db.
    """
    if backend is None:
        backend = SentinelBackend()
    return {
        "camera_edges_seeded": _seed_cameras_and_topology(backend),
        "tracked_targets_seeded": _seed_tracked_targets(backend),
        "incidents_seeded": _seed_demo_incidents(backend),
    }


if __name__ == "__main__":
    print(run_seed())
