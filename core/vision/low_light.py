"""
IBVAP Sentinel
Module: core/vision/low_light.py
Description: Real image-based low-light detection and CLAHE enhancement.

Previously "night-time" anywhere in this codebase meant a wall-clock check
(10pm-5am) with no relationship to what the camera actually saw — a dark
room at noon read as daytime, a floodlit gate at 2am read as night. This
measures actual frame brightness and only enhances frames that are
genuinely dark, regardless of the clock.
"""

import cv2
import numpy as np

# Mean grayscale brightness (0-255) below this counts as low-light.
DARK_MEAN_THRESHOLD = 70.0


def frame_brightness(frame: np.ndarray) -> float:
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    return float(np.mean(gray))


def is_low_light(frame: np.ndarray) -> bool:
    return frame_brightness(frame) < DARK_MEAN_THRESHOLD


def enhance_low_light(frame: np.ndarray) -> np.ndarray:
    """CLAHE (contrast-limited adaptive histogram equalization) on the L
    channel of LAB colour space boosts visibility in dark regions without
    blowing out any brighter ones already in frame, then a mild gamma lift
    reaches further into near-zero-light footage."""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8))
    l_eq = clahe.apply(l_channel)
    enhanced = cv2.cvtColor(cv2.merge((l_eq, a_channel, b_channel)), cv2.COLOR_LAB2BGR)

    gamma = 1.6
    inv_gamma = 1.0 / gamma
    lut = np.array([((i / 255.0) ** inv_gamma) * 255 for i in range(256)]).astype("uint8")
    return cv2.LUT(enhanced, lut)
