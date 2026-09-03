"""
IBVAP - Intelligent Border Video Analytics Platform
Module: reid/match.py
Description: Explainable Cross-Camera Re-Identification and Multi-Camera Movement Stitching.
             Maintains global track identities across non-overlapping camera feeds
             using 512-d normalized appearance embeddings and transparent similarity scoring.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import numpy as np

from reid.embed import FeatureExtractor


def cosine_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
    """Computes cosine similarity between two L2-normalized feature vectors."""
    return float(np.dot(feat1, feat2))


@dataclass
class MovementPoint:
    """Single observation point in a target's stitched multi-camera journey."""
    camera_id: str
    local_track_id: int
    frame_index: int
    timestamp_ms: float
    centroid: Tuple[float, float]
    bbox: List[float]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "camera_id": self.camera_id,
            "local_track_id": self.local_track_id,
            "frame_index": self.frame_index,
            "timestamp_ms": round(self.timestamp_ms, 2),
            "centroid": (round(self.centroid[0], 2), round(self.centroid[1], 2)),
            "bbox": [round(c, 2) for c in self.bbox],
        }


@dataclass
class ReIDEvaluation:
    """Explainable log of a candidate matching evaluation."""
    timestamp_ms: float
    query_cam: str
    query_track_id: int
    matched_global_id: str
    is_match: bool
    best_score: float
    threshold: float
    candidates: List[Dict[str, Any]]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timestamp_ms": round(self.timestamp_ms, 2),
            "query_cam": self.query_cam,
            "query_track_id": self.query_track_id,
            "matched_global_id": self.matched_global_id,
            "is_match": self.is_match,
            "best_score": round(self.best_score, 4),
            "threshold": round(self.threshold, 4),
            "candidates": self.candidates,
        }


@dataclass
class GlobalTrack:
    """Represents a unique target identity stitched across multiple CCTV cameras."""
    global_id: str
    class_name: str
    first_seen_cam: str
    first_seen_ms: float
    last_seen_cam: str
    last_seen_ms: float
    camera_associations: Dict[str, int] = field(default_factory=dict)
    embedding_history: List[np.ndarray] = field(default_factory=list)
    average_embedding: Optional[np.ndarray] = None
    movement_trail: List[MovementPoint] = field(default_factory=list)
    thumbnail_path: Optional[str] = None

    def update_embedding(self, new_embedding: np.ndarray, max_embeddings: int = 15):
        """Updates the running appearance gallery and re-computes the average embedding."""
        self.embedding_history.append(new_embedding)
        if len(self.embedding_history) > max_embeddings:
            self.embedding_history.pop(0)

        stacked = np.stack(self.embedding_history, axis=0)
        avg = np.mean(stacked, axis=0)
        norm = np.linalg.norm(avg)
        self.average_embedding = avg / max(norm, 1e-6)

    def match_score(self, query_feat: np.ndarray) -> float:
        """
        Computes the matching score against this global track's gallery.
        Uses max cosine similarity across multi-shot samples + average embedding score.
        """
        if self.average_embedding is None:
            return 0.0

        avg_score = cosine_similarity(query_feat, self.average_embedding)
        max_shot_score = max([cosine_similarity(query_feat, shot) for shot in self.embedding_history])
        return float(0.6 * max_shot_score + 0.4 * avg_score)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "global_id": self.global_id,
            "class_name": self.class_name,
            "first_seen_cam": self.first_seen_cam,
            "first_seen_ms": round(self.first_seen_ms, 2),
            "last_seen_cam": self.last_seen_cam,
            "last_seen_ms": round(self.last_seen_ms, 2),
            "cameras_visited": list(self.camera_associations.keys()),
            "camera_associations": self.camera_associations,
            "total_detections": len(self.movement_trail),
            "movement_trail": [pt.to_dict() for pt in self.movement_trail[-50:]],
            "thumbnail_path": self.thumbnail_path,
        }


