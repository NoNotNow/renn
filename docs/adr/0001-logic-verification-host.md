# Single logic verification host for headless and browser

Status: accepted

We will implement one **logic verification host** module (load world, pose-safe apply, deterministic step loop, observation session) and wire it in two places: Vitest/CLI/MCP (in-process) and the live Builder tab (WebSocket or equivalent for MCP). Headless runs use the same Rapier + `RenderItemRegistry` + transformer path as integration tests today; browser runs add a visible canvas for humans while the agent reads the same observation timeline.

**Considered:** Browser-only via automation; duplicate headless and browser implementations; dual parallel sims (headless + browser) for every edit.

**Why not those:** Browser-only is slow and blind to preset-only pipes without platform probes; duplicate hosts drift; dual sims need replay machinery we do not need for v1. CI and fast agent loops use headless; interactive sessions use one in-browser sim with dual audience (human + MCP).
