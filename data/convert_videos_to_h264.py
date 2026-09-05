"""
IBVAP - Video Web Compatibility Converter (H.264 MP4)
Converts OpenCV raw/mp4v/avi videos into browser-playable H.264/AAC MP4 files
so they stream natively in Chrome, Edge, Safari, and Streamlit dashboards.
"""

import os
from pathlib import Path
import subprocess
import sys

try:
    import imageio_ffmpeg
    FFMPEG_EXE = imageio_ffmpeg.get_ffmpeg_exe()
except Exception:
    FFMPEG_EXE = "ffmpeg"


def convert_to_browser_mp4(input_path: str, output_path: str = None) -> bool:
    if not os.path.exists(input_path):
        print(f"[Converter] File not found: {input_path}")
        return False

    if output_path is None:
        p = Path(input_path)
        output_path = str(p.parent / f"{p.stem}_web.mp4")

    print(f"[Converter] Encoding to H.264 Web MP4: {input_path} -> {output_path}...")

    cmd = [
        FFMPEG_EXE,
        "-y",
        "-i", input_path,
        "-vcodec", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", "23",
        "-preset", "fast",
        "-movflags", "+faststart",
        output_path
    ]

    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode == 0 and os.path.exists(output_path):
            print(f"[Converter] Web-ready video created: {output_path} ({os.path.getsize(output_path)/1024:.1f} KB)")
            return True
        else:
            print(f"[Converter] Encoding warning: {res.stderr[-200:]}")
            return False
    except Exception as e:
        print(f"[Converter] Error: {e}")
        return False


def convert_all_data_videos():
    data_dir = Path("data")
    if not data_dir.exists():
        return

    targets = [
        "data/vtest_surveillance_output.mp4",
        "data/cross_cam_real_demo.mp4",
        "data/sample_border.mp4",
        "data/detected_output.mp4",
        "data/cross_cam_reid_demo.mp4",
        "data/people_surveillance.mp4",
        "data/vtest_pedestrians.avi",
    ]

    for t in targets:
        if os.path.exists(t):
            web_target = f"data/{Path(t).stem}_web.mp4"
            convert_to_browser_mp4(t, web_target)


if __name__ == "__main__":
    convert_all_data_videos()
