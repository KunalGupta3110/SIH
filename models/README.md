# Source 3D models

Original, uncompressed `.glb` downloads — the **source of truth** for the 3D
assets used across the app. Tracked with **Git LFS** (`models/*.glb`).

The app does **not** load these directly. Web-optimised copies (Draco geometry
compression + WebP textures, produced with `@gltf-transform/cli optimize`) live
in [`frontend/public/models/`](../frontend/public/models) and are what the
Vite build ships.

| Source file | ~size | Optimised as | Used by |
|---|---|---|---|
| `earth.glb` | 22 MB | `frontend/public/models/earth.glb` (unchanged) | `SentinelGlobe3D` — landing hero globe |
| `glacier_national_park_montana_usa_-_3d_map.glb` | 33 MB | `terrain_map.glb` (~1 MB) | `gis/BorderTerrainModal` / `BorderTerrainPanel` — sector terrain |
| `drone.glb` | 9.7 MB | `drone.glb` (~0.5 MB) | `PatrolDrone` — UAV-01 |
| `security_camera.glb` | 41 MB | `cctv_camera.glb` (~0.9 MB) | CCTV node model |
| `3d_human_body_wireframe_model.glb` | 6.4 MB | `suspect_biometric.glb` (~0.3 MB) | `gis/TargetBiometricInspector` — Re-ID hologram |
| `bunker_v_b87c.glb` | 125 MB | — (feature removed) | not currently used |

## Re-optimising

```bash
npx @gltf-transform/cli@4 optimize models/<source>.glb \
  frontend/public/models/<name>.glb \
  --compress draco --texture-compress webp --texture-size 1024
```
