"""
IBVAP Sentinel — tests/test_clip_capture.py

Test suite for:
  - Video clip saving by object code (Person = 1 -> folder '1_PERSON').
  - Generation of companion .sha256 file in the same folder.
  - Generation of Section 65B companion manifest in the same folder.
  - Authenticity verification (valid: True on untouched file).
  - Tamper detection (valid: False on 1-bit / byte alteration).
  - API endpoints /api/v1/clips/save, /api/v1/clips, /api/v1/clips/verify.
"""

import io
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from core.backend_service import get_backend


def test_save_captured_clip_person_code_1():
    backend = get_backend()
    dummy_video_bytes = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00isommp42\xde\xad\xbe\xef"
    test_filename = "1_PERSON_CAM_ALPHA_TEST_RUN.webm"

    result = backend.save_captured_clip(
        video_bytes=dummy_video_bytes,
        filename=test_filename,
        object_code=1,
        camera_id="CAM_ALPHA",
        duration_sec=7.5,
        notes="Test perimeter intrusion clip",
    )

    assert result["object_code"] == 1
    assert result["object_class"] == "PERSON"
    assert result["folder"] == "1_PERSON"
    assert result["video_filename"] == test_filename
    assert result["hash_filename"] == f"{test_filename}.sha256"

    # Verify files exist in the same folder
    target_dir = ROOT_DIR / "data" / "captured_clips" / "1_PERSON"
    video_path = target_dir / test_filename
    hash_path = target_dir / f"{test_filename}.sha256"
    manifest_path = target_dir / result["manifest_filename"]

    assert video_path.exists(), "Video file must exist"
    assert hash_path.exists(), "Companion .sha256 file must exist in same folder"
    assert manifest_path.exists(), "Companion Section 65B manifest must exist in same folder"

    # Verify .sha256 content format
    hash_content = hash_path.read_text(encoding="utf-8")
    assert result["sha256"] in hash_content
    assert f"*{test_filename}" in hash_content

    # Verify authenticity check passes
    verify_res = backend.verify_clip_file(str(video_path))
    assert verify_res["valid"] is True
    assert "Zero tampering" in verify_res["reason"]


def test_tamper_detection_on_altered_clip():
    backend = get_backend()
    dummy_bytes = b"ORIGINAL_LEGAL_EVIDENCE_STREAM_BYTES_2026"
    test_filename = "1_PERSON_TAMPER_TEST.webm"

    result = backend.save_captured_clip(
        video_bytes=dummy_bytes,
        filename=test_filename,
        object_code=1,
        camera_id="CAM_ALPHA",
    )

    target_dir = ROOT_DIR / "data" / "captured_clips" / "1_PERSON"
    video_path = target_dir / test_filename

    # Step 1: Pristine check
    verify_clean = backend.verify_clip_file(str(video_path))
    assert verify_clean["valid"] is True

    # Step 2: Tamper by modifying 1 byte
    with open(video_path, "wb") as f:
        f.write(b"TAMPERED_LEGAL_EVIDENCE_STREAM_BYTES_2026")

    verify_tampered = backend.verify_clip_file(str(video_path))
    assert verify_tampered["valid"] is False
    assert "TAMPER DETECTED" in verify_tampered["reason"]


def test_api_gateway_clips_endpoints(client):
    # Test POST /api/v1/clips/save
    dummy_file = io.BytesIO(b"DEMO_API_GATEWAY_VIDEO_BYTES_9999")
    res = client.post(
        "/api/v1/clips/save",
        files={"video": ("1_PERSON_GATEWAY_DEMO.webm", dummy_file, "video/webm")},
        data={
            "object_code": "1",
            "camera_id": "CAM_ALPHA",
            "duration_sec": "5.0",
            "notes": "FastAPI multipart upload test",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["object_code"] == 1
    assert data["object_class"] == "PERSON"
    assert "sha256" in data

    # Test GET /api/v1/clips
    list_res = client.get("/api/v1/clips")
    assert list_res.status_code == 200
    clips_list = list_res.json()["clips"]
    assert len(clips_list) > 0

    # Test POST /api/v1/clips/verify
    verify_res = client.post(
        "/api/v1/clips/verify",
        json={"video_path": data["video_path"]},
    )
    assert verify_res.status_code == 200
    assert verify_res.json()["valid"] is True


if __name__ == "__main__":
    print("[1/2] Testing clip saving for Person (Code 1) & companion .sha256 in same folder...")
    test_save_captured_clip_person_code_1()
    print("      -> PASSED!")

    print("[2/2] Testing tamper detection on altered video bytes...")
    test_tamper_detection_on_altered_clip()
    print("      -> PASSED! Tamper was successfully detected!")

    print("\n[OK] ALL BACKEND CLIP CAPTURE & TAMPER-PROTECTION TESTS PASSED!")

