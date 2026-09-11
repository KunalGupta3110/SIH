/* ═══════════════════════════════════════════════════════════════════════
   clientLowLight — real frame-brightness detection + enhancement, the
   browser-side counterpart to core/vision/low_light.py. Canvas has no
   built-in CLAHE, so this approximates it with a global luminance
   stretch + gamma lift — real pixel processing, just not tiled/adaptive
   like the Python version's per-region CLAHE.
   ═══════════════════════════════════════════════════════════════════════ */

export const DARK_MEAN_THRESHOLD = 70;

export function frameBrightness(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  let count = 0;
  const stride = 4 * 6; // sample every 6th pixel — brightness doesn't need every pixel
  for (let i = 0; i < data.length; i += stride) {
    sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count++;
  }
  return count ? sum / count : 255;
}

export function isLowLight(ctx, w, h) {
  return frameBrightness(ctx, w, h) < DARK_MEAN_THRESHOLD;
}

/**
 * Builds a 256-entry lookup table for the luminance-stretch + gamma lift,
 * from a sampled min/max — the expensive part (Math.pow) happens 256 times
 * here, not once per pixel. Call this once per detection pass (a few times
 * a second) and reuse the result via applyLUT() on every render frame
 * (60fps) — recomputing Math.pow per-pixel-per-channel at 60fps was real,
 * measurable main-thread cost causing visible stutter.
 */
export function computeEnhanceLUT(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let min = 255;
  let max = 0;
  const stride = 4 * 4;
  for (let i = 0; i < data.length; i += stride) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = Math.max(1, max - min);
  const invGamma = 1 / 1.6;

  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const stretched = Math.max(0, (v - min) / range);
    lut[v] = Math.pow(stretched, invGamma) * 255;
  }
  return lut;
}

/** Applies a precomputed LUT (see computeEnhanceLUT) in place — cheap
 * enough to run every render frame. */
export function applyLUT(ctx, w, h, lut) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }
  ctx.putImageData(imgData, 0, 0);
}

/** One-shot convenience (computes + applies) for a single frame — not
 * used on the 60fps render path, see computeEnhanceLUT/applyLUT for that. */
export function enhanceLowLight(ctx, w, h) {
  applyLUT(ctx, w, h, computeEnhanceLUT(ctx, w, h));
}
