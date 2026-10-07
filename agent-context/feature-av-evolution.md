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
