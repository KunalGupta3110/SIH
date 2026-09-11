/* ═══════════════════════════════════════════════════════════════════════
   clientZones — operator-drawn no-go rectangle + wrong-direction crossing,
   the browser-side counterpart to core/rules/zones.py + alerts/zones.py's
   compute_crossing_direction. Coordinates are normalized (0-1) so the zone
   survives a resize/aspect change of the underlying video.
   ═══════════════════════════════════════════════════════════════════════ */

// A near-full-frame default so a breach fires reliably without the
// operator having to draw one first — same reasoning as
// multi_stream_engine.py's _full_frame_zone() for demo footage.
export const DEFAULT_ZONE = { x1: 0.04, y1: 0.04, x2: 0.96, y2: 0.96 };

export function centroidInZone(centroid, zone, w, h) {
  const [cx, cy] = centroid;
  return cx >= zone.x1 * w && cx <= zone.x2 * w && cy >= zone.y1 * h && cy <= zone.y2 * h;
}

/**
 * Direction relative to the zone's horizontal midline: crossing it moving
 * downward is INBOUND, upward is OUTBOUND — a simplified line form of the
 * backend's cross-product tripwire direction check.
 */
export function crossingDirection(track, zone, h) {
  if (track.history.length < 2) return null;
  const midY = ((zone.y1 + zone.y2) / 2) * h;
  const prevY = track.history[track.history.length - 2][1];
  const currY = track.centroid[1];
  if (prevY > midY && currY <= midY) return "INBOUND";
  if (prevY < midY && currY >= midY) return "OUTBOUND";
  return null;
}
