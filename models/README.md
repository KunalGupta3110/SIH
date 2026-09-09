# Source 3D models

Original, uncompressed `.glb` downloads — the **source of truth** for the 3D
assets used across the app. Tracked with **Git LFS** (`models/*.glb`).

The app does **not** load these directly. Web-optimised copies (WebP textures +
meshopt geometry where needed, produced with `@gltf-transform/cli optimize`)
live in [`frontend/public/models/`](../frontend/public/models) and are what the
Vite build ships.

All optimised copies: **WebP textures ≤ 2048 px, never Draco** — geometry is
left raw or **meshopt**-compressed (drei bundles the meshopt decoder, so there
is no external CDN dependency and no mobile-GPU decode cost).

| Source file | ~size | Optimised as | Used by |
|---|---|---|---|
| `earth.glb` | 22 MB (8192px JPEG → ~400 MB VRAM) | `earth.glb` (~0.9 MB, 1024px → ~8 MB VRAM) | `SentinelGlobe3D` — landing hero globe |
| `glacier_national_park_montana_usa_-_3d_map.glb` | 33 MB | `terrain_map.glb` (~1.2 MB) | `gis/BorderTerrainModal` / `BorderTerrainPanel` — sector terrain |
| `drone.glb` | 9.7 MB | `drone.glb` (~1.8 MB) | `PatrolDrone` — UAV-01 |
| `security_camera.glb` | 41 MB | `cctv_camera.glb` (~3.1 MB) | CCTV node model |
| `3d_human_body_wireframe_model.glb` | 6.4 MB | `suspect_biometric.glb` (~0.9 MB) | `gis/TargetBiometricInspector` — Re-ID hologram |
| `bunker_v_b87c.glb` | 125 MB | — (feature removed) | not currently used |

### Multi-terrain sectors — `models/terrains/` → `frontend/public/models/terrains/`

Switchable border sectors in the 3D terrain view (`src/config/terrains.js`).
These sources are **geometry-heavy**, so they use **meshopt** compression
(bundled decoder — no external dependency, unlike Draco) plus mesh
simplification.

| Source file | ~size | Optimised as | Sector |
|---|---|---|---|
| `death_valley_-_terrain.glb` | 71 MB | `terrains/desert.glb` (~2 MB) | Sector 8-A · Thar Desert Frontier |
| `old_bridge_and_riverbank.glb` | 81 MB | `terrains/riverine.glb` (~3.4 MB) | Sector 2-C · River Bridge Crossing |

## Re-optimising

```bash
# small textures, no geometry compression (models with light meshes)
npx @gltf-transform/cli@4 optimize models/<source>.glb \
  frontend/public/models/<name>.glb \
  --compress false --texture-compress webp --texture-size 2048

# geometry-heavy terrains: meshopt + simplify
npx @gltf-transform/cli@4 optimize models/terrains/<source>.glb \
  frontend/public/models/terrains/<name>.glb \
  --compress meshopt --texture-compress webp --texture-size 2048 \
  --simplify-error 0.01
```
