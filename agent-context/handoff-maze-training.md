# Handoff: maze training worlds + v3maze run, state 2026-10-11 ~00:45 (Mac)

For the next agent. Branch `claude/autonomous-car-evolution-9p6zt2`. New work stream from user round 6:
5 playable maze training worlds (dialog, tapered guidance vectors, scoring, play-mode line rendering)
+ a v3 training run restricted to mazes. Round 6 feedback (shipped, this commit): dialog stays OPEN on Play,
Play loads the world into the BUILDER (no play-mode navigation; HUD force-enabled), dialog has a compact LIST
view (default, expandable thumbs; cards behind a headerExtra toggle; modal resizable), and each world now
trains on SEVERAL routes (bias removal) — some driven in REVERSE direction (start/goal swapped).

## What exists now

- **5 example worlds `maze_train_1..5`** (`public/exampleWorlds/maze_train_<n>/`: `world.json`, `meta.json`, `thumb.svg`).
  Source of truth `src/policyEvolution/mazeTraining.ts` (registry + route enumeration + taper + score stage + builder; browser-safe, the dialog imports it).
  Regenerate after any change or a policy ship: `npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score` (measures all cars headless, seconds).
  Each world = K maze copies at x = i*130 m (one car per copy): K = kept routes. `mazeRoutes(course, seed)`: BFS primary
  (frame-checked == course.waypoints), DFS alternatives with <= 60 % cell overlap, up to MAZE_TRAIN_ROUTES.forward=3 forward
  + reversed=2 (primary first; reversed cars start OUTSIDE the north gate). Route counts per seed: 1: 2 cars, 2: 4, 3: 4, 4: 5, 5: 4.
  The shipped v3 net drives each car on a TAPERED chain (dense + exact at the start, spacing 8 -> 40 m, noise 0 -> 3.5 m deeper in),
  score stage per car (`MAZE_SCORE_STAGE_CODE`): 1 pt per m monotone chain progress + speed bonus (vRef 20, 5 pt/s), watch per entity;
  `api.setScore` (HUD) ONLY from car 0; ALL chain/carrot drawing happens from car 0's stage (lines render only for
  `world.debugTargetLineEntityId` = car 0; other carrots via `api.getWorldPosition`). Forward chains green -> orange, REVERSED chains
  blue -> orange (`MAZE_TRAIN_CHAIN_COLORS_REVERSED`). Goal slabs `maze_goal_<i>` float at y 9.
- **Dialog** (`MazeTrainingDialog.tsx`, round 3): a HALF-TRANSPARENT floating panel (rgba(27,31,42,.55) + backdrop blur,
  portal to body, NO backdrop/scroll lock — clicks outside reach the scene), MOVABLE (drag the header strip, 3 px drag threshold,
  viewport-clamped) and RESIZABLE (`useCornerBrResize` bottom-right grip, expanded only). COLLAPSED = one 38 px line
  ("Training Mazes · 5 runs" + close X); clicking the strip expands the run list: 5 SINGLE-LINE rows (name, seed,
  `Best: N pts`, `N ways · M reversed`, Play); clicking a row expands its thumbnail to the FULL ROW WIDTH (all guidance
  vectors visible; accordion, one row at a time, second click collapses; candidate label inside the expanded area). Position/size/collapsed persist in localStorage
  (`mazeTrainingPanelPos` / `mazeTrainingPanelSize` / `mazeTrainingPanelCollapsed`); z-index = theme.zIndex.popover.
  Play = load example world into the BUILDER (`handlePlayExampleWorld` in `Builder.tsx`: NO play navigation, panel stays open,
  `setShowGameHud(true)`). The guidance lines render in builder mode because the worlds set `world.debugTargetLineEntityId`.
  The pure training worlds (`policy_*`) and the maze training worlds are FILTERED OUT of the generic Example Worlds submenu.
- **Measured baseline (shipped v3 gen 1000, per-car, `--score`)**: 14/19 cars clear their route in ~5-10 s.
  Stalls (the maze-training gaps the v3maze run exists to close): train_2 route 3 (rev), train_3 route 0 (fwd, 47 pts) + route 1 (fwd),
  train_4 route 2 (fwd), train_5 route 2 (rev). bestScore in meta (max over cars): 161 / 582 / 519 / 479 / 439.
