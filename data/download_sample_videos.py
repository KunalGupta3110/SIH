"""
IBVAP - Sample Surveillance Video Downloader & Test Runner
Fetches standard public surveillance and pedestrian CCTV sample clips
from open repositories (OpenCV / Intel IoT DevKit / MOT) for pipeline validation.
"""

import os
from pathlib import Path
import sys
import urllib.request

# Ensure project root in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

SAMPLE_VIDEOS = {
    "data/vtest_pedestrians.avi": "https://raw.githubusercontent.com/opencv/opencv/master/samples/data/vtest.avi",
    "data/people_surveillance.mp4": "https://github.com/intel-iot-devkit/sample-videos/raw/master/people-detection.mp4",
}


def download_file(url: str, dest_path: str):
    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    if os.path.exists(dest_path) and os.path.getsize(dest_path) > 10000:
        print(f"[Downloader] File already exists: {dest_path} ({os.path.getsize(dest_path)/1024:.1f} KB)")
        return True

    print(f"[Downloader] Downloading {url} -> {dest_path}...")
    headers = {'User-Agent': 'Mozilla/5.0'}
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as response, open(dest_path, 'wb') as out_file:
            data = response.read()
            out_file.write(data)
        print(f"[Downloader] Downloaded successfully: {dest_path} ({os.path.getsize(dest_path)/1024:.1f} KB)")
        return True
    except Exception as e:
        print(f"[Downloader] Download failed for {url}: {e}")
        return False


def fetch_all_samples():
    print("=======================================================")
    print(" [IBVAP] Fetching Sample Surveillance CCTV Feeds")
    print("=======================================================")
    success_count = 0
    for path, url in SAMPLE_VIDEOS.items():
        if download_file(url, path):
            success_count += 1
    print(f"\n[IBVAP] {success_count}/{len(SAMPLE_VIDEOS)} sample videos ready in data/ folder.\n")


if __name__ == "__main__":
    fetch_all_samples()
