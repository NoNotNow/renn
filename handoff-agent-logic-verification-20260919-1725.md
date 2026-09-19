# Handoff — agent logic verification → authoring setup

**Written:** 2026-09-19 (L1 coordinator; prior path missing — recreated at session start)

## Baseline

- `npx vitest run` → **233** files, **2038** passed, **3** skipped
- `npx tsc --noEmit -p tsconfig.app.json` → **clean**

## Goal (session)

Enable agent **load/save projects**, **entities**, **pipeline code**, **test + reason in-game**. **This run:** create the **setup** (bundles, loader, MCP tool, docs, smoke)—not full entity patch MCP yet.

## Grill defaults (accepted)

- Filesystem **agent project bundles**, not IndexedDB, for headless/MCP
- Headless default; **browser attach** for in-game reasoning
- Transformer patches now; **entity/scene** patches next slice
- Save-to-disk export tool deferred; document contract in setup doc

## Done (L1)

- CONTEXT glossary: agent project bundle, authoring loop, in-game verification
- ADR `docs/adr/0002-agent-project-bundle-on-disk.md`
- `agent-context/feature-agent-authoring-setup.md` + index links
- This handoff file

## L2 complete (34421e30-e112-47ac-87de-6f74bfc786c8)

Verified L1: 235 files / 2043 passed / 3 skipped; tsc clean; `agent:setup-check` ok.

Delivered: loader, `agent-starter`, MCP `load_project_bundle`, tests, npm scripts. Browser RPC not extended (load tools were never mirrored on attach).

## Next queue (future run)

1. `apply_world_patch` entity add/remove
2. `export_project_bundle` / save patched world to disk
3. Pass loaded bundle `assets` into headless host when bundles include meshes

## Guardrails

- Do not enable MCP in production builds
- Keep pose-safe apply semantics; no arbitrary eval
- Do not commit unless user asks

## LEFTOVER

- `apply_world_patch` entity add/remove
- `export_project_bundle` / save patched world to disk
- Browser-side import of bundle from agent (human workflow only today)

## RISK

- Node filesystem loader must stay Vitest/Node-only (no accidental browser bundle bloat)
- Bundle ids must be allowlisted under `src/agent/projects/` to avoid path traversal
