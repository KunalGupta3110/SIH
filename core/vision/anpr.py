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
PLATE_CONF_THRESHOLD = 0.20

# Default border security watchlist (normalized plate -> alert reason)
DEFAULT_HOTLIST: Dict[str, str] = {
    "MH43CC1745": "Flagged High-Risk Vehicle (Active Intercept Order)",
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
        # Allow vehicles, phones, or props
        if class_name not in ("car", "truck", "bus", "motorcycle", "cell phone", "vehicle_prop"):
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

        if (vx2 - vx1) < 20 or (vy2 - vy1) < 20:
            return None  # Crop too small

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

    def detect_plates_in_frame(
        self, frame: np.ndarray, conf: Optional[float] = None
    ) -> List[Tuple[np.ndarray, List[int], float]]:
        """
        Run the plate detection YOLO model on the entire frame.
        Returns list of (plate_crop, [x1, y1, x2, y2], confidence).
        """
        if self._plate_model is None or frame is None or frame.size == 0:
            return []

        conf = conf or self.plate_conf
        try:
            results = self._plate_model.predict(
                source=frame,
                conf=conf,
                verbose=False,
                device=self.device,
            )
            if not results or len(results) == 0:
                return []

            boxes = results[0].boxes
            if boxes is None or len(boxes) == 0:
                return []

            h, w = frame.shape[:2]
            detections = []
            for b in boxes:
                det_conf = float(b.conf[0])
                xyxy = b.xyxy[0].cpu().numpy().astype(int)
                x1, y1, x2, y2 = xyxy
                # Add small 4px padding
                x1, y1 = max(0, x1 - 4), max(0, y1 - 4)
                x2, y2 = min(w, x2 + 4), min(h, y2 + 4)
                if (x2 - x1) < 15 or (y2 - y1) < 8:
                    continue
                crop = frame[y1:y2, x1:x2]
                detections.append((crop, [int(x1), int(y1), int(x2), int(y2)], det_conf))
            return detections
        except Exception as e:
            logger.debug("Frame plate detection error: %s", e)
            return []

    def process_frame(
        self,
        frame: np.ndarray,
        tracks: Optional[List[Any]] = None,
        frame_idx: int = 0,
        timestamp_ms: float = 0.0,
        camera_id: str = "",
    ) -> List[PlateResult]:
        """
        Comprehensive ANPR:
        1. Checks tracked vehicles, cell phones, and props if provided.
        2. Scans full frame directly for license plates (supports phones, tabletop cutouts, distant vehicles).
        3. Returns all detected and read plates with bounding boxes and hotlist status.
        """
        if not self.is_available or frame is None or frame.size == 0:
            return []

        results: List[PlateResult] = []
        covered_bboxes: List[List[int]] = []

        # 1. Process known vehicle/phone tracks if available
        if tracks:
            for obj in tracks:
                cname = getattr(obj, "class_name", "")
                if cname in ("car", "truck", "bus", "motorcycle", "cell phone", "vehicle_prop"):
                    tid = getattr(obj, "track_id", 0)
                    bbox = getattr(obj, "bbox", [])
                    pr = self.process_vehicle(
                        frame=frame,
                        vehicle_bbox=bbox,
                        track_id=tid,
                        frame_idx=frame_idx,
                        timestamp_ms=timestamp_ms,
                        class_name=cname,
                        camera_id=camera_id,
                    )
                    if pr and pr.plate_text:
                        results.append(pr)
                        if pr.plate_bbox:
                            covered_bboxes.append(pr.plate_bbox)

        # 2. Direct full-frame plate scan (detects plates held on phones, cutouts, or untracked cars)
        scan_frame = (frame_idx % self.read_every_n_frames == 0) or len(results) == 0
        if scan_frame and self._plate_model is not None:
            raw_plates = self.detect_plates_in_frame(frame)
            for idx, (p_crop, p_bbox, p_conf) in enumerate(raw_plates):
                # Check overlap with existing results
                px1, py1, px2, py2 = p_bbox
                overlap = False
                for cb in covered_bboxes:
                    cx1, cy1, cx2, cy2 = cb
                    ix1, iy1 = max(px1, cx1), max(py1, cy1)
                    ix2, iy2 = min(px2, cx2), min(py2, cy2)
                    if ix2 > ix1 and iy2 > iy1:
                        overlap = True
                        break
                if overlap:
                    continue

                # Run OCR on the plate crop
                p_text, ocr_conf = self._read_plate_text(p_crop)
                if p_text and len(p_text) >= 3:
                    is_hot, hot_reason = self.check_hotlist(p_text)
                    synth_track_id = 9000 + (idx % 50)
                    pr = PlateResult(
                        plate_text=p_text,
                        plate_confidence=p_conf,
                        ocr_confidence=ocr_conf,
                        plate_bbox=p_bbox,
                        track_id=synth_track_id,
                        timestamp_ms=timestamp_ms,
                        is_hotlist=is_hot,
                        hotlist_reason=hot_reason,
                        camera_id=camera_id,
                        class_name="plate_direct",
                    )
                    self._record_read(pr)
                    # Cache in track cache for continuity
                    cache = self._track_cache.setdefault(synth_track_id, _TrackPlateCache())
                    cache.best_text = p_text
                    cache.best_ocr_conf = ocr_conf
                    cache.best_det_conf = p_conf
                    cache.plate_bbox = p_bbox
                    cache.last_read_frame = frame_idx
                    cache.read_count += 1

                    results.append(pr)
                    covered_bboxes.append(p_bbox)

        # 3. Persistence: if no plate detected on this immediate frame, keep recent active reads
        if not results:
            for tid, cache in self._track_cache.items():
                if cache.best_text and (frame_idx - cache.last_read_frame) < 18:
                    is_hot, hot_reason = self.check_hotlist(cache.best_text)
                    results.append(
                        PlateResult(
                            plate_text=cache.best_text,
                            plate_confidence=cache.best_det_conf,
                            ocr_confidence=cache.best_ocr_conf,
                            plate_bbox=cache.plate_bbox,
                            track_id=tid,
                            timestamp_ms=timestamp_ms,
                            is_hotlist=is_hot,
                            hotlist_reason=hot_reason,
                            camera_id=camera_id,
                            class_name="cached",
                        )
                    )

        return results

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
            x1, y1 = max(0, x1 - 3), max(0, y1 - 3)
            x2, y2 = min(w, x2 + 3), min(h, y2 + 3)

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
        Applies cubic upscaling and fallback contrast enhancement.
        """
        if self._ocr_reader is None or plate_crop is None or plate_crop.size == 0:
            return "", 0.0

        try:
            h, w = plate_crop.shape[:2]
            if h < 8 or w < 15:
                return "", 0.0

            # Scale up to ~75-85px height for clean OCR stroke recognition
            target_h = 80
            scale = max(1.5, target_h / float(h))
            new_w = max(40, int(w * scale))
            new_h = max(24, int(h * scale))
            upscaled = cv2.resize(plate_crop, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

            # Pass 1: Direct upscaled image
            results = self._ocr_reader.readtext(upscaled, detail=1, paragraph=False)

            # Pass 2: Fallback with CLAHE if nothing found
            if not results:
                gray = cv2.cvtColor(upscaled, cv2.COLOR_BGR2GRAY) if len(upscaled.shape) == 3 else upscaled
                clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
                enhanced = clahe.apply(gray)
                results = self._ocr_reader.readtext(enhanced, detail=1, paragraph=False)

            if not results:
                return "", 0.0

            texts = []
            confs = []
            for (bbox_pts, text, conf) in results:
                cleaned = self._clean_plate_text(text)
                if cleaned and len(cleaned) >= 2:
                    texts.append(cleaned)
                    confs.append(float(conf))

            if not texts:
                return "", 0.0

            combined_text = "".join(texts)
            combined_text = self._format_plate_heuristics(combined_text)
            avg_conf = sum(confs) / len(confs) if confs else 0.0

            return combined_text, avg_conf

        except Exception as e:
            logger.debug("OCR failed: %s", e)
            return "", 0.0

    @staticmethod
    def _format_plate_heuristics(text: str) -> str:
        """Apply Indian license plate formatting and OCR error correction."""
        import re
        t = re.sub(r"[^A-Za-z0-9]", "", text).upper()

        # Strip leading IND or IN badge from HSRP plates
        if t.startswith("IND") and len(t) > 5:
            t = t[3:]
        elif t.startswith("IN") and len(t) > 5 and t[2:4].isdigit():
            t = t[2:]

        # If OCR confused 'PA', 'FA', 'FH', 'MH' with leading artifacts
        if (t.startswith("PA") or t.startswith("FA") or t.startswith("FH")) and len(t) >= 6:
            if t[2:4].isdigit():
                t = "MH" + t[2:]

        # Correct trailing 4 characters to digits if length >= 8
        if len(t) >= 8:
            head = t[:-4]
            tail = t[-4:]
            digit_map = {
                "Z": "7", "O": "0", "D": "0", "Q": "0",
                "I": "1", "L": "1", "S": "5", "B": "8", "G": "6"
            }
            tail_fixed = "".join(digit_map.get(c, c) for c in tail)
            t = head + tail_fixed

        return t

    @staticmethod
    def _clean_plate_text(text: str) -> str:
        """
        Clean OCR output to extract alphanumeric characters.
        """
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
