# Agent context

Docs for LLM/code agents. Read `start-here.md` first, then only what the task requires.

## Doc rules (keep tokens low)

| Rule                               | Where detail lives                                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **One canonical home** per concept | [`nomenclature.md`](./nomenclature.md) for pipe/stage/param terms; feature `*.md` for behaviour and file map                                            |
| **Link, don’t repeat**             | Feature docs point to nomenclature/architecture; avoid copying tables or long rationale                                                                 |
| **Audit = backlog**                | [`codebase-cleanup-audit.md`](./codebase-cleanup-audit.md) — short phases; old essays in [`codebase-cleanup-history.md`](./codebase-cleanup-history.md) |
| **Terse phases**                   | New cleanup phases: bullets + file paths; skip test-count per phase (update baseline once at top)                                                       |
| **Stale history**                  | Delete or one-line “superseded by X” instead of keeping two explanations                                                                                |

| File                                   | When to read                                                                                                   |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **start-here**                         | Always — orientation, tech stack, task→file map                                                                |
| **architecture**                       | Overall structure, data flow, component layout                                                                 |
| **feature-agent-logic-verification**   | Agent MCP/host design: deterministic runs, pose-safe patches, platform probes + watch, headless + browser      |
| **feature-agent-authoring-setup**      | Dev setup: on-disk project bundles, MCP/Cursor config, headless vs browser attach workflows                    |
| **improve-car-player-copy**            | Living status for Player Car copy self-driving (`/improve-car` skill); hunt_repair2 + MCP workflow             |
| **feature-coding-custom-transformers** | Custom transformer authoring: Workspace Transformers tab, named customs, `api`, Monaco intellisense, migration |
| **feature-transformers**               | Entity movement, input, physics behavior, force accumulation, input/car2 paradigms, registry architecture      |
| **feature-scripting**                  | Script editor, game API, event hooks, examples, roadmap                                                        |
| **feature-world-update-reload**        | World update path, rebuild key, incremental vs rebuild, minimal-rebuild strategy                               |
| **feature-inspector**                  | Property panel, multiselect, gizmo, undo, live poses, picking                                                  |
| **feature-groups**                     | Explorer groups (Phase A) — data model, helpers, UI, persistence                                               |
| **feature-rigging-roadmap**            | Rigging concept & roadmap (Phase B) — Rapier joints, UI, story mapping                                         |
| **feature-texture-compositor**         | Texture Maker, paint, layers, undo                                                                             |
| **feature-video-texture**              | Video map assets: ffmpeg.wasm transcode, inspector picker, Three.js VideoTexture                               |
| **feature-lod**                        | Multi-resolution LOD planning (separate project from distance culling)                                         |
| **direction-rotation-coordinates**     | Rotation format (Euler [x,y,z] radians), caveats, detecting orientation                                        |
| **project-status**                     | What is built vs. what remains                                                                                 |
| **example-worlds**                     | Example JSON configs and world structure                                                                       |
| **performance-work**                   | Performance backlog (ordered work items, profiling notes)                                                      |
| **codebase-cleanup-audit**             | Cleanup backlog + short phase log                                                                              |
| **codebase-cleanup-history**           | Archive of verbose cleanup phases (read only if you need old detail)                                           |
| **nomenclature**                       | Canonical names for all transformer/pipe concepts (stages, bindings, param scopes, merge rules)                |
