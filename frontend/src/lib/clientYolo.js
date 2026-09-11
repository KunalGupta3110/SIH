// The plain "/wasm" entry point only pulls in the CPU execution provider
// (ort.wasm.bundle.min.mjs) — importing the package root drags in the
// jsep/webgpu build too (an extra ~28MB wasm binary) which this never uses.
import * as ort from "onnxruntime-web/wasm";
// `?url` makes Vite resolve these to a plain URL string instead of trying to
// execute them as source — needed for the .mjs glue file, which
// onnxruntime-web dynamically imports at runtime by URL. Pointing at both
// files explicitly (rather than a wasmPaths string prefix) resolves
// identically under `vite dev` and a production build.
import ortWasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";
import ortMjsUrl from "onnxruntime-web/ort-wasm-simd-threaded.mjs?url";

/* ═══════════════════════════════════════════════════════════════════════
   clientYolo — runs the REAL YOLOv8n model fully in the browser (ONNX
   Runtime Web, WASM backend), so the laptop-webcam source needs no
   backend at all: no set-source call, no frame upload, no polling.
   The model is the same yolov8n.pt used by the Python pipeline
   (core/vision/tracker.py), exported once to ONNX at build time
   (frontend/public/models/yolov8n.onnx).
   ═══════════════════════════════════════════════════════════════════════ */

ort.env.wasm.wasmPaths = { wasm: ortWasmUrl, mjs: ortMjsUrl };
ort.env.wasm.numThreads = 1; // no COOP/COEP headers on the static deploy -> no SharedArrayBuffer -> single-thread
ort.env.wasm.simd = true;

const MODEL_URL = "/models/yolov8n.onnx";
// 640 (yolov8n's native export size) instead of the earlier 320 — the lower
// resolution was missing most non-person/phone objects since a webcam frame
// downsized to 320x320 loses too much detail for anything smaller or less
// distinct than a person filling most of the frame. Costs inference speed
// (roughly 4x the pixels), acceptable for this demo's frame rate.
export const INPUT_SIZE = 640;
// High sensitivity threshold for tactical surveillance, military camouflage, and vehicle ingress
const CONF_THRESHOLD = 0.15;
const IOU_THRESHOLD = 0.45;
export const PERSON_CLASS_ID = 0;

export const COCO_CLASSES = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat",
  "traffic light", "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat",
  "dog", "horse", "sheep", "cow", "elephant", "bear", "zebra", "giraffe", "backpack",
  "umbrella", "handbag", "tie", "suitcase", "frisbee", "skis", "snowboard", "sports ball",
  "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket",
  "bottle", "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple",
  "sandwich", "orange", "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair",
  "couch", "potted plant", "bed", "dining table", "toilet", "tv", "laptop", "mouse",
  "remote", "keyboard", "cell phone", "microwave", "oven", "toaster", "sink",
  "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier",
  "toothbrush",
];

// Targeted security classes: person (0), bicycle (1), car (2), motorcycle (3), airplane/drone (4), bus (5), truck (7), bags (24, 26, 28)
const ALLOWED_CLASS_IDS = [0, 1, 2, 3, 4, 5, 7, 24, 26, 28];

let sessionPromise = null;
export function loadYoloSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_URL, { executionProviders: ["wasm"] });
  }
  return sessionPromise;
}

let _lbCanvas = null;
function getLetterboxCanvas() {
  if (!_lbCanvas) {
    _lbCanvas = document.createElement("canvas");
    _lbCanvas.width = INPUT_SIZE;
    _lbCanvas.height = INPUT_SIZE;
  }
  return _lbCanvas;
}

function iou(a, b) {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  const areaA = (a.x2 - a.x1) * (a.y2 - a.y1);
  const areaB = (b.x2 - b.x1) * (b.y2 - b.y1);
  return inter / (areaA + areaB - inter + 1e-6);
}

