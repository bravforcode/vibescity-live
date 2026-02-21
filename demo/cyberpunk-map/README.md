# VibeCity Cyberpunk Map

17 togglable cyberpunk effects for Mapbox GL JS (v2/v3 compatible).

## Setup

```bash
# Serve this directory
npx serve .
# or
python -m http.server 8080
```

Open with your Mapbox token:
```
http://localhost:3000?token=pk.YOUR_TOKEN
```
Token is saved to `localStorage` after first entry.

## Effects (17)

| # | Effect | Group | Heavy |
|---|--------|-------|-------|
| 1 | Neon Street Glow | Atmosphere | |
| 2 | Atmospheric Fog | Atmosphere | |
| 3 | Dynamic Sky | Atmosphere | |
| 4 | Volumetric Spotlights | Atmosphere | Yes |
| 5 | Gradient Buildings | Atmosphere | |
| 6 | Custom 3D Models | 3D & Models | Yes |
| 7 | Video Billboards | 3D & Models | Yes |
| 8 | 3D Terrain | 3D & Models | |
| 9 | Reflective Water | 3D & Models | |
| 10 | Pulsing Dots | Animation | |
| 11 | Route Flow | Animation | |
| 12 | Cluster Pop | Animation | |
| 13 | Cinematic Fly-To | Animation | |
| 14 | Auto-Rotate (Idle) | Animation | |
| 15 | Hover Glow | Interaction | |
| 16 | Walk Radius | Interaction | |
| 17 | Sound Reactive | Interaction | Yes |

**Heavy** effects are disabled by default on low-tier devices.

## Device Tiers

Detected automatically from `navigator.hardwareConcurrency` and `navigator.deviceMemory`.

- **Low** (<=2 cores / <=2GB): heavy effects blocked
- **Mid** (<=4 cores / <=4GB): all available
- **High**: all available, full quality

## Assets (optional)

- `assets/models/sample.glb` — glTF model for effect #6
- `assets/video/billboard.mp4` — video for effect #7

Missing assets trigger built-in fallbacks (no crashes).

## Compatibility

- Mapbox GL JS v2.x and v3.x
- Three.js loaded via import map (Chrome 89+, Firefox 108+, Safari 16.4+)
- ES2020+ modules — requires a local HTTP server (no `file://`)
- Day/Night theme switch re-applies all active effects
