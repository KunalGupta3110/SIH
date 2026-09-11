import * as faceapi from "face-api.js";

/* ═══════════════════════════════════════════════════════════════════════
   clientFace — real face detection + recognition entirely in the browser
   (face-api.js / TensorFlow.js), the browser counterpart to
   core/vision/face_recognition.py. Uses an actual dedicated face-
   recognition network (128-d descriptor) rather than the backend's
   whole-crop-embedding fallback, so matching is genuinely more accurate
   here than server-side.

   Gallery lives in localStorage (no backend DB available) — enroll via
   enrollFace() from a live video frame, which detects the current face
   and stores its descriptor.
   ═══════════════════════════════════════════════════════════════════════ */

const MODEL_URL = "/models/face-api";
const GALLERY_KEY = "ibvap_client_face_gallery";
// face-api.js matches on Euclidean distance between 128-d descriptors —
// lower is more similar (unlike the backend's cosine-similarity, higher-is-
// better convention).
const MATCH_DISTANCE_THRESHOLD = 0.55;

let _modelsLoadedPromise = null;
export function loadFaceModels() {
  if (!_modelsLoadedPromise) {
    _modelsLoadedPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }
  return _modelsLoadedPromise;
}

export function getGallery() {
  try {
    const raw = localStorage.getItem(GALLERY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveGallery(gallery) {
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  } catch {
    /* noop */
  }
}

export function removeFromGallery(personId) {
  saveGallery(getGallery().filter((g) => g.personId !== personId));
}

/** Runs detection + 68-point landmarks + the 128-d recognition descriptor
 * on one video frame. Returns null if no face was found. */
export async function detectAndDescribe(videoEl) {
  await loadFaceModels();
  const detection = await faceapi
    .detectSingleFace(videoEl, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 }))
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection || null;
}

/** Detects the face currently in front of the camera and adds it to the
 * gallery under personId/name/role ("authorized" | "watchlist"). */
export async function enrollFace(videoEl, personId, name, role) {
  const detection = await detectAndDescribe(videoEl);
  if (!detection) return null;
  const entry = { personId, name, role, descriptor: Array.from(detection.descriptor), enrolledAt: new Date().toISOString() };
  const gallery = getGallery().filter((g) => g.personId !== personId);
  gallery.push(entry);
  saveGallery(gallery);
  return entry;
}

export function matchDescriptor(descriptor) {
  const gallery = getGallery();
  if (!gallery.length) return null;

  let best = null;
  let bestDistance = Infinity;
  for (const person of gallery) {
    const distance = faceapi.euclideanDistance(descriptor, person.descriptor);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = person;
    }
  }
  if (best && bestDistance <= MATCH_DISTANCE_THRESHOLD) {
    return { personId: best.personId, name: best.name, role: best.role, distance: Math.round(bestDistance * 1000) / 1000 };
  }
  return null;
}
