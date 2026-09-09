"""
IBVAP Sentinel — tests/test_live_stream.py

Real (not mocked) coverage for core/vision/live_stream.py: a recorded video
file actually produces real annotated frames and flips health to ONLINE; a
missing source and a dead/stub capture device (e.g. a webcam-less sandbox
where cv2.VideoCapture(0) reports success but returns a flat frame) both
report OFFLINE with an honest reason and a genuine NO SIGNAL placeholder —
never a fake "connected" state.
"""

from pathlib import Path
import sys
import time

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import numpy as np
import pytest

from core.vision.camera_health import CameraHealthMonitor
from core.vision.live_stream import CameraConfig, LiveCameraWorker, _no_signal_frame


def _wait_for(predicate, timeout_s=10.0, interval_s=0.2):
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval_s)
    return False


def test_real_video_file_goes_online_with_real_frames():
    video_path = ROOT_DIR / "data" / "sample_border_web.mp4"
    if not video_path.exists():
        pytest.skip("data/sample_border_web.mp4 not present in this environment")

    monitor = CameraHealthMonitor()
    config = CameraConfig("TEST_CAM_REAL", "data/sample_border_web.mp4", "Test Camera")
    worker = LiveCameraWorker(config, monitor)
    worker.start()
    try:
        assert _wait_for(lambda: worker.get_jpeg_frame() is not None), "worker never produced a frame"
        assert monitor.cameras["TEST_CAM_REAL"].status == "ONLINE"
        frame_bytes = worker.get_jpeg_frame()
        assert frame_bytes[:3] == b"\xff\xd8\xff"  # real JPEG magic bytes, not a stub
    finally:
        worker.stop()


def test_missing_source_reports_offline_not_a_crash():
    monitor = CameraHealthMonitor()
    config = CameraConfig("TEST_CAM_GHOST", "data/definitely_does_not_exist.mp4", "Ghost Camera")
    worker = LiveCameraWorker(config, monitor)
    worker.start()
    try:
        assert _wait_for(lambda: "TEST_CAM_GHOST" in monitor.cameras and monitor.cameras["TEST_CAM_GHOST"].status == "OFFLINE")
        assert "not found" in monitor.cameras["TEST_CAM_GHOST"].details.lower()
        # Even with no real source, get_jpeg_frame() must return *something*
        # (a NO SIGNAL placeholder) rather than None forever.
        assert _wait_for(lambda: worker.get_jpeg_frame() is not None)
    finally:
        worker.stop()


def test_dead_stub_device_is_detected_and_reported_honestly(monkeypatch):
    """Simulates the real sandbox condition found during development: a
    capture device that reports isOpened()=True and ret=True but returns a
    perfectly flat frame (std()==0.0) — must never be treated as live."""

    class _FakeDeadCapture:
        def isOpened(self):
            return True

        def read(self):
            return True, np.full((480, 640, 3), 16, dtype=np.uint8)

        def release(self):
            pass

    import core.vision.live_stream as live_stream_module

    monkeypatch.setattr(live_stream_module.cv2, "VideoCapture", lambda *_a, **_k: _FakeDeadCapture())

    monitor = CameraHealthMonitor()
    config = CameraConfig("TEST_CAM_STUB", 0, "Stub Webcam", is_webcam=True)
    worker = LiveCameraWorker(config, monitor)
    worker.start()
    try:
        assert _wait_for(lambda: "TEST_CAM_STUB" in monitor.cameras and monitor.cameras["TEST_CAM_STUB"].status == "OFFLINE")
        assert "no real image data" in monitor.cameras["TEST_CAM_STUB"].details.lower()
    finally:
        worker.stop()


def test_no_signal_frame_is_a_real_encodable_image():
    frame = _no_signal_frame("CAM_TEST", "unit test reason")
    assert frame.shape == (360, 640, 3)
    assert frame.std() > 0  # not literally blank — has visible hatch + text


def test_mark_offline_auto_creates_unknown_camera():
    monitor = CameraHealthMonitor()
    assert "TEST_UNKNOWN" not in monitor.cameras
    monitor.mark_offline("TEST_UNKNOWN", "test reason")
    assert monitor.cameras["TEST_UNKNOWN"].status == "OFFLINE"
    assert monitor.cameras["TEST_UNKNOWN"].details == "test reason"


def test_all_cameras_start_connecting_not_fake_online():
    """Regression test for the hardcoded-ONLINE-with-fake-fps bug found
    during the Section 1 audit — every camera must start honest."""
    monitor = CameraHealthMonitor()
    for record in monitor.cameras.values():
        assert record.status == "CONNECTING"
        assert record.fps == 0.0