- **Tests**: `src/test/scenarios/maze-training-worlds.test.ts` (default: disk==builder incl. K cars + route consistency, fast).
  `MAZE_TRAIN_SIM=1`: headless per-car runs (~1 s); currently 4 cars fail the reach gate on purpose — it is the maze-training progress
  gate, goes green when a maze-trained candidate clears every route. UI tests: `MazeTrainingDialog.test.tsx` (list/accordion/no-close),
  `BuilderHeader.example-worlds.test.tsx`.

## The training run (LIVE)

- **v3mg** (since 2026-10-11 ~01:20): maze + GRID training (user round 6: "a grid with lots of sharp uturns").
  `V3_OUT=training-data/policy-evolution/v3mg.json V3_EXTRA_ARGS="--kinds maze,grid --batch 6 --warm training-data/policy-evolution/v3maze.json" nohup bash tools/policy-evolution/run-v3.sh 3000 9`
  (log `v3mg.log` / `v3mg.nohup.log`, git-ignored). Warm from the v3maze best (maze-trained); new file = new kind-evenness
  fitness scale (maze + grid). Train setups 8+8, holdout 5+5 (verified: `trainV3Episodes(8, ['maze','grid'])`).
  ~5 s/gen (12 setups/gen). Commit `v3mg.json` regularly.
- **v3maze** = maze-only run, STOPPED cleanly at gen 2821/3000 (checkpoint committed, resumable). Its best is the v3mg warm start.
- New kind `grid` (`gridCourse`, courses.ts): 5-lane walled serpentine, lane width 24-28 m (U-turn diameter vs the car's
  ~20 m min-turn: sharp but drivable), lanes 56-72 m, STAGGERED divider tips (one end opens into a 20 m turning strip, the
  other sealed at 6 m) so a U-turn per lane is the only lane sequence; 1-2 seeded 10-13 m mid-gaps in dividers 2-3 for
  route alternatives. chains.ts: CLEARANCE.grid {margins [2.5,1.5]} + lane-mouth end targets (chains with 4/3/2/1 U-turns).
  Gates green: 2-4 accepted chains/setup, pure pursuit 100 % finish.
- **Ship check** (stop first): `npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3mg.json --v3 --workers 9`.
  NOTE: the gate compares per-kind HOLDOUT vs `shippedPolicyV3.json`; a maze+grid candidate must not regress other kinds to ship.
  If it ever WROTE a new shippedPolicyV3.json: re-run the world exporter with `--score`, re-export the other policy worlds,
  `npx vitest run src/policyEvolution`, commit, deploy. The dialog candidate label in `mazeTrainingMeta` is still hardcoded
  'v3 shipped (gen 1000)' — update it there after a ship.

## Next steps

1. Ship checks on v3mg (maze+grid) every ~1-2 h; measure train_3/route improvement via `MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts`.
2. User round-5 backlog is still open: `av_neural_crowd` gauntlet bypass fix + path-quality gates (see handoff-flee-improvements.md next-steps 1).
3. Possible follow-ups: taper the TRAINING chains like the showcase (chains.ts is untouched — training uses standard maze chains); show per-maze candidate history in the dialog; scores in the dialog only update on re-export.

## Pitfalls (stream-specific)

- `api.visualizeLine` renders ONLY for the entity named by `world.debugTargetLineEntityId`, max 200 entries per frame (chain n-1 segments + 1 carrot; chain capped at 80 points in `taperChain`).
- `mazeTraining.ts` must stay free of node imports (the dialog bundles it); `shippedGenomeV3()` is passed in from the exporter/tests.
- The goal slab floats at y 9 (car bottom is ~0 m: any ground-level static box is a curb collision).
- `MAZE_GOAL_REACH_M` = 8: the v3 net brakes 5-8 m before the chain end; 4 m was too strict (looked like 4/5 failures while the mazes were actually cleared).
