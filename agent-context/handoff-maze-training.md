# Handoff: maze training worlds + dialog + v3mg run, state 2026-10-11 ~01:45 local (Mac)

For the next agent. Branch `claude/autonomous-car-evolution-9p6zt2` (far ahead of `main`). This handoff covers the whole
maze-training work stream (user rounds 1-6, all SHIPPED and deployed) + the LIVE training run.
**Workflow:** testing happens on LOCALHOST (`npm run dev`); the user verifies; deploy to gh-pages after every finished
user-visible change (`npm run deploy`). **Subagents are available and worked well** (spec + "max N lines" report + parallel
non-overlapping file sets; the parent owns contracts, commits, processes).
Read in: this file → [handoff-policy-evolution.md](./handoff-policy-evolution.md) (v1→v2→v3 policy history, ship gate, workflow)
→ [handoff-flee-improvements.md](./handoff-flee-improvements.md) (the OTHER open stream: flee fix + av_neural_crowd round-5 backlog).

## User goal

Train the best existing v3 policy candidate EXCLUSIVELY on mazes (now maze + grid with sharp U-turns), make the training
visible and playable: 5 maze worlds in a dialog with thumbnails, guidance VECTORS (dense + exact at the start, sparser and
noisier deeper in the maze), score = metres travelled along the VECTOR path + speed bonus, everything playable from the Builder.

## What exists (all deployed, commits afc874be → 0f3c7327)

### 1. The 5 worlds `maze_train_1..5` (`public/exampleWorlds/maze_train_<n>/`)
Source of truth: `src/policyEvolution/mazeTraining.ts` (browser-safe: no node imports — the dialog bundles it; the genome is
passed in from the exporter/tests). Files per world: `world.json`, `meta.json`, `thumb.svg` (all routes side by side),
`route_<i>.svg` (one tile per route). Regenerate after ANY change or policy ship:
`npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score` — ALWAYS with `--score` (without it meta.json gets
bestScore null; the whole 5-world measurement takes ~8 s).
- Geometry: 6x6 maze (seeds 2001-2005, deliberately neither train nor holdout seeds), one MAZE COPY PER ROUTE at
  x = i·130 m. `mazeRoutes(course, seed)`: BFS primary (frame-checked == course.waypoints), DFS alternatives with
  <= 60 % cell overlap (cap `MAZE_TRAIN_ROUTES.forward` 3) + REVERSED routes (cap 2; car starts OUTSIDE the north gate
  and drives south = start/goal swapped = bias removal). Cars per world: 2 / 4 / 4 / 5 / 4 (a genuine maze property:
  1: only 1 diverse forward route).
- Each car: shipped v3 net (gen 1000) on a TAPERED guidance chain (spacing 8 -> 40 m, perpendicular noise 0 -> 3.5 m with
  arc length, wall-clamped 1.5 m; `MAZE_TRAIN_TAPER`) + score stage `maze_score_<i>` (monotone chain progress 1 pt/m +
  speed bonus 5 pt/s at vRef 20, `api.setScore` ONLY from the focused car, `api.watch` per car).
- Vector rendering: `api.visualizeLine` ONLY (no marker entities); ALL drawing happens from the FOCUSED car's stage
  (lines render only for the entity in `world.world.debugTargetLineEntityId`): every chain (forward green -> orange,
  REVERSED blue -> orange `MAZE_TRAIN_CHAIN_COLORS_REVERSED`) + one carrot per car (own from progress, others via
  `api.getWorldPosition`). Entry cap 200/frame; chains capped at 80 points.
- Goal slabs `maze_goal_<i>` float at y 9 (car bottom is ~0 m: any ground-level static box is a curb collision).
- `focusMazeRoute(world, routeIndex)` (exported): load-time JSON transform — camera.target + debugTargetLineEntityId ->
  `mazeCarId(i)`, `hud` only on that car's score stage; out-of-range = no-op. On-disk worlds stay neutral (route 0).

### 2. The Training Mazes dialog (`src/components/MazeTrainingDialog.tsx`, round 5 state)
- File menu → "Training Mazes…" (`BuilderHeader.tsx`; the pure training worlds `policy_*` AND the maze_train worlds are
  filtered OUT of the generic Example Worlds submenu — prefix rule + registry set).
- A HALF-TRANSPARENT floating panel (rgba(27,31,42,.55) + backdrop blur, portal to body, NO backdrop/scroll lock — clicks
  outside reach the scene), MOVABLE (header drag, 3 px threshold) and RESIZABLE (`useCornerBrResize`), z-index
  `theme.zIndex.popover`. Position/size/collapsed persist in localStorage (`mazeTrainingPanelPos/Size/Collapsed`).
- COLLAPSED = one 38 px line ("Training Mazes · 5 runs"). Click expands: 5 SINGLE-LINE run rows (name, seed,
  `Best: N pts`, `N ways · M reversed`, Play). Clicking a row expands its ROUTE TILES (one per way, `route_<i>.svg`);
  each tile is INDIVIDUALLY CLICKABLE and selects the run's target vector (highlight, "Way i (fwd/rev)");
  accordion, second click collapses.
- Play = load into the BUILDER (NOT play mode; no navigation): `handlePlayExampleWorld(worldId, routeIndex)` in
  `Builder.tsx` → `focusMazeRoute` + `setShowGameHud(true)`; the panel STAYS OPEN. The guidance lines render in builder
  mode because the worlds set `debugTargetLineEntityId` — `SceneView.tsx` wires the coordinate overlay for such worlds
  in BOTH builder and play mode (round-1 change: playMode no longer disables it; comment updated in
  `coordinateOverlayBridge.ts`).

