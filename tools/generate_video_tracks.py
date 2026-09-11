import json
import os
import sys
import time
import cv2
from ultralytics import YOLO

video_path = "frontend/public/data/indiaarmy_movement.mp4"
output_json_path = "frontend/public/data/indiaarmy_movement_tracks.json"

if not os.path.exists(video_path):
    print(f"Error: {video_path} not found")
    sys.exit(1)

print(f"Loading YOLOv8 model on GPU...")
model = YOLO("yolov8n.pt")

cap = cv2.VideoCapture(video_path)
fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
w = cap.get(cv2.CAP_PROP_FRAME_WIDTH)
h = cap.get(cv2.CAP_PROP_FRAME_HEIGHT)

print(f"Video: {w}x{h} @ {fps:.1f} FPS, {total_frames} frames ({total_frames/fps:.1f}s)")

# Sample at 10 FPS (every 5th frame for 50fps video) to keep JSON small and tracking responsive
sample_step = max(1, int(round(fps / 10.0)))
tracks_data = []

frame_idx = 0
t0 = time.time()

while cap.isOpened():
    ret, frame = cap.read()
    if not ret:
        break

    if frame_idx % sample_step == 0:
        t_sec = round(frame_idx / fps, 2)
        # Run tracking
        results = model.track(frame, persist=True, verbose=False, conf=0.35, classes=[0, 2, 3, 5, 7])[0]
        
        frame_boxes = []
        if results.boxes is not None and len(results.boxes) > 0:
            for box in results.boxes:
                cls_id = int(box.cls[0])
                cls_name = model.names[cls_id]
                conf = round(float(box.conf[0]), 2)
                track_id = int(box.id[0]) if box.id is not None else 1
                
                # xywh normalized [center_x, center_y, width, height]
                xywhn = box.xywhn[0].tolist()
                cx, cy, bw, bh = xywhn
                
                # convert to top-left normalized
                left = round(max(0.0, cx - bw / 2.0), 3)
                top = round(max(0.0, cy - bh / 2.0), 3)
                bw = round(min(1.0 - left, bw), 3)
                bh = round(min(1.0 - top, bh), 3)
                
                # Estimate head/face box (top 28% of person box)
                head_top = top
                head_left = round(left + bw * 0.15, 3)
                head_w = round(bw * 0.70, 3)
                head_h = round(bh * 0.28, 3)
                
                frame_boxes.append({
                    "id": track_id,
                    "cls": cls_name,
                    "conf": conf,
                    "left": left,
                    "top": top,
                    "width": bw,
                    "height": bh,
                    "head": {
                        "left": head_left,
                        "top": head_top,
                        "width": head_w,
                        "height": head_h
                    }
                })
        
        tracks_data.append({
            "t": t_sec,
            "f": frame_idx,
            "boxes": frame_boxes
        })

    frame_idx += 1
    if frame_idx % 250 == 0:
        elapsed = time.time() - t0
        fps_proc = frame_idx / max(1e-3, elapsed)
        print(f"Processed {frame_idx}/{total_frames} frames ({frame_idx/total_frames*100:.1f}%) at {fps_proc:.1f} FPS...")

cap.release()

with open(output_json_path, "w", encoding="utf-8") as f:
    json.dump({
        "fps": fps,
        "sampleRate": 10,
        "totalFrames": total_frames,
        "duration": round(total_frames / fps, 2),
        "timeline": tracks_data
    }, f, separators=(',', ':'))

file_size_kb = os.path.getsize(output_json_path) / 1024
print(f"DONE! Generated {output_json_path} ({file_size_kb:.1f} KB, {len(tracks_data)} sample points) in {time.time()-t0:.1f}s")