class CrossCameraReID:
    """
    Explainable Cross-Camera Re-Identification engine.
    Maintains a temporal gallery of tracks and associates targets when they
    re-appear across different cameras in the border surveillance network.
    """

    def __init__(
        self,
        feature_extractor: Optional[FeatureExtractor] = None,
        similarity_threshold: float = 0.70,
        gallery_ttl_sec: float = 1800.0,
        device: Optional[str] = None,
    ):
        """
        Args:
            feature_extractor: FeatureExtractor instance (creates ResNet18 if None).
            similarity_threshold: Cosine similarity threshold to declare a positive Re-ID match.
            gallery_ttl_sec: Maximum time (in seconds) to retain tracks in the search gallery.
            device: 'cpu', 'cuda', etc.
        """
        self.extractor = feature_extractor if feature_extractor is not None else FeatureExtractor(device=device)
        self.similarity_threshold = similarity_threshold
        self.gallery_ttl_ms = gallery_ttl_sec * 1000.0

        # global_id -> GlobalTrack
        self.global_tracks: Dict[str, GlobalTrack] = {}
        # (camera_id, local_track_id) -> global_id
        self.local_to_global: Dict[Tuple[str, int], str] = {}
        self.evaluations: List[ReIDEvaluation] = []
        self.next_global_idx = 1

    def _generate_global_id(self, class_name: str) -> str:
        prefix = "TRG" if class_name == "person" else "VEH"
        gid = f"{prefix}-{self.next_global_idx:04d}"
        self.next_global_idx += 1
        return gid

    def process_observation(
        self,
        camera_id: str,
        local_track_id: int,
        class_name: str,
        crop_bgr: np.ndarray,
        centroid: Tuple[float, float],
        bbox: List[float],
        timestamp_ms: float,
        frame_idx: int,
    ) -> Tuple[str, bool, float, List[Dict[str, Any]]]:
        """
        Processes a single track observation with full explainability.

        Returns:
            (global_id: str, is_new_cross_cam_match: bool, match_confidence: float, candidate_scores: List)
        """
        local_key = (camera_id, local_track_id)

        # 1. Existing local-to-global association
        if local_key in self.local_to_global:
            gid = self.local_to_global[local_key]
            global_track = self.global_tracks[gid]
            global_track.last_seen_cam = camera_id
            global_track.last_seen_ms = timestamp_ms

            if frame_idx % 10 == 0:
                feat = self.extractor.extract_crop(crop_bgr)
                if feat is not None:
                    global_track.update_embedding(feat)

            global_track.movement_trail.append(
                MovementPoint(
                    camera_id=camera_id,
                    local_track_id=local_track_id,
                    frame_index=frame_idx,
                    timestamp_ms=timestamp_ms,
                    centroid=centroid,
                    bbox=bbox,
                )
            )
            return gid, False, 1.0, []

        # 2. Extract feature embedding for newly observed track
        feat = self.extractor.extract_crop(crop_bgr)
        if feat is None:
            gid = self._generate_global_id(class_name)
            new_global = GlobalTrack(
                global_id=gid,
                class_name=class_name,
                first_seen_cam=camera_id,
                first_seen_ms=timestamp_ms,
                last_seen_cam=camera_id,
                last_seen_ms=timestamp_ms,
                camera_associations={camera_id: local_track_id},
            )
            self.global_tracks[gid] = new_global
            self.local_to_global[local_key] = gid
            return gid, False, 0.0, []

        # 3. Query gallery of existing global tracks & build candidate ranking
        best_match_gid: Optional[str] = None
        best_score = -1.0
        candidate_rankings: List[Dict[str, Any]] = []

        for gid, gtrack in self.global_tracks.items():
            if gtrack.class_name != class_name:
                continue

            # Temporal window check
            time_gap_s = (timestamp_ms - gtrack.last_seen_ms) / 1000.0
            if (timestamp_ms - gtrack.last_seen_ms) > self.gallery_ttl_ms:
                continue

            score = gtrack.match_score(feat)
            candidate_rankings.append({
                "candidate_global_id": gid,
                "first_seen_cam": gtrack.first_seen_cam,
                "cosine_similarity": round(score, 4),
                "threshold": round(self.similarity_threshold, 4),
                "accepted": bool(score >= self.similarity_threshold),
                "temporal_gap_s": round(time_gap_s, 1),
            })

            if score > best_score:
                best_score = score
                best_match_gid = gid

        # Sort candidate rankings by similarity descending
        candidate_rankings.sort(key=lambda x: x["cosine_similarity"], reverse=True)

        # 4. Check if similarity exceeds threshold
        is_cross_cam_match = False
        if best_match_gid is not None and best_score >= self.similarity_threshold:
            matched_track = self.global_tracks[best_match_gid]
            prev_cam = matched_track.last_seen_cam
            is_cross_cam_match = (prev_cam != camera_id)

            matched_track.last_seen_cam = camera_id
            matched_track.last_seen_ms = timestamp_ms
            matched_track.camera_associations[camera_id] = local_track_id
            matched_track.update_embedding(feat)
            matched_track.movement_trail.append(
                MovementPoint(
                    camera_id=camera_id,
                    local_track_id=local_track_id,
                    frame_index=frame_idx,
                    timestamp_ms=timestamp_ms,
                    centroid=centroid,
                    bbox=bbox,
                )
            )

            self.local_to_global[local_key] = best_match_gid

            # Log explainable evaluation
            eval_log = ReIDEvaluation(
                timestamp_ms=timestamp_ms,
                query_cam=camera_id,
                query_track_id=local_track_id,
                matched_global_id=best_match_gid,
                is_match=True,
                best_score=best_score,
                threshold=self.similarity_threshold,
                candidates=candidate_rankings,
            )
            self.evaluations.append(eval_log)

            return best_match_gid, is_cross_cam_match, best_score, candidate_rankings

        else:
            # 5. Create a new Global Track identity
            gid = self._generate_global_id(class_name)
            new_global = GlobalTrack(
                global_id=gid,
                class_name=class_name,
                first_seen_cam=camera_id,
                first_seen_ms=timestamp_ms,
                last_seen_cam=camera_id,
                last_seen_ms=timestamp_ms,
                camera_associations={camera_id: local_track_id},
            )
            new_global.update_embedding(feat)
            new_global.movement_trail.append(
                MovementPoint(
                    camera_id=camera_id,
                    local_track_id=local_track_id,
                    frame_index=frame_idx,
                    timestamp_ms=timestamp_ms,
                    centroid=centroid,
                    bbox=bbox,
                )
            )

            self.global_tracks[gid] = new_global
            self.local_to_global[local_key] = gid

            eval_log = ReIDEvaluation(
                timestamp_ms=timestamp_ms,
                query_cam=camera_id,
                query_track_id=local_track_id,
                matched_global_id=gid,
                is_match=False,
                best_score=best_score if best_score > 0 else 0.0,
                threshold=self.similarity_threshold,
                candidates=candidate_rankings,
            )
            self.evaluations.append(eval_log)

            return gid, False, 0.0, candidate_rankings

    def get_all_global_tracks(self) -> List[Dict[str, Any]]:
        """Returns all global track journeys formatted for the dashboard and API."""
        return [gt.to_dict() for gt in self.global_tracks.values()]

    def get_recent_evaluations(self, limit: int = 20) -> List[Dict[str, Any]]:
        return [ev.to_dict() for ev in self.evaluations[-limit:]]

    def export_summary(self, file_path: str):
        """Exports the entire cross-camera tracking ledger to JSON."""
        data = {
            "total_global_targets": len(self.global_tracks),
            "similarity_threshold": self.similarity_threshold,
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "targets": self.get_all_global_tracks(),
            "recent_evaluations": self.get_recent_evaluations(50),
        }
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[IBVAP Re-ID] Exported explainable cross-camera ledger to: {file_path}")
