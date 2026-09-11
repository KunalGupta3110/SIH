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

/** Mutates the canvas in place: luminance-range stretch + gamma lift. */
export function enhanceLowLight(ctx, w, h) {
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = Math.max(1, max - min);
  const invGamma = 1 / 1.6;

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = (data[i + c] - min) / range;
      v = Math.pow(Math.max(0, v), invGamma);
      data[i + c] = Math.max(0, Math.min(255, v * 255));
    }
  }
  ctx.putImageData(imgData, 0, 0);
}
