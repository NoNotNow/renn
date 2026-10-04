# Handoff: AV car in self_hunt_flexible — evening 2026-10-04

Branch `claude/magical-dirac-um54mz` @ `7cb1ec2` = live on gh-pages (build `7cb1ec2`, av `136evba`).
Full suite green there. Manuel (2026-10-04): deploy regularly in between, not only at the end (after every green, pushed step). Standing rules from `handoff-av-lab-20261004.md` still apply (suite → commit → push → deploy; `npm run sync:global-pipeline` after av-stack edits; Manuel answers in German).

## Test flow (use this, not seed aggregates)
- Deterministic scripted scenarios with puppet chasers: `src/test/scenarios/av-evasion-scenarios.test.ts` (11 evasion + 7 maze incl. `pocket-escape`), all pass. `KNOWN_FAILING` → `it.fails`.
- Parametric sweep `av-evasion-sweep.{0-3}.test.ts` (`AV_SWEEP=full`, oracle margins in `avEvasionSweepMargins.ts`): 60/75 winnable, 58/64 robust. Do not change oracle/criteria.
- Seed lab (`av-lab.diagnostic.test.ts`) only as smoke check. Code-version hashes in lab + Builder header; guard test keeps `self_hunt_flexible/world.json` in sync with the library.
- Docs: `agent-context/feature-av-lab.md`, `agent-context/feature-av-stack.md`.

## WIP branches: merged (2026-10-04 late, branch `ccr-1d0e55ac-g1g4s5`, live build `2ce7879`)
- wip-weave -> `921794c`: carrot string-pulling + pure-pursuit refinement. Open road +-14 m weave / 1.35 steering reversals/s -> 0.00. Red check documented in feature-av-stack.md ("Straight-road weaving").
- wip-pipe -> `2ce7879`: presets (opt-in, `av.preset` merged under each stage's own params), self-calibrating launch (`selfCalibrate`, via presets), style 'escape', vehicle-reuse suite (20 cases pass). The route-planner experiments (`headingHeuristic`, `mazeLatch`, `runTotal`, `mazeManeuverSpeed`) each regressed existing scenarios and are opt-in; `turnaround-open` / `turnaround-corridor` are KNOWN_FAILING (prio 3 is therefore still open).
- Sweep on the Linux runner: 61/75 winnable, robust 59/64. `pair/v25/low/b-30+30/near` fails here on the old stand too (macOS-recorded baseline).
- The `-wip-*` branches can be deleted.

## Open user requests (priority order)
1. ~~Economy mode / CPU budget~~ done (see feature-av-stack.md "CPU budget / economy mode"): `budget: 'full' | 'normal' | 'eco'`, goal fixation, narrow cone, fewer route refreshes; 6 cars: eco ~0.35-0.4 x CPU of full, same goals reached. Pink marks of moving bodies follow them (not for threatIds: hurts evasion). Not yet set in any example world (opt-in per binding).
2. ~~Weaving on straight roads~~ done (921794c).
3. Manoeuvres/reverse too slow (style 'escape' exists, opt-in via preset); turn instead of long reversing still open (heading-aware search that does not break alley reversing).
4. ~~Reusable pipe~~ done (2ce7879): presets, self-calibration, doc section "Using the AV autopilot in your game", reuse tests.
5. Remaining: seed-5 pocket with moving neighbours; 6 robust multi-chaser sweep cases (needs early gap commitment); route planner p95 7.4 ms since the field heuristic.

## World notes
self_hunt_flexible: score/tint/beacon removed; 82 low (1.5 m) maze walls (3 mazes, U-traps, chicane, funnel); duplicate chaser pipelines removed; 4 chasers hunt directly. Chasers zigzag because they treat their target as an obstacle — the chasers' behaviour, not ours to change. Wake lock active on Play page and Builder.
