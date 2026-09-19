# Agent project bundles on disk (not IndexedDB)

Status: accepted

External agents load and save **Renn project bundles** from the repo filesystem—the same shape as user export (`world.json` plus optional `assets/`), under `src/agent/projects/`—for headless MCP and Vitest. They do not call the browser IndexedDB persistence API in v1.

**Considered:** Drive Builder Save/Load via automation; duplicate world-only fixtures only; teach agents to use in-app import for every run.

**Why not those:** IndexedDB is per-browser and opaque to CI; world-only fixtures skip real project workflows (assets, pipe bindings on entities); UI automation defeats the logic-verification host goal. Headless loads bundles from disk; **browser attach** reuses the human’s open project after they import the same zip or work in Builder. Saving back: headless writes patched `world.json` to a declared path in a later slice; humans Save in Builder when attached.
