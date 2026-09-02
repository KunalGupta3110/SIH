"""
IBVAP - Intelligent Border Video Analytics Platform
Module: reid/match.py
Description: Cross-Camera Re-Identification and Multi-Camera Movement Trail Stitching.
             Maintains global track identities across non-overlapping camera feeds
             using appearance embeddings and temporal association.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from reid.embed import FeatureExtractor


def cosine_similarity(feat1: np.ndarray, feat2: np.ndarray) -> float:
    """Computes cosine similarity between two normalized feature vectors."""
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
class GlobalTrack:
    """Represents a unique target identity stitched across multiple CCTV cameras."""
    global_id: str
    class_name: str
    first_seen_cam: str
    first_seen_ms: float
    last_seen_cam: str
    last_seen_ms: float
    # camera_id -> local_track_id
    camera_associations: Dict[str, int] = field(default_factory=dict)
    # Stored embeddings for multi-shot matching
    embedding_history: List[np.ndarray] = field(default_factory=list)
    average_embedding: Optional[np.ndarray] = None
    movement_trail: List[MovementPoint] = field(default_factory=list)
    thumbnail_path: Optional[str] = None

    def update_embedding(self, new_embedding: np.ndarray, max_embeddings: int = 15):
        """Updates the running appearance gallery and re-computes the average embedding."""
        self.embedding_history.append(new_embedding)
        if len(self.embedding_history) > max_embeddings:
            self.embedding_history.pop(0)

        # Re-compute centroid and L2-normalize
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
        # Weighted ensemble of centroid similarity and best exemplar similarity
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
    Cross-Camera Re-Identification engine.
    Maintains a temporal gallery of tracks and associates targets when they
    re-appear across different cameras in the border surveillance network.
    """

    def __init__(
        self,
        feature_extractor: Optional[FeatureExtractor] = None,
        similarity_threshold: float = 0.70,
        gallery_ttl_sec: float = 1800.0,  # 30-minute gallery memory
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
        # (camera_id, local_track_id) -> global_id (fast local lookup)
        self.local_to_global: Dict[Tuple[str, int], str] = {}
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
    ) -> Tuple[str, bool, float]:
        """
        Processes a single track observation from a camera.

        Returns:
            (global_id: str, is_new_cross_cam_match: bool, match_confidence: float)
        """
        local_key = (camera_id, local_track_id)

        # 1. Check if this local track already has an assigned global identity
        if local_key in self.local_to_global:
            gid = self.local_to_global[local_key]
            global_track = self.global_tracks[gid]
            global_track.last_seen_cam = camera_id
            global_track.last_seen_ms = timestamp_ms

            # Periodically update appearance embedding (every few frames)
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
            return gid, False, 1.0

        # 2. Extract feature embedding for newly observed track
        feat = self.extractor.extract_crop(crop_bgr)
        if feat is None:
            # Fallback for small/blurry crops
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
            return gid, False, 0.0

        # 3. Query gallery of existing global tracks
        best_match_gid: Optional[str] = None
        best_score = -1.0

        for gid, gtrack in self.global_tracks.items():
            # Must match class category (person vs vehicle)
            if gtrack.class_name != class_name:
                continue

            # Check temporal window (ignore stale tracks older than gallery TTL)
            if (timestamp_ms - gtrack.last_seen_ms) > self.gallery_ttl_ms:
                continue

            # Compare against existing tracks from OTHER cameras (or re-entry on same camera)
            score = gtrack.match_score(feat)
            if score > best_score:
                best_score = score
                best_match_gid = gid

        # 4. Check if similarity exceeds threshold
        is_cross_cam_match = False
        if best_match_gid is not None and best_score >= self.similarity_threshold:
            # POSITIVE RE-IDENTIFICATION MATCH!
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
            return best_match_gid, is_cross_cam_match, best_score

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
            return gid, False, 0.0

    def get_all_global_tracks(self) -> List[Dict[str, Any]]:
        """Returns all global track journeys formatted for the dashboard and API."""
        return [gt.to_dict() for gt in self.global_tracks.values()]

    def export_summary(self, file_path: str):
        """Exports the entire cross-camera tracking ledger to JSON."""
        data = {
            "total_global_targets": len(self.global_tracks),
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "targets": self.get_all_global_tracks(),
        }
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
        print(f"[IBVAP Re-ID] Exported cross-camera ledger to: {file_path}")
