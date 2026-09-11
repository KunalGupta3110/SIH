import { createWorker } from "tesseract.js";

/* ═══════════════════════════════════════════════════════════════════════
   clientANPR — real OCR-based plate reading, entirely client-side
   (Tesseract.js, WASM), the browser counterpart to core/vision/anpr.py.
   No dedicated plate-localizer model here (anpr.py's is a downloaded
   YOLOv8 detector) — this reads whatever's in a vehicle track's lower
   half, or the full frame when nothing's tracked as a vehicle yet, so a
   plate (or a printed sign/paper held up to test it) held up to the
   webcam still gets read. Tesseract's worker/core/lang files load from
   jsdelivr's CDN on first use (not self-hosted, unlike the ONNX runtime
   in clientYolo.js) — that's Tesseract.js's standard deployment model.
   ═══════════════════════════════════════════════════════════════════════ */

const INDIAN_PLATE_REGEX = /^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$/;

const DEFAULT_HOTLIST = {
  "DL01AB1234": "Stolen vehicle report",
  "RJ19CB8890": "Flagged Contraband / Suspect Transport",
  "HR26DQ5555": "ANPR Hotlist — Border Watch",
};
let _hotlist = { ...DEFAULT_HOTLIST };

export function checkHotlist(plateText) {
  const norm = (plateText || "").replace(/\s/g, "").toUpperCase();
  if (!norm) return null;
  for (const [plate, reason] of Object.entries(_hotlist)) {
    if (norm === plate.replace(/\s/g, "").toUpperCase()) return reason;
  }
  return null;
}

export function addToHotlist(plateText, reason) {
  _hotlist[plateText.toUpperCase()] = reason;
}

export function removeFromHotlist(plateText) {
  delete _hotlist[plateText.toUpperCase()];
}

export function getHotlist() {
  return { ..._hotlist };
}

function cleanPlateText(raw) {
  return (raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

let _workerPromise = null;
function getWorker() {
  if (!_workerPromise) {
    _workerPromise = createWorker("eng").catch((err) => {
      _workerPromise = null; // let the next call retry rather than staying permanently broken
      throw err;
    });
  }
  return _workerPromise;
}

let _busy = false;

/**
 * OCRs one crop (a canvas/image/blob Tesseract.js accepts) and reports
 * whether the cleaned text looks like an Indian plate + any hotlist hit.
 * Guards against overlapping calls — OCR takes hundreds of ms, far longer
 * than one YOLO detection tick, so callers should only invoke this every
 * second or so and skip the call entirely if one is still in flight.
 */
export async function readPlate(source) {
  if (_busy) return null;
  _busy = true;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(source);
    const cleaned = cleanPlateText(data.text);
    return {
      rawText: (data.text || "").trim(),
      cleanedText: cleaned,
      isPlateFormat: INDIAN_PLATE_REGEX.test(cleaned),
      confidence: data.confidence,
      hotlistHit: checkHotlist(cleaned),
    };
  } catch {
    return null;
  } finally {
    _busy = false;
  }
}

export function isOcrBusy() {
  return _busy;
}
