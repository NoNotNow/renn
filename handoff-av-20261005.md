# Handoff: AV car + test environment — 2026-10-05 (orchestrated long run)

Branch `ccr-4c762c23-y7noe2` (pushed). Builds on `handoff-av-20261004-evening.md` (same standing rules: answer Manuel in German, sync after av-stack edits, never loosen criteria/oracle/baseline).

**Deployed** after green merge batches on Manuel's request (latest: build c4a7070, gh-pages 66ef6f3). Deploy after every green batch and tell Manuel what to expect in `self_hunt_flexible`.

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
| da830f1, de89d90 | Eco: time-based threat gate; eco saves 45 % work in the hunt world (manoeuvre frames + field rebuilds were the real cost) |
| f0cfdea, 29ecb1b | gapCommit: early escape-heading commitment against >= 2 pursuers; sweep 61/75 -> 66/75, robust 59/64 -> 63/64 |
| 0fbf33f | hullClear: ghost marks behind the bumper caused the seed-5 stall; case pocket-ghost |
| 2321ee0 | gapWalls (opt-in): escape goal must have a free run on the static map (seed-6 maze B) |
| 75280cf | `npm run av:health`: deterministic 8-seed aggregate gate (`--save`, `--compare`) |
| c790ebe | Flaky agent test: atomic world.json write |
| c4a7070 | fleeAimLos: direct flee aim only on a clear static line, else route carrot (Manuel: car heads at obstacles); head-on frames 9/0/111 -> 0/8/5 |
| 610617d | routeClearance v2 (opt-in): wide berth on forward cruise routes (open field gap 2.1 -> 3.6 m, path +1.7 %); default on breaks maze-dead-end |

Full suite: 2404 passed, 13 skipped. Merge gate: `npm run av:quick`, full sweep (~2 min), `npm run av:health -- --compare <name>`, full suite (`--maxWorkers=2` if a sim runs in parallel), then deploy.

## How this run was orchestrated (reuse it)
- Lead model plans, reviews diffs, runs the full suite, commits; cheaper workers (Sonnet/Haiku) do audits and edits in git worktrees.
- Worker prompt checklist: reset worktree to the branch first (worktrees start on old `main`), symlink node_modules, sync before testing, strip ANSI, never change criteria/limits/oracle (keep KNOWN_FAILING and report instead), commit early in the worktree (crash-safe), report <= 15 lines.
- One worker per av-stack transformer file at a time; queue conflicting items.
- Max 2 simulation-heavy processes on 4 cores; never the full suite in parallel with a sim worker (the container was OOM-killed once).
- Behaviour-identity proof for perf work: diff the sorted PASS/FAIL report rows of `npm run av:quick` before/after.
- Test pruning: runtime-driven (slowest files first), read-only audit worker -> lead filters to lossless items -> apply worker that verifies each claim before editing.
- Measure first (histogram/probe) before building from a hypothesis; give workers both sides of a trade-off as acceptance; cap tuning at 3 variants.
- Generated-file conflicts on cherry-pick: take ours, re-run `npm run sync:global-pipeline`, continue; discard pure `syncedAt` drift.

## Open
1. routeClearance default on (Manuel wants wide berths): blocked by maze-dead-end (2 shuttle episodes > 1); check av:health with it on.
2. Seed 6 maze-B pocket (gapWalls fixes it but costs catches elsewhere; lab is chaotic -> judge with av:health only).
3. Sweep baseline does not yet list the 5 newly passing cases (ask Manuel before re-recording).
4. Question to Manuel: example world with many eco cars? Keep legacy pipe3 parkour coverage (spawn matrix) or drop it?
5. Profiler view in the Watch panel.
