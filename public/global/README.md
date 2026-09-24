# Global transformers and pipes (cross-browser)

Disk copies of shared **custom transformer code** and **pipe manifests** used by headless tests, example worlds, and `hunt_repair2` sync.

## Layout

| Path | Purpose |
|------|---------|
| [`transformers/self-driving-car/`](transformers/self-driving-car/) | Umlenker, direction, auto-brake, target-line visualizer (`.js` source) |
| [`pipes/self-driving-car-pipe3.json`](pipes/self-driving-car-pipe3.json) | Pipe3 stage order + stage-id bindings per consumer |

## Workflow

1. Edit authoring copies under `tools/renn-mcp/patches/` (or edit files here directly).
2. Run **`npm run sync:global-pipeline`** — copies patch JS into `transformers/`, refreshes manifest, syncs `hunt_repair2`, re-exports self-drive example worlds.
3. On any browser/port: **File → Example Worlds** → `self_drive_*` or `hunt_repair2` (loads embedded registry from exported `world.json`).

IndexedDB projects are per-browser; **example worlds on disk** are the portable pipe + scene copies.
