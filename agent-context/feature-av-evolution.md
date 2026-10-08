# AV evolution (maze-escape parameter optimizer)

Evolutionary (ES-style) tuning of the autonomous-vehicle pipe parameters over seeded maze-escape episodes.

## Architecture (`src/avEvolution/`)
- `core/` — pure TS: `EvolutionEngine` (`step(evaluate, {concurrency, shouldStop})`, `toJSON`/`fromJSON`), operators, fitness (lower = better), stores (`MemoryEvolutionStore`, `IdbEvolutionStore`).
- `genes/` — `AV_GENOME_SPEC` (param bounds/groups). `maze/` — seeded train/holdout episodes. `eval/` — browser-safe episode runner (`runMazeEpisode`, `createEvaluator`, `prepareSourceWorld`). **One evaluator per thread**: `determinism.ts` patches global `Math.random`/`Date.now`, so never evaluate on the main thread.
- `agent/` + `browser/agentApi.ts` — read/apply API shared by browser and MCP.
- `browser/` — `evalWorker.ts` (Vite module Web Worker, fetches `exampleWorlds/self_hunt_flexible/world.json` + `global/shipped-global-behavior-library.json` under `BASE_URL`), `pool.ts` (`BrowserEpisodePool`, one episode per worker), `controller.ts` (`AvEvolutionController`: start/resume/stop, persists candidates + generation + resumable `RunRecord.state` after every generation; backend is injected so tests use a fake), `workerBackend.ts` (app wiring + singleton controller).

