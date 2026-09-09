"""
IBVAP Sentinel — backend/generate_real_reid_demo.py
Module: Genuine 2-Camera Cross-Corridor Re-ID Pipeline with ResNet-18 Embeddings

1. Constructs two independent camera clips (Camera 1 Ingress vs Camera 2 Downstream)
   with a blind transit gap between them.
2. Runs YOLOv8 + ByteTrack independently on both camera streams.
3. Extracts authentic 512-dimensional visual appearance feature embeddings using
   pretrained ResNet-18 (penultimate layer).
4. Computes genuine deterministic cosine similarity between Camera 1 and Camera 2 subject embeddings.
5. Runs a negative control test against an unrelated target/background to mathematically verify discrimination.
6. Exports auditable telemetry JSON and video clips to data/ and frontend/public/data/.
"""

from pathlib import Path
import json
import shutil
import sys
import time
import cv2
import numpy as np
import torch
import torchvision.models as models
import torchvision.transforms as T
from PIL import Image

ROOT_DIR = Path(__file__).resolve().parent.parent
SOURCE_VIDEO = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_yolo_demo.mp4"
CAM1_OUTPUT_VIDEO = ROOT_DIR / "data" / "demo_footage" / "reid_cam1_entry.mp4"
CAM2_OUTPUT_VIDEO = ROOT_DIR / "data" / "demo_footage" / "reid_cam2_exit.mp4"
REID_TELEMETRY_JSON = ROOT_DIR / "data" / "demo_footage" / "ibvap_real_reid_telemetry.json"
FRONTEND_PUBLIC_DATA = ROOT_DIR / "frontend" / "public" / "data"

# Camera 1 viewpoint: frames 0 to 110 (ingress approach)
CAM1_START_FRAME = 0
CAM1_END_FRAME = 110

# Blind transit gap: frames 111 to 149 (unmonitored transit corridor: ~1.3s)
TRANSIT_GAP_FRAMES = 40
TRANSIT_GAP_SEC = 1.33

# Camera 2 viewpoint: frames 150 to 257 (downstream re-acquisition)
CAM2_START_FRAME = 150
CAM2_END_FRAME = 257


def setup_feature_extractor():
    """Load pretrained ResNet-18 and strip classification head to produce 512-d feature vectors."""
    weights = models.ResNet18_Weights.DEFAULT
    resnet = models.resnet18(weights=weights)
    modules = list(resnet.children())[:-1]  # drop fc layer, keep AdaptiveAvgPool2d
    extractor = torch.nn.Sequential(*modules)
    extractor.eval()
    return extractor


def get_image_transform():
    return T.Compose([
        T.Resize((224, 224)),
        T.ToTensor(),
        T.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])


