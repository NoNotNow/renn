# Handoff: AV car in self_hunt_flexible — lab tooling is in, remaining problems (2026-10-04)

Branch `claude/great-curie-ut1n74`, last commit `88f88ac2` (pushed). **Not deployed** (see "Deploy").

## Standing instructions (Manuel)

- After every larger fix: full suite (`npx vitest run`), commit, push, `npm run deploy`. No PRs unless asked. Manuel answers in German.
- After editing `public/global/transformers/**`, always run `npm run sync:global-pipeline` — tests and the lab use the generated library.
- Commit trailer: `Co-Authored-By: <your model> <noreply@anthropic.com>`.
- Never `pkill -f vite`.

## Read first

1. `agent-context/feature-av-lab.md` — the test tooling (deterministic runs, motion heuristic, triggers, scene capture/replay, profiler, CLI).
2. `agent-context/feature-av-stack.md` — sections "Longitudinal control: identified actuator model", "Sleeping bodies", "Planner fixes from the lab".

## Target

Car `entity_1779823253285_brtkx1p` ("Player Car copy") in `public/exampleWorlds/self_hunt_flexible/world.json`: 4×8 box, mass 2, friction 0.01 (Rapier averages it with the ground's friction → effectively ~0.6), car2 `power 2400`, pipe `global_av_autopilot` with `cruiseSpeed 1000`, `minSpeed 9.4`, `comfortDecel 2`, wanderer goals (±370 m). 12 other cars use the legacy pipe `pipe_1780343603350` and drive 20+ m/s.

## Fixed already (88f88ac2)

| Problem | Cause | Fix |
| --- | --- | --- |
| Jitter (speed 2→15→7→10 m/s every 4 frames) | fixed deadband 0.36 ≈ 430 m/s² on this car | `av-control-longitudinal.js`: online RLS model `a = G·u − D·sgn(v)`, acceleration command; AEB brakes by deceleration via `av.actuator`; mailbox `av.actuator.u` |
| Stuck "although free", resumes on code edit | sleeping body's chain was skipped forever | `renderItemRegistry.ts`: sleeping chains tick every 0.25 s; `rapierPhysics.ts`: zero force/impulse/torque does not wake |
| `free 0` next to obstacles | full margin vetoed every path at s=0 | motion planner margin ramp (`marginRamp` 3 m) |
| Creep/shuttle on long forward plans | no handback while `idx == 0` | route planner handback from segment 0 |
| Stop-and-go | `minSpeed` / route / curve floors lifted speed above stopping-distance limit | speed planner: `free` is a hard upper bound |

Result on seed 2: roughness 18.9 → 0.05 m/s/frame. Edge cases added: icy powerful car (3), car asleep at start.

## Open problems (priority order)

1. **Deploy is pending.** `dist/` is built from 88f88ac2, but `npx gh-pages -d dist` failed (curl HTTP/2 stream cancelled, then hung for 30 min). Retry `npx gh-pages -d dist` (delete `node_modules/.cache/gh-pages` first). If it hangs again, tell Manuel; do not loop.
2. **Performance agent in flight.** A subagent was optimising `av-route-planner.js` (replans 50–200 ms; p95 ~0.2 ms), `av-perception.js` (~0.9 ms/frame) and `av-motion-planner.js`. The rule was behaviour-identical (deterministic lab output unchanged). Worktree: `.claude/worktrees/agent-a046520a95b2b2780`, branch `worktree-agent-a046520a95b2b2780`. Check `git -C .claude/worktrees/agent-a046520a95b2b2780 log --oneline -3`. If it has a commit: verify the lab output is identical (seeds 2 and 6, 1800 frames, same path length / final pos), run the AV tests, then cherry-pick and sync. If it is empty, redo the task yourself.
3. **Red check for the sleep fix not done.** Temporarily restore the old skip in `RenderItemRegistry.executeTransformers` → edge case `car asleep at start` must fail, then revert.
4. **Remaining standstill/shuttle in the crowded start area** (x ≈ −40…−10, z ≈ 150…185: "pyramid orange 2" tilted at scale 9.1, "sphere purple 1", followers). The probe showed one sample was a legitimate back-off for crossing traffic, but seeds 2/6/7 still only make 150–400 m per 60 s versus 600–860 m for seeds 1/3. Run the 6-seed batch, check `stall` / `shuttle` scenes with a probe (see below), decide bug vs traffic.
   - Known weak points: the manoeuvre planner replans restart at segment 0 (no commitment); the route summary (1500 expansions) and the full plan (4000) can disagree on the first gear; the lidar sees sloped surfaces (pyramid) differently per ray plane.
   - The longitudinal model learned D ≈ 50–120 and G up to ~2000 in some runs, so check its stability when the car pushes against sloped obstacles (that contact is not `isTouchingSide`).
5. **World issues to report to Manuel (do not fix silently):** every follower car has its pipeline twice (2× Target, Umlenker, direction, car2). `self_hunt_flexible/world.json` still contains the old stage code; it updates through the Builder's library upgrade when opened. Only export it if Manuel asks (rule `.cursor/rules/agent-mcp-example-world-sync.mdc`).
6. Optional: the profiler is only available headless and through `window.__rennProfiler`. A small timing view in the Watch panel would make it usable for Manuel.

## How to work

```bash
npm run sync:global-pipeline
caffeinate -dims env AVLAB_WORLD=self_hunt_flexible AVLAB_FOCUS=entity_1779823253285_brtkx1p AVLAB_SEEDS=2,6,7,1,3,5 AVLAB_FRAMES=3600 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
caffeinate -dims env AVLAB_SCENE=test-results/avlab/<file>.scene.json AVLAB_REWIND=4 AVLAB_RESTORE=1 npx vitest run src/test/scenarios/av-lab.diagnostic.test.ts
```

Probe pattern (throw-away `src/test/scenarios/tmp-probe.test.ts`, delete before committing): `replayScene(scene, { rewindSec, restoreState: true, onFrame: ({ frame, sim }) => { const st = liveStageState(sim, world, scene.focus, 'route'); … watchValues(scene.focus) … } })`. Print route state (`active idx replans segs route`) or longitudinal state (`G D uPrev boost`) per frame.

Per seed the lab prints path, realtime factor, roughness/spikes, class frames, events, scene files, final watch values, focus stage timing and slow calls (>50 ms with frame).

## Traps

- **macOS suspends long runs.** Single ~15–25 min pauses made tests time out (all AV failures in full-suite runs were these) and produced fake 25 s spikes in the profiler. Prefix long commands with `caffeinate -dims` and run them in the background. Check the duration of a failed test: ~900 s means a suspension, not a bug, so rerun it alone. Full suite takes ~44 s on an idle machine and up to ~1100 s when throttled.
- The lab is deterministic only with the lab harness (seeded RNG, simulated `Date.now`). Trace targets never sleep in the runtime, so do not make the focus a trace target when hunting sleep bugs.
- The replay environment is exact through puppets. The focus can still diverge through chaos; read the FIDELITY line.
- The parkour cylinder test (`av-stack.integration.test.ts`, "seg4_cylinder") is very sensitive to perception and planner changes.
- The other cars produce many `target.pose undefined` warnings headless; the lab mutes `console.warn`.