## Entry points
- **CLI**: `npm run av:evolve -- --gens 20 --pop 16 --workers 9 --out test-results/av-evolution/run.json [--resume]` (node `worker_threads` pool, `tools/av-evolution/`).
- **Browser panel**: Builder **Tools → AV evolution** (`src/components/AvEvolutionPanel.tsx`): pop / episodes per candidate / workers, New run, Resume (selected run), Stop, run picker, status (gen, episodes, ep/s, best/mean), top-N table (fitness, mean exit s, contacts, n), per-row **Apply** (to the single selected entity, explicit) and **Copy**, **Export JSON**. Stopping discards the in-flight generation; state stays at the last persisted generation. Builder installs `window.__rennAvEvolution` on mount with the same store.
- **Agent tools**: `window.__rennAvEvolution.{list,best,apply,export}` and MCP `av_evolution_list` / `av_evolution_best` / `av_evolution_apply` (apply merges params into the entity's pipe binding with an explicit `entityId`; default params never change implicitly).

## Persistence
IndexedDB database `renn-av-evolution` (stores `runs`, `candidates`, `generations`). Export schema `renn.av-evolution/1`: `{schema, exportedAt, run (config, spec, weights, trainKeys, state), candidates[], generations[]}`; the CLI `--out` file uses the same schema and `importJSON` can load it.

## Tests
- `npx vitest run src/avEvolution` (controller test: fake evaluator + fake-indexeddb, unattended generations, stop, resume by a new controller).
- `npx playwright test e2e/av-evolution-panel.spec.ts` (real browser: Web Workers run generations, reload restores elites, `__rennAvEvolution.best()` matches).

## Evaluation protocol (episode set v2, gene spec v3)
- Gene spec v3 (132 genes): v2 + 5 maze-module genes (`mazeTurnCos`, `mazeWpMin`, `mazeArriveR`, `mazeOffRoute`, `mazeRays`; defaults = stage defaults). Runs saved under v1/v2 are refused on resume (CLI `--resume` and `AvEvolutionController` `{runId}`, shared `avSpecResumeError`; tests `tools/av-evolution/resume.test.ts`, `controller.test.ts`). Results below were measured under spec v2 with the maze module off; they are not comparable to v3 runs.
- Maze episodes pin the car flags in `MAZE_PINNED_CAR_PARAMS` (`maze/episodes.ts`): `mazeModule: true`. Flag decisions, measured one at a time on TRAIN-24 (mean exitT / reached / contact events): module off 52.7 s / 20 / 3; module on 52.7 / 20 / 3 (byte-identical: the module only acts on a chaser, danger or an unreachable-goal flag, none occurs in the maze episodes, so the 5 maze genes are inert there for now); + `passSide right`, + `pocketBrake`, + goal flags (`escapeTriggerHorizon`, `goalGiveUp`, `goalReachDist`) are each identical to module-only, so they stay off (no measured benefit; the goal flags only matter for chasers / wanderer goal sources and `goalReachDist` is display/counting only, the harness exit criterion is its own); + `carrotLive` / `carrotBend 0.65` is slower (56.6 s, 20/24, 4 contacts) so it stays off; all shipped flags together = carrot result (56.6). `manualOverride` / `hud` stay off (UI only).
- Episodes (`maze/episodes.ts`, `EPISODE_SET_VERSION 2`): TRAIN = 24 episodes (8 maze seeds 101-108 x 3 starts); HOLDOUT = the original 6 (`ho1-ho6`, seeds 7/11/23/42) + 18 extra (`h201a`..`h206c`, seeds 201-206). TRAIN and HOLDOUT share no maze seed. The first single-maze TRAIN (`LEGACY_TRAIN_EPISODES`, seed 7) overfit and is kept only for parity tests.
- Fitness: every candidate of a generation (and the re-scored elites) runs on the same mini-batch of TRAIN keys (common random numbers). The score of each episode is `exitT / baselineExitT(key)`, so hard and easy mazes weigh the same. Contacts and DNFs are penalised. The episode timeout is `clamp(1.6 x baseline, 25 s, 120 s)`. The hall of fame only admits candidates evaluated on all TRAIN keys.
- Tools: `npm run av:evolve` (`--batch`, `--timeout-factor`, `--active <sensitivity.json>`), `npm run av:evolve:compare -- --run FILE --top 3 --keys holdout-all` (full runs, no stop-on-reach, compares against `baseline-off` = defaults with saver off and `baseline-shipped` = `{saver:true}`), `tools/av-evolution/sensitivity.ts` (one-at-a-time gene screen), `tools/av-evolution/baseline.ts`.

### Reversals (metric + fitness term)

- Definition (one implementation, `src/avEvolution/eval/reversals.ts`, also used by `avEvasionRunner`): a reversal is a sign flip of the signed forward speed counting only samples with |v| > 1 m/s (+-1 m/s hysteresis: a dip through 0 that never exceeds 1 m/s the other way is not a reversal). A K-turn costs 2-3. `reverseS` = seconds with v < -1 m/s. Evolution episodes count until the goal is reached (so stop-on-reach and full runs agree).
- Recorded in `EpisodeMetrics` / `EpisodeRecord` (`reversals`, `reverseS`), candidates (`meanReversals`), exported run JSON, the browser panel top-N table (`rev` column), MCP `av_evolution_list/best` summaries (`meanReversals`), and `compare.ts` (per-episode `reversals / reverseS`, summary mean/median/total + `reverseS` mean, in `.md` and `.json` rows/results).
- Fitness weight `wReversal` (seconds per reversal, default 0.5; CLI `run.ts --w-reversal W`, run config `weights.wReversal`, panel field "rev s", `NewRunOptions.reversalWeight`). 0 => score bit-identical to before. Default rationale: TRAIN baseline-off makes 14.2 reversals/episode (median 11, total 340 over 24; `user-top3` 8.3, total 199), so 0.5 s each is ~7 s, ~10-13 % of the baseline score, meaningful but not dominant. Runs saved before the weight existed (no `wReversal` in state/weights) resume with 0 so their fitness stays comparable; no gene-spec bump (not a gene).

- Fitness weight `wReverseS` (seconds charged per second spent reversing, `score += wReverseS * reverseS`; default 0 = off and bit-identical; CLI `run.ts --w-reverse-s W`, run config `weights.wReverseS`, panel field "rev-time s/s", `NewRunOptions.reverseSecondsWeight`). Runs saved before it existed resume with 0. Complements `wReversal` (count) by penalising time spent backing up. Suggested for maze evolutions: 0.25 (TRAIN baseline-off reverseS mean 23.6 s => ~6 s, user-top3 13.8 s => ~3.5 s). Not a gene, no spec bump.

### Maze module activation (spec v4)
- Spec v4 (133 genes) = v3 + bool gene `mazeForce` (default false = stage default). The maze module (pinned `mazeModule: true`) was inert in maze-escape episodes (M5: byte-identical to off) because its escape only starts on a trigger (goal watchdog, sim danger, chaser, danger on the way) and chaser-free mazes never give one. `mazeForce` makes every frame with a confined-space detection a trigger, so the module drives the whole episode. Baseline stays force-off; evolution decides via the gene. v1-v3 runs are refused on resume.
- Measured TRAIN-24 (`av:evolve:compare`, pinned params + overrides): off / module-on 52.7 s mean, 38.8 median, 20/24 reached, 3 contact events / 107 frames. `mazeForce` on: 98.1 s mean, 120 median, 7/24 reached, 2 / 13. With `goalWatchdog` 5: 102.2 s, 6/24, 2 / 13. Forcing steers toward the nearest exit to open ground, not the mission goal, so it fights the maze goal; it is a real, measurable lever but a bad default (fewer contacts mostly because the car rarely gets anywhere).
- Spec v5 (137 genes) = v4 + `mazeGoalW` (0-4, default 0), `mazeStallT` (0-20 s, default 0 = off), `mazeStallProg` (2-20 m, 8), `mazeStallHold` (3-30 s, 10): goal-aware exit field and stall-triggered fallback for the maze module (defaults bit-identical to v4). TRAIN-24 with the fallback on: mean 52-57 s and 20-22/24 reached for window 20 s / hold 3-5 s (off: 52.7 s, 20/24); short windows (4-10 s) or long holds (10 s) are worse (69-87 s, 12-19/24), because a slow winding maze path reads as a stall. The fallback fixes some off-timeouts (t102a, t107a, t108b) and costs others (t104a, t104c, t106a).
- Spec v6 (143 genes) = v5 + heading-aware K-turn genes of the route planner: `cuspHeadW` (0-30, default 0 = off), `cuspReachW` (0-30, 0), `cuspLook` (6-25 m, 12), `gearIncW` (0-10, 0), `cuspCommit` (bool, false), `cuspDeviate` (1.5-8 m, 4). All off = bit-identical (av:quick 36 rows, TRAIN baseline 52.7 / 38.8 / 20/24). See feature-av-stack.md. Runs saved under v5 are refused on resume. `tools/av-evolution/legs.ts` (hook-free) reports reverse legs per chain, share of chains with >= 2 reverse legs and heading error at reverse-leg ends for a params file (`npx tsx tools/av-evolution/legs.ts <@file|json> <out.json> <sliceIdx> <sliceN> [train|holdout-all]`, run N slices in parallel and aggregate the JSONs).

## Results (2026-10-07, headless, 10-core Mac)
- Run: pop 16, 50 generations, 127 genes, 8048 episodes in 31 min (4.3 episodes/s, 9 workers).
- HOLDOUT, all 24 episodes, full runs (mean / median exit s, reached, contact events / frames):
  - `baseline-off`: 43.6 / 34.1, 21/24 reached, 5 / 157.
  - `baseline-shipped`: 48.7 / 35.5, 22/24 reached, 2 / 182.
  - Top 3 by TRAIN fitness, picked before looking at HOLDOUT:
    - #1 c750: 25.7 / 14.4, 23/24 reached, 5 / 303. 41% faster than `baseline-off` and 47% faster than `baseline-shipped`.
    - #2 c702: 28.4 / 21.8, 24/24 reached, 1 / 8. 35% and 42% faster.
    - #3 c690: 29.9 / 22.2, 24/24 reached, 5 / 207. 31% and 39% faster.
- Trade-off: #1 is the fastest but scrapes walls more than the baseline. #2 is faster with fewer contacts.
- The params are not applied to any shipped car. Apply them explicitly from the panel or with `av_evolution_apply`.
- The first run (single-maze TRAIN, rotating episode subsets) reached only -21% on the original 6 HOLDOUT episodes. That led to the protocol above.

### v3 run (spec v3, 132 genes, maze module on) - effectively a replication
- The maze module is inert on maze episodes (M5: byte-identical to off, no chasers/danger/goal-watchdog), so the 5 maze genes do nothing. This is a second D1-style run with a different gene vector and RNG, not a test of the module.
- Command: `npm run av:evolve -- --gens 50 --pop 16 --workers 9 --out test-results/av-evolution/e5.json`. 6762 episodes in 5267 s (1.28 episodes/s; slower than v2 because the machine was heavily loaded by other jobs). Per-generation best fitness (rotating batches, not comparable across gens) went from about 1.0 (first 10 gens) to about 0.74 (last 10).
- HOLDOUT-24 (mean / median exit s, reached, contact events / frames), top 3 by TRAIN fitness picked beforehand:
  - `baseline-off` 43.6 / 34.1, 21/24, 1 / 44. `baseline-shipped` 48.7 / 35.5, 22/24, 2 / 182.
  - New #1 c784 31.7 / 20.0, 24/24, 2 / 14. #2 c795 28.0 / 19.8, 24/24, 5 / 58. #3 c623 30.2 / 23.1, 24/24, 2 / 28.
  - Old v2 best (re-run on this head): c750 25.7 / 14.4, 23/24, 5 / 303; c702 28.4 / 21.8, 24/24, 1 / 8.
- Reading: the new run lands at 27-36% faster than `baseline-off` and reaches 24/24, but did not beat the v2 optima (c750, c702) on HOLDOUT. Differences between the top candidates are within what a single 24-episode set and one run can resolve. Raw outputs are under the orchestrate run dir `l3/E5/`.

### v4 run (E6, spec v4, 133 genes, D1 protocol)
- Command: `npm run av:evolve -- --gens 50 --pop 16 --workers 9 --out test-results/av-evolution/e6.json` (24-episode multi-maze TRAIN). 50 gens, 6654 episodes in 5067 s = 1.31 ep/s (machine shared with another evolution). Best-per-gen fitness 0.83 at gen 0 to a minimum of 0.38; noisy, no monotone curve.
- `mazeForce` did not take hold: it was true in only 5 of 604 candidates (gens 13, 25, 39, 49), and in none of the 79 fully TRAIN-evaluated ones. The top 3 (c751, c657, c667) all have `mazeForce=false`; mazeTurnCos/WpMin/ArriveR/OffRoute/Rays = 0.275/12.6/3.80/7.76/11, 0.428/13.9/3.80/6.76/11, 0.428/13.9/3.80/6.76/10. Consistent with the measured cost of forcing the module (98 s mean exit, 7/24 reached on TRAIN).
- HOLDOUT-24 (mean / median exitT, reached, contact events / frames; old-spec params run with `mazeForce` at its default, off): baseline-off 43.6 / 34.1, 21/24, 1 / 44; baseline-shipped 48.7 / 35.5, 22/24, 2 / 182; c750 25.7 / 14.4, 23/24, 5 / 303; c702 28.4 / 21.8, 24/24, 1 / 8; E5 #1 31.7 / 20.0, 24/24, 2 / 14; E6 #1 27.4 / 23.1, 23/24, 3 / 6908; E6 #2 26.8 / 20.6, 24/24, 7 / 156; E6 #3 26.6 / 17.6, 24/24, 3 / 52.
- Conclusion: adding the activation gene gave no gain over spec v2/v3 on HOLDOUT-24; E6 is within noise of c750/c702. E6 #1 has one 6908-frame contact (a stuck-on-wall episode), so prefer #3.
