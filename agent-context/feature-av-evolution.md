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
