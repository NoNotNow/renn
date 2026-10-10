# Handoff: maze training worlds + v3maze run, state 2026-10-11 ~00:15 (Mac)

For the next agent. Branch `claude/autonomous-car-evolution-9p6zt2`. New work stream from user round 6:
5 playable maze training worlds (dialog, tapered guidance vectors, scoring, play-mode line rendering)
+ a v3 training run restricted to mazes. The worlds and the dialog are SHIPPED (this commit); the training run is live.

## What exists now

- **5 example worlds `maze_train_1..5`** (`public/exampleWorlds/maze_train_<n>/`: `world.json`, `meta.json`, `thumb.svg`).
  Source of truth `src/policyEvolution/mazeTraining.ts` (registry + taper + score stage + builder; browser-safe, the dialog imports it).
  Regenerate after any change or a policy ship: `npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score` (measures the candidate headless, ~0.5 s).
  Each world: 6x6 maze (seeds 2001-2005), the shipped v3 net (gen 1000) drives on a TAPERED guidance chain
  (dense + exact at the start, spacing 8 -> 40 m and noise 0 -> 3.5 m deeper in; `MAZE_TRAIN_TAPER`), score stage on the car
  (`MAZE_SCORE_STAGE_CODE`): 1 pt per m monotone chain progress + speed bonus (vRef 20, 5 pt/s at full speed), `api.setScore`
  -> the Play HUD shows the points. The chain + carrot are drawn via `api.visualizeLine` (green -> orange; NO chain marker entities;
  the goal slab floats at y 9). `world.debugTargetLineEntityId` = the car.
- **Dialog**: Builder File menu -> "Training Mazes…" (`MazeTrainingDialog.tsx`): 5 cards (thumb.svg, seed, candidate label,
  bestScore from meta.json), Play button = load example world + jump into play (`handlePlayExampleWorld` in `Builder.tsx`).
  The pure training worlds (`policy_*`) and the maze training worlds are FILTERED OUT of the generic Example Worlds submenu
  (`BuilderHeader.tsx`, prefix rule + registry set — worlds stay on disk).
- **Play-mode lines**: `SceneView.tsx` no longer disables the coordinate overlay in play mode when the world sets
  `world.debugTargetLineEntityId` (before: visualizeLine was a no-op in Play). Comment updated in `coordinateOverlayBridge.ts`.
- **Measured baseline (shipped v3, `--score`)**: maze_train_1/2/4/5 cleared in ~5 s (153/144/156/156 pts); **maze_train_3 stalls at the first junction (47 pts, never reached)** — the documented weak point.
- **Tests**: `src/test/scenarios/maze-training-worlds.test.ts` (default: disk==builder, taper unit tests, fast; `MAZE_TRAIN_SIM=1`: headless runs, ~0.5 s, currently maze_train_3 FAILS the reach gate on purpose — it is the maze-training progress gate, goes green when a maze-trained candidate clears it). UI tests: `MazeTrainingDialog.test.tsx`, `BuilderHeader.example-worlds.test.tsx`.

## The v3maze training run (LIVE)

- Started 2026-10-10 ~23:50 from the best previous candidate (the shipped v3, gen 1000), restricted to mazes:
  `V3_OUT=training-data/policy-evolution/v3maze.json V3_EXTRA_ARGS="--kinds maze --batch 6 --warm src/policyEvolution/shippedPolicyV3.json" nohup bash tools/policy-evolution/run-v3.sh 3000 9` (log `training-data/policy-evolution/v3maze.log` / `v3maze.nohup.log`, git-ignored).
  No `--speed-cap` (keeps the shipped v3's uncapped fitness scale; v3cap lost in 1500 gens). `--batch 6` = 6 maze setups/gen (run-v3.sh's own `--batch 1` loses, parseArgs last-wins). ~1.5 s/gen; **commit `v3maze.json` regularly** (never `git stash` while it runs).
- **Ship check** (stop first, e.g. `npm run train:stop` — the run file is `v3maze.json`, not v3cap): `npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3maze.json --v3 --workers 9`.
  NOTE: the gate compares per-kind HOLDOUT vs `shippedPolicyV3.json`; a maze-only candidate must not regress other kinds to ship.
  If it ever WROTE a new shippedPolicyV3.json: re-run the world exporter with `--score`, re-export the other policy worlds, `npx vitest run src/policyEvolution`, commit, deploy. The dialog candidate label in `mazeTrainingMeta` is still hardcoded 'v3 shipped (gen 1000)' — update it there after a ship.

## Next steps

1. Ship checks on v3maze every ~1-2 h; measure train_3 improvement via `MAZE_TRAIN_SIM=1 npx vitest run src/test/scenarios/maze-training-worlds.test.ts`.
2. User round-5 backlog is still open: `av_neural_crowd` gauntlet bypass fix + path-quality gates (see handoff-flee-improvements.md next-steps 1).
3. Possible follow-ups: taper the TRAINING chains like the showcase (chains.ts is untouched — training uses standard maze chains); show per-maze candidate history in the dialog; scores in the dialog only update on re-export.

## Pitfalls (stream-specific)

- `api.visualizeLine` renders ONLY for the entity named by `world.debugTargetLineEntityId`, max 200 entries per frame (chain n-1 segments + 1 carrot; chain capped at 80 points in `taperChain`).
- `mazeTraining.ts` must stay free of node imports (the dialog bundles it); `shippedGenomeV3()` is passed in from the exporter/tests.
- The goal slab floats at y 9 (car bottom is ~0 m: any ground-level static box is a curb collision).
- `MAZE_GOAL_REACH_M` = 8: the v3 net brakes 5-8 m before the chain end; 4 m was too strict (looked like 4/5 failures while the mazes were actually cleared).
