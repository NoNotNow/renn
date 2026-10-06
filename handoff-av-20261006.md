# Handoff: AV car, Builder links, param UIs — 2026-10-06

Branch `claude/determined-dirac-p1rj3g` (pushed, = live: build c3c4bfc, gh-pages 0e7cf10). Builds on `handoff-av-20261005.md` (same standing rules: answer Manuel in German, `npm run sync:global-pipeline` after av-stack edits, never loosen criteria/oracle/baseline, full suite before every deploy; deploy needs Manuel's OK in this environment).

Full suite at c3c4bfc: 2558 passed, 17 skipped.

## Done this session
| Commit(s) | What |
| --- | --- |
| b4c1483 | Example-world links carry `&entity=<id>` and `&tool=<gizmo mode>` (e.g. `visualize`); URL follows selection/tool live, restores both on load; opening another project drops the params (`src/utils/exampleWorldUrlParam.ts`, `Builder.exampleUrl.integration.test.tsx`) |
| 7cecc92, 92d604d | Goal overlay (lime beacon/ring + car→goal line, orange eco carrot, route chain, flee goal; `goalViz`), score (+1 per goal reached, `goalReachDist`) and damage (+1 per chaser approach, `damageDist`/`damageClear`) via new `api.setScore` / `api.setDamage` (`hud: true`) |
| 83481f4..d310f97, c3c4bfc | Typed param forms everywhere: `src/types/paramSchema.ts`, `src/params/*`, `src/components/params/*`; pipe drawer, stage Configure drawer (Params / JSON tabs), TransformerEditor, global panel; schemas from preset registry, `/* @params [...] */` in stage code (all av-stack + self-driving stages declare theirs; lint test keys read == declared), inference fallback |
| 02ce6bc..f22f4f3 | `passSide` keep-right rule (av-perception `av.oncoming`, motion-planner cost, lateral control skips pure pursuit on pass); on for all 11 AV-pipe cars in self_hunt_flexible; chasers `passIgnoreIds` = their target; av:health delta shown to be within the world's noise floor |
| 998f1f0..1f60860 | S-curves: `carrotBend` 0.65 / `carrotLive` (route planner, opt-in, focus car only); cases `s-chicane`, `s-bend-14`, `s-bend-14-short` |
| b57afd4, c19d9d6 | Visible U pockets: `pocketBrake` keeps the route bend limit while chased when the heading fan ends in a seen dead end; case `u-mouth-enter` (25.9 m → 0) |

Details and numbers: `agent-context/feature-av-stack.md` (sections "Keep right when passing", "S-curves in the labyrinth", "Visible U pockets"), `agent-context/feature-transformers.md` ("Param forms"), `agent-context/example-worlds.md`.

## Open
0. **Goals / intermediate goals (Manuel, high priority; the "random" ones were the RED flee goals):** f058d86 + adf6283: overlay really draws carrot/route (was never drawn), flee goal shown as escape pillar with dimmed goal; goal jump drops the old route; goal give-up channel `input.goalFeedback` (wanderer / av-wander re-pick, goalBad frames 2120 -> 545); intercept-based flee trigger (`escapeTriggerHorizon` 3.5) and a working `fleeRelease`: flee share 58% -> 45%, flee goal behind walls 740 -> 247 frames, flips >90 deg 6 -> 3. Open: remaining flee share is mostly gapCommit treating 30-50 m/s chasers at 40-80 m as intercepting (needs an empirical chaser model); `carrotTrack` (carrot from the current route every frame: away frames 2662 -> 152) breaks corner-trap / gap-entry-wall10 / s-bend-14, stays opt-in. Keep on the list until Manuel confirms in the world.
0b. **Maze module (Manuel, 2026-10-06, requirement):** in the labyrinth the flee points must be REACHABLE and chosen CLOSER, so that the car can navigate OUT of the maze. There must be a drivable route between the car and the nearest exit; that route may be blocked by cars, and the path of least resistance is to be chosen. Wanted: a switchable **maze module** that activates when the car is in a confined space (narrow corridors / labyrinth) and then replaces the open-ground flee logic. Sketch for the next agent:
   - Detect "confined" from the persistent static map (e.g. free width around the car / share of blocked directions within ~15-20 m, hysteresis), param-gated (`mazeModule: true|false`, thresholds), visible as watch value + overlay state.
   - Exits: frontier / boundary cells of the enclosed region in the static map + goal-distance field (cells from which open ground is reachable), recomputed when the map changes; pick the nearest reachable exit by field distance, not straight line.
   - Escape route = field route to that exit; costs for cells occupied / approached by cars (chasers, parked cars) so a blocked corridor is avoided when an alternative exists ("Weg des geringsten Widerstands"): cost = path length + penalty for predicted car occupancy along the way, re-evaluated with hysteresis.
   - Flee points inside the maze = waypoints on that escape route (near, reachable), never ring candidates behind walls.
   - Deterministic cases: car in a maze with one / two exits, chaser blocking the near exit -> takes the other, dead-end branch on the way; plus lab smoke in self_hunt_flexible (mazes A-G). Gates as usual (av:quick, eco suites, sweep set, av:health with noise floor).
1. Saver budget (the world's real mode): `maze-dead-end` never reaches the goal (min 46.5 m), `s-bend-14` 2 reversals. Not gated (suites run eco/full).
2. `maze-dead-end` at eco passes with carrotBend 0.65 but sits near a chaotic shuttle-detector threshold.
3. Keep-right: corridor with the oncoming car dead ahead / in the wrong lane still collides (needs a feasibility-aware pass target).
4. carrotBend/carrotLive on chasers breaks hunt-game (pack falls back to 98.8 m): not enabled.
5. Overlay is Builder-only (`visualizeLine` no-op in Play); lines are 7 cm tubes; other stages' lines flicker on non-tick frames with `tickEvery`.
6. ~~Param UI effective values~~ done (2fad0fe): stage drawer shows the effective value with a `from pipe: <layer>` badge, edits go to the supplying layer, member-scope params editable, entity picker for `entityId` / `entityIdList`. Left: AV preset layer not shown; narrow drawer clips the reset arrow next to the badge.
7. Older items from handoff-av-20261005.md (frame budget, maze-b-rev-door goal, gap swing-out) still open.

## Orchestration used
Lead (this session) planned, reviewed diffs, merged by cherry-pick (generated-file conflicts: take ours + `npm run sync:global-pipeline`; doc conflicts: keep both sections), ran the full suite and deployed. Sonnet workers in git worktrees, ≤ 2 sim processes at a time; audit/design phase first for the UI refactor, then implementation. A worker's proposal to mark a previously passing case KNOWN_FAILING was rejected (fix instead).
