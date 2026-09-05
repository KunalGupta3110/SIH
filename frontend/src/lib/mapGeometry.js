// Shared coordinate geometry for the tactical map.
//
// These percentages are ported directly from the old MapPanel.jsx schematic
// (NODES array: CAM_ALPHA/BRAVO/CHARLIE/DELTA laid out left-to-right along
// one horizontal corridor line, viewBox 860x300, y=150 for every camera).
// Converting x/860 and y/300 to percentages keeps the exact same relative
// layout, just expressed as %-of-viewport instead of %-of-a-boxed-SVG, so
// the full-bleed map still reads as the same sector.
export const CAMERA_POSITIONS = {
  CAM_ALPHA: { x: 14, y: 50 },
  CAM_BRAVO: { x: 40, y: 50 },
  CAM_CHARLIE: { x: 65, y: 50 },
  CAM_DELTA: { x: 86, y: 50 },
};

const FALLBACK_POSITION = { x: 50, y: 50 };

export function positionForCamera(cameraId) {
  return CAMERA_POSITIONS[cameraId] || FALLBACK_POSITION;
}

// A track's marker sits at the midpoint of every camera it's actually been
// seen on (real cameras_involved from the incident, not a guess) — a single
// -camera track sits right at that camera, a cross-camera handoff sits
// between the two, same as the reference mockup's TRK-0017 sitting between
// CAM_ALPHA and CAM_BRAVO.
export function positionForIncident(incident) {
  const cams = incident?.cameras_involved || [];
  const known = cams.map((c) => CAMERA_POSITIONS[c]).filter(Boolean);
  if (known.length === 0) return FALLBACK_POSITION;
  const x = known.reduce((sum, p) => sum + p.x, 0) / known.length;
  const y = known.reduce((sum, p) => sum + p.y, 0) / known.length;
  return { x, y };
}
