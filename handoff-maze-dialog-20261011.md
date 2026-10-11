# Handoff: Training Mazes dialog rework (live vectors, per-route scores, tile-start) — 2026-10-11

Session 2026-10-11 ~01:20 → ~02:05 local (Mac), on branch `claude/autonomous-car-evolution-9p6zt2` (pushed; based on cb3f78ab, **not merged to main**). Standing rules unchanged (see `handoff-av-20261006.md`): answer Manuel in German, never loosen criteria / oracles / baselines, full suite before deploy, deploy needs Manuel's OK. Nothing was deployed this session. For the training-run context see `agent-context/handoff-maze-training.md` (still accurate).

## What is on the branch (4 commits, all pushed)

| commit | content |
|---|---|
| `87e523f1` | (superseded) prominent selected-tile highlight + "Active · Way i" overlay chip |
| `9e109171` | **main change**: live active-vector overlay, per-route scores, calmer selection (details below) |
| `41f4a8bd` | route thumbnails 6em → 8.4em |
| `560e36b3` | Play button removed; clicking a route tile starts the run |

### Dialog UX after this session (src/components/MazeTrainingDialog.tsx)
- Selected/started tile: 2px `theme.accent` border only — no glow, no tint, no bold (Manuel: previous version was too prominent).
- The "Active · Way i · fwd/rev" overlay chip is gone.
- Thumbnails capped at **8.4em** height.
- Under each thumbnail: that route's own score (`Score: 161 pts`, `Score: —` when null) — from the new `meta.tileSvg.routes[i].score`, NOT the world bestScore.
- **Clicking a tile starts the run** on that way (`onPlayExampleWorld(worldId, i)`, Enter too). No Play button, and no default-route-0 start anymore — tiles render only for expanded + exported rows, so the start action is export-gated implicitly. Selection state = the started way.
- While the run drives in the Builder: the focused route's thumbnail overlays the chain polyline (dim) plus the **currently active guidance vector** as halo (w 6, op 0.35) + core (w 2.5) accent segment; testid `maze-training-live-vector-<worldId>-<i>`. Plus a live score line `Live: 123 pts` (accent) in the row; `Live: -` when no value.

### How the live data flows
- `MAZE_SCORE_STAGE_CODE` (`src/policyEvolution/mazeTraining.ts`) now also watches `api.watch('maze.seg', String(state.seg))` — the active chain segment index (0..n-2). Already watched: `maze.score` ("N pts"), `maze.prog`, `maze.speed`.
- `transformerWatchBridge` gained `getTransformerWatchEntriesForEntity(entityId)` — all stack indexes of one entity, lazy per-entity cache, same dirty-flag pattern as the per-target index; `resetTransformerWatchBridgeForTests` covers it.
- Dialog subscribes via `useSyncExternalStore(subscribeTransformerWatch, snapshot)`; the snapshot ({score, seg}) is cached in a ref keyed by entries-array identity (referential stability, no render loop). Parses `maze.score` with `/(\d+)/`, `maze.seg` with `Number()`.
- Builder (`src/pages/Builder.tsx`): `watchActive = (1 entity selected && workspaceOpen) || mazeTrainingOpen` enables watch publishing while the panel is open; `mazeTrainingLive: {worldId, routeIndex} | null` set by `handlePlayExampleWorld`, cleared by a wrapper around `handleOpenExampleWorld`, and the `liveRun` prop is additionally gated to `currentProject.id === null && currentProject.name === worldId` (stale-live protection when a regular project is opened via handleNew/handleOpen/handleReload, which do not clear the state).

### Data / exporter (`tools/renn-mcp/export-maze-training-worlds.ts`)
- `MazeTrainingMeta.tileSvg?: { w, h, routes: [{ pts: [[x,y]...], score: number|null }] }` — pts = the route's chain polyline **in route_<i>.svg pixel space** (same mx/mz mapping as the svg; the dialog overlays on the static img, alignment depends on pixel identity).
- `thumbSvg` returns `{ svg, w, h, frames: [{ pts }] }`; per-route scores come from the `--score` run (results[i].score).
- All 5 worlds re-exported **with --score**: only `world.json` (one new watch line per score stage) and `meta.json` (tileSvg) changed — every `.svg` byte-identical. Per-route scores: train_1 151/161, train_2 582/246/361/58, train_3 47/187/371/519, train_4 194/479/46/368/376, train_5 191/275/21/439.

## Gates run this session (all green)
- `npx vitest run src/components/MazeTrainingDialog.test.tsx` — 12/12.
- `npx vitest run src/test/scenarios/maze-training-worlds.test.ts` — 20 passed / 5 skipped (sim-gated, unchanged gating).
- All 4 Builder test files — 24/24.
- `npx tsc --noEmit -p tsconfig.app.json` clean; eslint on all changed files clean.
- **Not run**: full vitest suite, e2e, `npm run av:quick`, deploy.

## Training runs (context for the next session)
- **v3mg LIVE** since ~01:16 (pid 61317, `--kinds maze,grid --batch 6 --warm v3maze.json`, out `training-data/policy-evolution/v3mg.json`, ~5 s/gen): the maze+grid policy run, warm from the stopped v3maze best. The output file is the dirty `v3mg.json` in the working tree — **commit it regularly, never git stash it**, and keep it out of unrelated commits.
- **caffeinate -i -w 61317** (pid 64040) keeps the Mac awake until the training process exits. Manuel was told: lid open; `kill 64040` to end it early.
- **v3cap FINISHED** (gen 3000/3000, final HOLDOUT 0.823 = 98/115; best = gen 1900 island 2, train 0.846 / holdout 0.725, in `training-data/policy-evolution/v3cap.json`). **Not shipped**: `src/policyEvolution/shippedPolicyV3.json` still = v3 gen 1000 (commit 3774e50e). Shipping is manual + gated: `ship.ts` HOLDOUT finish-count gate (candidate needs strictly more finished episodes than shipped AND no kind worse than max(1, ceil(5 %)) episodes). `train-ctl.mjs ship` does stop → ship → start (would kill the v3mg run); `ship.ts` directly avoids that but fights for CPU with the 9 workers.
- Under `MAZE_TRAIN_SIM=1` the 4 documented "reached false" progress-gate failures in maze-training-worlds.test.ts are pre-existing v3 state, not regressions.

## Caveats
- Live dialog values freeze when the sim is paused / edit-navigation mode (no watch publishes) — expected.
- The live overlay depends on `route_<i>.svg` staying pixel-identical to the `tileSvg` mapping: any future `thumbSvg` geometry change must regenerate BOTH together (the exporter already does).
- Old exported worlds without `tileSvg` show `Score: —` and no live overlay (field is optional).
- The dialog re-renders on every watch publish (up to ~60 Hz while driving) — same pattern as the Watch panel; fine for the small panel.

## Next steps (recommended order)
1. Merge the branch into main after the full gates (full vitest, e2e incl. `e2e/av-evolution-panel.spec.ts`, real `npm run av:quick` 36/36); deploy only with Manuel's OK.
2. Ship checks on v3mg every ~1–2 h (per `agent-context/handoff-maze-training.md`); 19-route gate via `MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts`.
3. Optional: run the `ship.ts` gate on the finished v3cap candidate (verdict unknown until run).
4. On any successful ship: re-export worlds (`export-policy-drive-example-world.ts`, `export-maze-training-worlds.ts --score`), `npm run sync:global-pipeline` if av-stack touched, full gates, deploy with Manuel's OK.
