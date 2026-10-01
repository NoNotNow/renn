# Self-driving car — improvement log (headless-first)

Living log for **obstacle go-around** on `selfDrivingCarWorld` / **`self_drive_cube`**. Agents append rows after each diagnostic or test batch. Human browser checks use disk-exported example world (see `.cursor/rules/agent-headless-defined-start.mdc`).

**Goal:** Car reaches wanderer goal **around** obstacles (not stuck scraping front face), from varied spawn pose and obstacle shape.

**Canonical commands:**

```bash
npx tsx tools/renn-mcp/sim-car-diagnostic.ts --variant cubeGoalBehind --frames 240
npx vitest run src/test/scenarios/self-driving-car.integration.test.ts
npx tsx tools/renn-mcp/export-self-drive-example-world.ts
rg 'RENNDIAG:' agent-context/recordings/car-diagnostic-events.log
```

---

## Baseline @ 2026-09-23 (L1 orchestrate kickoff)

| Metric | Value |
|--------|--------|
| Vitest | 254 files pass, **1 fail** (2090 pass / 2093 total) |
| tsc | clean |
| Known fail | `self-driving-car.integration.test.ts` cube goal-behind — car stalls ~z=-2.3, `uml.maneuver` drops to 0 |
| Root cause (partial) | Umlenker `pathClear` to final goal rejected lateral candidates; direction backoff fought maneuver; AutoBrake during `_uml_maneuver` |

## Session entries

| When | Run | Result | Notes |
|------|-----|--------|--------|
| 2026-09-25 | seg4 tight stall record + perturb grid | partial | **Recorded:** `agent-context/recordings/seg4-cylinder-tight-stall.json` — end **z≈−36.43**, **maxAbsX≈0**, frame **81** `dir.frontDist=0` vs `uml.frontDist≈2.15`, `uml.maneuver=1`, `dir.backoff=1`. Diagnostic: `--segment seg4_cylinder --cylinder-start tight`. **Patch WIP:** uml tight `_uml_blocked` pulse + direction `tightDegenerateHug` (still fails segment). **`it.fails` tight unchanged.** |
| 2026-09-25 | L2 wedge escape (direction-v3) | partial | **Root:** direction backoff cleared on **probe miss @ +2.5 m** while bumper **dist=0**; `tightDegenerateHug` blocked without `_uml_goal_block`. **Fix:** `wedgeEscape` state + `needDegenerateCylinder` + aim lateral hold. Diagnostic tight: **maxAbsX≈2.78** but **z≈−32** (+Z runaway) — segment still fail. Handoff: `handoff-cylinder-orchestrate-20260925-L2-end.md`. |
| 2026-09-24 | L2 retry tight diagnosis | partial | **Root:** `_uml_maneuver` + goal-block ~2 m, direction **no backoff**; lateral aim → **Δz≈0**. Naïve contact backoff → **550f reverse lock**. Handoff: `handoff-cylinder-orchestrate-20260924-L2-retry.md`. Next: rate-limited backoff + forward-biased close flank. |
| 2026-09-24 | seg4_cylinder + `self_drive_cylinder` | partial | **Infra:** `SELF_DRIVE_PARKOUR_SEGMENTS.seg4_cylinder`, `missionWaypointStartIndex`, cold @ z=−31 **pass** 550f; **`it.fails` tight z=−36** repro (`dir.frontDist=0`, `RENNDIAG:STUCK`); diagnostic `--segment seg4_cylinder`. Patches unchanged vs flank fix. |
| 2026-09-24 | umlenker flank + hunt_repair2 Play | cylinder fix | **Root:** goal-blocked `flankFallback` picked far **same-depth** lateral points (yellow line through curved hull). Reject when `closestObstacle < 4`, `ahead < 2.5`, and `\|Δx\| > 6`. Vitest spawn matrix + parkour green; sync `sync-hunt-car-patches.mjs`. |
| 2026-09-23 | diagnostic 180f cubeGoalBehind | STUCK z≈-2.24, pass=false | `goalBlock=1`, maneuver then 0 |
| 2026-09-23 | L2 orchestrate spawned | pending | Scope: go-around, path trace, multi-spawn, multi-shape |
| 2026-09-23 | patches + spawn z=3 + v3x fix | pass | Root: Vec3 `.x` filters dead; 15f warmup wedged car at cube face; flank-first when goalBlocked |
| 2026-09-23 | vitest spawn matrix 8×175f | pass | box/sphere/pyramid/cylinder + yaw/offset spawns; `selfDriveGoAroundPass` |
| 2026-09-23 | sim-car-diagnostic ×3 runs 175f | pass | endZ≈-14.4 endX≈21; path `car-diagnostic-path.json` |
| 2026-09-23 | diagnostic 400f×3 (pre-fix) | fail | **Root:** 40×40 ground; flank to x≈39 → minY≈-471; go-around logic OK |
| 2026-09-23 | ground 100×80 + long-run pass | pass | `SELF_DRIVE_GROUND`; `selfDriveLongRunPass` + `maxAbsX`; export `self_drive_cube` |
| 2026-09-23 | batch 400/600/900 ×3 runs | pass | minY≈0.49; 400f goalDist≈1.5; CSV `car-diagnostic-batch-summary.csv` |
| 2026-09-23 | vitest longrun 400+600f | pass | `self-driving-car-longrun.integration.test.ts` |
| 2026-09-23 | parkour fixture v1 | pass | `buildSelfDrivingParkourWorld()` — 4 waypoints (`tf_mission` / `targetPoseInput`), obstacles box M + sphere S + cylinder L; ground 100×110 |
| 2026-09-23 | vitest parkour 1400f | pass | `self-driving-car-parkour.integration.test.ts`; frame budget **1400f** (~23s sim) for full course |
| 2026-09-23 | diagnostic `--variant parkour` 1400f | pass | endZ≈−65.5; export `self_drive_parkour` |
| 2026-09-23 | round obstacles (sphere/cylinder) | pass | Umlenker: keep `goalBlocked` when front ray closer; `sideScrape` → flank from bumper; looser `pathClear` at curved hull; no backward aim; direction clears backoff during `_uml_maneuver`. Parkour 1400f + cube 175f green; re-export `self_drive_parkour` / `self_drive_cube`. |
| 2026-09-23 | Chunk E spawn matrix | pass | `SELF_DRIVE_PARKOUR_SPAWN_IDS` × seg1 **520f** + beside **920f** (4 spawns; yawRight beside LEFTOVER) |
| 2026-09-23 | Beside gate (`parkourBeside`) | pass | cone + capsule; lateral mission wp; `selfDriveParkourBesideGatePass`; diagnostic `--variant parkourBeside --frames 920` |
| 2026-09-23 | diagnostic `--parkour-spawn-matrix` | pass | `agent-context/recordings/car-diagnostic-parkour-spawn-matrix.json` |
| 2026-09-23 | cube spawn matrix **195f** | pass | yaw spawns borderline @ 175f with `tf_target_line` in pipe3 |
| 2026-09-23 | L1 accept Chunk E | pass | Vitest parkour + spawn-matrix (26 tests); `world-schema.json` + `debugTargetLineEntityId`; re-export `self_drive_parkour` / `self_drive_cube`; Pipe3 sync. Handoff: `$TMPDIR/handoff-self-driving-parkour-20260923-2338.md`. |
| 2026-09-23 | spawn resilience pass | partial | Umlenker: keep `goalBlocked` when front ray wins; direction skips backoff during `_uml_maneuver`. Diagnostic `--parkour-full-spawn-matrix` + `RENNDIAG:STUCK` in events log. **Green full 1400f (CI):** center. **Seg1 all spawns green.** **LEFTOVER full course:** left1, right1, yawLeft, yawRight (sphere leg ~z−29; grep STUCK). |