### 3. The grid course kind (round 6, `src/policyEvolution/courses.ts` + `chains.ts`)
`gridCourse(rng)`: 5-lane walled serpentine, lane width 24-28 m (U-turn diameter vs the car's ~20 m min-turn diameter:
sharp but drivable), lanes 56-72 m, STAGGERED divider tips (one end opens into a 20 m turning strip, the other sealed at
6 m) so a U-turn at the end of every lane is the ONLY lane sequence; 1-2 seeded 10-13 m mid-gaps in dividers 2-3 only
(alternative routes for the >= 2 accepted chains gate). chains.ts: `CLEARANCE.grid` {margins [2.5, 1.5]} + lane-mouth
end targets (chains with 4/3/2/1 U-turns). Salt 86028121, jitter {x:3, z:3, yawDeg:10}. Gates green: 2-4 accepted
chains/setup, pure pursuit 100 % finish. Lesson learned (measured): uniformly open strips let A* cross with ZERO
U-turns — the staggered seal is what forces the hairpins.

### 4. Measured baseline of the shipped v3 (gen 1000) on the worlds (per route car, `--score`)
14/19 route cars clear in ~5-10 s. Stalls = the maze-training gaps: train_2 r3 (rev) 58 pts, train_3 r0 (fwd) 47 +
r1 (fwd) 187, train_4 r2 (fwd) 46, train_5 r2 (rev) 21. bestScore in meta (max over cars): 161 / 582 / 519 / 479 / 439.
The `MAZE_TRAIN_SIM=1` gated test (`src/test/scenarios/maze-training-worlds.test.ts`, ~1 s) asserts EVERY car reaches
within `MAZE_GOAL_REACH_M` 8 (the net brakes 5-8 m before the chain end; 4 m was a too-strict trap) — it is the
progress gate: green when a maze-trained candidate clears all 19 routes.

## The training runs (training-data/policy-evolution/)

- **v3mg (LIVE since 2026-10-11 ~01:20): maze + grid.**
  `V3_OUT=training-data/policy-evolution/v3mg.json V3_EXTRA_ARGS="--kinds maze,grid --batch 6 --warm training-data/policy-evolution/v3maze.json" nohup bash tools/policy-evolution/run-v3.sh 3000 9 > training-data/policy-evolution/v3mg.nohup.log 2>&1 &`
  (logs `v3mg.log`/`v3mg.nohup.log`, git-ignored). Warm from the v3maze best. Train setups 8+8, holdout 5+5, ~5 s/gen.
  Status at gen 125: best gen 100 (train 2.099, holdout 1.816); HOLDOUT maze 9/13 (69 %), **grid 10/10 (100 %)** — the
  warm start handles the U-turns out of the box; maze is the open front. Commit `v3mg.json` regularly (never `git stash`).
  The log line's "kinds 1" is just the curriculum display (activeKinds(share)) — without `free` in the kinds ALL
  requested kinds are active; verify with `trainV3Episodes(8, ['maze','grid'])` from chains.ts.
- **v3maze**: maze-only run, STOPPED cleanly at gen 2821/3000 (checkpoint committed, resumable; its best = the v3mg warm start).
- **v3cap** (gen 3000, KEEP) and the shipped v3 (gen 1000, final): see handoff-policy-evolution.md.
- **Ship check** (stop the run first — kill after a gen line, state saves every gen): `npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3mg.json --v3 --workers 9`.
  The gate compares per-kind HOLDOUT vs `shippedPolicyV3.json`. If it ever WROTE: re-run the world exporter WITH --score,
  update the candidate label in `mazeTrainingMeta` (still hardcoded 'v3 shipped (gen 1000)'), re-export the other policy
  worlds, `npx vitest run src/policyEvolution`, commit, deploy.

## Next steps (in order)

1. Ship checks on v3mg every ~1-2 h; track the 19-route gate via `MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts`.
   NOTE: a maze+grid specialist will likely fail the full ship gate (other kinds regress) — a separate decision is needed
   whether to ship a maze/grid specialist into the WORLDS via `neuralWeights` params without replacing the general shipped policy.
2. Round-5 backlog (other stream): `av_neural_crowd` gauntlet bypass fix + path-quality gates (handoff-flee-improvements.md).
3. Optional follow-ups: a grid TRAINING WORLD in the dialog (grid is pipeline-only so far); per-maze candidate history in
   the dialog; the smart AV integration (plan-policy-in-av-car.md §8, blocked on a shipped candidate the user likes).

## Pitfalls (this stream)

- `visualizeLine` renders ONLY for the entity named by `world.debugTargetLineEntityId`, max 200 entries per frame.
- `mazeTraining.ts` must stay free of node imports (the dialog bundles it).
- Exporter: ALWAYS `--score`, otherwise meta.json loses the bestScore measurements.
- The exporter's headless score stops early within `MAZE_GOAL_REACH_M` (8 m) of each goal; scores = monotone chain progress + speed bonus (frozen once a car stops).
- pkill: never with a pattern contained in your own command line — use `pkill -f "[r]un-islands"` (bracket trick).
- After stage-code edits in `public/global/transformers/av-stack/`: `npm run sync:global-pipeline` + re-export worlds (NOT needed for the maze worlds — they inline the training stage code).
- The v3mg training eats ~90 % CPU: headless vitest is ~3x slower; run long suites with generous timeouts.
- Sandbox approval blocks `npm run deploy` and combined `git commit && git push`: repeat / split them.
- Route count per world is a genuine maze property (train_1: 2 cars only) — do not "fix" it.
