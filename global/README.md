# Global transformers and pipes (cross-browser)

Disk copies of shared **custom transformer code** and **pipe manifests** used by headless tests, example worlds, and `hunt_repair2` sync.

**Coordinates:** all `Vec3` values in world JSON and wanderer `perimeter` are **`[x, y, z]` with Y up**. Floor surface is **`y = 0`** (ground box center `y = -0.5`). Wanderer targets and mission waypoints use **`y = 0`** on the floor plane; entity **`position.y`** may be ~0.55 (box center above floor). Open-world wanderers roam on **XZ** (`halfExtents` `[wide, 0, wide]`, `halfExtents[1] = 0`).

## Layout

| Path | Purpose |
|------|---------|
| [`transformers/self-driving-car/`](transformers/self-driving-car/) | Umlenker, direction, auto-brake, target-line visualizer (`.js` source) |
| [`transformers/av-stack/`](transformers/av-stack/) | Industry-style AV stack stages (ego, perception, planners, control, AEB) — see [`agent-context/feature-av-stack.md`](../../agent-context/feature-av-stack.md) |
| [`pipes/self-driving-car-pipe3.json`](pipes/self-driving-car-pipe3.json) | Pipe3 stage order + stage-id bindings per consumer |
| [`shipped-global-behavior-library.json`](shipped-global-behavior-library.json) | **Organize → Global** defaults (pipes + transformers); merged on Builder open |

## Workflow

1. Edit authoring copies under `tools/renn-mcp/patches/` (or edit files here directly).
2. Run **`npm run sync:global-pipeline`** — copies patch JS into `transformers/`, refreshes manifest, syncs `hunt_repair2`, re-exports self-drive example worlds.
3. On any browser/port: **File → Example Worlds** → `self_drive_*` or `hunt_repair2` (loads embedded registry from exported `world.json`).

IndexedDB projects are per-browser; **example worlds on disk** are the portable pipe + scene copies.