---

## Handoff workflow (notes)

- **Works:** L2 wrote `/tmp/handoff-self-driving-go-around-l2.md` with baseline, LEFTOVER, RISK; L1 re-ran vitest/diagnostic before trusting claims.
- **Gap:** L2 marked **green** at 175f while user scope is open-ended — L1 must **chain fresh L2 from LEFTOVER**, not treat STATUS done as “all tasks finished.”
- **Next handoffs:** `$TMPDIR/handoff-self-driving-longrun-*.md` for long-run tranche.
- **Parkour perpetual AFK:** `/var/folders/cg/87j3kd8s3dqctsflnp71st2w0000gn/T/handoff-self-driving-parkour-perpetual-orchestrate-20260923.md`
- **Chunk E (spawn matrix + beside):** `$TMPDIR/handoff-self-driving-parkour-20260923-2338.md` — LEFTOVER: yawRight beside, full course non-center spawns, seg3 matrix row, narrow gap.

---

## Acceptance (target)

1. **Cube:** After bounded sim time, `car` z past cube (e.g. `< cubeCenter.z - 4`) and `\|x\| > margin` (flank), distance to goal decreases.
2. **Path:** Diagnostic records full polyline (jsonl or dedicated path file) inspectable without browser.
3. **Robustness:** Matrix of spawn offsets/yaws within documented margins — majority pass.
4. **Shapes:** At least box, sphere, pyramid (and one other primitive) as static obstacles with same goal-behind layout.

## 2026-10-01 — Headless clock finding (cylinder tight)

- **Wall-clock coupling:** `umlenker`/`direction` hold maneuver lock, backoff and hug pulses with `Date.now()`. `WorldSimulator` does not advance it, so a 550-frame headless run (<1 s wall) can sit inside a single 920 ms hold. Results depend on machine speed (likely cause of the beside-gate flake and of tight differing between machines).
- **Experiment:** virtual clock in `WorldSimulator` (`Date.now()` += dt per frame). Tight z=−36 then clears the cylinder (endZ≈−44.9, `it.fails` flips) but 6 parkour spawn-matrix cases fail (`seg1_box` ×5, beside `left1`); they pass on wall clock.
- **Why they break:** in both modes the car **orbits** the waypoint (~8 m radius, 9 m/s) and never settles; `selfDriveParkourSegmentPass` samples the endpoint at a fixed frame, so passing is orbit-phase luck (e.g. seg1 center wall-clock ends z=−11.3, clock ends z=−0.1; seg1 left1 wall-clock runs away to x≈20). The clock only shifts the phase.
- **Decision:** do not adopt the clock yet. Next: (1) fix waypoint-arrival behavior (brake/settle instead of orbiting); (2) make segment passes robust (e.g. min waypoint distance / depth reached during the run, not final position); (3) then add the clock and promote the tight `it.fails`.
