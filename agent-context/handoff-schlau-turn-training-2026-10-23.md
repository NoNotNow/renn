# Handoff: schlau turn training — dead-end rotation tasks + deeper net

Date: 2026-10-23. Status: **not started** — start this when the current schlau / Beacon work is finished.
Owner context for a fresh agent: read `start-here.md` first, then `feature-policy-evolution.md` +
`handoff-policy-evolution.md` for the policy-evolution state, and `plan-beacon-roadmap.md` (the Beacon
roadmap car this training feeds into).

## Goal

The schlau car must learn to ROTATE in tight space: a task family where the car starts pointing at a wall
with the goal BEHIND it (wall between nose and goal, close range). The car cannot arc forward around it — it
has to turn on the spot via a multi-point maneuver (reverse-left, forward-right, …), exactly the shunt turn a
maze dead-end demands. This is the missing motor skill for efficient maze navigation: the Beacon planner
(`plan-beacon-roadmap.md`) will feed in-sight beacons, but in a dead end the furthest in-sight beacon lies
BEHIND the car and the head must rotate instead of freezing.

## Task 1 — new training kind `goal_turn` (proposed name)

Extend `src/policyEvolution/schlauCourses.ts` (`SCHLAU_KINDS`) with a fourth kind. Design constraints to keep
(it inherits the existing rejection-sampling discipline):

- Same fenced arena as `goal_box` / `goal_wall` (4 walls, 2 m thick, inner faces at +/-60 m).
- Start: car nose pointing AT a dedicated wall — start 8–20 m in front of it, yaw roughly perpendicular to it
  (seeded jitter, e.g. +/-20 deg). Rejection-check the start hull (car hull 4 x 8 m) against every box.
- Goal: BEHIND that wall, 2–10 m past its far face, roughly on the nose ray (the direct start -> goal line
  crosses the wall near its middle). The wall: long enough that no forward arc around its end is shorter than
  the multi-point turn (e.g. 30–50 m) — otherwise the task degenerates into `goal_wall`.
- Side clearance: the space around the car must permit a 2–3 shunt rotation (keep >= ~12 m of free width
  across the nose sector) but NOT a clean forward U-turn (the arena or extra boxes should make the forward
  radius unavailable). Extra corridor boxes join via the existing rejection loop.
- Reachability: same 1 m-grid BFS with 2.5 m inflation must still confirm the goal is reachable.
- The score needs no change: `schlauScore.ts` credits reduction of shortest DRIVABLE nose->goal distance, so
  the rotation is scored the moment the nose swings and the drivable route opens up.
- Sync the training-set plumbing: `trainingSets.ts` / `MazeTrainingDialog.tsx` count worlds per set; the
  schlau episode builder (`schlauEpisode.ts`, `schlauMaze.ts` patterns) must emit `goal_turn` worlds.

## Task 2 — deeper net: add hidden layers to the schlau genome

Today the schlau head is a single-hidden-layer MLP (`policy.ts`: `len = hidden*nIn + hidden + N_OUT*hidden +
N_OUT`; schlau: `len = 29H + 2`, `N_IN_SCHLAU = 26`, see `schlauPolicy.ts`). A shunt turn is a sequenced,
state-dependent maneuver — one hidden layer may not express it; add depth (e.g. 2–3 hidden layers). Notes:

- **Shape collision is live and documented**: `N_IN_SCHLAU = 26 = N_IN_V3`, and `genomeShape` /
  `widenHidden` / `freezeOldMask` in `policy.ts` resolve a 26-input genome as v3. A deep variant needs its own
  length formula + tag (pattern: how v2 -> v3 was versioned), and `hiddenOfSchlau` /
  `buildSchlauMazeWorld`'s shape guard must reject both v3 and old-schlau genomes.
- Touch points: `policy.ts` (genome length/shape helpers or a `policyDeep.ts`), `schlauPolicy.ts`
  (`SCHLAU_STAGE_HEAD` uses the shared `STAGE_HIDDEN` + `STAGE_NET` strings — the stage JS forward pass must
  gain the extra layers), `schlauForward`, the ES mutation/`widenHidden` path in `schlauTraining.ts` /
  `schlauCandidates.ts` (candidates file: old `schlau-candidates.json` entries become invalid — version the
  file or the header, never silently load old genomes), and `trainingSets.ts` (candidate swap path).
- Train-from-scratch expected: a deeper genome is a NEW policy. Keep the current 1-layer head as the fallback
  until the deep one beats it on the existing `goal_box` / `goal_wall` bests (paired comparison, bootstrap CI
  over reached / time / contacts, as in prior A/B runs).
- Interpolation/`widenHidden` for layer addition: initialize the new layer near-identity so a trained 1-layer
  genome can warm-start the deep one (optional; decide at implementation).

## Suggested order

1. `goal_turn` kind + worlds + reachability tests (works with the CURRENT net — see what it can already do;
   the wall-hugging runs may have taught some reversal).
2. Deep genome (schlau v2) + shape guards + stage forward pass.
3. Train deep on `goal_open` + `goal_box` + `goal_wall` + `goal_turn` curriculum; compare against the current
   bests; only then re-run on the Beacon worlds once `plan-beacon-roadmap.md` phase 3 lands.

## Suggested skills (repo skills are SKILL.md files on disk — read them before use)

- `.agents/skills/tdd/SKILL.md` — the `goal_turn` rejection sampler and the genome-shape guards are
  test-first material.
- `.agents/skills/implement/SKILL.md` — for the deep-net stage code change.
- `.claude/skills/improve-car/SKILL.md` — the project skill for car-behaviour work; read for the
  standing car-training conventions.

## Standing rules that apply

- Headless-first with world reload before every run (`.cursor/rules/agent-headless-defined-start.mdc`);
  long training runs under `caffeinate -is`, status at `test-results/<topic>/STATUS.md`; commit/push/deploy
  after every finished step; stage selectively.
- Example worlds touched by MCP must sync to `public/exampleWorlds/`.
