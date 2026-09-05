"""
Cyber Camera Surveillance Platform
Module: core/database/incident_graph.py
Description: NOVELTY 2 — Incident Graph & Multi-Camera Event Correlation Engine.
             Correlates fragmented camera alerts into a single unified high-level Incident Story.
"""

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.database.evidence_chain import seal_incident_evidence
from core.rules.explainable_scoring import ExplainableThreatScorer

INCIDENTS_GRAPH_PATH = os.path.join(ROOT_DIR, "data", "incident_graph_ledger.json")


@dataclass
class IncidentNode:
    camera_id: str
    event_type: str
    timestamp_iso: str
    track_id: int
    rule_detail: str
    thumbnail_url: Optional[str] = None


@dataclass
class CorrelatedIncident:
    incident_id: str
    title: str
    global_target_id: str
    target_class: str
    threat_score: int
    severity: str
    confidence_pct: float
    start_time_iso: str
    last_update_iso: str
    cameras_involved: List[str]
    nodes: List[Dict]
    score_breakdown: List[Dict]
    cryptographic_block_hash: Optional[str] = None
    operator_triage: str = "UNREVIEWED"
    story_summary: str = ""


class IncidentCorrelationEngine:
    """
    Synthesizes multiple low-level detections across camera nodes into a single coherent Incident Story.
    Solves Operator Alarm Fatigue by presenting 1 unified incident graph instead of 10 isolated alerts.
    """

    def __init__(self, storage_path: str = INCIDENTS_GRAPH_PATH):
        self.storage_path = storage_path
        self.scorer = ExplainableThreatScorer()
        self.incidents: Dict[str, CorrelatedIncident] = {}
        self._target_to_incident: Dict[str, str] = {}
        self._incident_counter = 1040
        self._load()

    def _load(self):
        if os.path.exists(self.storage_path):
            try:
                with open(self.storage_path, "r") as f:
                    data = json.load(f)
                    for item in data:
                        inc = CorrelatedIncident(**item)
                        self.incidents[inc.incident_id] = inc
                        self._target_to_incident[inc.global_target_id] = inc.incident_id
            except Exception:
                pass

    def _save(self):
        os.makedirs(os.path.dirname(self.storage_path) or ".", exist_ok=True)
        with open(self.storage_path, "w") as f:
            json.dump([asdict(inc) for inc in self.incidents.values()], f, indent=2)

    def correlate_event(
        self,
        camera_id: str,
        global_target_id: str,
        target_class: str,
        event_type: str,
        rule_detail: str,
        in_restricted_zone: bool = True,
        tripwire_crossed: bool = False,
        velocity_px_s: float = 60.0,
        loitering_sec: float = 0.0,
        predictive_handoff_confirmed: bool = False,
        thumbnail_path: Optional[str] = None,
    ) -> CorrelatedIncident:
        curr_time = datetime.now(timezone.utc).isoformat()
        
        # Check if existing active incident exists for target
        incident_id = self._target_to_incident.get(global_target_id)

        if not incident_id or incident_id not in self.incidents:
            self._incident_counter += 1
            incident_id = f"INC-{self._incident_counter:04d}"
            self._target_to_incident[global_target_id] = incident_id

            score_res = self.scorer.calculate_score(
                in_restricted_zone=in_restricted_zone,
                tripwire_crossed=tripwire_crossed,
                velocity_px_s=velocity_px_s,
                loitering_sec=loitering_sec,
                predictive_handoff_confirmed=predictive_handoff_confirmed,
                target_class=target_class,
            )

            inc = CorrelatedIncident(
                incident_id=incident_id,
                title=f"Multi-Stage Border Incursion: {target_class.upper()} #{global_target_id}",
                global_target_id=global_target_id,
                target_class=target_class,
                threat_score=score_res["threat_score"],
                severity=score_res["severity"],
                confidence_pct=score_res["confidence_pct"],
                start_time_iso=curr_time,
                last_update_iso=curr_time,
                cameras_involved=[camera_id],
                nodes=[{
                    "step": 1,
                    "camera_id": camera_id,
                    "event_type": event_type,
                    "timestamp_iso": curr_time,
                    "rule_detail": rule_detail,
                }],
                score_breakdown=score_res["triggered_factors"],
                story_summary=f"Target {global_target_id} detected at {camera_id} triggering {event_type}.",
            )
            self.incidents[incident_id] = inc
        else:
            inc = self.incidents[incident_id]
            inc.last_update_iso = curr_time
            if camera_id not in inc.cameras_involved:
                inc.cameras_involved.append(camera_id)

            inc.nodes.append({
                "step": len(inc.nodes) + 1,
                "camera_id": camera_id,
                "event_type": event_type,
                "timestamp_iso": curr_time,
                "rule_detail": rule_detail,
            })

            # Re-evaluate compound threat score with multi-camera continuity
            score_res = self.scorer.calculate_score(
                in_restricted_zone=in_restricted_zone,
                tripwire_crossed=tripwire_crossed or len(inc.nodes) > 1,
                velocity_px_s=velocity_px_s,
                loitering_sec=loitering_sec,
                predictive_handoff_confirmed=True if len(inc.cameras_involved) > 1 else predictive_handoff_confirmed,
                target_class=target_class,
            )
            inc.threat_score = score_res["threat_score"]
            inc.severity = score_res["severity"]
            inc.confidence_pct = score_res["confidence_pct"]
            inc.score_breakdown = score_res["triggered_factors"]
            inc.story_summary = f"Multi-node progression: Target {global_target_id} traversed {len(inc.cameras_involved)} camera nodes ({' -> '.join(inc.cameras_involved)}) with sustained threat level {inc.severity}."

        # Cryptographically seal in Tamper-Evident SHA-256 Ledger
        block = seal_incident_evidence(
            incident_id=inc.incident_id,
            threat_score=inc.threat_score,
            camera_ids=inc.cameras_involved,
            rule_evidence=inc.story_summary,
            thumbnail_path=thumbnail_path,
        )
        inc.cryptographic_block_hash = block.current_hash
        self._save()

        print(f"\n[INCIDENT CORRELATION GRAPH] {inc.incident_id} [{inc.severity} | Score: {inc.threat_score}/100]")
        print(f"  Story: {inc.story_summary}")
        print(f"  Nodes ({len(inc.nodes)}): " + " -> ".join([f"{n['camera_id']} ({n['event_type']})" for n in inc.nodes]))
        print(f"  Cryptographic Seal: {inc.cryptographic_block_hash[:16]}...\n")
        return inc

    def get_recent_incidents(self, limit: int = 20) -> List[Dict]:
        sorted_incs = sorted(self.incidents.values(), key=lambda x: x.last_update_iso, reverse=True)
        return [asdict(inc) for inc in sorted_incs[:limit]]


_incident_engine = IncidentCorrelationEngine()


def correlate_border_event(*args, **kwargs) -> CorrelatedIncident:
    return _incident_engine.correlate_event(*args, **kwargs)


def get_all_correlated_incidents(limit: int = 20) -> List[Dict]:
    return _incident_engine.get_recent_incidents(limit=limit)
