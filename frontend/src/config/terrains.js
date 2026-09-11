/* ═══════════════════════════════════════════════════════════════════════
   Multi-terrain sector definitions for the 3D Border Terrain view
   (gis/BorderTerrainModal). Each sector swaps the terrain GLB, the scene
   atmosphere (background / fog / light tint) and its CCTV roster.

   Optimised GLBs live in /public/models/terrains/ — webp textures,
   meshopt-compressed geometry, no Draco (see models/README.md).

   Camera `pos` is a [x, z] diorama coordinate in the shared 58-unit
   footprint; the surface height (y) is raycast onto the live terrain
   mesh at runtime, so the same layout drops onto any terrain.
   ═══════════════════════════════════════════════════════════════════════ */

export const TERRAIN_SECTORS = [
  {
    id: "alpine-ridge",
    name: "Alpine Ridge Frontier",
    sectorCode: "Sector 4-B",
    agency: "SSB Alpine Frontier",
    subTitle: "Forested alpine ridge · IB corridor",
    model: "/models/terrain_map.glb",
    yExag: 2.4,
    bg: "#0b131c",
    fog: "#0b131c",
    ambient: "#dbe8f2",
    sun: "#fff3e0",
    cameras: [
      { id: "CAM_ALPHA", name: "CAM_ALPHA", status: "STALE", pos: [-9, -4], sector: "North pass · ingress", lat: "32.0412°N", lon: "75.3980°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_BRAVO", name: "CAM_BRAVO", status: "ALERT", pos: [1, 2], sector: "Restricted saddle", lat: "32.1021°N", lon: "75.2841°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_CHARLIE", name: "CAM_CHARLIE", status: "STALE", pos: [8, -3], sector: "East ridge overwatch", lat: "32.0930°N", lon: "75.1502°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_DELTA", name: "CAM_DELTA", status: "STALE", pos: [-4, 6], sector: "Valley approach", lat: "32.0088°N", lon: "75.4410°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_ECHO", name: "CAM_ECHO", status: "ONLINE", pos: [6, 8], sector: "South corridor", lat: "31.9721°N", lon: "75.0980°E", feed: "/data/loc_board_firing.mp4" },
    ],
  },
  {
    id: "desert-border",
    name: "Thar Desert Frontier",
    sectorCode: "Sector 8-A",
    agency: "BSF Western Command",
    subTitle: "Open desert · Rann margin",
    model: "/models/terrains/desert.glb",
    yExag: 2.0,
    bg: "#140d06",
    fog: "#1a1208",
    ambient: "#fde8b0",
    sun: "#ffd27a",
    cameras: [
      { id: "CAM_THAR_01", name: "CAM_THAR_01", status: "ONLINE", pos: [-8, -4], sector: "Dune line north", lat: "26.9124°N", lon: "70.1102°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_THAR_02", name: "CAM_THAR_02", status: "ALERT", pos: [1, 0], sector: "Track junction", lat: "26.8990°N", lon: "70.0841°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_THAR_03", name: "CAM_THAR_03", status: "ONLINE", pos: [7, 3], sector: "Border pillar 142", lat: "26.8802°N", lon: "70.0502°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_THAR_04", name: "CAM_THAR_04", status: "STALE", pos: [-3, 6], sector: "Grazing flats", lat: "26.8721°N", lon: "70.1180°E", feed: "/data/loc_board_firing.mp4" },
    ],
  },
  {
    id: "river-bridge",
    name: "River Bridge Crossing",
    sectorCode: "Sector 2-C",
    agency: "SSB River Patrol",
    subTitle: "Multi-arch road bridge · river crossing",
    model: "/models/terrains/riverine.glb",
    yExag: 1.0,
    bg: "#0b1612",
    fog: "#0b1612",
    ambient: "#bfe8d2",
    sun: "#eafff2",
    // UAV-01 patrols strictly along the bridge deck centreline (road runs on
    // X, deck is narrow on Z) — never off the span.
    dronePath: [
      [-10, 8, 0], [-5, 8, 0.35], [0, 8, -0.25], [5, 8, 0.3], [10, 8, -0.15],
    ],
    cameras: [
      { id: "CAM_RIVER_01", name: "CAM_RIVER_01", status: "ONLINE", pos: [-11, 0.3], sector: "West span approach", lat: "26.3421°N", lon: "89.9910°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_RIVER_02", name: "CAM_RIVER_02", status: "ALERT", pos: [-4, -0.3], sector: "Mid-span deck", lat: "26.3390°N", lon: "90.0142°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_RIVER_03", name: "CAM_RIVER_03", status: "ONLINE", pos: [4, 0.4], sector: "Centre pier", lat: "26.3305°N", lon: "90.0301°E", feed: "/data/loc_board_firing.mp4" },
      { id: "CAM_RIVER_04", name: "CAM_RIVER_04", status: "ONLINE", pos: [10, -0.2], sector: "East span exit", lat: "26.3255°N", lon: "90.0210°E", feed: "/data/loc_board_firing.mp4" },
    ],
  },
];


export const DEFAULT_SECTOR_ID = TERRAIN_SECTORS[0].id;

export const getSector = (id) =>
  TERRAIN_SECTORS.find((s) => s.id === id) || TERRAIN_SECTORS[0];
