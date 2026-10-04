# Handoff: AV car in self_hunt_flexible — evening 2026-10-04

Branch `claude/magical-dirac-um54mz` @ `7cb1ec2` = live on gh-pages (build `7cb1ec2`, av `136evba`).
Full suite green there. Standing rules from `handoff-av-lab-20261004.md` still apply (suite → commit → push → deploy; `npm run sync:global-pipeline` after av-stack edits; Manuel answers in German).

## Test flow (use this, not seed aggregates)
- Deterministic scripted scenarios with puppet chasers: `src/test/scenarios/av-evasion-scenarios.test.ts` (11 evasion + 7 maze incl. `pocket-escape`), all pass. `KNOWN_FAILING` → `it.fails`.
- Parametric sweep `av-evasion-sweep.{0-3}.test.ts` (`AV_SWEEP=full`, oracle margins in `avEvasionSweepMargins.ts`): 60/75 winnable, 58/64 robust. Do not change oracle/criteria.
- Seed lab (`av-lab.diagnostic.test.ts`) only as smoke check. Code-version hashes in lab + Builder header; guard test keeps `self_hunt_flexible/world.json` in sync with the library.
- Docs: `agent-context/feature-av-lab.md`, `agent-context/feature-av-stack.md`.

## Parked unverified work (rate limit hit mid-task)
- `claude/magical-dirac-um54mz-wip-pipe` (f024391): "escape" driving style (drop fixed manoeuvre/reverse speed caps, physics-based limit, footprint-exact fit), turn-around instead of long reversing, presets/self-calibration for a reusable `global_av_autopilot`. Not tested.
- `claude/magical-dirac-um54mz-wip-weave` (fbf328f): straight-road weaving metrics + lateral fix (`av-control-lateral.js`). Not tested.
Review, finish against scenarios, then merge.

## Open user requests (priority order)
1. **Economy mode / CPU budget (new, configurable)** — Manuel wants many cars per world, so:
   - Goal in line of sight and path free → look only toward the goal (narrow cone), drive straight at it, fixate on it (no re-aiming every frame; this is also the main cause of weaving).
   - Path blocked → a higher layer sets **waypoints** (route planner on the static map / distance field); the car only focuses on the next waypoint.
   - Moving objects nearby → observe them, update them often. **Bug:** pink obstacle marks of moving objects stay behind instead of moving with them; dynamic marks must be short-lived (frequent refresh, quick expiry), static ones persistent.
   - All configurable (e.g. `budget: 'eco' | 'normal' | 'full'`), with CPU per car measured by the lab profiler; add a many-cars perf test.
2. Weaving on straight roads (see wip-weave; relates to 1).
3. Manoeuvres/reverse too slow; turn instead of long reversing (see wip-pipe).
4. Reusable pipe: safe defaults, presets (`car`, `chaser-evasion`, `maze`), self-calibration, short "use in your game" doc, tests with other vehicles (heavy cube, icy car, small car, truck).
5. Remaining: seed-5 pocket with moving neighbours; 6 robust multi-chaser sweep cases (needs early gap commitment); route planner p95 7.4 ms since the field heuristic.

## World notes
self_hunt_flexible: score/tint/beacon removed; 82 low (1.5 m) maze walls (3 mazes, U-traps, chicane, funnel); duplicate chaser pipelines removed; 4 chasers hunt directly. Chasers zigzag because they treat their target as an obstacle — the chasers' behaviour, not ours to change. Wake lock active on Play page and Builder.
