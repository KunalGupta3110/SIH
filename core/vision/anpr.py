"""
IBVAP Sentinel — core/vision/anpr.py
Module: Automatic Number Plate Recognition (ANPR)

Detects license plates within vehicle bounding box crops using a pretrained
YOLOv8 plate detection model, then reads plate text with EasyOCR.

Design:
  - Only runs on vehicle crops (car/truck/bus/motorcycle) already detected
    by the main tracker — no redundant full-frame YOLO pass.
  - Runs on a configurable skip-frame cadence per vehicle track to avoid
    per-frame overhead (plates don't change between frames).
  - Caches the best (highest-confidence) plate read per track ID so the
    overlay stays stable even on skipped frames.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger("ibvap.vision.anpr")

# ---------------------------------------------------------------------------
# Plate detection model config & Hotlist Watchlist
# ---------------------------------------------------------------------------
# We try multiple public repos in order — some may be gated/removed.
PLATE_MODEL_REPOS = [
    ("keremberke/yolov8n-license-plate-detection", "best.pt"),
    ("keremberke/yolov8m-license-plate-detection", "best.pt"),
    ("Koushim/yolov8-license-plate-detection", "best.pt"),
]
PLATE_CONF_THRESHOLD = 0.30

# Default border security watchlist (normalized plate -> alert reason)
DEFAULT_HOTLIST: Dict[str, str] = {
    "RJ19CB8890": "Flagged Contraband Transport (Thar Sector)",
    "PB08AX4471": "Suspect Logistics Transport (Gurdaspur Sector)",
    "DL01AB1234": "Stolen Commercial Carrier",
    "HR26DK1204": "Unauthorized Night Transit",
}


def normalize_plate(text: str) -> str:
    """Normalize plate text: strip whitespace, dashes, dots, and convert to uppercase."""
    if not text:
        return ""
    import re
    return re.sub(r"[^A-Z0-9]", "", text.upper())


@dataclass
class PlateResult:
    """Result of a single plate detection + OCR read."""
    plate_text: str
    plate_confidence: float  # YOLO detection confidence
    ocr_confidence: float    # Average OCR character confidence
    plate_bbox: List[int]    # [x1, y1, x2, y2] relative to the full frame
    track_id: int
    timestamp_ms: float
    is_hotlist: bool = False
    hotlist_reason: Optional[str] = None
    camera_id: str = ""
    class_name: str = ""


@dataclass
class _TrackPlateCache:
    """Internal cache for the best plate read per vehicle track."""
    best_text: str = ""
    best_ocr_conf: float = 0.0
    best_det_conf: float = 0.0
    plate_bbox: List[int] = field(default_factory=list)
    last_read_frame: int = 0
    read_count: int = 0


class ANPREngine:
    """
    Automatic Number Plate Recognition engine.

    Usage:
        anpr = ANPREngine()
        # Inside your frame loop, for each tracked vehicle:
        result = anpr.process_vehicle(frame, vehicle_bbox, track_id, frame_idx, timestamp_ms)
        if result:
            print(f"Plate: {result.plate_text}")
    """

    def __init__(
        self,
        plate_conf: float = PLATE_CONF_THRESHOLD,
        ocr_languages: Optional[List[str]] = None,
        read_every_n_frames: int = 5,
        device: Optional[str] = None,
    ):
        """
        Args:
            plate_conf: Minimum confidence for plate YOLO detections.
            ocr_languages: EasyOCR language list (default: English).
            read_every_n_frames: How often to re-run OCR per track ID.
            device: 'cpu', 'cuda', etc. None = auto-detect.
        """
        self.plate_conf = plate_conf
        self.read_every_n_frames = read_every_n_frames
        self.device = device

        self._plate_model = None
        self._ocr_reader = None
        self._ocr_languages = ocr_languages or ["en"]
        self._track_cache: Dict[int, _TrackPlateCache] = {}
        self._model_loaded = False

        # Vehicle Watchlist / Hotlist
        self.hotlist: Dict[str, str] = dict(DEFAULT_HOTLIST)
        self.recent_reads: List[PlateResult] = []
        self._max_recent_reads = 100

        # Lazy-load to avoid slowing startup when ANPR isn't needed
        self._load_models()

    def add_to_hotlist(self, plate: str, reason: str = "Operator Flagged") -> str:
        """Add a plate to the active watchlist."""
        norm = normalize_plate(plate)
        if norm:
            self.hotlist[norm] = reason
            logger.info("ANPR Watchlist ADD: %s (%s)", norm, reason)
        return norm

    def remove_from_hotlist(self, plate: str) -> bool:
        """Remove a plate from the active watchlist."""
        norm = normalize_plate(plate)
        removed = self.hotlist.pop(norm, None) is not None
        if removed:
            logger.info("ANPR Watchlist REMOVE: %s", norm)
        return removed

    def get_hotlist(self) -> Dict[str, str]:
        """Return the dictionary of flagged plates and reasons."""
        return dict(self.hotlist)

    def check_hotlist(self, plate_text: str) -> Tuple[bool, Optional[str]]:
        """Check whether a plate matches any watchlist entry."""
        norm = normalize_plate(plate_text)
        if not norm:
            return False, None
        for hot_plate, reason in self.hotlist.items():
            if hot_plate in norm or norm in hot_plate:
                return True, reason
        return False, None

    def get_recent_reads(self, limit: int = 50) -> List[Dict]:
        """Return the latest vehicle reads as serializable dictionaries."""
        return [
            {
                "plate_text": r.plate_text,
                "plate_confidence": round(r.plate_confidence, 2),
                "ocr_confidence": round(r.ocr_confidence, 2),
                "track_id": r.track_id,
                "timestamp_ms": r.timestamp_ms,
                "is_hotlist": r.is_hotlist,
                "hotlist_reason": r.hotlist_reason,
                "camera_id": r.camera_id,
                "class_name": r.class_name,
            }
            for r in reversed(self.recent_reads[-limit:])
        ]

    def _record_read(self, result: PlateResult):
        """Append to recent reads, avoiding rapid consecutive duplicates for same track."""
        if self.recent_reads and self.recent_reads[-1].track_id == result.track_id:
            if self.recent_reads[-1].plate_text == result.plate_text:
                return
        self.recent_reads.append(result)
        if len(self.recent_reads) > self._max_recent_reads:
            self.recent_reads = self.recent_reads[-self._max_recent_reads:]

    def _load_models(self):
        """Load the plate detection YOLO model and EasyOCR reader."""
        try:
            from ultralytics import YOLO

            # Try to download from HuggingFace — iterate through fallback repos
            ckpt_path = None
            try:
                from huggingface_hub import hf_hub_download
                for repo_id, filename in PLATE_MODEL_REPOS:
                    try:
                        ckpt_path = hf_hub_download(repo_id=repo_id, filename=filename)
                        logger.info("Loaded plate detection model from HuggingFace: %s/%s", repo_id, filename)
                        break
                    except Exception:
                        continue
            except ImportError:
                logger.warning("huggingface_hub not installed — plate localization disabled.")

            if ckpt_path is None:
                logger.warning(
                    "Could not download any plate detection model from HuggingFace. "
                    "ANPR will use OCR directly on vehicle crops (no plate localization)."
                )

            if ckpt_path:
                self._plate_model = YOLO(ckpt_path)
                logger.info("Plate detection YOLO model loaded successfully.")

        except ImportError:
            logger.warning("ultralytics not installed — plate detection disabled.")

        try:
            import easyocr
            # gpu=True if CUDA available and device isn't explicitly 'cpu'
            use_gpu = self.device != "cpu"
            self._ocr_reader = easyocr.Reader(
                self._ocr_languages,
                gpu=use_gpu,
                verbose=False,
            )
            logger.info("EasyOCR reader initialized (languages=%s, gpu=%s).", self._ocr_languages, use_gpu)
        except ImportError:
            logger.warning("easyocr not installed — plate text reading disabled.")
        except Exception as e:
            logger.warning("EasyOCR initialization failed: %s", e)

        self._model_loaded = True

    @property
    def is_available(self) -> bool:
        """True if at least OCR is available (plate model is optional)."""
        return self._ocr_reader is not None

    def process_vehicle(
        self,
        frame: np.ndarray,
        vehicle_bbox: List[float],
        track_id: int,
        frame_idx: int,
        timestamp_ms: float = 0.0,
        class_name: str = "car",
        camera_id: str = "",
    ) -> Optional[PlateResult]:
        """
        Detect and read a number plate within a vehicle's bounding box.

        Returns a PlateResult if a plate is found (or cached), None otherwise.
        Skips OCR on non-cadence frames and returns the cached result instead.
        """
        # Only process vehicles
        if class_name not in ("car", "truck", "bus", "motorcycle"):
            return None

        if not self.is_available:
            return None

        cache = self._track_cache.get(track_id)

        # Check if we should skip this frame for this track
        if cache and (frame_idx - cache.last_read_frame) < self.read_every_n_frames:
            # Return cached result if we have one
            if cache.best_text:
                is_hot, hot_reason = self.check_hotlist(cache.best_text)
                return PlateResult(
                    plate_text=cache.best_text,
                    plate_confidence=cache.best_det_conf,
                    ocr_confidence=cache.best_ocr_conf,
                    plate_bbox=cache.plate_bbox,
                    track_id=track_id,
                    timestamp_ms=timestamp_ms,
                    is_hotlist=is_hot,
                    hotlist_reason=hot_reason,
                    camera_id=camera_id,
                    class_name=class_name,
                )
            return None

        # Initialize cache for new track
        if cache is None:
            cache = _TrackPlateCache()
            self._track_cache[track_id] = cache

        cache.last_read_frame = frame_idx

        # Extract vehicle crop from frame
        h, w = frame.shape[:2]
        vx1 = max(0, int(vehicle_bbox[0]))
        vy1 = max(0, int(vehicle_bbox[1]))
        vx2 = min(w, int(vehicle_bbox[2]))
        vy2 = min(h, int(vehicle_bbox[3]))

        if (vx2 - vx1) < 30 or (vy2 - vy1) < 30:
            return None  # Vehicle crop too small

        vehicle_crop = frame[vy1:vy2, vx1:vx2]

        # Step 1: Detect plate region within the vehicle crop
        plate_crop, plate_bbox_in_crop = self._detect_plate_region(vehicle_crop)

        if plate_crop is None:
            # No plate model or no plate detected — try OCR on lower half of vehicle
            crop_h = vehicle_crop.shape[0]
            plate_crop = vehicle_crop[crop_h // 2:, :]
            plate_bbox_in_crop = (0, crop_h // 2, vehicle_crop.shape[1], crop_h)

        # Step 2: Run OCR on the plate region
        plate_text, ocr_conf = self._read_plate_text(plate_crop)

        if not plate_text:
            # Return cached if we had a previous read
            if cache.best_text:
                is_hot, hot_reason = self.check_hotlist(cache.best_text)
                return PlateResult(
                    plate_text=cache.best_text,
                    plate_confidence=cache.best_det_conf,
                    ocr_confidence=cache.best_ocr_conf,
                    plate_bbox=cache.plate_bbox,
                    track_id=track_id,
                    timestamp_ms=timestamp_ms,
                    is_hotlist=is_hot,
                    hotlist_reason=hot_reason,
                    camera_id=camera_id,
                    class_name=class_name,
                )
            return None

        # Convert plate bbox from crop-relative to frame-relative
        px1, py1, px2, py2 = plate_bbox_in_crop
        frame_plate_bbox = [vx1 + px1, vy1 + py1, vx1 + px2, vy1 + py2]

        # Update cache if this read is better
        det_conf = 0.9  # Default if no plate model used
        if ocr_conf > cache.best_ocr_conf or not cache.best_text:
            cache.best_text = plate_text
            cache.best_ocr_conf = ocr_conf
            cache.best_det_conf = det_conf
            cache.plate_bbox = frame_plate_bbox
            cache.read_count += 1

        is_hot, hot_reason = self.check_hotlist(cache.best_text)
        res = PlateResult(
            plate_text=cache.best_text,
            plate_confidence=cache.best_det_conf,
            ocr_confidence=cache.best_ocr_conf,
            plate_bbox=cache.plate_bbox,
            track_id=track_id,
            timestamp_ms=timestamp_ms,
            is_hotlist=is_hot,
            hotlist_reason=hot_reason,
            camera_id=camera_id,
            class_name=class_name,
        )
        self._record_read(res)
        return res

    def _detect_plate_region(
        self, vehicle_crop: np.ndarray
    ) -> Tuple[Optional[np.ndarray], Optional[Tuple[int, int, int, int]]]:
        """
        Use the plate detection YOLO model to find the plate region within a vehicle crop.
        Returns (plate_crop, (x1, y1, x2, y2)) or (None, None) if no plate found.
        """
        if self._plate_model is None:
            return None, None

        try:
            results = self._plate_model.predict(
                source=vehicle_crop,
                conf=self.plate_conf,
                verbose=False,
                device=self.device,
            )

            if not results or len(results) == 0:
                return None, None

            boxes = results[0].boxes
            if boxes is None or len(boxes) == 0:
                return None, None

            # Take the highest-confidence plate detection
            best_idx = int(boxes.conf.argmax())
            xyxy = boxes.xyxy[best_idx].cpu().numpy().astype(int)
            x1, y1, x2, y2 = xyxy

            h, w = vehicle_crop.shape[:2]
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(w, x2), min(h, y2)

            if (x2 - x1) < 10 or (y2 - y1) < 5:
                return None, None

            plate_crop = vehicle_crop[y1:y2, x1:x2]
            return plate_crop, (x1, y1, x2, y2)

        except Exception as e:
            logger.debug("Plate detection failed: %s", e)
            return None, None

    def _read_plate_text(self, plate_crop: np.ndarray) -> Tuple[str, float]:
        """
        Run EasyOCR on a plate crop image. Returns (cleaned_text, avg_confidence).
        """
        if self._ocr_reader is None:
            return "", 0.0

        try:
            # Preprocess: convert to grayscale, resize for better OCR
            if len(plate_crop.shape) == 3:
                gray = cv2.cvtColor(plate_crop, cv2.COLOR_BGR2GRAY)
            else:
                gray = plate_crop

            # Resize to a reasonable height for OCR
            target_h = 80
            h, w = gray.shape[:2]
            if h > 0 and w > 0:
                scale = target_h / h
                gray = cv2.resize(gray, (int(w * scale), target_h), interpolation=cv2.INTER_CUBIC)

            # Apply adaptive thresholding for better contrast
            gray = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2
            )

            results = self._ocr_reader.readtext(gray, detail=1, paragraph=False)

            if not results:
                return "", 0.0

            # Combine all detected text segments
            texts = []
            confs = []
            for (bbox_pts, text, conf) in results:
                cleaned = self._clean_plate_text(text)
                if cleaned and len(cleaned) >= 2:
                    texts.append(cleaned)
                    confs.append(conf)

            if not texts:
                return "", 0.0

            combined_text = " ".join(texts)
            avg_conf = sum(confs) / len(confs) if confs else 0.0

            return combined_text, avg_conf

        except Exception as e:
            logger.debug("OCR failed: %s", e)
            return "", 0.0

    @staticmethod
    def _clean_plate_text(text: str) -> str:
        """
        Clean OCR output to extract likely plate characters.
        Indian plates: XX 00 XX 0000 format (state code, district, series, number)
        """
        # Keep only alphanumeric characters and spaces
        cleaned = ""
        for ch in text.upper():
            if ch.isalnum() or ch == " " or ch == "-":
                cleaned += ch
        return cleaned.strip()

    def get_cached_plate(self, track_id: int) -> Optional[str]:
        """Get the cached plate text for a track ID, if any."""
        cache = self._track_cache.get(track_id)
        if cache and cache.best_text:
            return cache.best_text
        return None

    def clear_cache(self, track_id: Optional[int] = None):
        """Clear plate cache for a specific track or all tracks."""
        if track_id is not None:
            self._track_cache.pop(track_id, None)
        else:
            self._track_cache.clear()

    def draw_plates(
        self,
        frame: np.ndarray,
        plate_results: List[PlateResult],
    ) -> np.ndarray:
        """
        Draw plate detection overlays on the frame.
        Shows plate bounding box and OCR text.
        """
        annotated = frame.copy()

        for pr in plate_results:
            if not pr.plate_text or not pr.plate_bbox:
                continue

            x1, y1, x2, y2 = [int(v) for v in pr.plate_bbox]

            if pr.is_hotlist:
                # HOTLIST BREACH: High-visibility Red / Amber warning
                box_color = (0, 0, 255)  # BGR Red
                text_color = (255, 255, 255)
                bg_color = (0, 0, 200)
                label = f"HOTLIST HIT: {pr.plate_text}"
                box_thick = 3
            else:
                # Normal plate: Cyan box, Yellow text
                box_color = (255, 255, 0)
                text_color = (0, 255, 255)
                bg_color = (0, 0, 0)
                label = f"PLATE: {pr.plate_text}"
                box_thick = 2

            # Draw plate bounding box
            cv2.rectangle(annotated, (x1, y1), (x2, y2), box_color, box_thick)

            # Draw plate text label
            (tw, th), baseline = cv2.getTextSize(
                label, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2
            )
            label_y = y2 + th + 8
            cv2.rectangle(
                annotated,
                (x1, y2 + 2),
                (x1 + tw + 10, label_y + 4),
                bg_color,
                -1,
            )
            cv2.putText(
                annotated,
                label,
                (x1 + 4, label_y),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.55,
                text_color,
                2,
                cv2.LINE_AA,
            )

        return annotated
