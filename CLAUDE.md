# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Communication

All communication with the user must be in Russian. Code and comments in English.

## Commands

```bash
npm run dev      # Start Vite dev server (HMR)
npm run build    # Production build to dist/
npm run preview  # Preview production build
```

No tests or linter configured.

## Architecture

Single-file WebGL app (`src/main.js`) rendering a generative art grid using Three.js.

**Rendering pipeline:** `THREE.InstancedMesh` with a custom `ShaderMaterial` (vertex + fragment GLSL shaders inline in main.js). All visual logic lives in shaders — no per-frame JS manipulation of instances.

**Key constraints:**
- NO individual `THREE.Mesh` objects — everything via instancing (single draw call)
- NO `Raycaster` — mouse interaction is pure shader (uniform `uMouse` + distance calc in GLSL)
- `OrthographicCamera` for flat 2D look — NOT perspective
- Pixel ratio capped at 2 (`Math.min(devicePixelRatio, 2)`) for mobile perf
- Target: 60 FPS on mobile with 10k+ instances

**Per-instance data** (via `InstancedBufferAttribute`):
- `aPattern` — shape type (0-7): square, circle, cross, diamond, ring, circle-in-square, stripes, dot grid
- `aScale` — size variation per cell

**Input system (unified `inputMode`):**
- Modes 0-2: SDF-based grid masks (Rectangle, Star, Cross) via `uGridShape` uniform
- Modes 3-5: Media-based masks (Image, Video, Webcam) via `uMediaTex` texture + threshold/contrast/brightness/softness/invert controls
- Cross uses `uCrossArm` (vec3: thickness, barWidth, barPos) for Latin cross shape
- Star uses `uStarParams` (vec2: points, innerRatio) for star polygon
- Media sources share `disposeMedia()` → `setMediaTexture()` lifecycle; webcam uses `THREE.VideoTexture`

**Edge fade:** Dual-mode via `uContentSize` vs `uViewport`. Small grids fade at own edges, large grids at viewport. Uses `mix()` with `uBgColor` (not multiply-to-black). Double smoothstep for extra-smooth falloff.

**Infinite scroll:** Diagonal drift via `uTime` in vertex shader with `mod()` wrapping. Extra padding rows/cols beyond viewport for seamless edges.

**Time accumulation:** Uses `THREE.Timer` (not deprecated `Clock`). Delta-based: `accumulatedTime += timer.getDelta() * animSpeed` — prevents jumps when changing speed slider. Supports negative speed for reverse animation.

**GUI:** lil-gui with folders: Input (mode + sub-settings), Grid, Mouse Interaction (with enable toggle), Style. Sub-folders (Cross, Star, Media Settings) show/hide dynamically based on active input mode.
