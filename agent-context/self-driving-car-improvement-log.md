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
| 2026-09-23 | diagnostic 180f cubeGoalBehind | STUCK z≈-2.24, pass=false | `goalBlock=1`, maneuver then 0 |
| 2026-09-23 | L2 orchestrate spawned | pending | Scope: go-around, path trace, multi-spawn, multi-shape |
| 2026-09-23 | patches + spawn z=3 + v3x fix | pass | Root: Vec3 `.x` filters dead; 15f warmup wedged car at cube face; flank-first when goalBlocked |
| 2026-09-23 | vitest spawn matrix 8×175f | pass | box/sphere/pyramid/cylinder + yaw/offset spawns; `selfDriveGoAroundPass` |
| 2026-09-23 | sim-car-diagnostic ×3 runs 175f | pass | endZ≈-14.4 endX≈21; path `car-diagnostic-path.json` |

---

## Acceptance (target)

1. **Cube:** After bounded sim time, `car` z past cube (e.g. `< cubeCenter.z - 4`) and `\|x\| > margin` (flank), distance to goal decreases.
2. **Path:** Diagnostic records full polyline (jsonl or dedicated path file) inspectable without browser.
3. **Robustness:** Matrix of spawn offsets/yaws within documented margins — majority pass.
4. **Shapes:** At least box, sphere, pyramid (and one other primitive) as static obstacles with same goal-behind layout.