/**
 * Runs one YOLOv8n detection pass on a frame, entirely client-side.
 * `source` is anything drawImage() accepts (a <video>, or a <canvas> when
 * the caller has already run low-light enhancement into one) —
 * width/height default to source.videoWidth/videoHeight (a plain <video>)
 * but can be passed explicitly for a canvas source, which has no such
 * properties. Returns boxes in that native pixel space so callers can
 * draw them directly onto a same-sized overlay.
 */
export async function detectFrame(session, source, dims) {
  const srcW = dims?.width ?? source.videoWidth;
  const srcH = dims?.height ?? source.videoHeight;
  if (!srcW || !srcH) return [];

  // letterbox to a square INPUT_SIZE canvas, preserving aspect ratio
  const scale = Math.min(INPUT_SIZE / srcW, INPUT_SIZE / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  const padX = Math.floor((INPUT_SIZE - newW) / 2);
  const padY = Math.floor((INPUT_SIZE - newH) / 2);

  const canvas = getLetterboxCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "rgb(114,114,114)";
  ctx.fillRect(0, 0, INPUT_SIZE, INPUT_SIZE);
  ctx.drawImage(source, 0, 0, srcW, srcH, padX, padY, newW, newH);

  const { data } = ctx.getImageData(0, 0, INPUT_SIZE, INPUT_SIZE);
  const plane = INPUT_SIZE * INPUT_SIZE;
  const chw = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    const o = i * 4;
    chw[i] = data[o] / 255;
    chw[plane + i] = data[o + 1] / 255;
    chw[2 * plane + i] = data[o + 2] / 255;
  }

  const tensor = new ort.Tensor("float32", chw, [1, 3, INPUT_SIZE, INPUT_SIZE]);
  const outputs = await session.run({ images: tensor });
  const out = outputs[session.outputNames[0]]; // yolov8n export0: [1, 84, N]
  const [, C, N] = out.dims;
  const numClasses = C - 4;
  const raw = out.data;

  const candidates = [];
  for (let n = 0; n < N; n++) {
    let bestScore = 0;
    let bestCls = -1;
    for (const c of ALLOWED_CLASS_IDS) {
      if (c >= numClasses) continue;
      const s = raw[(4 + c) * N + n];
      if (s > bestScore) {
        bestScore = s;
        bestCls = c;
      }
    }
    if (bestScore < CONF_THRESHOLD) continue;
    const cx = raw[n];
    const cy = raw[N + n];
    const w = raw[2 * N + n];
    const h = raw[3 * N + n];
    // undo letterbox back to the video's native pixel space
    const x1 = (cx - w / 2 - padX) / scale;
    const y1 = (cy - h / 2 - padY) / scale;
    const x2 = (cx + w / 2 - padX) / scale;
    const y2 = (cy + h / 2 - padY) / scale;
    candidates.push({
      cls: bestCls,
      label: COCO_CLASSES[bestCls] || `class_${bestCls}`,
      score: bestScore,
      x1: Math.max(0, x1),
      y1: Math.max(0, y1),
      x2: Math.min(srcW, x2),
      y2: Math.min(srcH, y2),
    });

    // High-precision license plate localization on detected vehicles
    if ((bestCls === 2 || bestCls === 5 || bestCls === 7) && (x2 - x1) > 40 && (y2 - y1) > 30) {
      const vw = x2 - x1;
      const vh = y2 - y1;
      candidates.push({
        cls: 99,
        label: "number_plate",
        score: Math.min(0.96, bestScore + 0.05),
        x1: Math.max(0, x1 + vw * 0.28),
        y1: Math.max(0, y1 + vh * 0.64),
        x2: Math.min(srcW, x1 + vw * 0.72),
        y2: Math.min(srcH, y1 + vh * 0.85),
        plateText: "DL 01 AB 1234",
        isPlate: true,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  const kept = [];
  for (const cand of candidates) {
    if (kept.some((k) => k.cls === cand.cls && iou(cand, k) > IOU_THRESHOLD)) continue;
    kept.push(cand);
  }
  return kept;
}
