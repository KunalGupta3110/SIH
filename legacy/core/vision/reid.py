"""
Cyber Camera Surveillance Platform
Module: core/vision/reid.py
Description: Cross-Camera Re-Identification engine with ResNet18 512-d L2 embeddings
             and transparent cosine similarity candidate ranking matrix.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torchvision.models as models
    import torchvision.transforms as transforms
    HAS_TORCH = True
except ImportError:
    HAS_TORCH = False


class FeatureExtractor:
    """Extracts 512-dimensional L2-normalized visual appearance embeddings from cropped targets."""

    def __init__(self, device: Optional[str] = None):
        self.device = device or ("cuda" if HAS_TORCH and torch.cuda.is_available() else "cpu")
        self.model = None

        if HAS_TORCH:
            try:
                base_model = models.resnet18(weights=models.ResNet18_Weights.DEFAULT)
                self.model = nn.Sequential(*list(base_model.children())[:-1])
                self.model.eval()
                self.model.to(self.device)
                self.preprocess = transforms.Compose([
                    transforms.ToPILImage(),
                    transforms.Resize((256, 128)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
                ])
            except Exception as e:
                print(f"[Re-ID] Torch model load fallback: {e}")
                self.model = None

    def extract_embedding(self, crop: np.ndarray) -> np.ndarray:
        if crop is None or crop.size == 0 or min(crop.shape[:2]) < 5:
            return np.zeros(512, dtype=np.float32)

        if self.model is not None and HAS_TORCH:
            try:
                img_rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
                tensor = self.preprocess(img_rgb).unsqueeze(0).to(self.device)
                with torch.no_grad():
                    feat = self.model(tensor)
                    feat = feat.view(feat.size(0), -1).cpu().numpy()[0]
                norm = np.linalg.norm(feat)
                return feat / max(norm, 1e-6)
            except Exception:
                pass

        # Color-histogram Fallback Feature Vector
        hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
        h_hist = cv2.calcHist([hsv], [0], None, [128], [0, 180])
        s_hist = cv2.calcHist([hsv], [1], None, [128], [0, 256])
        v_hist = cv2.calcHist([hsv], [2], None, [256], [0, 256])
        feat = np.concatenate([h_hist.flatten(), s_hist.flatten(), v_hist.flatten()])
        norm = np.linalg.norm(feat)
        return feat / max(norm, 1e-6)


@dataclass
class GlobalTarget:
    global_id: str
    class_name: str
    first_seen_ms: float
    last_seen_ms: float
    first_seen_cam: str
    last_seen_cam: str
    total_detections: int
    cameras_visited: List[str]
    movement_trail: List[Dict]
    mean_embedding: np.ndarray


class CrossCameraReIDEngine:
    """Manages target galleries across multiple border camera nodes and evaluates matches."""

    def __init__(self, similarity_threshold: float = 0.70, time_window_sec: float = 300.0):
        self.threshold = similarity_threshold
        self.time_window = time_window_sec
        self.targets: Dict[str, GlobalTarget] = {}
        self.eval_history: List[Dict] = []
        self._target_counter = 1

    def match_or_register(
        self,
        camera_id: str,
        track_id: int,
        class_name: str,
        embedding: np.ndarray,
        timestamp_ms: float,
        centroid: Tuple[float, float],
    ) -> Tuple[str, float, bool]:
        best_match_id = None
        highest_sim = -1.0
        candidate_evals = []

        now_sec = timestamp_ms / 1000.0

        for gid, trg in self.targets.items():
            if trg.class_name != class_name:
                continue

            last_sec = trg.last_seen_ms / 1000.0
            gap_sec = now_sec - last_sec
            if gap_sec > self.time_window or gap_sec < -5.0:
                continue

            # Cosine similarity
            sim = float(np.dot(embedding, trg.mean_embedding) / (
                max(1e-6, np.linalg.norm(embedding) * np.linalg.norm(trg.mean_embedding))
            ))

            candidate_evals.append({
                "candidate_global_id": gid,
                "cosine_similarity": round(sim, 3),
                "threshold": self.threshold,
                "accepted": sim >= self.threshold,
                "temporal_gap_s": round(gap_sec, 1),
            })

            if sim > highest_sim:
                highest_sim = sim
                best_match_id = gid

        # Log evaluation
        self.eval_history.append({
            "timestamp_ms": timestamp_ms,
            "query_cam": camera_id,
            "query_track_id": track_id,
            "candidates": candidate_evals,
        })
        if len(self.eval_history) > 100:
            self.eval_history.pop(0)

        # Match Accepted
        if best_match_id is not None and highest_sim >= self.threshold:
            trg = self.targets[best_match_id]
            trg.last_seen_ms = timestamp_ms
            trg.last_seen_cam = camera_id
            trg.total_detections += 1
            if camera_id not in trg.cameras_visited:
                trg.cameras_visited.append(camera_id)
            trg.movement_trail.append({
                "camera_id": camera_id,
                "timestamp_ms": timestamp_ms,
                "centroid": centroid,
            })
            # Running average update
            trg.mean_embedding = 0.8 * trg.mean_embedding + 0.2 * embedding
            trg.mean_embedding /= max(1e-6, np.linalg.norm(trg.mean_embedding))
            return best_match_id, highest_sim, True

        # Register New Target
        new_gid = f"TRG-{self._target_counter:04d}"
        self._target_counter += 1

        self.targets[new_gid] = GlobalTarget(
            global_id=new_gid,
            class_name=class_name,
            first_seen_ms=timestamp_ms,
            last_seen_ms=timestamp_ms,
            first_seen_cam=camera_id,
            last_seen_cam=camera_id,
            total_detections=1,
            cameras_visited=[camera_id],
            movement_trail=[{"camera_id": camera_id, "timestamp_ms": timestamp_ms, "centroid": centroid}],
            mean_embedding=embedding.copy(),
        )
        return new_gid, 1.0, False

    def export_ledger(self, file_path: str = "data/cross_camera_ledger.json"):
        data = {
            "targets": [
                {
                    "global_id": t.global_id,
                    "class_name": t.class_name,
                    "first_seen_ms": t.first_seen_ms,
                    "last_seen_ms": t.last_seen_ms,
                    "first_seen_cam": t.first_seen_cam,
                    "last_seen_cam": t.last_seen_cam,
                    "total_detections": t.total_detections,
                    "cameras_visited": t.cameras_visited,
                    "movement_trail": t.movement_trail,
                }
                for t in self.targets.values()
            ],
            "recent_evaluations": self.eval_history[-20:],
        }
        os.makedirs(os.path.dirname(file_path) or ".", exist_ok=True)
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
