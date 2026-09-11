"""
IBVAP Sentinel
Module: core/vision/face_recognition.py
Description: Face detection (OpenCV Haar cascade — zero-download, always
             available offline, unlike the HuggingFace-hosted detectors
             core/vision/anpr.py reaches for) and cosine-similarity
             matching against the enrolled_people watchlist/authorized
             gallery (core/db/models.py EnrolledPerson).

That table previously had a producer (POST /enrollment/people) and zero
consumers — nothing ever extracted a face or compared against it. This
closes that gap: for each person track, crop the head region, detect a
face in it, embed it (reusing core/vision/reid.py's FeatureExtractor —
whole-crop appearance embedding, not a dedicated face-recognition network,
but real cosine-similarity matching against a real gallery), and match
against every enrolled person's embedding (computed once from their
enrollment photo if one wasn't supplied directly).
"""

import json
import os
import time
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

from core.vision.reid import FeatureExtractor

MATCH_THRESHOLD = 0.80
GALLERY_REFRESH_SEC = 15.0


class FaceRecognitionEngine:
    def __init__(self, feat_extractor: Optional[FeatureExtractor] = None):
        self.feat_extractor = feat_extractor or FeatureExtractor()
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self._face_detector = cv2.CascadeClassifier(cascade_path)
        self._gallery: List[Dict] = []  # [{person_id, name, role, embedding}]
        self._last_refresh = 0.0

    def _load_gallery(self):
        if time.time() - self._last_refresh < GALLERY_REFRESH_SEC and self._gallery:
            return
        self._last_refresh = time.time()
        try:
            from core.backend_service import get_backend
            people = get_backend().list_enrolled_people_full()
        except Exception:
            people = []

        gallery = []
        for p in people:
            embedding = self._embedding_for_person(p)
            if embedding is not None:
                gallery.append({"person_id": p["person_id"], "name": p["name"], "role": p["role"], "embedding": embedding})
        self._gallery = gallery

    def _embedding_for_person(self, p: Dict) -> Optional[np.ndarray]:
        if p.get("reference_embedding_json"):
            try:
                return np.array(json.loads(p["reference_embedding_json"]), dtype=np.float32)
            except Exception:
                pass
        photo_path = p.get("photo_path")
        if photo_path and os.path.exists(photo_path):
            img = cv2.imread(photo_path)
            if img is not None:
                faces = self.detect_faces(img)
                crop = self._best_face_crop(img, faces) if faces else img
                return self.feat_extractor.extract_embedding(crop)
        return None

    def detect_faces(self, bgr_image: np.ndarray) -> List[Tuple[int, int, int, int]]:
        if bgr_image is None or bgr_image.size == 0:
            return []
        gray = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2GRAY)
        faces = self._face_detector.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=5, minSize=(24, 24))
        return [tuple(int(v) for v in f) for f in faces]

    @staticmethod
    def _best_face_crop(frame: np.ndarray, faces: List[Tuple[int, int, int, int]]) -> np.ndarray:
        x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
        return frame[y:y + h, x:x + w]

    def match_person_crop(self, person_crop: np.ndarray) -> Optional[Dict]:
        """Given a cropped person bbox, find the face inside it and match
        against the enrolled gallery. Returns
        {"person_id","name","role","similarity"} or None (no face found,
        or no gallery match above MATCH_THRESHOLD)."""
        self._load_gallery()
        if not self._gallery or person_crop is None or person_crop.size == 0:
            return None

        # A face sits in roughly the top half of a standing person's bbox —
        # searching just that region avoids false hits on torso/legs.
        head_region = person_crop[: max(1, person_crop.shape[0] // 2), :]
        faces = self.detect_faces(head_region)
        if not faces:
            return None
        face_crop = self._best_face_crop(head_region, faces)
        embedding = self.feat_extractor.extract_embedding(face_crop)

        best = None
        best_sim = -1.0
        for person in self._gallery:
            sim = float(np.dot(embedding, person["embedding"]) / (
                max(1e-6, np.linalg.norm(embedding) * np.linalg.norm(person["embedding"]))
            ))
            if sim > best_sim:
                best_sim = sim
                best = person

        if best is not None and best_sim >= MATCH_THRESHOLD:
            return {"person_id": best["person_id"], "name": best["name"], "role": best["role"], "similarity": round(best_sim, 3)}
        return None
