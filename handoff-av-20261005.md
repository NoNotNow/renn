# Handoff: AV car + test environment — 2026-10-05 (orchestrated long run)

Branch `ccr-4c762c23-y7noe2` (pushed). Builds on `handoff-av-20261004-evening.md` (same standing rules: answer Manuel in German, sync after av-stack edits, never loosen criteria/oracle/baseline).

**Not deployed:** `npm run deploy` was blocked by the session's permission classifier (production deploy). Manuel has to deploy (or allow it).

## Done this session
| Commit | What |
| --- | --- |
| 0e3c6cb, e4f533f, 6e0e68c | Tests pruned / shrunk without weakening: subsumed UI + legacy spawn-matrix cases removed, early breaks on monotone assertions, shorter tails, hunt-game 1800 -> 600 frames, Builder integration tests merged, `userEvent` without delay |
| 72909a8 | Route planner goal-distance field: Dial bucket queue (same values), p95 4.4 -> 1.8 ms |
| 3d9b6d9 | `npm run av:quick` (sync + evasion + maze), `npm run av:pre` (all AV + hunt-game) |
| 17c6698 | `av-stack-param-layers` guard (preset never overrides binding/scope/stage params; red-checked) + `av-probe.diagnostic` (AV_PROBE_CASE/KEYS/EVERY/FROM/TO) |
| ed3f79b, 438c51b | Turn around instead of long reversing (`turnAround`, `turnCommit`): turnaround-open and turnaround-corridor pass, KNOWN_FAILING empty (removal approved by Manuel) |
| 7f28fc7 | Perception / motion planner / raycast API perf, bit-identical (scenario report rows byte-identical); evasion file 49 -> 34 s |
| 03d2c0d | Sweep baseline re-recorded on Linux (approved by Manuel): 61/75 winnable, robust 59/64, deterministic |
| 0f9e4e4 | Fleet test: deterministic work counter `av.work` instead of wall-clock (eco/full 0.433, threshold 0.6) |

Full suite: 2399 passed, 11 skipped, ~250 s on 4 cores.

## How this run was orchestrated (reuse it)
- Lead model plans, reviews diffs, runs the full suite, commits; cheaper workers (Sonnet/Haiku) do audits and edits in git worktrees.
- Worker prompt checklist: reset worktree to the branch first (worktrees start on old `main`), symlink node_modules, sync before testing, strip ANSI, never change criteria/limits/oracle (keep KNOWN_FAILING and report instead), commit early in the worktree (crash-safe), report <= 15 lines.
- One worker per av-stack transformer file at a time; queue conflicting items.
- Max 2 simulation-heavy processes on 4 cores; never the full suite in parallel with a sim worker (the container was OOM-killed once).
- Behaviour-identity proof for perf work: diff the sorted PASS/FAIL report rows of `npm run av:quick` before/after.
- Test pruning: runtime-driven (slowest files first), read-only audit worker -> lead filters to lossless items -> apply worker that verifies each claim before editing.
- Generated-file conflicts on cherry-pick: take ours, re-run `npm run sync:global-pipeline`, continue; discard pure `syncedAt` drift.

## Open
1. Time-based eco threat gate (`fixThreatTime`, av-motion-planner) — in progress at time of writing; see git log.
2. Seed-5 pocket with moving neighbours; 6 robust multi-chaser sweep cases (early gap commitment).
3. Question to Manuel: example world with many eco cars? Keep legacy pipe3 parkour coverage (spawn matrix) or drop it?
4. Profiler view in the Watch panel.
