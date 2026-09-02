"""
IBVAP - Synthetic Border Test Video Generator
Generates a test MP4 video with moving synthetic shapes/targets to test:
1. Object detection & ByteTrack tracking
2. Virtual tripwire crossing
3. Restricted zone intrusion
4. Loitering trigger (target stops inside red zone)
"""

import os
import cv2
import numpy as np


def generate_synthetic_border_video(output_path: str = "data/sample_border.mp4", duration_sec: int = 10, fps: int = 30):
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    width, height = 1280, 720
    total_frames = duration_sec * fps

    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, float(fps), (width, height))

    print(f"[IBVAP Test Generator] Generating {duration_sec}s test clip at '{output_path}'...")

    # Simulated target trajectory (starts at bottom, moves up across tripwire into restricted zone, stops and loiters)
    start_x, start_y = 400, 650
    end_x, end_y = 550, 200

    for frame_idx in range(total_frames):
        t = frame_idx / total_frames

        # Create realistic dark outdoor border outpost background
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        # Ground texture gradient
        frame[:int(height * 0.45), :] = [40, 35, 30]  # Dark night sky / distant hills
        frame[int(height * 0.45):, :] = [50, 60, 45]  # Border terrain / grass

        # Distant guard post silhouette
        cv2.rectangle(frame, (100, 220), (220, 320), (25, 25, 25), -1)
        cv2.rectangle(frame, (140, 180), (180, 220), (20, 20, 20), -1)
        # Sentry light pole
        cv2.line(frame, (160, 180), (160, 140), (120, 120, 120), 3)
        cv2.circle(frame, (160, 140), 12, (200, 240, 255), -1)

        # Target position calculation
        # Phase 1 (0 -> 0.4): Walks from bottom toward center
        # Phase 2 (0.4 -> 0.7): Enters top restricted zone
        # Phase 3 (0.7 -> 1.0): Stops and loiters in restricted zone
        if t < 0.7:
            curr_x = int(start_x + (end_x - start_x) * (t / 0.7))
            curr_y = int(start_y + (end_y - start_y) * (t / 0.7))
        else:
            # Loitering in place with slight jitter
            curr_x = int(end_x + np.sin(frame_idx * 0.3) * 3)
            curr_y = int(end_y + np.cos(frame_idx * 0.3) * 2)

        # Draw a humanoid silhouette representation
        # Head
        cv2.circle(frame, (curr_x, curr_y - 45), 12, (180, 180, 180), -1)
        # Torso
        cv2.rectangle(frame, (curr_x - 14, curr_y - 33), (curr_x + 14, curr_y + 10), (160, 140, 120), -1)
        # Legs
        leg_offset = int(np.sin(frame_idx * 0.5) * 8) if t < 0.7 else 0
        cv2.line(frame, (curr_x - 8, curr_y + 10), (curr_x - 12 + leg_offset, curr_y + 45), (100, 90, 80), 6)
        cv2.line(frame, (curr_x + 8, curr_y + 10), (curr_x + 12 - leg_offset, curr_y + 45), (100, 90, 80), 6)

        # Frame timestamp overlay
        cv2.putText(frame, f"CAM-01 BOP-ALPHA | TIME: {frame_idx/fps:.2f}s", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1, cv2.LINE_AA)

        writer.write(frame)

    writer.release()
    print(f"[IBVAP Test Generator] Created test video at {output_path} ({total_frames} frames).")


if __name__ == "__main__":
    generate_synthetic_border_video()
