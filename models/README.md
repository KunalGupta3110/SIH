# Source 3D models

Original, uncompressed `.glb` downloads — the **source of truth** for the 3D
assets used across the app. Tracked with **Git LFS** (`models/*.glb`).

The app does **not** load these directly. Web-optimised copies (Draco geometry
compression + WebP textures, produced with `@gltf-transform/cli optimize`) live
in [`frontend/public/models/`](../frontend/public/models) and are what the
Vite build ships.

All optimised copies: **WebP textures ≤ 2048 px, no Draco** (so no external
decoder dependency and no decode cost on mobile GPUs).

| Source file | ~size | Optimised as | Used by |
|---|---|---|---|
| `earth.glb` | 22 MB (8192px JPEG → ~400 MB VRAM) | `earth.glb` (~0.9 MB, 1024px → ~8 MB VRAM) | `SentinelGlobe3D` — landing hero globe |
| `glacier_national_park_montana_usa_-_3d_map.glb` | 33 MB | `terrain_map.glb` (~1.2 MB) | `gis/BorderTerrainModal` / `BorderTerrainPanel` — sector terrain |
| `drone.glb` | 9.7 MB | `drone.glb` (~1.8 MB) | `PatrolDrone` — UAV-01 |
| `security_camera.glb` | 41 MB | `cctv_camera.glb` (~3.1 MB) | CCTV node model |
| `3d_human_body_wireframe_model.glb` | 6.4 MB | `suspect_biometric.glb` (~0.9 MB) | `gis/TargetBiometricInspector` — Re-ID hologram |
| `bunker_v_b87c.glb` | 125 MB | — (feature removed) | not currently used |

## Re-optimising

```bash
npx @gltf-transform/cli@4 optimize models/<source>.glb \
  frontend/public/models/<name>.glb \
  --compress false --texture-compress webp --texture-size 2048
```