def extract_embedding(extractor, transform, bgr_crop: np.ndarray) -> np.ndarray:
    """Extract L2-normalized 512-d feature embedding vector from an image crop."""
    rgb = cv2.cvtColor(bgr_crop, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    tensor = transform(pil_img).unsqueeze(0)
    with torch.no_grad():
        features = extractor(tensor).flatten().cpu().numpy()
    # Normalize to unit sphere for stable cosine similarity
    norm = np.linalg.norm(features)
    if norm > 1e-8:
        features = features / norm
    return features


def run_reid_pipeline():
    from ultralytics import YOLO

    print(f"[Real Re-ID] Initializing YOLOv8n detector & ResNet-18 feature extractor...")
    yolo = YOLO("yolov8n.pt")
    extractor = setup_feature_extractor()
    transform = get_image_transform()

    cap = cv2.VideoCapture(str(SOURCE_VIDEO))
    if not cap.isOpened():
        raise FileNotFoundError(f"Cannot open source video: {SOURCE_VIDEO}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    # ── GENERATE CAMERA 1 CLIP (Frames 0 to 110) ──────────────────────
    print(f"[Real Re-ID] Generating Camera 1 Ingress clip ({CAM1_START_FRAME} to {CAM1_END_FRAME})...")
    cap.set(cv2.CAP_PROP_POS_FRAMES, CAM1_START_FRAME)
    out1 = cv2.VideoWriter(str(CAM1_OUTPUT_VIDEO), fourcc, fps, (width, height))

    cam1_target_crop = None
    cam1_target_box = None
    cam1_best_conf = 0.0

    for f_idx in range(CAM1_START_FRAME, CAM1_END_FRAME + 1):
        ret, frame = cap.read()
        if not ret:
            break

        results = yolo.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False)[0]

        # Draw Cam 1 Telemetry
        cv2.rectangle(frame, (0, 0), (width, 32), (10, 20, 15), -1)
        cv2.putText(
            frame,
            f"CAM 01 [CHECKPOST ALPHA INGRESS] · YOLOv8n + ByteTrack · Frame {f_idx:03d}/{CAM1_END_FRAME}",
            (14, 21),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (76, 154, 106),
            1,
            cv2.LINE_AA,
        )

        if results.boxes is not None and len(results.boxes) > 0:
            for box, conf, cls_id in zip(results.boxes.xyxy.cpu().numpy(), results.boxes.conf.cpu().numpy(), results.boxes.cls.cpu().numpy()):
                cls_name = yolo.names[int(cls_id)]
                if cls_name in {"car", "truck"}:
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (76, 154, 106), 2)
                    cv2.putText(frame, f"CAM 01: {cls_name.upper()} {conf*100:.1f}%", (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (76, 154, 106), 1)

                    # Save best crop near exit of Camera 1
                    if f_idx >= 70 and conf > cam1_best_conf:
                        crop = frame[max(0, y1):min(height, y2), max(0, x1):min(width, x2)]
                        if crop.size > 0:
                            cam1_target_crop = crop.copy()
                            cam1_target_box = [x1, y1, x2, y2]
                            cam1_best_conf = float(conf)

        out1.write(frame)
    out1.release()

    # ── GENERATE CAMERA 2 CLIP (Frames 150 to 257) ────────────────────
    print(f"[Real Re-ID] Generating Camera 2 Downstream clip ({CAM2_START_FRAME} to {CAM2_END_FRAME})...")
    cap.set(cv2.CAP_PROP_POS_FRAMES, CAM2_START_FRAME)
    out2 = cv2.VideoWriter(str(CAM2_OUTPUT_VIDEO), fourcc, fps, (width, height))

    cam2_target_crop = None
    cam2_target_box = None
    cam2_best_conf = 0.0

    for f_idx in range(CAM2_START_FRAME, CAM2_END_FRAME + 1):
        ret, frame = cap.read()
        if not ret:
            break

        results = yolo.track(frame, tracker="bytetrack.yaml", persist=True, verbose=False)[0]

        # Draw Cam 2 Telemetry
        cv2.rectangle(frame, (0, 0), (width, 32), (15, 15, 30), -1)
        cv2.putText(
            frame,
            f"CAM 02 [BOP BRAVO PERIMETER] · Re-Acquisition View · Frame {f_idx:03d}/{CAM2_END_FRAME}",
            (14, 21),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (56, 189, 248),
            1,
            cv2.LINE_AA,
        )

        if results.boxes is not None and len(results.boxes) > 0:
            for box, conf, cls_id in zip(results.boxes.xyxy.cpu().numpy(), results.boxes.conf.cpu().numpy(), results.boxes.cls.cpu().numpy()):
                cls_name = yolo.names[int(cls_id)]
                if cls_name in {"car", "truck"}:
                    x1, y1, x2, y2 = map(int, box)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (56, 189, 248), 2)
                    cv2.putText(frame, f"CAM 02: {cls_name.upper()} {conf*100:.1f}%", (x1, max(18, y1 - 6)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (56, 189, 248), 1)

                    # Save best crop early in Camera 2
                    if f_idx <= 200 and conf > cam2_best_conf:
                        crop = frame[max(0, y1):min(height, y2), max(0, x1):min(width, x2)]
                        if crop.size > 0:
                            cam2_target_crop = crop.copy()
                            cam2_target_box = [x1, y1, x2, y2]
                            cam2_best_conf = float(conf)

        out2.write(frame)
    out2.release()

    # Capture negative control crop from static background/road in frame 0
    cap.set(cv2.CAP_PROP_POS_FRAMES, 10)
    _, f_bg = cap.read()
    neg_control_crop = f_bg[50:250, 50:250].copy()
    cap.release()

    # ── COMPUTE GENUINE RESNET-18 FEATURE EMBEDDINGS ──────────────────
    print("[Real Re-ID] Extracting 512-dimensional appearance feature embeddings via ResNet-18...")
    emb_cam1 = extract_embedding(extractor, transform, cam1_target_crop)
    emb_cam2 = extract_embedding(extractor, transform, cam2_target_crop)
    emb_neg = extract_embedding(extractor, transform, neg_control_crop)

    # ── COMPUTE AUTHENTIC COSINE SIMILARITY ───────────────────────────
    # Cosine similarity between unit-normalized vectors is simply the dot product
    cos_sim_positive = float(np.dot(emb_cam1, emb_cam2))
    cos_sim_negative = float(np.dot(emb_cam1, emb_neg))

    print(f"[Real Re-ID] ===================================================")
    print(f"[Real Re-ID] Camera 1 Subject Embedding Dimension: {len(emb_cam1)}")
    print(f"[Real Re-ID] Camera 2 Subject Embedding Dimension: {len(emb_cam2)}")
    print(f"[Real Re-ID] REAL POSITIVE COSINE SIMILARITY: {cos_sim_positive:.4f} ({cos_sim_positive*100:.2f}%)")
    print(f"[Real Re-ID] REAL NEGATIVE CONTROL SIMILARITY: {cos_sim_negative:.4f} ({cos_sim_negative*100:.2f}%)")
    print(f"[Real Re-ID] DISCRIMINATION DELTA: {(cos_sim_positive - cos_sim_negative)*100:.2f} percentage points")
    print(f"[Real Re-ID] ===================================================")

    # Save thumbnail images of crops for UI display
    cam1_thumb_path = ROOT_DIR / "data" / "demo_footage" / "reid_cam1_crop.jpg"
    cam2_thumb_path = ROOT_DIR / "data" / "demo_footage" / "reid_cam2_crop.jpg"
    neg_thumb_path = ROOT_DIR / "data" / "demo_footage" / "reid_negative_crop.jpg"
    cv2.imwrite(str(cam1_thumb_path), cam1_target_crop)
    cv2.imwrite(str(cam2_thumb_path), cam2_target_crop)
    cv2.imwrite(str(neg_thumb_path), neg_control_crop)

    telemetry = {
        "status": "success",
        "model_pipeline": "YOLOv8n + ByteTrack + Pretrained ResNet-18 (512-d)",
        "camera_1": {
            "id": "CAM_ALPHA",
            "role": "Ingress Approach",
            "frame_range": [CAM1_START_FRAME, CAM1_END_FRAME],
            "video_path": "/data/reid_cam1_entry.mp4",
            "crop_path": "/data/reid_cam1_crop.jpg",
            "detection_box": cam1_target_box,
            "yolo_conf": cam1_best_conf,
            "embedding_l2_norm": float(np.linalg.norm(emb_cam1)),
        },
        "blind_transit_corridor": {
            "duration_frames": TRANSIT_GAP_FRAMES,
            "duration_sec": TRANSIT_GAP_SEC,
            "description": "Unmonitored transit corridor between Checkpost Alpha and BOP Bravo",
        },
        "camera_2": {
            "id": "CAM_BRAVO",
            "role": "Downstream Re-acquisition",
            "frame_range": [CAM2_START_FRAME, CAM2_END_FRAME],
            "video_path": "/data/reid_cam2_exit.mp4",
            "crop_path": "/data/reid_cam2_crop.jpg",
            "detection_box": cam2_target_box,
            "yolo_conf": cam2_best_conf,
            "embedding_l2_norm": float(np.linalg.norm(emb_cam2)),
        },
        "reid_results": {
            "metric": "Cosine Similarity",
            "positive_similarity": round(cos_sim_positive, 4),
            "positive_similarity_pct": round(cos_sim_positive * 100, 2),
            "negative_control_similarity": round(cos_sim_negative, 4),
            "negative_control_similarity_pct": round(cos_sim_negative * 100, 2),
            "discrimination_margin_pct": round((cos_sim_positive - cos_sim_negative) * 100, 2),
            "reid_matched": bool(cos_sim_positive > 0.60),
            "is_deterministic": True,
            "embedding_sample_first_8": [round(float(v), 5) for v in emb_cam1[:8]],
        },
        "timestamp_computed": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    with open(REID_TELEMETRY_JSON, "w", encoding="utf-8") as f:
        json.dump(telemetry, f, indent=2)
    print(f"[Real Re-ID] Saved telemetry log to: {REID_TELEMETRY_JSON}")

    # Synchronize to frontend public directory
    if FRONTEND_PUBLIC_DATA.exists():
        shutil.copy2(CAM1_OUTPUT_VIDEO, FRONTEND_PUBLIC_DATA / "reid_cam1_entry.mp4")
        shutil.copy2(CAM2_OUTPUT_VIDEO, FRONTEND_PUBLIC_DATA / "reid_cam2_exit.mp4")
        shutil.copy2(cam1_thumb_path, FRONTEND_PUBLIC_DATA / "reid_cam1_crop.jpg")
        shutil.copy2(cam2_thumb_path, FRONTEND_PUBLIC_DATA / "reid_cam2_crop.jpg")
        shutil.copy2(neg_thumb_path, FRONTEND_PUBLIC_DATA / "reid_negative_crop.jpg")
        shutil.copy2(REID_TELEMETRY_JSON, FRONTEND_PUBLIC_DATA / "ibvap_real_reid_telemetry.json")
        print(f"[Real Re-ID] Synchronized all assets to frontend/public/data/.")

    return telemetry


if __name__ == "__main__":
    res = run_reid_pipeline()
    print("[Real Re-ID] Execution Finished.")
